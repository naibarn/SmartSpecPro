import { afterEach, describe, expect, it } from "vitest";

import {
  buildContextPackResolutionMetric,
  buildLibraryKnowledgeMetricSnapshot,
  evaluateLibraryKnowledgeReleaseGate,
  getLibraryKnowledgeTelemetrySnapshot,
  incrementLibraryKnowledgeCounter,
  recordLibraryContextPackResolutionMetric,
  recordLibraryKnowledgeLeakageProbe,
  recordLibraryKnowledgeSurfaceLatency,
  resetLibraryKnowledgeTelemetryForTests,
  sanitizeLibraryKnowledgeLeakageProbe,
  type LibraryKnowledgeReleaseGateMetricSnapshot,
} from "./libraryKnowledgeObservabilityService";

const healthyMetrics: LibraryKnowledgeReleaseGateMetricSnapshot = {
  readableMarkdownBackfillCoveragePercent: 99.7,
  staleCacheRatioPercent: 1,
  saveToRefreshP95Ms: 3_200,
  quickSwitchP95Ms: 180,
  localGraphP95Ms: 320,
  contextPackResolutionP95Ms: 900,
  citationCoveragePercent: 100,
  hiddenNoteLeakageCount: 0,
  privateVaultLeakageCount: 0,
  privateVaultBlockedCount: 12,
  delegatedUnauthorizedResolveCount: 0,
  unresolvedReferenceRatePercent: 0.7,
  ambiguousReferenceRatePercent: 0.4,
};

const healthyObserved = {
  refreshLatencySampleCount: 120,
  quickSwitchSampleCount: 140,
  graphSampleCount: 110,
  contextPackResolutionSampleCount: 30,
};

afterEach(() => {
  resetLibraryKnowledgeTelemetryForTests();
});

