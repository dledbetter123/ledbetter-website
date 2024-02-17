// src/components/SwipeableGridPage.js
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css'; // core Swiper
import 'swiper/css/scrollbar'; // scrollbar module
import 'swiper/css/navigation'; // navigation module
import 'swiper/css/pagination'; // pagination module
import 'swiper/css/keyboard'; // keyboard module

import './SwipeableGridPage.css'

// Import Swiper styles
// There's no need to import Mousewheel or other modules directly for Swiper v7+

const SwipeableGridPage = () => {
  const projects = [
    { id: 1, title: "Project 1", description: "Description for Project 1" },
    { id: 2, title: "Project 2", description: "Description for Project 2" },
    { id: 3, title: "Project 3", description: "Description for Project 3" },
    { id: 4, title: "Project 4", description: "Description for Project 4" },
    { id: 5, title: "Project 5", description: "Description for Project 5" },
    { id: 6, title: "Project 6", description: "Description for Project 6" },
    { id: 7, title: "Project 7", description: "Description for Project 7" },
    // Add more projects as needed
  ];

  return (
    <Swiper
      // Swiper configurations
      spaceBetween={50}
      slidesPerView={1}
      mousewheel={true} // Enabled by default, no need for direct import
      scrollbar={{ draggable: true }} // Enable draggable scrollbar
      navigation={true} // Enable navigation buttons
      pagination={{ clickable: true }} // Enable clickable pagination
      keyboard={{ enabled: true, onlyInViewport: true }} // Enable keyboard control
      breakpoints={{
        640: { slidesPerView: 2, spaceBetween: 20 },
        768: { slidesPerView: 3, spaceBetween: 30 },
      }}
      className="mySwiperContainer"
    >
      {projects.map((project) => (
        <SwiperSlide key={project.id}>
          <div className="project-card">
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            {/* Add more content as needed */}
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
};

export default SwipeableGridPage;
