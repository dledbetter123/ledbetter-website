import React, { useState, useRef, useEffect } from 'react';
import './ChatWidget.css';

// LedbetterGPT — a small chat assistant that streams answers about David from the
// backend's /api/chat endpoint (Gemini-backed). The backend URL is injected at
// runtime via window.env.REACT_APP_BACKEND_URI (see config.js / IntroPage).
const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hey — I'm David Ledbetter (well, my digital likeness). Ask me anything about my experience, projects, or skills." },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [arrow, setArrow] = useState(1);
  const scrollRef = useRef(null);

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
        body: JSON.stringify({ message, history }),
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
      // Type the answer out client-side (the API returns it buffered).
      await new Promise((resolve) => {
        let i = 0;
        const id = setInterval(() => {
          i += 1;
          const partial = fullText.slice(0, i);
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', text: partial };
            return next;
          });
          if (i >= fullText.length) {
            clearInterval(id);
            resolve();
          }
        }, 8);
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

  return (
    <div className="chatWidget">
      {isOpen && (
        <div className="chatPanel">
          <div className="chatHeader">
            <span>LedbetterGPT</span>
            <button className="chatClose" onClick={() => setIsOpen(false)} aria-label="Close chat">×</button>
          </div>
          <div className="chatMessages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chatMsg ${m.role}`}>
                {m.text || (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
            ))}
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
        {!isOpen && <span className="chatArrow">{'❯'.repeat(arrow)}</span>}
        <button className="chatToggle" onClick={() => setIsOpen((o) => !o)}>
          {isOpen ? 'Close' : 'Ask LedbetterGPT'}
        </button>
      </div>
    </div>
  );
};

export default ChatWidget;
