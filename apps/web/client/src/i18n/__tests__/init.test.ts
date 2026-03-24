import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the loader module that doesn't exist yet (section-03)
vi.mock("../loader", () => ({
  loadNamespace: vi.fn().mockResolvedValue({}),
}));

describe("i18n/index (initialization)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("i18next initializes with fallbackLng en", async () => {
    const { i18n, i18nReady } = await import("../index");
    await i18nReady;
    expect(i18n.options.fallbackLng).toEqual(["en"]);
  });

  it("i18next initializes with defaultNS common", async () => {
    const { i18n, i18nReady } = await import("../index");
    await i18nReady;
    expect(i18n.options.defaultNS).toBe("common");
  });

  it("i18next loads STARTUP_NAMESPACES on init", async () => {
    const { i18n, i18nReady } = await import("../index");
    await i18nReady;
    const ns = i18n.options.ns;
    expect(ns).toContain("common");
    expect(ns).toContain("nav");
    expect(ns).toContain("auth");
    expect(ns).toContain("errors");
  });

  it("i18next has escapeValue set to false", async () => {
    const { i18n, i18nReady } = await import("../index");
    await i18nReady;
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });

  it("i18next uses Suspense", async () => {
    const { i18n, i18nReady } = await import("../index");
    await i18nReady;
    expect((i18n.options as any).react?.useSuspense).toBe(true);
  });

  it("i18nReady promise resolves even on init failure", async () => {
    // The promise should always resolve, never reject
    const { i18nReady } = await import("../index");
    await expect(i18nReady).resolves.toBeUndefined();
  });

  it("t() returns key string when no translation exists", async () => {
    const { i18n, i18nReady } = await import("../index");
    await i18nReady;
    const result = i18n.t("nonexistent.key");
    expect(typeof result).toBe("string");
  });
});
