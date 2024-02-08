// src/NavBar/NavBar.js
import React from 'react';
import './NavBar.css';

const NavBar = ({ onHomeClick, onAboutClick, onPortfolioClick, onContactClick }) => {

  return (
    <nav className="navbar">
      <ul>
        <li><button onClick={onHomeClick}>&nbsp;&nbsp;&nbsp;&nbsp;Home</button></li>
        <li><button onClick={onAboutClick}>&nbsp;&nbsp;&nbsp;&nbsp;About</button></li>
        <li><button onClick={onPortfolioClick}>&nbsp;&nbsp;&nbsp;&nbsp;Portfolio</button></li>
        <li><button onClick={onContactClick}>&nbsp;&nbsp;&nbsp;&nbsp;Contact</button></li>
      </ul>
    </nav>
  );
};

export default NavBar;
