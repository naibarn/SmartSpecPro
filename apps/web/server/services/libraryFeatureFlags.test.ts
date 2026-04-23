import { afterEach, describe, expect, it } from "vitest";

import {
  assertKnowledgeVaultSurfaceEnabled,
  getKnowledgeVaultAccessPolicy,
  getKnowledgeVaultSurfaceDecision,
  isKnowledgeVaultSurfaceEnabled,
  isLibraryEnabledForTenant,
} from "./libraryFeatureFlags";

const TRACKED_ENV_KEYS = [
  "NODE_ENV",
  "LIBRARY_ENABLED",
  "LIBRARY_ENABLED_TENANTS",
  "KNOWLEDGE_VAULT_ENABLED",
  "KNOWLEDGE_VAULT_ENABLED_TENANTS",
  "KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED",
  "KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED",
  "KNOWLEDGE_VAULT_CONTEXT_PACKS_SNAPSHOT_ENABLED",
  "KNOWLEDGE_VAULT_DEV_UNLOCK_PROTECTED_SURFACES",
  "KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED",
  "KNOWLEDGE_VAULT_RELEASE_GATE_STATUS",
  "KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE",
  "KNOWLEDGE_VAULT_RELEASE_GATE_BYPASS_TENANTS",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  TRACKED_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of TRACKED_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

describe("isLibraryEnabledForTenant", () => {
  it("uses default enabled behavior when no allowlist is configured", () => {
    delete process.env.LIBRARY_ENABLED;
    delete process.env.LIBRARY_ENABLED_TENANTS;
    expect(isLibraryEnabledForTenant(null)).toBe(true);
    expect(isLibraryEnabledForTenant(undefined)).toBe(true);
    expect(isLibraryEnabledForTenant("tenant-A")).toBe(true);
  });

  it("returns false for all tenants when LIBRARY_ENABLED is false", () => {
    process.env.LIBRARY_ENABLED = "false";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-A,tenant-B";
    expect(isLibraryEnabledForTenant("tenant-A")).toBe(false);
    expect(isLibraryEnabledForTenant("tenant-B")).toBe(false);
    expect(isLibraryEnabledForTenant(null)).toBe(false);
  });

  it("denies missing tenant context when allowlist is configured", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-A,tenant-B";

    expect(isLibraryEnabledForTenant(null)).toBe(false);
    expect(isLibraryEnabledForTenant(undefined)).toBe(false);
    expect(isLibraryEnabledForTenant("")).toBe(false);
    expect(isLibraryEnabledForTenant("   ")).toBe(false);
  });

  it("allows only explicit allowlisted tenant ids", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-A, tenant-B , 44";

    expect(isLibraryEnabledForTenant("tenant-A")).toBe(true);
    expect(isLibraryEnabledForTenant("tenant-B")).toBe(true);
    expect(isLibraryEnabledForTenant(44)).toBe(true);

    expect(isLibraryEnabledForTenant("tenant-C")).toBe(false);
    expect(isLibraryEnabledForTenant(45)).toBe(false);
  });
});

