/**
 * Seed AI-search optimized SEO metadata for smartaihub.app
 * Run: npx tsx scripts/seed-smartaihub-seo.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { tenants, seoMetadata } from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

type SeoSeed = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  aiContent?: {
    context: string;
    keyFacts: string[];
    faqs?: Array<{ question: string; answer: string }>;
    howTo?: Array<{ step: number; instruction: string; tip?: string }>;
  };
  structuredData?: Record<string, any>;
};

const entries: SeoSeed[] = [
  {
    path: "/",
    title: "SmartAIHub | Enterprise Skill Marketplace & Workflow Swarms",
    description: "Discover reusable skills, build virtual workflows, and run swarm execution that delivers chat, presentation, and video outputs.",
    keywords: ["SmartAIHub", "skill marketplace", "virtual workflows", "swarm execution", "enterprise AI", "chat output", "presentation output", "video output"],
    ogImage: "/images/og-image.png",
    twitterCard: "summary_large_image",
    aiContent: {
      context: "SmartAIHub is an enterprise skill marketplace with workflow orchestration, swarm execution, and multi-surface output delivery.",
      keyFacts: [
        "SmartAIHub helps teams publish reusable AI skills.",
        "Virtual workflows turn prompts into governed processes.",
        "Swarm execution combines multiple skills into stronger outputs.",
      ],
      faqs: [
        { question: "What is SmartAIHub?", answer: "SmartAIHub is a skill marketplace and workflow platform for enterprise AI teams." },
        { question: "What outputs can SmartAIHub create?", answer: "Teams can ship chat answers, presentation decks, and video outputs from the same workflow." },
      ],
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SmartAIHub",
      url: "/",
    },
  },
  {
    path: "/features",
    title: "SmartAIHub Features | Skill Marketplace, Workflows & Swarms",
    description: "Explore enterprise features for publishing skills, orchestrating workflows, governing swarms, and delivering outputs.",
    keywords: ["SmartAIHub features", "skill marketplace", "workflow builder", "swarm governance", "enterprise capabilities"],
    aiContent: {
      context: "Feature page for SmartAIHub enterprise capabilities spanning marketplace publishing, workflow orchestration, governance, and output delivery.",
      keyFacts: [
        "Skills are reusable capabilities.",
        "Workflows add routing, approvals, and context.",
        "Swarms coordinate multiple runs in parallel.",
      ],
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SmartAIHub",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    },
  },
  {
    path: "/marketplace",
    title: "SmartAIHub Marketplace | Enterprise Skill Catalog",
    description: "Browse and reuse enterprise AI skills for chat, presentation, video, automation, and more.",
    keywords: ["SmartAIHub marketplace", "enterprise skill catalog", "AI skills", "workflow skills", "automation"],
    aiContent: {
      context: "Marketplace page for discovering reusable AI skills and template-driven capabilities.",
      keyFacts: [
        "The marketplace helps teams reuse proven skills.",
        "Search and filtering make discovery easier.",
        "Each skill can be added to a workflow or swarm.",
      ],
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "SmartAIHub Marketplace",
    },
  },
  {
    path: "/pricing",
    title: "SmartAIHub Pricing | Enterprise AI Workflows",
    description: "Flexible pricing for teams that need skill automation, workflow runs, and white-label deployment.",
    keywords: ["SmartAIHub pricing", "enterprise AI pricing", "credit packages", "workflow runs", "white-label deployment"],
    aiContent: {
      context: "Pricing page for enterprise buyers evaluating SmartAIHub capacity, credits, support, and branding.",
      keyFacts: [
        "Plans scale by credits and support needs.",
        "Enterprise buyers can ask about white-label options.",
        "All plans include the core platform capabilities.",
      ],
    },
  },
  {
    path: "/contact",
    title: "Contact SmartAIHub | Enterprise Support & Sales",
    description: "Contact SmartAIHub for enterprise support, sales, partnership questions, or technical help.",
    keywords: ["contact SmartAIHub", "enterprise support", "sales inquiry", "technical support", "partnership"],
    aiContent: {
      context: "Contact page for sales, support, and enterprise questions about SmartAIHub.",
      keyFacts: [
        "Use the contact page for product questions and sales.",
        "Support is focused on enterprise adoption and implementation.",
      ],
    },
  },
  {
    path: "/docs",
    title: "SmartAIHub Docs | Skills, Workflows, Swarms & AI Outputs",
    description: "Learn how to publish skills, orchestrate workflows, run swarms, and ship chat, presentation, and video outputs.",
    keywords: ["SmartAIHub docs", "skill marketplace", "workflow builder", "swarm execution", "chat output", "presentation output", "video output"],
    aiContent: {
      context: "Documentation hub covering skills, workflows, swarms, integrations, and output delivery.",
      keyFacts: [
        "Docs cover marketplace publishing and workflow design.",
        "They also cover integrations, SDKs, webhooks, and security.",
        "FAQ and how-to structure helps answer engines understand the docs.",
      ],
      faqs: [
        { question: "What should I read first?", answer: "Start with getting started, then read the core concepts and integration guides." },
        { question: "Can SmartAIHub output presentations and videos?", answer: "Yes. The same workflow can drive chat, presentation, and video outputs." },
      ],
      howTo: [
        { step: 1, instruction: "Browse the skill marketplace" },
        { step: 2, instruction: "Compose a virtual workflow" },
        { step: 3, instruction: "Run the workflow as a swarm" },
      ],
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      name: "SmartAIHub Documentation",
    },
  },
  {
    path: "/blog",
    title: "SmartAIHub Blog | Product Updates, Tutorials & Security",
    description: "Read SmartAIHub guides on skill marketplaces, workflow automation, swarm orchestration, and enterprise security.",
    keywords: ["SmartAIHub blog", "product updates", "workflow automation", "swarm orchestration", "enterprise security"],
    aiContent: {
      context: "Blog hub for tutorials, product updates, and SEO-friendly guides about SmartAIHub capabilities.",
      keyFacts: [
        "Blog posts are mapped to separate keyword clusters.",
        "Each article focuses on a distinct product intent or how-to intent.",
      ],
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "SmartAIHub Blog",
    },
  },
  {
    path: "/gallery",
    title: "SmartAIHub Gallery | Shared AI Outputs",
    description: "Browse shared images, videos, and website demos created from SmartAIHub workflows and skills.",
    keywords: ["SmartAIHub gallery", "AI outputs", "shared media", "video demo", "website demo"],
  },
  {
    path: "/workflows",
    title: "SmartAIHub Workflows | Orchestrated AI Runs",
    description: "Manage orchestrated AI workflows, reusable steps, and swarm-driven execution flows.",
    keywords: ["SmartAIHub workflows", "AI orchestration", "swarm execution", "workflow builder", "reusable processes"],
  },
  {
    path: "/agencies/marketplace",
    title: "SmartAIHub Agency Marketplace | Swarm-Ready Teams",
    description: "Browse swarm-ready team templates and agency patterns for enterprise delivery.",
    keywords: ["agency marketplace", "swarm-ready templates", "team templates", "enterprise delivery"],
  },
];

async function upsertSeo(db: any, tenantId: number, entry: SeoSeed) {
  const [existing] = await db
    .select()
    .from(seoMetadata)
    .where(
      and(
        eq(seoMetadata.tenantId, tenantId),
        eq(seoMetadata.path, entry.path)
      )
    )
    .limit(1);

  if (existing) {
    await db.update(seoMetadata).set({
      title: entry.title,
      description: entry.description,
      keywords: entry.keywords,
      canonicalUrl: entry.canonicalUrl || entry.path,
      ogMetadata: {
        title: entry.title,
        description: entry.description,
        image: entry.ogImage || "/images/og-image.png",
        type: "website",
        url: entry.canonicalUrl || entry.path,
      },
      twitterMetadata: {
        card: entry.twitterCard || "summary_large_image",
        title: entry.title,
        description: entry.description,
        image: entry.ogImage || "/images/og-image.png",
      },
      aiContent: entry.aiContent,
      structuredData: entry.structuredData || null,
      isActive: true,
      updatedAt: new Date(),
    }).where(eq(seoMetadata.id, existing.id));
    console.log(`Updated SEO: ${entry.path}`);
    return;
  }

  await db.insert(seoMetadata).values({
    tenantId,
    path: entry.path,
    title: entry.title,
    description: entry.description,
    keywords: entry.keywords,
    canonicalUrl: entry.canonicalUrl || entry.path,
    ogMetadata: {
      title: entry.title,
      description: entry.description,
      image: entry.ogImage || "/images/og-image.png",
      type: "website",
      url: entry.canonicalUrl || entry.path,
    },
    twitterMetadata: {
      card: entry.twitterCard || "summary_large_image",
      title: entry.title,
      description: entry.description,
      image: entry.ogImage || "/images/og-image.png",
    },
    aiContent: entry.aiContent || null,
    structuredData: entry.structuredData || null,
    isActive: true,
  });
  console.log(`Created SEO: ${entry.path}`);
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

    for (const entry of entries) {
      await upsertSeo(db, tenant.id, entry);
    }

    console.log("\nDone! SEO metadata seeded for smartaihub.app");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await sql.end();
  }
}

seed();
