// src/App.js
import React, { useRef, useState, useEffect } from 'react';
import NavBar from './components/NavBar/NavBar'; // Adjust the path based on your project structure
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import NameTag from './components/NameTag/NameTag'; // Import the NameTag component
import IntroPage from './components/IntroPage/IntroPage';
import GridPage from './components/GridPage/GridPage'; // Import the GridPage component
import ImageDetail from './components/ImageDetail/ImageDetail'; // Component for displaying image details
import AboutPage from './components/AboutPage/AboutPage';
import ContactPage from './components/ContactPage/ContactPage';
import './App.css';
// Import other pages/components as needed

const App = () => {

  const homeRef = useRef(null);
  const aboutRef = useRef(null);
  const gridPageRef = useRef(null);
  const contactRef = useRef(null);
  const [isNavbarOpen, setIsNavbarOpen] = useState(false);

  const navbarRef = useRef(null);
  const menuIconRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (navbarRef.current && !navbarRef.current.contains(event.target)) &&
        (menuIconRef.current && !menuIconRef.current.contains(event.target))
      ) {
        setIsNavbarOpen(false);
      }
    };
  
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);  

  const toggleNavbar = () => {
    setIsNavbarOpen(!isNavbarOpen);
  };

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Router>
      <div className="appContainer">
        <button ref={menuIconRef} className="menuIcon" onClick={toggleNavbar}>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
          </button>
          {(
            <NavBar
              ref={navbarRef}
              isOpen={isNavbarOpen}
              onHomeClick={() => {
                scrollToSection(homeRef);
                setIsNavbarOpen(false);
              }}
              onAboutClick={() => {
                scrollToSection(aboutRef);
                setIsNavbarOpen(false);
              }}
              onPortfolioClick={() => {
                scrollToSection(gridPageRef);
                setIsNavbarOpen(false);
              }}
              onContactClick={() => {
                scrollToSection(contactRef);
                setIsNavbarOpen(false);
              }}
            />
          )}
        <NameTag onClick={() => scrollToSection(contactRef)} />
        <div className="mainContent">
          <div ref={homeRef}><IntroPage /></div>
          <div ref={gridPageRef}><GridPage /></div>
          <div ref={aboutRef}><AboutPage /></div>
          <div ref={contactRef}><ContactPage /></div>
          <Routes>
            <Route path="/image/:imageName" element={<ImageDetail />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;
