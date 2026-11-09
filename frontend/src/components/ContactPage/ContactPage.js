// src/components/ContactPage/ContactPage.js
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ContactPage.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLinkedin, faGithub, faInstagram } from '@fortawesome/free-brands-svg-icons';
import { faFileLines, faEnvelope, faGraduationCap, faPhone, faAddressCard, faRobot } from '@fortawesome/free-solid-svg-icons';
import TypingText from '../TypingText/TypingText';
import Carousel from '../SwipeableGridPage/Carousel';

const RESUME_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/resume';
// Two CVs beside the one-page résumé: a two-page short CV and the full standard CV
// (every role, research result and publication).
const CV_SHORT_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/cv-short';
const CV_STANDARD_URL = 'https://davidamosledbetter-portfolio.s3.amazonaws.com/cv-standard';

// The phone number, the contact card and the CV with the number show only on a private
// link, /c/<link id> (David's call, 2026-11-09; before that they were on every page). The
// files live in the portfolio bucket under x/<link id>/, so the id is the only key: it is
// not in this repo or the public bundle, and the bucket allows GetObject but not listing,
// so a wrong id simply finds no vCard and the page shows the public tiles. A visitor who
// opened the link keeps it for the browser session, so going back to / still shows them.
// The "Leave your info" form at the bottom of the main page; the general page's Email tile scrolls to it.
const CONTACT_FORM_ID = 'leave-your-info';
const PORTFOLIO_BUCKET = 'https://davidamosledbetter-portfolio.s3.amazonaws.com';
const LINK_KEY = 'ledbetter_contact_link';
const LINK_ROUTE = /^\/c\/([A-Za-z0-9_-]{8,64})\/?$/;

const usePrivateContact = () => {
  const { pathname } = useLocation();
  const routeId = (pathname.match(LINK_ROUTE) || [])[1] || null;
  let linkId = routeId;
  try {
    if (routeId) sessionStorage.setItem(LINK_KEY, routeId);
    else linkId = sessionStorage.getItem(LINK_KEY);
  } catch (err) {
    /* storage disabled */
  }
  const base = linkId ? `${PORTFOLIO_BUCKET}/x/${linkId}` : null;

  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (!base) return undefined;
    let live = true;
    fetch(`${base}/david-ledbetter.vcf`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => {
        const m = t.match(/^TEL[^:]*:(.+)$/m);
        if (live && m) setPhone(m[1].trim());
      })
      .catch(() => {});
    return () => { live = false; };
  }, [base]);

  // Unlisted page: keep it out of search results.
  useEffect(() => {
    if (!routeId) return undefined;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [routeId]);

  // Only a link whose vCard actually loaded counts.
  const exclusive = Boolean(base && phone);
  return {
    exclusive,
    phone,
    vcardUrl: exclusive ? `${base}/david-ledbetter.vcf` : null,
    cvShortUrl: exclusive ? `${base}/cv-exclusive` : CV_SHORT_URL,
  };
};


// The tile carousel (contact links, resume, CVs, Connect your Claude) sits right under the
// intro so the calls to action are near the top; the message form stays at the bottom.
export const ContactTiles = () => {
  const { exclusive, phone, vcardUrl, cvShortUrl } = usePrivateContact();
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
  const onEmailClick = (e) => {
    e.preventDefault();
    const form = document.getElementById(CONTACT_FORM_ID);
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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

  // Contact links as 2x2 tile grids, four per slide, in the same swipe carousel as the
  // project cards. Order is priority: on the private link the phone and contact card lead.
  const tiles = [
    exclusive && {
      key: 'phone', icon: faPhone, label: 'Phone', sub: phone,
      href: `tel:${phone.replace(/[^\d+]/g, '')}`,
    },
    exclusive && { key: 'vcard', icon: faAddressCard, label: 'Save contact', href: vcardUrl, download: 'David_Ledbetter.vcf' },
    // The address shows only on the private link; on the general page the tile scrolls to
    // the "Leave your info" form at the bottom.
    exclusive
      ? { key: 'email', icon: faEnvelope, label: 'Email', sub: 'dledbetter456@gmail.com', href: 'mailto:dledbetter456@gmail.com' }
      : { key: 'email', icon: faEnvelope, label: 'Email', href: `#${CONTACT_FORM_ID}`, onClick: onEmailClick },
    { key: 'linkedin', icon: faLinkedin, label: 'LinkedIn', href: 'https://www.linkedin.com/in/david-ledbetter-umbc', external: true },
    { key: 'github', icon: faGithub, label: 'GitHub', href: 'https://github.com/dledbetter123' },
    { key: 'instagram', icon: faInstagram, label: 'Instagram', href: 'https://www.instagram.com/davbetter', external: true },
    { key: 'resume', icon: faFileLines, label: 'Resume', href: RESUME_URL, external: true, onClick: onResumeClick },
    { key: 'cv-short', icon: faGraduationCap, label: 'CV (short)', href: cvShortUrl, external: true },
    { key: 'cv-standard', icon: faGraduationCap, label: 'CV (standard)', href: CV_STANDARD_URL, external: true },
    // Adds LedbetterLM (the /api/mcp server) to the visitor's own Claude.
    { key: 'claude', icon: faRobot, label: 'Connect your Claude', href: '/connect' },
  ].filter(Boolean);

  const tile = (t) => (
    <a
      key={t.key}
      href={t.href}
      className="contactTile"
      download={t.download}
      onClick={t.onClick}
      {...(t.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <FontAwesomeIcon icon={t.icon} className="tileIcon" />
      <TypingText as="span" speed={40} text={t.label} className="tileLabel" />
      {t.sub && <TypingText as="span" speed={20} text={t.sub} className="tileSub" />}
    </a>
  );

  const slides = [];
  for (let i = 0; i < tiles.length; i += 4) {
    slides.push({ content: <div className="contactGrid">{tiles.slice(i, i + 4).map(tile)}</div> });
  }

  return (
    <div className="contactPage contactPage--tiles">
      <div className="contactContent">
        {exclusive && <p className="privateLinkNote">Only your link shows this contact info.</p>}
        <div className="contactCarousel">
          <Carousel items={slides} />
        </div>

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
      </div>
    </div>
  );
};

export const ContactForm = () => {
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
    <div id={CONTACT_FORM_ID} className="contactPage contactPage--form">
      <div className="contactContent">
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

const ContactPage = () => (
  <>
    <ContactTiles />
    <ContactForm />
  </>
);

export default ContactPage;
