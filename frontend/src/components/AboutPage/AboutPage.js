// src/components/AboutPage/AboutPage.js
import React from 'react';
import './AboutPage.css'; // Make sure to create and style your AboutPage similarly to IntroPage

const AboutPage = () => {
  return (
    <div className="aboutPage">
      <div className="content">
        <h1>About This Portfolio</h1>
        <p>
          This portfolio showcases my journey and capabilities as a software engineer, with a focus on web development, DevOps, and machine learning. Built with an intention to demonstrate my technical skills, the site is powered by a combination of cutting-edge technologies.
        </p>
        <h2>Frontend Development</h2>
        <p>
          The frontend is crafted using React, creating a single-page application (SPA) that offers a seamless user experience. State management is handled elegantly with Redux, ensuring efficient data flow and reactivity across components. For styling, CSS modules are employed to encapsulate styles, promoting a modular and maintainable codebase.
        </p>
        <h2>Backend Services</h2>
        <p>
          At the heart of the backend is Go, chosen for its simplicity and performance. The Go server handles API requests, serving data to the frontend and interacting with machine learning models. It's containerized using Docker, which simplifies deployment and ensures consistency across development and production environments.
        </p>
        <h2>Machine Learning Models</h2>
        <p>
          A significant feature of this portfolio is the integration of example machine learning models. These models, built using Python and TensorFlow, illustrate my capability to develop and deploy AI solutions. Through the Go backend, the models are accessible via API endpoints, demonstrating a practical application of ML in web environments.
        </p>
        <h2>Deployment and DevOps</h2>
        <p>
          Embracing DevOps practices, the application is containerized with Docker, facilitating easy deployment and scaling. Continuous integration and delivery (CI/CD) pipelines automate the testing and deployment process, ensuring that new updates are seamlessly rolled out with minimal downtime.
        </p>
        <p>
          This portfolio is not just a showcase of my projects but also a testament to my ability to integrate various technologies into a cohesive, fully-functional application. From frontend to backend, and the deployment process, each aspect has been carefully crafted to demonstrate best practices and my commitment to quality software development.
        </p>
      </div>
    </div>
  );
};

export default AboutPage;