describe("libraryKnowledgeObservabilityService", () => {
  it("passes the release gate when safety and SLO metrics meet thresholds", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: healthyMetrics,
      observed: healthyObserved,
      phase: "production",
      now: new Date("2026-04-21T00:00:00.000Z"),
    });

    expect(result.status).toBe("pass");
    expect(result.failedChecks).toEqual([]);
    expect(result.warningChecks).toEqual([]);
    expect(result.observed).toEqual(healthyObserved);
    expect(result.generatedAt).toBe("2026-04-21T00:00:00.000Z");
  });

  it("blocks rollout when hidden-note leakage is detected", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        hiddenNoteLeakageCount: 1,
      },
      observed: healthyObserved,
    });

    expect(result.status).toBe("blocked");
    expect(result.failedChecks).toContain("hidden_note_leakage_detected");
  });

  it("blocks rollout when citation coverage is below 100 percent", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        citationCoveragePercent: 99,
      },
      observed: healthyObserved,
    });

    expect(result.status).toBe("blocked");
    expect(result.failedChecks).toContain("citation_coverage_below_threshold");
  });

  it("fails safe on invalid metric snapshots", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        quickSwitchP95Ms: Number.NaN,
        staleCacheRatioPercent: 101,
      },
      observed: healthyObserved,
    });

    expect(result.status).toBe("blocked");
    expect(result.failedChecks).toContain("invalid_metric_input");
    expect(result.failedChecks).toContain("invalid_metric_quickSwitchP95Ms");
    expect(result.failedChecks).toContain("invalid_metric_staleCacheRatioPercent");
  });

  it("keeps delegated unauthorized resolve attempts as canary warnings", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        delegatedUnauthorizedResolveCount: 2,
      },
      observed: healthyObserved,
      phase: "canary",
    });

    expect(result.status).toBe("pass");
    expect(result.warningChecks).toContain("delegated_unauthorized_resolve_observed");
  });

  it("treats delegated unauthorized resolve attempts as production blockers", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        delegatedUnauthorizedResolveCount: 1,
      },
      observed: healthyObserved,
      phase: "production",
    });

    expect(result.status).toBe("blocked");
    expect(result.failedChecks).toContain("delegated_unauthorized_resolve_detected");
  });

  it("returns insufficient_data when rollout samples do not meet minimums", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: healthyMetrics,
      observed: {
        refreshLatencySampleCount: 99,
        quickSwitchSampleCount: 100,
        graphSampleCount: 100,
        contextPackResolutionSampleCount: 24,
      },
      phase: "production",
    });

    expect(result.status).toBe("insufficient_data");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "refresh_latency_insufficient_data",
          severity: "insufficient_data",
        }),
        expect.objectContaining({
          check: "context_pack_resolution_insufficient_data",
          severity: "insufficient_data",
        }),
      ]),
    );
  });

  it("supports time-bounded audited overrides without hiding failed checks", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        quickSwitchP95Ms: 800,
      },
      observed: healthyObserved,
      phase: "production",
      now: new Date("2026-04-21T00:00:00.000Z"),
      override: {
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled canary incident drill",
        scopeType: "tenant",
        scopeId: "tenant-1",
        createdAt: "2026-04-20T00:00:00.000Z",
        expiresAt: "2026-04-22T00:00:00.000Z",
      },
    });

    expect(result.status).toBe("overridden");
    expect(result.failedChecks).toContain("quick_switch_latency_exceeded");
    expect(result.override).toEqual(
      expect.objectContaining({
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled canary incident drill",
      }),
    );
  });

  it("ignores invalid or expired release-gate overrides", () => {
    const result = evaluateLibraryKnowledgeReleaseGate({
      metrics: {
        ...healthyMetrics,
        quickSwitchP95Ms: 800,
      },
      observed: healthyObserved,
      phase: "production",
      now: new Date("2026-04-23T00:00:00.000Z"),
      override: {
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled canary incident drill",
        scopeType: "tenant",
        scopeId: "tenant-1",
        createdAt: "2026-04-20T00:00:00.000Z",
        expiresAt: "2026-04-22T00:00:00.000Z",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.override).toBeNull();
    expect(result.failedChecks).toContain("quick_switch_latency_exceeded");
  });

  it("summarizes context-pack resolution latency and citation coverage", () => {
    const metric = buildContextPackResolutionMetric({
      latencyMs: 280,
      result: {
        pack: {
          id: 44,
          slug: "ops-pack",
          title: "Ops Pack",
          sourceMode: "manual",
          defaultRuntimeTier: "retrieved_evidence",
          approvedForAgents: true,
          readinessStatus: "trusted",
        },
        status: "partial",
        relationExpansionApplied: false,
        totals: {
          candidateCount: 2,
          resolvedCount: 2,
          missingCount: 0,
          excludedCount: 0,
          estimatedTokens: 100,
        },
        items: [
          {
            libraryItemId: 1,
            title: "A",
            logicalPath: "a",
            runtimeTier: "retrieved_evidence",
            freshness: "fresh",
            includedReason: "Explicit",
            citations: [{ sourceRef: "library_item:1" }],
          },
          {
            libraryItemId: 2,
            title: "B",
            logicalPath: "b",
            runtimeTier: "retrieved_evidence",
            freshness: "fresh",
            includedReason: "Explicit",
            citations: [],
          },
        ],
        diagnostics: [
          {
            code: "ITEM_UNINDEXED",
            severity: "warning",
            itemId: 2,
            message: "Missing markdown",
          },
        ],
      },
    });

    expect(metric).toMatchObject({
      contextPackId: 44,
      contextPackSlug: "ops-pack",
      status: "partial",
      latencyMs: 280,
      itemCount: 2,
      citedItemCount: 1,
      citationCoveragePercent: 50,
      diagnosticsCount: 1,
    });
  });

  it("sanitizes leakage probe output without hidden titles or content", () => {
    const hiddenTitle = "Secret Acquisition Plan";
    const hiddenContent = "Revenue numbers that must not leak";
    const probe = sanitizeLibraryKnowledgeLeakageProbe({
      probeId: "probe-private-vault-1",
      probeType: "private_vault_mention",
      tenantId: "tenant-1",
      actorUserId: 5,
      leaked: false,
      blockedReason: "private_vault_locked",
      hiddenResourceId: 123,
    });

    const serialized = JSON.stringify(probe);

    expect(probe.status).toBe("blocked");
    expect(probe.hiddenResourceRef).toBe("library_item:123");
    expect(serialized).not.toContain(hiddenTitle);
    expect(serialized).not.toContain(hiddenContent);
  });

  it("aggregates telemetry into release-gate metrics for quick switch, context packs, and counters", () => {
    recordLibraryKnowledgeSurfaceLatency({
      tenantId: "tenant-1",
      surface: "quickSwitch",
      latencyMs: 120,
    });
    recordLibraryKnowledgeSurfaceLatency({
      tenantId: "tenant-1",
      surface: "quickSwitch",
      latencyMs: 240,
    });
    recordLibraryKnowledgeSurfaceLatency({
      tenantId: "tenant-1",
      surface: "localGraph",
      latencyMs: 360,
    });
    recordLibraryContextPackResolutionMetric({
      tenantId: "tenant-1",
      metric: {
        contextPackId: 44,
        contextPackSlug: "ops-pack",
        status: "complete",
        latencyMs: 440,
        itemCount: 2,
        citedItemCount: 2,
        citationCoveragePercent: 100,
        diagnosticsCount: 0,
      },
    });
    incrementLibraryKnowledgeCounter({
      tenantId: "tenant-1",
      counter: "privateVaultBlockedCount",
      delta: 2,
    });
    recordLibraryKnowledgeLeakageProbe(
      sanitizeLibraryKnowledgeLeakageProbe({
        probeId: "probe-blocked-1",
        probeType: "delegated_context_pack_without_grant",
        tenantId: "tenant-1",
        leaked: false,
        blockedReason: "grant_missing",
      }),
    );

    const telemetry = getLibraryKnowledgeTelemetrySnapshot("tenant-1");
    const metrics = buildLibraryKnowledgeMetricSnapshot({
      readableMarkdownCount: 10,
      indexedKnowledgeNoteCount: 9,
      staleKnowledgeNoteCount: 1,
      saveToRefreshLatenciesMs: [900, 1100, 1300],
      totalRelationCount: 20,
      unresolvedRelationCount: 1,
      ambiguousRelationCount: 2,
      telemetry,
    });

    expect(telemetry.surfaceLatency.quickSwitch.sampleCount).toBe(2);
    expect(telemetry.contextPackResolution.sampleCount).toBe(1);
    expect(metrics.quickSwitchP95Ms).toBe(240);
    expect(metrics.contextPackResolutionP95Ms).toBe(440);
    expect(metrics.citationCoveragePercent).toBe(100);
    expect(metrics.privateVaultBlockedCount).toBe(2);
    expect(metrics.delegatedUnauthorizedResolveCount).toBe(1);
    expect(telemetry.counters.telemetryPersistenceFailureCount).toBeGreaterThanOrEqual(0);
    expect(metrics.readableMarkdownBackfillCoveragePercent).toBe(90);
    expect(metrics.unresolvedReferenceRatePercent).toBe(5);
    expect(metrics.ambiguousReferenceRatePercent).toBe(10);
  });
});
