import React, { useRef, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar/NavBar';
import './App.css';
import MainPage from './components/MainPage/MainPage'; // Assuming MainPage is now a component
import InboxPage from './components/InboxPage/InboxPage';
import ProjectPage from './components/ProjectPage/ProjectPage';

const App = () => {
  const [isNavbarOpen, setIsNavbarOpen] = useState(false);
  const navBarRef = useRef(null);
  const mainPageRef = useRef(null);

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

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainPage ref={mainPageRef} />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/projects/:slug" element={<ProjectPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
