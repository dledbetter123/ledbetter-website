// "Decode" shimmer: each character flickers through random Greek + Arabic glyphs
// and settles (left-to-right, staggered) onto the real text within ~`duration` ms.

const SCRAMBLE_CHARS =
  'αβγδεζηθικλμνξοπρστυφχψω' +
  'ΑΒΓΔΘΛΞΠΣΦΨΩ' +
  'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

const rand = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];

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
    for (let i = 0; i < n; i++) {
      const c = chars[i];
      if (c === ' ' || c === '\n' || c === '\t') {
        out += c;
        continue;
      }
      const { start, end } = settle[i];
      if (elapsed >= end) {
        out += c; // settled
      } else {
        // shimmer: only swap the glyph occasionally so it doesn't strobe
        if (elapsed >= start || true) {
          if (!cur[i] || Math.random() < 0.3) cur[i] = rand();
        }
        out += cur[i];
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
