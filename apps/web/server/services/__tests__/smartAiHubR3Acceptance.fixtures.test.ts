import { describe, expect, it } from "vitest";

import {
  activateAppRouteAlias,
  buildAppIdentity,
  buildAppRouteAlias,
  resolveAppRouteAlias,
  type AppIdentity,
  type AppRouteAlias,
} from "../tenantProductIdentityContracts";

const tenantId = "tenant-r3";
const app = buildAppIdentity({
  appId: "app_notes_internal",
  publicAppId: "app_notes_public",
  tenantId,
  publisherId: "user_publisher",
  canonicalProductId: "product_notes",
  policyRefs: ["policy_memory_default"],
  createdAt: "2026-10-10T00:00:00.000Z",
  lifecycle: "active",
});

function activeCustomDomain(aliasId: string, hostname: string): AppRouteAlias {
  const pending = buildAppRouteAlias({
    aliasId,
    tenantId,
    appId: app.appId,
    appTenantId: app.tenantId,
    kind: "custom-domain",
    value: hostname,
  });
  return activateAppRouteAlias({ ...pending, status: "CERTIFICATE_PENDING" });
}

/**
 * Deterministic inputs for the runtime acceptance cases in the R3 continuation.
 * These fixtures deliberately do not simulate authorization or memory behavior;
 * each pending case needs the real SPEC-269 runtime contract before it can pass.
 */
export const r3MemoryAcceptanceFixtures = {
  T01: {
    principalId: "user_alice",
    tenantId,
    projectId: "project_shared_notes",
    appIds: ["app_notes_internal", "app_tasks_internal"],
    privateMemory: { id: "memory_alice_private", ownerId: "user_alice", text: "alice-only-marker" },
    otherPrivateMemory: { id: "memory_bob_private", ownerId: "user_bob", text: "bob-only-marker" },
  },
  T02: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    projectIds: ["project_alpha", "project_beta"],
    records: [
      { id: "memory_alpha", projectId: "project_alpha", text: "alpha-marker" },
      { id: "memory_beta", projectId: "project_beta", text: "beta-marker" },
    ],
  },
  T03: {
    tenantId,
    appId: "app_notes_internal",
    projectId: "project_shared_notes",
    authorizedPrincipal: "user_alice",
    revokedPrincipal: "user_bob",
    privateRecords: [
      { id: "memory_alice_private", ownerId: "user_alice", text: "alice-only-marker" },
      { id: "memory_bob_private", ownerId: "user_bob", text: "bob-only-marker" },
    ],
  },
  T04: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    conversationId: "conversation_switch_project",
    segments: [
      { ordinal: 1, projectId: "project_alpha", userText: "alpha-turn", expectedWriteProjectId: "project_alpha" },
      { ordinal: 2, projectId: "project_beta", userText: "beta-turn", expectedWriteProjectId: "project_beta" },
    ],
  },
  T05: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    conversationId: "conversation_no_project",
    projectId: null,
    expectedDurableProjectWrite: false,
    permittedFallbackScopes: ["session", "personal"],
  },
  T06: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    conversationId: "conversation_ambiguous_project",
    candidates: [
      { projectId: "project_alpha", score: 0.901 },
      { projectId: "project_beta", score: 0.899 },
    ],
    expectedProjectDestination: null,
  },
  T07: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    conversationId: "conversation_picker_selection",
    selectedProjectId: "project_alpha",
    requiredReceiptFields: [
      "tenantId", "principalId", "canonicalProjectId", "appId", "sessionId",
      "resolutionState", "policyVersion", "provenance", "correlationId",
    ],
  },
  T08: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    conversationId: "conversation_pending_promotion",
    pendingMemoryId: "pending_memory_001",
    confirmedProjectId: "project_alpha",
    idempotencyKey: "promote:pending_memory_001:project_alpha:v1",
    expectedProvenanceId: "pending_memory_001",
  },
  T09: {
    principalId: "user_alice",
    tenantId,
    conversationId: "conversation_multi_app",
    appContexts: [
      { appId: "app_notes_internal", permissionCeiling: ["memory:read"] },
      { appId: "app_tasks_internal", permissionCeiling: ["memory:read"] },
    ],
    expectedSharedChatAppImpersonation: false,
  },
  T18: {
    principalId: "user_alice",
    tenantId,
    appId: "app_notes_internal",
    projectId: "project_revocation_mid_session",
    conversationId: "conversation_acl_revocation",
    membershipBefore: "ACTIVE",
    membershipAfter: "REVOKED",
    protectedOperationAfterRevocation: "DENY",
  },
} as const;

describe("SmartAIHub R3 direct acceptance", () => {
  it("T-15: custom-domain changes preserve stable canonical and public App identity", () => {
    const first = activeCustomDomain("alias_notes_old", "notes-old.example.com");
    const replacement = activeCustomDomain("alias_notes_new", "notes-new.example.com");
    const stableIdentity = {
      appId: app.appId,
      publicAppId: app.publicAppId,
      tenantId: app.tenantId,
    };

    expect(resolveAppRouteAlias({ alias: first, app, tenantId })).toEqual(stableIdentity);
    expect(resolveAppRouteAlias({ alias: replacement, app, tenantId })).toEqual(stableIdentity);
    expect(first.value).not.toBe(replacement.value);
    expect(app).toMatchObject({
      appId: "app_notes_internal",
      publicAppId: "app_notes_public",
      canonicalProductId: "product_notes",
    });
  });

  it("T-15: unverified, invalid, and cross-tenant custom-domain aliases fail closed", () => {
    const unverified = buildAppRouteAlias({
      aliasId: "alias_notes_unverified",
      tenantId,
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "custom-domain",
      value: "unverified.example.com",
    });
    expect(resolveAppRouteAlias({ alias: unverified, app, tenantId })).toBeNull();
    expect(() => activateAppRouteAlias(unverified)).toThrowError(
      expect.objectContaining({ code: "APP_ROUTE_ALIAS_NOT_VERIFIED" }),
    );
    expect(() => buildAppRouteAlias({
      aliasId: "alias_notes_invalid",
      tenantId,
      appId: app.appId,
      appTenantId: app.tenantId,
      kind: "custom-domain",
      value: "not a hostname",
    })).toThrowError(expect.objectContaining({ code: "APP_ROUTE_ALIAS_INVALID" }));

    const valid = activeCustomDomain("alias_notes_cross_tenant", "notes.example.com");
    expect(resolveAppRouteAlias({ alias: valid, app, tenantId: "tenant-other" })).toBeNull();
  });
});

describe("SmartAIHub R3 runtime memory scenarios pending SPEC-269 bindings", () => {
  it.todo("T-01: one principal using two Apps cannot leak private memory across App views");
  it.todo("T-02: one App retrieves and writes only within the selected canonical Project");
  it.todo("T-03: shared Project access follows current membership while private memory stays private");
  it.todo("T-04: conversation Project switches preserve per-turn attribution and destination binding");
  it.todo("T-05: NO_PROJECT never selects a durable Project destination implicitly");
  it.todo("T-06: ambiguous candidate scores do not select a durable Project destination");
  it.todo("T-07: explicit picker selection emits a server-issued authorization-bound receipt");
  it.todo("T-08: pending promotion is idempotent and preserves source provenance and ACL checks");
  it.todo("T-09: embedded Shared Chat cannot impersonate another App or widen its permission ceiling");
  it.todo("T-18: revocation during a session denies the next protected memory read and write");
});

// Keep the fixture's runtime types explicit for the next acceptance implementation.
export type R3FixtureApp = AppIdentity;
