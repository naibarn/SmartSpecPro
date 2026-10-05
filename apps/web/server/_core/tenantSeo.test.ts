import { describe, expect, it } from "vitest";
import { getTenantSeo } from "./tenant";

describe("tenant public SEO truth defaults", () => {
  it("uses neutral defaults and sanitizes retired claims in tenant overrides", () => {
    const seo = getTenantSeo({
      name: "Customer",
      seoConfig: {
        defaultTitle: "Customer | Skill Marketplace",
        defaultDescription: "Virtual workflows and workflow swarms",
        defaultKeywords: ["swarm execution", "customer AI"],
        aiContext: "A skill marketplace",
        aiKeyFacts: ["Runs virtual workflows"],
      },
    } as any);
    const serialized = JSON.stringify(seo).toLowerCase();
    expect(serialized).not.toMatch(/skill marketplace|virtual workflows?|workflow swarms?|swarm execution/);
    expect(seo.defaultTitle).toContain("AI tools");
  });
});
