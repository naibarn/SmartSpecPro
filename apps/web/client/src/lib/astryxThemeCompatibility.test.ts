import { describe, expect, it } from "vitest";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import {
  applyAstryxCompatibilityTokens,
  resolveAstryxColorTokens,
  resolveAstryxCompatibilityTokens,
} from "@/lib/astryxThemeCompatibility";

describe("resolveAstryxColorTokens", () => {
  it("resolves light and dark text colors to concrete values", () => {
    const light = resolveAstryxColorTokens(neutralTheme, "light");
    const dark = resolveAstryxColorTokens(neutralTheme, "dark");

    expect(light["--color-text-primary"]).toBe("#000000");
    expect(dark["--color-text-primary"]).toBe("#ffffff");
    expect(light["--color-text-primary"]).not.toContain("light-dark(");
    expect(dark["--color-text-primary"]).not.toContain("light-dark(");
  });

  it("only returns color tokens for the Safari compatibility layer", () => {
    const tokens = resolveAstryxColorTokens(neutralTheme, "light");

    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    expect(Object.keys(tokens).every(name => name.startsWith("--color-"))).toBe(
      true
    );
    expect(
      Object.values(tokens).every(value => !value.includes("light-dark("))
    ).toBe(true);
  });

  it("does not restore over tenant values written after Astryx compatibility tokens", () => {
    const root = document.documentElement;
    root.style.setProperty("--color-primary", "tenant-blue");
    const cleanup = applyAstryxCompatibilityTokens([root], {
      "--color-primary": "astryx-purple",
      "--color-accent": "astryx-green",
    });

    expect(root.style.getPropertyValue("--color-primary")).toBe("astryx-purple");
    root.style.setProperty("--color-primary", "tenant-green");
    cleanup();

    expect(root.style.getPropertyValue("--color-primary")).toBe("tenant-green");
    expect(root.style.getPropertyValue("--color-accent")).toBe("");
  });

  it("leaves tenant-owned colors untouched when compatibility tokens are disabled", () => {
    const root = document.documentElement;
    root.style.setProperty("--color-primary", "tenant-blue");

    const tenantTokens = resolveAstryxCompatibilityTokens(neutralTheme, "dark", false);
    const cleanup = applyAstryxCompatibilityTokens([root], tenantTokens);
    cleanup();

    expect(tenantTokens).toEqual({});
    expect(root.style.getPropertyValue("--color-primary")).toBe("tenant-blue");
  });
});
