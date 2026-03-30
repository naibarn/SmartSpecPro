export interface SmartAiHubDocBlueprint {
  pageKey: string;
  slug: string;
  title: string;
  sortOrder: number;
  description: string;
  keywords: string[];
  aiContext: string;
  keyFacts: string[];
  content: string;
  faqs?: Array<{ question: string; answer: string }>;
}

export interface SmartAiHubBlogBlueprint {
  slug: string;
  title: string;
  excerpt: string;
  metaDescription: string;
  metaKeywords: string;
  content: string;
  coverImage: string;
  author: string;
  authorAvatar: string;
  category: string;
  tags: string[];
  readTime: string;
  isPublished: boolean;
  isFeatured: boolean;
}

export interface SmartAiHubContentManifest {
  tenantDomain?: string;
  docs?: SmartAiHubDocBlueprint[];
  blog?: SmartAiHubBlogBlueprint[];
}

export const extraDocsBlueprints: SmartAiHubDocBlueprint[] = [
  {
    pageKey: "docs-enterprise-ai-workflows",
    slug: "enterprise-ai-workflows",
    title: "Enterprise AI Workflows",
    sortOrder: 40,
    description: "Design governed AI workflows for operations, content production, and service delivery.",
    keywords: ["enterprise AI workflows", "AI workflow automation", "governed workflow", "enterprise orchestration", "SmartAIHub workflows"],
    aiContext: "Explain how enterprise AI workflows connect reusable skills, approvals, routing, and output delivery.",
    keyFacts: [
      "Workflows should start from business intent.",
      "Approvals and routing keep teams in control.",
      "Output surfaces can be chat, presentation, or video.",
    ],
    content: `<section class="doc-content">
  <h1>Enterprise AI Workflows</h1>
  <p>SmartAIHub turns repeatable tasks into governed AI workflows that teams can reuse, inspect, and improve.</p>
  <h2>What makes a workflow enterprise-ready</h2>
  <ul>
    <li>Clear ownership and approvals</li>
    <li>Reusable skill steps</li>
    <li>Observable output stages</li>
  </ul>
</section>`,
    faqs: [
      { question: "What is an enterprise AI workflow?", answer: "It is a governed sequence of reusable skills, routing, and approvals built around a business outcome." },
    ],
  },
  {
    pageKey: "docs-skill-publishing",
    slug: "skill-publishing",
    title: "Skill Publishing",
    sortOrder: 41,
    description: "Publish reusable skills with clear metadata, versioning, and discoverability.",
    keywords: ["skill publishing", "AI skill marketplace", "publish reusable skills", "skill metadata", "SmartAIHub publishing"],
    aiContext: "Teach teams how to publish skills into the marketplace with the right metadata for search and reuse.",
    keyFacts: [
      "Skills need ownership, version, and status fields.",
      "Good metadata improves both user discovery and AI search.",
      "Published skills should be reusable across tenants and workflows.",
    ],
    content: `<section class="doc-content">
  <h1>Skill Publishing</h1>
  <p>Publish skills with the metadata users need to understand the purpose, output, and governance of each capability.</p>
  <h2>Publishing checklist</h2>
  <ul>
    <li>Name the skill by outcome, not by implementation detail</li>
    <li>Describe the output format clearly</li>
    <li>Add tags for intent, domain, and team usage</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-output-packaging",
    slug: "output-packaging",
    title: "Output Packaging",
    sortOrder: 42,
    description: "Package workflow outputs for chat, slide decks, PDFs, and video scripts.",
    keywords: ["output packaging", "chat output", "presentation output", "video script output", "SmartAIHub outputs"],
    aiContext: "Explain how SmartAIHub packages one workflow result into multiple delivery formats.",
    keyFacts: [
      "One structured result can feed multiple output surfaces.",
      "Packaging keeps outputs reusable and easier to localize.",
    ],
    content: `<section class="doc-content">
  <h1>Output Packaging</h1>
  <p>Turn one workflow result into multiple deliverables without duplicating the upstream work.</p>
  <h2>Supported packages</h2>
  <ul>
    <li>Interactive chat answer</li>
    <li>Executive slide deck</li>
    <li>Video brief or production script</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-image-outputs",
    slug: "image-outputs",
    title: "Image Outputs",
    sortOrder: 43,
    description: "Generate and publish image-ready assets from reusable skills and workflow steps.",
    keywords: ["image outputs", "AI image generation", "workflow image assets", "SmartAIHub images", "content automation"],
    aiContext: "Show how SmartAIHub can produce image assets from workflow output and skill context.",
    keyFacts: [
      "Image output should inherit the same brand and intent as the workflow.",
      "Artifacts can be reused in docs, blog posts, and galleries.",
    ],
    content: `<section class="doc-content">
  <h1>Image Outputs</h1>
  <p>Produce image-ready assets from the same skill and workflow context used for chat and decks.</p>
</section>`,
  },
  {
    pageKey: "docs-video-production",
    slug: "video-production",
    title: "Video Production",
    sortOrder: 44,
    description: "Turn workflow output into scripts, scenes, voiceover cues, and video assets.",
    keywords: ["video production", "AI video workflow", "video script generation", "SmartAIHub video", "content pipeline"],
    aiContext: "Explain how SmartAIHub supports video planning, scripting, and production cues.",
    keyFacts: [
      "Video production starts with a structured brief.",
      "The same workflow can generate both script and scene plan.",
    ],
    content: `<section class="doc-content">
  <h1>Video Production</h1>
  <p>Use SmartAIHub to package workflow output into scripts, scenes, and production cues.</p>
</section>`,
  },
  {
    pageKey: "docs-knowledge-automation",
    slug: "knowledge-automation",
    title: "Knowledge Automation",
    sortOrder: 45,
    description: "Create a repeatable knowledge pipeline for internal docs, support answers, and reusable playbooks.",
    keywords: ["knowledge automation", "AI knowledge base", "internal documentation", "support automation", "enterprise search"],
    aiContext: "Show how SmartAIHub can turn internal knowledge into reusable docs and answers.",
    keyFacts: [
      "Knowledge should be structured for retrieval.",
      "The same content can power docs, FAQ, and chat answers.",
    ],
    content: `<section class="doc-content">
  <h1>Knowledge Automation</h1>
  <p>SmartAIHub can package internal knowledge into searchable, reusable, and governed content flows.</p>
</section>`,
  },
  {
    pageKey: "docs-support-automation",
    slug: "support-automation",
    title: "Support Automation",
    sortOrder: 46,
    description: "Automate support triage, routing, and response generation with reusable skills.",
    keywords: ["support automation", "customer support AI", "ticket triage", "enterprise support", "SmartAIHub support"],
    aiContext: "Explain how SmartAIHub helps teams triage and answer support requests faster.",
    keyFacts: [
      "Support automation should keep humans in control for escalations.",
      "Routing rules help send the right issue to the right owner.",
    ],
    content: `<section class="doc-content">
  <h1>Support Automation</h1>
  <p>Use skills and workflows to triage, route, and answer support requests with clear governance.</p>
</section>`,
  },
  {
    pageKey: "docs-brand-consistency",
    slug: "brand-consistency",
    title: "Brand Consistency",
    sortOrder: 47,
    description: "Keep tone, design, and messaging aligned across chat, docs, slides, and video output.",
    keywords: ["brand consistency", "AI brand control", "messaging consistency", "enterprise content", "SmartAIHub brand"],
    aiContext: "Explain how SmartAIHub keeps brand guidance consistent across multiple output surfaces.",
    keyFacts: [
      "Brand guidance should travel with the workflow.",
      "Reusable templates prevent drift across pages and outputs.",
    ],
    content: `<section class="doc-content">
  <h1>Brand Consistency</h1>
  <p>Keep messaging and visual tone aligned across all public outputs by packaging brand guidance into the workflow.</p>
</section>`,
  },
  {
    pageKey: "docs-faq-marketplace",
    slug: "faq-marketplace",
    title: "Marketplace FAQ",
    sortOrder: 48,
    description: "Answers to common questions about skill discovery, publishing, and reuse in the marketplace.",
    keywords: ["marketplace FAQ", "skill marketplace questions", "publish skills", "discover skills", "SmartAIHub FAQ"],
    aiContext: "FAQ page for marketplace discovery and publishing questions.",
    keyFacts: [
      "FAQ pages expand long-tail search coverage.",
      "They also help answer engines surface direct responses.",
    ],
    content: `<section class="doc-content">
  <h1>Marketplace FAQ</h1>
  <details><summary>How do I find the right skill?</summary><p>Search by task, output type, or team outcome, then check tags and metadata.</p></details>
  <details><summary>How do I publish a skill?</summary><p>Add ownership, versioning, and a clear description before publishing to the marketplace.</p></details>
</section>`,
    faqs: [
      { question: "How do I find the right skill?", answer: "Search by task, output type, or team outcome, then check tags and metadata." },
      { question: "How do I publish a skill?", answer: "Add ownership, versioning, and a clear description before publishing to the marketplace." },
    ],
  },
  {
    pageKey: "docs-faq-workflows",
    slug: "faq-workflows",
    title: "Workflow FAQ",
    sortOrder: 49,
    description: "Answers to common questions about workflow design, swarms, routing, and approvals.",
    keywords: ["workflow FAQ", "AI workflow questions", "swarm FAQ", "routing approvals", "SmartAIHub workflow"],
    aiContext: "FAQ page for workflow design and swarm execution questions.",
    keyFacts: [
      "Workflow FAQs help capture common implementation intent.",
      "They create extra search entry points for long-tail queries.",
    ],
    content: `<section class="doc-content">
  <h1>Workflow FAQ</h1>
  <details><summary>What is a virtual workflow?</summary><p>A workflow is a repeatable process that coordinates skills, context, and approvals.</p></details>
  <details><summary>What is a swarm?</summary><p>A swarm runs multiple specialist skills in parallel and merges the best result.</p></details>
</section>`,
    faqs: [
      { question: "What is a virtual workflow?", answer: "A workflow is a repeatable process that coordinates skills, context, and approvals." },
      { question: "What is a swarm?", answer: "A swarm runs multiple specialist skills in parallel and merges the best result." },
    ],
  },
  {
    pageKey: "docs-faq-security",
    slug: "faq-security",
    title: "Security FAQ",
    sortOrder: 50,
    description: "Answers to common questions about keys, permissions, MFA, and audit trails.",
    keywords: ["security FAQ", "AI security", "MFA FAQ", "audit logs", "SmartAIHub security"],
    aiContext: "FAQ page for security and governance questions.",
    keyFacts: [
      "Security is part of the operating model.",
      "FAQ content can reinforce trust and compliance intent.",
    ],
    content: `<section class="doc-content">
  <h1>Security FAQ</h1>
  <details><summary>How are API keys protected?</summary><p>Use secret storage, least privilege, and regular rotation.</p></details>
  <details><summary>Can I audit workflow runs?</summary><p>Yes. Audit logs should capture who published, ran, and approved work.</p></details>
</section>`,
  },
  {
    pageKey: "docs-faq-outputs",
    slug: "faq-outputs",
    title: "Output FAQ",
    sortOrder: 51,
    description: "Answers to common questions about chat, presentations, video, and image outputs.",
    keywords: ["output FAQ", "chat output", "presentation output", "video output", "image output", "SmartAIHub outputs"],
    aiContext: "FAQ page for output delivery and content packaging questions.",
    keyFacts: [
      "Output pages help capture comparison queries.",
      "One workflow can produce more than one deliverable.",
    ],
    content: `<section class="doc-content">
  <h1>Output FAQ</h1>
  <details><summary>Can one workflow create multiple formats?</summary><p>Yes. The same workflow can produce chat answers, slide decks, and video cues.</p></details>
  <details><summary>Can image assets be reused?</summary><p>Yes. Image assets can be reused across docs, blog posts, and galleries.</p></details>
</section>`,
  },
];

