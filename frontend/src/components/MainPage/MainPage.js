// frontend/src/components/MainPage/MainPage.js

import React, { useRef, useEffect, useState} from 'react';
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
  };

  // LILO is an active startup with private repos, so this card carries its own
  // description (no public README to fetch) and links to the live product.
  const LiloProjectDetails = {
    title: "LinkedInOrLeftOut (LILO)",
    url: "https://learnwleo.com",
    description:
      "A browser-native platform that teaches students to code and crush tech interviews — every runtime executes on-device in WebAssembly at zero marginal cost. As co-founder and Chief AI Officer I built the AI layer: a quantized LLM tutor running entirely in the browser over WebNN/WebGPU (real-time hints, no server inference, no code ever leaving the device), plus the data-instrumentation pipeline that traces how every student moves through every problem. Where compute must leave the device, I tier it onto Cloudflare Workers AI at the edge instead of a centralized GPU box — keeping AI tutoring as close to free-to-serve as the code execution it sits on.",
  };

  const SgstProjectDetails = {
    title: "Sparse Geometric Signal Transport",
    githubUrl: "https://github.com/dledbetter123/SparseGeometricSignalTransport",
  };

  const FinslerProjectDetails = {
    title: "The Finsler Transformer",
    githubUrl: "https://github.com/dledbetter123/LedbetterFinslerTransformer",
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
          title={LiloProjectDetails.title}
          linkUrl={LiloProjectDetails.url}
          description={LiloProjectDetails.description}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={LedbetterProjectDetails.title}
          githubUrl={LedbetterProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={SgstProjectDetails.title}
          githubUrl={SgstProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={FinslerProjectDetails.title}
          githubUrl={FinslerProjectDetails.githubUrl}
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
