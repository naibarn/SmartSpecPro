/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import {
  buildDefaultEvidenceGovernance,
  sanitizeSensitiveRecord,
  workpackExecutionPlanSchema,
  workpackRunSchema,
  workpackSchema,
  workpackVersionSchema,
} from "../workpackContracts";

describe("workpackContracts", () => {
  it("validates workpack, version, and plan payloads", () => {
    const workpack = workpackSchema.parse({
      id: "wp_1",
      tenantId: "tenant-1",
      title: "Invoice Reconciliation",
      description: "Daily AP reconciliation",
      goal: "Close invoice mismatches",
      domainPack: "finance_ops",
      lifecycleState: "draft",
      autonomyMode: "draft",
      promotionState: "unpromoted",
      currentVersionId: "wpv_1",
      caseSourceIds: ["src_1"],
      policyProfile: {},
      runtimePreferenceHints: ["hybrid"],
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const version = workpackVersionSchema.parse({
      id: "wpv_1",
      workpackId: workpack.id,
      versionNumber: 1,
      playbook: {
        id: "pl_1",
        tenantId: "tenant-1",
        title: "Invoice Playbook",
        goal: "Close mismatches",
        description: "",
        domainPack: "finance_ops",
        sourceIds: ["src_1"],
        createdAt: "2026-04-10T00:00:00.000Z",
        steps: [
          {
            id: "step_1",
            title: "Collect",
            objective: "Collect invoices",
            expectedOutcome: "Ready to reconcile",
            preferredRuntimePath: "hybrid",
            allowedFallbackPaths: ["workflow"],
            requiredConnectorFamilies: ["erp"],
            sideEffectClass: "read_only",
            requiresReplay: true,
            requiresApproval: false,
            localityHint: "none",
            idempotency: {
              mode: "none",
              retryDisposition: "safe_retry",
              replayMode: "inspection_only",
            },
            metadata: {},
          },
        ],
      },
      executionPlan: {
        workpackId: "wp_1",
        versionId: "wpv_1",
        generatedAt: "2026-04-10T00:00:00.000Z",
        routeReason: "finance_ops default routing",
        fixtureRequirements: {
          requiresFixtures: true,
          requiresMaskedInputs: true,
        },
        evidenceRequirements: {
          requiredTraceDetail: "full",
          promotionNeedsReplay: true,
        },
        steps: [
          {
            id: "step_1",
            title: "Collect",
            objective: "Collect invoices",
            expectedOutcome: "Ready to reconcile",
            preferredRuntimePath: "hybrid",
            allowedFallbackPaths: ["workflow"],
            requiredConnectorFamilies: ["erp"],
            sideEffectClass: "read_only",
            requiresReplay: true,
            requiresApproval: false,
            localityHint: "none",
            idempotency: {
              mode: "none",
              retryDisposition: "safe_retry",
              replayMode: "inspection_only",
            },
            metadata: {},
          },
        ],
      },
      connectorMaps: [],
      fixtureCatalog: [],
      compilerMetadata: {},
      publishedAt: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    expect(version.executionPlan?.steps).toHaveLength(1);
    expect(workpack.currentVersionId).toBe(version.id);
  });

  it("fails closed on unknown lifecycle values", () => {
    expect(() => workpackSchema.parse({
      id: "wp_1",
      tenantId: "tenant-1",
      title: "Bad",
      description: "",
      goal: "Bad",
      domainPack: "custom",
      lifecycleState: "running",
      autonomyMode: "draft",
      promotionState: "unpromoted",
      currentVersionId: "wpv_1",
      caseSourceIds: [],
      policyProfile: {},
      runtimePreferenceHints: [],
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    })).toThrow();
  });

  it("preserves replay-grade run payloads", () => {
    const parsed = workpackRunSchema.parse({
      id: "run_1",
      workpackId: "wp_1",
      versionId: "wpv_1",
      tenantId: "tenant-1",
      startedAt: "2026-04-10T00:00:00.000Z",
      endedAt: null,
      status: "succeeded",
      autonomyMode: "supervised",
      plannedSteps: [],
      actualSteps: [
        {
          stepId: "step_1",
          title: "Collect",
          runtimePath: "hybrid",
          status: "succeeded",
          sideEffectClass: "read_only",
          effectKey: null,
          outputSummary: "Collected 10 invoices",
        },
      ],
      approvalCheckpoints: [],
      artifactReferences: [
        {
          artifactId: "artifact_1",
          label: "Diff summary",
          governance: buildDefaultEvidenceGovernance({ redactionState: "redacted" }),
          summary: "No secrets",
        },
      ],
      connectorSummaries: [
        {
          connectorFamily: "erp",
          status: "validated",
          summary: "Schema matched",
        },
      ],
      notes: "",
    });

    expect(parsed.actualSteps[0]?.outputSummary).toContain("Collected");
  });

  it("redacts secret-like fields in evidence payloads", () => {
    expect(
      sanitizeSensitiveRecord({
        apiKey: "secret",
        tokenValue: "abc",
        safeField: "ok",
      }),
    ).toEqual({
      apiKey: "[REDACTED]",
      tokenValue: "[REDACTED]",
      safeField: "ok",
    });
  });

  it("validates execution plans with explicit idempotency metadata", () => {
    const parsed = workpackExecutionPlanSchema.parse({
      workpackId: "wp_1",
      versionId: "wpv_1",
      generatedAt: "2026-04-10T00:00:00.000Z",
      routeReason: "custom",
      fixtureRequirements: {
        requiresFixtures: true,
        requiresMaskedInputs: false,
      },
      evidenceRequirements: {
        requiredTraceDetail: "standard",
        promotionNeedsReplay: true,
      },
      steps: [
        {
          id: "step_1",
          title: "Commit",
          objective: "Commit the change",
          expectedOutcome: "Committed",
          preferredRuntimePath: "hybrid",
          allowedFallbackPaths: [],
          requiredConnectorFamilies: ["crm"],
          sideEffectClass: "external_write",
          requiresReplay: true,
          requiresApproval: true,
          localityHint: "none",
          idempotency: {
            mode: "connector_key",
            effectKey: "crm-step-1",
            retryDisposition: "safe_retry",
            replayMode: "requires_fresh_run",
          },
          metadata: {},
        },
      ],
    });

    expect(parsed.steps[0]?.idempotency.mode).toBe("connector_key");
  });
});
