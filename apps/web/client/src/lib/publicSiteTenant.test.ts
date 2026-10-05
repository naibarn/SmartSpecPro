import { describe, expect, it } from "vitest";
import { isSmartAIHubPublicSite } from "./publicSiteTenant";

describe("public tenant brand boundary", () => {
  it("only enables platform content for SmartAIHub or local development hosts", () => {
    expect(isSmartAIHubPublicSite({ primaryDomain: "smartaihub.app" })).toBe(true);
    expect(isSmartAIHubPublicSite({ primaryDomain: "www.smartaihub.app" })).toBe(true);
    expect(isSmartAIHubPublicSite({ primaryDomain: "studio.example" })).toBe(false);
  });

  it("fails closed when no tenant is resolved on an unknown host", () => {
    expect(isSmartAIHubPublicSite(null)).toBe(false);
  });
});
