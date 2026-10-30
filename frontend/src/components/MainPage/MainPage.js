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
import GlyphWall from '../GlyphWall/GlyphWall';
import { publishHandle, revokeHandle } from '../../webmcp/siteBridge';
import { installWebMCPTools } from '../../webmcp/tools';
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
      "The site you're on, and the AI you're talking to. It's serverless AWS: React on S3 behind CloudFront, and one Go Lambda running LedbetterLM, my AI librarian. A fast model chats, and code questions go to an agent that reads my GitHub repos live. Ask it how it works below →",
  };

  // Proprietary Apple work — no public repo, so the card carries its own description and
  // isn't clickable (it points readers to LedbetterLM for the high-level story).
  const SelfHealProjectDetails = {
    title: "Self-Healing Coding Agent (Apple)",
    description:
      "My flagship project at Apple, on Release Validation: an agent that repairs code on its own. Claude does the repair reasoning, a local Gemma 4 model handles tool calls to cut token cost, and an in-house harness and task queue run it all. It's proprietary, so ask LedbetterLM below →",
  };

  // Pathion is my personal project (private repos, no public README to fetch), so this card
  // carries its own description and links to the live product.
  const LeoProjectDetails = {
    title: "Pathion — In-Browser AI Coding Tutor",
    url: "https://pathion.dev",
    description:
      "A learn-to-code and interview-prep platform where all code runs on-device in WebAssembly. I built the AI layer end to end: an in-browser LLM tutor (WebNN/WebGPU), the learning-data pipeline, and an adaptive Elo that rates skill from every attempt. Ask LedbetterLM below →",
  };

  // SGST & Finsler carry inline descriptions (not the repo's README excerpt) so
  // the card reads as a research summary rather than a README dump. Both repos
  // are public and ungated — LedbetterLM reads their real code live, and a click
  // still opens the repo.
  const SgstProjectDetails = {
    title: "Sparse Geometric Signal Transport",
    githubUrl: "https://github.com/dledbetter123/SparseGeometricSignalTransport",
    description:
      "A geometric theory of the transformer: attention as parallel transport on a fiber bundle, with tokens as sparse Fourier constellations. It never beat GPT outright, but it produced a drop-in, curvature-based positional encoding worth more study. Open the repo, or ask LedbetterLM below →",
  };

  const FinslerProjectDetails = {
    title: "The Finsler Transformer",
    githubUrl: "https://github.com/dledbetter123/LedbetterFinslerTransformer",
    description:
      "What if attention isn't computed, but a curvature you move through? The Finsler Transformer swaps O(T²) attention for geodesic flow on a learned manifold, where a sentence is a geodesic, aiming at O(T) generation. Open the repo, or ask LedbetterLM below →",
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

  // Ordered exactly as the carousel renders them. The cards are MAPPED from this
  // list rather than written out one by one, so the WebMCP layer's "card N" and the
  // carousel's card N can never drift apart (src/webmcp/tools.js -> show_project).
  const projectDetails = [
    LedbetterProjectDetails,
    SelfHealProjectDetails,
    LeoProjectDetails,
    SgstProjectDetails,
    FinslerProjectDetails,
    CharProjectDetails,
    KernelProjectDetails,
    StockProjectDetails,
    NSBEProjectDetails,
  ];

  const carouselItems = projectDetails.map((project) => ({
    content: (
      <ProjectCard
        title={project.title}
        githubUrl={project.githubUrl}
        linkUrl={project.url}
        description={project.description}
      />
    ),
  }));

  // Publications get their own carousel, directly under the project (GitHub) cards.
  const publicationDetails = [ImpostorsPublication, DronePublication];

  const publicationItems = publicationDetails.map((publication) => ({
    content: (
      <PublicationCard
        title={publication.title}
        citation={publication.citation}
        url={publication.url}
        footer={publication.footer}
      />
    ),
  }));

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- WebMCP -------------------------------------------------------------
  // Publish the page's imperative handles, then register the site's tools on
  // document.modelContext. An AI agent gets named functions ("show_project",
  // "ask_ledbetterlm") instead of having to scrape the DOM and guess at click
  // targets — and because the tools drive the SAME refs the UI does, whatever
  // the agent does is visible on screen to the human sitting here.
  // No-op in browsers without WebMCP, which is currently all of them unless
  // Chrome is started with --enable-features=WebMCPTesting.
  useEffect(() => {
    const sections = () => ({
      home: homeRef.current,
      portfolio: portfolioRef.current,
      publications: document.querySelector('.pub-carousel-style'),
      about: aboutRef.current,
      contact: contactRef.current,
    });

    const cardAt = (ref, list) => {
      const index = ref.current?.getActiveIndex?.();
      if (index === undefined || index === null) return null;
      return { index, total: list.length, ...list[index] };
    };

    publishHandle('portfolio', {
      getProjects: () =>
        projectDetails.map((project, index) => ({
          index,
          title: project.title,
          link: project.url || project.githubUrl || null,
          description: project.description || '(card text is fetched live from the repo README)',
        })),

      getPublications: () =>
        publicationDetails.map((publication, index) => ({ index, ...publication })),

      showProject: (title) => {
        const needle = String(title).toLowerCase().trim();
        const index = projectDetails.findIndex((project) =>
          project.title.toLowerCase().includes(needle),
        );
        if (index === -1) {
          throw new Error(
            `No project matches "${title}". Known titles: ` +
              projectDetails.map((project) => project.title).join(', '),
          );
        }
        if (!carouselRef.current?.goToIndex(index)) {
          throw new Error('The project carousel is not mounted.');
        }
        portfolioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { index, total: projectDetails.length, title: projectDetails[index].title };
      },

      goToSection: (name) => {
        const el = sections()[name];
        if (!el) throw new Error(`Unknown section "${name}".`);
        el.scrollIntoView({ behavior: 'smooth' });
      },

      // Which section owns the most vertical pixels of the viewport right now.
      getSectionInView: () => {
        let best = null;
        let bestVisible = 0;
        Object.entries(sections()).forEach(([name, el]) => {
          if (!el) return;
          const r = el.getBoundingClientRect();
          const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
          if (visible > bestVisible) {
            bestVisible = visible;
            best = name;
          }
        });
        return best;
      },

      getActiveProject: () => cardAt(carouselRef, projectDetails),
      getActivePublication: () => cardAt(pubCarouselRef, publicationDetails),
    });

    const uninstall = installWebMCPTools();
    return () => {
      uninstall();
      revokeHandle('portfolio');
    };
    // Handles read live refs; the detail lists are static content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className='main-container'>
          {/* Single full-screen background layer behind the entire SPA (z-index 0): a
          faint wall of flipping green glyphs, swept by a shimmer on scroll. All
          content lives in .content-layer (an isolated stacking context at z-index 1)
          so the whole content tree is one solid layer above it. */}
      <GlyphWall />
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
