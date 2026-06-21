// Operator inbox — read and reply to contact-form submissions. Behind the same passkey
// (WebAuthn) as operator mode: only David's enrolled devices can authenticate. Reachable
// at /inbox. Messages are stored server-side (S3) and read here; replies go out via SES.
import React, { useState, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import './InboxPage.css';

const api = (path, body) => {
  const base = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
};

// A contact is a conversation: turn 0 is the visitor's original form submission, followed by
// every threaded turn (David's replies + the visitor's emailed responses).
const threadTurns = (m) => [
  { dir: 'in', from: m.email, body: m.message, ts: m.ts },
  ...(m.thread || []),
];

const fmtTs = (ts) => {
  try { return new Date(ts).toLocaleString(); } catch (e) { return ts; }
};

const InboxPage = () => {
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem('ledbettergpt_operator') || ''; } catch (e) { return ''; }
  });
  const [status, setStatus] = useState('idle'); // idle | busy | loaded | denied | error
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState({}); // id -> draft
  const [sending, setSending] = useState({}); // id -> bool

  const loadMessages = async (t, silent) => {
    if (!silent) { setStatus('busy'); setError(''); }
    try {
      const res = await api('/api/operator/messages', { token: t || token });
      if (res.status === 401) { if (!silent) { setToken(''); setStatus('idle'); } return; }
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setMessages(data.messages || []);
      setStatus('loaded');
    } catch (e) { if (!silent) { setStatus('error'); setError('Could not load messages.'); } }
  };

  const authenticate = async () => {
    setStatus('busy'); setError('');
    try {
      const begin = await api('/api/operator/auth/begin');
      if (!begin.ok) throw new Error('denied');
      const optionsJSON = (await begin.json()).publicKey;
      const assertion = await startAuthentication({ optionsJSON });
      const finish = await api('/api/operator/auth/finish', assertion);
      if (!finish.ok) throw new Error('denied');
      const { token: t } = await finish.json();
      try { sessionStorage.setItem('ledbettergpt_operator', t); } catch (e) { /* memory only */ }
      setToken(t);
      await loadMessages(t);
    } catch (e) { setStatus('denied'); setError("This is David's inbox only."); }
  };

  const sendReply = async (id) => {
    const body = (replyText[id] || '').trim();
    if (!body) return;
    setSending((s) => ({ ...s, [id]: true })); setError('');
    try {
      const res = await api('/api/operator/reply', { token, id, body });
      if (!res.ok) {
        const t = await res.text();
        setError(`Reply failed: ${(t || '').slice(0, 200) || res.status}`);
      } else {
        const out = { dir: 'out', from: 'me@davidamosledbetter.com', body, ts: new Date().toISOString() };
        setMessages((ms) => ms.map((m) => (
          m.id === id ? { ...m, replied: true, thread: [...(m.thread || []), out] } : m
        )));
        setReplyText((r) => ({ ...r, [id]: '' }));
      }
    } catch (e) { setError('Reply failed (network).'); }
    setSending((s) => ({ ...s, [id]: false }));
  };

  useEffect(() => { if (token) loadMessages(token); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Poll for new inbound replies while the inbox is open, without flickering the list.
  useEffect(() => {
    if (!(token && status === 'loaded')) return undefined;
    const h = setInterval(() => loadMessages(token, true), 30000);
    return () => clearInterval(h);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [token, status]);

  return (
    <div className="inboxPage">
      <h1 className="inboxTitle">LedbetterLM — Inbox</h1>

      {!(token && status === 'loaded') && (
        <div className="inboxAuth">
          <p>Operator inbox. Sign in with your passkey to read and reply to contact messages.</p>
          <button onClick={authenticate} disabled={status === 'busy'}>
            {status === 'busy' ? '…' : 'Sign in with passkey'}
          </button>
          {error && <p className="inboxErr">{error}</p>}
        </div>
      )}

      {token && status === 'loaded' && (
        <div className="inboxList">
          <div className="inboxBar">
            <button onClick={() => loadMessages()}>Refresh</button>
            <span>{messages.length} message{messages.length === 1 ? '' : 's'}</span>
          </div>
          {error && <p className="inboxErr">{error}</p>}
          {messages.length === 0 && <p className="inboxEmpty">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`inboxMsg${m.replied ? ' replied' : ''}`}>
              <div className="inboxMeta">
                <span className="inboxName">{m.name}</span>
                <a href={`mailto:${m.email}`} className="inboxEmail">{m.email}</a>
                <span className="inboxTs">{(m.ts || '').replace('T', ' ').replace('Z', ' UTC')}</span>
                {m.loc && <span className="inboxLoc">{m.loc}</span>}
                {m.replied && <span className="inboxReplied">✓ replied</span>}
              </div>
              <div className="inboxThread">
                {threadTurns(m).map((t, i) => (
                  <div key={i} className={`inboxBubble ${t.dir === 'out' ? 'out' : 'in'}`}>
                    <div className="inboxBubbleBody">{t.body}</div>
                    {t.ts && <div className="inboxBubbleTs">{fmtTs(t.ts)}</div>}
                  </div>
                ))}
              </div>
              <textarea
                className="inboxReplyBox"
                placeholder="Write a reply…"
                value={replyText[m.id] || ''}
                onChange={(e) => setReplyText((r) => ({ ...r, [m.id]: e.target.value }))}
              />
              <button
                className="inboxSend"
                onClick={() => sendReply(m.id)}
                disabled={sending[m.id] || !(replyText[m.id] || '').trim()}
              >
                {sending[m.id] ? 'Sending…' : (m.replied ? 'Send another reply' : 'Send reply')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InboxPage;
