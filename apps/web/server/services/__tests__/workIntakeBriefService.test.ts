import { describe, expect, it } from "vitest";

import { compileWorkBrief } from "../workIntakeBriefService";
import type {
  PreflightSourceRef,
  WorkIntakeActorContext,
  WorkIntakeSourceDiagnostic,
} from "../../../shared/workOrchestrator";

const sourceRefs: PreflightSourceRef[] = [
  {
    sourceType: "conversation",
    sourceId: "chat-1",
    label: "Conversation token: sk-secret",
    required: true,
    trust: "derived",
    freshness: "recent",
  },
];

const diagnostics: WorkIntakeSourceDiagnostic[] = [
  {
    sourceId: "chat-1",
    sourceType: "conversation",
    included: true,
    selected: true,
    code: "source_included",
    message: "Conversation token: sk-secret was included.",
    trust: "derived",
    freshness: "recent",
    requesterMessage: "Included for review.",
    adminDetail: "secretPolicy=token:abc",
  },
];

function buildActorContext(
  previewAccessLevel: WorkIntakeActorContext["previewAccessLevel"],
): WorkIntakeActorContext {
  return {
    tenantId: "tenant-1",
    actorUserId: 42,
    requesterUserId: "42",
    roles: ["member"],
    domainId: null,
    privateVaultUnlocked: false,
    allowedSourceScopes: ["conversation"],
    allowedSurfacePermissions: [],
    previewAccessLevel,
  };
}

describe("workIntakeBriefService", () => {
  it("redacts secret-like content from summaries and labels", () => {
    const result = compileWorkBrief({
      actorContext: buildActorContext("requester_safe"),
      title: "Launch with api-key: secret",
      objective: "Use sk-secret to finish the task",
      sourceRefs,
      selectedSourceIds: ["chat-1"],
      diagnostics,
      generatedAt: "2026-04-21T00:00:00.000Z",
    });

    expect(result.brief.title).not.toContain("secret");
    expect(result.brief.summary).toContain("[REDACTED]");
    expect(result.brief.sourceRefs[0]?.label).toContain("[REDACTED]");
  });

  it("redacts admin-only diagnostics in requester-safe mode", () => {
    const result = compileWorkBrief({
      actorContext: buildActorContext("requester_safe"),
      title: "Launch",
      objective: "Create assets",
      sourceRefs,
      selectedSourceIds: ["chat-1"],
      diagnostics,
    });

    expect(result.governedContext.diagnostics[0]?.adminDetail).toBeNull();
  });

  it("preserves admin diagnostics for admin-diagnostic previews", () => {
    const result = compileWorkBrief({
      actorContext: buildActorContext("admin_diagnostic"),
      title: "Launch",
      objective: "Create assets",
      sourceRefs,
      selectedSourceIds: ["chat-1"],
      diagnostics,
    });

    expect(result.governedContext.diagnostics[0]?.adminDetail).toBe(
      "secretPolicy=token:abc",
    );
  });
});
