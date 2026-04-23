export type SmartAiHubIndexLink = {
  href: string;
  label: string;
  description: string;
};

export type SmartAiHubIndexSection = {
  title: string;
  description: string;
  links: SmartAiHubIndexLink[];
};

export const smartaihubPublicIndexSections: SmartAiHubIndexSection[] = [
  {
    title: "Core Pages",
    description:
      "Primary entry points for SmartAIHub visitors and search engines.",
    links: [
      {
        href: "/",
        label: "Home",
        description:
          "Turn prompts and documents into answers, decks, and videos in one AI workspace.",
      },
      {
        href: "/features",
        label: "Features",
        description: "Enterprise capabilities and platform surfaces.",
      },
      {
        href: "/marketplace",
        label: "Marketplace",
        description: "Browse skills and reusable capabilities.",
      },
      {
        href: "/pricing",
        label: "Pricing",
        description: "Plans and credits for teams and enterprises.",
      },
      {
        href: "/docs",
        label: "Docs",
        description: "Guides, FAQs, and technical documentation.",
      },
      {
        href: "/blog",
        label: "Blog",
        description: "Tutorials, guides, and product updates.",
      },
      {
        href: "/resources",
        label: "Site Index",
        description: "Internal link hub for search and discovery.",
      },
      {
        href: "/contact",
        label: "Contact",
        description: "Talk to the SmartAIHub team.",
      },
    ],
  },
  {
    title: "Docs Clusters",
    description:
      "Intent-specific documentation that owns a distinct keyword cluster.",
    links: [
      {
        href: "/docs/marketplace-discovery",
        label: "Marketplace Discovery",
        description: "Find the right skill with strong intent matching.",
      },
      {
        href: "/docs/workflow-builder",
        label: "Workflow Builder",
        description: "Turn prompts into repeatable virtual workflows.",
      },
      {
        href: "/docs/swarm-execution",
        label: "Swarm Execution",
        description: "Run multiple specialist skills in parallel.",
      },
      {
        href: "/docs/faq/marketplace",
        label: "Marketplace FAQ",
        description: "Publishing, governance, and discovery questions.",
      },
      {
        href: "/docs/faq/workflows",
        label: "Workflow FAQ",
        description: "Workflow design and orchestration questions.",
      },
      {
        href: "/docs/faq/outputs",
        label: "Output FAQ",
        description: "Chat, presentation, and video output packaging.",
      },
      {
        href: "/docs/image/prompt-engineering",
        label: "Image Prompt Engineering",
        description: "Brand-safe prompts for AI image generation.",
      },
      {
        href: "/docs/video/production-pipeline",
        label: "Video Production Pipeline",
        description: "Scripts, scenes, and production cues.",
      },
      {
        href: "/docs/seo/ai-search-optimization",
        label: "AI Search Optimization",
        description: "Improve discoverability for AI and search engines.",
      },
      {
        href: "/docs/content/factory",
        label: "Content Factory",
        description: "Skill-generated docs, FAQ, and blog automation.",
      },
    ],
  },
  {
    title: "Media & Outputs",
    description:
      "Pages that target image, video, presentation, and output packaging search intent.",
    links: [
      {
        href: "/gallery",
        label: "Gallery",
        description: "Showcase and browse generated assets.",
      },
      {
        href: "/workflows",
        label: "Workflows",
        description: "Workflow library and orchestration paths.",
      },
      {
        href: "/docs/chat-outputs",
        label: "Chat Outputs",
        description: "Skill-aware chat delivery.",
      },
      {
        href: "/docs/video/prompt-engineering",
        label: "Video Prompt Engineering",
        description: "Prompt structure for video generation.",
      },
      {
        href: "/docs/image/workflow-pipeline",
        label: "Image Workflow Pipeline",
        description: "Batch generation, review, and export.",
      },
      {
        href: "/docs/video/production-pipeline",
        label: "Video Production Pipeline",
        description: "End-to-end video workflow steps.",
      },
    ],
  },
  {
    title: "Support & Trust",
    description:
      "Operational pages that help trust, support, and compliance discovery.",
    links: [
      {
        href: "/about",
        label: "About",
        description: "Company story and mission.",
      },
      {
        href: "/support",
        label: "Support",
        description: "Help resources and support access.",
      },
      {
        href: "/status",
        label: "Status",
        description: "Platform health and uptime.",
      },
      {
        href: "/security",
        label: "Security",
        description: "Security and governance overview.",
      },
      {
        href: "/changelog",
        label: "Changelog",
        description: "Product updates and release notes.",
      },
      {
        href: "/careers",
        label: "Careers",
        description: "Open roles and team opportunities.",
      },
    ],
  },
];

export const smartaihubStaticSitemapPaths = [
  { path: "/", priority: 1.0 },
  { path: "/features", priority: 0.9 },
  { path: "/marketplace", priority: 0.9 },
  { path: "/pricing", priority: 0.8 },
  { path: "/docs", priority: 0.9 },
  { path: "/blog", priority: 0.9 },
  { path: "/resources", priority: 0.8 },
  { path: "/gallery", priority: 0.8 },
  { path: "/workflows", priority: 0.8 },
  { path: "/contact", priority: 0.7 },
  { path: "/about", priority: 0.6 },
  { path: "/changelog", priority: 0.6 },
  { path: "/careers", priority: 0.6 },
  { path: "/community", priority: 0.6 },
  { path: "/support", priority: 0.7 },
  { path: "/status", priority: 0.6 },
  { path: "/security", priority: 0.7 },
  { path: "/docs/marketplace-discovery", priority: 0.7 },
  { path: "/docs/workflow-builder", priority: 0.7 },
  { path: "/docs/swarm-execution", priority: 0.7 },
  { path: "/docs/faq/marketplace", priority: 0.7 },
  { path: "/docs/faq/workflows", priority: 0.7 },
  { path: "/docs/faq/outputs", priority: 0.7 },
  { path: "/docs/image/prompt-engineering", priority: 0.7 },
  { path: "/docs/image/workflow-pipeline", priority: 0.7 },
  { path: "/docs/video/prompt-engineering", priority: 0.7 },
  { path: "/docs/video/production-pipeline", priority: 0.7 },
  { path: "/docs/seo/ai-search-optimization", priority: 0.8 },
  { path: "/docs/content/factory", priority: 0.8 },
];
