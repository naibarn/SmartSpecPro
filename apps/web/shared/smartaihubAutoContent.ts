import type {
  SmartAiHubAutoContentConfig,
  SmartAiHubBlogBlueprint,
  SmartAiHubContentManifest,
  SmartAiHubGenerationPolicy,
  SmartAiHubDocBlueprint,
} from "./smartaihubContentManifest";

type AutoContentCluster =
  | "marketplace"
  | "workflow"
  | "seo"
  | "image"
  | "video"
  | "security"
  | "support"
  | "publishing"
  | "faq"
  | "general";

type AutoContentItem = {
  keyword: string;
  slug: string;
  topic: string;
  cluster: AutoContentCluster;
};

type AutoContentMode = SmartAiHubAutoContentConfig["mode"];

export type SmartAiHubAutoContentBuildOptions = {
  topicCount?: number;
  mode?: AutoContentMode;
  freshnessDays?: number;
};

export type SmartAiHubAutoContentPresetPack = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  defaultMode?: AutoContentMode;
  defaultTopicCount?: number;
  defaultFreshnessDays?: number;
};

const DEFAULT_KEYWORDS = [
  "skill marketplace discovery",
  "virtual workflow builder",
  "swarm execution",
  "chat outputs",
  "presentation outputs",
  "video production pipeline",
  "AI search optimization",
  "FAQ SEO strategy",
  "image prompt engineering",
  "support automation",
  "security governance",
  "content publishing",
];

const GENERAL_ARTICLE_SKILL_ID = "general-article-writer";
const GENERAL_ARTICLE_SKILL_LABEL = "General Article Writer";
const NEWS_KEYWORD_RE = /(ข่าว|news|latest|ล่าสุด|current|today|breaking|trend|trending|update|อัปเดต|\bcurrent event\b|\blatest news\b)/i;

