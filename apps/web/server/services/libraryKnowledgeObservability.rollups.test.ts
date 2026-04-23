import { describe, expect, it } from "vitest";

import {
  createLibraryKnowledgeReleaseGateOverride,
  getLibraryKnowledgeObservabilityReport,
} from "./libraryKnowledgeObservabilityService";
import {
  libraryContextPacks,
  libraryIndexJobs,
  libraryItems,
  libraryKnowledgeNotes,
  libraryKnowledgeRelations,
  libraryKnowledgeReleaseGateOverrides,
  libraryKnowledgeTelemetryEvents,
  libraryKnowledgeTelemetryRollups,
} from "../../drizzle/schema";

type FakeObservabilityDbConfig = {
  readableMarkdownCount?: number;
  indexedKnowledgeNoteCount?: number;
  staleKnowledgeNoteCount?: number;
  totalRelationCount?: number;
  unresolvedRelationCount?: number;
  ambiguousRelationCount?: number;
  saveToRefreshRows?: Array<{ latencyMs: number }>;
  contextPackRows?: Array<{
    readinessStatus: "trusted" | "review_pending" | "stale";
    approvedForAgents: boolean;
  }>;
  overrideRows?: Array<{
    id: number;
    actorUserId: number | null;
    approvedByUserId: number | null;
    reason: string;
    scopeType: string;
    scopeId: string | null;
    status: string;
    overrideMode: string;
    metadata: Record<string, unknown>;
    approvedAt: Date | null;
    approvalReason: string | null;
    rejectedAt: Date | null;
    rejectedByUserId: number | null;
    rejectedReason: string | null;
    createdAt: Date;
    expiresAt: Date;
  }>;
  telemetryRollups?: Array<{
    id: number;
    eventType: string;
    surface: string | null;
    status: string | null;
    sampleCount: number;
    metricJson: Record<string, unknown>;
    windowStart: Date;
    windowEnd: Date;
    updatedAt: Date;
  }>;
  telemetryEvents?: Array<{
    eventType: string;
    surface: string | null;
    status: string | null;
    sampleCount: number;
    metricJson: Record<string, unknown>;
    createdAt: Date;
  }>;
};

function makeObservabilityDb(config: FakeObservabilityDbConfig) {
  const knowledgeNoteCounts = [
    [{ count: config.indexedKnowledgeNoteCount ?? 0 }],
    [{ count: config.staleKnowledgeNoteCount ?? 0 }],
  ];
  const relationCounts = [
    [{ count: config.totalRelationCount ?? 0 }],
    [{ count: config.unresolvedRelationCount ?? 0 }],
    [{ count: config.ambiguousRelationCount ?? 0 }],
  ];

  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === libraryItems) {
          return {
            where: async () => [{ count: config.readableMarkdownCount ?? 0 }],
          };
        }

        if (table === libraryKnowledgeNotes) {
          return {
            where: async () => knowledgeNoteCounts.shift() ?? [{ count: 0 }],
          };
        }

        if (table === libraryKnowledgeRelations) {
          return {
            where: async () => relationCounts.shift() ?? [{ count: 0 }],
          };
        }

        if (table === libraryIndexJobs) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: async () => config.saveToRefreshRows ?? [],
              }),
            }),
          };
        }

        if (table === libraryContextPacks) {
          return {
            where: async () => config.contextPackRows ?? [],
          };
        }

        if (table === libraryKnowledgeReleaseGateOverrides) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: async () => config.overrideRows ?? [],
              }),
            }),
          };
        }

        if (table === libraryKnowledgeTelemetryRollups) {
          return {
            where: () => ({
              orderBy: async () => config.telemetryRollups ?? [],
            }),
          };
        }

        if (table === libraryKnowledgeTelemetryEvents) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: async () => config.telemetryEvents ?? [],
                }),
              }),
            }),
          };
        }

        throw new Error("Unexpected table in fake observability DB");
      },
    }),
  };
}

