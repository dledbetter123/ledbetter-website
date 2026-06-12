// Operator (catalog) mode trigger — a discreet lock in the chat header. Tapping it runs
// a passkey (Face ID / Touch ID) login; only David's enrolled devices pass. A failed or
// non-David attempt shows a friendly "David-only" message. Enrollment (the bootstrap) is
// only offered when the URL hash is #operator-enroll AND the server's window is open.
import React, { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import './OperatorMode.css';

const api = (path, body) => {
  const base = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
};

const DENY = "This is David's operator mode only.";

const OperatorMode = ({ onAuthed }) => {
  const [status, setStatus] = useState('idle'); // idle | busy | authed | denied | error
  const [msg, setMsg] = useState('');
  const enrollVisible =
    typeof window !== 'undefined' && window.location.hash.includes('operator-enroll');

  const authenticate = async () => {
    setStatus('busy');
    setMsg('');
    try {
      const begin = await api('/api/operator/auth/begin');
      if (!begin.ok) {
        setStatus('denied');
        setMsg(DENY);
        return;
      }
      const optionsJSON = (await begin.json()).publicKey;
      const assertion = await startAuthentication({ optionsJSON });
      const finish = await api('/api/operator/auth/finish', assertion);
      if (!finish.ok) {
        setStatus('denied');
        setMsg(DENY);
        return;
      }
      const { token } = await finish.json();
      try {
        sessionStorage.setItem('ledbettergpt_operator', token);
      } catch (e) {
        /* storage disabled — token still held in memory by the caller */
      }
      setStatus('authed');
      setMsg('Operator authenticated.');
      if (onAuthed) onAuthed(token);
    } catch (e) {
      // user cancelled the prompt, or no matching passkey on this device
      setStatus('denied');
      setMsg(DENY);
    }
  };

  const enroll = async () => {
    setStatus('busy');
    setMsg('');
    try {
      const begin = await api('/api/operator/register/begin');
      if (!begin.ok) {
        setStatus('error');
        setMsg('Enrollment is closed.');
        return;
      }
      const optionsJSON = (await begin.json()).publicKey;
      const att = await startRegistration({ optionsJSON });
      const finish = await api('/api/operator/register/finish', att);
      if (!finish.ok) {
        setStatus('error');
        setMsg('Enrollment failed.');
        return;
      }
      setStatus('authed');
      setMsg('This device is enrolled — you can now authenticate with Face ID.');
    } catch (e) {
      setStatus('error');
      setMsg('Enrollment failed or was cancelled.');
    }
  };

  return (
    <span className="operatorMode">
      <button
        className="operatorBtn"
        title="Operator mode"
        aria-label="Operator mode"
        onClick={authenticate}
        disabled={status === 'busy'}
      >
        {status === 'authed' ? '🔓' : '🔒'}
      </button>
      {enrollVisible && (
        <button className="operatorEnroll" onClick={enroll} disabled={status === 'busy'}>
          Enroll this device
        </button>
      )}
      {msg && <span className={`operatorMsg operatorMsg--${status}`}>{msg}</span>}
    </span>
  );
};

export default OperatorMode;
