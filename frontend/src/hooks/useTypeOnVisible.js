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
    let i = 0;
    // Per-character delay scales with length so total typing time stays consistent
    // (long text types faster per char, short text slower) — clamped for sanity.
    const delay = Math.max(4, Math.min(40, Math.round(2200 / Math.max(text.length, 1))));
    const id = setInterval(() => {
      i++;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, delay);
    return () => clearInterval(id);
  }, [started, text, speed]);

  return [ref, typed, started];
}
