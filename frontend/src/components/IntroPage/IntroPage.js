// ledbetter-website/frontend/src/components/IntroPage/IntroPage.js

import React, { useEffect, useState } from 'react';
import './IntroPage.css';

// The intro paragraph is hosted in S3 so it can be edited without redeploying the
// site. Update s3://davidamosledbetter-portfolio/intro.txt and the change shows on
// the next page load. The constant below is the offline fallback if the fetch fails.
const INTRO_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/intro.txt';
const DEFAULT_INTRO =
  "I'm David Ledbetter, I'm a machine learning and full-stack software engineer at Apple, building agentic AI systems. I hold BS and MS degrees in Computer Science from UMBC. Scroll the cards below to see my projects… or ask LedbetterLM in the corner anything about my work.";

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
  // so the ~0.95s duration holds whether the device renders 1 char/frame (desktop) or
  // several chars/frame (a slower phone) — no more "slower on mobile".
  useEffect(() => {
    if (!welcomeDone || introParagraph === null) return;
    setParagraphCursorVisible(true);
    setParagraphText('');
    const len = introParagraph.length;
    const duration = 953; // ms, total (~30% slower than the prior 733ms)
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
