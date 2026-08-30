import { describe, expect, it } from "vitest";
import en from "../../locales/en/publicSite.json";
import th from "../../locales/th/publicSite.json";
import {
  HOME_FEATURES,
  HOME_PUBLIC_ASSETS,
  getHomeFeatureTranslationKey,
} from "../../pages/homeContent";

describe("publicSite homepage contract", () => {
  it("keeps the English and Thai homepage namespaces in parity", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en)).toHaveLength(458);
  });

  it("promotes exactly the approved feature catalog", () => {
    expect(HOME_FEATURES).toHaveLength(15);
    expect(new Set(HOME_FEATURES.map(feature => feature.id)).size).toBe(15);
    expect(
      HOME_FEATURES.filter(feature => feature.group === "create")
    ).toHaveLength(7);
    expect(
      HOME_FEATURES.filter(feature => feature.group === "organize")
    ).toHaveLength(5);
    expect(
      HOME_FEATURES.filter(feature => feature.group === "operate")
    ).toHaveLength(3);
    expect(getHomeFeatureTranslationKey(HOME_FEATURES[0]!, "title")).toBe(
      "feature.chat.title"
    );
  });

  it("uses local public assets for every visual spotlight", () => {
    expect(
      Object.values(HOME_PUBLIC_ASSETS).every(src => src.endsWith(".webp"))
    ).toBe(true);
    expect(Object.values(HOME_PUBLIC_ASSETS)).toHaveLength(9);
  });

  it("keeps the copy-ready story bilingual and grounded in the current workflow", () => {
    for (const locale of [en, th]) {
      expect(locale["harness.title"]).toBeTruthy();
      expect(locale["harness.body"]).toContain("Skills");
      expect(locale["harness.imageAlt"]).toBeTruthy();
      expect(locale["docs.article.harnessDefinition"]).toBeTruthy();
      expect(locale["docs.article.contentExpanded"]).toContain("100");
      expect(locale["docs.article.contentExpanded"]).toContain("Shopee");
      expect(locale["docs.article.contentExpanded"]).toContain("TikTok Shop");
      expect(locale["docs.article.contentExpanded"]).toContain("Worker App");
      expect(locale["docs.article.contentExpanded"]).toContain("MCP");
      expect(locale["docs.article.contentExpanded"]).toContain("Tenant");
      expect(locale["docs.article.contentExpanded"]).toContain("AI Agents");
    }
  });

  it("keeps the expanded public-site story sections translated", () => {
    for (const locale of [en, th]) {
      expect(locale["workhub.title"]).toBeTruthy();
      expect(locale["features.organization.title"]).toBeTruthy();
      expect(locale["docs.flow.title"]).toBeTruthy();
      expect(locale["features.a11y.organizationImage"]).toBeTruthy();
      expect(locale["docs.a11y.flowImage"]).toBeTruthy();
    }
  });

  it("keeps the Harness visual in the local public asset set", () => {
    expect(HOME_PUBLIC_ASSETS.harnessPlatform).toBe(
      "/images/smartaihub-domain-specific-harness.webp"
    );
  });
});
