/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const state = vi.hoisted(() => ({
  location: "/",
  reduceMotion: false,
  tenant: null as null | { name: string; primaryDomain: string; logoUrl?: string },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => [state.location, vi.fn()] as const,
}));

vi.mock("framer-motion", () => {
  const element = (tag: "header" | "div" | "span" | "button") => ({
    children,
    initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    whileHover,
    whileTap,
    ...props
  }: React.HTMLAttributes<HTMLElement> & { initial?: unknown; whileHover?: unknown; whileTap?: unknown }) =>
    React.createElement(tag, {
      ...props,
      "data-motion": initial === false ? "reduced" : "default",
      "data-motion-hover": whileHover ? "enabled" : "disabled",
      "data-motion-tap": whileTap ? "enabled" : "disabled",
    }, children);

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      header: element("header"),
      div: element("div"),
      span: element("span"),
      button: element("button"),
    },
    useReducedMotion: () => state.reduceMotion,
  };
});

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: state.tenant }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <div data-testid="locale-toggle" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, options?: { label?: string }) => {
      const labels: Record<string, string> = {
        "navbar.home": "Home",
        "navbar.emergency": "Emergency",
        "navbar.features": "Features",
        "navbar.pricing": "Pricing",
        "navbar.gallery": "Gallery",
        "navbar.marketplace": "Marketplace",
        "navbar.marketplaceSkills": "Skills",
        "navbar.docs": "Docs",
        "navbar.blog": "Blog",
        "navbar.contact": "Contact",
        "navbar.signIn": "Sign In",
        "navbar.getStarted": "Get Started",
        "navbar.openMenu": "Open menu",
        "navbar.closeMenu": "Close menu",
        "navbar.primaryNavigation": "Primary navigation",
        "navbar.mobileNavigation": "Mobile navigation",
        "navbar.openSubmenu": `Toggle ${options?.label ?? ""} menu`,
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("@smartspec/shared/src/emergencyRouteManifest", () => ({
  getSpec260PagePath: () => "/emergency",
}));

import { Navbar } from "../Navbar";

const navbarSrc = readFileSync(
  join(import.meta.dirname, "../Navbar.tsx"),
  "utf-8"
);

afterEach(() => {
  cleanup();
  state.location = "/";
  state.reduceMotion = false;
  state.tenant = null;
});

describe("Navbar i18n migration", () => {
  it("uses the scoped translation hook for navigation labels", () => {
    expect(navbarSrc).toContain("useScopedTranslation");
  });

  it("uses the Home translation key", () => {
    expect(navbarSrc).toContain('t("navbar.home")');
  });

  it("uses the Features translation key", () => {
    expect(navbarSrc).toContain('t("navbar.features")');
  });

  it("uses the Sign In translation key", () => {
    expect(navbarSrc).toContain('t("navbar.signIn")');
  });

  it("uses the Get Started translation key", () => {
    expect(navbarSrc).toContain('t("navbar.getStarted")');
  });

  it("does not contain hardcoded 'Sign In' string (must use t())", () => {
    // Remove JSX and check no raw text string remains
    const withoutTranslations = navbarSrc.replace(
      /t\("[^"]*"\)/g,
      "TRANSLATED"
    );
    // Should not have standalone 'Sign In' text in JSX (only in t() calls)
    expect(withoutTranslations).not.toContain(">Sign In<");
  });

  it("exposes localized mobile-menu state, closes with Escape, and restores focus", () => {
    render(<Navbar />);

    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls");

    fireEvent.click(toggle);
    const mobileNavigation = screen.getByRole("region", { name: "Mobile navigation" });
    expect(toggle).toHaveAccessibleName("Close menu");
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const homeLink = within(mobileNavigation).getByRole("link", { name: "Home" });
    homeLink.focus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("region", { name: "Mobile navigation" })).toBeNull();
    expect(toggle).toHaveAccessibleName("Open menu");
    expect(document.activeElement).toBe(toggle);
  });

  it("marks the active route and suppresses motion when reduced motion is preferred", () => {
    state.location = "/features";
    state.reduceMotion = true;
    render(<Navbar />);

    for (const link of screen.getAllByRole("link", { name: "Features" })) {
      expect(link).toHaveAttribute("aria-current", "page");
    }
    expect(screen.getByRole("banner")).toHaveAttribute("data-motion", "reduced");
    expect(screen.getByRole("banner")).toHaveAttribute("data-motion-hover", "disabled");
    expect(screen.getByRole("banner")).toHaveAttribute("data-motion-tap", "disabled");

    state.location = "/";
    state.reduceMotion = false;
  });

  it("uses tenant branding and hides SmartAIHub marketing routes on a tenant domain", () => {
    state.tenant = { name: "Acme Studio", primaryDomain: "studio.example" };
    render(<Navbar />);

    expect(screen.getAllByText("Acme Studio")).toHaveLength(2);
    expect(screen.queryByText("Pro")).toBeNull();
    expect(screen.queryByRole("link", { name: "Features" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Acme Studio" })).toHaveLength(2);
  });
});
