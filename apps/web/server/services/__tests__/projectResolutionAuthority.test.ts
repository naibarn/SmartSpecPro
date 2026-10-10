import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
  canonicalProjects,
  conversations,
} from "../../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  rows: new Map<unknown, unknown[]>(),
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => {
    const chain: any = {};
    let sourceTable: unknown;
    chain.select = vi.fn(() => chain);
    chain.from = vi.fn((table: unknown) => {
      sourceTable = table;
      return chain;
    });
    chain.leftJoin = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(async () => mocks.rows.get(sourceTable) ?? []);
    return chain;
  }),
}));

import {
  issueProjectResolutionReceipt,
  validateProjectResolutionReceipt,
  type TrustedAppRuntimeContext,
} from "../smartAiHubRuntimeContext";

const activeAppContext: TrustedAppRuntimeContext = {
  version: "spec304-trusted-host-app-context.v1",
  tenantId: "tenant-a",
  hostAppId: "app-a",
  publicAppId: "public-app-a",
  routeProvenance: "verified_custom_domain_alias",
  permissionCeiling: {
    projectMemoryRead: "authorized_bound_project_only",
    durableProjectMemoryWrite: false,
  },
  policyVersion: "spec269-app-project-memory.phase1.v1",
};

const activeAuthorityRows = [
  {
    projectId: "project-a",
    projectTenantId: "tenant-a",
    projectLifecycle: "ACTIVE",
    membershipPrincipalId: "user:7",
    membershipRole: "editor",
    membershipLifecycle: "ACTIVE",
    appTenantId: "tenant-a",
    appLifecycle: "active",
    bindingLifecycle: "ACTIVE",
    userTenantId: "tenant-a",
    userDisabled: false,
    tenantActive: true,
  },
];

function setRows(
  overrides: {
    conversation?: unknown[];
    authority?: unknown[];
  } = {}
) {
  mocks.rows.clear();
  mocks.rows.set(
    conversations,
    overrides.conversation ?? [{ projectId: "project-a" }]
  );
  mocks.rows.set(canonicalProjects, overrides.authority ?? activeAuthorityRows);
}

describe("SPEC-302 invocation-scoped ProjectResolutionReceipt", () => {
  beforeEach(() => {
    setRows();
  });

  it("issues evidence from a server-owned conversation binding and current project ACL", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
      sessionId: "session-22",
      correlationId: "trace-22",
    });

    expect(receipt).toMatchObject({
      tenantId: "tenant-a",
      principalId: "user:7",
      appId: "app-a",
      canonicalProjectId: "project-a",
      conversationId: "22",
      sessionId: "session-22",
      resolutionState: "RESOLVED_CONTEXTUAL",
      provenance: "server_conversation_segment_binding",
      authorizationResult: "ALLOW_READ",
      correlationId: "trace-22",
    });
    expect(receipt.authorizationReference).toContain("trace-22");
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("rechecks membership and denies a receipt after ACL revocation", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    mocks.rows.set(canonicalProjects, [
      { ...activeAuthorityRows[0], membershipLifecycle: "REVOKED" },
    ]);

    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
        conversationId: 22,
        sessionId: null,
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("fails closed for an unknown membership role", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    mocks.rows.set(canonicalProjects, [
      { ...activeAuthorityRows[0], membershipRole: "unknown" },
    ]);
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("rechecks the live conversation binding and denies a Project switch mid-invocation", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    mocks.rows.set(conversations, [{ projectId: "project-b" }]);

    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
        conversationId: 22,
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("denies cross-App reads when the current Project-App binding is missing or revoked", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    mocks.rows.set(canonicalProjects, [
      { ...activeAuthorityRows[0], bindingLifecycle: "REVOKED" },
    ]);

    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("does not treat a client-supplied Project candidate as authority without a trusted App", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: null,
      selectedProjectId: "project-a",
    });
    expect(receipt.resolutionState).toBe("RESOLVED_EXPLICIT");
    expect(receipt.authorizationResult).toBe("DENY");
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: null,
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("fails closed for foreign tenant and inactive App or Project", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    mocks.rows.set(canonicalProjects, [
      {
        ...activeAuthorityRows[0],
        projectTenantId: "tenant-b",
        appLifecycle: "suspended",
      },
    ]);
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("denies a principal after current tenant membership changes", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    mocks.rows.set(canonicalProjects, [
      { ...activeAuthorityRows[0], userTenantId: "tenant-b" },
    ]);
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({ authorized: false, reason: "REVOKED_OR_UNBOUND" });
  });

  it("allows only global/pending context when no server-bound Project exists", async () => {
    setRows({ conversation: [{ projectId: null }] });
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
      selectedProjectId: "project-client-selected",
    });
    expect(receipt).toMatchObject({
      canonicalProjectId: null,
      resolutionState: "NO_PROJECT",
      authorizationResult: "NOT_REQUIRED",
    });
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
        conversationId: 22,
      })
    ).resolves.toEqual({
      authorized: false,
      reason: "REVOKED_OR_UNBOUND",
    });
  });

  it("marks a missing or foreign conversation UNRESOLVED instead of inventing NO_PROJECT", async () => {
    setRows({ conversation: [] });
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 999,
    });
    expect(receipt).toMatchObject({
      canonicalProjectId: null,
      resolutionState: "UNRESOLVED",
      authorizationResult: "NOT_REQUIRED",
      provenance: "conversation_binding_unresolved",
    });
  });

  it("rejects cloned receipts, scope reuse, and all Phase 1 project writes", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    await expect(
      validateProjectResolutionReceipt({
        receipt: { ...receipt },
        operation: "read",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({ authorized: false, reason: "INVALID_RECEIPT" });
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "read",
        tenantId: "tenant-b",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({ authorized: false, reason: "SCOPE_MISMATCH" });
    await expect(
      validateProjectResolutionReceipt({
        receipt,
        operation: "write",
        tenantId: "tenant-a",
        userId: 7,
        appId: "app-a",
      })
    ).resolves.toEqual({
      authorized: false,
      reason: "DURABLE_WRITE_RECEIPT_REQUIRED",
    });
  });

  it("does not mutate the shared canonical App identity records", async () => {
    const receipt = await issueProjectResolutionReceipt({
      tenantId: "tenant-a",
      userId: 7,
      appContext: activeAppContext,
      conversationId: 22,
    });
    expect(receipt.appId).toBe("app-a");
    expect(mocks.rows.get(appIdentities)).toBeUndefined();
    expect(mocks.rows.get(canonicalProjectMemberships)).toBeUndefined();
    expect(mocks.rows.get(canonicalProjectAppBindings)).toBeUndefined();
  });
});
