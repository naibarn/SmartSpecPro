import { describe, expect, it } from "vitest";

import {
  evaluateSurfaceGovernance,
  WORK_ORCHESTRATOR_REASON_CODES,
} from "../workOrchestratorSecurityPolicy";
import type { WorkIntakeActorContext } from "../../../shared/workOrchestrator";

const memberContext: WorkIntakeActorContext = {
  tenantId: "tenant-1",
  actorUserId: 42,
  requesterUserId: "42",
  roles: ["member"],
  domainId: null,
  privateVaultUnlocked: false,
  allowedSourceScopes: ["case", "request", "conversation", "manual"],
  allowedSurfacePermissions: [
    "orchestrator.surface.skill",
    "orchestrator.surface.agency",
    "orchestrator.surface.skill_studio.create_private_or_pending_review",
  ],
  previewAccessLevel: "requester_safe",
};

describe("workOrchestratorSecurityPolicy", () => {
  it("allows low-risk skill routing when permission exists", () => {
    const decision = evaluateSurfaceGovernance({
      surface: "skill",
      actorContext: memberContext,
    });

    expect(decision.blockedReason).toBeNull();
    expect(decision.authorityDecision).toBe("allowed");
  });

  it("keeps workflow blocked until contracts migrate", () => {
    const decision = evaluateSurfaceGovernance({
      surface: "workflow",
      actorContext: {
        ...memberContext,
        allowedSurfacePermissions: [
          ...memberContext.allowedSurfacePermissions,
          "orchestrator.surface.workflow",
        ],
      },
    });

    expect(decision.blockedReason).toBe(
      WORK_ORCHESTRATOR_REASON_CODES.contractNotMigrated,
    );
    expect(decision.authorityDecision).toBe("blocked");
  });

  it("marks privileged approved surfaces as approval-required when not auto-executable", () => {
    const decision = evaluateSurfaceGovernance({
      surface: "video_editor",
      actorContext: {
        ...memberContext,
        allowedSurfacePermissions: [
          ...memberContext.allowedSurfacePermissions,
          "orchestrator.surface.video_editor",
        ],
      },
    });

    expect(decision.authorityDecision).toBe("approval_required");
    expect(decision.reasonCodes).toContain(
      WORK_ORCHESTRATOR_REASON_CODES.approvalRequired,
    );
  });

  it("keeps skill studio actions approval-gated even before contracts migrate", () => {
    const decision = evaluateSurfaceGovernance({
      surface: "skill_studio",
      action: "improve_owned_skill",
      actorContext: memberContext,
    });

    expect(decision.governance.approvalRequired).toBe(true);
    expect(decision.blockedReason).toBe(
      WORK_ORCHESTRATOR_REASON_CODES.contractNotMigrated,
    );
  });
});
