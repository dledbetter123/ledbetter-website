package main

import (
	"testing"
	"time"
)

// setUnlock seeds the research-flag cache so these tests never reach S3.
func setUnlock(on bool) {
	unlockMu.Lock()
	unlockOn, unlockFetched = on, time.Now()
	unlockMu.Unlock()
}

func TestIsNeverRepoResearchGate(t *testing.T) {
	t.Cleanup(func() { setUnlock(false) })

	// Flag off: the IP-constrained lines are closed, public work is not.
	setUnlock(false)
	for _, repo := range []string{"topology_arch", "tales-of-the-warp", "energy-landscape-probe", "plasticity"} {
		if !isNeverRepo(repo) {
			t.Errorf("flag off: %q should be gated", repo)
		}
	}
	for _, repo := range []string{"SparseGeometricSignalTransport", "LedbetterFinslerTransformer", "trade-companion"} {
		if isNeverRepo(repo) {
			t.Errorf("flag off: %q is public and should be reachable", repo)
		}
	}

	// Flag on: the research lines open, and nothing else does.
	setUnlock(true)
	for _, repo := range []string{"topology_arch", "tales-of-the-warp", "energy-landscape-probe", "plasticity"} {
		if isNeverRepo(repo) {
			t.Errorf("flag on: %q should be reachable", repo)
		}
	}
	for _, repo := range []string{"lib-ds-dsl-dev", "lid-ds-experiments", "thesis-new", "davids-librarian"} {
		if !isNeverRepo(repo) {
			t.Errorf("flag on: %q is thesis/librarian material and must stay gated", repo)
		}
	}
}

func TestSecretPath(t *testing.T) {
	blocked := []string{
		".env", "config/.env", ".env.local", "deploy/prod.env",
		"certs/server.pem", "id_rsa", "keys/app.key", "terraform.tfvars", ".npmrc",
	}
	for _, p := range blocked {
		if !secretPath(p) {
			t.Errorf("%q should be refused as credentials", p)
		}
	}
	allowed := []string{"main.go", "src/environment.ts", "README.md", "docs/keys.md", "notebooks/v5.ipynb"}
	for _, p := range allowed {
		if secretPath(p) {
			t.Errorf("%q is source and should be readable", p)
		}
	}
}
