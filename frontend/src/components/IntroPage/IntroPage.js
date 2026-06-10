// ledbetter-website/frontend/src/components/IntroPage/IntroPage.js

import React, { useEffect, useState } from 'react';
import './IntroPage.css';

import profilePic from './images/hero.jpg';

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

  // Type out the "Welcome." heading on mount.
  useEffect(() => {
    const welcomeString = 'Welcome. ';
    let index = 0;

    const intervalId = setInterval(() => {
      setWelcomeText((prevText) => prevText + welcomeString[index]);
      index++;
      if (index === welcomeString.length) {
        clearInterval(intervalId);
        setWelcomeCursorVisible(false);
        setWelcomeDone(true);
      }
    }, 50); // Adjust typing speed here (milliseconds per character)

    return () => clearInterval(intervalId);
  }, []);

  // Type out the paragraph once the heading is done and the text has loaded.
  useEffect(() => {
    if (!welcomeDone || introParagraph === null) return;
    setParagraphCursorVisible(true);
    setParagraphText('');
    const len = introParagraph.length;
    // Deliberate ~2.2s typewriter for the hero paragraph.
    const delay = Math.max(8, Math.min(60, Math.round(2200 / Math.max(len, 1))));
    let index = 0;
    const intervalId = setInterval(() => {
      index += 1;
      setParagraphText(introParagraph.slice(0, index));
      if (index >= len) {
        clearInterval(intervalId);
        setParagraphCursorVisible(false);
        setParagraphDone(true);
      }
    }, delay);
    return () => clearInterval(intervalId);
  }, [welcomeDone, introParagraph]);

  useEffect(() => {
    const handleScroll = () => {
      const profilePic = document.querySelector('.profilePic');
      if (!profilePic) return;

      const W = window.innerWidth;
      const H = window.innerHeight;
      // Natural dimensions of the hero image (fallback to known size before load).
      const natW = profilePic.naturalWidth || 2001;
      const natH = profilePic.naturalHeight || 3000;

      // With object-fit: cover, the image is scaled to cover the viewport; this is
      // how much of it overflows vertically and can be panned through.
      const scale = Math.max(W / natW, H / natH);
      const overflowY = Math.max(0, natH * scale - H);

      // Gentle parallax pan while the hero is visible.
      const panDistance = Math.min(overflowY, H * 1.5);
      const s = window.scrollY;
      const panPct = panDistance > 0 ? Math.min(100, (s / panDistance) * 100) : 100;

      // Show the hero only through the top 5% of the page's total scroll range, then
      // fade it to black over the next 5%. Fully black past 10%. No chances.
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const showUntil = 0.25 * maxScroll;
      const blackBy = 0.50 * maxScroll;
      let opacity = 1;
      if (s >= blackBy) {
        opacity = 0;
      } else if (s > showUntil) {
        opacity = 1 - (s - showUntil) / (blackBy - showUntil);
      }

      profilePic.style.objectPosition = `50% ${panPct}%`;
      profilePic.style.opacity = String(opacity);
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
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
      <img src={profilePic} alt="Profile" className="profilePic" />
    </section>
  );
};

export default IntroPage;
