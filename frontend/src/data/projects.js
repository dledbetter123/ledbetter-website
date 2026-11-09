// The portfolio projects, in carousel order. MainPage renders the cards from this list
// and ProjectPage (/projects/:slug) looks a project up by slug, so a card and its page
// can't drift apart.
//
// Fields:
//   slug         URL segment for the project's page.
//   title        Card + page heading.
//   githubUrl    Public repo. Cards without a `description` fetch README_portfolio.md
//                from its main branch (see usePortfolioDescription).
//   linkUrl      External link to show instead of / alongside the repo (live product).
//   linkLabel    Button text for linkUrl.
//   description  Inline text, for cards that shouldn't read as a README excerpt or have
//                no public repo to fetch from.
//   opener       The question the project page sends to LedbetterLM to start the chat.
//   detail       Optional extra page section rendered by ProjectPage ('thesis').
//
// Every project also has a standalone portfolio page at /portfolio/<slug>.html
// (frontend/public/portfolio). Cards open that page; its "Ask LedbetterLM" button
// leads to the chat at /projects/<slug>.
const projects = [
  {
    // Proprietary Apple work: no public repo, so the card carries its own description.
    slug: 'self-healing-agent',
    title: 'Self-Healing Automation (Apple)',
    description:
      "My flagship project at Apple, where I'm lead researcher and engineer. UI issues and OS quirks break test code on every release; Self-Healing Automation is the dynamic system I built so those test plans heal themselves, around a world model of screens and their transitions.",
    opener: "Tell me about David's Self-Healing Automation project at Apple.",
  },
  {
    // The full abstract, contributions and figures live in data/thesis.js.
    slug: 'thesis',
    title: "Master's Thesis: Lingual-First Host Intrusion Detection",
    description:
      'Can a language model catch an attack from a host\'s audit log? I serialize system provenance into a compact language and measure what representation gives versus what learning adds. Frequency counts go far, they stop where entities interact, and SENTINEL picks up there.',
    detail: 'thesis',
    opener: "What is David's master's thesis about, and what did he find?",
  },
  {
    // Inline description: the repo is the simulator that re-creates the link, and its
    // README_portfolio.md would undersell the drone work around it.
    slug: 'crazyflie-aideck',
    title: 'Crazyflie AI-Deck',
    githubUrl: 'https://github.com/dledbetter123/aideck-bitbang-link',
    description:
      "Autonomous nano-drones for target tracking and building mapping at UMBC's CARDS/EEHPC Labs. I ran obstacle detection onboard, streamed the AI-deck camera to a ground station running YOLO, wrote GAP8 RISC-V firmware, and carried the GAP8-to-STM32 link over I2C.",
    opener: "Tell me about David's Crazyflie AI-deck drone work: the obstacle detection he ran onboard, the YOLO target tracking, and the link he ran over the I2C lines.",
  },
  {
    // Personal project with private repos: inline description, links to the live product.
    slug: 'pathion',
    title: 'Pathion: In-Browser AI Coding Tutor',
    linkUrl: 'https://pathion.dev',
    linkLabel: 'Visit pathion.dev',
    description:
      'A browser-native platform that helps students and engineers prepare for interviews and learn engineering concepts, running every program on-device. As lead researcher I built its AI layer: an in-browser LLM tutor, a hint model trained with SFT and RL, and an adaptive Elo.',
    opener: 'Tell me about Pathion and what David built for it.',
  },
  {
    // SGST & Finsler carry inline descriptions so the card reads as a research summary
    // rather than a README dump. LedbetterLM serves both description-only (guard.go).
    slug: 'sgst',
    title: 'Sparse Geometric Signal Transport',
    githubUrl: 'https://github.com/dledbetter123/SparseGeometricSignalTransport',
    description:
      'A geometric theory of the transformer: attention as parallel transport on a fiber bundle, with tokens as sparse Fourier constellations. Its spectral model beat a parameter-matched GPT-Nano on Tiny Shakespeare, and it produced a drop-in, curvature-based positional encoding that beats RoPE.',
    opener: 'What is Sparse Geometric Signal Transport, and what did it find?',
  },
  {
    slug: 'finsler-transformer',
    title: 'The Finsler Transformer',
    githubUrl: 'https://github.com/dledbetter123/LedbetterFinslerTransformer',
    description:
      "What if attention isn't computed, but a curvature you move through? The Finsler Transformer swaps O(T²) attention for geodesic flow on a learned manifold, where a sentence is a geodesic, aiming at O(T) generation.",
    opener: 'What is the Finsler Transformer and how is it different from attention?',
  },
  {
    slug: 'char-aware-lm',
    title: 'Character-Aware Neural Language Model',
    githubUrl: 'https://github.com/dledbetter123/Grad-Assessment',
    opener: "Tell me about David's character-aware neural language model.",
  },
  {
    slug: 'kernel-mailbox',
    title: 'Kernel Mailbox Simulation',
    githubUrl: 'https://github.com/dledbetter123/kernel-bst',
    opener: "Tell me about David's kernel mailbox simulation project.",
  },
  {
    slug: 'trade-companion',
    title: 'Algorithmic Trading Companion',
    githubUrl: 'https://github.com/dledbetter123/trade-companion',
    opener: "Tell me about David's algorithmic trading companion.",
  },
  {
    slug: 'nsbe-website',
    title: 'NSBE Chapter Website',
    githubUrl: 'https://github.com/dledbetter123/nsbe-website',
    opener: 'Tell me about the NSBE chapter website David built.',
  },
  {
    slug: 'this-website',
    title: 'This Website!',
    githubUrl: 'https://github.com/dledbetter123/ledbetter-website',
    description:
      "The site you're on, and the AI you're talking to. It's serverless AWS: React on S3 behind CloudFront, and one Go Lambda running LedbetterLM, my AI librarian. A fast model chats, and code questions go to an agent that reads my GitHub repos live.",
    opener: 'How is this website and LedbetterLM built?',
  },
];

export const projectBySlug = (slug) => projects.find((p) => p.slug === slug) || null;
export const portfolioUrl = (project) => `/portfolio/${project.slug}`;

export default projects;
