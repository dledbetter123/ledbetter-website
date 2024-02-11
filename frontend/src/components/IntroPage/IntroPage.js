// src/componentns/IntroPage/IntroPage.js

import React, { useEffect, useState } from 'react';
import './IntroPage.css';

import profilePic from './images/profile.jpeg'; // Update the path accordingly

const IntroPage = () => {
  const [backendStatus, setBackendStatus] = useState('loading');
  const [hoverTitle, setHoverTitle] = useState('');

  useEffect(() => {
    // will need to use the actual IP address or domain of your backend service when in production
    const backendUri = process.env.REACT_APP_BACKEND_URI || 'http://localhost:8080'; // Fallback to a default
    fetch(`${backendUri}/api/status`)
      .then(response => response.text())
      .then(text => {
        if (text === "Backend stable") {
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
        <h1 style={{ fontSize: '34px' }} className={backendStatus === 'stable' ? 'accent-green' : 'accent-red'}
         title={hoverTitle}>
            Welcome 
        </h1>
        <p style={{ fontSize: '26px' }} title={hoverTitle}>I'm a software engineer with experience in Web and app development,
          Operating Systems, as well as DevOps and DevSecOps frameworks. I'm also a machine learning
          researcher who has developed autonomous systems and robots.</p>
      </div>
      <img src={profilePic} alt="Profile" className="profilePic" />
    </section>
  );
};

export default IntroPage;

