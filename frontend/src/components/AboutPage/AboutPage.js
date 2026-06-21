// src/components/AboutPage/AboutPage.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './AboutPage.css';
import TypingText from '../TypingText/TypingText';

// About *me* — résumé/projects, with section headings. The reveal is orchestrated:
// headings type in (slower, and concurrently if several scroll in together), while the
// body paragraphs shimmer-decode one at a time in the order they became visible, each
// only after its own heading has finished typing.
const HEADING_SPEED = 75; // ms/char — deliberately slower than the bodies' decode

const CONTENT = [
  { key: 'h0', type: 'heading', tag: 'h1', sec: 0, text: 'About Me' },
  {
    key: 'b0', type: 'body', sec: 0,
    text:
      "I'm a machine learning and full-stack software engineer at Apple, with BS and MS degrees in Computer Science (AI/ML) from UMBC. I like building systems that reason: agents, models, and the infrastructure that makes them dependable. My time splits between shipping production software and applied-math research.",
  },
  { key: 'h1', type: 'heading', tag: 'h2', sec: 1, text: 'At Apple' },
  {
    key: 'b1', type: 'body', sec: 1,
    text:
      'At Apple I build agentic AI systems. I designed a self-healing coding agent that orchestrates a frontier model alongside a smaller local one for cost-efficient tool calling.',
  },
  { key: 'h2', type: 'heading', tag: 'h2', sec: 2, text: 'Research' },
  {
    key: 'b2', type: 'body', sec: 2,
    text:
      "As a researcher in UMBC's Ebiquity Lab I work where machine learning meets systems: an application-transparent eBPF kernel probe for monitoring distributed systems, a graph attention pooling framework to extend dependency length in language models, and distillation work that cut latency for agents talking to autonomous drones by roughly 97 percent. My thesis tackles host intrusion detection from system-call data using graph state-space models.",
  },
  {
    key: 'b3', type: 'body', sec: 2,
    text:
      "On the applied-math side I study the geometry of transformers, reframing attention as transport on a learned manifold in the search for more efficient generative architectures. It's exploratory work, but it surfaced a performant, drop-in curvature-based positional encoding that I think is a promising direction worth further study. Some of this has made it into publications, including an IEEE 2025 paper on an agentic approach to resolving conflicts in collaborative networks.",
  },
  { key: 'h3', type: 'heading', tag: 'h2', sec: 3, text: 'Background' },
  {
    key: 'b4', type: 'body', sec: 3,
    text:
      'Before Apple I interned at Cisco Meraki, building dashboard policy-management features with React/Redux and Ruby on Rails, and at Northrop Grumman Space, writing satellite operating-system software in C++ with an agile team. I earned my BS (December 2023, 3.75 GPA) and MS (December 2024) in Computer Science from UMBC, where I was a Meyerhoff Scholar, UMBC Cyber Scholar, and GEM Fellow.',
  },
  { key: 'h4', type: 'heading', tag: 'h2', sec: 4, text: 'How I work' },
  {
    key: 'b5', type: 'body', sec: 4,
    text:
      "I'm happiest where research curiosity meets shipping discipline: prototyping a bold idea, then doing the unglamorous work to make it correct, fast, and maintainable. Browse the projects and publications above, and feel free to ask LedbetterLM, my agentic AI likeness in the corner, anything about my work.",
  },
];

const byKey = Object.fromEntries(CONTENT.map((i) => [i.key, i]));

const AboutPage = () => {
  const itemRefs = useRef({});
  const [started, setStarted] = useState({}); // key -> bool (animation released)
  const headingDone = useRef({}); // sec -> bool
  const queue = useRef([]); // body keys, in the order they became visible
  const active = useRef(null); // body key currently decoding
  const seen = useRef({}); // key -> already observed

  const startItem = useCallback((key) => {
    setStarted((s) => (s[key] ? s : { ...s, [key]: true }));
  }, []);

  // Release the next queued body, but only once its heading has typed.
  const pump = useCallback(() => {
    if (active.current) return;
    const nextKey = queue.current[0];
    if (!nextKey) return;
    if (!headingDone.current[byKey[nextKey].sec]) return;
    active.current = nextKey;
    startItem(nextKey);
  }, [startItem]);

  const handleVisible = useCallback(
    (item) => {
      if (seen.current[item.key]) return;
      seen.current[item.key] = true;
      if (item.type === 'heading') {
        startItem(item.key); // headings type right away (concurrent)
      } else {
        queue.current.push(item.key); // bodies wait their turn
        pump();
      }
    },
    [startItem, pump]
  );

  const handleDone = useCallback(
    (item) => {
      if (item.type === 'heading') {
        headingDone.current[item.sec] = true;
        pump();
      } else {
        active.current = null;
        queue.current = queue.current.filter((k) => k !== item.key);
        pump();
      }
    },
    [pump]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          .forEach((e) => {
            const item = byKey[e.target.dataset.key];
            if (item) handleVisible(item);
            observer.unobserve(e.target);
          });
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' }
    );
    Object.values(itemRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [handleVisible]);

  return (
    <div className="aboutPage">
      <div className="content">
        {CONTENT.map((item) => (
          <div
            key={item.key}
            data-key={item.key}
            ref={(el) => {
              itemRefs.current[item.key] = el;
            }}
          >
            <TypingText
              as={item.tag || 'p'}
              effect={item.type === 'heading' ? 'type' : 'scramble'}
              speed={item.type === 'heading' ? HEADING_SPEED : undefined}
              text={item.text}
              start={!!started[item.key]}
              onDone={() => handleDone(item)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default AboutPage;
