/**
 * Content factory for smartaihub.app
 * Creates additional docs/FAQ pages plus path-specific SEO metadata.
 *
 * This is intentionally blueprint-driven so future skill automation can
 * append new intent clusters without rewriting the render pipeline.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { tenants, tenantPages, seoMetadata } from "../drizzle/schema";
import { extraDocsBlueprints } from "./smartaihub-content-blueprints";
import { buildSmartAiHubRelatedLinks } from "../shared/smartaihubDiscovery";
import { pingSmartAiHubSearchEngines } from "../server/services/sitemapPing";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

type ContentBlueprint = {
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
};

const blueprints: ContentBlueprint[] = [
  {
    pageKey: "docs-marketplace-discovery",
    slug: "marketplace-discovery",
    title: "Marketplace Discovery",
    sortOrder: 30,
    description: "Find the right skill in the SmartAIHub marketplace using categories, filters, and intent-rich metadata.",
    keywords: ["SmartAIHub marketplace discovery", "AI skill marketplace", "discover reusable skills", "skill search", "enterprise marketplace"],
    aiContext: "This page explains how to discover and evaluate reusable skills in the SmartAIHub marketplace.",
    keyFacts: [
      "Marketplace search is driven by categories and metadata.",
      "Skills can be reused across teams and workflows.",
      "Discovery should match the user's business intent.",
    ],
    content: `<section class="doc-content">
  <h1>Marketplace Discovery</h1>
  <p>Learn how to find the right reusable skill in SmartAIHub using categories, filters, ownership metadata, and business intent.</p>
  <h2>What to look for</h2>
  <ul>
    <li>Clear title and description</li>
    <li>Owner, version, and status metadata</li>
    <li>Output format and use case tags</li>
  </ul>
</section>`,
    faqs: [
      { question: "How do I choose the right skill?", answer: "Start with the output you need, then search for a skill that matches the job and target format." },
      { question: "Why is metadata important?", answer: "Metadata helps users and search engines understand which skill fits which intent." },
    ],
  },
  {
    pageKey: "docs-workflow-builder",
    slug: "workflow-builder",
    title: "Workflow Builder",
    sortOrder: 31,
    description: "Compose virtual workflows with triggers, approvals, routing, and reusable steps.",
    keywords: ["SmartAIHub workflow builder", "AI workflow automation", "virtual workflow", "prompt to process", "enterprise orchestration"],
    aiContext: "This page explains the SmartAIHub workflow builder and how it turns prompts into repeatable processes.",
    keyFacts: [
      "Workflows connect skills into repeatable paths.",
      "Approvals and routing make workflows enterprise-ready.",
      "Workflows can output chat, presentation, or video.",
    ],
    content: `<section class="doc-content">
  <h1>Workflow Builder</h1>
  <p>Build repeatable virtual workflows that connect a skill to context, approvals, routing, and output handling.</p>
  <h2>Workflow design rules</h2>
  <ul>
    <li>Start with the business outcome</li>
    <li>Keep the number of steps small and observable</li>
    <li>Route outputs to the right surface</li>
  </ul>
</section>`,
    faqs: [
      { question: "What is a virtual workflow?", answer: "It is a repeatable process that coordinates skills, context, and approvals to produce a result." },
      { question: "Can one workflow create different outputs?", answer: "Yes. The same workflow can feed chat, presentation, and video surfaces." },
    ],
  },
  {
    pageKey: "docs-swarm-execution",
    slug: "swarm-execution",
    title: "Swarm Execution",
    sortOrder: 32,
    description: "Run multiple specialist skills in parallel and merge the strongest result into one output.",
    keywords: ["SmartAIHub swarm execution", "multi-agent workflows", "parallel AI skills", "enterprise AI orchestration", "workflow swarm"],
    aiContext: "This page explains how SmartAIHub swarm execution coordinates multiple skills to improve output quality.",
    keyFacts: [
      "Swarms run specialist tasks in parallel.",
      "The strongest results can be merged into one final output.",
      "Swarm runs help with complex or multi-angle requests.",
    ],
    content: `<section class="doc-content">
  <h1>Swarm Execution</h1>
  <p>Run multiple specialist skills in parallel and merge the best signals into a final answer, slide deck, or video brief.</p>
  <h2>When to use it</h2>
  <ul>
    <li>Research-heavy tasks</li>
    <li>Content synthesis</li>
    <li>Multi-format production</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-chat-outputs",
    slug: "chat-outputs",
    title: "Chat Outputs",
    sortOrder: 33,
    description: "Design skill-aware chat responses that stay grounded in workflow context.",
    keywords: ["SmartAIHub chat output", "AI chat assistant", "skill-aware responses", "workflow chat", "enterprise chatbot"],
    aiContext: "This page explains how SmartAIHub uses workflow context to generate grounded chat answers.",
    keyFacts: [
      "Chat is one output surface, not the whole system.",
      "It should stay tied to workflow context.",
    ],
    content: `<section class="doc-content">
  <h1>Chat Outputs</h1>
  <p>Use chat as an interactive surface for grounded answers that come from skills and workflow context.</p>
</section>`,
  },
  {
    pageKey: "docs-presentation-outputs",
    slug: "presentation-outputs",
    title: "Presentation Outputs",
    sortOrder: 34,
    description: "Turn workflow results into slide-ready narratives, executive updates, and reusable deck blocks.",
    keywords: ["SmartAIHub presentation output", "AI slide decks", "workflow presentation", "executive update slides", "deck generation"],
    aiContext: "This page explains how SmartAIHub converts workflow results into presentations.",
    keyFacts: [
      "Presentations should be based on workflow output.",
      "A deck can be generated from a single structured result.",
    ],
    content: `<section class="doc-content">
  <h1>Presentation Outputs</h1>
  <p>Convert workflow results into slide-ready narratives, executive updates, and reusable deck blocks.</p>
</section>`,
  },
  {
    pageKey: "docs-video-outputs",
    slug: "video-outputs",
    title: "Video Outputs",
    sortOrder: 35,
    description: "Transform workflow output into video scripts, scenes, and production cues.",
    keywords: ["SmartAIHub video output", "AI video generation", "video scripts", "scene planning", "workflow video"],
    aiContext: "This page explains how SmartAIHub can turn workflow output into video planning assets.",
    keyFacts: [
      "Video output starts with structured workflow context.",
      "Scripts and scene plans can be generated from the same run.",
    ],
    content: `<section class="doc-content">
  <h1>Video Outputs</h1>
  <p>Turn workflow output into scripts, scenes, and production cues for video generation.</p>
</section>`,
  },
  {
    pageKey: "docs-faq",
    slug: "faq",
    title: "FAQ",
    sortOrder: 36,
    description: "Frequently asked questions about SmartAIHub skills, workflows, swarms, and outputs.",
    keywords: ["SmartAIHub FAQ", "skills FAQ", "workflow FAQ", "swarm FAQ", "enterprise AI questions"],
    aiContext: "This page collects common questions about SmartAIHub and organizes them for SEO and support.",
    keyFacts: [
      "FAQ pages help search engines understand common questions.",
      "They also help AI answer systems provide concise responses.",
    ],
    content: `<section class="doc-content">
  <h1>Frequently Asked Questions</h1>
  <details>
    <summary>What is SmartAIHub?</summary>
    <p>SmartAIHub is a skill marketplace with virtual workflows, swarm execution, and multiple output surfaces.</p>
  </details>
  <details>
    <summary>Can one workflow create chat, slides, and video?</summary>
    <p>Yes. The same workflow can drive all three surfaces depending on the output stage.</p>
  </details>
</section>`,
    faqs: [
      { question: "What is SmartAIHub?", answer: "SmartAIHub is a skill marketplace with virtual workflows, swarm execution, and multiple output surfaces." },
      { question: "Can one workflow create chat, slides, and video?", answer: "Yes. The same workflow can drive all three surfaces depending on the output stage." },
    ],
  },
  {
    pageKey: "docs-ai-search-optimization",
    slug: "ai-search-optimization",
    title: "AI Search Optimization",
    sortOrder: 37,
    description: "Use keyword clusters, structured data, and intent mapping to improve discoverability across SmartAIHub pages.",
    keywords: ["AI search optimization", "docs SEO", "blog SEO", "structured data", "SmartAIHub discoverability"],
    aiContext: "This page explains how to optimize SmartAIHub public pages for search engines and AI answer systems.",
    keyFacts: [
      "Each page should own one main intent cluster.",
      "Structured data improves machine understanding.",
      "Docs, blog, and FAQ pages should reinforce each other.",
    ],
    content: `<section class="doc-content">
  <h1>AI Search Optimization</h1>
  <p>Optimize each public page with a distinct intent cluster, strong metadata, and structured content that search engines and AI systems can understand.</p>
</section>`,
    faqs: [
      { question: "Why create many focused pages?", answer: "Focused pages can rank for more long-tail queries than one broad page can." },
      { question: "What should each page contain?", answer: "A clear topic, a distinct keyword set, and content that directly answers the user intent." },
    ],
  },
  {
    pageKey: "docs-content-publishing",
    slug: "content-publishing",
    title: "Content Publishing",
    sortOrder: 38,
    description: "Plan, publish, and update SmartAIHub docs, blog, and FAQ pages in a repeatable content workflow.",
    keywords: ["SmartAIHub content publishing", "docs publishing", "blog publishing", "FAQ publishing", "content workflow"],
    aiContext: "This page explains how to publish content assets into SmartAIHub in a repeatable way.",
    keyFacts: [
      "Publishing should be repeatable and governed.",
      "Docs and blog content should be easy to update.",
    ],
    content: `<section class="doc-content">
  <h1>Content Publishing</h1>
  <p>Plan, publish, and update SmartAIHub docs, blog, and FAQ pages as part of a repeatable content workflow.</p>
</section>`,
  },
  {
    pageKey: "docs-skill-lifecycle",
    slug: "skill-lifecycle",
    title: "Skill Lifecycle",
    sortOrder: 39,
    description: "Manage skill creation, approval, publishing, versioning, and retirement across the marketplace.",
    keywords: ["SmartAIHub skill lifecycle", "skill versioning", "skill publishing", "skill governance", "marketplace lifecycle"],
    aiContext: "This page explains how SmartAIHub manages the lifecycle of reusable skills.",
    keyFacts: [
      "Skills should be versioned and owned.",
      "Publishing and retirement are both part of the lifecycle.",
    ],
    content: `<section class="doc-content">
  <h1>Skill Lifecycle</h1>
  <p>Manage skill creation, review, publishing, versioning, and retirement across the marketplace.</p>
</section>`,
  },
  ...extraDocsBlueprints,
];

async function upsertTenantPage(db: any, tenantId: number, blueprint: ContentBlueprint) {
  const relatedLinks = buildSmartAiHubRelatedLinks(`/docs/${blueprint.slug}`, blueprint.title, blueprint.keywords);
  const [existing] = await db
    .select()
    .from(tenantPages)
    .where(
      and(
        eq(tenantPages.tenantId, tenantId),
        eq(tenantPages.pageKey, blueprint.pageKey),
      ),
    )
    .limit(1);

  const pagePayload = {
    title: blueprint.title,
    slug: blueprint.slug,
    content: blueprint.content,
    metadata: {
      description: blueprint.description,
      keywords: blueprint.keywords,
      customMeta: {
        relatedLinks: JSON.stringify(relatedLinks),
      },
    },
    isPublished: true,
    showInMenu: true,
    sortOrder: blueprint.sortOrder,
  };

  if (existing) {
    await db.update(tenantPages).set({
      ...pagePayload,
      updatedAt: new Date(),
    }).where(eq(tenantPages.id, existing.id));
    return "updated";
  }

  await db.insert(tenantPages).values({
    tenantId,
    pageKey: blueprint.pageKey,
    ...pagePayload,
  });
  return "created";
}

async function upsertSeo(db: any, tenantId: number, blueprint: ContentBlueprint) {
  const path = `/docs/${blueprint.slug}`;
  const relatedLinks = buildSmartAiHubRelatedLinks(path, blueprint.title, blueprint.keywords);
  const [existing] = await db
    .select()
    .from(seoMetadata)
    .where(and(eq(seoMetadata.tenantId, tenantId), eq(seoMetadata.path, path)))
    .limit(1);

  const seoPayload = {
    title: `${blueprint.title} | SmartAIHub Docs`,
    description: blueprint.description,
    keywords: blueprint.keywords,
    canonicalUrl: path,
    ogMetadata: {
      title: `${blueprint.title} | SmartAIHub Docs`,
      description: blueprint.description,
      image: "/images/og-image.png",
      type: "article",
      url: path,
    },
    twitterMetadata: {
      card: "summary_large_image" as const,
      title: `${blueprint.title} | SmartAIHub Docs`,
      description: blueprint.description,
      image: "/images/og-image.png",
    },
    aiContent: {
      context: blueprint.aiContext,
      keyFacts: blueprint.keyFacts,
      faqs: blueprint.faqs,
      entities: relatedLinks.map((link) => ({
        name: link.label,
        type: "WebPage",
        description: link.description,
        sameAs: [link.href],
      })),
      howTo: [
        { step: 1, instruction: `Read the ${blueprint.title.toLowerCase()} page` },
        { step: 2, instruction: "Apply the guidance to a real tenant workflow" },
        { step: 3, instruction: "Update the page when the intent cluster expands" },
      ],
    },
    qualitySignals: {
      citations: relatedLinks.map((link) => link.href),
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      name: blueprint.title,
      description: blueprint.description,
      url: path,
    },
    isActive: true,
  };

  if (existing) {
    await db.update(seoMetadata).set({
      ...seoPayload,
      updatedAt: new Date(),
    }).where(eq(seoMetadata.id, existing.id));
    return "updated";
  }

  await db.insert(seoMetadata).values({
    tenantId,
    path,
    ...seoPayload,
  });
  return "created";
}

async function seed() {
  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.primaryDomain, "smartaihub.app"))
      .limit(1);

    if (!tenant) {
      console.error("Tenant smartaihub.app not found!");
      await sql.end();
      process.exit(1);
    }

    for (const blueprint of blueprints) {
      const pageResult = await upsertTenantPage(db, tenant.id, blueprint);
      const seoResult = await upsertSeo(db, tenant.id, blueprint);
      console.log(`${blueprint.pageKey}: ${pageResult}, ${seoResult}`);
    }

    await pingSmartAiHubSearchEngines(tenant.primaryDomain || "smartaihub.app").catch(() => {});
    console.log("\\nDone! Content factory seeded for smartaihub.app");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await sql.end();
  }
}

seed();
