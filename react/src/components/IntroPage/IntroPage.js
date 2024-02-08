// src/IntroPage/IntroPage.js

import React from 'react';
import './IntroPage.css';

import profilePic from './images/profile.jpeg'; // Update the path accordingly

const IntroPage = () => {
  return (
    <section className="introPage">
      <div className="content">
        <h1 className="accent-green">Welcome</h1>
        <p>I'm a software engineer with experience in Web and app development, Operating Systems, as well as DevOps and DevSecOps frameworks. I'm also a machine learning researcher who has developed autonomous systems and robots.</p>
      </div>
      <img src={profilePic} alt="Profile" className="profilePic" />
    </section>
  );
};

export default IntroPage;
