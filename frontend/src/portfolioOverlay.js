// The LedbetterLM chat as a floating overlay on the static portfolio pages
// (public/portfolio/*.html). Those pages load this bundle on the first "Ask LedbetterLM"
// click (public/portfolio/ask.js) and call window.LedbetterLM.mountOverlay. The chat
// renders inside a shadow root with the bundle's stylesheet, so the site's global styles
// (index.css, App.css) never touch the portfolio page and its styles never touch the chat.
// It shares the project chat page's conversation (same storage key).
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget/ChatWidget';
import { projectBySlug } from './data/projects';
import { askQuestion, pageFromContext, projectGreeting, projectStoreKey } from './lib/askContext';

const Overlay = ({ project, inbox }) => {
  const [page, setPage] = useState(() => pageFromContext(project.slug, null));
  const [ask, setAsk] = useState(null);

  useEffect(() => {
    let n = 0;
    const take = (ctx) => {
      n += 1;
      setPage(pageFromContext(project.slug, ctx));
      setAsk({ id: n, question: askQuestion(project, ctx) });
    };
    inbox.listen(take);
    return () => inbox.listen(null);
  }, [project, inbox]);

  return (
    <ChatWidget
      storeKey={projectStoreKey(project.slug)}
      greeting={projectGreeting(project)}
      starter={project.opener}
      page={page}
      ask={ask}
      placeholder={`Ask about ${project.title}…`}
    />
  );
};

// Asks that arrive before the component has mounted wait here.
const makeInbox = () => {
  let listener = null;
  const pending = [];
  return {
    listen(fn) {
      listener = fn;
      while (listener && pending.length) listener(pending.shift());
    },
    post(ctx) {
      if (listener) listener(ctx);
      else pending.push(ctx);
    },
  };
};

// Mounts once per page and resolves with {ask(ctx)} after the chat's stylesheet has loaded.
export const mountOverlay = ({ slug, cssHref }) => new Promise((resolve, reject) => {
  const project = projectBySlug(slug);
  if (!project) {
    reject(new Error(`unknown project ${slug}`));
    return;
  }
  const host = document.createElement('div');
  host.id = 'ledbetterlm-overlay';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssHref;
  const mount = document.createElement('div');
  shadow.append(link, mount);
  const inbox = makeInbox();
  link.onload = () => {
    createRoot(mount).render(<Overlay project={project} inbox={inbox} />);
    resolve({ ask: (ctx) => inbox.post(ctx) });
  };
  link.onerror = () => {
    host.remove();
    reject(new Error('chat stylesheet failed to load'));
  };
});
