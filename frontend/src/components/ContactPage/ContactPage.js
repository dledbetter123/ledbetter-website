// src/components/ContactPage/ContactPage.js
import React from 'react';
import './ContactPage.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLinkedin, faGithub } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faPhone, faFileLines } from '@fortawesome/free-solid-svg-icons';
import TypingText from '../TypingText/TypingText';
import ShimmerText from '../ShimmerText/ShimmerText';

const RESUME_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/David_Ledbetter_Resume.pdf';

const label = { display: 'inline-block' };

const ContactPage = () => {
  return (
    <div className="contactPage">
      <div className="contactContent">
        <ul>
          <li>
            <FontAwesomeIcon icon={faLinkedin} className="icon" />
            <a href="https://www.linkedin.com/in/david-ledbetter-umbc" className="contactLink" target="_blank" rel="noopener noreferrer">
              <TypingText as="span" speed={40} text="LinkedIn" style={label} />
            </a>
          </li>
          <li>
            <FontAwesomeIcon icon={faGithub} className="icon" />
            <a href="https://github.com/dledbetter123" className="contactLink">
              <TypingText as="span" speed={40} text="GitHub" style={label} />
            </a>
          </li>
          <li>
            <FontAwesomeIcon icon={faFileLines} className="icon" />
            <a href={RESUME_URL} className="contactLink" target="_blank" rel="noopener noreferrer">
              <TypingText as="span" speed={40} text="Resume" style={label} />
            </a>
          </li>
          <li>
            <FontAwesomeIcon icon={faEnvelope} className="icon" />
            <a href="mailto:dledbetter456@gmail.com" className="contactLink">
              <ShimmerText as="span" text="dledbetter456@gmail.com" style={label} />
            </a>
          </li>
          <li>
            <FontAwesomeIcon icon={faPhone} className="icon" />
            <a href="tel:+12403055339" className="contactLink">
              <ShimmerText as="span" text="(240)-305-5339" style={label} />
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ContactPage;
