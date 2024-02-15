// src/GridPage/GridPage.js

import React from 'react';
import { Link } from 'react-router-dom';
import './GridPage.css';

const GridPage = () => {
  const imageNames = ['bst', 'char', 'crazyflie', 'dog_logo', 'hack', 'nsbe', 'ohlc', 'walker'];

  // dynamically import images based on the image name
  const importImage = imageName => {
    try {
      return require(`./images/${imageName}.jpeg`);
    } catch (err) {
      console.error("Failed to load image:", imageName);
      return null;
    }
  };


  return (
    <div className="grid-container"> {/* Centering container */}
      <div className="grid">
        {imageNames.map((imageName, index) => (
            <Link key={index} to={`/images/${imageName}`}>
                <div className="grid-item">
                <img src={importImage(imageName)} alt={imageName} />
                </div>
            </Link>
        ))}
      </div>
    </div>
  );
};

export default GridPage;
