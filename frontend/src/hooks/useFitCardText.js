import { useLayoutEffect, useRef, useState } from 'react';

// Cards keep a fixed 4:5 portrait shape, so a longer text shrinks its font instead of
// growing the card. The visible title and body are still typing / decoding when the card
// mounts, so the fit is measured on a hidden "ghost" copy of the FINAL text that shares
// the card's content box (see .card-fit-ghost in ProjectCard.css). Returns the refs for
// the card and the ghost, and the largest font size in px that fits.
const MAX_PX = 17;
const MIN_PX = 10;

export default function useFitCardText(title, body) {
  const cardRef = useRef(null);
  const ghostRef = useRef(null);
  const [fontSize, setFontSize] = useState(MAX_PX);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const ghost = ghostRef.current;
    if (!card || !ghost) return undefined;

    const fits = (px) => {
      ghost.style.fontSize = `${px}px`;
      return ghost.scrollHeight <= ghost.clientHeight + 1;
    };
    const fit = () => {
      if (!ghost.clientHeight) return; // not laid out yet (hidden tab, display:none)
      let lo = MIN_PX;
      let hi = MAX_PX;
      if (fits(hi)) {
        lo = hi;
      } else {
        while (hi - lo > 0.25) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
      }
      const px = Math.floor(lo * 4) / 4;
      ghost.style.fontSize = `${px}px`;
      setFontSize(px);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(card);
    let live = true;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => live && fit());
    }
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [title, body]);

  return { cardRef, ghostRef, fontSize };
}
