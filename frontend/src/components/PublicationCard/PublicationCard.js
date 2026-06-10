import React, { useState, useEffect } from 'react';
import '../ProjectCard/ProjectCard.css';
import './PublicationCard.css';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';

// A carousel card for a publication / presentation. Unlike ProjectCard it isn't
// repo-backed — the citation is passed in directly. With a url it opens the paper
// on click; without one, clicking pops a brief "no online link" hint instead.
const PublicationCard = ({ title, citation, url, footer = 'Read the paper →' }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const clickable = Boolean(url);

  // Both shimmer (decode) in when the card scrolls into view; title settles first,
  // then the citation — same treatment as ProjectCard.
  const [titleRef, titleText] = useScrambleOnVisible(title, 1100);
  const [descRef, citationText] = useScrambleOnVisible(citation, 1100, 1100);
  const bidi = { unicodeBidi: 'bidi-override', direction: 'ltr' };

  // Auto-dismiss the hint shortly after it shows.
  useEffect(() => {
    if (!showHint) return undefined;
    const t = setTimeout(() => setShowHint(false), 1600);
    return () => clearTimeout(t);
  }, [showHint]);

  const handleClick = () => {
    if (clickable) {
      window.open(url, '_blank');
    } else {
      setShowHint(true);
    }
  };

  return (
    <div
      className={`project-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => clickable && setIsHovered(true)}
      onMouseLeave={() => clickable && setIsHovered(false)}
      onClick={handleClick}
      style={{ position: 'relative', ...(clickable ? {} : { cursor: 'default' }) }}
    >
      <h2 ref={titleRef} style={bidi}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{citationText}</p>
      <div className="project-card-footer">{footer}</div>
      {showHint && <div className="pub-hint">no online link</div>}
    </div>
  );
};

export default PublicationCard;
