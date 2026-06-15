import { describe, expect, it } from "vitest";

import {
  assertSupportedNodeRuntime,
  isSupportedSmartSpecNodeVersion,
  parseNodeVersion,
} from "../nodeVersionGuard";

describe("nodeVersionGuard", () => {
  it("parses Node versions with or without the leading v", () => {
    expect(parseNodeVersion("v22.22.3")).toEqual([22, 22, 3]);
    expect(parseNodeVersion("22.22.0")).toEqual([22, 22, 0]);
    expect(parseNodeVersion("not-a-version")).toBeNull();
  });

  it("allows only the supported Node 22.22.x runtime range", () => {
    expect(isSupportedSmartSpecNodeVersion("v22.22.0")).toBe(true);
    expect(isSupportedSmartSpecNodeVersion("v22.22.3")).toBe(true);
    expect(isSupportedSmartSpecNodeVersion("v20.20.0")).toBe(false);
    expect(isSupportedSmartSpecNodeVersion("v22.21.9")).toBe(false);
    expect(isSupportedSmartSpecNodeVersion("v23.0.0")).toBe(false);
  });

  it("fails fast when the web server starts under Node 20", () => {
    expect(() => assertSupportedNodeRuntime("v20.20.0")).toThrow(
      /requires Node >=22\.22\.0 <23/
    );
  });

  it("accepts the current production Node runtime", () => {
    expect(() => assertSupportedNodeRuntime("v22.22.3")).not.toThrow();
  });
});
