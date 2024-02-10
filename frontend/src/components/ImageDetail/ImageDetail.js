// src/components/ImageDetail/ImageDetail.js
import React from 'react';
import { useParams } from 'react-router-dom';

const ImageDetail = () => {
  const { imageName } = useParams(); // Extract the image name from the URL

  // Construct the path to the image file based on imageName
  const imagePath = `src/components/GridPage/images/${imageName}.jpg`;

  return (
    <div>
      <h1>Image Detail for {imageName}</h1>
      <img src={imagePath} alt={imageName} />
      {/* You can also fetch and display more details about the image here */}
    </div>
  );
};

export default ImageDetail;
