import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../locales/en/publicSite.json";
import th from "../../locales/th/publicSite.json";
import { PUBLIC_HOME_SEO } from "@shared/publicHomeContent";

describe("publicSite homepage contract", () => {
  it("keeps the English and Thai homepage namespaces in parity", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps public metadata consistent between the app and crawler snapshot", () => {
    for (const [locale, source] of [
      [en, PUBLIC_HOME_SEO.en],
      [th, PUBLIC_HOME_SEO.th],
    ] as const) {
      expect(locale["meta.title"]).toBe(source.title);
      expect(locale["meta.description"]).toBe(source.description);
      expect(locale["meta.keywords"]).toBe(source.keywords.join(", "));
      expect(locale["homePublic.title"]).toBe(source.h1);
      expect(locale["homePublic.description"]).toBe(source.description);
    }

    const staticShell = readFileSync(
      new URL("../../../../client/index.html", import.meta.url),
      "utf8"
    );
    expect(staticShell).toContain(`<title data-rh="true">${PUBLIC_HOME_SEO.en.title}</title>`);
    expect(staticShell).toContain(
      `<meta data-rh="true" name="description" content="${PUBLIC_HOME_SEO.en.description}"`
    );
    expect(staticShell).not.toContain("dashboard-preview.jpg");
  });

  it("leads with a supported creation outcome instead of generic product information", () => {
    expect(en["homePublic.title"]).toBe("Turn one idea into work you can keep building");
    expect(th["homePublic.title"]).toBe("เปลี่ยนไอเดียให้เป็นผลงานที่ต่อยอดได้");
    expect(en["homePublic.description"]).toMatch(/chat, media creation, and vertical series/i);
    expect(th["homePublic.description"]).toMatch(/แชต สร้างสื่อ และซีรีส์แนวตั้ง/);
    expect(en["homePublic.title"]).not.toMatch(/product information/i);
    expect(th["homePublic.title"]).not.toMatch(/ข้อมูลผลิตภัณฑ์/);
  });

  it("keeps the homepage copy clear of unverified capability and retired workflow claims", () => {
    const homepage = [
      "homePublic.eyebrow",
      "homePublic.title",
      "homePublic.description",
      "homePublic.flowLabel",
      "homePublic.flowTitle",
      "homePublic.flowValueOne",
      "homePublic.flowValueTwo",
      "homePublic.seriesFlowTitle",
      "homePublic.illustrationDisclosure",
      "homePublic.productTitle",
      "homePublic.productBody",
      "homePublic.resourcesTitle",
      "homePublic.featuresLink",
      "homePublic.docsLink",
      "homePublic.contactLink",
      "homePublic.flagshipEyebrow",
      "homePublic.flagshipTitle",
      "homePublic.flagshipBody",
      "homePublic.flagshipCta",
      "hero.primaryCta",
      "hero.secondaryCta",
      "hero.trust",
    ]
      .map(key => en[key])
      .join(" ");
    expect(homepage).not.toMatch(
      /100\+|Shopee|TikTok|Remotion|Worker App|MCP|workflows?/i
    );
  });

  it("keeps the usable homepage entry points translated", () => {
    for (const locale of [en, th]) {
      for (const key of [
        "homePublic.eyebrow",
        "homePublic.title",
        "homePublic.description",
        "homePublic.productTitle",
        "homePublic.productBody",
        "homePublic.resourcesTitle",
        "homePublic.featuresLink",
        "homePublic.docsLink",
        "homePublic.contactLink",
        "homePublic.flagshipEyebrow",
        "homePublic.flagshipTitle",
        "homePublic.flagshipBody",
        "homePublic.flagshipCta",
      ])
        expect(locale[key]).toBeTruthy();
      const visibleHomeCopy = [
        "meta.title",
        "meta.description",
        "meta.keywords",
        "hero.eyebrow",
        "hero.title",
        "hero.subtitle",
        "hero.primaryCta",
        "hero.secondaryCta",
        "hero.trust",
        "homePublic.eyebrow",
        "homePublic.title",
        "homePublic.description",
        "homePublic.productTitle",
        "homePublic.productBody",
        "homePublic.resourcesTitle",
        "homePublic.featuresLink",
        "homePublic.docsLink",
        "homePublic.contactLink",
      ]
        .map(key => locale[key])
        .join(" ");
      expect(visibleHomeCopy).not.toMatch(
        /100\+|Shopee|TikTok|Remotion|Worker App|MCP|workflows?/i
      );
    }
  });

  it("keeps public signup calls to action neutral when registration mode is runtime-configured", () => {
    expect(en["hero.primaryCta"]).toMatch(/create an account/i);
    expect(th["hero.primaryCta"]).toMatch(/สร้างบัญชี/);

    const englishNav = JSON.parse(
      readFileSync(new URL("../../locales/en/nav.json", import.meta.url), "utf8")
    ) as Record<string, string>;
    const thaiNav = JSON.parse(
      readFileSync(new URL("../../locales/th/nav.json", import.meta.url), "utf8")
    ) as Record<string, string>;
    expect(englishNav["navbar.getStarted"]).toBeTruthy();
    expect(thaiNav["navbar.getStarted"]).toBeTruthy();

    const signup = readFileSync(
      new URL("../../pages/Signup.tsx", import.meta.url),
      "utf8"
    );
    expect(signup).toMatch(/isInviteOnly\s*&&\s*\(/);
    expect(signup).toContain("Registration currently requires a valid invitation code.");
    expect(signup).toContain("Registration options are currently unavailable. Please try again shortly.");
    expect(signup).not.toMatch(/10K\+ Developers|50K\+ Projects|99\.9% Uptime|Join thousands of developers/i);
  });
});
