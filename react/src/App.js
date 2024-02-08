// src/App.js
import React, { useRef } from 'react';
import NavBar from './components/NavBar/NavBar'; // Adjust the path based on your project structure
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import NameTag from './components/NameTag/NameTag'; // Import the NameTag component
import IntroPage from './components/IntroPage/IntroPage';
import GridPage from './components/GridPage/GridPage'; // Import the GridPage component
import ImageDetail from './components/ImageDetail/ImageDetail'; // Component for displaying image details
import AboutPage from './components/AboutPage/AboutPage';
import ContactPage from './components/ContactPage/ContactPage';
// Import other pages/components as needed

const App = () => {

  const homeRef = useRef(null);
  const aboutRef = useRef(null);
  const gridPageRef = useRef(null);
  const contactRef = useRef(null);

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };


  return (
    <Router>
      <div className="appContainer">
        <NavBar onHomeClick={() => scrollToSection(homeRef)}
                onAboutClick={() => scrollToSection(aboutRef)}
                onPortfolioClick={() => scrollToSection(gridPageRef)}
                onContactClick={() => scrollToSection(contactRef)} />
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
