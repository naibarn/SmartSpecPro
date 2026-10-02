import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { smartaihubPublicIndexSections, smartaihubStaticSitemapPaths } from "../smartaihubPublicIndex";
import { SPEC260_PAGE_ROUTES } from "@smartspec/shared/src/emergencyRouteManifest";

describe("public truth map crawl guard", () => {
  it("does not advertise retired workflow routes or legacy workflow-builder claims", () => {
    const indexedLinks = smartaihubPublicIndexSections.flatMap((section) => section.links.map((link) => link.href));
    const indexedCopy = smartaihubPublicIndexSections.flatMap((section) => section.links.map((link) => `${link.label} ${link.description}`)).join(" ");
    const sitemapPaths = smartaihubStaticSitemapPaths.map((entry) => entry.path);
    const publicSources = [
      "public/sitemap.xml",
      "server/services/publicSeoPrerender.ts",
      "server/routers/publicSitemap.ts",
      "client/src/components/Footer.tsx",
    ].map((path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")).join("\n");

    expect(indexedLinks).not.toContain("/workflows");
    expect(sitemapPaths).not.toContain("/workflows");
    expect(indexedCopy).not.toMatch(/virtual workflows?|workflow builder|swarm execution/i);
    expect(publicSources).not.toMatch(/\/workflows(?:["'<\s]|$)|virtual workflows?|workflow builder|swarm execution|workflow swarms/i);
    expect(indexedCopy).not.toMatch(/enterprise capabilities|plans and credits|platform health and uptime|security and governance overview|publishing, governance|strong intent matching|brand-safe|in one AI workspace|marketplace publishing|skill marketplace|reusable skills|skill-aware/i);
    expect(publicSources).not.toMatch(/improve governance|guaranteed uptime|enterprise capabilities|version, and reuse approved skills|capabilities that teams can discover and publish|AI skill marketplace|approved skills|reusable skills|repeatable AI work/i);
  });

  it("keeps token, auth, desktop handoff and authenticated routes out of the static sitemap", () => {
    const sitemapPaths = new Set(smartaihubStaticSitemapPaths.map((entry) => entry.path));
    const noIndexPaths = [
      "/desktop/open", "/desktop/view", "/share/:token", "/share/vd/:token",
      "/evidence-review/:publicCaseId", "/verify-email", "/verify-email-change",
      "/auth/callback/:provider", "/login", "/signup", "/forgot-password",
      "/decision-intelligence", "/admin", "/domain-admin", "/chat", "/automation",
    ];
    for (const path of noIndexPaths) expect(sitemapPaths.has(path)).toBe(false);
    for (const route of SPEC260_PAGE_ROUTES.filter((item) => item.access !== "public")) {
      expect(sitemapPaths.has(route.path)).toBe(false);
    }
  });
});
