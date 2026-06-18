import React, { useState, useEffect } from 'react';
import '../ProjectCard/ProjectCard.css';
import './PublicationCard.css';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';

// A carousel card for a publication / presentation. Unlike ProjectCard it isn't
// repo-backed — the citation is passed in directly. With a url it opens the paper
// on click; without one, clicking pops a brief "no online link" hint instead.
const PublicationCard = ({ title, citation, url, footer = 'Read the paper →' }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const clickable = Boolean(url);

  // The title types out like a typewriter; once it finishes, the citation shimmers in.
  const [titleDone, setTitleDone] = useState(false);
  const [titleRef, titleText] = useTypeOnVisible(title, 45, { onDone: () => setTitleDone(true) });
  const [descRef, citationText] = useScrambleOnVisible(citation, 700, 0, { start: titleDone });
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
      <h2 ref={titleRef}>{titleText}</h2>
      <p ref={descRef} style={bidi}>{citationText}</p>
      <div className="project-card-footer">{footer}</div>
      {showHint && <div className="pub-hint">no online link</div>}
    </div>
  );
};

export default PublicationCard;
