// "Ask LedbetterLM" from a portfolio page: a click on any link to the project's chat
// (/projects/<slug>) opens the chat right here, over the page. It reads which section the
// visitor was looking at, any text they had selected, and page state the page reports
// through window.askState(), and the chat opens with a question about that spot. The chat
// is the site's own React widget: the first click loads the site bundle (named in
// /asset-manifest.json) and calls window.LedbetterLM.mountOverlay. If that fails, or the
// click opens a new tab, the link goes to the chat page as before, which reads the same
// context once from sessionStorage. The server loads the section's real text itself
// (portfolio/context/<slug>.json), so nothing here is trusted as page content.
(() => {
  const KEY = 'ledbetter_ask_context';
  const slug = location.pathname.replace(/^.*\//, '').replace(/\.html$/, '');

  // Same rule as scripts/build_portfolio_context.py.
  const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const headingOf = (el) => {
    const h = el.querySelector('h1, h2');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  const blocks = () => [...document.querySelectorAll('.wrap > header, .wrap > section, .wrap > figure')]
    .filter((el) => headingOf(el) && !el.classList.contains('cta') && !el.classList.contains('sources'));

  // The block crossing 40% of the viewport height, else the one with the most on screen.
  const inView = () => {
    const line = window.innerHeight * 0.4;
    let best = null;
    let bestScore = 0;
    for (const el of blocks()) {
      const r = el.getBoundingClientRect();
      const shown = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (!shown) continue;
      const score = (r.top <= line && r.bottom >= line ? 1e6 : 0) + shown;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return best;
  };

  // A press on a link can clear the selection before the click lands, so read it on press.
  const readSelection = () => {
    try { return String(window.getSelection() || '').replace(/\s+/g, ' ').trim().slice(0, 400); } catch (err) { return ''; }
  };
  let pressedSelection = '';
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a[href^="/projects/"]')) pressedSelection = readSelection();
  }, true);

  const contextNow = () => {
    const el = inView();
    const isOverview = !el || el.tagName === 'HEADER';
    const selection = pressedSelection || readSelection();
    pressedSelection = '';
    let state = '';
    try { state = typeof window.askState === 'function' ? String(window.askState() || '').slice(0, 120) : ''; } catch (err) { /* none */ }
    return {
      slug,
      section: isOverview ? 'overview' : slugify(headingOf(el)),
      heading: isOverview ? '' : headingOf(el),
      state,
      selection,
      at: Date.now(),
    };
  };
  const saveForChatPage = (ctx) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(ctx)); } catch (err) { /* storage off: the chat uses its default opener */ }
  };

  // Load the site bundle once and mount the chat over this page.
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  let overlay = null;
  const openOverlay = () => {
    if (!overlay) {
      overlay = fetch('/asset-manifest.json', { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
        .then((m) => loadScript(m.files['main.js']).then(() => window.LedbetterLM.mountOverlay({ slug, cssHref: m.files['main.css'] })))
        .then((chat) => {
          const fab = document.querySelector('.ask-fab');
          if (fab) fab.hidden = true; // the chat brings its own Ask LedbetterLM button
          return chat;
        });
      overlay.catch(() => { overlay = null; });
    }
    return overlay;
  };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href^="/projects/"]');
    if (!link) return;
    const ctx = contextNow();
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      saveForChatPage(ctx); // a new tab or window: the chat page picks it up
      return;
    }
    e.preventDefault();
    withTimeout(openOverlay(), 10000)
      .then((chat) => chat.ask(ctx))
      .catch(() => { saveForChatPage(ctx); location.href = link.href; });
  }, true);
})();
