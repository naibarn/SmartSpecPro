import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({ instance: null as unknown }));

vi.mock("../db", () => ({
  db: {
    get instance() {
      return dbState.instance ?? Promise.reject(new Error("database unavailable"));
    },
  },
}));

import {
  buildSitemapUrls,
  privateRobotsTxt,
  robotsTxt,
  tenantRobotsTxt,
  toLlmsTxt,
  toTenantLlmsTxt,
} from "./publicSitemap";
import { tenantPages, tenants } from "../../drizzle/schema";

function makeRequest() {
  return {
    hostname: "smartaihub.app",
    protocol: "http",
    get(header: string) {
      const headers: Record<string, string> = {
        host: "smartaihub.app",
        "x-forwarded-proto": "https",
      };
      return headers[header.toLowerCase()];
    },
  } as any;
}

function makeSpoofedRequest() {
  return {
    hostname: "evil.example",
    protocol: "http",
    get(header: string) {
      const headers: Record<string, string> = {
        host: "evil.example",
        "x-forwarded-proto": "http",
      };
      return headers[header.toLowerCase()];
    },
  } as any;
}

describe("public SEO discovery routes", () => {
  beforeEach(() => {
    dbState.instance = null;
  });

  it("builds a static sitemap fallback when tenant lookup fails", async () => {
    const urls = await buildSitemapUrls(makeRequest());

    expect(urls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ loc: "https://smartaihub.app/" }),
        expect.objectContaining({ loc: "https://smartaihub.app/docs/seo/ai-search-optimization" }),
      ])
    );
  });

  it("does not derive fallback public URLs from spoofed Host headers", async () => {
    const urls = await buildSitemapUrls(makeSpoofedRequest());

    expect(urls[0]?.loc).toBe("https://smartaihub.app/");
    expect(urls.every((url) => url.loc.startsWith("https://smartaihub.app"))).toBe(true);
  });

  it("uses the mapped tenant pages for a verified secondary domain", async () => {
    const tenant = {
      id: "tenant-secondary-domain",
      name: "Customer site",
      primaryDomain: "customer.example",
      domains: ["www.customer.example"],
      isActive: true,
    };
    const pages = [{
      id: 7,
      tenantId: tenant.id,
      pageKey: "home",
      slug: "home",
      title: "Home",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    }, {
      id: 8,
      tenantId: tenant.id,
      pageKey: "about",
      slug: "about-us",
      title: "About",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    }, {
      id: 9,
      tenantId: tenant.id,
      pageKey: "features",
      slug: "features",
      title: "Features",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    }, {
      id: 10,
      tenantId: tenant.id,
      pageKey: "docs",
      slug: "docs",
      title: "Documentation",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    }, {
      id: 11,
      tenantId: tenant.id,
      pageKey: "blog",
      slug: "blog",
      title: "Blog",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    }];
    let primaryDomainQuery = true;
    const dbInstance = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            const rows = table === tenants ? [tenant] : table === tenantPages ? pages : [];
            const query = {
              limit: async () => {
                if (table === tenants && primaryDomainQuery) {
                  primaryDomainQuery = false;
                  return [];
                }
                return rows;
              },
              orderBy: () => query,
              then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
                Promise.resolve(rows).then(resolve, reject),
            };
            return query;
          },
        }),
      }),
    };
    dbState.instance = dbInstance;

    const urls = await buildSitemapUrls({ ...makeRequest(), hostname: "www.customer.example" } as any);

    expect(urls).toContainEqual(expect.objectContaining({ loc: "https://customer.example/" }));
    expect(urls.some((url) => url.loc.includes("about-us"))).toBe(false);
    expect(urls).toContainEqual(expect.objectContaining({ loc: "https://customer.example/features" }));
    expect(urls).toContainEqual(expect.objectContaining({ loc: "https://customer.example/docs" }));
    expect(urls).toContainEqual(expect.objectContaining({ loc: "https://customer.example/blog" }));
  });

  it("builds robots.txt with AI search access and training restrictions", () => {
    const text = robotsTxt("https://smartaihub.app");

    expect(text).toContain("Content-Signal: search=yes,ai-input=yes,ai-train=no");
    expect(text).toContain("User-agent: GPTBot\nAllow: /");
    expect(text).toContain("User-agent: ClaudeBot\nAllow: /");
    expect(text).toContain("User-agent: Google-Extended\nAllow: /");
    expect(text).toContain("User-agent: CCBot\nAllow: /");
    expect(text).toContain("Sitemap: https://smartaihub.app/sitemap.xml");
    expect(text).toContain("LLMs: https://smartaihub.app/llms.txt");
  });

  it("builds llms.txt as markdown instead of the SPA shell", () => {
    const text = toLlmsTxt("https://smartaihub.app");

    expect(text).toContain("# SmartAIHub");
    expect(text).toContain("## Docs Clusters");
    expect(text).toContain("[AI Search Optimization](https://smartaihub.app/docs/seo/ai-search-optimization)");
    expect(text).not.toContain("<div id=\"root\"></div>");
  });

  it("builds llms-full.txt with citation and access guidance", () => {
    const text = toLlmsTxt("https://smartaihub.app", true);

    expect(text).toContain("## Citation Guidance");
    expect(text).toContain("## AI Access Policy");
  });

  it("builds a tenant-only LLM index from that tenant's published routes", () => {
    const text = toTenantLlmsTxt("https://customer.example", "Customer Site", [
      {
        pageKey: "home",
        slug: "home",
        title: "Customer home",
        metadata: { description: "Tenant-owned homepage copy" },
      },
      {
        pageKey: "features",
        slug: "features",
        title: "Customer features",
        metadata: { description: "Features for this customer" },
      },
      {
        pageKey: "secret-admin-page",
        slug: "private-data",
        title: "Should not be indexed",
      },
    ]);

    expect(text).toContain("# Customer Site");
    expect(text).toContain("https://customer.example/");
    expect(text).toContain("https://customer.example/features");
    expect(text).not.toContain("SmartAIHub");
    expect(text).not.toContain("private-data");
  });

  it("keeps tenant and unrecognized-host crawler policies separate from SmartAIHub", () => {
    const tenantRobots = tenantRobotsTxt("https://customer.example");
    expect(tenantRobots).toContain("Sitemap: https://customer.example/sitemap.xml");
    expect(tenantRobots).not.toContain("smartaihub.app");
    expect(privateRobotsTxt()).toContain("Disallow: /");
    expect(privateRobotsTxt()).not.toContain("smartaihub.app");
  });
});
