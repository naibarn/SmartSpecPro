import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    get instance() {
      return Promise.reject(new Error("database unavailable"));
    },
  },
}));

import { buildSitemapUrls, robotsTxt, toLlmsTxt } from "./publicSitemap";

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
});
