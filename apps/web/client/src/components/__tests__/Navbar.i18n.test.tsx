/**
 * Tests for section-12: Navbar i18n migration
 * Verifies that Navbar uses useTranslation and t() for nav labels.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const navbarSrc = readFileSync(
  join(import.meta.dirname, "../Navbar.tsx"),
  "utf-8"
);

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
});
