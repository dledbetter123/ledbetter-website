// frontend/src/components/SwipeableGridPage/Carousel.js

import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import './Carousel.css';

// A native scroll-snap carousel. The browser owns the gesture: a swipe tracks the
// finger 1:1 with real momentum, horizontal trackpad scrolling just works, and nothing
// re-renders React while it moves. (The old version translated a track on touchend,
// so a swipe did nothing until the finger lifted, then animated under a 0.5s lock
// that swallowed quick repeat swipes.)
//
// On top of native scrolling: mouse drag (desktop has no swipe), arrow keys, and
// goToNext/goToPrev for the page-level arrow-key routing in MainPage.
const DRAG_SLOP = 5;   // px of mouse travel before a press becomes a drag
const FLICK = 40;      // px of drag that advances a card even if it didn't cross halfway

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Carousel = forwardRef(({ items }, ref) => {
  const scrollerRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const settleTimerRef = useRef(null);

  const offsets = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !el.children.length) return [];
    const first = el.children[0].offsetLeft;
    return Array.from(el.children, (c) => c.offsetLeft - first);
  }, []);

  const nearestIndex = useCallback(() => {
    const el = scrollerRef.current;
    const offs = offsets();
    if (!el || !offs.length) return 0;
    let best = 0;
    offs.forEach((o, i) => {
      if (Math.abs(o - el.scrollLeft) < Math.abs(offs[best] - el.scrollLeft)) best = i;
    });
    return best;
  }, [offsets]);

  const goTo = useCallback((i) => {
    const el = scrollerRef.current;
    const offs = offsets();
    if (!el || !offs.length) return;
    const n = offs.length;
    const target = offs[((i % n) + n) % n];
    el.scrollTo({ left: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [offsets]);

  const goToNext = useCallback(() => goTo(nearestIndex() + 1), [goTo, nearestIndex]);
  const goToPrev = useCallback(() => goTo(nearestIndex() - 1), [goTo, nearestIndex]);

  useImperativeHandle(ref, () => ({
    // Kept for callers that still forward wheel events; native scrolling handles them.
    handleWheel: () => {},
    goToNext,
    goToPrev,
  }), [goToNext, goToPrev]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPrev();
    }
  };

  // Mouse drag. Touch and pen use native scrolling, so only a mouse gets here.
  const handlePointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scrollerRef.current;
    dragRef.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, start: nearestIndex(), moved: false };
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const el = scrollerRef.current;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      d.moved = true;
      clearTimeout(settleTimerRef.current);
      el.classList.add('is-dragging');   // snapping off while the mouse holds the track
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.left - dx;
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) return;
    const el = scrollerRef.current;
    suppressClickRef.current = true;   // the release must not open the card under it
    const dx = e.clientX - d.x;
    let target = nearestIndex();
    if (target === d.start && Math.abs(dx) > FLICK) target = d.start + (dx < 0 ? 1 : -1);
    target = Math.max(0, Math.min(items.length - 1, target));
    goTo(target);
    // Turn snapping back on once the glide lands, so re-enabling it can't jump.
    // scrollend where supported; the timer covers browsers without it.
    const settle = () => {
      clearTimeout(settleTimerRef.current);
      el.removeEventListener('scrollend', settle);
      el.classList.remove('is-dragging');
    };
    el.addEventListener('scrollend', settle);
    settleTimerRef.current = setTimeout(settle, 800);
  };

  const handleClickCapture = (e) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="carousel-container"
      role="region"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={scrollerRef}
        className="carousel-wrapper"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        {items.map((item, index) => (
          <div key={index} className="carousel-item">
            {item.content}
          </div>
        ))}
      </div>
    </div>
  );
});

export default Carousel;
