import { useEffect, useRef, useState } from 'react';
import { runScramble, scrambleOf, randomGlyphs } from '../lib/scramble';

// Visibility-gated scramble/decode effect. Returns [ref, displayText]. The element
// is prefilled with random glyphs so it's never empty before the decode runs (or
// while the text is still loading); the shimmer settles to the real text once the
// element scrolls into view and the text is available.
export default function useScrambleOnVisible(text, duration = 3000, startDelay = 0) {
  const ref = useRef(null);
  const [display, setDisplay] = useState('');
  const [started, setStarted] = useState(false);

  // Random-glyph placeholder until the decode animation takes over.
  useEffect(() => {
    if (started) return;
    setDisplay(text != null ? scrambleOf(text) : randomGlyphs(110));
  }, [text, started]);

  // Start the decode when the element first scrolls into view.
  useEffect(() => {
    if (started) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  // Run the decode once started and the text is available (after an optional delay,
  // so e.g. a card's title can finish before its description begins).
  useEffect(() => {
    if (!started || text == null) return;
    let cancel = null;
    const timer = setTimeout(() => {
      cancel = runScramble(text, duration, setDisplay);
    }, startDelay);
    return () => {
      clearTimeout(timer);
      if (cancel) cancel();
    };
  }, [started, text, duration, startDelay]);

  return [ref, display];
}
