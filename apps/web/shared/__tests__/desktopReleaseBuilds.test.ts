import { describe, expect, it } from "vitest";

import {
  normalizeDesktopReleaseVersion,
  suggestNextDesktopReleaseVersion,
} from "../desktopReleaseBuilds";

describe("desktopReleaseBuilds", () => {
  it("normalizes leading v prefixes from versions", () => {
    expect(normalizeDesktopReleaseVersion("v0.1.1")).toBe("0.1.1");
    expect(normalizeDesktopReleaseVersion("  V1.2.3  ")).toBe("1.2.3");
  });

  it("suggests the next patch release version", () => {
    expect(suggestNextDesktopReleaseVersion(null)).toBe("0.1.0");
    expect(suggestNextDesktopReleaseVersion("0.1.0")).toBe("0.1.1");
    expect(suggestNextDesktopReleaseVersion("v2.4.9")).toBe("2.4.10");
  });
});
