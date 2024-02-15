// src/NavBar/NavBar.js
import React from 'react';
import './NavBar.css';

// Wrap your component with React.forwardRef to forward refs to it
const NavBar = React.forwardRef(({ isOpen, onHomeClick, onAboutClick, onPortfolioClick, onContactClick }, ref) => {
  return (
    // Attach the forwarded ref to the nav element
    <nav ref={ref} className={`navbar ${isOpen ? 'open' : ''}`}>
      <ul>
        <li><button onClick={onHomeClick}>Home</button></li>
        <li><button onClick={onAboutClick}>About</button></li>
        <li><button onClick={onPortfolioClick}>Portfolio</button></li>
        <li><button onClick={onContactClick}>Contact</button></li>
      </ul>
    </nav>
  );
});

export default NavBar;

