import { describe, expect, it } from "vitest";

import { evaluateLiveBrowserEntryReadiness } from "../liveBrowserReadiness";

describe("live browser readiness", () => {
  it("treats a missing readiness snapshot as blocked", () => {
    const result = evaluateLiveBrowserEntryReadiness({
      runtimeReady: false,
      providerReady: false,
      runtimeFailures: ["live_readiness_snapshot_missing"],
      providerFailures: [],
      checkedAt: null,
    });

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("live_readiness_snapshot_missing");
  });

  it("treats explicit provider and runtime failures as blocking checks", () => {
    const result = evaluateLiveBrowserEntryReadiness({
      runtimeReady: false,
      providerReady: false,
      runtimeFailures: [],
      providerFailures: [],
      checkedAt: "2026-03-12T12:00:00.000Z",
    });

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("live_runtime_unready");
    expect(result.failedChecks).toContain("provider_unready");
  });

  it("preserves reported failure reasons from the readiness snapshot", () => {
    const result = evaluateLiveBrowserEntryReadiness({
      runtimeReady: true,
      providerReady: false,
      runtimeFailures: [],
      providerFailures: ["provider_attach_failed"],
      checkedAt: "2026-03-12T12:00:00.000Z",
    });

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toEqual(["provider_attach_failed"]);
  });

  it("treats stale readiness snapshots as blocked", () => {
    const result = evaluateLiveBrowserEntryReadiness({
      runtimeReady: true,
      providerReady: true,
      runtimeFailures: [],
      providerFailures: [],
      checkedAt: "2020-01-01T00:00:00.000Z",
    });

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("live_readiness_snapshot_stale");
  });
});
