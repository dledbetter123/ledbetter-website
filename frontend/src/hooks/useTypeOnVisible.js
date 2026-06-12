import { useEffect, useRef, useState } from 'react';

// Live-typing effect. By default it starts once the element scrolls into view; pass
// opts.start (a boolean) to drive it externally instead (e.g. an orchestrated sequence).
// opts.onDone fires once when the text has fully typed. `speed` is ms per character
// (capped so very long text still finishes in a reasonable time).
export default function useTypeOnVisible(text, speed = 30, opts = {}) {
  const { start, onDone } = opts;
  const controlled = start !== undefined;
  const ref = useRef(null);
  const [typed, setTyped] = useState('');
  const [vis, setVis] = useState(false);
  const started = controlled ? !!start : vis;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

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

  // Type out once started.
  useEffect(() => {
    if (!started || text == null) return;
    setTyped('');
    const len = text.length;
    const TICK = Math.max(8, speed || 30); // ms per character
    const MAXDUR = 2500; // cap so long strings don't crawl
    const step = Math.max(1, Math.ceil(len / (MAXDUR / TICK)));
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(len, i + step);
      setTyped(text.slice(0, i));
      if (i >= len) {
        clearInterval(id);
        if (onDoneRef.current) onDoneRef.current();
      }
    }, TICK);
    return () => clearInterval(id);
  }, [started, text, speed]);

  return [ref, typed, started];
}
