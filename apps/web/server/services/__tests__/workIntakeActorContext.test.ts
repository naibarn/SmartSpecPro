import { describe, expect, it } from "vitest";

import { deriveWorkIntakeActorContext } from "../workIntakeActorContext";

describe("workIntakeActorContext", () => {
  it("derives requester-safe defaults for a normal member", () => {
    const context = deriveWorkIntakeActorContext({
      tenantId: "tenant-1",
      actorUserId: 42,
      actorRole: "member",
      requesterUserId: "42",
      privateVaultUnlocked: false,
    });

    expect(context.previewAccessLevel).toBe("requester_safe");
    expect(context.allowedSourceScopes).toEqual(
      expect.arrayContaining([
        "case",
        "request",
        "conversation",
        "workpack_run",
        "role_routine_run",
        "manual",
      ]),
    );
    expect(context.allowedSourceScopes).not.toContain("memory");
    expect(context.allowedSurfacePermissions).toEqual(
      expect.arrayContaining([
        "orchestrator.surface.skill",
        "orchestrator.surface.agency",
        "orchestrator.surface.skill_studio.create_private_or_pending_review",
      ]),
    );
    expect(context.allowedSurfacePermissions).not.toContain(
      "orchestrator.surface.skill_studio.improve_owned_skill",
    );
    expect(context.allowedSurfacePermissions).not.toContain(
      "orchestrator.surface.workflow",
    );
  });

  it("unlocks private scopes and admin permissions for domain admins", () => {
    const context = deriveWorkIntakeActorContext({
      tenantId: "tenant-1",
      actorUserId: 7,
      actorRole: "domain_admin",
      requesterUserId: "42",
      privateVaultUnlocked: true,
    });

    expect(context.previewAccessLevel).toBe("admin_diagnostic");
    expect(context.allowedSourceScopes).toEqual(
      expect.arrayContaining(["memory", "library_context_pack", "policy"]),
    );
    expect(context.allowedSurfacePermissions).toEqual(
      expect.arrayContaining([
        "orchestrator.surface.workflow",
        "orchestrator.surface.skill_studio.improve_owned_skill",
        "orchestrator.surface.skill_studio.auto_apply_proposal",
        "orchestrator.surface.skill_studio.publish_or_widen_visibility",
        "orchestrator.team_override",
      ]),
    );
  });

  it("respects explicit source-scope and permission overrides", () => {
    const context = deriveWorkIntakeActorContext({
      tenantId: "tenant-1",
      actorUserId: 21,
      actorRole: "member",
      requesterUserId: "21",
      allowedSourceScopes: ["conversation", "manual"],
      allowedSurfacePermissions: ["custom.permission"],
    });

    expect(context.allowedSourceScopes).toEqual(["conversation", "manual"]);
    expect(context.allowedSurfacePermissions).toEqual(["custom.permission"]);
  });
});
