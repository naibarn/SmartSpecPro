import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { blogPosts, tenants, tenantPages } from "../../drizzle/schema";
import { db } from "../db";
import {
  smartaihubPublicIndexSections,
  smartaihubStaticSitemapPaths,
} from "../../shared/smartaihubPublicIndex";

type SitemapUrl = {
  loc: string;
  lastmod?: string;
  priority?: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!/^[a-z0-9.-]+$/.test(trimmed)) return null;
  return trimmed;
}

function configuredPublicBaseUrl(): string {
  const candidate = process.env.SMARTAIHUB_PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL;
  if (!candidate) return "https://smartaihub.app";

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return "https://smartaihub.app";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://smartaihub.app";
  }
}

function resolveBaseUrl(_req: Request, tenantDomain?: string | null): string {
  const host = normalizeHost(tenantDomain);
  if (host) return `https://${host}`;
  return configuredPublicBaseUrl();
}

function pathFromTenantPage(pageKey: string, slug: string): string {
  if (pageKey === "home") return "/";
  if (pageKey.startsWith("docs-")) {
    return `/docs/${slug}`;
  }
  return `/${slug}`;
}

function toXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((url) => {
      const lines = [`  <loc>${escapeXml(url.loc)}</loc>`];
      if (url.lastmod) lines.push(`  <lastmod>${escapeXml(url.lastmod)}</lastmod>`);
      if (typeof url.priority === "number") lines.push(`  <priority>${url.priority.toFixed(1)}</priority>`);
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

export async function buildSitemapUrls(req: Request): Promise<SitemapUrl[]> {
  const fallbackBaseUrl = resolveBaseUrl(req);
  const urls: SitemapUrl[] = smartaihubStaticSitemapPaths.map((entry) => ({
    loc: `${fallbackBaseUrl}${entry.path}`,
    priority: entry.priority,
  }));

  let dbInstance: Awaited<typeof db.instance>;
  let tenant: typeof tenants.$inferSelect | undefined;
  const requestHostname = normalizeHost(req.hostname);

  try {
    dbInstance = await db.instance;
    [tenant] = requestHostname
      ? await dbInstance.select().from(tenants).where(eq(tenants.primaryDomain, requestHostname)).limit(1)
      : [];
  } catch (error) {
    console.warn("Falling back to static sitemap URLs:", error);
    return urls;
  }

  if (!tenant) {
    return urls;
  }

  const baseUrl = resolveBaseUrl(req, tenant.primaryDomain || requestHostname);

  try {
    const publishedPages = await dbInstance
      .select()
      .from(tenantPages)
      .where(and(eq(tenantPages.tenantId as any, tenant.id as any), eq(tenantPages.isPublished, true)));

    for (const page of publishedPages) {
      const path = pathFromTenantPage(page.pageKey, page.slug);
      urls.push({
        loc: `${baseUrl}${path}`,
        lastmod: page.updatedAt?.toISOString?.() || page.createdAt?.toISOString?.(),
        priority: page.pageKey === "home" ? 1.0 : page.pageKey.startsWith("docs-") ? 0.8 : 0.7,
      });
    }

    const publishedBlogPosts = await dbInstance
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.tenantId, tenant.id), eq(blogPosts.isPublished, true)))
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt));

    for (const post of publishedBlogPosts) {
      urls.push({
        loc: `${baseUrl}/blog/${post.slug}`,
        lastmod: post.updatedAt?.toISOString?.() || post.publishedAt?.toISOString?.() || post.createdAt?.toISOString?.(),
        priority: 0.7,
      });
    }
  } catch (error) {
    console.warn("Sitemap dynamic content lookup failed; serving static sitemap URLs:", error);
  }

  const seen = new Set<string>();
  return urls.filter((entry) => {
    if (seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
}

export function toLlmsTxt(baseUrl: string, full = false): string {
  const lines = [
    "# SmartAIHub",
    "",
    "> SmartAIHub is an enterprise AI skill marketplace for reusable skills, virtual workflows, swarm execution, and chat, presentation, image, and video outputs.",
    "",
    "Use this file as the LLM-readable navigation index for SmartAIHub public content. Prefer the linked pages for current product, workflow, docs, media, support, and trust information.",
    "",
  ];

  for (const section of smartaihubPublicIndexSections) {
    lines.push(`## ${section.title}`, "", section.description, "");
    for (const link of section.links) {
      lines.push(`- [${link.label}](${baseUrl}${link.href}): ${link.description}`);
    }
    lines.push("");
  }

  if (full) {
    lines.push(
      "## Citation Guidance",
      "",
      "- Cite the canonical SmartAIHub page URL when referencing product capabilities.",
      "- Use docs and FAQ pages for direct answers about marketplace discovery, workflows, swarms, and output generation.",
      "- Use blog pages for tutorials, implementation patterns, and content strategy examples.",
      "",
      "## AI Access Policy",
      "",
      "Search and real-time AI grounding are allowed. AI training is not granted by this file.",
      ""
    );
  }

  return `${lines.join("\n").trim()}\n`;
}

export function robotsTxt(baseUrl: string): string {
  return `# SmartAIHub crawler policy
User-agent: *
Content-Signal: search=yes,ai-input=yes,ai-train=no
Allow: /

# AI search and answer engines: allow retrieval/grounding for citation.
User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Applebot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
LLMs: ${baseUrl}/llms.txt
`;
}

export function registerPublicSitemapRoutes(app: Express): void {
  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const urls = await buildSitemapUrls(req);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(toXml(urls));
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).type("text/plain").send("Failed to generate sitemap");
    }
  });

  app.get("/robots.txt", (req: Request, res: Response) => {
    const baseUrl = resolveBaseUrl(req);
    res.type("text/plain").send(robotsTxt(baseUrl));
  });

  app.get("/llms.txt", (req: Request, res: Response) => {
    const baseUrl = resolveBaseUrl(req);
    res.type("text/markdown; charset=utf-8").send(toLlmsTxt(baseUrl));
  });

  app.get("/llms-full.txt", (req: Request, res: Response) => {
    const baseUrl = resolveBaseUrl(req);
    res.type("text/markdown; charset=utf-8").send(toLlmsTxt(baseUrl, true));
  });
}
