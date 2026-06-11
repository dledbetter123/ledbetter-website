// ledbetter-website/frontend/src/components/IntroPage/IntroPage.js

import React, { useEffect, useState } from 'react';
import './IntroPage.css';

// The fixed hero image now lives in MainPage as a single full-screen background
// layer behind the whole SPA (see MainPage's .profilePic / .content-layer). This
// component still drives the image's brightness/pan on scroll via
// document.querySelector('.profilePic').

// The intro paragraph is hosted in S3 so it can be edited without redeploying the
// site. Update s3://davidamosledbetter-portfolio/intro.txt and the change shows on
// the next page load. The constant below is the offline fallback if the fetch fails.
const INTRO_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/intro.txt';
const DEFAULT_INTRO =
  "I'm David Ledbetter, I'm a machine learning and full-stack software engineer at Apple, building agentic AI systems. I hold BS and MS degrees in Computer Science from UMBC. Scroll the cards below to see my projects… or ask LedbetterGPT in the corner anything about my work.";

const IntroPage = () => {
  const [backendStatus, setBackendStatus] = useState('loading');
  const [hoverTitle, setHoverTitle] = useState('');
  const [welcomeText, setWelcomeText] = useState('');
  const [paragraphText, setParagraphText] = useState('');
  const [welcomeCursorVisible, setWelcomeCursorVisible] = useState(true);
  const [paragraphCursorVisible, setParagraphCursorVisible] = useState(false);
  const [paragraphDone, setParagraphDone] = useState(false);
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [introParagraph, setIntroParagraph] = useState(null); // null while loading

  // Pull the editable intro paragraph from S3 (falls back to DEFAULT_INTRO).
  useEffect(() => {
    let cancelled = false;
    fetch(INTRO_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('not found'))))
      .then((text) => {
        if (!cancelled) setIntroParagraph(text.trim() || DEFAULT_INTRO);
      })
      .catch(() => {
        if (!cancelled) setIntroParagraph(DEFAULT_INTRO);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Type out the "Welcome." heading on mount. Time-based (rAF) rather than one char
  // per setInterval tick, so it finishes in the same wall-clock duration on every
  // device instead of being throttled by per-frame render cost on slower phones.
  useEffect(() => {
    const welcomeString = 'Welcome. ';
    const duration = 225; // ms, total
    let raf;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / duration);
      setWelcomeText(welcomeString.slice(0, Math.ceil(progress * welcomeString.length)));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setWelcomeCursorVisible(false);
        setWelcomeDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Type out the paragraph once the heading is done and the text has loaded. Also
  // time-based: show however many characters SHOULD be visible for the elapsed time,
  // so the ~0.73s duration holds whether the device renders 1 char/frame (desktop) or
  // several chars/frame (a slower phone) — no more "slower on mobile".
  useEffect(() => {
    if (!welcomeDone || introParagraph === null) return;
    setParagraphCursorVisible(true);
    setParagraphText('');
    const len = introParagraph.length;
    const duration = 733; // ms, total (~2x faster than the old 1.5s)
    let raf;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / duration);
      setParagraphText(introParagraph.slice(0, Math.ceil(progress * len)));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setParagraphCursorVisible(false);
        setParagraphDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [welcomeDone, introParagraph]);

  useEffect(() => {
    const profilePic = document.querySelector('.profilePic');
    if (!profilePic) return;

    // Coalesce scroll work to one update per animation frame. The hero is a large
    // fixed layer with a brightness filter (and, on widescreen, a panning
    // object-position); writing those on every raw scroll event repaints the whole
    // layer and drops frames on mobile Safari. rAF-throttling + skipping redundant
    // writes keeps it smooth.
    let ticking = false;
    let lastBrightness = -1;
    let lastPan = -1;

    // How far through the image you scroll before it's fully gone, as a fraction of
    // the image's pannable length (the part that overflows the viewport on widescreen).
    const VISIBLE_FRACTION = 0.75; // "scroll up ~75% of its length before disappearing"

    const update = () => {
      ticking = false;

      const s = window.scrollY;
      const W = window.innerWidth;
      const H = window.innerHeight;
      // Natural dimensions of the hero image (fallback to known size before load).
      const natW = profilePic.naturalWidth || 2001;
      const natH = profilePic.naturalHeight || 3000;

      // With object-fit: cover, how much taller than the viewport the scaled image is
      // — i.e. the vertical length we can pan through. ~0 on a portrait phone (the
      // image is only cropped on width); large on a landscape/desktop viewport.
      const scale = Math.max(W / natW, H / natH);
      const overflowY = Math.max(0, natH * scale - H);

      const base = 0.75; // resting brightness
      let brightness = base;
      let panPct = -1; // -1 = don't touch object-position (let CSS own it, mobile)

      if (overflowY > 1) {
        // Widescreen / desktop: scroll THROUGH the photo. Start at the top (face/head
        // visible) and pan object-position downward as you scroll; stay visible until
        // you've panned ~VISIBLE_FRACTION of the image, then fade to black over the
        // remainder. This is the desktop "scroll up ~75% before it disappears" feel.
        panPct = Math.min(100, (s / overflowY) * 100);
        const fadeStart = VISIBLE_FRACTION * overflowY;
        const fadeEnd = overflowY;
        if (s >= fadeEnd) {
          brightness = 0;
        } else if (s > fadeStart) {
          brightness = base * (1 - (s - fadeStart) / (fadeEnd - fadeStart));
        }
      } else {
        // Mobile portrait: no vertical overflow to pan (object-position owned by CSS).
        // Fade relative to total page scroll, as before — show through the top 8% of
        // the scroll range, fade over the next 5%, fully black past 13%.
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const showUntil = 0.08 * maxScroll;
        const blackBy = 0.13 * maxScroll;
        if (s >= blackBy) {
          brightness = 0;
        } else if (s > showUntil) {
          brightness = base * (1 - (s - showUntil) / (blackBy - showUntil));
        }
      }

      // Only touch the DOM when a value actually changed — avoids redundant repaints
      // of the large fixed hero layer on frames where nothing moved.
      if (panPct !== -1 && panPct !== lastPan) {
        profilePic.style.objectPosition = `50% ${panPct}%`;
        lastPan = panPct;
      }
      if (brightness !== lastBrightness) {
        profilePic.style.filter = `brightness(${brightness})`;
        lastBrightness = brightness;
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    update(); // set the initial resting state
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll); // re-evaluate on rotate / window resize

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    // will need to use the actual IP address or domain of backend service when in production
    const backendUri = (window.env && window.env.REACT_APP_BACKEND_URI) || ''; // '' = same-origin (/api/...)
    fetch(`${backendUri}/api/status`)
      .then(response => response.text())
      .then(text => {
        if (text === "backend stable") {
          setBackendStatus('stable');
          setHoverTitle('Title is green! This means that the backend is successfully communicating, it would be red otherwise.');
        } else {
          setBackendStatus('unstable');
          setHoverTitle('Title is Red... this means that the backend is not properly set up and communicating, it should be green.');
        }
      })
      .catch(() => {
        setBackendStatus('unstable');
        setHoverTitle('Title is Red... this means that the backend is not properly set up and communicating, it should be green.');
      });
  }, []);

  return (
    <section className="introPage">
      <div className="content">
        <h1 style={{ fontSize: '48px' }} className={backendStatus === 'stable' ? 'accent-green' : 'accent-red'}
         title={hoverTitle}>
          {welcomeText}
          {welcomeCursorVisible && <span>|</span>} {/* Cursor */}
        </h1>
        <p style={{ fontSize: '23px' }} title={hoverTitle}>
          {/* Invisible full-text sizer reserves the final height so the block never
              reflows as it types — the visible text then fills strictly top-down. */}
          {/* Reserve the paragraph's height from the first paint (using the always-
              available fallback until the S3 text loads), so the vertically-centered
              block — and the "Welcome." heading — never jumps when the text arrives. */}
          <span className="introPara-sizer" aria-hidden="true">
            {introParagraph || DEFAULT_INTRO}
          </span>
          <span className="introPara-typed">
            {paragraphText}
            {paragraphCursorVisible && <span>|</span>}
            {paragraphDone && <span className="cursorBlock" />}
          </span>
        </p>
      </div>
    </section>
  );
};

export default IntroPage;
