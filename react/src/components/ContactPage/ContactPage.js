// src/components/ContactPage/ContactPage.js
import React from 'react';
import './ContactPage.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLinkedin, faGithub } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faPhone } from '@fortawesome/free-solid-svg-icons';

const ContactPage = () => {
  return (
    <div className="contactPage">
      <div className="contactContent">
        <ul>
          <li>
            <FontAwesomeIcon icon={faLinkedin} className="icon" />
            <a href="https://linkedin.com" className="contactLink">LinkedIn</a>
          </li>
          <li>
            <FontAwesomeIcon icon={faGithub} className="icon" />
            <a href="https://github.com" className="contactLink">GitHub</a>
          </li>
          <li>
            <FontAwesomeIcon icon={faEnvelope} className="icon" />
            <span className="contactInfo">dledbetter456@gmail.com</span>
          </li>
          <li>
            <FontAwesomeIcon icon={faPhone} className="icon" />
            <span className="contactInfo">(240)-305-5339</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ContactPage;