export const extraBlogBlueprints: SmartAiHubBlogBlueprint[] = [
  {
    slug: "enterprise-ai-workflow-automation",
    title: "Enterprise AI Workflow Automation: A Practical Playbook",
    excerpt: "A practical guide for turning repeat work into governed, reusable AI workflows.",
    metaDescription: "A practical guide for turning repeat work into governed, reusable AI workflows with SmartAIHub.",
    metaKeywords: "enterprise AI workflow automation, SmartAIHub playbook, workflow governance, reusable workflows, AI operations",
    content: `<h2>Automation with governance</h2>
<p>Enterprise teams need automation that is observable, reusable, and easy to update. SmartAIHub makes that possible by pairing skills with workflow controls.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["automation", "workflows", "enterprise"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "how-to-build-an-ai-skill-marketplace",
    title: "How to Build an AI Skill Marketplace That People Actually Use",
    excerpt: "Discover the structures that make skill marketplaces searchable, reusable, and useful.",
    metaDescription: "Discover the structures that make a SmartAIHub skill marketplace searchable, reusable, and useful.",
    metaKeywords: "AI skill marketplace, SmartAIHub marketplace, skill discoverability, reusable skills, publish skills",
    content: `<h2>Build for discoverability</h2>
<p>Every skill needs a title, intent, owner, version, and tags. Without those fields, the marketplace becomes hard to search and hard to trust.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "News",
    tags: ["marketplace", "skills", "discoverability"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "prompt-to-slide-deck",
    title: "Prompt to Slide Deck: How SmartAIHub Turns Answers into Presentations",
    excerpt: "Use workflow output to create slide-ready narratives for executives and teams.",
    metaDescription: "Use SmartAIHub workflow output to create slide-ready narratives and presentation decks.",
    metaKeywords: "prompt to slide deck, presentation generation, SmartAIHub slides, executive update, AI presentation",
    content: `<h2>From answer to deck</h2>
<p>SmartAIHub can transform a workflow result into a slide deck outline, speaker notes, and polished content blocks for presentation editors.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["presentation", "slides", "workflow"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "prompt-to-video-pipeline",
    title: "Prompt to Video Pipeline: Building Repeatable Video Output",
    excerpt: "Plan video scripts, scenes, and production cues from one workflow run.",
    metaDescription: "Plan video scripts, scenes, and production cues from one SmartAIHub workflow run.",
    metaKeywords: "prompt to video, video pipeline, SmartAIHub video output, AI script generation, scene planning",
    content: `<h2>Video output starts with structure</h2>
<p>SmartAIHub can generate a brief, then expand that brief into scenes, narration, and edit cues that a production team can act on.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["video", "pipeline", "production"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "search-ai-optimization-checklist",
    title: "AI Search Optimization Checklist for Docs, Blog, and FAQ Pages",
    excerpt: "A checklist for distributing keywords across many focused public pages.",
    metaDescription: "A checklist for distributing keywords across SmartAIHub docs, blog, and FAQ pages.",
    metaKeywords: "AI search optimization checklist, docs SEO, blog SEO, FAQ SEO, keyword clusters",
    content: `<h2>One page, one intent</h2>
<p>The best SEO strategy for SmartAIHub is to split intent into focused pages, keep the language specific, and connect the pages with internal links.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["seo", "search", "content"],
    readTime: "5 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "reusable-skill-packaging",
    title: "Reusable Skill Packaging for Teams",
    excerpt: "Package repeatable prompts and workflows as reusable capabilities.",
    metaDescription: "Package repeatable prompts and workflows as reusable capabilities in SmartAIHub.",
    metaKeywords: "reusable skill packaging, SmartAIHub skills, prompt packages, reusable workflows, enterprise AI",
    content: `<h2>Skills should be products</h2>
<p>Reusable skills need a clear scope, output, and governance model so teams can find and trust them quickly.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["skills", "packaging", "reuse"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "workflow-governance-playbook",
    title: "Workflow Governance Playbook for Enterprise Teams",
    excerpt: "Keep workflows auditable, safe, and ready for scale.",
    metaDescription: "Keep SmartAIHub workflows auditable, safe, and ready for scale with a governance playbook.",
    metaKeywords: "workflow governance, enterprise workflow playbook, audit logs, approvals, SmartAIHub governance",
    content: `<h2>Governance is a feature</h2>
<p>When the workflow includes approvals, audit logs, and owner metadata, it is much easier to run in an enterprise setting.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Security",
    tags: ["governance", "workflow", "audit"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "content-ops-for-enterprise-ai",
    title: "Content Operations for Enterprise AI Teams",
    excerpt: "Use skills to keep docs, blog, FAQ, and media assets moving continuously.",
    metaDescription: "Use SmartAIHub skills to keep docs, blog, FAQ, and media assets moving continuously.",
    metaKeywords: "content operations, enterprise AI content, docs blog FAQ, media assets, SmartAIHub content factory",
    content: `<h2>Content operations at scale</h2>
<p>SmartAIHub can power a continuous content engine where skills generate drafts, structure metadata, and keep search intent fresh.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Product Update",
    tags: ["content ops", "factory", "media"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
];

export function normalizeManifestTenantDomain(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = (input as SmartAiHubContentManifest).tenantDomain;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}
