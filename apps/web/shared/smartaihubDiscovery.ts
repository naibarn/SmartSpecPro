export type SmartAiHubRelatedLink = {
  href: string;
  label: string;
  description: string;
};

function normalizePath(pathName: string): string {
  const withLeadingSlash = pathName.startsWith("/") ? pathName : `/${pathName}`;
  const normalized = withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : "/";
  return normalized || "/";
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

const defaultLinks: SmartAiHubRelatedLink[] = [
  { href: "/resources", label: "Site Index", description: "Navigate the full public content graph." },
  { href: "/docs/seo/ai-search-optimization", label: "AI Search Optimization", description: "Structure pages for AI and search engines." },
  { href: "/docs/content/factory", label: "Content Factory", description: "Generate docs, FAQ, and blog pages at scale." },
  { href: "/docs/faq/marketplace", label: "Marketplace FAQ", description: "Answer publishing and discovery questions." },
];

export function buildSmartAiHubRelatedLinks(
  pathName: string,
  title?: string | null,
  keywords: string[] = [],
): SmartAiHubRelatedLink[] {
  const path = normalizePath(pathName);
  const text = `${path} ${title || ""} ${keywords.join(" ")}`.toLowerCase();

  if (path === "/" || path === "/resources") {
    return [
      { href: "/marketplace", label: "Marketplace", description: "Discover reusable skills and capabilities." },
      { href: "/docs", label: "Docs Hub", description: "Explore guides, FAQs, and intent-specific docs." },
      { href: "/blog", label: "Blog", description: "Read tutorials, SEO pages, and product updates." },
      { href: "/docs/seo/ai-search-optimization", label: "AI Search Optimization", description: "See how SmartAIHub targets multiple search clusters." },
    ];
  }

  if (path.startsWith("/docs/faq") || containsAny(text, ["faq", "question", "answers"])) {
    return [
      { href: "/resources", label: "Site Index", description: "Jump back to the public content graph." },
      { href: "/docs/content/factory", label: "Content Factory", description: "Generate more FAQ pages automatically." },
      { href: "/docs/seo/ai-search-optimization", label: "AI Search Optimization", description: "Turn questions into discoverable answers." },
      { href: "/blog/faq-seo-long-tail-strategy", label: "FAQ SEO Strategy", description: "Expand long-tail search coverage with FAQ clusters." },
    ];
  }

  if (containsAny(text, ["image", "visual", "asset"])) {
    return [
      { href: "/resources", label: "Site Index", description: "Browse adjacent media and SEO clusters." },
      { href: "/docs/image/workflow-pipeline", label: "Image Workflow Pipeline", description: "Batch, review, and publish image assets." },
      { href: "/docs/video/production-pipeline", label: "Video Production Pipeline", description: "Connect visual briefings to video production." },
      { href: "/blog/enterprise-image-prompt-engineering", label: "Image Prompt Engineering", description: "Brand-safe prompts for enterprise visuals." },
    ];
  }

  if (containsAny(text, ["video", "presentation", "deck", "slides"])) {
    return [
      { href: "/resources", label: "Site Index", description: "Find related media and workflow pages." },
      { href: "/docs/video/prompt-engineering", label: "Video Prompt Engineering", description: "Build prompts that become scripts and scenes." },
      { href: "/docs/chat-outputs", label: "Chat Outputs", description: "Convert the same run into conversational answers." },
      { href: "/blog/video-production-pipeline-for-public-content", label: "Video Pipeline for Public Content", description: "Turn workflow output into publishable video assets." },
    ];
  }

  if (containsAny(text, ["seo", "search", "discover", "index", "crawl"])) {
    return [
      { href: "/resources", label: "Site Index", description: "See how the site graph is connected." },
      { href: "/docs/content/factory", label: "Content Factory", description: "Create more indexable pages from skills." },
      { href: "/docs/faq/marketplace", label: "Marketplace FAQ", description: "Own more long-tail question searches." },
      { href: "/blog/site-index-internal-linking", label: "Internal Linking for AI Search", description: "Use links to distribute authority across the site." },
    ];
  }

  if (containsAny(text, ["workflow", "swarm", "orchestration", "pipeline"])) {
    return [
      { href: "/resources", label: "Site Index", description: "Return to the public discovery hub." },
      { href: "/docs/workflow-builder", label: "Workflow Builder", description: "Turn prompts into repeatable processes." },
      { href: "/docs/swarm-execution", label: "Swarm Execution", description: "Run multiple specialist skills in parallel." },
      { href: "/docs/content-publishing", label: "Content Publishing", description: "Publish workflow output into public pages." },
    ];
  }

  return defaultLinks;
}
