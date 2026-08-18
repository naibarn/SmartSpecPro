import { describe, expect, it } from "vitest";

import en from "./en/dashboard.json";
import th from "./th/dashboard.json";

describe("SmartAIHub Companion Dashboard copy", () => {
  it("uses the canonical product name in English and Thai", () => {
    expect(en["desktopReleases.chromeExtension.title"]).toBe("SmartAIHub Companion");
    expect(th["desktopReleases.chromeExtension.title"]).toBe("SmartAIHub Companion");
    expect(en["desktopReleases.chromeExtension.description"]).toContain("SmartAIHub Companion");
    expect(th["desktopReleases.chromeExtension.description"]).toContain("SmartAIHub Companion");
  });
});
