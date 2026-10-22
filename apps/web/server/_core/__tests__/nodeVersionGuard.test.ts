import { describe, expect, it } from "vitest";

import {
  assertSupportedNodeRuntime,
  isSupportedSmartSpecNodeVersion,
  parseNodeVersion,
} from "../nodeVersionGuard";

describe("nodeVersionGuard", () => {
  it("parses Node versions with or without the leading v", () => {
    expect(parseNodeVersion("v22.23.4")).toEqual([22, 23, 4]);
    expect(parseNodeVersion("22.23.4")).toEqual([22, 23, 4]);
    expect(parseNodeVersion("not-a-version")).toBeNull();
  });

  it("allows only patched Node 22 runtimes", () => {
    expect(isSupportedSmartSpecNodeVersion("v22.23.3")).toBe(false);
    expect(isSupportedSmartSpecNodeVersion("v22.23.4")).toBe(true);
    expect(isSupportedSmartSpecNodeVersion("v20.20.0")).toBe(false);
    expect(isSupportedSmartSpecNodeVersion("v22.22.3")).toBe(false);
    expect(isSupportedSmartSpecNodeVersion("v23.0.0")).toBe(false);
  });

  it("fails fast when the web server starts under Node 20", () => {
    expect(() => assertSupportedNodeRuntime("v20.20.0")).toThrow(
      /requires Node >=22\.23\.4 <23/
    );
  });

  it("accepts the minimum patched Node runtime", () => {
    expect(() => assertSupportedNodeRuntime("v22.23.4")).not.toThrow();
  });
});
