// The thesis section of /projects/thesis: abstract, contributions, and figures, between
// the page header and the chat. Content lives in data/thesis.js.
import React from 'react';
import thesis from '../../data/thesis';

const ThesisDetail = () => (
  <div className="thesisDetail">
    <section className="thesisBlock">
      <p className="thesisMeta">{thesis.degree} · {thesis.advisor}</p>
      <h2 className="thesisTitle">{thesis.title}</h2>
    </section>

    <section className="thesisBlock">
      <h2>Abstract</h2>
      {thesis.abstract.map((para, i) => <p key={i}>{para}</p>)}
    </section>

    <section className="thesisBlock">
      <h2>Contributions</h2>
      <ol className="thesisContribs">
        {thesis.contributions.map((c) => (
          <li key={c.title}>
            <h3>{c.title}</h3>
            <p>{c.summary}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className="thesisBlock">
      <h2>Figures</h2>
      <div className="thesisFigures">
        {thesis.figures.map((f, i) => (
          <figure key={f.src} className="thesisFigure">
            {/* Figures are dense print layouts; tapping opens the full-size vector. */}
            <a href={f.src} target="_blank" rel="noopener noreferrer" aria-label={`Open figure ${i + 1} full size`}>
              <img src={f.src} alt={f.title} loading="lazy" />
            </a>
            <figcaption>
              <strong>Figure {i + 1}. {f.title}.</strong> {f.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>

    <h2 className="thesisChatHeading">Ask LedbetterLM about the thesis</h2>
  </div>
);

export default ThesisDetail;
