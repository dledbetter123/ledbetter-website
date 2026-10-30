// frontend/src/components/MainPage/MainPage.js

import React, { useRef, useEffect, useState} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import IntroPage from '../IntroPage/IntroPage';
import Carousel from '../SwipeableGridPage/Carousel';
import AboutPage from '../AboutPage/AboutPage';
import ContactPage from '../ContactPage/ContactPage';
import ProjectCard from '../ProjectCard/ProjectCard';
import PublicationCard from '../PublicationCard/PublicationCard';
import NavBar from '../NavBar/NavBar'; // Adjust the import path as necessary
import ChatWidget from '../ChatWidget/ChatWidget';
import GlyphWall from '../GlyphWall/GlyphWall';
import projects from '../../data/projects';
import "../MainPage/MainPage.css"

const MainPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
  // A project page's "back" link returns to /#portfolio; land on the cards, not the intro.
  useEffect(() => {
    if (location.hash === '#portfolio') portfolioRef.current?.scrollIntoView();
  }, [location.hash]);

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

  // Project cards come from data/projects.js; each opens its own chat page.
  const carouselItems = projects.map((project) => ({
    content: <ProjectCard project={project} />,
  }));

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
