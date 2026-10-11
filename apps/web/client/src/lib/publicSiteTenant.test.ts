import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmartAIHubPublicSite } from "./publicSiteTenant";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public tenant brand boundary", () => {
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
