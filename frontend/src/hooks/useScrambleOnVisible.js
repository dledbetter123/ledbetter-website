import { useEffect, useRef, useState } from 'react';
import { runScramble, scrambleOf, randomGlyphs } from '../lib/scramble';

// Visibility-gated scramble/decode effect. Returns [ref, displayText]. The element is
// prefilled with random glyphs so it's never empty before the decode runs. By default it
// starts once the element scrolls into view; pass opts.start (boolean) to drive it
// externally, and opts.onDone to be notified when the decode completes. `startDelay`
// stays a positional arg for existing callers (cards delay the description after the title).
export default function useScrambleOnVisible(text, duration = 3000, startDelay = 0, opts = {}) {
  const { start, onDone } = opts;
  const controlled = start !== undefined;
  const ref = useRef(null);
  const [display, setDisplay] = useState('');
  const [vis, setVis] = useState(false);
  const started = controlled ? !!start : vis;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Random-glyph placeholder until the decode takes over.
  useEffect(() => {
    if (started) return;
    setDisplay(text != null ? scrambleOf(text) : randomGlyphs(110));
  }, [text, started]);

  // Visibility trigger — only used when not externally controlled.
  useEffect(() => {
    if (controlled || vis) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVis(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [controlled, vis]);

  // Run the decode once started and the text is available (after an optional delay).
  useEffect(() => {
    if (!started || text == null) return;
    let cancel = null;
    const timer = setTimeout(() => {
      cancel = runScramble(text, duration, setDisplay, () => {
        if (onDoneRef.current) onDoneRef.current();
      });
    }, startDelay);
    return () => {
      clearTimeout(timer);
      if (cancel) cancel();
    };
  }, [started, text, duration, startDelay]);

  return [ref, display];
}
