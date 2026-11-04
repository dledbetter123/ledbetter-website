// A project's own page (/projects/:slug): the project's summary and links on top, and a
// LedbetterLM chat about it below that has already asked its first question. Opened by
// clicking a card in the homepage carousel.
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ChatWidget from '../ChatWidget/ChatWidget';
import usePortfolioDescription from '../../hooks/usePortfolioDescription';
import ThesisDetail from './ThesisDetail';
import { projectBySlug, portfolioUrl } from '../../data/projects';
import './ProjectPage.css';
import './ThesisDetail.css';

// Extra page sections, keyed by a project's `detail` field (data/projects.js).
const DETAILS = { thesis: ThesisDetail };

// What a visitor was looking at when they clicked "Ask LedbetterLM" on a portfolio page
// (written by public/portfolio/ask.js). Only fresh context for this project counts.
const ASK_KEY = 'ledbetter_ask_context';
const readAskContext = (slug) => {
  try {
    const c = JSON.parse(sessionStorage.getItem(ASK_KEY) || 'null');
    if (!c || c.slug !== slug || !(Date.now() - c.at < 10 * 60 * 1000)) return null;
    return c;
  } catch (err) {
    return null;
  }
};

// The visible first question built from that context. Empty for the page's overview,
// which falls back to the project's opener.
const askQuestion = (project, c) => {
  if (!c) return '';
  if (c.selection) {
    return `On the ${project.title} page I highlighted this: "${c.selection.replace(/[\s.,;:]+$/, '')}". Can you explain it?`;
  }
  if (c.heading) {
    return `I'm on the ${project.title} page, looking at "${c.heading}"${c.state ? `, ${c.state}` : ''}. Can you walk me through it?`;
  }
  return '';
};

const ProjectPage = () => {
  const { slug } = useParams();
  const project = projectBySlug(slug);
  const description = usePortfolioDescription(project || {});
  const [askCtx] = useState(() => readAskContext(slug));
  useEffect(() => {
    try {
      sessionStorage.removeItem(ASK_KEY);
    } catch (err) {
      /* storage unavailable */
    }
  }, []);

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

  const Detail = DETAILS[project.detail];
  const ctx = askCtx && askCtx.slug === project.slug ? askCtx : null;
  const page = {
    slug: project.slug,
    section: ctx?.section || '',
    state: ctx?.state || '',
    selection: ctx?.selection || '',
  };
  const greeting = `Hi, I'm LedbetterLM, David Ledbetter's librarian. Ask me anything about ${project.title}: how it works, why he built it, what he learned.`;

  return (
    <div className="main-container">
      {/* A page with a detail section is long and scrolls; the chat then gets a fixed
          height at the end instead of filling the viewport. */}
      <div className={`content-layer projectPage${Detail ? ' projectPage--long' : ''}`}>
        <Link className="projectPageBack" to="/#portfolio">← All projects</Link>
        <header className="projectPageHeader">
          <h1>{project.title}</h1>
          <p className="projectPageDesc">{description || '…'}</p>
          <div className="projectPageLinks">
            <a href={portfolioUrl(project)}>Portfolio page →</a>
            {project.githubUrl && (
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">View the repo ↗</a>
            )}
            {project.linkUrl && (
              <a href={project.linkUrl} target="_blank" rel="noopener noreferrer">{project.linkLabel || 'Visit ↗'}</a>
            )}
          </div>
        </header>
        {Detail && <Detail />}
        {/* Keyed by slug so moving between projects starts a fresh chat instance. */}
        <ChatWidget
          key={project.slug}
          embedded
          storeKey={`ledbettergpt_chat_project_${project.slug}`}
          greeting={greeting}
          starter={project.opener}
          askNow={askQuestion(project, ctx)}
          page={page}
          placeholder={`Ask about ${project.title}…`}
        />
      </div>
    </div>
  );
};

export default ProjectPage;
