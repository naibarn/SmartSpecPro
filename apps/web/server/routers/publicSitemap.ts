import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { blogPosts, tenants, tenantPages } from "../../drizzle/schema";
import { db } from "../db";
import { smartaihubStaticSitemapPaths } from "../../shared/smartaihubPublicIndex";

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

function resolveBaseUrl(req: Request, tenantDomain?: string | null): string {
  const host = tenantDomain || req.get("host") || "smartaihub.app";
  return `${req.protocol}://${host}`;
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

async function buildSitemapUrls(req: Request): Promise<SitemapUrl[]> {
  const dbInstance = await db.instance;
  const [tenant] = req.hostname
    ? await dbInstance.select().from(tenants).where(eq(tenants.primaryDomain, req.hostname)).limit(1)
    : [];
  const baseUrl = resolveBaseUrl(req, tenant?.primaryDomain || req.hostname);

  const urls: SitemapUrl[] = smartaihubStaticSitemapPaths.map((entry) => ({
    loc: `${baseUrl}${entry.path}`,
    priority: entry.priority,
  }));

  if (!tenant) {
    return urls;
  }

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

  const seen = new Set<string>();
  return urls.filter((entry) => {
    if (seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
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
    const baseUrl = resolveBaseUrl(req, req.hostname || "smartaihub.app");
    res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });
}