describe("Knowledge Vault access policy", () => {
  it("inherits the Library tenant gate and exposes enabled production surfaces by default", () => {
    delete process.env.LIBRARY_ENABLED;
    delete process.env.LIBRARY_ENABLED_TENANTS;
    delete process.env.KNOWLEDGE_VAULT_ENABLED;
    delete process.env.KNOWLEDGE_VAULT_ENABLED_TENANTS;

    const policy = getKnowledgeVaultAccessPolicy("tenant-A");

    expect(policy.enabled).toBe(true);
    expect(policy.tenantScoped).toBe(false);
    expect(policy.broadRollout).toBe(true);
    expect(policy.releaseGateStatus).toBe("unknown");
    expect(policy.surfaces.quickSwitcher).toBe(true);
    expect(policy.surfaces.inspector).toBe(true);
    expect(policy.surfaces.contextPacks).toBe(true);
    expect(policy.surfaces.contextPacksRuntime).toBe(false);
    expect(policy.surfaces.contextPacksDelegatedMcp).toBe(false);
    expect(policy.surfaces.privateVaultRuntimeUnlock).toBe(false);
  });

  it("blocks every Knowledge Vault surface when Library is disabled", () => {
    process.env.LIBRARY_ENABLED = "false";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";

    const policy = getKnowledgeVaultAccessPolicy("tenant-A");

    expect(policy.enabled).toBe(false);
    expect(Object.values(policy.surfaces).every((enabled) => enabled === false)).toBe(true);
  });

  it("blocks protected tenant-scoped surfaces until the release gate passes", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED_TENANTS = "tenant-A, 44";

    expect(isKnowledgeVaultSurfaceEnabled("contextPacks", "tenant-A")).toBe(true);
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksRuntime", "tenant-A")).toBe(false);

    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "pass";
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksRuntime", "tenant-A")).toBe(true);
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksRuntime", 44)).toBe(true);

    expect(isKnowledgeVaultSurfaceEnabled("contextPacksRuntime", "tenant-B")).toBe(false);
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksRuntime", null)).toBe(false);
  });

  it("can disable agent runtime and delegated MCP surfaces independently", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED = "false";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED = "false";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "pass";

    expect(isKnowledgeVaultSurfaceEnabled("contextPacks", "tenant-A")).toBe(true);
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksRuntime", "tenant-A")).toBe(false);
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksDelegatedMcp", "tenant-A")).toBe(false);
    expect(() =>
      assertKnowledgeVaultSurfaceEnabled("contextPacksRuntime", "tenant-A"),
    ).toThrow(/contextPacksRuntime/);
  });

  it("requires an explicit unlock before private vault content can be exposed to runtime", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "pass";
    delete process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED;

    expect(
      isKnowledgeVaultSurfaceEnabled("privateVaultRuntimeUnlock", "tenant-A"),
    ).toBe(false);

    process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED = "true";
    expect(
      isKnowledgeVaultSurfaceEnabled("privateVaultRuntimeUnlock", "tenant-A"),
    ).toBe(true);
  });

  it("blocks graph and runtime surfaces from broad rollout until the release gate is ready", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    delete process.env.KNOWLEDGE_VAULT_ENABLED_TENANTS;
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "blocked";

    const policy = getKnowledgeVaultAccessPolicy("tenant-A");

    expect(policy.surfaces.quickSwitcher).toBe(true);
    expect(policy.surfaces.savedViews).toBe(true);
    expect(policy.surfaces.graph).toBe(false);
    expect(policy.surfaces.contextPacksRuntime).toBe(false);
    expect(getKnowledgeVaultSurfaceDecision("graph", "tenant-A").reasons).toContain(
      "release_gate_not_ready",
    );
  });

  it("allows canary tenants to bypass the release gate with an explicit bypass allowlist", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "blocked";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_BYPASS_TENANTS = "tenant-canary";

    const policy = getKnowledgeVaultAccessPolicy("tenant-canary");

    expect(policy.releaseGateBypassed).toBe(true);
    expect(policy.surfaces.graph).toBe(true);
    expect(policy.surfaces.contextPacksRuntime).toBe(true);
  });

  it("unlocks protected surfaces automatically in development local mode", () => {
    process.env.NODE_ENV = "development";
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    delete process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS;
    delete process.env.KNOWLEDGE_VAULT_RELEASE_GATE_BYPASS_TENANTS;
    delete process.env.KNOWLEDGE_VAULT_ENABLED_TENANTS;
    delete process.env.KNOWLEDGE_VAULT_DEV_UNLOCK_PROTECTED_SURFACES;

    const policy = getKnowledgeVaultAccessPolicy("tenant-A");

    expect(policy.releaseGateStatus).toBe("pass");
    expect(policy.surfaces.graph).toBe(true);
    expect(policy.surfaces.canvas).toBe(true);
    expect(policy.surfaces.contextPacksRuntime).toBe(true);
  });

  it("does not allow bare overridden release-gate status without audited metadata", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "overridden";
    delete process.env.KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE;

    const policy = getKnowledgeVaultAccessPolicy("tenant-A");

    expect(policy.releaseGateStatus).toBe("unknown");
    expect(policy.releaseGateOverride).toBeNull();
    expect(policy.surfaces.contextPacksRuntime).toBe(false);
    expect(policy.surfaces.contextPacksDelegatedMcp).toBe(false);
  });

  it("allows protected surfaces with a scoped time-bounded audited override", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "blocked";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE = JSON.stringify({
      actorUserId: 7,
      approvedByUserId: 9,
      reason: "controlled production canary",
      scopeType: "tenant",
      scopeId: "tenant-A",
      createdAt: "2026-04-21T00:00:00.000Z",
      expiresAt: "2026-04-23T00:00:00.000Z",
    });

    const policy = getKnowledgeVaultAccessPolicy("tenant-A", {
      now: new Date("2026-04-22T00:00:00.000Z"),
    });

    expect(policy.releaseGateStatus).toBe("overridden");
    expect(policy.releaseGateOverride).toEqual(
      expect.objectContaining({
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled production canary",
      }),
    );
    expect(policy.surfaces.contextPacksRuntime).toBe(true);
    expect(policy.surfaces.contextPacksDelegatedMcp).toBe(true);
  });

  it("fails closed when an audited override is expired or scoped elsewhere", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "blocked";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE = JSON.stringify({
      actorUserId: 7,
      approvedByUserId: 9,
      reason: "controlled production canary",
      scopeType: "tenant",
      scopeId: "tenant-B",
      createdAt: "2026-04-21T00:00:00.000Z",
      expiresAt: "2026-04-23T00:00:00.000Z",
    });

    expect(
      getKnowledgeVaultAccessPolicy("tenant-A", {
        now: new Date("2026-04-22T00:00:00.000Z"),
      }).surfaces.contextPacksRuntime,
    ).toBe(false);

    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE = JSON.stringify({
      actorUserId: 7,
      approvedByUserId: 9,
      reason: "controlled production canary",
      scopeType: "tenant",
      scopeId: "tenant-A",
      createdAt: "2026-04-21T00:00:00.000Z",
      expiresAt: "2026-04-22T00:00:00.000Z",
    });

    expect(
      getKnowledgeVaultAccessPolicy("tenant-A", {
        now: new Date("2026-04-22T00:00:00.000Z"),
      }).surfaces.contextPacksRuntime,
    ).toBe(false);
  });

  it("gates snapshot publication independently from base context-pack availability", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "pass";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_SNAPSHOT_ENABLED = "false";

    expect(isKnowledgeVaultSurfaceEnabled("contextPacks", "tenant-A")).toBe(true);
    expect(isKnowledgeVaultSurfaceEnabled("contextPacksSnapshot", "tenant-A")).toBe(false);
  });
});
