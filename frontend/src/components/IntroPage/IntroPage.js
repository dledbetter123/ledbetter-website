// ledbetter-website/frontend/src/components/IntroPage/IntroPage.js

import React, { useEffect, useState } from 'react';
import './IntroPage.css';

import profilePic from './images/profile.jpeg';

const IntroPage = () => {
  const [backendStatus, setBackendStatus] = useState('loading');
  const [hoverTitle, setHoverTitle] = useState('');
  const [welcomeText, setWelcomeText] = useState('');
  const [paragraphText, setParagraphText] = useState('');
  const [welcomeCursorVisible, setWelcomeCursorVisible] = useState(true);
  const [paragraphCursorVisible, setParagraphCursorVisible] = useState(false);

  useEffect(() => {
    const welcomeString = 'Welcome. ';
    let index = 0;

    const intervalId = setInterval(() => {
      setWelcomeText((prevText) => prevText + welcomeString[index]);
      index++;
      if (index === welcomeString.length) {
        clearInterval(intervalId);
        setWelcomeCursorVisible(false); // Show cursor after "Welcome" text finishes typing

        startParagraphTyping();
      }
    }, 110); // Adjust typing speed here (milliseconds per character)

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const profilePic = document.querySelector('.profilePic');
      const scrollValue = window.scrollY;
      const height = window.innerHeight;
      // Adjust these values as needed
      const fadeStart = 0; // Start fade at 100px scroll
      const fadeUntil = height / 2; // Full fade by half the viewport height

      let opacity = 1;

      if (scrollValue <= fadeStart) {
        opacity = 1;
      } else if (scrollValue <= fadeUntil) {
        opacity = 1 - (scrollValue - fadeStart)*0.5 / (fadeUntil - fadeStart);
      } else {
        opacity = 0;
      }

      profilePic.style.opacity = opacity;
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const startParagraphTyping = () => {
    setParagraphCursorVisible(true);
    const paragraphString =
      "I'm a software engineer with experience in Web and app development, Operating Systems, as well as DevOps and DevSecOps frameworks. I'm also a machine learning researcher who has developed autonomous systems and robots.";
    let index = 0;

    const intervalId = setInterval(() => {
      setParagraphText((prevText) => prevText + paragraphString[index]);
      index++;
      if (index === paragraphString.length) {
        clearInterval(intervalId);
        setParagraphCursorVisible(false);
      }
    }, 15); // Adjust typing speed here (milliseconds per character)
  };
  
  useEffect(() => {
    // will need to use the actual IP address or domain of backend service when in production
    const backendUri = window.env.REACT_APP_BACKEND_URI || 'rice';
    console.log(backendUri)
    console.log(window.env.HOSTNAME)
    console.log(process.env.HOME)
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
          {paragraphText}
          {paragraphCursorVisible && <span>|</span>}
        </p>
      </div>
      <img src={profilePic} alt="Profile" className="profilePic" />
    </section>
  );
};

export default IntroPage;

