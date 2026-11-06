import React, { useState } from 'react';
import './ProjectCard.css';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';
import usePortfolioDescription from '../../hooks/usePortfolioDescription';
import { portfolioUrl } from '../../data/projects';
import { logCardClick } from '../../lib/cardClick';

// A carousel card for one project (see data/projects.js). Clicking opens the project's
// portfolio page (a static HTML page outside the React app, so it's a full page load);
// that page links to the repo and to the LedbetterLM chat about the project.
const ProjectCard = ({ project }) => {
  const [isHovered, setIsHovered] = useState(false);
  const fullDescription = usePortfolioDescription(project);

  // The header types out like a typewriter; once it finishes, the body text shimmers
  // (decodes) in — top to bottom.
  const [titleDone, setTitleDone] = useState(false);
  const [titleRef, titleText] = useTypeOnVisible(project.title, 45, { onDone: () => setTitleDone(true) });
  const [descRef, descriptionText] = useScrambleOnVisible(fullDescription, 700, 0, { start: titleDone });
  const bidi = { unicodeBidi: 'bidi-override', direction: 'ltr' };

  return (
    <div
      className={`project-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        logCardClick('project', project.slug);
        window.location.assign(portfolioUrl(project));
      }}
    >
      <h2 ref={titleRef}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{descriptionText}</p>
      <div className="project-card-footer">Open the project →</div>
    </div>
  );
};

export default ProjectCard;
