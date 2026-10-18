import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmartAIHubPublicSite } from "./publicSiteTenant";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public tenant brand boundary", () => {
  it("mirrors platform content on the resolved dedicated dev tenant", () => {
    vi.stubEnv("DEV", true);
    vi.stubGlobal("window", { location: { hostname: "aimarkethubs.com" } });
    expect(isSmartAIHubPublicSite({ primaryDomain: "aimarkethubs.com" })).toBe(true);
    expect(isSmartAIHubPublicSite(null)).toBe(false);
    expect(isSmartAIHubPublicSite({ primaryDomain: "studio.example" })).toBe(false);
  });

  it("does not extend the dev exception to production or other hosts", () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("window", { location: { hostname: "aimarkethubs.com" } });
    expect(isSmartAIHubPublicSite({ primaryDomain: "aimarkethubs.com" })).toBe(false);
    vi.stubEnv("DEV", true);
    vi.stubGlobal("window", { location: { hostname: "unknown.example" } });
    expect(isSmartAIHubPublicSite({ primaryDomain: "aimarkethubs.com" })).toBe(false);
  });
  it("only enables platform content for SmartAIHub or local development hosts", () => {
    expect(isSmartAIHubPublicSite({ primaryDomain: "smartaihub.app" })).toBe(true);
    expect(isSmartAIHubPublicSite({ primaryDomain: "www.smartaihub.app" })).toBe(true);
    expect(isSmartAIHubPublicSite({ primaryDomain: "studio.example" })).toBe(false);
  });

  it("fails closed when no tenant is resolved on an unknown host", () => {
    vi.stubGlobal("window", { location: { hostname: "unknown.example" } });
    expect(isSmartAIHubPublicSite(null)).toBe(false);
  });

  it("allows local development hosts without a resolved tenant", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    expect(isSmartAIHubPublicSite(null)).toBe(true);
  });
});
