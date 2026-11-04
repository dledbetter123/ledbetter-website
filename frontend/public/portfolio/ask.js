// "Ask LedbetterLM" from a portfolio page: when a visitor clicks any link to the project's
// chat (/projects/<slug>), remember which section they were looking at, any text they had
// selected, and page state the page reports through window.askState(). The chat page
// reads this once from sessionStorage (same origin) and opens with a question about that
// spot. The server loads the section's real text itself (portfolio/context/<slug>.json),
// so nothing here is trusted as page content.
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

  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href^="/projects/"]');
    if (!link) return;
    const el = inView();
    const isOverview = !el || el.tagName === 'HEADER';
    const selection = pressedSelection || readSelection();
    pressedSelection = '';
    let state = '';
    try { state = typeof window.askState === 'function' ? String(window.askState() || '').slice(0, 120) : ''; } catch (err) { /* none */ }
    const ctx = {
      slug,
      section: isOverview ? 'overview' : slugify(headingOf(el)),
      heading: isOverview ? '' : headingOf(el),
      state,
      selection,
      at: Date.now(),
    };
    try { sessionStorage.setItem(KEY, JSON.stringify(ctx)); } catch (err) { /* storage off: the chat uses its default opener */ }
  }, true);
})();
