import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../locales/en/publicSite.json";
import th from "../../locales/th/publicSite.json";
import { PUBLIC_HOME_SEO } from "@shared/publicHomeContent";

function webPath(relativePath: string): string {
  const candidates = [
    resolve(process.cwd(), "apps/web", relativePath),
    resolve(process.cwd(), relativePath),
  ];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error(`Could not locate apps/web/${relativePath}`);
  return found;
}

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

    const staticShell = readFileSync(webPath("client/index.html"), "utf8");
    expect(staticShell).toContain(`<title data-rh="true">${PUBLIC_HOME_SEO.en.title}</title>`);
    expect(staticShell).toContain(
      `<meta data-rh="true" name="description" content="${PUBLIC_HOME_SEO.en.description}"`
    );
    expect(staticShell).not.toContain("dashboard-preview.jpg");
  });

  it("leads with a supported creation outcome instead of generic product information", () => {
    expect(en["homePublic.title"]).toMatch(/one AI workspace/i);
    expect(th["homePublic.title"]).toMatch(/พื้นที่ทำงาน AI/);
    expect(en["homePublic.description"]).toMatch(/chat, media creation, and vertical series/i);
    expect(th["homePublic.description"]).toMatch(/แชต สร้างสื่อ และซีรีส์แนวตั้ง/);
    expect(en["homePublic.whyTitle"]).toMatch(/Start with the work/i);
    expect(th["homePublic.whyTitle"]).toMatch(/เริ่มจากงานที่อยากทำ/);
    expect(en["homePublic.title"]).not.toMatch(/product information/i);
    expect(th["homePublic.title"]).not.toMatch(/ข้อมูลผลิตภัณฑ์/);
  });

  it("keeps the generated human context bilingual, disclosed, and locally owned", () => {
    for (const image of [
      "client/public/images/public-home-human-editorial-480.webp",
      "client/public/images/public-home-human-editorial-768.webp",
      "client/public/images/public-home-human-editorial-1020.webp",
      "client/public/images/public-home-human-editorial.webp",
    ]) {
      expect(existsSync(webPath(image))).toBe(true);
    }

    for (const locale of [en, th]) {
      expect(locale["homePublic.humanImageAlt"]).toBeTruthy();
      expect(locale["homePublic.humanImageDisclosure"]).toMatch(/customer|ลูกค้า/);
      expect(locale["homePublic.humanImageFallback"]).toBeTruthy();
    }

    const component = readFileSync(
      webPath("client/src/components/publicUi/PublicHomeExperience.tsx"),
      "utf8"
    );
    expect(component).toContain("public-home-human-editorial.webp");
    expect(component).toContain("srcSet=");
    expect(component).toContain("public-home-human-editorial-480.webp 480w");
    expect(component).toContain("public-home-human-editorial-768.webp 768w");
    expect(component).toContain("public-home-human-editorial-1020.webp 1020w");
    expect(component).toContain("sizes=");
    expect(component).toContain("(max-width: 45.99rem) calc(100vw - 4rem)");
    expect(component).toContain("(max-width: 80rem) calc((100vw - 6rem) / 2), 38.25rem");
    expect(component).toContain('fetchPriority="high"');
    expect(component).toContain("onError={() => setImageAvailable(false)}");
    expect(component).toContain("copy.humanImageFallback");
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
      readFileSync(webPath("client/src/locales/en/nav.json"), "utf8")
    ) as Record<string, string>;
    const thaiNav = JSON.parse(
      readFileSync(webPath("client/src/locales/th/nav.json"), "utf8")
    ) as Record<string, string>;
    expect(englishNav["navbar.getStarted"]).toBeTruthy();
    expect(thaiNav["navbar.getStarted"]).toBeTruthy();

    const signup = readFileSync(webPath("client/src/pages/Signup.tsx"), "utf8");
    expect(signup).toMatch(/isInviteOnly\s*&&\s*\(/);
    expect(signup).toContain("Registration currently requires a valid invitation code.");
    expect(signup).toContain("Registration options are currently unavailable. Please try again shortly.");
    expect(signup).not.toMatch(/10K\+ Developers|50K\+ Projects|99\.9% Uptime|Join thousands of developers/i);
  });
});
