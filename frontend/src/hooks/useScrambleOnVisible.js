import { useEffect, useRef, useState } from 'react';
import { runScramble } from '../lib/scramble';

// Visibility-gated scramble/decode effect. Returns [ref, displayText]. Attach
// `ref` to the element; the shimmer runs once the element scrolls into view.
export default function useScrambleOnVisible(text, duration = 3000) {
  const ref = useRef(null);
  const [display, setDisplay] = useState('');
  const [started, setStarted] = useState(false);

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

  useEffect(() => {
    if (!started || text == null) return;
    return runScramble(text, duration, setDisplay);
  }, [started, text, duration]);

  return [ref, display];
}
