// What a visitor was looking at when they clicked "Ask LedbetterLM" on a portfolio page,
// turned into the chat's first question and greeting. Shared by the project chat page
// (/projects/:slug) and the chat overlay on the portfolio pages themselves.

// The visible first question built from that context. Empty for the page's overview,
// which falls back to the project's opener.
export const askQuestion = (project, c) => {
  if (!c) return '';
  if (c.selection) {
    return `On the ${project.title} page I highlighted this: "${c.selection.replace(/[\s.,;:]+$/, '')}". Can you explain it?`;
  }
  if (c.heading) {
    return `I'm on the ${project.title} page, looking at "${c.heading}"${c.state ? `, ${c.state}` : ''}. Can you walk me through it?`;
  }
  return '';
};

export const projectGreeting = (project) =>
  `Hi, I'm LedbetterLM, David Ledbetter's librarian. Ask me anything about ${project.title}: how it works, why he built it, what he learned.`;

// The `page` field every chat request carries, so the server loads that page's text.
export const pageFromContext = (slug, c) => ({
  slug,
  section: c?.section || '',
  state: c?.state || '',
  selection: c?.selection || '',
});

// One conversation per project, shared by the chat page and the portfolio-page overlay.
export const projectStoreKey = (slug) => `ledbettergpt_chat_project_${slug}`;
