// "Decode" shimmer: each character flickers through random Greek + Arabic glyphs
// and settles (left-to-right, staggered) onto the real text within ~`duration` ms.

const SCRAMBLE_CHARS =
  'αβγδεζηθικλμνξοπρστυφχψω' +
  'ΑΒΓΔΘΛΞΠΣΦΨΩ' +
  'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

// Pick a random glyph. When `prev` is given, the result is guaranteed to differ from
// it, so two identical random glyphs never land next to each other.
const rand = (prev) => {
  if (prev == null) return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
  let c;
  do {
    c = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
  } while (c === prev);
  return c;
};

// A fully-scrambled version of `text` (keeps spaces/structure) — used as a
// non-empty placeholder so an element is never blank before the decode runs.
export function scrambleOf(text) {
  let prev = null; // last emitted glyph, so no two random glyphs repeat back-to-back
  return Array.from(text)
    .map((c) => {
      if (c === ' ' || c === '\n' || c === '\t') {
        prev = null;
        return c;
      }
      prev = rand(prev);
      return prev;
    })
    .join('');
}

// A random run of glyphs with occasional spaces, for placeholders when the real
// text length isn't known yet (e.g. a description still loading).
export function randomGlyphs(n) {
  let s = '';
  let prev = null; // last emitted glyph, so adjacent glyphs never repeat
  let gap = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i += 1) {
    if (i > 0 && i % gap === 0) {
      s += ' ';
      prev = null;
      gap = 4 + Math.floor(Math.random() * 5);
    } else {
      prev = rand(prev);
      s += prev;
    }
  }
  return s;
}

// Runs the scramble for `text`, calling onUpdate(str) each frame and onDone() at
// the end. Returns a cancel function (clears the animation frame).
export function runScramble(text, duration, onUpdate, onDone) {
  const chars = Array.from(text);
  const n = chars.length;
  // Each character settles at a staggered time so the text resolves left-to-right;
  // everything is done by `duration`.
  const settle = chars.map((_, i) => {
    const end = duration * 0.3 + (i / Math.max(n - 1, 1)) * duration * 0.7;
    const start = Math.max(0, end - duration * 0.45);
    return { start, end };
  });
  const cur = new Array(n).fill('');
  let startTime = null;
  let raf = 0;

  const tick = (t) => {
    if (startTime == null) startTime = t;
    const elapsed = t - startTime;
    let out = '';
    let done = true;
    let prev = null; // last emitted char, so no two glyphs repeat side by side
    for (let i = 0; i < n; i++) {
      const c = chars[i];
      if (c === ' ' || c === '\n' || c === '\t') {
        out += c;
        prev = null;
        continue;
      }
      const { start, end } = settle[i];
      if (elapsed >= end) {
        out += c; // settled
        prev = c;
      } else {
        // shimmer: swap occasionally so it doesn't strobe, but always re-roll if this
        // glyph would repeat the one just before it (its neighbor may have changed).
        if (!cur[i] || Math.random() < 0.3 || cur[i] === prev) {
          cur[i] = rand(prev);
        }
        out += cur[i];
        prev = cur[i];
        done = false;
      }
    }
    onUpdate(out);
    if (!done && elapsed < duration + 120) {
      raf = requestAnimationFrame(tick);
    } else {
      onUpdate(text); // exact final text
      if (onDone) onDone();
    }
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
