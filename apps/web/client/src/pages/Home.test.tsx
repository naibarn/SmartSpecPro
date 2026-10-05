/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../locales/en/publicSite.json";
import th from "../locales/th/publicSite.json";

const testState = vi.hoisted(() => ({
  language: "en",
  seoProps: [] as Array<Record<string, unknown>>,
  tenantPage: null as Record<string, any> | null,
  tenant: {
    id: "tenant-smarthub",
    slug: "smart-ai-hub",
    name: "SmartAIHub",
    primaryDomain: "smartaihub.app",
    seo: { defaultDescription: "SmartAIHub default description" },
  } as Record<string, any>,
  isLoading: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const locale = testState.language === "th" ? th : en;
      return locale[key as keyof typeof locale] ?? key;
    },
    i18n: {
      language: testState.language,
      resolvedLanguage: testState.language,
    },
  }),
}));
vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/Seo", () => ({
  Seo: (props: Record<string, unknown>) => {
    testState.seoProps.push(props);
    return null;
  },
}));
vi.mock("@/components/emergency/EmergencyPublicEntry", () => ({
  default: () => null,
}));
vi.mock("@/hooks/useTenantPage", () => ({
  useTenantPage: () => ({ page: testState.tenantPage, isLoading: false }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: testState.tenant, isLoading: testState.isLoading }),
}));

import Home from "./Home";

