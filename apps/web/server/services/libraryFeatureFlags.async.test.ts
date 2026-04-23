import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, releaseGateState } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  releaseGateState: {
    rows: [] as Array<{
      actorUserId: number | null;
      approvedByUserId: number | null;
      reason: string;
      scopeType: "tenant" | "global";
      scopeId: string | null;
      createdAt: Date;
      expiresAt: Date;
    }>,
  },
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

import {
  getKnowledgeVaultAccessPolicyAsync,
  isKnowledgeVaultSurfaceEnabledAsync,
} from "./libraryFeatureFlags";

const TRACKED_ENV_KEYS = [
  "LIBRARY_ENABLED",
  "LIBRARY_ENABLED_TENANTS",
  "KNOWLEDGE_VAULT_ENABLED",
  "KNOWLEDGE_VAULT_ENABLED_TENANTS",
  "KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED",
  "KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED",
  "KNOWLEDGE_VAULT_CONTEXT_PACKS_SNAPSHOT_ENABLED",
  "KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED",
  "KNOWLEDGE_VAULT_RELEASE_GATE_STATUS",
  "KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE",
  "KNOWLEDGE_VAULT_RELEASE_GATE_BYPASS_TENANTS",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  TRACKED_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>;

function buildOverrideDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => releaseGateState.rows,
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  releaseGateState.rows = [];
  mockGetDb.mockResolvedValue(buildOverrideDb() as never);
});

afterEach(() => {
  vi.clearAllMocks();
  for (const key of TRACKED_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

describe("libraryFeatureFlags async release-gate policy", () => {
  it("honors a database-backed audited override for the matching tenant", async () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "blocked";

    releaseGateState.rows = [
      {
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled tenant rollout",
        scopeType: "tenant",
        scopeId: "tenant-A",
        createdAt: new Date("2026-04-21T00:00:00.000Z"),
        expiresAt: new Date("2026-04-23T00:00:00.000Z"),
      },
    ];

    const policy = await getKnowledgeVaultAccessPolicyAsync("tenant-A", {
      now: new Date("2026-04-22T00:00:00.000Z"),
    });

    expect(policy.releaseGateStatus).toBe("overridden");
    expect(policy.releaseGateOverride).toEqual(
      expect.objectContaining({
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled tenant rollout",
      }),
    );
    expect(policy.surfaces.contextPacksRuntime).toBe(true);
    await expect(
      isKnowledgeVaultSurfaceEnabledAsync("contextPacksDelegatedMcp", "tenant-A"),
    ).resolves.toBe(true);
  });

  it("fails closed when a database override is scoped to a different tenant", async () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "blocked";

    releaseGateState.rows = [
      {
        actorUserId: 7,
        approvedByUserId: 9,
        reason: "controlled tenant rollout",
        scopeType: "tenant",
        scopeId: "tenant-B",
        createdAt: new Date("2026-04-21T00:00:00.000Z"),
        expiresAt: new Date("2026-04-23T00:00:00.000Z"),
      },
    ];

    const policy = await getKnowledgeVaultAccessPolicyAsync("tenant-A", {
      now: new Date("2026-04-22T00:00:00.000Z"),
    });

    expect(policy.releaseGateStatus).toBe("blocked");
    expect(policy.releaseGateOverride).toBeNull();
    expect(policy.surfaces.contextPacksRuntime).toBe(false);
    await expect(
      isKnowledgeVaultSurfaceEnabledAsync("contextPacksDelegatedMcp", "tenant-A"),
    ).resolves.toBe(false);
  });
});
