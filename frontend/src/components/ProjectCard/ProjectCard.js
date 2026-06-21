import React, { useState, useEffect } from 'react';
import './ProjectCard.css';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';

const DEFAULT_DESCRIPTION = 'missing portfolio readme.';

// Build the raw URL for a repo's portfolio description from its GitHub page URL.
// e.g. https://github.com/dledbetter123/Grad-Assessment
//   -> https://raw.githubusercontent.com/dledbetter123/Grad-Assessment/main/README_portfolio.md
const portfolioReadmeUrl = (githubUrl) =>
  githubUrl.replace('github.com', 'raw.githubusercontent.com').replace(/\/$/, '') +
  '/main/README_portfolio.md';

const ProjectCard = ({ title, githubUrl, description = null, linkUrl }) => {
  const [isHovered, setIsHovered] = useState(false);
  // Repo-backed cards fetch their text from README_portfolio.md. Cards passed an
  // explicit `description` (e.g. private-repo / product work that has no public
  // README to read) use it directly and skip the fetch. `linkUrl` overrides the
  // click target when the card shouldn't open a GitHub repo.
  const [fetchedDescription, setFetchedDescription] = useState(null); // null while loading

  useEffect(() => {
    if (description) return undefined; // inline description — nothing to fetch
    let cancelled = false;
    fetch(portfolioReadmeUrl(githubUrl))
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('not found'))))
      .then((text) => {
        if (!cancelled) setFetchedDescription(text.trim() || DEFAULT_DESCRIPTION);
      })
      .catch(() => {
        if (!cancelled) setFetchedDescription(DEFAULT_DESCRIPTION);
      });
    return () => {
      cancelled = true;
    };
  }, [githubUrl, description]);

  const fullDescription = description || fetchedDescription;
  const clickUrl = linkUrl || githubUrl;

  // The header types out like a typewriter; once it finishes, the body text shimmers
  // (decodes) in — top to bottom.
  const [titleDone, setTitleDone] = useState(false);
  const [titleRef, titleText] = useTypeOnVisible(title, 45, { onDone: () => setTitleDone(true) });
  const [descRef, descriptionText] = useScrambleOnVisible(fullDescription, 700, 0, { start: titleDone });
  const bidi = { unicodeBidi: 'bidi-override', direction: 'ltr' };

  return (
    <div
      className={`project-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => clickUrl && window.open(clickUrl, '_blank')}
      style={clickUrl ? undefined : { cursor: 'default' }}
    >
      <h2 ref={titleRef}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{descriptionText}</p>
      <div className="project-card-footer">{clickUrl ? 'Click me' : 'Ask LedbetterLM below ↓'}</div>
    </div>
  );
};

export default ProjectCard;
