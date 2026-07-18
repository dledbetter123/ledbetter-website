// frontend/src/components/MainPage/MainPage.js

import React, { useRef, useEffect, useState} from 'react';
import { useNavigate } from 'react-router-dom';
import IntroPage from '../IntroPage/IntroPage';
import Carousel from '../SwipeableGridPage/Carousel';
import AboutPage from '../AboutPage/AboutPage';
import ContactPage from '../ContactPage/ContactPage';
import ProjectCard from '../ProjectCard/ProjectCard';
import PublicationCard from '../PublicationCard/PublicationCard';
import NavBar from '../NavBar/NavBar'; // Adjust the import path as necessary
import ChatWidget from '../ChatWidget/ChatWidget';
import heroImg from '../IntroPage/images/hero.jpg';
import "../MainPage/MainPage.css"

const MainPage = () => {
  const navigate = useNavigate();
  const [isNavbarOpen, setIsNavbarOpen] = useState(false);
  const homeRef = useRef(null);
  const aboutRef = useRef(null);
  const contactRef = useRef(null);
  const portfolioRef = useRef(null);
  const carouselRef = useRef(null);
  const pubCarouselRef = useRef(null);

  const navBarRef = useRef(null);

  const closeNavBar = () => setIsNavbarOpen(false);

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navBarRef.current && !navBarRef.current.contains(event.target)) {
        closeNavBar();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Wire horizontal-wheel scrolling to each carousel's own container/ref.
    const pairs = [
      { el: document.querySelector('.carousel-style'), ref: carouselRef },
      { el: document.querySelector('.pub-carousel-style'), ref: pubCarouselRef },
    ];
    const cleanups = [];
    pairs.forEach(({ el, ref }) => {
      if (!el) return;
      const handleWheel = (e) => {
        if (ref.current) ref.current.handleWheel(e);
      };
      el.addEventListener('wheel', handleWheel, { passive: false });
      cleanups.push(() => el.removeEventListener('wheel', handleWheel));
    });
    return () => cleanups.forEach((c) => c());
  }, []);

  useEffect(() => {
    // Global arrow keys route to the MOST VISIBLE carousel, so keys "just work"
    // without focusing anything — but only one carousel moves per press (a
    // per-instance window listener used to advance both at once).
    const handleArrowKeys = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const t = e.target;
      // Don't steal arrows from typing surfaces (chat input) — and a focused
      // carousel already handles its own keys via the container's onKeyDown.
      if (t instanceof Element) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
        if (t.closest('.carousel-container')) return;
      }
      const pairs = [
        { el: document.querySelector('.carousel-style'), ref: carouselRef },
        { el: document.querySelector('.pub-carousel-style'), ref: pubCarouselRef },
      ];
      let best = null;
      let bestVisible = 0;
      pairs.forEach(({ el, ref }) => {
        if (!el || !ref.current) return;
        const r = el.getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        if (visible > bestVisible) {
          bestVisible = visible;
          best = ref;
        }
      });
      if (!best || bestVisible <= 0) return;
      e.preventDefault();
      if (e.key === 'ArrowRight') best.current.goToNext();
      else best.current.goToPrev();
    };
    window.addEventListener('keydown', handleArrowKeys);
    return () => window.removeEventListener('keydown', handleArrowKeys);
  }, []);
  // Other scroll functions...

  // Project descriptions are served directly from each repo's README_portfolio.md
  // on GitHub (see ProjectCard). MainPage only needs the title and the repo URL.
  const CharProjectDetails = {
    title: "Character Aware Neural Language Model",
    githubUrl: "https://github.com/dledbetter123/Grad-Assessment",
  };

  const KernelProjectDetails = {
    title: "Kernel Mailbox Simulation",
    githubUrl: "https://github.com/dledbetter123/kernel-bst",
  };

  const StockProjectDetails = {
    title: "Algorithmic Trading Companion",
    githubUrl: "https://github.com/dledbetter123/trade-companion",
  };

  const NSBEProjectDetails = {
    title: "NSBE Chapter Website",
    githubUrl: "https://github.com/dledbetter123/nsbe-website",
  };

  const LedbetterProjectDetails = {
    title: "This Website!",
    githubUrl: "https://github.com/dledbetter123/ledbetter-website",
    description:
      "The site you're on, and the AI you're talking to. It's a fully serverless AWS build: a React front end on S3 behind CloudFront, with one Go Lambda behind API Gateway powering LedbetterLM, my AI librarian, grounded on a knowledge base I maintain. It runs a two-model design — a fast, cheap worker model (Cloudflare Workers AI, with Gemini as a warm-start fallback) carries the conversation, and when you ask something that needs real code it hands off to a \"cataloguer\": an agentic pass that explores my GitHub repos live, compiles the actual code into context, and hands it back so answers are grounded, not guessed (you'll watch the handoff happen). Every message is decoupled onto an SQS FIFO queue and processed by an async worker that durably logs the turn and threads a notification — idempotent and strictly ordered per conversation. Ask LedbetterLM below how any of it works →",
  };

  // Proprietary Apple work — no public repo, so the card carries its own description and
  // isn't clickable (it points readers to LedbetterLM for the high-level story).
  const SelfHealProjectDetails = {
    title: "Self-Healing Coding Agent (Apple)",
    description:
      "My flagship project at Apple, on the Release Validation team: an agentic system that automatically repairs code. I built a custom in-house harness (built on LangGraph) that orchestrates a frontier model — Anthropic Claude — for the repair reasoning alongside a local Qwen model that handles tool calling to cut token costs, and I modeled code exploration as a partially observable Markov decision process so it acts on true divergences and ignores false error reports. Around it I built an in-house distributed task queue (replacing Celery) with IPC, state management, and episode tracking, an async probe manager that feeds live metrics into the agent without latency, and a RAG pipeline that marshals those metrics into the model's context. It's proprietary Apple work, so there's no public repo — ask LedbetterLM below for the high-level story →",
  };

  // LEO is my personal project (private repos, no public README to fetch), so this card
  // carries its own description and links to the live product.
  const LeoProjectDetails = {
    title: "LEO — In-Browser AI Coding Tutor",
    url: "https://learnwleo.com",
    description:
      "A browser-native learn-to-code platform I built, where students learn to code and prep for tech interviews with all code running on-device in WebAssembly at zero marginal cost. I built the AI layer end to end: an in-browser LLM tutor (WebNN/WebGPU), the learning-data instrumentation behind it, and an adaptive ELO that scores real skill from every attempt. Ask LedbetterLM below to go deeper →",
  };

  // SGST & Finsler carry inline descriptions (not the repo's README excerpt) so
  // they can point readers to LedbetterLM, which reads the full public repos
  // live and can go far deeper than the short public excerpt. Click still opens
  // the repo.
  const SgstProjectDetails = {
    title: "Sparse Geometric Signal Transport",
    githubUrl: "https://github.com/dledbetter123/SparseGeometricSignalTransport",
    description:
      "A geometric theory of the transformer: attention as parallel transport on a fiber bundle, not an O(T²) tax, with tokens as sparse Fourier constellations. It never beat GPT outright, but it surfaced a performant, drop-in curvature-based positional encoding worth further study. The repo shows only an excerpt; ask LedbetterLM below for the full story →",
  };

  const FinslerProjectDetails = {
    title: "The Finsler Transformer",
    githubUrl: "https://github.com/dledbetter123/LedbetterFinslerTransformer",
    description:
      "What if attention isn't computed, but a curvature you move through? The Finsler Transformer swaps O(T²) attention for geodesic flow on a learned manifold, where a sentence is a geodesic and meaning is holonomy, aiming at O(T) generation grounded in differential geometry. The repo shows only an excerpt; ask LedbetterLM below for the full story →",
  };

  // Publications & presentations — not repo-backed, so these use PublicationCard.
  const ImpostorsPublication = {
    title: "Impostors Among Us (IEEE 2025)",
    citation:
      "Chukkapalli, S. S. L., Ledbetter, D., Joshi, A., Finin, T., & Freeman, J. (2025). Impostors Among Us: An Agentic Approach to Identifying and Resolving Conflicts in Collaborative Network Environments. IEEE.",
    url: "https://ieeexplore.ieee.org/abstract/document/11309858",
    footer: "Read on IEEE →",
  };

  const DronePublication = {
    title: "Autonomous Drone Navigation (URCAD 2022)",
    citation:
      "Ledbetter, D. (2022). Energy-Efficient Onboard Autonomous Drone Navigation (URCAD 2022 poster). We wrote a flight state-machine computer working in conjunction with an onboard camera and sensor data to give AI agentic decision-making at the edge.",
    url: "",
    footer: "URCAD 2022 · poster",
  };

  const carouselItems = [
    {
      content: (
        <ProjectCard
          title={LedbetterProjectDetails.title}
          githubUrl={LedbetterProjectDetails.githubUrl}
          description={LedbetterProjectDetails.description}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={SelfHealProjectDetails.title}
          description={SelfHealProjectDetails.description}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={LeoProjectDetails.title}
          linkUrl={LeoProjectDetails.url}
          description={LeoProjectDetails.description}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={SgstProjectDetails.title}
          githubUrl={SgstProjectDetails.githubUrl}
          description={SgstProjectDetails.description}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={FinslerProjectDetails.title}
          githubUrl={FinslerProjectDetails.githubUrl}
          description={FinslerProjectDetails.description}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={CharProjectDetails.title}
          githubUrl={CharProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={KernelProjectDetails.title}
          githubUrl={KernelProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={StockProjectDetails.title}
          githubUrl={StockProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={NSBEProjectDetails.title}
          githubUrl={NSBEProjectDetails.githubUrl}
        />
      )
    },
  ];

  // Publications get their own carousel, directly under the project (GitHub) cards.
  const publicationItems = [
    {
      content: (
        <PublicationCard
          title={ImpostorsPublication.title}
          citation={ImpostorsPublication.citation}
          url={ImpostorsPublication.url}
          footer={ImpostorsPublication.footer}
        />
      )
    },
    {
      content: (
        <PublicationCard
          title={DronePublication.title}
          citation={DronePublication.citation}
          url={DronePublication.url}
          footer={DronePublication.footer}
        />
      )
    },
  ];

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className='main-container'>
      {/* Single full-screen background layer behind the entire SPA (z-index 0). All
          content lives in .content-layer (an isolated stacking context at z-index 1)
          so the whole content tree is one solid layer above this image — no per-section
          z-index lifts, no seams for a heading to fall through. IntroPage drives this
          image's brightness/pan on scroll via document.querySelector('.profilePic'). */}
      {/* Full-bleed hero: the photo lays out edge-to-edge under iOS 26's translucent
          Liquid Glass bars (via viewport-fit=cover + the overscan in .profilePic), so
          it fills the whole screen and shows through the floating search pill / behind
          the status bar — no black bars, no seam. We deliberately do NOT add a vignette
          or solid-color tint strips here: <body> is black, and since Safari 26 samples
          only a solid background-color (never the hero <img>), the floating pill tints
          to a dark translucent glass over the photo on its own. */}
      <img src={heroImg} alt="" aria-hidden="true" className="profilePic" />
      <NavBar
        ref={navBarRef}
        isOpen={isNavbarOpen}
        setIsNavbarOpen={setIsNavbarOpen}
        onHomeClick={() => scrollToSection(homeRef)}
        onAboutClick={() => scrollToSection(aboutRef)}
        onPortfolioClick={() => scrollToSection(portfolioRef)}
        onContactClick={() => scrollToSection(contactRef)}
        onInboxClick={() => { closeNavBar(); navigate('/inbox'); }}
      />
      <button className="menuIcon" onClick={() => setIsNavbarOpen(!isNavbarOpen)}>
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </button>
      <div className="content-layer">
        <div ref={homeRef}><IntroPage /></div>
        <div ref={portfolioRef} className='carousel-style'>
          <h3 className='carousel-heading'>Personal Projects &amp; Research</h3>
          <Carousel ref={carouselRef} items={carouselItems} />
        </div>
        <div className='pub-carousel-style'>
          <h3 className='carousel-heading'>Publications &amp; Presentations</h3>
          <Carousel ref={pubCarouselRef} items={publicationItems} />
        </div>
        <div ref={aboutRef}><AboutPage /></div>
        <div ref={contactRef}><ContactPage /></div>
      </div>
      <ChatWidget />
    </div>
  );
};

export default MainPage;