describe("libraryKnowledgeObservabilityService rollups", () => {
  it("rejects tenant-scoped callers attempting to create a global override", async () => {
    await expect(
      createLibraryKnowledgeReleaseGateOverride({
        tenantId: "tenant-1",
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled emergency drill",
        scopeType: "global",
        expiresAt: "2026-04-23T00:00:00.000Z",
      }),
    ).rejects.toThrow(/platform-scoped pathway/);
  });

  it("builds the readiness report from persisted telemetry rollups", async () => {
    const now = new Date("2026-04-22T12:00:00.000Z");
    const dayStart = new Date("2026-04-22T00:00:00.000Z");
    const dayEnd = new Date("2026-04-23T00:00:00.000Z");
    const db = makeObservabilityDb({
      readableMarkdownCount: 10,
      indexedKnowledgeNoteCount: 10,
      staleKnowledgeNoteCount: 0,
      totalRelationCount: 10,
      unresolvedRelationCount: 0,
      ambiguousRelationCount: 0,
      saveToRefreshRows: [{ latencyMs: 1200 }, { latencyMs: 2400 }],
      contextPackRows: [
        {
          readinessStatus: "trusted",
          approvedForAgents: true,
        },
      ],
      telemetryRollups: [
        {
          id: 1,
          eventType: "surface_latency",
          surface: "quickSwitch",
          status: null,
          sampleCount: 3,
          metricJson: {
            recentSamplesMs: [100, 150, 200],
          },
          windowStart: dayStart,
          windowEnd: dayEnd,
          updatedAt: now,
        },
        {
          id: 2,
          eventType: "surface_latency",
          surface: "localGraph",
          status: null,
          sampleCount: 2,
          metricJson: {
            recentSamplesMs: [320, 340],
          },
          windowStart: dayStart,
          windowEnd: dayEnd,
          updatedAt: now,
        },
        {
          id: 3,
          eventType: "counter",
          surface: "privateVaultBlockedCount",
          status: null,
          sampleCount: 2,
          metricJson: {
            counter: "privateVaultBlockedCount",
            total: 2,
          },
          windowStart: dayStart,
          windowEnd: dayEnd,
          updatedAt: now,
        },
        {
          id: 4,
          eventType: "leakage_probe",
          surface: "delegated_context_pack_without_grant",
          status: "blocked",
          sampleCount: 2,
          metricJson: {
            probes: [
              {
                probeId: "probe-1",
                probeType: "delegated_context_pack_without_grant",
                status: "blocked",
                tenantId: "tenant-1",
                blockedReason: "grant_missing",
              },
            ],
            hiddenNoteLeakageCount: 0,
            privateVaultLeakageCount: 0,
            privateVaultBlockedCount: 0,
            delegatedUnauthorizedResolveCount: 2,
          },
          windowStart: dayStart,
          windowEnd: dayEnd,
          updatedAt: now,
        },
        {
          id: 5,
          eventType: "context_pack_resolution",
          surface: "contextPackResolution",
          status: "partial",
          sampleCount: 2,
          metricJson: {
            totalItemCount: 4,
            totalCitedItemCount: 3,
            recentSamples: [
              {
                contextPackId: 44,
                contextPackSlug: "ops-pack",
                status: "partial",
                latencyMs: 420,
                itemCount: 2,
                citedItemCount: 1,
                citationCoveragePercent: 50,
                diagnosticsCount: 1,
              },
              {
                contextPackId: 44,
                contextPackSlug: "ops-pack",
                status: "complete",
                latencyMs: 360,
                itemCount: 2,
                citedItemCount: 2,
                citationCoveragePercent: 100,
                diagnosticsCount: 0,
              },
            ],
          },
          windowStart: dayStart,
          windowEnd: dayEnd,
          updatedAt: now,
        },
      ],
    });

    const report = await getLibraryKnowledgeObservabilityReport({
      tenantId: "tenant-1",
      dbClient: db as never,
      now,
    });

    expect(report.telemetry.surfaceLatency.quickSwitch.sampleCount).toBe(3);
    expect(report.telemetry.surfaceLatency.quickSwitch.p95Ms).toBe(200);
    expect(report.telemetry.surfaceLatency.localGraph.sampleCount).toBe(2);
    expect(report.telemetry.contextPackResolution.sampleCount).toBe(2);
    expect(report.telemetry.contextPackResolution.itemCount).toBe(4);
    expect(report.telemetry.contextPackResolution.citedItemCount).toBe(3);
    expect(report.telemetry.contextPackResolution.citationCoveragePercent).toBe(75);
    expect(report.telemetry.counters.privateVaultBlockedCount).toBe(2);
    expect(report.telemetry.counters.delegatedUnauthorizedResolveCount).toBe(2);
    expect(report.metrics.citationCoveragePercent).toBe(75);
    expect(report.metrics.delegatedUnauthorizedResolveCount).toBe(2);
  });
});
