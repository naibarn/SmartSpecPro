import { describe, expect, it } from "vitest";

import {
  getTransientMediaPollRetryHint,
  isTransientGenerationError,
} from "../mediaTaskPollingService";

describe("getTransientMediaPollRetryHint", () => {
  it("recognizes an upstream status-query 429 and supplies a bounded wait", () => {
    expect(
      getTransientMediaPollRetryHint(new Error("Get task failed: 429"))
    ).toEqual({
      kind: "rate_limit",
      retryAfterSeconds: 60,
    });
  });

  it("recognizes temporary provider 5xx and timeout failures", () => {
    expect(
      getTransientMediaPollRetryHint(
        new Error("Provider status temporarily unavailable (503)")
      )
    ).toEqual({ kind: "upstream", retryAfterSeconds: 15 });
    expect(
      getTransientMediaPollRetryHint(
        new Error("request timeout while polling provider")
      )
    ).toEqual({ kind: "timeout", retryAfterSeconds: 15 });
  });

  it("does not hide structural or ownership errors", () => {
    expect(
      getTransientMediaPollRetryHint(
        new Error("Task provenance does not match this portrait candidate.")
      )
    ).toBeNull();
  });
});

describe("isTransientGenerationError", () => {
  it("recognizes provider output and image-fetch failures", () => {
    expect(isTransientGenerationError("LLM response was empty; expected one complete JSON object")).toBe(true);
    expect(isTransientGenerationError("Provider failed: Image fetch failed. Check access settings")).toBe(true);
  });

  it("does not retry structural domain failures", () => {
    expect(isTransientGenerationError("ต้องมีภาพหลักของช็อตก่อน")).toBe(false);
    expect(isTransientGenerationError("Insufficient credits")).toBe(false);
  });
});
