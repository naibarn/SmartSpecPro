import { and, eq } from "drizzle-orm";
import { tenants, tenantPages, seoMetadata, blogPosts } from "../../drizzle/schema";
import type {
  SmartAiHubContentManifest,
  SmartAiHubPageBlueprint,
  SmartAiHubDocBlueprint,
  SmartAiHubBlogBlueprint,
} from "../../shared/smartaihubContentManifest";
import { buildSmartAiHubRelatedLinks } from "../../shared/smartaihubDiscovery";

const DEFAULT_OG_IMAGE = "/images/dashboard-preview.jpg";

type ImportCounters = {
  pagesCreated: number;
  pagesUpdated: number;
  docsCreated: number;
  docsUpdated: number;
  seoCreated: number;
  seoUpdated: number;
  blogCreated: number;
  blogUpdated: number;
};

type ImportResult = ImportCounters & {
  tenantId: number;
  tenantDomain: string;
};

type DbLike = {
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

function generationPlanSummary(generation?: {
  skillLabel?: string;
  skillId?: string;
  mode?: string;
  requiresWebSearch?: boolean;
  requiresThinking?: boolean;
  thinkingLevelHint?: string;
  freshnessDays?: number;
  rationale?: string;
}): string | undefined {
  if (!generation) return undefined;
  const parts = [
    generation.skillLabel || generation.skillId || "auto-content",
    generation.mode ? `mode=${generation.mode}` : undefined,
    generation.requiresWebSearch ? "web-search" : undefined,
    generation.requiresThinking ? `thinking=${generation.thinkingLevelHint || "medium"}` : undefined,
    typeof generation.freshnessDays === "number" ? `freshnessDays=${generation.freshnessDays}` : undefined,
  ].filter(Boolean);
  if (generation.rationale) {
    parts.push(generation.rationale);
  }
  return parts.join(" | ");
}

function normalizePath(pathName: string): string {
  const withLeadingSlash = pathName.startsWith("/") ? pathName : `/${pathName}`;
  const normalized = withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : "/";
  return normalized || "/";
}

function pagePathFromBlueprint(blueprint: { path?: string; slug: string }): string {
  return normalizePath(blueprint.path || `/${blueprint.slug}`);
}

function pagePayload(blueprint: SmartAiHubPageBlueprint) {
  const relatedLinks = buildSmartAiHubRelatedLinks(blueprint.path || `/${blueprint.slug}`, blueprint.title, blueprint.metadata?.keywords || blueprint.keywords);
  const generationPlan = generationPlanSummary(blueprint.generation);
  return {
    title: blueprint.title,
    slug: blueprint.slug,
    content: blueprint.content,
    sections: blueprint.sections,
    metadata: {
      description: blueprint.metadata?.description || blueprint.description,
      keywords: blueprint.metadata?.keywords || blueprint.keywords,
      author: blueprint.metadata?.author,
      ogImage: blueprint.metadata?.ogImage,
      customMeta: {
        ...(blueprint.metadata?.customMeta || {}),
        relatedLinks: JSON.stringify(relatedLinks),
        generationPlan: generationPlan ? JSON.stringify(blueprint.generation) : undefined,
        mediaPrompts: blueprint.mediaPrompts ? JSON.stringify(blueprint.mediaPrompts) : undefined,
      },
    },
    isPublished: blueprint.isPublished ?? true,
    showInMenu: blueprint.showInMenu ?? true,
    sortOrder: blueprint.sortOrder ?? 0,
  };
}

function pageSeoPayload(blueprint: SmartAiHubPageBlueprint, pathName: string) {
  const description = blueprint.metadata?.description || blueprint.description;
  const keywords = blueprint.metadata?.keywords || blueprint.keywords;
  const relatedLinks = buildSmartAiHubRelatedLinks(pathName, blueprint.title, keywords);
  const generationPlan = generationPlanSummary(blueprint.generation);
  return {
    title: blueprint.title,
    description,
    keywords,
    canonicalUrl: pathName,
    ogMetadata: {
      title: blueprint.title,
      description,
      image: blueprint.metadata?.ogImage || DEFAULT_OG_IMAGE,
      type: "article",
      url: pathName,
    },
    twitterMetadata: {
      card: "summary_large_image" as const,
      title: blueprint.title,
      description,
      image: blueprint.metadata?.ogImage || DEFAULT_OG_IMAGE,
    },
    aiContent: {
      context: generationPlan ? `${blueprint.aiContext}\n\nGeneration plan: ${generationPlan}` : blueprint.aiContext,
      keyFacts: generationPlan
        ? [...blueprint.keyFacts, `Generation plan: ${generationPlan}`]
        : blueprint.keyFacts,
      faqs: blueprint.faqs,
      entities: relatedLinks.map((link) => ({
        name: link.label,
        type: "WebPage",
        description: link.description,
        sameAs: [link.href],
      })),
    },
    qualitySignals: {
      citations: relatedLinks.map((link) => link.href),
    },
    structuredData: blueprint.structuredData || {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: blueprint.title,
      description,
      url: pathName,
    },
    isActive: true,
  };
}

function docPagePayload(blueprint: SmartAiHubDocBlueprint) {
  const relatedLinks = buildSmartAiHubRelatedLinks(`/docs/${blueprint.slug}`, blueprint.title, blueprint.keywords);
  const generationPlan = generationPlanSummary(blueprint.generation);
  return {
    title: blueprint.title,
    slug: blueprint.slug,
    content: blueprint.content,
    metadata: {
      description: blueprint.description,
      keywords: blueprint.keywords,
      customMeta: {
        relatedLinks: JSON.stringify(relatedLinks),
        generationPlan: generationPlan ? JSON.stringify(blueprint.generation) : undefined,
        mediaPrompts: blueprint.mediaPrompts ? JSON.stringify(blueprint.mediaPrompts) : undefined,
      },
    },
    isPublished: true,
    showInMenu: true,
    sortOrder: blueprint.sortOrder,
  };
}

function docSeoPayload(blueprint: SmartAiHubDocBlueprint, pathName: string) {
  const relatedLinks = buildSmartAiHubRelatedLinks(pathName, blueprint.title, blueprint.keywords);
  const generationPlan = generationPlanSummary(blueprint.generation);
  return {
    title: `${blueprint.title} | SmartAIHub Docs`,
    description: blueprint.description,
    keywords: blueprint.keywords,
    canonicalUrl: pathName,
    ogMetadata: {
      title: `${blueprint.title} | SmartAIHub Docs`,
      description: blueprint.description,
      image: DEFAULT_OG_IMAGE,
      type: "article",
      url: pathName,
    },
    twitterMetadata: {
      card: "summary_large_image" as const,
      title: `${blueprint.title} | SmartAIHub Docs`,
      description: blueprint.description,
      image: DEFAULT_OG_IMAGE,
    },
    aiContent: {
      context: generationPlan ? `${blueprint.aiContext}\n\nGeneration plan: ${generationPlan}` : blueprint.aiContext,
      keyFacts: generationPlan
        ? [...blueprint.keyFacts, `Generation plan: ${generationPlan}`]
        : blueprint.keyFacts,
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
      url: pathName,
    },
    isActive: true,
  };
}

function blogPayload(blueprint: SmartAiHubBlogBlueprint) {
  return {
    title: blueprint.title,
    excerpt: blueprint.excerpt,
    content: blueprint.content,
    coverImage: blueprint.coverImage,
    author: blueprint.author,
    authorAvatar: blueprint.authorAvatar,
    category: blueprint.category,
    tags: blueprint.tags,
    readTime: blueprint.readTime,
    isPublished: blueprint.isPublished,
    isFeatured: blueprint.isFeatured,
    metaDescription: blueprint.metaDescription,
    metaKeywords: blueprint.metaKeywords,
    updatedAt: new Date(),
  };
}

function blogSeoPayload(blueprint: SmartAiHubBlogBlueprint, pathName: string) {
  const keywords = blueprint.metaKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean);
  const relatedLinks = buildSmartAiHubRelatedLinks(pathName, blueprint.title, keywords);
  const generationPlan = generationPlanSummary(blueprint.generation);
  return {
    title: `${blueprint.title} | SmartAIHub Blog`,
    description: blueprint.metaDescription,
    keywords,
    canonicalUrl: pathName,
    ogMetadata: {
      title: `${blueprint.title} | SmartAIHub Blog`,
      description: blueprint.metaDescription,
      image: blueprint.coverImage || DEFAULT_OG_IMAGE,
      type: "article",
      url: pathName,
    },
    twitterMetadata: {
      card: "summary_large_image" as const,
      title: `${blueprint.title} | SmartAIHub Blog`,
      description: blueprint.metaDescription,
      image: blueprint.coverImage || DEFAULT_OG_IMAGE,
    },
    aiContent: {
      context: generationPlan ? `${blueprint.excerpt}\n\nGeneration plan: ${generationPlan}` : blueprint.excerpt,
      keyFacts: generationPlan
        ? [blueprint.excerpt, `Generation plan: ${generationPlan}`, ...relatedLinks.map((link) => link.description)]
        : [blueprint.excerpt, ...relatedLinks.map((link) => link.description)],
      faqs: [],
      entities: relatedLinks.map((link) => ({
        name: link.label,
        type: "WebPage",
        description: link.description,
        sameAs: [link.href],
      })),
    },
    qualitySignals: {
      citations: relatedLinks.map((link) => link.href),
    },
    structuredData: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: blueprint.title,
      description: blueprint.metaDescription,
      url: pathName,
    },
    isActive: true,
  };
}

