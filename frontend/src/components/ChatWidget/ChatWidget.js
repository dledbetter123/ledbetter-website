import React, { useState, useRef, useEffect } from 'react';
import './ChatWidget.css';
import { runScramble } from '../../lib/scramble';
import { mdToHtml } from '../../lib/markdown';
import OperatorMode from '../OperatorMode/OperatorMode';

// LedbetterGPT's opening line — kept as a constant so the character-shimmer effect
// (below) can twinkle it without diverging from the seeded first message.
const GREETING = "Hi, I'm David Ledbetter (or rather, his librarian). I maintain a knowledge base of David's experience, interests, and current projects. Ask me anything and I'll review the library.";

// Persist the open chat to sessionStorage so a page refresh repopulates it in-place.
// This is Web Storage, NOT a cookie: it's never sent to a server and is exempt as
// strictly-necessary, so it needs no consent banner. Scoped to the tab and to a "flush
// window" — if the last activity is older than this, we start fresh rather than
// resurrecting a stale conversation. (Keyed on the per-tab session, not IP, so people
// behind a shared IP never see each other's chats.)
const CHAT_STORE_KEY = 'ledbettergpt_chat';
const FLUSH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const loadSavedChat = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHAT_STORE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.messages)) return null;
    if (Date.now() - saved.savedAt > FLUSH_WINDOW_MS) return null;
    if (saved.messages.length <= 1) return null; // nothing beyond the greeting to restore
    return saved; // { savedAt, isOpen, messages }
  } catch (e) {
    return null;
  }
};

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
  // Restore a recent conversation (and its open/closed state) on refresh, else greet.
  // Read once; loadSavedChat already enforces the idle flush window.
  const savedRef = useRef(undefined);
  if (savedRef.current === undefined) savedRef.current = loadSavedChat();
  const saved = savedRef.current;

  const [isOpen, setIsOpen] = useState(() => !!saved?.isOpen);
  const [messages, setMessages] = useState(
    () => saved?.messages || [{ role: 'assistant', text: GREETING }],
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  // Ongoing character-shimmer of the greeting while the panel is open (null = show
  // the plain greeting; set to a glyph-twinkled copy each interval tick).
  const [greetingShimmer, setGreetingShimmer] = useState(null);
  const [loadingGlyph, setLoadingGlyph] = useState('');
  // Set after a passkey login → chat talks to the catalog (KB-writing) endpoint.
  const [operatorToken, setOperatorToken] = useState(null);
  const scrollRef = useRef(null);
  const sessionIdRef = useRef(null);
  // Time of the last message activity, for the IDLE flush window. Seeded from the
  // restored chat so a bare page load/refresh does NOT reset the clock — only sending
  // or receiving a message does. Restore is allowed only while idle < FLUSH_WINDOW_MS.
  const lastActivityRef = useRef(saved?.savedAt ?? Date.now());

  // Lazily initialise (and persist) the per-tab session id on first render.
  if (sessionIdRef.current === null) sessionIdRef.current = getSessionId();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Persist the conversation (and open state) so a refresh repopulates it. Only when
  // settled — never mid-stream — so we never restore a half-typed answer. savedAt is
  // the last MESSAGE-activity time (not now), so opening/closing or refreshing the page
  // doesn't reset the idle window — only an actual exchange does.
  useEffect(() => {
    if (streaming) return;
    try {
      sessionStorage.setItem(
        CHAT_STORE_KEY,
        JSON.stringify({ savedAt: lastActivityRef.current, isOpen, messages }),
      );
    } catch (e) {
      /* storage disabled/full — restoration just won't happen, non-fatal */
    }
  }, [messages, isOpen, streaming]);

  // Character shimmer on the greeting: a one-shot glyph decode each time the panel
  // opens, settling onto the real text and then stopping. Skipped under reduced-motion.
  useEffect(() => {
    if (!isOpen) {
      setGreetingShimmer(null);
      return undefined;
    }
    const reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const cancel = runScramble(GREETING, 900, setGreetingShimmer, () => setGreetingShimmer(null));
    return cancel;
  }, [isOpen]);

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;

    lastActivityRef.current = Date.now(); // reset the idle flush window on each exchange

    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', text: m.text }));

    setMessages((prev) => [...prev, { role: 'user', text: message }, { role: 'assistant', text: '' }]);
    setInput('');
    setStreaming(true);

    const backendUri = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
    // In catalog (operator) mode, talk to the KB-writing endpoint with the token.
    const path = operatorToken ? '/api/operator/chat' : '/api/chat';
    const payload = operatorToken
      ? { message, history, token: operatorToken }
      : { message, history, sessionId: sessionIdRef.current };
    try {
      const res = await fetch(`${backendUri}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
            <span className="chatHeaderRight">
              <OperatorMode onAuthed={setOperatorToken} />
              <button className="chatClose" onClick={() => setIsOpen(false)} aria-label="Close chat">×</button>
            </span>
          </div>
          <div className={`chatNotice${operatorToken ? ' chatNotice--operator' : ''}`}>
            {operatorToken
              ? 'Catalog mode — tell me what to remember and I’ll save it to the KB.'
              : 'Heads up — these chats are logged.'}
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
                        ? (greetingShimmer || m.text)
                        : (m.role === 'assistant'
                            ? <span dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }} />
                            : m.text))
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
        <button
          className={`chatToggle${isOpen ? ' open' : ''}`}
          onClick={() => setIsOpen((o) => !o)}
        >
          {isOpen ? 'Close' : 'Ask LedbetterGPT'}
        </button>
      </div>
    </div>
  );
};

export default ChatWidget;
