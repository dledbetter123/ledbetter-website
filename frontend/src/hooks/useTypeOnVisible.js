import { useEffect, useRef, useState } from 'react';

// Live-typing effect that only starts once the element scrolls into view, so the
// animation is always captured by the viewer. Returns [ref, typedText, started].
// Attach `ref` to the element whose text should type in. `text` may be null while
// loading (e.g. fetched content) — typing begins/refreshes once it resolves.
export default function useTypeOnVisible(text, speed = 6) {
  const ref = useRef(null);
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(false);

  // Begin when the element first becomes visible.
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

  // Type out the text once started (and re-type if the text changes after start).
  useEffect(() => {
    if (!started || text == null) return;
    setTyped('');
    const len = text.length;
    // Cap total typing time at 1.5s regardless of length: advance `step` chars per
    // tick so long paragraphs finish on time instead of crawling.
    const TICK = 20;
    const step = Math.max(1, Math.ceil(len / (1500 / TICK)));
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(len, i + step);
      setTyped(text.slice(0, i));
      if (i >= len) clearInterval(id);
    }, TICK);
    return () => clearInterval(id);
  }, [started, text, speed]);

  return [ref, typed, started];
}
