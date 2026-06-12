import React from 'react';
import useTypeOnVisible from '../../hooks/useTypeOnVisible';
import useScrambleOnVisible from '../../hooks/useScrambleOnVisible';

// Renders `text` with a visibility-triggered effect:
//   effect="type"     -> typewriter (default)
//   effect="scramble" -> decode shimmer (Greek/Arabic glyphs settling to the text)
// Layout is reserved up front so surrounding content doesn't jump. Pass `start` (boolean)
// to drive the animation externally instead of on visibility, and `onDone` to be notified
// when it finishes — used by AboutPage to sequence headings then bodies.
const TypingText = ({ text, as: Tag = 'p', speed, effect = 'type', className, style, start, onDone }) => {
  const scramble = effect === 'scramble';
  // Only the active effect reports completion (both hooks run, but one is displayed).
  const [typeRef, typed] = useTypeOnVisible(text, speed, { start, onDone: scramble ? undefined : onDone });
  const [scrambleRef, scrambled] = useScrambleOnVisible(text, 1500, 0, { start, onDone: scramble ? onDone : undefined });

  const ref = scramble ? scrambleRef : typeRef;
  const display = scramble ? scrambled : typed;

  if (scramble) {
    // bidi-override keeps the RTL Arabic glyphs in place while shimmering.
    return (
      <Tag ref={ref} className={className} style={{ unicodeBidi: 'bidi-override', direction: 'ltr', ...style }}>
        {display !== '' ? display : <span aria-hidden="true" style={{ visibility: 'hidden' }}>{text}</span>}
      </Tag>
    );
  }

  const rest = text ? text.slice(display.length) : '';
  return (
    <Tag ref={ref} className={className} style={style}>
      {display}
      <span aria-hidden="true" style={{ visibility: 'hidden' }}>{rest}</span>
    </Tag>
  );
};

export default TypingText;
