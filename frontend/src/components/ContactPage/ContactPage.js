// src/components/ContactPage/ContactPage.js
import React, { useState } from 'react';
import './ContactPage.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLinkedin, faGithub } from '@fortawesome/free-brands-svg-icons';
import { faFileLines, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import TypingText from '../TypingText/TypingText';

const RESUME_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/David_Ledbetter_Resume.pdf';

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
              <TypingText as="span" speed={20} text="dledbetter456@gmail.com" style={label} />
            </a>
          </li>
        </ul>

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
