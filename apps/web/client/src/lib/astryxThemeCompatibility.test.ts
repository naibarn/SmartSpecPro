import { describe, expect, it } from "vitest";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { resolveAstryxColorTokens } from "@/lib/astryxThemeCompatibility";

describe("resolveAstryxColorTokens", () => {
  it("resolves light and dark text colors to concrete values", () => {
    const light = resolveAstryxColorTokens(neutralTheme, "light");
    const dark = resolveAstryxColorTokens(neutralTheme, "dark");

    expect(light["--color-text-primary"]).toBe("#171717");
    expect(dark["--color-text-primary"]).toBe("#fafafa");
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
});
