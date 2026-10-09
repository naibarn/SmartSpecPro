import { describe, expect, it } from "vitest";
import {
  CANONICAL_PROJECT_CONTEXT_POLICY_VERSION,
  resolveCanonicalProjectContext,
  type CanonicalProjectBindingEvidence,
  type CanonicalProjectContextDimensions,
} from "../canonicalProjectContextResolver";

const context: CanonicalProjectContextDimensions = {
  tenantId: "tenant-a",
  principalId: "user-a",
  appId: "app-a",
  installationId: "install-a",
  workContextId: "work-a",
  workspaceId: "workspace-a",
  spaceId: "space-a",
  conversationId: "conversation-a",
  sessionId: "session-a",
  taskId: "task-a",
  domainType: "page",
  domainRecordId: "page-a",
  environment: "staging",
  purpose: "chat",
};

function binding(
  source: CanonicalProjectBindingEvidence["source"],
  canonicalProjectId: string | null,
  overrides: Partial<CanonicalProjectBindingEvidence> = {},
): CanonicalProjectBindingEvidence {
  const sourceScope: Partial<CanonicalProjectBindingEvidence> = {
    ...(source === "explicit_user_selection" || source === "explicit_no_project"
      ? { principalId: context.principalId }
      : {}),
    ...(source === "domain_binding" && context.domainType && context.domainRecordId
      ? { domainType: context.domainType, domainRecordId: context.domainRecordId }
      : {}),
    ...(source === "task_workflow_artifact_binding" && context.taskId ? { taskId: context.taskId } : {}),
    ...(source === "conversation_segment_binding" && context.conversationId
      ? { conversationId: context.conversationId }
      : {}),
    ...(source === "app_active_project_binding" && context.appId ? { appId: context.appId } : {}),
    ...(source === "signed_launch_navigation_context" && context.installationId
      ? { installationId: context.installationId }
      : {}),
  };
  return {
    source,
    canonicalProjectId,
    tenantId: context.tenantId,
    ...sourceScope,
    ...overrides,
  };
}

