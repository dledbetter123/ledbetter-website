// A project's own page (/projects/:slug): the project's summary and links on top, and a
// LedbetterLM chat about it below that has already asked its first question. Opened by
// clicking a card in the homepage carousel.
import React, { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import GlyphWall from '../GlyphWall/GlyphWall';
import ChatWidget from '../ChatWidget/ChatWidget';
import usePortfolioDescription from '../../hooks/usePortfolioDescription';
import { projectBySlug } from '../../data/projects';
import './ProjectPage.css';

const ProjectPage = () => {
  const { slug } = useParams();
  const project = projectBySlug(slug);
  const description = usePortfolioDescription(project || {});

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!project) return undefined;
    const previousTitle = document.title;
    document.title = `${project.title} · David Ledbetter`;
    return () => {
      document.title = previousTitle;
    };
  }, [project]);

  if (!project) return <Navigate to="/" replace />;

  const greeting = `Hi, I'm LedbetterLM, David Ledbetter's librarian. Ask me anything about ${project.title}: how it works, why he built it, what he learned.`;

  return (
    <div className="main-container">
      <GlyphWall />
      <div className="content-layer projectPage">
        <Link className="projectPageBack" to="/#portfolio">← All projects</Link>
        <header className="projectPageHeader">
          <h1>{project.title}</h1>
          <p className="projectPageDesc">{description || '…'}</p>
          <div className="projectPageLinks">
            {project.githubUrl && (
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">View the repo ↗</a>
            )}
            {project.linkUrl && (
              <a href={project.linkUrl} target="_blank" rel="noopener noreferrer">{project.linkLabel || 'Visit ↗'}</a>
            )}
          </div>
        </header>
        {/* Keyed by slug so moving between projects starts a fresh chat instance. */}
        <ChatWidget
          key={project.slug}
          embedded
          storeKey={`ledbettergpt_chat_project_${project.slug}`}
          greeting={greeting}
          starter={project.opener}
          placeholder={`Ask about ${project.title}…`}
        />
      </div>
    </div>
  );
};

export default ProjectPage;
