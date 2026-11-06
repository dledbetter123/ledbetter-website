// Logs a homepage card click (a project or a publication) to /api/card-click, which records
// the visitor's IP like a résumé open does. keepalive lets the request finish while a project
// card navigates away to its portfolio page. Never blocks or breaks the click.
export const logCardClick = (kind, card) => {
  try {
    const base = (window.env && window.env.REACT_APP_BACKEND_URI) || '';
    fetch(`${base}/api/card-click`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, card }),
    }).catch(() => {});
  } catch (e) {
    /* non-fatal */
  }
};
