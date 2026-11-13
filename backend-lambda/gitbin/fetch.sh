#!/usr/bin/env bash
# Fetches the git that run_git (gittool.go) runs on Lambda: bin/git and the two libraries it
# needs beyond glibc (lib/), from Amazon Linux 2023's arm64 packages, the Lambda's own OS.
# Pinned by sha256 (the blobstore path is the file's sha256). The deploy workflow runs this
# and zips bin/ and lib/ beside bootstrap. Needs bsdtar (macOS tar; libarchive-tools on Ubuntu).
set -euo pipefail
cd "$(dirname "$0")"
BLOB=https://cdn.amazonlinux.com/al2023/blobstore
PKGS=(
  bed6cb2150da2a88513fc55177a7b0241ae137176dc0c8dddd1d2d743f4f4d76/git-core-2.50.1-1.amzn2023.0.2.aarch64.rpm
  83ac7c19260d994c73ad49d72f1cf436f6cd01f0e3c783ffbe2fb24281351464/pcre2-10.40-1.amzn2023.0.5.aarch64.rpm
  c398bb91bc5e4923fb23803e15b5072b21e7cfadfacba04594a95a12b9bc41c1/zlib-1.2.11-33.amzn2023.0.6.aarch64.rpm
)
TAR=$(command -v bsdtar || echo tar)
SHA=$(command -v sha256sum || echo "shasum -a 256")
rm -rf out && mkdir -p out/rpm out/root out/bin out/lib
for p in "${PKGS[@]}"; do
  sum=${p%%/*} file=${p#*/}
  curl -fsSL -o "out/rpm/$file" "$BLOB/$p"
  echo "$sum  out/rpm/$file" | $SHA -c - >/dev/null
  (cd out/root && "$TAR" -xf "../rpm/$file")
done
cp out/root/usr/bin/git out/bin/git
cp -L out/root/usr/lib64/libpcre2-8.so.0 out/root/usr/lib64/libz.so.1 out/lib/
chmod 755 out/bin/git
rm -rf out/rpm out/root
echo "gitbin: $(du -sh out | cut -f1) in out/bin and out/lib"