const PRESET_PACKS: SmartAiHubAutoContentPresetPack[] = [
  {
    id: "news-pack",
    label: "News Pack",
    description: "Current-event and trend keywords that should use web search and thinking.",
    keywords: [
      "latest AI news",
      "current AI trends",
      "breaking product updates",
      "today market update",
      "news coverage workflow",
      "recent platform changes",
    ],
    defaultMode: "news",
    defaultTopicCount: 3,
    defaultFreshnessDays: 3,
  },
  {
    id: "evergreen-pack",
    label: "Evergreen Pack",
    description: "Stable, high-intent topics for long-lived docs and blog clusters.",
    keywords: [
      "skill marketplace discovery",
      "virtual workflow builder",
      "swarm execution",
      "AI search optimization",
      "FAQ SEO strategy",
      "content publishing",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
  {
    id: "mixed-pack",
    label: "Mixed Pack",
    description: "Balanced set of evergreen and current-intent keywords for broad coverage.",
    keywords: [
      "AI search optimization",
      "latest AI news",
      "workflow automation platform",
      "current trends in AI content",
      "image prompt engineering",
      "recent content publishing updates",
    ],
    defaultMode: "mixed",
    defaultTopicCount: 3,
    defaultFreshnessDays: 7,
  },
  {
    id: "seo-pack",
    label: "SEO Pack",
    description: "Intent clusters for AI search, indexability, and long-tail page growth.",
    keywords: [
      "AI search optimization",
      "keyword cluster strategy",
      "search intent mapping",
      "internal linking strategy",
      "content graph optimization",
      "schema markup for AI search",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
  {
    id: "faq-pack",
    label: "FAQ Pack",
    description: "Question-led content for snippets, answer engines, and support intent.",
    keywords: [
      "FAQ SEO strategy",
      "long-tail FAQ keywords",
      "customer question answers",
      "marketplace FAQ",
      "workflow FAQ",
      "security FAQ",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
  {
    id: "image-pack",
    label: "Image Pack",
    description: "Visual prompt and gallery content for image generation and asset workflows.",
    keywords: [
      "image prompt engineering",
      "AI image generation workflow",
      "brand-safe image prompts",
      "creative direction prompts",
      "gallery asset optimization",
      "visual content pipeline",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
  {
    id: "video-pack",
    label: "Video Pack",
    description: "Video production keywords for scripts, scenes, and output packaging.",
    keywords: [
      "video production pipeline",
      "prompt to video workflow",
      "presentation to video",
      "AI video scripting",
      "scene generation workflow",
      "video publishing automation",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
  {
    id: "marketplace-pack",
    label: "Marketplace Pack",
    description: "Marketplace discovery, publishing, and reusable skill growth.",
    keywords: [
      "skill marketplace discovery",
      "skill publishing workflow",
      "reusable skill packaging",
      "skill versioning",
      "skill lifecycle management",
      "skill catalog governance",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
  {
    id: "workflow-pack",
    label: "Workflow Pack",
    description: "Virtual workflow design, orchestration, and swarm execution intent.",
    keywords: [
      "virtual workflow builder",
      "swarm execution",
      "workflow orchestration",
      "workflow approvals",
      "multi-step AI workflow",
      "workflow automation platform",
    ],
    defaultMode: "standard",
    defaultTopicCount: 3,
    defaultFreshnessDays: 30,
  },
];

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80) || "topic";
}

function titleCase(value: string): string {
  const acronyms = new Map([
    ["ai", "AI"],
    ["faq", "FAQ"],
    ["seo", "SEO"],
    ["api", "API"],
    ["sdk", "SDK"],
    ["ui", "UI"],
    ["ux", "UX"],
    ["mfa", "MFA"],
    ["json", "JSON"],
    ["csv", "CSV"],
    ["url", "URL"],
    ["html", "HTML"],
    ["css", "CSS"],
    ["pdf", "PDF"],
    ["llm", "LLM"],
    ["gpt", "GPT"],
  ]);

  return value
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => acronyms.get(word.toLowerCase()) || word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function classifyCluster(keyword: string): AutoContentCluster {
  const value = keyword.toLowerCase();

  if (/(marketplace|skill|publish|discover|reuse)/.test(value)) return "marketplace";
  if (/(workflow|swarm|orchestr|pipeline|automation)/.test(value)) return "workflow";
  if (/(seo|search|crawl|index|keyword|intent)/.test(value)) return "seo";
  if (/(image|visual|illustration|graphic|design)/.test(value)) return "image";
  if (/(video|presentation|deck|slide|script|scene)/.test(value)) return "video";
  if (/(security|mfa|audit|key|governance|access)/.test(value)) return "security";
  if (/(support|ticket|triage|helpdesk|inbox)/.test(value)) return "support";
  if (/(publish|content|blog|doc|documentation|library)/.test(value)) return "publishing";
  if (/(faq|question|answer|how to|what is)/.test(value)) return "faq";

  return "general";
}

function isNewsIntent(keyword: string): boolean {
  return NEWS_KEYWORD_RE.test(keyword);
}

function normalizeTopicCount(topicCount?: number): number {
  if (!topicCount || Number.isNaN(topicCount) || topicCount <= 0) {
    return 3;
  }
  return Math.min(100, Math.floor(topicCount));
}

function resolveAutoContentMode(mode: AutoContentMode | undefined, items: AutoContentItem[]): AutoContentMode {
  if (mode) {
    return mode;
  }

  return items.some((item) => isNewsIntent(item.keyword)) ? "auto" : "standard";
}

function sortItemsByMode(items: AutoContentItem[], mode: AutoContentMode): AutoContentItem[] {
  if (mode === "standard") {
    return [...items];
  }

  if (!items.some((item) => isNewsIntent(item.keyword))) {
    return [...items];
  }

  return [...items].sort((a, b) => {
    const aScore = isNewsIntent(a.keyword) ? 1 : 0;
    const bScore = isNewsIntent(b.keyword) ? 1 : 0;
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    return a.keyword.localeCompare(b.keyword);
  });
}

function resolveGenerationPolicy(
  item: AutoContentItem,
  mode: AutoContentMode,
  freshnessDays?: number,
): SmartAiHubGenerationPolicy {
  const isNewsMode = mode === "news" || ((mode === "mixed" || mode === "auto") && isNewsIntent(item.keyword));
  const effectiveFreshnessDays = typeof freshnessDays === "number"
    ? Math.max(0, Math.floor(freshnessDays))
    : isNewsMode
      ? 3
      : 30;

  return {
    mode,
    skillId: GENERAL_ARTICLE_SKILL_ID,
    skillLabel: GENERAL_ARTICLE_SKILL_LABEL,
    route: "skill",
    requiresWebSearch: isNewsMode,
    requiresThinking: isNewsMode ? true : undefined,
    thinkingLevelHint: isNewsMode ? "high" : "medium",
    freshnessDays: effectiveFreshnessDays,
    toolIds: isNewsMode ? ["builtin-web-search"] : [],
    rationale: isNewsMode
      ? "Fresh/current topic detected; use web search + high thinking to keep facts current."
      : "Evergreen content can use the standard article writing skill.",
  };
}

function makeItem(keyword: string): AutoContentItem | null {
  const normalized = keyword.trim();
  if (!normalized) return null;

  const slug = slugify(normalized);
  return {
    keyword: normalized,
    slug,
    topic: titleCase(normalized),
    cluster: classifyCluster(normalized),
  };
}

function clusterFocus(cluster: AutoContentCluster): {
  noun: string;
  primaryVerb: string;
  docGoal: string;
  faqGoal: string;
  blogAngle: string;
  imageStyle: string;
  videoStyle: string;
  bullets: string[];
  questions: Array<{ question: string; answer: string }>;
} {
  switch (cluster) {
    case "marketplace":
      return {
        noun: "skill marketplace",
        primaryVerb: "discover and publish",
        docGoal: "Help teams discover, package, and govern reusable skills.",
        faqGoal: "Answer discovery and publishing questions with direct, search-friendly answers.",
        blogAngle: "Why a governed marketplace makes AI skills easier to reuse at scale.",
        imageStyle: "enterprise product hero, dark navy and cyan palette, polished UI, marketplace cards, workflow diagrams, premium SaaS aesthetic",
        videoStyle: "fast-moving enterprise product teaser, clean UI transitions, marketplace browsing, workflow orchestration, polished motion graphics",
        bullets: [
          "Publish skills with ownership and version metadata.",
          "Reuse the same skill across multiple workflows.",
          "Make discovery easier for users and search engines.",
        ],
        questions: [
          { question: "How do I find the right skill?", answer: "Search by outcome, output type, and ownership metadata before choosing a reusable skill." },
          { question: "How do I publish a skill safely?", answer: "Validate it privately, add governance metadata, and then promote it into the marketplace." },
          { question: "Why does marketplace metadata matter?", answer: "Metadata helps both users and AI systems understand what each skill does and when to use it." },
        ],
      };
    case "workflow":
      return {
        noun: "virtual workflow",
        primaryVerb: "orchestrate and automate",
        docGoal: "Show how to turn prompts into repeatable governed workflows.",
        faqGoal: "Answer common workflow and swarm orchestration questions directly.",
        blogAngle: "How to connect triggers, approvals, swarms, and outputs into one process.",
        imageStyle: "workflow orchestration board, connected nodes, enterprise blue and teal, elegant control room, process automation visuals",
        videoStyle: "workflow orchestration teaser, node connections, approvals, swarm execution, smooth motion graphics",
        bullets: [
          "Keep orchestration steps short and observable.",
          "Use approvals to keep enterprise control in place.",
          "Send workflow output into chat, slide, or video surfaces.",
        ],
        questions: [
          { question: "What is a virtual workflow?", answer: "It is a repeatable process that coordinates skills, context, routing, and approvals." },
          { question: "What is a swarm?", answer: "A swarm runs multiple specialist skills in parallel and merges the strongest result." },
          { question: "Can workflows create multiple outputs?", answer: "Yes. One workflow can drive chat, presentation, and video surfaces from the same source of truth." },
        ],
      };
    case "seo":
      return {
        noun: "AI search optimization",
        primaryVerb: "rank and discover",
        docGoal: "Explain how to split intent into focused pages and structured data.",
        faqGoal: "Answer SEO and discoverability questions with direct long-tail coverage.",
        blogAngle: "How SmartAIHub captures more keyword clusters with page-level intent design.",
        imageStyle: "search intelligence dashboard, content clusters, ranking lines, enterprise analytics in blue and cyan, editorial SaaS style",
        videoStyle: "search optimization montage, content graph animation, index and discovery signals, premium analytics motion",
        bullets: [
          "Own one intent cluster per page.",
          "Connect related docs, blog posts, and FAQs with internal links.",
          "Use structured data and clear headings to improve answer engines.",
        ],
        questions: [
          { question: "How many intents should one page target?", answer: "One main intent cluster per page works best for clarity and search performance." },
          { question: "Why do internal links matter?", answer: "They distribute authority and help search engines understand how the content graph fits together." },
          { question: "What helps AI search systems understand content?", answer: "Clear titles, structured data, direct answers, and context-rich entity signals." },
        ],
      };
    case "image":
      return {
        noun: "image generation",
        primaryVerb: "create brand-safe visuals",
        docGoal: "Teach prompt structure and batch image generation for enterprise teams.",
        faqGoal: "Answer common image prompt and generation questions quickly.",
        blogAngle: "How to keep image output consistent across docs, blog art, and marketplace assets.",
        imageStyle: "brand-safe AI image workflow, polished image generation studio, enterprise accent colors, editorial and product illustration",
        videoStyle: "visual creation workflow, prompt to image, design system overlays, style consistency, elegant motion graphics",
        bullets: [
          "Describe subject, style, composition, and lighting.",
          "Add brand-safe constraints to keep output consistent.",
          "Package the same brief into repeatable visual workflows.",
        ],
        questions: [
          { question: "What makes a good image prompt?", answer: "A good prompt includes the subject, style, composition, lighting, and brand constraints." },
          { question: "How do I keep image output consistent?", answer: "Use reusable prompt templates and carry brand guidance through the workflow." },
          { question: "Can image output be published to docs and blog posts?", answer: "Yes. The same asset can power documentation, gallery pages, and blog visuals." },
        ],
      };
    case "video":
      return {
        noun: "video production",
        primaryVerb: "script and publish",
        docGoal: "Show how to turn workflow output into scripts, scenes, and production cues.",
        faqGoal: "Answer video pipeline and production questions directly.",
        blogAngle: "How SmartAIHub turns one workflow into publishable video assets.",
        imageStyle: "video production pipeline, storyboard frames, cinematic SaaS UI, enterprise blue and cyan, motion graphics",
        videoStyle: "storyboard to publishable video, scene sequencing, pacing, subtitles, polished product demo reel",
        bullets: [
          "Split run output into script, scenes, and cues.",
          "Keep pacing and audience intent explicit.",
          "Use the same workflow to create slides and video together.",
        ],
        questions: [
          { question: "What should a video prompt include?", answer: "Audience, tone, pacing, scene boundaries, and the desired production format." },
          { question: "How do I turn a workflow into a video?", answer: "Convert the output into a script, then split it into scenes and production notes." },
          { question: "Can one workflow drive both slides and video?", answer: "Yes. SmartAIHub can package the same result into multiple output layers." },
        ],
      };
    case "security":
      return {
        noun: "enterprise security",
        primaryVerb: "protect and govern",
        docGoal: "Explain how to keep keys, access, and audit trails under control.",
        faqGoal: "Answer security, MFA, and audit questions directly.",
        blogAngle: "How governance keeps AI skills safe enough for enterprise use.",
        imageStyle: "security operations dashboard, lock and governance visuals, enterprise blue, audit trails, premium trust signal",
        videoStyle: "security governance teaser, audit trail animation, access control, policy enforcement, clean enterprise motion",
        bullets: [
          "Use least privilege and secret storage.",
          "Rotate keys and monitor audit logs regularly.",
          "Keep humans in control of sensitive approvals.",
        ],
        questions: [
          { question: "How do I protect API keys?", answer: "Store secrets securely, use least privilege, and rotate keys on a schedule." },
          { question: "Why are audit logs important?", answer: "Audit logs show who published, ran, and approved work across the tenant." },
          { question: "Should MFA be enabled?", answer: "Yes. MFA should be enabled for owners, operators, and approvers." },
        ],
      };
    case "support":
      return {
        noun: "support automation",
        primaryVerb: "triage and route",
        docGoal: "Show how support workflows can reduce manual work while keeping human review in place.",
        faqGoal: "Answer support routing and escalation questions directly.",
        blogAngle: "How teams can automate triage without losing control of the customer experience.",
        imageStyle: "support operations workflow, routing queue, helpdesk automation, enterprise blue and cyan, clean SaaS dashboard",
        videoStyle: "support triage flow, ticket routing, escalation checkpoints, automation with human review, motion UI",
        bullets: [
          "Route issues to the right owner automatically.",
          "Use templates for response generation.",
          "Escalate sensitive issues to humans quickly.",
        ],
        questions: [
          { question: "What is support automation?", answer: "It is a workflow that triages, routes, and drafts responses for support requests." },
          { question: "How do I keep support automation safe?", answer: "Keep escalation paths and human review in the loop for sensitive issues." },
          { question: "Can support automation use skills?", answer: "Yes. Skills can power routing, response drafting, and knowledge retrieval." },
        ],
      };
    case "publishing":
      return {
        noun: "content publishing",
        primaryVerb: "publish and refresh",
        docGoal: "Show how to keep docs, blog, and FAQ pages aligned as content evolves.",
        faqGoal: "Answer publishing and update workflow questions directly.",
        blogAngle: "How a content factory keeps public pages growing without drifting off brand.",
        imageStyle: "content ops studio, public site publishing, editorial pipeline, enterprise palette, modern knowledge base visuals",
        videoStyle: "content publishing workflow, docs to blog to FAQ, editorial pipeline animation, polished SaaS motion",
        bullets: [
          "Treat docs and blog posts like living assets.",
          "Keep pages updated when new keywords appear.",
          "Use one workflow to publish across formats.",
        ],
        questions: [
          { question: "How do I keep content current?", answer: "Refresh pages when new keywords, products, or workflows appear." },
          { question: "Why separate docs and blog pages?", answer: "They target different user intent while still reinforcing the same topic cluster." },
          { question: "Can one workflow publish multiple page types?", answer: "Yes. A content factory can generate docs, FAQs, and blog posts together." },
        ],
      };
    case "faq":
      return {
        noun: "FAQ content",
        primaryVerb: "answer and capture",
        docGoal: "Turn question-led pages into direct, searchable answers.",
        faqGoal: "Capture long-tail query variants with concise answers.",
        blogAngle: "Why FAQ pages are one of the strongest ways to win AI search snippets.",
        imageStyle: "FAQ and answer engine layout, question cards, clean knowledge base interface, blue and cyan enterprise palette",
        videoStyle: "question to answer animation, FAQ cards, answer engine flow, polished SaaS motion graphics",
        bullets: [
          "Ask the exact question users search for.",
          "Answer directly before adding supporting detail.",
          "Connect FAQs to the matching docs and blog cluster.",
        ],
        questions: [
          { question: "Why are FAQ pages useful for SEO?", answer: "They answer long-tail questions directly and can surface in snippets and AI responses." },
          { question: "How should FAQ answers be written?", answer: "Lead with the answer, then add context or examples if needed." },
          { question: "Should FAQ pages link to other content?", answer: "Yes. Strong internal links help users and search engines move through the content graph." },
        ],
      };
    default:
      return {
        noun: "public content",
        primaryVerb: "grow and discover",
        docGoal: "Create a page that expands the public site with a focused intent cluster.",
        faqGoal: "Answer common questions about the topic in a concise way.",
        blogAngle: "A practical guide for teams that want to scale the topic inside SmartAIHub.",
        imageStyle: "enterprise SaaS editorial hero, clean blue/cyan palette, knowledge graph, product diagram, premium documentation style",
        videoStyle: "product overview montage, knowledge graph animation, editorial motion graphics, polished enterprise demo",
        bullets: [
          "Focus on one search intent at a time.",
          "Use clear wording and actionable examples.",
          "Connect the page to related content clusters.",
        ],
        questions: [
          { question: "What is the main thing this page should explain?", answer: "It should explain the topic in a way that matches a clear user intent." },
          { question: "How do I expand this cluster later?", answer: "Add more pages with adjacent questions, deeper guides, or implementation examples." },
          { question: "Why is clustering important?", answer: "It gives search engines and AI systems a clearer map of the topic area." },
        ],
      };
  }
}

function makeDocContent(
  item: AutoContentItem,
  generation: SmartAiHubGenerationPolicy,
): {
  title: string;
  description: string;
  content: string;
  faqs: Array<{ question: string; answer: string }>;
  keywords: string[];
  aiContext: string;
  keyFacts: string[];
  mediaPrompts: { imagePrompt?: string; videoPrompt?: string; referenceKeywords?: string[] };
  generation: SmartAiHubGenerationPolicy;
} {
  const profile = clusterFocus(item.cluster);
  const title = `${item.topic} Guide`;
  const description = `A practical guide to ${profile.primaryVerb} ${profile.noun} inside SmartAIHub.`;
  const faqHtml = profile.questions
    .map((faq) => `<details><summary>${faq.question}</summary><p>${faq.answer}</p></details>`)
    .join("\n  ");

  return {
    title,
    description,
    content: `<section class="doc-content">
  <h1>${title}</h1>
  <p>${description}</p>
  <h2>What this guide covers</h2>
  <ul>
    ${profile.bullets.map((bullet) => `<li>${bullet}</li>`).join("\n    ")}
  </ul>
  <h2>How SmartAIHub uses this topic</h2>
  <p>This page helps teams ${profile.primaryVerb} ${profile.noun} with reusable skills, workflow steps, and clear metadata.</p>
  <h2>Common questions</h2>
  ${faqHtml}
</section>`,
    faqs: profile.questions,
    keywords: uniq([
      item.keyword,
      `SmartAIHub ${item.keyword}`,
      profile.noun,
      profile.primaryVerb,
      `${item.topic} guide`,
      `${item.topic} workflow`,
      `${item.topic} automation`,
    ]),
    aiContext: `Explain how SmartAIHub helps teams ${profile.primaryVerb} ${profile.noun} around the topic "${item.keyword}".`,
    keyFacts: [
      `Topic: ${item.keyword}`,
      profile.docGoal,
      "Use internal links to connect this page to related docs, FAQ, and blog content.",
      generation.requiresWebSearch
        ? "Use live web research and citations to keep facts current."
        : "This page is evergreen and can rely on stable product context.",
    ],
    generation,
    mediaPrompts: {
      imagePrompt: `Create a premium enterprise-style hero image for a SmartAIHub doc page about ${item.topic}. Style: ${profile.imageStyle}. Include subtle visual cues for ${profile.noun}, reusable skills, and a clean editorial layout. Avoid clutter, keep typography space open, and emphasize blue/cyan/teal enterprise tones.`,
      videoPrompt: `Create a short enterprise explainer video for a SmartAIHub doc page about ${item.topic}. Style: ${profile.videoStyle}. Show the workflow in a clear sequence: context, process, outcome, and reuse. Keep motion polished, concise, and product-led.`,
      referenceKeywords: uniq([
        item.keyword,
        profile.noun,
        "enterprise saas",
        "blue cyan teal palette",
      ]),
    },
  };
}

function makeFaqContent(
  item: AutoContentItem,
  generation: SmartAiHubGenerationPolicy,
): {
  title: string;
  description: string;
  content: string;
  faqs: Array<{ question: string; answer: string }>;
  keywords: string[];
  aiContext: string;
  keyFacts: string[];
  mediaPrompts: { imagePrompt?: string; videoPrompt?: string; referenceKeywords?: string[] };
  generation: SmartAiHubGenerationPolicy;
} {
  const profile = clusterFocus(item.cluster);
  const title = `${item.topic} FAQ`;
  const description = `Answers to common questions about ${item.keyword} in SmartAIHub.`;
  const faqHtml = profile.questions
    .map((faq) => `<details><summary>${faq.question}</summary><p>${faq.answer}</p></details>`)
    .join("\n  ");

  return {
    title,
    description,
    content: `<section class="doc-content">
  <h1>${title}</h1>
  <p>${description}</p>
  <h2>Frequently asked questions</h2>
  ${faqHtml}
</section>`,
    faqs: profile.questions,
    keywords: uniq([
      `${item.topic} FAQ`,
      `SmartAIHub ${item.keyword} FAQ`,
      `${item.keyword} questions`,
      profile.noun,
      "long-tail keywords",
    ]),
    aiContext: `Answer common questions about ${item.keyword} in a concise, search-friendly way.`,
    keyFacts: [
      `FAQ topic: ${item.keyword}`,
      profile.faqGoal,
      "FAQ pages should provide direct answers first and supporting detail second.",
      generation.requiresWebSearch
        ? "Keep answers current and cite live web references where facts can change."
        : "Keep answers concise and evergreen.",
    ],
    generation,
    mediaPrompts: {
      imagePrompt: `Create a clean FAQ card image for SmartAIHub around ${item.topic}. Style: ${profile.imageStyle}. Make it feel like an enterprise knowledge base with question cards and subtle SaaS polish.`,
      videoPrompt: `Create a concise FAQ explainer video for SmartAIHub around ${item.topic}. Style: ${profile.videoStyle}. Focus on question-answer structure, search-friendly clarity, and fast comprehension.`,
      referenceKeywords: uniq([item.keyword, "FAQ", "knowledge base"]),
    },
  };
}

function makeBlogBlueprint(item: AutoContentItem, generation: SmartAiHubGenerationPolicy): SmartAiHubBlogBlueprint {
  const profile = clusterFocus(item.cluster);
  const title = `${item.topic} Playbook`;
  const excerpt = `A practical playbook for ${item.keyword} inside SmartAIHub.`;
  const metaDescription = `${profile.blogAngle} Use SmartAIHub to ${profile.primaryVerb} ${profile.noun} with reusable skills and strong search intent.`;
  const metaKeywords = uniq([
    item.keyword,
    `SmartAIHub ${item.keyword}`,
    `${item.topic} playbook`,
    `${item.topic} strategy`,
    profile.noun,
    "AI search optimization",
  ]).join(", ");

  return {
    slug: `${item.slug}-playbook`,
    title,
    excerpt,
    metaDescription,
    metaKeywords,
    content: `<h2>Why ${item.topic} matters</h2>
<p>${metaDescription}</p>

<h3>What to do first</h3>
<ul>
  ${profile.bullets.map((bullet) => `<li>${bullet}</li>`).join("\n  ")}
</ul>

<h3>How SmartAIHub fits</h3>
<p>SmartAIHub helps teams connect the topic to reusable skills, content workflows, and output surfaces that can be published and discovered.</p>

<h3>Next steps</h3>
<p>Connect this playbook to a docs page, a FAQ page, and the site index so the topic can grow as a search cluster over time.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: item.cluster === "seo" ? "SEO" : item.cluster === "faq" ? "Guide" : "Tutorial",
    tags: uniq([
      item.keyword,
      item.cluster,
      "SmartAIHub",
      "search optimization",
    ]),
    readTime: "5 min read",
    isPublished: true,
    isFeatured: item.cluster === "seo" || item.cluster === "marketplace",
    generation,
    mediaPrompts: {
      imagePrompt: `Create a premium blog cover image for a SmartAIHub article about ${item.topic}. Style: ${profile.imageStyle}. Include a clear editorial composition, enterprise SaaS branding, and a visual cue for the article theme.`,
      videoPrompt: `Create a short blog promo video for SmartAIHub about ${item.topic}. Style: ${profile.videoStyle}. Use chapter-like beats: hook, key insight, workflow, and CTA.`,
      referenceKeywords: uniq([
        item.keyword,
        item.topic,
        "blog cover",
        "enterprise editorial",
      ]),
    },
  };
}

export function buildSmartAiHubContentMediaPrompts(
  title: string,
  description: string,
  keywords: string[],
  cluster: AutoContentCluster = "general",
): { imagePrompt: string; videoPrompt: string; referenceKeywords: string[] } {
  const profile = clusterFocus(cluster);
  const safeKeywords = uniq(keywords).slice(0, 6);

  return {
    imagePrompt: `Create a polished enterprise hero or cover image for SmartAIHub content titled "${title}". Context: ${description}. Style: ${profile.imageStyle}. Reference keywords: ${safeKeywords.join(", ")}. Keep the composition editorial, premium, and visually clear.`,
    videoPrompt: `Create a concise enterprise video concept for SmartAIHub content titled "${title}". Context: ${description}. Style: ${profile.videoStyle}. Reference keywords: ${safeKeywords.join(", ")}. Keep the pacing polished and suitable for a blog or docs teaser.`,
    referenceKeywords: safeKeywords,
  };
}

export function getSmartAiHubDefaultAutoKeywords(): string[] {
  return [...DEFAULT_KEYWORDS];
}

export function getSmartAiHubAutoContentPresetPacks(): SmartAiHubAutoContentPresetPack[] {
  return PRESET_PACKS.map((pack) => ({
    ...pack,
    keywords: [...pack.keywords],
  }));
}

export function parseSmartAiHubAutoKeywords(rawKeywords: string[]): string[] {
  return uniq(rawKeywords)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export function buildSmartAiHubAutoContentManifest(
  rawKeywords: string[],
  tenantDomain = "smartaihub.app",
  options: SmartAiHubAutoContentBuildOptions = {},
): SmartAiHubContentManifest {
  const parsedItems = parseSmartAiHubAutoKeywords(rawKeywords)
    .map(makeItem)
    .filter((item): item is AutoContentItem => !!item);
  const topicCount = normalizeTopicCount(options.topicCount);
  const mode = resolveAutoContentMode(options.mode, parsedItems);
  const items = sortItemsByMode(parsedItems, mode).slice(0, topicCount);

  const docs: SmartAiHubDocBlueprint[] = [];
  const blog: SmartAiHubBlogBlueprint[] = [];
  const generation = {
    topicCount,
    mode,
    freshnessDays: options.freshnessDays,
  } satisfies SmartAiHubAutoContentConfig;

  items.forEach((item, index) => {
    const itemGeneration = resolveGenerationPolicy(item, mode, options.freshnessDays);
    const doc = makeDocContent(item, itemGeneration);
    docs.push({
      pageKey: `docs-auto-${item.slug}`,
      slug: item.slug,
      title: doc.title,
      sortOrder: 500 + index * 3,
      description: doc.description,
      keywords: doc.keywords,
      aiContext: doc.aiContext,
      keyFacts: doc.keyFacts,
      content: doc.content,
      generation: doc.generation,
      faqs: doc.faqs,
    });

    const faq = makeFaqContent(item, itemGeneration);
    docs.push({
      pageKey: `docs-auto-faq-${item.slug}`,
      slug: `faq/${item.slug}`,
      title: faq.title,
      sortOrder: 501 + index * 3,
      description: faq.description,
      keywords: faq.keywords,
      aiContext: faq.aiContext,
      keyFacts: faq.keyFacts,
      content: faq.content,
      generation: faq.generation,
      faqs: faq.faqs,
    });

    blog.push(makeBlogBlueprint(item, itemGeneration));
  });

  return {
    tenantDomain,
    generation,
    docs,
    blog,
  };
}

export function renderSmartAiHubAutoContentSummary(manifest: SmartAiHubContentManifest): string {
  const docsCount = manifest.docs?.length || 0;
  const blogCount = manifest.blog?.length || 0;
  const generation = manifest.generation;
  const firstPlan =
    manifest.docs?.find((doc) => doc.generation)?.generation ||
    manifest.blog?.find((post) => post.generation)?.generation;
  const skillLabel = firstPlan?.skillLabel || firstPlan?.skillId || GENERAL_ARTICLE_SKILL_LABEL;
  const webSearchSuffix = firstPlan?.requiresWebSearch ? " + web search" : "";
  const thinkingSuffix = firstPlan?.requiresThinking ? " + thinking" : "";
  const modeLabel = generation?.mode || firstPlan?.mode || "standard";
  const topicCount = generation?.topicCount || Math.max(docsCount, blogCount);
  return `SmartAIHub auto content manifest: ${docsCount} docs / ${blogCount} blog posts • ${topicCount} topics • ${modeLabel} • ${skillLabel}${webSearchSuffix}${thinkingSuffix}`;
}
