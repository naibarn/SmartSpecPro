import { describe, expect, it } from "vitest";
import {
  buildPublicSeoSnapshotHtml,
  injectPublicSeoSnapshot,
} from "./publicSeoPrerender";
import { PUBLIC_HOME_SEO } from "../../shared/publicHomeContent";

const shell = `<!doctype html>
<html>
  <head>
    <title>SmartAIHub</title>
    <link rel="canonical" href="https://smartaihub.app/" />
    <meta property="og:url" content="https://smartaihub.app/" />
    <meta name="description" content="Old generic description" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

describe("public SEO prerender snapshots", () => {
  it("injects a semantic main landmark and JSON-LD into the SPA shell", () => {
    const html = injectPublicSeoSnapshot(shell, "/", "https://smartaihub.app");

    expect(html).toContain('<main id="smartaihub-prerender" data-seo-prerender="true">');
    expect(html).toContain(`<h1>${PUBLIC_HOME_SEO.en.h1}</h1>`);
    expect(html).toContain(`<title>${PUBLIC_HOME_SEO.en.title}</title>`);
    expect(html).toContain(
      `content="${PUBLIC_HOME_SEO.en.description}" data-seo-prerender`
    );
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

  it("replaces generic head metadata with exactly one canonical route snapshot", () => {
    const html = injectPublicSeoSnapshot(shell, "/features?utm_source=test", "https://smartaihub.app");
    const head = html.split("</head>")[0];

    expect((head.match(/rel="canonical"/g) || []).length).toBe(1);
    expect((head.match(/property="og:url"/g) || []).length).toBe(1);
    expect((head.match(/name="description"/g) || []).length).toBe(1);
    expect(head).toContain('href="https://smartaihub.app/features" data-seo-prerender="true"');
    expect(html).not.toContain('href="https://smartaihub.app/" />');
  });

  it("renders localized and source-backed homepage content for Thai requests", () => {
    const html = buildPublicSeoSnapshotHtml("/", "https://smartaihub.app", "th");

    expect(html).toContain(`<h1>${PUBLIC_HOME_SEO.th.h1}</h1>`);
    expect(html).toContain(PUBLIC_HOME_SEO.th.description);
    expect(html).toContain("ซีรีส์แนวตั้ง");
    expect(html).not.toContain("What outputs can SmartAIHub create?");
  });

  it("does not inject snapshots into private or API routes", () => {
    expect(injectPublicSeoSnapshot(shell, "/admin/users")).toBe(shell);
    expect(injectPublicSeoSnapshot(shell, "/api/tenant/current")).toBe(shell);
    expect(injectPublicSeoSnapshot(shell, "/marketplace/auto-review/run-1")).toBe(shell);
    expect(injectPublicSeoSnapshot(shell, "/marketplace/auto-review/new/product-1")).toBe(shell);
    expect(injectPublicSeoSnapshot(shell, "/marketplace/approved-public-slug")).not.toBe(shell);
  });
});
