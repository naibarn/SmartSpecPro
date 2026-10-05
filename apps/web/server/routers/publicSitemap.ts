import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { TenantRequest } from "../_core/tenant";
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

function pathFromTenantPage(pageKey: string, slug: string): string | null {
  return tenantPublicPagePath({ pageKey, slug, title: "" });
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
  const smartAiHubUrls = () => smartaihubStaticSitemapPaths.map((entry) => ({
    loc: `${fallbackBaseUrl}${entry.path}`,
    priority: entry.priority,
  }));

  let dbInstance: Awaited<typeof db.instance>;
  let tenant: typeof tenants.$inferSelect | undefined;
  const requestHostname = normalizeHost(req.hostname);

  try {
    dbInstance = await db.instance;
    const [primaryTenant] = requestHostname
      ? await dbInstance
          .select()
          .from(tenants)
          .where(and(eq(tenants.primaryDomain, requestHostname), eq(tenants.isActive, true)))
          .limit(1)
      : [];
    tenant = primaryTenant;

    if (!tenant && requestHostname) {
      const activeTenants = await dbInstance
        .select()
        .from(tenants)
        .where(eq(tenants.isActive, true));
      tenant = activeTenants.find((candidate) => candidate.domains?.includes(requestHostname));
    }
  } catch (error) {
    console.warn("Falling back to static sitemap URLs:", error);
    return smartAiHubUrls();
  }

  if (!tenant) {
    return smartAiHubUrls();
  }

  const baseUrl = resolveBaseUrl(req, tenant.primaryDomain || requestHostname);
  const urls: SitemapUrl[] = normalizeHost(tenant.primaryDomain) === "smartaihub.app"
    ? smartAiHubUrls()
    : [];

  try {
    const publishedPages = await dbInstance
      .select()
      .from(tenantPages)
      .where(and(eq(tenantPages.tenantId, tenant.id), eq(tenantPages.isPublished, true)));

    for (const page of publishedPages) {
      const path = pathFromTenantPage(page.pageKey, page.slug);
      // Only advertise paths rendered by the tenant-public route boundary.
      if (!path) continue;
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
    "> SmartAIHub provides public information about its product, documentation, media tools, and support.",
    "",
    "Use this file as the LLM-readable navigation index for SmartAIHub public content. Prefer linked pages for current product, docs, media, support, and trust information.",
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
      "- Use docs and FAQ pages for direct answers about marketplace discovery, product use, and available outputs.",
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

export function tenantRobotsTxt(baseUrl: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
LLMs: ${baseUrl}/llms.txt
`;
}

export function privateRobotsTxt(): string {
  return "User-agent: *\nDisallow: /\n";
}

function isSmartAIHubHost(host: string | null | undefined): boolean {
  return normalizeHost(host)?.replace(/^www\./, "") === "smartaihub.app";
}

function resolvedTenant(req: Request) {
  return (req as TenantRequest).tenant;
}

type TenantPublicPage = {
  pageKey: string;
  slug: string;
  title: string;
  metadata?: { description?: string } | null;
};

const tenantStaticPublicPaths: Record<string, string> = {
  about: "/about",
  blog: "/blog",
  careers: "/careers",
  changelog: "/changelog",
  community: "/community",
  contact: "/contact",
  docs: "/docs",
  features: "/features",
  gallery: "/gallery",
  help: "/help",
  marketplace: "/marketplace",
  pricing: "/pricing",
  privacy: "/privacy",
  resources: "/resources",
  security: "/security",
  status: "/status",
  support: "/support",
  terms: "/terms",
};

function tenantPublicPagePath(page: TenantPublicPage): string | null {
  if (page.pageKey === "home") return "/";
  if (tenantStaticPublicPaths[page.pageKey]) return tenantStaticPublicPaths[page.pageKey];
  if (page.pageKey.startsWith("docs-")) return `/docs/${page.slug.replace(/^\/+/, "")}`;
  for (const prefix of ["help-", "blog-", "marketplace-"]) {
    if (page.pageKey.startsWith(prefix)) {
      return `/${prefix.slice(0, -1)}/${page.pageKey.slice(prefix.length).replace(/\//g, "-")}`;
    }
  }
  return null;
}

function markdownLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
}

function markdownLabel(value: string): string {
  return markdownLine(value).replace(/[\\`*_{}[\]()#+.!|>]/g, "\\$&");
}

export function toTenantLlmsTxt(
  baseUrl: string,
  tenantName: string,
  pages: TenantPublicPage[],
): string {
  const safeName = markdownLine(tenantName) || "Tenant site";
  const lines = [
    `# ${markdownLabel(safeName)}`,
    "",
    `> Public pages published by ${markdownLabel(safeName)}.`,
    "",
    "## Published pages",
    "",
  ];
  const seen = new Set<string>();

  for (const page of pages) {
    const path = tenantPublicPagePath(page);
    if (!path) continue;
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || seen.has(url.toString())) continue;
    seen.add(url.toString());
    const description = markdownLabel(page.metadata?.description || "");
    lines.push(`- [${markdownLabel(page.title)}](${url.toString()})${description ? `: ${description}` : ""}`);
  }

  return `${lines.join("\n").trim()}\n`;
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
    const tenant = resolvedTenant(req);
    if (tenant) {
      const baseUrl = resolveBaseUrl(req, tenant.primaryDomain || req.hostname);
      res.type("text/plain").send(
        isSmartAIHubHost(tenant.primaryDomain) ? robotsTxt(baseUrl) : tenantRobotsTxt(baseUrl),
      );
      return;
    }
    if (isSmartAIHubHost(req.hostname)) {
      res.type("text/plain").send(robotsTxt(resolveBaseUrl(req)));
      return;
    }
    res.type("text/plain").send(privateRobotsTxt());
  });

  const handleLlmsTxt = async (req: Request, res: Response, full: boolean) => {
    const tenant = resolvedTenant(req);
    if (tenant) {
      const baseUrl = resolveBaseUrl(req, tenant.primaryDomain || req.hostname);
      if (isSmartAIHubHost(tenant.primaryDomain)) {
        res.type("text/markdown; charset=utf-8").send(toLlmsTxt(baseUrl, full));
        return;
      }

      try {
        const dbInstance = await db.instance;
        const pages = await dbInstance
          .select()
          .from(tenantPages)
          .where(and(eq(tenantPages.tenantId, tenant.id), eq(tenantPages.isPublished, true)));
        res.type("text/markdown; charset=utf-8").send(toTenantLlmsTxt(baseUrl, tenant.name, pages));
      } catch (error) {
        console.warn("Tenant LLM index lookup failed; returning the tenant name only:", error);
        res.type("text/markdown; charset=utf-8").send(toTenantLlmsTxt(baseUrl, tenant.name, []));
      }
      return;
    }

    if (isSmartAIHubHost(req.hostname)) {
      res.type("text/markdown; charset=utf-8").send(toLlmsTxt(resolveBaseUrl(req), full));
      return;
    }
    res.status(404).type("text/plain").send("No public site is configured for this host.");
  };

  app.get("/llms.txt", (req: Request, res: Response) => void handleLlmsTxt(req, res, false));
  app.get("/llms-full.txt", (req: Request, res: Response) => void handleLlmsTxt(req, res, true));
}
