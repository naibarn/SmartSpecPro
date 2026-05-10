import { describe, expect, it } from "vitest";
import {
  buildPublicSeoSnapshotHtml,
  injectPublicSeoSnapshot,
} from "./publicSeoPrerender";

const shell = `<!doctype html>
<html>
  <head><title>SmartAIHub</title></head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

describe("public SEO prerender snapshots", () => {
  it("injects a semantic main landmark and JSON-LD into the SPA shell", () => {
    const html = injectPublicSeoSnapshot(shell, "/", "https://smartaihub.app");

    expect(html).toContain('<main id="smartaihub-prerender" data-seo-prerender="true">');
    expect(html).toContain("<h1>SmartAIHub: AI skill marketplace and workflow swarms</h1>");
    expect(html).toContain("Related SmartAIHub pages");
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('<a href="/marketplace">Marketplace</a>');
  });

  it("creates AI-search specific FAQ content for the AI search docs route", () => {
    const html = buildPublicSeoSnapshotHtml(
      "/docs/seo/ai-search-optimization?utm_source=test",
      "https://smartaihub.app"
    );

    expect(html).toContain("<h1>AI search optimization for SmartAIHub</h1>");
    expect(html).toContain("What is llms.txt?");
    expect(html).toContain("Why add JSON-LD for AI search?");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('href="https://smartaihub.app/docs/seo/ai-search-optimization"');
  });

  it("does not inject snapshots into private or API routes", () => {
    expect(injectPublicSeoSnapshot(shell, "/admin/users")).toBe(shell);
    expect(injectPublicSeoSnapshot(shell, "/api/tenant/current")).toBe(shell);
  });
});
