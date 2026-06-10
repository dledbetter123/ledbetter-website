import React, { useState } from 'react';
import '../ProjectCard/ProjectCard.css';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';

// A carousel card for a publication / presentation. Unlike ProjectCard it isn't
// repo-backed — the citation is passed in directly — and clicking opens the paper
// (DOI/IEEE/PDF) or the related code rather than a repo's README.
const PublicationCard = ({ title, citation, url, footer = 'Read the paper →' }) => {
  const [isHovered, setIsHovered] = useState(false);
  const clickable = Boolean(url); // some entries (e.g. an unlinked poster) don't open anything

  // Both shimmer (decode) in when the card scrolls into view; title settles first,
  // then the citation — same treatment as ProjectCard.
  const [titleRef, titleText] = useScrambleOnVisible(title, 1100);
  const [descRef, citationText] = useScrambleOnVisible(citation, 1100, 1100);
  const bidi = { unicodeBidi: 'bidi-override', direction: 'ltr' };

  return (
    <div
      className={`project-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => clickable && setIsHovered(true)}
      onMouseLeave={() => clickable && setIsHovered(false)}
      onClick={clickable ? () => window.open(url, '_blank') : undefined}
      style={clickable ? undefined : { cursor: 'default' }}
    >
      <h2 ref={titleRef} style={bidi}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{citationText}</p>
      <div className="project-card-footer">{footer}</div>
    </div>
  );
};

export default PublicationCard;
