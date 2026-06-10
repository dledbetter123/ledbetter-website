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
    {
      content: (
        <ProjectCard
          title={LedbetterProjectDetails.title}
          githubUrl={LedbetterProjectDetails.githubUrl}
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
      <div ref={homeRef}><IntroPage /></div>
      <div ref={portfolioRef} className='carousel-style'>
        <Carousel ref={carouselRef} items={carouselItems} />
      </div>
      <div className='pub-carousel-style'>
        <h3 className='pub-carousel-heading'>Publications &amp; Presentations</h3>
        <Carousel ref={pubCarouselRef} items={publicationItems} />
      </div>
      <div ref={aboutRef}><AboutPage /></div>
      <div ref={contactRef}><ContactPage /></div>
      <ChatWidget />
    </div>
  );
};

export default MainPage;
