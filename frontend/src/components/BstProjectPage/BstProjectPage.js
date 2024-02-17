// src/components/BstProjectPage/BstProjectPage.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './BstProjectPage.css'; // Your custom styles

const BstProjectPage = () => {
  const [gitHubData, setGitHubData] = useState(null);
  const repoPath = 'UMBC-CMSC421-FA2022/project3-dledbetter123';
  useEffect(() => {
    // Replace 'username/repo' with your actual GitHub repo path
    fetch(`https://api.github.com/repos/${repoPath}`)
      .then(response => response.json())
      .then(data => {
        setGitHubData(data);
        console.log(data);
        // readme doesn't exist
        // return fetch(`https://api.github.com/repos/${repoPath}/readme`);
      })
      .catch(error => console.error('Error fetching GitHub data:', error));
  }, []);

  return (
    <div className='bstProjectPage'>
      <Link to="/" className="back-to-grid">← Back to Portfolio</Link>
      <h1>Binary Search Tree Project</h1>
      <div className="githubPreview">
        {/* Render your GitHub preview here using the data from gitHubData */}
        {gitHubData && (
          <div>
            <h2>{gitHubData.name}</h2>
            <p>{gitHubData.description}</p>
            {/* You can add more GitHub data here */}
          </div>
        )}
      </div>
      <div className="projectDescription">
        <p>
          This is a brief explanation of the Binary Search Tree project. The project utilizes
          data structures and algorithms to efficiently manage sorted data. It's implemented
          in JavaScript and provides a visualization of the tree structure.
        </p>
        {/* Include a link to the live project if available */}
        {/* <a href="http://link-to-live-project.com" className="live-project-link">View Live Project</a> */}
        {/* Include a link to the GitHub repository */}
        {/* <a href="http://github.com/username/repo" className="github-repo-link">View on GitHub</a> */}
      </div>
    </div>
  );
};

export default BstProjectPage;
