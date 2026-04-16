import { describe, expect, it } from "vitest";

import {
  buildEnterpriseReleaseGate,
  buildEnterpriseSdkContract,
  buildGovernedContextSnapshot,
  buildPackManifest,
  buildReadinessMetricRecord,
  buildTraceEnvelope,
  extractEnterpriseArtifacts,
} from "../enterprisePlatformArtifacts";

describe("enterprisePlatformArtifacts", () => {
  it("builds a deterministic governed context snapshot", () => {
    const snapshot = buildGovernedContextSnapshot({
      tenantId: "tenant-1",
      principalScope: "team-1",
      objective: "Launch the product",
      items: [
        {
          id: "untrusted-note",
          label: "Untrusted note",
          sourceType: "external",
          scope: "room",
          trustTier: "untrusted",
          freshnessTier: "fresh",
          reason: "External note is retained but not promoted",
        },
        {
          id: "objective",
          label: "Launch the product",
          sourceType: "run",
          scope: "room",
          trustTier: "trusted",
          freshnessTier: "fresh",
          reason: "Primary objective",
          score: 1,
        },
      ],
    });

    expect(snapshot.selectedCount).toBe(1);
    expect(snapshot.excludedCount).toBe(1);
    expect(snapshot.items[0]?.id).toBe("objective");
    expect(snapshot.summary).toContain("1 context item(s) selected");
  });

  it("builds trace envelopes and readiness records", () => {
    const traceEnvelope = buildTraceEnvelope({
      traceId: "trace-123",
      tenantId: "tenant-1",
      source: "run_engine",
      entityId: "run-1",
      eventType: "snapshot",
      summary: "Snapshot created",
      evidenceRefs: ["summary:1"],
    });
    const readinessRecord = buildReadinessMetricRecord({
      kind: "team_run",
      entityId: "run-1",
      score: 0.82,
      reason: "Plan review passed",
      evidenceRefs: ["summary:1"],
    });

    expect(traceEnvelope.traceId).toBe("trace-123");
    expect(readinessRecord.status).toBe("ready");
    expect(readinessRecord.score).toBeCloseTo(0.82);
  });

  it("builds a reversible pack manifest and extracts enterprise artifacts", () => {
    const manifest = buildPackManifest({
      benchmarkPack: {
        id: "bench-1",
        sourceWorkpackId: "workpack-1",
        sourceVersionId: "version-1",
        title: "Workpack benchmark",
        lineage: [],
        fixtureIds: [],
        evaluationRules: [],
        trustTags: ["verified"],
        publicationScope: "tenant_local",
        publicationStatus: "published",
        fixturesDeidentified: true,
        outputsDeidentified: true,
        publishedAt: "2026-04-16T00:00:00.000Z",
      },
      detail: {
        workpack: {
          id: "workpack-1",
          tenantId: "tenant-1",
          title: "Workpack",
          description: "",
          goal: "Goal",
          domainPack: "support_ops",
          lifecycleState: "ready",
          autonomyMode: "supervised",
          promotionState: "candidate",
          currentVersionId: "version-1",
          caseSourceIds: [],
          policyProfile: {},
          runtimePreferenceHints: [],
          createdAt: "2026-04-16T00:00:00.000Z",
          updatedAt: "2026-04-16T00:00:00.000Z",
        },
        version: {
          id: "version-1",
          workpackId: "workpack-1",
          versionNumber: 1,
          playbook: {
            id: "playbook-1",
            tenantId: "tenant-1",
            title: "Playbook",
            goal: "Goal",
            description: "",
            domainPack: "support_ops",
            sourceIds: [],
            extractedFields: [],
            clarificationQueue: [],
            localFileIntelligence: { available: false, parserStatus: "unknown", capabilities: [], notes: [] },
            steps: [],
            createdAt: "2026-04-16T00:00:00.000Z",
          },
          connectorMaps: [
            {
              id: "connector-map-1",
              workpackId: "workpack-1",
              versionId: "version-1",
              connectorKey: "helpdesk",
              connectorFamily: "helpdesk",
              requiredScopes: ["helpdesk:read"],
              optionalScopes: [],
              grantedScopes: ["helpdesk:read"],
              fieldMappings: [],
              validationStatus: "validated",
              scopePosture: "sufficient",
              idempotencySupported: true,
              writeMode: "single_attempt",
              missingFields: [],
              driftedFields: [],
              samplePayload: {},
              createdAt: "2026-04-16T00:00:00.000Z",
            },
          ],
          connectorIntrospections: [],
          fixtureCatalog: [],
          compilerMetadata: {},
          createdAt: "2026-04-16T00:00:00.000Z",
        },
        caseSources: [],
        playbook: {
          id: "playbook-1",
          tenantId: "tenant-1",
          title: "Playbook",
          goal: "Goal",
          description: "",
          domainPack: "support_ops",
          sourceIds: [],
          extractedFields: [],
          clarificationQueue: [],
          localFileIntelligence: { available: false, parserStatus: "unknown", capabilities: [], notes: [] },
          steps: [],
          createdAt: "2026-04-16T00:00:00.000Z",
        },
        runs: [],
        simulations: [],
        exceptions: [],
        benchmarks: [],
        promotionRecords: [
          {
            id: "prom-1",
            workpackId: "workpack-1",
            versionId: "version-1",
            benchmarkPackId: "bench-1",
            state: "active",
            evidenceCapturedAt: "2026-04-16T00:00:00.000Z",
            rollbackAvailable: true,
          },
        ],
        improvementProposals: [],
        telemetryEvents: [],
        metricSnapshots: [],
        incidents: [],
        schedules: [],
      },
    });

    const extracted = extractEnterpriseArtifacts({
      payload: {
        traceEnvelope: {
          version: 1,
          traceId: "trace-123",
          tenantId: "tenant-1",
          source: "run_engine",
          entityId: "run-1",
          eventType: "snapshot",
          generatedAt: "2026-04-16T00:00:00.000Z",
          summary: "Snapshot created",
          evidenceRefs: [],
        },
        governedContext: {
          version: 1,
          tenantId: "tenant-1",
          principalScope: "team-1",
          objective: "Launch the product",
          generatedAt: "2026-04-16T00:00:00.000Z",
          selectedCount: 1,
          excludedCount: 0,
          summary: "1 context item(s) selected, 0 excluded for Launch the product",
          items: [],
        },
        packManifest: manifest,
        readinessRecord: {
          version: 1,
          kind: "team_run",
          entityId: "run-1",
          generatedAt: "2026-04-16T00:00:00.000Z",
          score: 0.82,
          status: "ready",
          reason: "Plan review passed",
          evidenceRefs: [],
        },
      },
    });

    expect(manifest.reversible).toBe(true);
    expect(manifest.requiredScopes).toContain("helpdesk:read");
    expect(extracted.traceEnvelope?.traceId).toBe("trace-123");
    expect(extracted.governedContext?.tenantId).toBe("tenant-1");
    expect(extracted.packManifest?.packId).toBe("bench-1");
    expect(extracted.readinessRecord?.status).toBe("ready");
  });

  it("builds enterprise release gates and SDK contracts from durable evidence", () => {
    const traceEnvelope = buildTraceEnvelope({
      traceId: "trace-900",
      tenantId: "tenant-1",
      source: "workpack",
      entityId: "workpack-1",
      eventType: "enterprise_evidence_snapshot",
      summary: "Workpack evidence snapshot",
      evidenceRefs: ["run:1"],
    });
    const governedContext = buildGovernedContextSnapshot({
      tenantId: "tenant-1",
      principalScope: "workpack",
      objective: "Launch the product",
      items: [
        {
          id: "workpack",
          label: "Workpack",
          sourceType: "workpack",
          scope: "workpack",
          trustTier: "trusted",
          freshnessTier: "fresh",
          reason: "Canonical workpack evidence",
          score: 1,
        },
      ],
    });
    const readinessRecord = buildReadinessMetricRecord({
      kind: "workpack",
      entityId: "workpack-1",
      score: 0.88,
      reason: "Replay clean",
      evidenceRefs: ["replay:1"],
    });

    const releaseGate = buildEnterpriseReleaseGate({
      tenantId: "tenant-1",
      workpackId: "workpack-1",
      kind: "promotion",
      traceEnvelope,
      governedContext,
      readinessRecord,
      replayGateStatus: "ready",
      evidenceRefs: ["run:1", "replay:1"],
    });
    const sdkContract = buildEnterpriseSdkContract({
      tenantId: "tenant-1",
      workpackId: "workpack-1",
      traceEnvelope,
      governedContext,
      readinessRecord,
    });

    expect(releaseGate.gateResult).toBe("ready");
    expect(releaseGate.traceId).toBe("trace-900");
    expect(sdkContract.supportedPatterns).toContain("inspection-only replay before promotion");
    expect(sdkContract.blockedPatterns).toContain("ui-only readiness decisions");
  });
});
