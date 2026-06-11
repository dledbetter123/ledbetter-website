import React, { useState, useEffect } from 'react';
import './ProjectCard.css';
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

  // Both shimmer (decode) in when the card scrolls into view.
  // Title decodes first; the description starts once the title has settled.
  const [titleRef, titleText] = useScrambleOnVisible(title, 1100);
  const [descRef, descriptionText] = useScrambleOnVisible(fullDescription, 1100, 1100);
  const bidi = { unicodeBidi: 'bidi-override', direction: 'ltr' };

  return (
    <div
      className={`project-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => window.open(clickUrl, '_blank')} // Keeping the click to redirect
    >
      <h2 ref={titleRef} style={bidi}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{descriptionText}</p>
      <div className="project-card-footer">Click me</div>
    </div>
  );
};

export default ProjectCard;
