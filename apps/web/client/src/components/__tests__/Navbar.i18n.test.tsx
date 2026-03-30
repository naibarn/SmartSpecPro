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
  it("imports useTranslation from react-i18next", () => {
    expect(navbarSrc).toContain("useTranslation");
  });

  it("uses t('navbar.home') for Home label", () => {
    expect(navbarSrc).toContain("t('navbar.home')");
  });

  it("uses t('navbar.features') for Features label", () => {
    expect(navbarSrc).toContain("t('navbar.features')");
  });

  it("uses t('navbar.signIn') for Sign In button", () => {
    expect(navbarSrc).toContain("t('navbar.signIn')");
  });

  it("uses t('navbar.getStarted') for Get Started button", () => {
    expect(navbarSrc).toContain("t('navbar.getStarted')");
  });

  it("does not contain hardcoded 'Sign In' string (must use t())", () => {
    // Remove JSX and check no raw text string remains
    const withoutTranslations = navbarSrc.replace(/t\('[^']*'\)/g, "TRANSLATED");
    // Should not have standalone 'Sign In' text in JSX (only in t() calls)
    expect(withoutTranslations).not.toContain(">Sign In<");
  });
});
