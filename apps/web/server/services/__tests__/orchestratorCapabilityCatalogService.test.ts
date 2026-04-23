import { describe, expect, it } from "vitest";

import { buildCapabilityCatalog } from "../orchestratorCapabilityCatalogService";
import type { WorkIntakeActorContext } from "../../../shared/workOrchestrator";

const actorContext: WorkIntakeActorContext = {
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
    "orchestrator.surface.browser",
    "orchestrator.surface.document_management",
    "orchestrator.surface.media_studio",
    "orchestrator.surface.video_editor",
    "orchestrator.surface.work_os",
    "orchestrator.surface.skill_studio.create_private_or_pending_review",
  ],
  previewAccessLevel: "requester_safe",
};

describe("orchestratorCapabilityCatalogService", () => {
  it("emits planner-visible entries for all orchestrator surfaces", () => {
    const catalog = buildCapabilityCatalog({
      actorContext,
      selectedSurfaces: ["skill", "agency"],
    });

    expect(catalog.map(entry => entry.surface)).toEqual(
      expect.arrayContaining([
        "manual",
        "work_os",
        "skill",
        "agency",
        "browser",
        "document_management",
        "media_studio",
        "video_editor",
        "workflow",
        "skill_studio",
      ]),
    );
  });

  it("keeps workflow and skill studio compatibility-blocked until contracts migrate", () => {
    const catalog = buildCapabilityCatalog({
      actorContext,
      selectedSurfaces: ["workflow", "skill_studio"],
    });

    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "workflow",
          blockedReason: "surface_contract_not_migrated",
        }),
        expect.objectContaining({
          surface: "skill_studio",
          action: "create_private_or_pending_review",
          blockedReason: "surface_contract_not_migrated",
        }),
      ]),
    );
  });
});
