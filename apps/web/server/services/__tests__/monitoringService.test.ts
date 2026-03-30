import { describe, it, expect } from "vitest";
import {
  STUCK_THRESHOLD_MS,
  SNAPSHOT_INTERVAL_MS,
  deriveOpsOverview,
  buildOpsIncidentTimeline,
} from "../monitoringService";

describe("monitoringService", () => {
  describe("constants", () => {
    it("STUCK_THRESHOLD_MS is 2 minutes", () => {
      expect(STUCK_THRESHOLD_MS).toBe(120_000);
    });

    it("SNAPSHOT_INTERVAL_MS is 15 seconds", () => {
      expect(SNAPSHOT_INTERVAL_MS).toBe(15_000);
    });
  });

  describe("deriveOpsOverview", () => {
    it("surfaces critical pre-failure signals across resources and audit telemetry", () => {
      const now = new Date("2026-03-30T08:00:00.000Z");
      const overview = deriveOpsOverview({
        latestMetrics: {
          id: 1,
          memoryUsedMb: 7_900,
          memoryTotalMb: 8_192,
          memoryPercent: 96.4,
          cpuPercent: 94.2,
          diskUsedGb: 92,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "running",
            celery: "unhealthy",
          },
          processRestartCounts: {
            celery: 5,
            web: 1,
          },
          createdAt: new Date("2026-03-30T07:57:00.000Z"),
        },
        baselineMetrics: {
          id: 2,
          memoryUsedMb: 5_300,
          memoryTotalMb: 8_192,
          memoryPercent: 64.7,
          cpuPercent: 41.5,
          diskUsedGb: 81,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "running",
            celery: "running",
          },
          processRestartCounts: {
            celery: 1,
            web: 1,
          },
          createdAt: new Date("2026-03-30T02:05:00.000Z"),
        },
        lastCheckAt: new Date("2026-03-30T07:56:00.000Z"),
        services: [
          { name: "web", status: "running" },
          { name: "celery", status: "unhealthy" },
        ],
        unackedAlerts: {
          critical: 1,
          warning: 2,
          error: 1,
          info: 0,
        },
        llmStats: {
          total: 50,
          errorCount: 12,
          serverErrorCount: 6,
          timeoutCount: 3,
          fallbackCount: 9,
          p95LatencyMs: 18_500,
          avgLatencyMs: 7_400,
          lastSeenAt: "2026-03-30T07:58:00.000Z",
        },
        mediaStats: {
          total: 18,
          errorCount: 2,
          serverErrorCount: 0,
          timeoutCount: 0,
          fallbackCount: 0,
          p95LatencyMs: 11_000,
          avgLatencyMs: 5_200,
          lastSeenAt: "2026-03-30T07:50:00.000Z",
        },
        orchestrationStats: {
          totalEvents: 42,
          classifyCount: 16,
          fallbackCount: 7,
          qualityCount: 10,
          riskyQualityCount: 5,
          avgClassifyLatencyMs: 4_400,
          fallbackRate: 0.4375,
          qualityRiskRate: 0.5,
          topFallbackReason: "timeout",
          lastSeenAt: "2026-03-30T07:59:00.000Z",
        },
        windows: {
          metricsHours: 6,
          auditHours: 6,
          orchestrationHours: 6,
        },
        now,
      });

      expect(overview.health).toBe("critical");
      expect(overview.summary.criticalCount).toBeGreaterThan(0);
      expect(overview.anomalies.some((anomaly) => anomaly.type === "memory_pressure" && anomaly.severity === "critical")).toBe(true);
      expect(overview.anomalies.some((anomaly) => anomaly.type === "llm_error_spike" && anomaly.severity === "critical")).toBe(true);
      expect(overview.anomalies.some((anomaly) => anomaly.type === "orchestration_fallback_spike" && anomaly.severity === "critical")).toBe(true);
      expect(overview.leadingSignals.maxRestartDelta).toBe(4);
      expect(overview.leadingSignals.llmErrorRate).toBeCloseTo(0.24);
    });

    it("stays healthy when signals are stable", () => {
      const overview = deriveOpsOverview({
        latestMetrics: {
          id: 1,
          memoryUsedMb: 2_000,
          memoryTotalMb: 8_192,
          memoryPercent: 24.4,
          cpuPercent: 31.5,
          diskUsedGb: 42,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "running",
            celery: "running",
          },
          processRestartCounts: {
            web: 2,
            celery: 4,
          },
          createdAt: new Date("2026-03-30T07:57:00.000Z"),
        },
        baselineMetrics: {
          id: 2,
          memoryUsedMb: 1_900,
          memoryTotalMb: 8_192,
          memoryPercent: 23.2,
          cpuPercent: 28.7,
          diskUsedGb: 41,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "running",
            celery: "running",
          },
          processRestartCounts: {
            web: 2,
            celery: 4,
          },
          createdAt: new Date("2026-03-30T02:05:00.000Z"),
        },
        lastCheckAt: new Date("2026-03-30T07:58:00.000Z"),
        services: [
          { name: "web", status: "running" },
          { name: "celery", status: "running" },
        ],
        unackedAlerts: {
          critical: 0,
          warning: 0,
          error: 0,
          info: 0,
        },
        llmStats: {
          total: 30,
          errorCount: 1,
          serverErrorCount: 0,
          timeoutCount: 0,
          fallbackCount: 1,
          p95LatencyMs: 2_200,
          avgLatencyMs: 1_100,
          lastSeenAt: "2026-03-30T07:58:00.000Z",
        },
        mediaStats: {
          total: 12,
          errorCount: 0,
          serverErrorCount: 0,
          timeoutCount: 0,
          fallbackCount: 0,
          p95LatencyMs: 5_500,
          avgLatencyMs: 3_100,
          lastSeenAt: "2026-03-30T07:50:00.000Z",
        },
        orchestrationStats: {
          totalEvents: 16,
          classifyCount: 10,
          fallbackCount: 1,
          qualityCount: 8,
          riskyQualityCount: 1,
          avgClassifyLatencyMs: 700,
          fallbackRate: 0.1,
          qualityRiskRate: 0.125,
          topFallbackReason: "none",
          lastSeenAt: "2026-03-30T07:59:00.000Z",
        },
        windows: {
          metricsHours: 6,
          auditHours: 6,
          orchestrationHours: 6,
        },
        now: new Date("2026-03-30T08:00:00.000Z"),
      });

      expect(overview.health).toBe("healthy");
      expect(overview.anomalies).toHaveLength(0);
      expect(overview.summary.totalAnomalies).toBe(0);
    });
  });

  describe("buildOpsIncidentTimeline", () => {
    it("groups alert emissions and notification delivery into one incident timeline", () => {
      const items = buildOpsIncidentTimeline({
        lastCheckAt: "2026-03-30T08:05:00.000Z",
        alerts: [
          {
            id: 10,
            severity: "critical",
            title: "Queue backlog is growing",
            message: "media queue exceeded backlog threshold",
            channel: "log",
            acknowledged: false,
            acknowledgedBy: null,
            acknowledgedAt: null,
            metadata: {
              source: "ops_overview",
              dedupeKey: "ops-overview:queue_backlog",
              category: "services",
              signal: "queued=48",
              recommendation: "Scale workers or drain backlog",
              observedAt: "2026-03-30T08:01:00.000Z",
            },
            createdAt: new Date("2026-03-30T08:02:00.000Z"),
          },
          {
            id: 11,
            severity: "warning",
            title: "Queue backlog is growing",
            message: "media queue still elevated",
            channel: "log",
            acknowledged: false,
            acknowledgedBy: null,
            acknowledgedAt: null,
            metadata: {
              source: "ops_overview",
              dedupeKey: "ops-overview:queue_backlog",
              category: "services",
              signal: "queued=41",
              recommendation: "Scale workers or drain backlog",
              observedAt: "2026-03-30T08:00:00.000Z",
            },
            createdAt: new Date("2026-03-30T08:00:30.000Z"),
          },
        ] as any,
        notifications: [
          {
            id: 1,
            title: "Queue backlog is growing",
            priority: "critical",
            isRead: true,
            createdAt: new Date("2026-03-30T08:02:30.000Z"),
            lastOccurredAt: new Date("2026-03-30T08:03:00.000Z"),
            occurrenceCount: 2,
            groupKey: "ops-overview:queue_backlog",
          },
          {
            id: 2,
            title: "Queue backlog is growing",
            priority: "critical",
            isRead: false,
            createdAt: new Date("2026-03-30T08:02:45.000Z"),
            lastOccurredAt: new Date("2026-03-30T08:03:10.000Z"),
            occurrenceCount: 1,
            groupKey: "ops-overview:queue_backlog",
          },
        ],
      });

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        groupKey: "ops-overview:queue_backlog",
        severity: "critical",
        status: "awaiting_action",
        totalAlertCount: 2,
        openAlertCount: 2,
      });
      expect(items[0].notification.sent).toBe(true);
      expect(items[0].notification.recipientCount).toBe(2);
      expect(items[0].notification.readCount).toBe(1);
      expect(items[0].notification.occurrenceCount).toBe(3);
      expect(items[0].firstObservedAt).toBe("2026-03-30T08:00:00.000Z");
      expect(items[0].lastCheckedAt).toBe("2026-03-30T08:05:00.000Z");
    });

    it("marks an incident acknowledged once the grouped alerts are closed", () => {
      const items = buildOpsIncidentTimeline({
        lastCheckAt: "2026-03-30T08:20:00.000Z",
        alerts: [
          {
            id: 12,
            severity: "critical",
            title: "Monitoring pipeline stale",
            message: "checks are delayed",
            channel: "log",
            acknowledged: true,
            acknowledgedBy: 7,
            acknowledgedAt: new Date("2026-03-30T08:18:00.000Z"),
            metadata: {
              source: "ops_overview",
              dedupeKey: "ops-overview:monitoring_stale",
              category: "monitoring",
              observedAt: "2026-03-30T08:10:00.000Z",
              acknowledgement: {
                actorId: 7,
                actorName: "Ops Admin",
                actorEmail: "ops@example.com",
                note: "Restarted collector and verified fresh checks are landing again.",
                at: "2026-03-30T08:18:00.000Z",
              },
            },
            createdAt: new Date("2026-03-30T08:11:00.000Z"),
          },
        ] as any,
        notifications: [
          {
            id: 3,
            title: "Monitoring pipeline stale",
            priority: "critical",
            isRead: true,
            createdAt: new Date("2026-03-30T08:11:30.000Z"),
            lastOccurredAt: new Date("2026-03-30T08:11:30.000Z"),
            occurrenceCount: 1,
            groupKey: "ops-overview:monitoring_stale",
          },
        ],
      });

      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("acknowledged");
      expect(items[0].openAlertCount).toBe(0);
      expect(items[0].lastAcknowledgedAt).toBe("2026-03-30T08:18:00.000Z");
      expect(items[0].lastAcknowledgedByName).toBe("Ops Admin");
      expect(items[0].latestActionNote).toContain("Restarted collector");
      expect(items[0].currentOwnerName).toBe("Ops Admin");
      expect(items[0].latestResponseType).toBe("acknowledged");
      expect(items[0].latestResponseNote).toContain("Restarted collector");
      expect(items[0].responseHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "acknowledged",
          actorName: "Ops Admin",
        }),
      ]));
    });

    it("keeps the latest incident response state and history alongside alert aggregation", () => {
      const items = buildOpsIncidentTimeline({
        lastCheckAt: "2026-03-30T09:00:00.000Z",
        alerts: [
          {
            id: 13,
            severity: "critical",
            title: "Queue backlog is growing",
            message: "queue is still elevated after first mitigation",
            channel: "log",
            acknowledged: true,
            acknowledgedBy: 7,
            acknowledgedAt: new Date("2026-03-30T08:42:00.000Z"),
            metadata: {
              source: "ops_overview",
              dedupeKey: "ops-overview:queue_backlog",
              category: "services",
              signal: "queued=84",
              recommendation: "Drain queue and watch worker saturation",
              observedAt: "2026-03-30T08:30:00.000Z",
              acknowledgement: {
                actorId: 7,
                actorName: "Ops Admin",
                actorEmail: "ops@example.com",
                note: "Picked up the queue incident and started triage.",
                at: "2026-03-30T08:42:00.000Z",
              },
              incidentResponse: {
                currentOwnerId: 9,
                currentOwnerName: "Infra Lead",
                currentOwnerEmail: "infra@example.com",
                latestEventType: "resolved",
                latestEventAt: "2026-03-30T08:55:00.000Z",
                latestEventActorName: "Infra Lead",
                latestEventActorEmail: "infra@example.com",
                latestNote: "Backlog drained and worker throughput returned to baseline.",
                resolutionNote: "Backlog drained and worker throughput returned to baseline.",
                history: [
                  {
                    type: "resolved",
                    at: "2026-03-30T08:55:00.000Z",
                    actorId: 9,
                    actorName: "Infra Lead",
                    actorEmail: "infra@example.com",
                    note: "Backlog drained and worker throughput returned to baseline.",
                    ownerId: 9,
                    ownerName: "Infra Lead",
                    ownerEmail: "infra@example.com",
                  },
                  {
                    type: "handoff",
                    at: "2026-03-30T08:45:00.000Z",
                    actorId: 7,
                    actorName: "Ops Admin",
                    actorEmail: "ops@example.com",
                    note: "Handing queue investigation to infra owner.",
                    ownerId: 9,
                    ownerName: "Infra Lead",
                    ownerEmail: "infra@example.com",
                  },
                ],
              },
            },
            createdAt: new Date("2026-03-30T08:40:00.000Z"),
          },
        ] as any,
        notifications: [],
      });

      expect(items).toHaveLength(1);
      expect(items[0].currentOwnerName).toBe("Infra Lead");
      expect(items[0].latestResponseType).toBe("resolved");
      expect(items[0].latestResponseByName).toBe("Infra Lead");
      expect(items[0].latestResponseNote).toContain("throughput returned to baseline");
      expect(items[0].resolutionNote).toContain("throughput returned to baseline");
      expect(items[0].responseHistory.map((entry) => entry.type)).toEqual([
        "resolved",
        "handoff",
        "acknowledged",
      ]);
    });
  });
});