export async function importSmartAiHubContentManifest(
  db: DbLike,
  manifest: SmartAiHubContentManifest,
  tenantDomain: string = manifest.tenantDomain || "smartaihub.app",
): Promise<ImportResult> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.primaryDomain, tenantDomain))
    .limit(1);

  if (!tenant) {
    throw new Error(`Tenant ${tenantDomain} not found`);
  }

  const counters: ImportCounters = {
    pagesCreated: 0,
    pagesUpdated: 0,
    docsCreated: 0,
    docsUpdated: 0,
    seoCreated: 0,
    seoUpdated: 0,
    blogCreated: 0,
    blogUpdated: 0,
  };

  for (const blueprint of manifest.pages || []) {
    const pagePath = pagePathFromBlueprint(blueprint);
    const [existingPage] = await db
      .select()
      .from(tenantPages)
      .where(and(eq(tenantPages.tenantId, tenant.id), eq(tenantPages.pageKey, blueprint.pageKey)))
      .limit(1);

    if (existingPage) {
      await db.update(tenantPages).set({ ...pagePayload(blueprint), updatedAt: new Date() }).where(eq(tenantPages.id, existingPage.id));
      counters.pagesUpdated++;
    } else {
      await db.insert(tenantPages).values({ tenantId: tenant.id, pageKey: blueprint.pageKey, ...pagePayload(blueprint) });
      counters.pagesCreated++;
    }

    const [existingSeo] = await db
      .select()
      .from(seoMetadata)
      .where(and(eq(seoMetadata.tenantId, tenant.id), eq(seoMetadata.path, pagePath)))
      .limit(1);

    if (existingSeo) {
      await db.update(seoMetadata).set({ ...pageSeoPayload(blueprint, pagePath), updatedAt: new Date() }).where(eq(seoMetadata.id, existingSeo.id));
      counters.seoUpdated++;
    } else {
      await db.insert(seoMetadata).values({ tenantId: tenant.id, path: pagePath, ...pageSeoPayload(blueprint, pagePath) });
      counters.seoCreated++;
    }
  }

  for (const blueprint of manifest.docs || []) {
    const [existingPage] = await db
      .select()
      .from(tenantPages)
      .where(and(eq(tenantPages.tenantId, tenant.id), eq(tenantPages.pageKey, blueprint.pageKey)))
      .limit(1);

    if (existingPage) {
      await db.update(tenantPages).set({ ...docPagePayload(blueprint), updatedAt: new Date() }).where(eq(tenantPages.id, existingPage.id));
      counters.docsUpdated++;
    } else {
      await db.insert(tenantPages).values({ tenantId: tenant.id, pageKey: blueprint.pageKey, ...docPagePayload(blueprint) });
      counters.docsCreated++;
    }

    const docPath = `/docs/${blueprint.slug}`;
    const [existingSeo] = await db
      .select()
      .from(seoMetadata)
      .where(and(eq(seoMetadata.tenantId, tenant.id), eq(seoMetadata.path, docPath)))
      .limit(1);

    if (existingSeo) {
      await db.update(seoMetadata).set({ ...docSeoPayload(blueprint, docPath), updatedAt: new Date() }).where(eq(seoMetadata.id, existingSeo.id));
      counters.seoUpdated++;
    } else {
      await db.insert(seoMetadata).values({ tenantId: tenant.id, path: docPath, ...docSeoPayload(blueprint, docPath) });
      counters.seoCreated++;
    }
  }

  for (const blueprint of manifest.blog || []) {
    const [existingBlog] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.tenantId, tenant.id), eq(blogPosts.slug, blueprint.slug)))
      .limit(1);

    if (existingBlog) {
      await db.update(blogPosts).set(blogPayload(blueprint)).where(eq(blogPosts.id, existingBlog.id));
      counters.blogUpdated++;
    } else {
      await db.insert(blogPosts).values({ tenantId: tenant.id, slug: blueprint.slug, ...blogPayload(blueprint) });
      counters.blogCreated++;
    }

    const blogPath = `/blog/${blueprint.slug}`;
    const [existingSeo] = await db
      .select()
      .from(seoMetadata)
      .where(and(eq(seoMetadata.tenantId, tenant.id), eq(seoMetadata.path, blogPath)))
      .limit(1);

    if (existingSeo) {
      await db.update(seoMetadata).set({ ...blogSeoPayload(blueprint, blogPath), updatedAt: new Date() }).where(eq(seoMetadata.id, existingSeo.id));
      counters.seoUpdated++;
    } else {
      await db.insert(seoMetadata).values({ tenantId: tenant.id, path: blogPath, ...blogSeoPayload(blueprint, blogPath) });
      counters.seoCreated++;
    }
  }

  return {
    tenantId: tenant.id,
    tenantDomain,
    ...counters,
  };
}