describe("public homepage", () => {
  beforeEach(() => {
    testState.language = "en";
    testState.seoProps = [];
    testState.tenantPage = null;
    testState.isLoading = false;
    testState.tenant = {
      id: "tenant-smarthub",
      slug: "smart-ai-hub",
      name: "SmartAIHub",
      primaryDomain: "smartaihub.app",
      seo: { defaultDescription: "SmartAIHub default description" },
    };
    document.documentElement.lang = "en";
  });

  it("renders its public content and working primary entry points immediately", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: en["homePublic.title"] })
    ).toBeTruthy();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: en["hero.primaryCta"] })
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("link", { name: en["hero.secondaryCta"] })
    ).toHaveAttribute("href", "/features");
    expect(
      screen.getByRole("link", { name: en["homePublic.flagshipTitle"] })
    ).toHaveAttribute("href", "#home-flagship-title");
    expect(
      screen.getByRole("heading", { level: 2, name: en["homePublic.flagshipTitle"] })
    ).toBeTruthy();
    expect(screen.getByText(en["homePublic.flowTitle"])).toBeTruthy();
    expect(screen.getByText(en["homePublic.seriesFlowTitle"])).toBeTruthy();
    expect(
      screen.getAllByText(en["homePublic.illustrationDisclosure"])
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("generic").filter(element =>
        element.getAttribute("style")?.includes("margin-inline: auto")
      ).length
    ).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByRole("link", { name: en["homePublic.flagshipCta"] })
    ).toHaveAttribute("href", "/login?returnUrl=%2Fdrama-series");
    expect(
      screen.getByRole("link", { name: en["homePublic.flagshipDetailsCta"] })
    ).toHaveAttribute("href", "/features#vertical-series");
    expect(
      screen.getByRole("link", { name: en["homePublic.galleryLink"] })
    ).toHaveAttribute("href", "/gallery");
    expect(
      screen.getByRole("link", { name: en["homePublic.closingCta"] })
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("navigation", { name: en["homePublic.resourcesTitle"] })
    ).toBeTruthy();
    expect(testState.seoProps.at(-1)).toMatchObject({
      title: en["meta.title"],
      description: en["meta.description"],
      image: null,
      fetchTenantSeo: false,
      useTenantDefaults: false,
    });
    expect(document.documentElement.lang).toBe("en");
  });

  it("uses bilingual source-backed flow copy and discloses conceptual illustrations", () => {
    render(<Home />);

    expect(screen.getByText(en["homePublic.flowValueOne"])).toBeTruthy();
    expect(screen.getByText(en["homePublic.flowValueTwo"])).toBeTruthy();
    expect(document.querySelectorAll("main img")).toHaveLength(0);
  });

  it("keeps the Thai hero and metadata localized together", () => {
    testState.language = "th";
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: th["homePublic.title"] })
    ).toBeTruthy();
    expect(testState.seoProps.at(-1)).toMatchObject({
      title: th["meta.title"],
      description: th["meta.description"],
      image: null,
      fetchTenantSeo: false,
      useTenantDefaults: false,
    });
    expect(document.documentElement.lang).toBe("th");
  });

  it("renders the current tenant's published sections and SEO metadata", () => {
    testState.tenant = {
      id: "tenant-example",
      slug: "example-tenant",
      primaryDomain: "example-tenant.test",
      name: "Example Tenant",
      seo: { defaultDescription: "Example tenant description" },
    };
    testState.tenantPage = {
      id: 24,
      tenantId: "tenant-example",
      pageKey: "home",
      title: "Example tenant home",
      slug: "home",
      isPublished: true,
      metadata: { description: "Tenant-specific intro", keywords: ["example"] },
      sections: [
        {
          id: "hero",
          type: "hero",
          title: "Example tenant headline",
          subtitle: "Content belonging to this tenant",
          buttons: [{ text: "Explore", link: "/features", style: "primary" }],
        },
        {
          id: "features",
          type: "features",
          title: "Tenant services",
          items: [{ title: "Private service", description: "Only for this tenant" }],
        },
      ],
    };

    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Example tenant headline" })).toBeTruthy();
    expect(screen.getByText("Only for this tenant")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/features");
    expect(testState.seoProps.at(-1)).toMatchObject({
      title: "Example tenant home",
      description: "Tenant-specific intro",
      keywords: ["example"],
    });
  });

  it("keeps the Spec 263 platform homepage when a legacy CMS home is published", () => {
    testState.tenantPage = {
      id: 41,
      tenantId: "tenant-smarthub",
      pageKey: "home",
      title: "SmartAIHub tenant-owned home",
      slug: "home",
      isPublished: true,
      metadata: { description: "Approved tenant homepage content" },
      sections: [
        {
          id: "hero",
          type: "hero",
          title: "Tenant homepage headline",
          subtitle: "Published for this SmartAIHub tenant only",
        },
      ],
    };

    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: en["homePublic.title"] })
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Tenant homepage headline" })
    ).toBeNull();
    expect(testState.seoProps.at(-1)).toMatchObject({
      title: en["meta.title"],
      description: en["meta.description"],
    });
  });

  it("renders legacy tenant HTML through the safe content renderer", () => {
    testState.tenant = {
      id: "tenant-legacy",
      slug: "legacy-tenant",
      primaryDomain: "legacy-tenant.test",
      name: "Legacy Tenant",
      seo: { defaultDescription: "Legacy tenant description" },
    };
    testState.tenantPage = {
      id: 25,
      tenantId: "tenant-legacy",
      pageKey: "home",
      title: "Legacy tenant home",
      slug: "home",
      isPublished: true,
      content: "<h2>Legacy tenant content</h2><script>window.compromised = true</script>",
      sections: [],
    };

    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Legacy tenant home" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Legacy tenant content" })).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });

  it("never shows SmartAIHub homepage copy when another tenant has no published home page", () => {
    testState.tenant = {
      id: "tenant-customer",
      slug: "customer-site",
      primaryDomain: "customer-site.test",
      name: "Customer Site",
      seo: { defaultDescription: "A site managed by this customer" },
    };

    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Customer Site" })).toBeTruthy();
    expect(screen.getByText("A site managed by this customer")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: en["homePublic.title"] })).toBeNull();
  });

  it("does not show SmartAIHub content while tenant identity is loading", async () => {
    testState.isLoading = true;
    const { container } = render(<Home />);
    expect(container).toBeEmptyDOMElement();
    testState.isLoading = false;
  });

  it("uses the verified primary domain instead of a mutable tenant slug", () => {
    testState.tenant = {
      id: "tenant-smarthub",
      slug: "renamed-slug",
      name: "SmartAIHub",
      primaryDomain: "smartaihub.app",
      seo: {},
    };
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: en["homePublic.title"] })).toBeTruthy();
  });
});
