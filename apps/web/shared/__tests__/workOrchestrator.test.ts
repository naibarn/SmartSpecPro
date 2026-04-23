/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import {
  capabilityCatalogEntrySchema,
  getDefaultContractCompatibility,
  isWorkOsSurfaceContractMigrated,
  preflightApprovalBundleSchema,
  teamResolutionDecisionSchema,
} from "../workOrchestrator";

describe("workOrchestrator contracts", () => {
  it("keeps new surfaces planner-visible but compatibility-blocked until Work OS contracts migrate", () => {
    expect(isWorkOsSurfaceContractMigrated("skill")).toBe(true);
    expect(isWorkOsSurfaceContractMigrated("workflow")).toBe(false);
    expect(getDefaultContractCompatibility("workflow")).toEqual({
      state: "blocked_contract_not_migrated",
      reasonCode: "surface_contract_not_migrated",
      migrationRequired: true,
    });
  });

  it("validates action-specific Skill Studio capability entries", () => {
    const parsed = capabilityCatalogEntrySchema.parse({
      id: "skill_studio:create_private",
      surface: "skill_studio",
      action: "create_private_or_pending_review",
      title: "Create task-specific skill",
      governance: {
        surface: "skill_studio",
        action: "create_private_or_pending_review",
        plannerVisible: true,
        autoExecutableByDefault: false,
        approvalRequired: true,
        minimumGate: "skill_studio_action_policy",
      },
      contractCompatibility: getDefaultContractCompatibility("skill_studio"),
    });

    expect(parsed.action).toBe("create_private_or_pending_review");
    expect(parsed.contractCompatibility.reasonCode).toBe("surface_contract_not_migrated");
  });

  it("validates deterministic team resolution decisions", () => {
    const parsed = teamResolutionDecisionSchema.parse({
      status: "resolved",
      code: "resolved_request_default_queue",
      teamId: "team-1",
      source: "request_default_queue",
      reason: "Resolved from request default queue",
    });

    expect(parsed.teamId).toBe("team-1");
  });

  it("preserves preflight approval bundles with revision fingerprints", () => {
    const now = "2026-04-21T00:00:00.000Z";
    const bundle = preflightApprovalBundleSchema.parse({
      id: "preflight-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      caseId: "case-1",
      state: "previewed",
      createdAt: now,
      updatedAt: now,
      previewView: "requester_safe",
      brief: {
        title: "Launch campaign",
        objective: "Create launch assets",
        generatedAt: now,
      },
      capabilityCatalog: [],
      preflightRevision: {
        algorithm: "sha256-json-v1",
        fingerprint: "a".repeat(64),
        inputs: {
          requestTitle: "Launch campaign",
          requestObjective: "Create launch assets",
          linkedConversationIds: ["chat-1"],
          linkedWorkpackRunIds: [],
          linkedRoleRoutineRunIds: [],
          selectedSourceIds: ["chat-1"],
          policyDigest: null,
          explicitTeamId: null,
        },
        generatedAt: now,
      },
    });

    expect(bundle.preflightRevision.inputs.linkedConversationIds).toEqual(["chat-1"]);
  });
});
