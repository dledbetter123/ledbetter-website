import React, { useState, useEffect } from 'react';
import { shimmerOf } from '../../lib/scramble';

// Visually hide while keeping the text available to assistive tech / selection.
const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

// Renders `text` with an ongoing character shimmer: every `interval` ms a small
// fraction (`prob`) of the characters flicker through glyphs, then revert. The real
// text is held hidden underneath to reserve width — so the perpetual glyph-swap never
// reflows the line — and again as sr-only so the accessible name stays the real value
// (the visible glyphs are decorative). Honors prefers-reduced-motion (stays static).
const ShimmerText = ({ text, as: Tag = 'span', prob = 0.06, interval = 110, style }) => {
  const [display, setDisplay] = useState(text);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Hold the real text (no twinkle) while hovered/focused or under reduced-motion,
    // so it's legible to read or copy.
    if (reduce || hovered) {
      setDisplay(text);
      return undefined;
    }
    const id = setInterval(() => setDisplay(shimmerOf(text, prob)), interval);
    return () => clearInterval(id);
  }, [text, prob, interval, hovered]);

  const hold = () => setHovered(true);
  const release = () => setHovered(false);

  return (
    <Tag
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
      style={{
        position: 'relative',
        display: 'inline-block',
        // keep RTL Arabic glyphs in place while shimmering
        unicodeBidi: 'bidi-override',
        direction: 'ltr',
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ visibility: 'hidden' }}>{text}</span>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'pre' }}>
        {display}
      </span>
      <span style={srOnly}>{text}</span>
    </Tag>
  );
};

export default ShimmerText;
