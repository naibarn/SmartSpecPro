import { describe, it, expect } from "vitest";
import {
  STUCK_THRESHOLD_MS,
  SNAPSHOT_INTERVAL_MS,
  buildOpsAlertDedupeKey,
  deriveOpsOverview,
  buildOpsIncidentTimeline,
  shouldSkipOpsAlertEmission,
  describeRunStatusBridge,
  buildRunRuntimeState,
  extractRunRuntimeState,
  extractRunPlanArtifact,
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
        latestOpenAlert: {
          title: "LLM error rate spiked",
          message: "8 of 26 recent LLM calls failed. Top failures: OpenRouter/openai/gpt-5.4-mini → HTTP 400 (7); Kie AI/claude-sonnet-4-6 → HTTP 404 (1).",
          signal: "31% error rate · OpenRouter/openai/gpt-5.4-mini → HTTP 400 (7); Kie AI/claude-sonnet-4-6 → HTTP 404 (1)",
          recommendation: "Check provider health, model routing, and fallback paths before chat traffic degrades broadly.",
          source: "provider_usage_log",
          anomalyType: "llm_error_spike",
          severity: "critical",
          createdAt: "2026-03-30T07:58:30.000Z",
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
          topFailureSummary: "OpenRouter/openai/gpt-5.4-mini → HTTP 400 (7); Kie AI/claude-sonnet-4-6 → HTTP 404 (1)",
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
      expect(overview.anomalies.find((anomaly) => anomaly.type === "llm_error_spike")?.message).toContain("Top failures");
      expect(overview.anomalies.find((anomaly) => anomaly.type === "llm_error_spike")?.signal).toContain("OpenRouter");
      expect(overview.anomalies.find((anomaly) => anomaly.type === "alert_backlog")?.message).toContain("LLM error rate spiked");
      expect(overview.anomalies.find((anomaly) => anomaly.type === "alert_backlog")?.signal).toContain("latest unresolved");
      expect(overview.leadingSignals.maxRestartDelta).toBe(4);
      expect(overview.leadingSignals.llmErrorRate).toBeCloseTo(0.24);
    });

    it("keeps alert backlog dedupe stable for the same unresolved incident", () => {
      const anomaly = {
        id: "monitoring:alert_backlog",
        severity: "critical",
        category: "monitoring",
        type: "alert_backlog",
        title: "Critical monitoring alerts are still unacknowledged",
        message: "1 high-severity alert is pending acknowledgement. Latest unresolved alert: LLM tail latency is critically high - Recent LLM p95 latency is 21.4s.",
        recommendation: "Triage LLM tail latency is critically high first, then acknowledge the backlog once ownership and the root cause note are clear.",
        signal: "1 pending · latest unresolved: LLM tail latency is critically high",
        observedAt: "2026-04-15T00:00:00.000Z",
        source: "monitoring_alerts",
      } as const;

      const overviewA = {
        unackedAlerts: { critical: 1, warning: 0, error: 0, info: 0 },
        latestOpenAlert: {
          title: "LLM tail latency is critically high",
          message: "Recent LLM p95 latency is 21.4s.",
          anomalyType: "llm_latency_spike",
        },
      } as const;

      const overviewB = {
        unackedAlerts: { critical: 1, warning: 0, error: 0, info: 0 },
        latestOpenAlert: {
          title: "LLM tail latency is critically high",
          message: "Recent LLM p95 latency is 21.4s.",
          anomalyType: "llm_latency_spike",
        },
      } as const;

      const overviewC = {
        unackedAlerts: { critical: 2, warning: 0, error: 0, info: 0 },
        latestOpenAlert: {
          title: "LLM error rate spiked",
          message: "8 of 26 recent LLM calls failed.",
          anomalyType: "llm_error_spike",
        },
      } as const;

      expect(buildOpsAlertDedupeKey(anomaly as any, overviewA as any)).toBe(buildOpsAlertDedupeKey(anomaly as any, overviewB as any));
      expect(buildOpsAlertDedupeKey(anomaly as any, overviewA as any)).not.toBe(buildOpsAlertDedupeKey(anomaly as any, overviewC as any));
    });

    it("suppresses emission when an alert is still open or recently emitted", () => {
      expect(shouldSkipOpsAlertEmission(true, false)).toBe(true);
      expect(shouldSkipOpsAlertEmission(false, true)).toBe(true);
      expect(shouldSkipOpsAlertEmission(true, true)).toBe(true);
      expect(shouldSkipOpsAlertEmission(false, false)).toBe(false);
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

    it("maps run statuses into a deterministic Work OS bridge", () => {
      expect(describeRunStatusBridge("running")).toEqual(expect.objectContaining({
        teamRunStatus: "running",
        workOsState: "in_progress",
      }));
      expect(describeRunStatusBridge("paused", "awaiting_human_approval")).toEqual(expect.objectContaining({
        teamRunStatus: "paused",
        workOsState: "waiting_for_approval",
      }));
      expect(describeRunStatusBridge("stopped", "user_requested")).toEqual(expect.objectContaining({
        teamRunStatus: "stopped",
        workOsState: "cancelled",
      }));
    });

    it("builds a durable runtime overlay from the current run shape", () => {
      const runtimeState = buildRunRuntimeState({
        status: "running",
        stopReason: null,
        summaryArtifactId: "summary-1",
        roomId: "room-1",
        teamId: "team-1",
      } as any);

      expect(runtimeState).toEqual(expect.objectContaining({
        currentPhase: "running",
        waitingReason: null,
        verificationState: "unknown",
        evidenceRefs: ["summary:summary-1"],
      }));
      expect(runtimeState.statusBridge.workOsState).toBe("in_progress");
      expect(runtimeState.workOsLinkage).toEqual(expect.objectContaining({
        teamId: "team-1",
        roomId: "room-1",
        projectedWorkOsState: "in_progress",
      }));
    });

    it("extracts the runtime overlay from newer or legacy snapshot payloads", () => {
      const runtimeState = {
        currentPhase: "awaiting_human_approval",
        waitingReason: "awaiting_human_approval",
        policyGateReason: "approval is required",
        traceId: "trace-1",
        nextPollAt: null,
        riskClass: "high",
        reviewerPersona: "safety-reviewer",
        verificationState: "pending",
        evidenceRefs: ["summary:summary-1"],
        jobHandle: { provider: "hermes" },
        governedContext: {
          version: 1,
          tenantId: "tenant-1",
          principalScope: "team-1",
          objective: "Launch objective",
          generatedAt: "2026-04-15T12:00:00.000Z",
          selectedCount: 1,
          excludedCount: 0,
          summary: "1 context item(s) selected, 0 excluded for Launch objective",
          items: [],
        },
        traceEnvelope: {
          version: 1,
          traceId: "trace-1",
          tenantId: "tenant-1",
          source: "monitoring",
          entityId: "run-1",
          eventType: "snapshot",
          generatedAt: "2026-04-15T12:00:00.000Z",
          summary: "Snapshot created",
          evidenceRefs: [],
        },
        readinessRecord: {
          version: 1,
          kind: "team_run",
          entityId: "run-1",
          generatedAt: "2026-04-15T12:00:00.000Z",
          score: 0.8,
          status: "ready",
          reason: "Ready",
          evidenceRefs: [],
        },
        statusBridge: describeRunStatusBridge("paused", "awaiting_human_approval"),
        workOsLinkage: {
          teamId: "team-1",
          roomId: "room-1",
          projectedWorkOsState: "waiting_for_approval",
        },
      };

      expect(extractRunRuntimeState({
        artifactCountJson: {
          statusBridge: describeRunStatusBridge("paused", "awaiting_human_approval"),
          runtimeState,
        },
      } as any)).toEqual(expect.objectContaining({
        currentPhase: "awaiting_human_approval",
        waitingReason: "awaiting_human_approval",
        policyGateReason: "approval is required",
        traceId: "trace-1",
        riskClass: "high",
        reviewerPersona: "safety-reviewer",
        verificationState: "pending",
        governedContext: expect.objectContaining({
          tenantId: "tenant-1",
        }),
        traceEnvelope: expect.objectContaining({
          traceId: "trace-1",
        }),
        readinessRecord: expect.objectContaining({
          status: "ready",
        }),
      }));

      expect(extractRunRuntimeState({
        artifactCountJson: {
          statusBridge: describeRunStatusBridge("running"),
        },
      } as any)).toEqual(expect.objectContaining({
        currentPhase: "running",
        statusBridge: expect.objectContaining({
          workOsState: "in_progress",
        }),
      }));
    });

    it("extracts the durable plan artifact from snapshot payloads", () => {
      expect(extractRunPlanArtifact({
        artifactCountJson: {
          planArtifact: {
            version: 1,
            runId: "run-1",
            roomId: "room-1",
            teamId: "team-1",
            caseId: null,
            requestId: null,
            objective: "Launch objective",
            source: "team_run",
            status: "ready",
            generatedAt: "2026-04-15T12:00:00.000Z",
            lastUpdatedAt: "2026-04-15T12:30:00.000Z",
            exploration: {
              selectedCandidateId: "balanced-hybrid",
              selectionReason: "Balanced hybrid keeps exploration bounded while preserving choice quality.",
              criteria: ["safety", "speed", "determinism"],
              candidates: [
                {
                  candidateId: "workflow-first",
                  title: "Workflow first",
                  strategy: "deterministic, review-heavy execution",
                  summary: "Keep the path narrow.",
                  strengths: ["tight evidence discipline"],
                  tradeoffs: ["less exploratory breadth"],
                  riskClass: "medium",
                },
                {
                  candidateId: "balanced-hybrid",
                  title: "Balanced hybrid",
                  strategy: "bounded exploration then commit",
                  summary: "Explore then lock a plan.",
                  strengths: ["balance of creativity and control"],
                  tradeoffs: ["not fully exhaustive"],
                  riskClass: "medium",
                },
              ],
            },
            steps: [],
            evidenceRefs: [],
            planEvidenceRefs: [],
            reviewerMatrix: [],
            review: {
              status: "passed",
              iteration: 1,
              reviewedAt: "2026-04-15T12:31:00.000Z",
              reviewerPersona: "safety-reviewer",
              issues: [],
              score: 0.92,
              recommendation: "Proceed to execution.",
            },
          },
        },
      } as any)).toEqual(expect.objectContaining({
        objective: "Launch objective",
        status: "ready",
      }));
    });

    it("downgrades a one-off failed service snapshot when the previous snapshot was healthy", () => {
      const overview = deriveOpsOverview({
        latestMetrics: {
          id: 10,
          memoryUsedMb: 2_400,
          memoryTotalMb: 8_192,
          memoryPercent: 29.3,
          cpuPercent: 42.1,
          diskUsedGb: 40,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "failed",
            backend: "running",
          },
          processRestartCounts: {
            web: 0,
            backend: 0,
          },
          createdAt: new Date("2026-04-01T01:34:58.000Z"),
        },
        previousMetrics: {
          id: 9,
          memoryUsedMb: 2_200,
          memoryTotalMb: 8_192,
          memoryPercent: 26.8,
          cpuPercent: 31.2,
          diskUsedGb: 39,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "running",
            backend: "running",
          },
          processRestartCounts: {
            web: 0,
            backend: 0,
          },
          createdAt: new Date("2026-04-01T01:33:58.000Z"),
        },
        baselineMetrics: {
          id: 8,
          memoryUsedMb: 2_000,
          memoryTotalMb: 8_192,
          memoryPercent: 24.4,
          cpuPercent: 28.4,
          diskUsedGb: 38,
          diskTotalGb: 100,
          serviceStatuses: {
            web: "running",
            backend: "running",
          },
          processRestartCounts: {
            web: 0,
            backend: 0,
          },
          createdAt: new Date("2026-04-01T00:40:00.000Z"),
        },
        lastCheckAt: new Date("2026-04-01T01:34:58.000Z"),
        services: [
          { name: "web", status: "failed" },
          { name: "backend", status: "running" },
        ],
        unackedAlerts: {
          critical: 0,
          warning: 0,
          error: 0,
          info: 0,
        },
        llmStats: {
          total: 10,
          errorCount: 0,
          serverErrorCount: 0,
          timeoutCount: 0,
          fallbackCount: 0,
          p95LatencyMs: 1_100,
          avgLatencyMs: 900,
          lastSeenAt: "2026-04-01T01:34:00.000Z",
        },
        mediaStats: {
          total: 8,
          errorCount: 0,
          serverErrorCount: 0,
          timeoutCount: 0,
          fallbackCount: 0,
          p95LatencyMs: 700,
          avgLatencyMs: 500,
          lastSeenAt: "2026-04-01T01:34:00.000Z",
        },
        orchestrationStats: {
          totalEvents: 4,
          classifyCount: 2,
          fallbackCount: 0,
          qualityCount: 1,
          riskyQualityCount: 0,
          avgClassifyLatencyMs: 300,
          fallbackRate: 0,
          qualityRiskRate: 0,
          topFallbackReason: null,
          lastSeenAt: "2026-04-01T01:34:00.000Z",
        },
        windows: {
          metricsHours: 6,
          auditHours: 6,
          orchestrationHours: 6,
        },
        now: new Date("2026-04-01T01:35:30.000Z"),
      });

      expect(overview.anomalies.some((anomaly) => anomaly.type === "service_unhealthy")).toBe(false);
      expect(overview.anomalies.some((anomaly) => anomaly.type === "service_degraded")).toBe(true);
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
