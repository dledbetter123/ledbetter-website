// frontend/src/components/SwipeableGridPage/Carousel.js

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import './Carousel.css';

const Carousel = forwardRef(({ items }, ref) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false); // Lock to prevent bouncing

  // Gesture state lives in refs, not useState: it mutates on every touchmove /
  // wheel tick and must neither re-render the component nor reset between
  // renders. (As state, touchmove re-rendered per frame mid-swipe, and the
  // wheel accumulator — a plain `let` — silently zeroed on every render.)
  const touchStartXRef = useRef(0);
  const touchEndXRef = useRef(0);
  const touchMovedRef = useRef(false);
  const accumulatedDeltaXRef = useRef(0);
  const deltaXThreshold = 200; // wheel travel needed to trigger a slide change
  const swipeThreshold = 50;

  const handleTransitionEnd = () => {
    setIsTransitioning(false); // Reset transition state when transition completes
  };

  // Safety valve: if transitionend never fires (hidden tab, interrupted
  // animation), the lock would wedge and freeze navigation. The transition is
  // 0.5s; clear the lock shortly after regardless.
  useEffect(() => {
    if (!isTransitioning) return undefined;
    const t = setTimeout(() => setIsTransitioning(false), 700);
    return () => clearTimeout(t);
  }, [isTransitioning]);

  const goToNext = () => {
    if (isTransitioning) return;
    setActiveIndex((current) => (current + 1) % items.length);
    setIsTransitioning(true);
  };

  const goToPrev = () => {
    if (isTransitioning) return;
    setActiveIndex((current) => (current === 0 ? items.length - 1 : current - 1));
    setIsTransitioning(true);
  };

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = e.touches[0].clientX;
    touchMovedRef.current = false;
  };

  const handleTouchMove = (e) => {
    touchEndXRef.current = e.touches[0].clientX;
    touchMovedRef.current = true;
  };

  const handleTouchEnd = () => {
    // A tap fires touchstart→touchend with no touchmove; without this guard the
    // stale/zero end-coordinate read as a giant swipe and taps changed slides.
    if (!touchMovedRef.current) return;
    const delta = touchStartXRef.current - touchEndXRef.current;
    if (delta > swipeThreshold) {
      goToNext();
    } else if (delta < -swipeThreshold) {
      goToPrev();
    }
  };

  // Keyboard is scoped to the focused carousel instance. A window-level
  // listener looks convenient, but with two carousels mounted (projects +
  // publications) every arrow press advanced BOTH at once.
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPrev();
    }
  };

  useImperativeHandle(ref, () => ({
    handleWheel: (e) => {
      // Only hijack predominantly-HORIZONTAL wheel gestures for slide navigation.
      // Vertical-dominant scrolling must pass through to the page — don't
      // preventDefault it — so the cursor isn't "captured" over the carousel.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      accumulatedDeltaXRef.current += e.deltaX;

      if (Math.abs(accumulatedDeltaXRef.current) > deltaXThreshold) {
        if (accumulatedDeltaXRef.current > 0) {
          goToNext();
        } else {
          goToPrev();
        }
        accumulatedDeltaXRef.current = 0;
      }
    },
    goToNext,
    goToPrev,
  }));

  return (
    <div
      className="carousel-container"
      role="region"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className="carousel-wrapper"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTransitionEnd={handleTransitionEnd}
        style={{
          /* -88% per slide, matching .carousel-item's flex-basis (see
             Carousel.css) — the remaining 12% is the next card's peek. */
          transform: `translateX(calc(${activeIndex} * -88%))`,
          transition: isTransitioning ? 'transform 0.5s ease' : 'none',
        }}
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
