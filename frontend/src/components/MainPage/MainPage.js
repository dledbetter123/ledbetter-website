// frontend/src/components/MainPage/MainPage.js

import React, { useRef, useEffect, useState} from 'react';
import IntroPage from '../IntroPage/IntroPage';
import Carousel from '../SwipeableGridPage/Carousel';
import AboutPage from '../AboutPage/AboutPage';
import ContactPage from '../ContactPage/ContactPage';
import NameTag from '../NameTag/NameTag';
import ProjectCard from '../ProjectCard/ProjectCard';
import NavBar from '../NavBar/NavBar'; // Adjust the import path as necessary
import "../MainPage/MainPage.css"

const MainPage = () => {
  const [isNavbarOpen, setIsNavbarOpen] = useState(false);
  const homeRef = useRef(null);
  const aboutRef = useRef(null);
  const contactRef = useRef(null);
  const portfolioRef = useRef(null);
  const carouselRef = useRef(null);

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
    const handleWheel = (e) => {
      // Check if carouselRef.current is available and invoke handleWheel
      if (carouselRef.current) {
        carouselRef.current.handleWheel(e);
      }
    };

    const carouselContainer = document.querySelector('.carousel-style');
    if (carouselContainer) {
      carouselContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (carouselContainer) {
        carouselContainer.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);
  // Other scroll functions...

  const CharProjectDetails = {
    title: "Character Aware Neural Language Model",
    description: "This neural network combines the power of convolutional neural networks and transformers to embed and model language at the character level. The model achieved a 3% reduction in a confusion metric on models of the same size in the paper on which it was based.",
    githubUrl: "https://github.com/dledbetter123/Grad-Assessment",
  };

  const KernelProjectDetails = {
    title: "Kernel Mailbox Simulation",
    description: "Simulated kernel mailbox system in which nodes are configured in a binary search tree, and each node can manage a FIFO queue of messages.",
    githubUrl: "https://github.com/dledbetter123/kernel-bst",
  };

  const StockProjectDetails = {
    title: "Algorithmic Trading Companion",
    description: "Developed a hybrid transformer and sentiment analysis model using NumPy and PyTorch, my model used specialized encoding scheme to interpret market behavior and news headlines for improved predictions.",
    githubUrl: "https://github.com/dledbetter123/trade-companion",
  };

  const NSBEProjectDetails = {
    title: "NSBE Chapter Website",
    description: "Designing and developing the official website for our local NSBE chapter to enhance online presence and member engagement. This project involved creating a dynamic and responsive website that serves as a central hub for chapter news, events, and resources.",
    githubUrl: "https://github.com/dledbetter123/nsbe-website",
  };

  const LedbetterProjectDetails = {
    title: "This Website!",
    description: "Delve into the code and processes powering this website, including go backend, api integration, containerization, bash scripting etc. etc.",
    githubUrl: "https://github.com/dledbetter123/ledbetter-website",
  };

  const carouselItems = [
    {
      content: (
        <ProjectCard
          title={CharProjectDetails.title}
          description={CharProjectDetails.description}
          githubUrl={CharProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={KernelProjectDetails.title}
          description={KernelProjectDetails.description}
          githubUrl={KernelProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={StockProjectDetails.title}
          description={StockProjectDetails.description}
          githubUrl={StockProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={NSBEProjectDetails.title}
          description={NSBEProjectDetails.description}
          githubUrl={NSBEProjectDetails.githubUrl}
        />
      )
    },
    {
      content: (
        <ProjectCard
          title={LedbetterProjectDetails.title}
          description={LedbetterProjectDetails.description}
          githubUrl={LedbetterProjectDetails.githubUrl}
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
      <NameTag onClick={() => scrollToSection(homeRef)} />
      <div ref={homeRef}><IntroPage /></div>
      <div ref={portfolioRef} className='carousel-style'>
        <Carousel ref={carouselRef} items={carouselItems} />
      </div>
      <div ref={aboutRef}><AboutPage /></div>
      <div ref={contactRef}><ContactPage /></div>
    </div>
  );
};

export default MainPage;
