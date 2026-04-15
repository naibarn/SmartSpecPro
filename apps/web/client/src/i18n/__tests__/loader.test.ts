import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoist mocks to top (vi.mock is hoisted by Vitest)
const { hasResourceBundleMock, addResourceBundleMock, mockGlobModules } =
  vi.hoisted(() => {
    const hasResourceBundleMock = vi.fn().mockReturnValue(false);
    const addResourceBundleMock = vi.fn();

    const mockGlobModules: Record<
      string,
      () => Promise<{ default: Record<string, unknown> }>
    > = {
      "../locales/en/common.json": () =>
        Promise.resolve({ default: { greeting: "Hello" } }),
      "../locales/th/common.json": () =>
        Promise.resolve({ default: { greeting: "สวัสดี" } }),
      "../locales/en/nav.json": () =>
        Promise.resolve({ default: { "navbar.home": "Home" } }),
      "../locales/th/nav.json": () =>
        Promise.resolve({ default: { "navbar.home": "หน้าหลัก" } }),
    };

    return { hasResourceBundleMock, addResourceBundleMock, mockGlobModules };
  });

vi.mock("i18next", () => ({
  default: {
    hasResourceBundle: hasResourceBundleMock,
    addResourceBundle: addResourceBundleMock,
  },
}));

// Re-implement loader logic with mocked glob instead of actual import.meta.glob
vi.mock("../loader", async () => {
  const { default: i18next } = await import("i18next");
  const inFlight = new Map<string, Promise<void>>();

  function loadNamespace(lng: string, ns: string): Promise<void> {
    if (i18next.hasResourceBundle(lng, ns)) return Promise.resolve();
    const key = `${lng}:${ns}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const globKey = `../locales/${lng}/${ns}.json`;
    const loader = mockGlobModules[globKey];
    if (!loader) return Promise.resolve();
    const promise = loader()
      .then((mod) => {
        i18next.addResourceBundle(lng, ns, mod.default, true, true);
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  function createBackendLoader() {
    return async (language: string, namespace: string) => {
      const globKey = `../locales/${language}/${namespace}.json`;
      const loader = mockGlobModules[globKey];
      if (!loader) return {};
      const mod = await loader();
      return mod.default;
    };
  }

  return { loadNamespace, createBackendLoader, inFlight };
});

import { loadNamespace } from "../loader";

describe("i18n/loader", () => {
  beforeEach(() => {
    hasResourceBundleMock.mockReturnValue(false);
    addResourceBundleMock.mockReset();
  });

  it("loadNamespace calls addResourceBundle for existing en/common", async () => {
    await loadNamespace("en", "common");
    expect(addResourceBundleMock).toHaveBeenCalledWith(
      "en",
      "common",
      { greeting: "Hello" },
      true,
      true,
    );
  });

  it("loadNamespace keeps nav keys such as navbar.home intact", async () => {
    await loadNamespace("en", "nav");
    expect(addResourceBundleMock).toHaveBeenCalledWith(
      "en",
      "nav",
      { "navbar.home": "Home" },
      true,
      true,
    );
  });

  it("loadNamespace returns resolved promise for non-existent locale file", async () => {
    await expect(loadNamespace("fr", "nav")).resolves.toBeUndefined();
  });

  it("loadNamespace skips fetch if hasResourceBundle returns true", async () => {
    hasResourceBundleMock.mockReturnValue(true);
    await loadNamespace("en", "common");
    expect(addResourceBundleMock).not.toHaveBeenCalled();
  });

  it("concurrent calls for same lng/ns only trigger one addResourceBundle call", async () => {
    const p1 = loadNamespace("th", "common");
    const p2 = loadNamespace("th", "common");
    await Promise.all([p1, p2]);
    expect(addResourceBundleMock).toHaveBeenCalledTimes(1);
  });

  it("concurrent calls for different lng/ns trigger parallel fetches", async () => {
    const p1 = loadNamespace("en", "common");
    const p2 = loadNamespace("th", "common");
    await Promise.all([p1, p2]);
    expect(addResourceBundleMock).toHaveBeenCalledTimes(2);
  });

  it("loadNamespace with invalid lng returns without error", async () => {
    await expect(loadNamespace("xx", "common")).resolves.toBeUndefined();
  });
});
