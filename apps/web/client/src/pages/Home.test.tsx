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

import Home from "./Home";

describe("public homepage", () => {
  beforeEach(() => {
    testState.language = "en";
    testState.seoProps = [];
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
});
