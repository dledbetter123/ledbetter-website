import React, { useState, useEffect } from 'react';
import './ProjectCard.css';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';

const DEFAULT_DESCRIPTION = 'missing portfolio readme.';

// Build the raw URL for a repo's portfolio description from its GitHub page URL.
// e.g. https://github.com/dledbetter123/Grad-Assessment
//   -> https://raw.githubusercontent.com/dledbetter123/Grad-Assessment/main/README_portfolio.md
const portfolioReadmeUrl = (githubUrl) =>
  githubUrl.replace('github.com', 'raw.githubusercontent.com').replace(/\/$/, '') +
  '/main/README_portfolio.md';

const ProjectCard = ({ title, githubUrl }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [fullDescription, setFullDescription] = useState(null); // null while loading

  // Pull the description directly from the repo's README_portfolio.md.
  useEffect(() => {
    let cancelled = false;
    fetch(portfolioReadmeUrl(githubUrl))
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('not found'))))
      .then((text) => {
        if (!cancelled) setFullDescription(text.trim() || DEFAULT_DESCRIPTION);
      })
      .catch(() => {
        if (!cancelled) setFullDescription(DEFAULT_DESCRIPTION);
      });
    return () => {
      cancelled = true;
    };
  }, [githubUrl]);

  // Both type in when the card scrolls into view.
  const [titleRef, titleText] = useTypeOnVisible(title, 40);
  const [descRef, descriptionText] = useTypeOnVisible(fullDescription, 6);

  return (
    <div
      className={`project-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => window.open(githubUrl, '_blank')} // Keeping the click to redirect
    >
      <h2 ref={titleRef}>{titleText}</h2>
      <p ref={descRef}>{descriptionText}</p>
      <div className="project-card-footer">Click me</div>
    </div>
  );
};

export default ProjectCard;
