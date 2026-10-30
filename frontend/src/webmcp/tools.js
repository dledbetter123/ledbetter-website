// frontend/src/webmcp/tools.js
//
// WebMCP tool surface for davidamosledbetter.com.
//
// WebMCP (https://github.com/webmachinelearning/webmcp) lets a page hand an AI
// agent real, named functions instead of making it scrape the DOM and guess at
// click targets. The page registers tools on `document.modelContext`; a browser
// agent (or, via CDP, an external one) lists and calls them.
//
// Availability, verified against Chrome 152 stable and 155 canary on 2026-09-09:
//   * the entry point is `document.modelContext` (NOT `navigator.modelContext`,
//     which the May-2026 spec draft moved off Navigator and Chrome never exposed);
//   * it only exists when Chrome runs with `--enable-features=WebMCPTesting`
//     (chrome://flags/#enable-webmcp-testing) or a live origin-trial token;
//   * `execute(input, { signal })` receives PARSED input and must return a string.
// Everything degrades to a no-op when the API is absent, so shipping this costs
// nothing for ordinary visitors.

import { requireHandle, readHandle } from './siteBridge';

const TOOL_TIMEOUT_MS = 45000;

let installed = false;
let controller = null;

const json = (value) => JSON.stringify(value, null, 2);

// Tools return strings. Anything structured goes out as pretty JSON so an agent
// can parse it, and anything conversational goes out as prose.
const defineTools = () => [
  {
    name: 'list_projects',
    description:
      "List David Ledbetter's portfolio projects shown on the site, with each project's " +
      'title, description and link. Use this before show_project to learn the exact titles.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => json(requireHandle('portfolio').getProjects()),
  },
  {
    name: 'list_publications',
    description:
      'List the publications and presentations shown on the site, with citation and link.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => json(requireHandle('portfolio').getPublications()),
  },
  {
    name: 'show_project',
    description:
      'Scroll the portfolio carousel to a specific project card and bring it on screen, ' +
      'so the human at the keyboard sees the project you are talking about.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Project title, or a distinctive part of it (case-insensitive), e.g. "Finsler".',
        },
      },
      required: ['title'],
    },
    execute: async ({ title }) => {
      const shown = requireHandle('portfolio').showProject(title);
      return `Now showing card ${shown.index + 1} of ${shown.total}: "${shown.title}".`;
    },
  },
  {
    name: 'go_to_section',
    description:
      'Scroll the page to one of the site\'s top-level sections.',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['home', 'portfolio', 'publications', 'about', 'contact'],
        },
      },
      required: ['section'],
    },
    execute: async ({ section }) => {
      requireHandle('portfolio').goToSection(section);
      return `Scrolled to the ${section} section.`;
    },
  },
  {
    name: 'ask_ledbetterlm',
    description:
      "Ask LedbetterLM — the site's own AI librarian, which is grounded on David's " +
      'knowledge base and can read his public GitHub repos live — a question, and return ' +
      "its answer. Use this for anything about David's background, experience or code " +
      'that the project cards do not already answer. The question and answer appear in ' +
      'the real chat widget, so the human sees the exchange.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask LedbetterLM.' },
      },
      required: ['question'],
    },
    annotations: { consequentialHint: true, untrustedContentHint: true },
    execute: async ({ question }, { signal } = {}) =>
      requireHandle('chat').ask(question, { signal, timeoutMs: TOOL_TIMEOUT_MS }),
  },
  {
    name: 'read_chat_transcript',
    description:
      'Read the current LedbetterLM conversation as it appears in the chat widget, ' +
      'including anything the human typed themselves.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async () => json(requireHandle('chat').getTranscript()),
  },
  {
    name: 'get_page_state',
    description:
      'Report what is currently on screen: which section is in view, which project card ' +
      'is showing, and whether the chat widget is open or waiting on a reply. Call this ' +
      'to orient yourself before or after acting.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const portfolio = readHandle('portfolio');
      const chat = readHandle('chat');
      return json({
        url: window.location.href,
        sectionInView: portfolio ? portfolio.getSectionInView() : null,
        activeProject: portfolio ? portfolio.getActiveProject() : null,
        activePublication: portfolio ? portfolio.getActivePublication() : null,
        chat: chat ? chat.getState() : null,
      });
    },
  },
  {
    name: 'get_resume',
    description: "Get the URL of David Ledbetter's résumé (PDF).",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () =>
      'https://davidamosledbetter-portfolio.s3.amazonaws.com/resume (PDF, served inline)',
  },
];

/**
 * Register the site's tools on document.modelContext. Safe to call in any
 * browser: a no-op where WebMCP is unavailable. Returns a teardown function.
 */
export function installWebMCPTools() {
  if (installed) return () => {};
  const modelContext = typeof document !== 'undefined' ? document.modelContext : null;
  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    // No WebMCP in this browser. Nothing to do, and nothing to warn about —
    // this is the normal path for every non-agentic visitor.
    return () => {};
  }

  installed = true;
  controller = new AbortController();

  // Tools are unregistered by aborting the signal they were registered with.
  const registrations = defineTools().map((tool) =>
    Promise.resolve(modelContext.registerTool(tool, { signal: controller.signal })).catch(
      (err) => {
        // One bad tool must not take the rest down.
        console.warn(`[webmcp] failed to register "${tool.name}"`, err);
      },
    ),
  );

  Promise.all(registrations).then(() => {
    window.__webmcpReady = true;
    console.info(`[webmcp] registered ${registrations.length} tools on document.modelContext`);
  });

  return () => {
    if (controller) controller.abort();
    controller = null;
    installed = false;
    window.__webmcpReady = false;
  };
}
