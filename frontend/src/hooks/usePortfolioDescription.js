import { useState, useEffect } from 'react';

const DEFAULT_DESCRIPTION = 'missing portfolio readme.';

// Build the raw URL for a repo's portfolio description from its GitHub page URL.
// e.g. https://github.com/dledbetter123/Grad-Assessment
//   -> https://raw.githubusercontent.com/dledbetter123/Grad-Assessment/main/README_portfolio.md
const portfolioReadmeUrl = (githubUrl) =>
  githubUrl.replace('github.com', 'raw.githubusercontent.com').replace(/\/$/, '') +
  '/main/README_portfolio.md';

// A project's display text: the inline `description` when it has one, otherwise the
// repo's README_portfolio.md fetched live. Returns null while the fetch is in flight.
const usePortfolioDescription = ({ githubUrl, description }) => {
  const [fetched, setFetched] = useState(null);

  useEffect(() => {
    if (description || !githubUrl) return undefined; // inline text, nothing to fetch
    let cancelled = false;
    fetch(portfolioReadmeUrl(githubUrl))
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('not found'))))
      .then((text) => {
        if (!cancelled) setFetched(text.trim() || DEFAULT_DESCRIPTION);
      })
      .catch(() => {
        if (!cancelled) setFetched(DEFAULT_DESCRIPTION);
      });
    return () => {
      cancelled = true;
    };
  }, [githubUrl, description]);

  if (description) return description;
  if (!githubUrl) return DEFAULT_DESCRIPTION;
  return fetched;
};

export default usePortfolioDescription;
