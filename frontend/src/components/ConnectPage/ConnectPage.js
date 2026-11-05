// src/components/ConnectPage/ConnectPage.js
// /connect: how a visitor adds LedbetterLM to their own Claude. The server is
// backend-lambda/mcp.go (stateless Streamable HTTP, no sign-in); this page only tells
// people where it is.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './ConnectPage.css';

const MCP_URL = 'https://www.davidamosledbetter.com/api/mcp';
const CLAUDE_CODE_CMD = `claude mcp add --transport http ledbetter ${MCP_URL}`;

const TOOLS = [
  ['about_david', 'a quick overview of me, my projects and publications'],
  ['ask_ledbetterlm', 'ask anything; it reads my public GitHub repos to answer'],
  ['get_ledbetterlm_answer', 'collect a code-level answer the librarian is still reading for'],
  ['get_resume', 'the link to my résumé'],
];

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Older Safari and non-HTTPS previews have no clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      /* nothing else to try */
    }
    ta.remove();
    return ok;
  }
};

const CopyLine = ({ text, label }) => {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const onCopy = async () => {
    setState((await copyText(text)) ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 1800);
  };
  return (
    <div className="connectCopy">
      <code>{text}</code>
      <button type="button" onClick={onCopy} aria-label={`Copy ${label}`}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it' : 'Copy'}
      </button>
    </div>
  );
};

const ConnectPage = () => (
  <div className="connectPage">
    <Link to="/#portfolio" className="connectBack">← davidamosledbetter.com</Link>

    <header className="connectCard">
      <h1>Connect your Claude</h1>
      <p>
        Add LedbetterLM, my AI librarian, to your own Claude and ask it about my work from
        your chats. No sign-in, no key.
      </p>
      <CopyLine text={MCP_URL} label="the server URL" />
    </header>

    <section className="connectCard">
      <h2>claude.ai and Claude Desktop</h2>
      <ol>
        <li>Open <b>Customize &gt; Connectors</b> and click <b>Add custom connector</b>.</li>
        <li>Name it <b>LedbetterLM</b>, paste the URL above, leave sign-in off, and click <b>Add</b>.</li>
        <li>In a chat, open <b>+ &gt; Connectors</b> and turn LedbetterLM on.</li>
      </ol>
      <p className="connectNote">The Free plan allows one custom connector.</p>
    </section>

    <section className="connectCard">
      <h2>Claude Code</h2>
      <CopyLine text={CLAUDE_CODE_CMD} label="the Claude Code command" />
    </section>

    <section className="connectCard">
      <h2>What your Claude gets</h2>
      <ul className="connectTools">
        {TOOLS.map(([name, what]) => (
          <li key={name}><code>{name}</code>: {what}</li>
        ))}
      </ul>
      <p className="connectNote">
        Try: “Use LedbetterLM to tell me what David built with edge ML.” It's a shared,
        rate-limited service. Other agents can read <a href="/llms.txt">/llms.txt</a>.
      </p>
    </section>
  </div>
);

export default ConnectPage;
