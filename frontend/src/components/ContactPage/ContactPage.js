// src/components/ContactPage/ContactPage.js
import React, { useState } from 'react';
import './ContactPage.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLinkedin, faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons';
import { faFileLines, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import TypingText from '../TypingText/TypingText';

const RESUME_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/resume';

const label = { display: 'inline-block' };

const ContactPage = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    setError('');
    const backendUri = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
    try {
      const res = await fetch(`${backendUri}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError((await res.text()) || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('sent');
      setForm({ name: '', email: '', message: '' });
    } catch (err) {
      setError('Network error. Please try again.');
      setStatus('error');
    }
  };

  const RESUME_ASKED_KEY = 'ledbettergpt_resume_asked';
  const [resumePrompt, setResumePrompt] = useState(false);
  const [recruiterNote, setRecruiterNote] = useState('');

  const pingResume = (recruiter) => {
    try {
      const base = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
      fetch(`${base}/api/resume-click`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recruiter === null ? {} : { recruiter }),
      });
    } catch (e) {
      /* non-fatal */
    }
  };
  const openResume = () => window.open(RESUME_URL, '_blank', 'noopener,noreferrer');

  // First résumé open in this session asks whether they're a recruiter; after that, opens directly.
  const onResumeClick = (e) => {
    let asked = false;
    try {
      asked = !!sessionStorage.getItem(RESUME_ASKED_KEY);
    } catch (err) {
      /* storage disabled */
    }
    if (asked) {
      pingResume(null); // subsequent open — log it, let the link open normally
      return;
    }
    e.preventDefault();
    setResumePrompt(true);
  };
  const answerRecruiter = (isRecruiter) => {
    try {
      sessionStorage.setItem(RESUME_ASKED_KEY, '1');
    } catch (err) {
      /* storage disabled */
    }
    pingResume(isRecruiter);
    setResumePrompt(false);
    setRecruiterNote(
      isRecruiter
        ? "Great — after you've looked it over, please reach out through the form below so David can follow up."
        : '',
    );
    openResume();
  };

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
            <FontAwesomeIcon icon={faInstagram} className="icon" />
            <a href="https://www.instagram.com/davbetter" className="contactLink" target="_blank" rel="noopener noreferrer">
              <TypingText as="span" speed={40} text="Instagram" style={label} />
            </a>
          </li>
          <li>
            <FontAwesomeIcon icon={faFileLines} className="icon" />
            <a href={RESUME_URL} className="contactLink" target="_blank" rel="noopener noreferrer" onClick={onResumeClick}>
              <TypingText as="span" speed={40} text="Resume" style={label} />
            </a>
          </li>
          <li>
            <FontAwesomeIcon icon={faEnvelope} className="icon" />
            <a href="mailto:dledbetter456@gmail.com" className="contactLink">
              <TypingText as="span" speed={20} text="dledbetter456@gmail.com" style={label} />
            </a>
          </li>
        </ul>

        {resumePrompt && (
          <div className="resumePrompt">
            <p>Quick one before you view it — are you a recruiter?</p>
            <div className="resumePromptBtns">
              <button type="button" onClick={() => answerRecruiter(true)}>Yes</button>
              <button type="button" onClick={() => answerRecruiter(false)}>No</button>
            </div>
          </div>
        )}
        {recruiterNote && <p className="resumeNote">{recruiterNote}</p>}

        <form className="contactForm" onSubmit={onSubmit}>
          <p className="contactPrompt">Leave your info and I'll reach out.</p>
          <input
            className="contactField"
            name="name"
            value={form.name}
            onChange={onChange}
            placeholder="Your name"
            maxLength={120}
            autoComplete="name"
            required
          />
          <input
            className="contactField"
            name="email"
            type="email"
            value={form.email}
            onChange={onChange}
            placeholder="Your email"
            maxLength={200}
            autoComplete="email"
            required
          />
          <textarea
            className="contactField"
            name="message"
            value={form.message}
            onChange={onChange}
            placeholder="What's on your mind?"
            maxLength={4000}
            rows={4}
            required
          />
          <button className="contactSend" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </button>
          {status === 'sent' && (
            <p className="contactOk">Thanks — your message reached David. He'll get back to you.</p>
          )}
          {status === 'error' && <p className="contactErr">{error}</p>}
        </form>
      </div>
    </div>
  );
};

export default ContactPage;
