// src/components/AboutPage/AboutPage.js
import React from 'react';
import './AboutPage.css';
import TypingText from '../TypingText/TypingText';

// About *me* — pulled from my résumé and projects, with section headings to guide
// reading. (The two carousels above cover the projects/publications interactively.)
const AboutPage = () => {
  return (
    <div className="aboutPage">
      <div className="content">
        <TypingText as="h1" speed={40} text="About Me" />
        <TypingText text="I'm a machine learning and full-stack software engineer at Apple, with BS and MS degrees in Computer Science (AI/ML) from UMBC. I like building systems that reason — agents, models, and the infrastructure that makes them dependable — and I split my time between shipping production software and applied-math research." />

        <TypingText as="h2" speed={40} text="Now — Apple" />
        <TypingText text="At Apple I build agentic AI systems. I designed a self-healing coding agent that orchestrates a frontier model alongside a smaller local one for cost-efficient tool calling, framed code exploration as a partially observable decision process so it reacts to real divergences instead of noise, and built the async backend that collects results across 100,000+ devices. Along the way I replaced a heavyweight task queue with an in-house distributed one and cut the resource footprint of cloud-native services by 50–75%." />

        <TypingText as="h2" speed={40} text="Research" />
        <TypingText text="As a researcher in UMBC's Ebiquity Lab I work where machine learning meets systems: an application-transparent eBPF kernel probe for monitoring distributed systems, a graph attention pooling framework to extend dependency length in language models, and distillation work that cut latency for agents talking to autonomous drones by roughly 97%. My thesis tackles host intrusion detection from system-call data using graph state-space models." />
        <TypingText text="On the applied-math side I study the geometry of transformers — reframing attention as transport on a learned manifold in the search for more efficient generative architectures. It's exploratory work, but it surfaced a performant, drop-in curvature-based positional encoding that I think is a promising direction worth further study. Some of this has made it into publications, including an IEEE 2025 paper on an agentic approach to resolving conflicts in collaborative networks." />

        <TypingText as="h2" speed={40} text="Background" />
        <TypingText text="Before Apple I interned at Cisco Meraki — building dashboard policy-management features with React/Redux and Ruby on Rails — and at Northrop Grumman Space, writing satellite operating-system software in C++ with an agile team. I earned my BS (December 2023, 3.75 GPA) and MS (December 2024) in Computer Science from UMBC, where I was a Meyerhoff Scholar, UMBC Cyber Scholar, and GEM Fellow." />

        <TypingText as="h2" speed={40} text="How I work" />
        <TypingText text="I'm happiest where research curiosity meets shipping discipline — prototyping a bold idea, then doing the unglamorous work to make it correct, fast, and maintainable. Browse the projects and publications above, and feel free to ask LedbetterGPT — my agentic AI likeness in the corner — anything about my work." />
      </div>
    </div>
  );
};

export default AboutPage;
