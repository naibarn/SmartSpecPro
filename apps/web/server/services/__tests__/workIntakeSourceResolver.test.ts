import { describe, expect, it } from "vitest";

import { resolveWorkIntakeSources } from "../workIntakeSourceResolver";
import type { WorkIntakeActorContext } from "../../../shared/workOrchestrator";

const baseActorContext: WorkIntakeActorContext = {
  tenantId: "tenant-1",
  actorUserId: 42,
  requesterUserId: "42",
  roles: ["member"],
  domainId: null,
  privateVaultUnlocked: false,
  allowedSourceScopes: [
    "case",
    "request",
    "conversation",
    "workpack_run",
    "role_routine_run",
    "manual",
  ],
  allowedSurfacePermissions: [],
  previewAccessLevel: "requester_safe",
};

describe("workIntakeSourceResolver", () => {
  it("rejects malformed source ids", () => {
    expect(() =>
      resolveWorkIntakeSources({
        actorContext: baseActorContext,
        sourceRefs: [
          {
            sourceType: "conversation",
            sourceId: "   ",
          },
        ],
      }),
    ).toThrow("SOURCE_REF_INVALID");
  });

  it("marks private sources as locked when vault access is missing", () => {
    const result = resolveWorkIntakeSources({
      actorContext: baseActorContext,
      sourceRefs: [
        {
          sourceType: "memory",
          sourceId: "mem-1",
          label: "Private memory",
          required: true,
        },
      ],
    });

    expect(result.sourceRefs).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        sourceId: "mem-1",
        included: false,
        code: "source_private_vault_locked",
      }),
    ]);
  });

  it("omits optional sources when the configured source budget is exceeded", () => {
    const result = resolveWorkIntakeSources({
      actorContext: baseActorContext,
      maxSources: 1,
      selectedSourceIds: ["chat-1", "wp-1"],
      sourceRefs: [
        {
          sourceType: "conversation",
          sourceId: "chat-1",
          label: "Conversation 1",
          required: true,
        },
        {
          sourceType: "workpack_run",
          sourceId: "wp-1",
          label: "Workpack 1",
          required: false,
        },
      ],
    });

    expect(result.sourceRefs.map(source => source.sourceId)).toEqual(["chat-1"]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "wp-1",
          code: "source_budget_exceeded",
        }),
      ]),
    );
  });

  it("marks selected unavailable sources as unavailable instead of silently including them", () => {
    const result = resolveWorkIntakeSources({
      actorContext: baseActorContext,
      sourceRefs: [
        {
          sourceType: "conversation",
          sourceId: "12",
          label: "Conversation 12",
          required: true,
          availability: "unavailable",
          requesterMessage: "Conversation access expired.",
          adminDetail: "conversation_not_accessible",
        },
      ],
    });

    expect(result.sourceRefs).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        sourceId: "12",
        included: false,
        code: "source_selected_but_unavailable",
        adminDetail: "conversation_not_accessible",
      }),
    ]);
  });

  it("returns integrity markers for included sources", () => {
    const result = resolveWorkIntakeSources({
      actorContext: baseActorContext,
      sourceRefs: [
        {
          sourceType: "case",
          sourceId: "case-1",
          label: "Case 1",
          required: true,
          integrityMarker: {
            summary: "Case 1 summary",
            approvedExcerpt: "Case 1 excerpt",
            versionMarker: "2026-04-21T00:00:00.000Z",
            contentHash: "abc123",
            sanitizationState: "summary_only",
          },
        },
      ],
    });

    expect(result.integrityMarkers["case-1"]).toEqual({
      sourceId: "case-1",
      approvedExcerpt: "Case 1 excerpt",
      summary: "Case 1 summary",
      versionMarker: "2026-04-21T00:00:00.000Z",
      contentHash: "abc123",
      sanitizationState: "summary_only",
    });
  });
});
