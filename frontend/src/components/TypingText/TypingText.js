import React from 'react';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';

// Renders `text` with the live-typing-on-visibility effect inside the given element
// (`as`, default <p>). The already-typed text renders normally and the remaining
// text renders hidden (but still occupying space) right after it — so the full
// layout is reserved up front and the typed text stays in natural flow (no absolute
// positioning, no misalignment).
const TypingText = ({ text, as: Tag = 'p', speed, className, style }) => {
  const [ref, typed] = useTypeOnVisible(text, speed);
  const rest = text ? text.slice(typed.length) : '';
  return (
    <Tag ref={ref} className={className} style={style}>
      {typed}
      <span aria-hidden="true" style={{ visibility: 'hidden' }}>{rest}</span>
    </Tag>
  );
};

export default TypingText;