describe("resolveCanonicalProjectContext", () => {
  it("prefers explicit user selection when weaker authoritative evidence agrees", () => {
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [
        binding("app_active_project_binding", "project-a"),
        binding("explicit_user_selection", "project-a", { principalId: context.principalId }),
      ],
    });

    expect(result).toMatchObject({
      policyVersion: CANONICAL_PROJECT_CONTEXT_POLICY_VERSION,
      state: "RESOLVED_EXPLICIT",
      canonicalProjectId: "project-a",
      authoritativeSource: "explicit_user_selection",
      advisory: true,
      authorizationRequired: true,
    });
  });

  it("marks contradictory authoritative project IDs ambiguous regardless of precedence", () => {
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [
        binding("explicit_user_selection", "project-explicit", { principalId: context.principalId }),
        binding("domain_binding", "project-domain"),
      ],
    });

    expect(result.state).toBe("AMBIGUOUS");
    expect(result).not.toHaveProperty("canonicalProjectId");
    expect(result).not.toHaveProperty("authoritativeSource");
  });

  it("collapses duplicate same-ID evidence deterministically independent of input order", () => {
    const explicit = binding("explicit_user_selection", "project-a", { principalId: context.principalId });
    const domain = binding("domain_binding", "project-a");
    const first = resolveCanonicalProjectContext({ context, bindings: [domain, explicit, domain] });
    const second = resolveCanonicalProjectContext({ context, bindings: [domain, domain, explicit] });

    expect(first).toEqual(second);
    expect(first.authoritativeSource).toBe("explicit_user_selection");
    expect(first.canonicalProjectId).toBe("project-a");
  });

  it("returns recent and semantic candidates only as suggestions", () => {
    const result = resolveCanonicalProjectContext({
      context,
      recentCandidates: [
        { canonicalProjectId: "recent-a", tenantId: context.tenantId, score: 0.8 },
      ],
      semanticCandidates: [
        { canonicalProjectId: "semantic-a", tenantId: context.tenantId, score: 0.99 },
      ],
    });

    expect(result.state).toBe("UNRESOLVED");
    expect(result).not.toHaveProperty("canonicalProjectId");
    expect(result.suggestions).toEqual([
      { canonicalProjectId: "recent-a", source: "recent", score: 0.8 },
      { canonicalProjectId: "semantic-a", source: "semantic", score: 0.99 },
    ]);
  });

  it("ranks suggestions by source, descending score, then stable project ID", () => {
    const result = resolveCanonicalProjectContext({
      context,
      recentCandidates: [
        { canonicalProjectId: "recent-z", tenantId: context.tenantId, score: 0.4 },
        { canonicalProjectId: "recent-b", tenantId: context.tenantId, score: 0.8 },
        { canonicalProjectId: "recent-a", tenantId: context.tenantId, score: 0.8 },
      ],
      semanticCandidates: [
        { canonicalProjectId: "semantic-z", tenantId: context.tenantId, score: 0.99 },
        { canonicalProjectId: "semantic-a", tenantId: context.tenantId, score: 0.99 },
      ],
    });

    expect(result.suggestions.map(({ source, canonicalProjectId }) => [source, canonicalProjectId])).toEqual([
      ["recent", "recent-a"],
      ["recent", "recent-b"],
      ["recent", "recent-z"],
      ["semantic", "semantic-a"],
      ["semantic", "semantic-z"],
    ]);
  });

  it.each([
    ["explicit no project", { bindings: [binding("explicit_no_project", null, { principalId: context.principalId })] }, "NO_PROJECT"],
    ["no evidence", {}, "UNRESOLVED"],
    ["pending scope", { sessionPendingScope: true }, "SESSION_PENDING_SCOPE"],
  ] as const)("does not select a project for %s", (_label, input, expectedState) => {
    const result = resolveCanonicalProjectContext({ context, ...input });
    expect(result.state).toBe(expectedState);
    expect(result).not.toHaveProperty("canonicalProjectId");
  });

  it("carries independent request dimensions and rejects mismatched supplied dimensions", () => {
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [
        binding("app_active_project_binding", "wrong-app-project", { appId: "app-b" }),
        binding("conversation_segment_binding", "wrong-user-project", { principalId: "user-b" }),
      ],
    });

    expect(result.dimensions).toEqual(context);
    expect(result.state).toBe("UNRESOLVED");
    expect(result.ignoredEvidenceCount).toBe(2);
    expect(result).not.toHaveProperty("canonicalProjectId");
  });

  it("rejects bindings from a different environment or purpose", () => {
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [
        binding("domain_binding", "production-project", { environment: "production" }),
        binding("domain_binding", "billing-project", { purpose: "billing" }),
      ],
    });

    expect(result.state).toBe("UNRESOLVED");
    expect(result.ignoredEvidenceCount).toBe(2);
    expect(result).not.toHaveProperty("canonicalProjectId");
  });

  it("rejects authoritative canonical project IDs with surrounding whitespace", () => {
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [binding("explicit_user_selection", " project-a ", { principalId: context.principalId })],
    });

    expect(result.state).toBe("UNRESOLVED");
    expect(result.ignoredEvidenceCount).toBe(1);
    expect(result).not.toHaveProperty("canonicalProjectId");
  });

  it("requires tenant and principal context", () => {
    expect(() => resolveCanonicalProjectContext({
      context: { ...context, tenantId: " " },
    })).toThrow("tenantId is required");
    expect(() => resolveCanonicalProjectContext({
      context: { ...context, principalId: "" },
    })).toThrow("principalId is required");
  });

  it("rejects leading or trailing whitespace in required and supplied context dimensions", () => {
    expect(() => resolveCanonicalProjectContext({
      context: { ...context, principalId: " user-a" },
    })).toThrow("principalId is required and must not have surrounding whitespace");
    expect(() => resolveCanonicalProjectContext({
      context: { ...context, appId: "app-a " },
    })).toThrow("appId must be a non-empty string without surrounding whitespace when provided");
  });

  it("never exposes project IDs from foreign-tenant evidence or candidates", () => {
    const foreignProjectId = "must-not-leak-project-from-tenant-b";
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [binding("domain_binding", foreignProjectId, { tenantId: "tenant-b" })],
      recentCandidates: [{ canonicalProjectId: foreignProjectId, tenantId: "tenant-b" }],
      semanticCandidates: [{ canonicalProjectId: "tenant-a-project", tenantId: context.tenantId }],
    });

    expect(result.state).toBe("UNRESOLVED");
    expect(result).not.toHaveProperty("canonicalProjectId");
    expect(JSON.stringify(result)).not.toContain(foreignProjectId);
    expect(result.suggestions).toEqual([
      { canonicalProjectId: "tenant-a-project", source: "semantic" },
    ]);
    expect(result.ignoredEvidenceCount).toBe(1);
  });

  it("keeps conflicting explicit No Project and project bindings ambiguous", () => {
    const result = resolveCanonicalProjectContext({
      context,
      bindings: [
        binding("explicit_no_project", null, { principalId: context.principalId }),
        binding("signed_launch_navigation_context", "project-a"),
      ],
    });

    expect(result.state).toBe("AMBIGUOUS");
    expect(result).not.toHaveProperty("canonicalProjectId");
  });
});
