import React, { useState, useRef, useEffect } from 'react';
import './ChatWidget.css';
import { runScramble } from '../../lib/scramble';

// Pool of Greek-letter glyphs for the "thinking" indicator. Each loading cycle
// draws a freshly shuffled ordering from this pool (matches the site's scramble
// aesthetic — actual characters, e.g. "φ χ ν", not their spelled-out names).
const GREEK_NAMES = [
  'φ', 'χ', 'ν', 'ψ', 'ρ', 'ξ', 'τ', 'μ', 'η',
  'β', 'ζ', 'θ', 'σ', 'ω', 'λ', 'γ', 'δ', 'κ',
];

// Stable per-tab session id shared with the backend. Generated once with
// crypto.randomUUID() and persisted in sessionStorage so it survives reloads
// within the same tab but differs across tabs.
const getSessionId = () => {
  let id = sessionStorage.getItem('ledbettergpt_session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('ledbettergpt_session', id);
  }
  return id;
};

// Fisher–Yates shuffle returning a new array (leaves the pool untouched).
const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// LedbetterGPT — a small chat assistant that streams answers about David from the
// backend's /api/chat endpoint (Gemini-backed). The backend URL is injected at
// runtime via window.env.REACT_APP_BACKEND_URI (see config.js / IntroPage).
const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi, I'm David Ledbetter, what do you want to talk about?" },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [arrow, setArrow] = useState(1);
  const [loadingGlyph, setLoadingGlyph] = useState('');
  const scrollRef = useRef(null);
  const sessionIdRef = useRef(null);

  // Lazily initialise (and persist) the per-tab session id on first render.
  if (sessionIdRef.current === null) sessionIdRef.current = getSessionId();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;

    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', text: m.text }));

    setMessages((prev) => [...prev, { role: 'user', text: message }, { role: 'assistant', text: '' }]);
    setInput('');
    setStreaming(true);

    const backendUri = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
    try {
      const res = await fetch(`${backendUri}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, sessionId: sessionIdRef.current }),
      });

      if (!res.ok) {
        const errText = (await res.text()) || 'Something went wrong. Please try again.';
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: errText };
          return next;
        });
        return;
      }

      const fullText = (await res.text()).trim() || '(no response)';
      // Decode the answer in with the shimmer effect (same as the project cards):
      // the whole reply flickers through Greek/Arabic glyphs and settles into place.
      const duration = Math.min(2200, 1100 + fullText.length * 1.2);
      await new Promise((resolve) => {
        runScramble(
          fullText,
          duration,
          (s) => {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', text: s };
              return next;
            });
          },
          resolve,
        );
      });
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', text: 'Network error. Please try again.' };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Cycle the ❯ ❯❯ ❯❯❯ arrow drawing attention to the (closed) chat button.
  useEffect(() => {
    if (isOpen) return undefined;
    const id = setInterval(() => setArrow((a) => (a % 3) + 1), 450);
    return () => clearInterval(id);
  }, [isOpen]);

  // "Thinking" indicator: while the response is still in flight (the trailing
  // assistant bubble is empty), accumulate a freshly-shuffled run of Greek-letter
  // names ("phi" → "phi chi" → …, ~6 long) and then restart with a new shuffle.
  const last = messages[messages.length - 1];
  const showLoading = streaming && last && last.role === 'assistant' && !last.text;
  useEffect(() => {
    if (!showLoading) {
      setLoadingGlyph('');
      return undefined;
    }
    let order = shuffled(GREEK_NAMES);
    let n = 0;
    const tick = () => {
      n += 1;
      if (n > 6) { order = shuffled(GREEK_NAMES); n = 1; } // reset + reshuffle
      setLoadingGlyph(order.slice(0, n).join(' '));
    };
    tick();
    const id = setInterval(tick, 280);
    return () => clearInterval(id);
  }, [showLoading]);

  return (
    <div className="chatWidget">
      {isOpen && (
        <div className="chatPanel">
          <div className="chatHeader">
            <span>LedbetterGPT</span>
            <button className="chatClose" onClick={() => setIsOpen(false)} aria-label="Close chat">×</button>
          </div>
          <div className="chatMessages" ref={scrollRef}>
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              // The trailing assistant bubble is "typing" while streaming and it
              // still has text being revealed; show the loading run before that.
              const typing = streaming && isLast && m.role === 'assistant';
              return (
                <div key={i} className={`chatMsg ${m.role}`}>
                  {m.text
                    ? (i === 0
                        ? <span className="chatShimmer">{m.text}</span>
                        : m.text)
                    : (typing ? <span className="chatLoading">{loadingGlyph}</span> : '')}
                </div>
              );
            })}
          </div>
          <div className="chatInputRow">
            <input
              className="chatInput"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask David…"
              disabled={streaming}
            />
            <button className="chatSend" onClick={send} disabled={streaming || !input.trim()}>
              {streaming ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
      <div className="chatBar">
        {!isOpen && <span className="chatArrow chatArrowLeft">{'❯'.repeat(arrow)}</span>}
        <button className="chatToggle" onClick={() => setIsOpen((o) => !o)}>
          {isOpen ? 'Close' : 'Ask LedbetterGPT'}
        </button>
        {!isOpen && <span className="chatArrow chatArrowRight">{'❮'.repeat(arrow)}</span>}
      </div>
    </div>
  );
};

export default ChatWidget;
