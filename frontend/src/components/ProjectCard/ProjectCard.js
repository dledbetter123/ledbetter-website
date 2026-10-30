import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProjectCard.css';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';
import usePortfolioDescription from '../../hooks/usePortfolioDescription';

// A carousel card for one project (see data/projects.js). Clicking opens the project's
// own page, where LedbetterLM starts a conversation about it; the repo / live-site links
// live on that page.
const ProjectCard = ({ project }) => {
  const navigate = useNavigate();
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
      onClick={() => navigate(`/projects/${project.slug}`)}
    >
      <h2 ref={titleRef}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{descriptionText}</p>
      <div className="project-card-footer">Chat about this project →</div>
    </div>
  );
};

export default ProjectCard;
