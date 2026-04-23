import { afterEach, describe, expect, it, vi } from "vitest";

const contextPackServiceMocks = vi.hoisted(() => ({
  getLibraryContextPack: vi.fn(),
  listLibraryContextPacks: vi.fn(),
  resolveLibraryContextPack: vi.fn(),
}));

vi.mock("../services/libraryContextPackService", () => ({
  getLibraryContextPack: contextPackServiceMocks.getLibraryContextPack,
  listLibraryContextPacks: contextPackServiceMocks.listLibraryContextPacks,
  resolveLibraryContextPack: contextPackServiceMocks.resolveLibraryContextPack,
}));

import { executeMcpToolByName, listMcpToolsForSession } from "./mcpRegistry";

const ORIGINAL_CONTEXT_PACKS_DELEGATED_MCP_ENABLED =
  process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED;
const ORIGINAL_LIBRARY_ENABLED = process.env.LIBRARY_ENABLED;
const ORIGINAL_KNOWLEDGE_VAULT_ENABLED = process.env.KNOWLEDGE_VAULT_ENABLED;
const ORIGINAL_MCP_ENABLED = process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED;
const ORIGINAL_RELEASE_GATE_STATUS =
  process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS;

afterEach(() => {
  vi.clearAllMocks();

  if (ORIGINAL_CONTEXT_PACKS_DELEGATED_MCP_ENABLED === undefined) {
    delete process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED;
  } else {
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED =
      ORIGINAL_CONTEXT_PACKS_DELEGATED_MCP_ENABLED;
  }

  if (ORIGINAL_LIBRARY_ENABLED === undefined) {
    delete process.env.LIBRARY_ENABLED;
  } else {
    process.env.LIBRARY_ENABLED = ORIGINAL_LIBRARY_ENABLED;
  }

  if (ORIGINAL_KNOWLEDGE_VAULT_ENABLED === undefined) {
    delete process.env.KNOWLEDGE_VAULT_ENABLED;
  } else {
    process.env.KNOWLEDGE_VAULT_ENABLED = ORIGINAL_KNOWLEDGE_VAULT_ENABLED;
  }

  if (ORIGINAL_MCP_ENABLED === undefined) {
    delete process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED;
  } else {
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = ORIGINAL_MCP_ENABLED;
  }

  if (ORIGINAL_RELEASE_GATE_STATUS === undefined) {
    delete process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS;
  } else {
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS =
      ORIGINAL_RELEASE_GATE_STATUS;
  }
});

function delegatedContext(libraryContextPackIds: number[] = [123]) {
  return {
    session: {
      state: "ready",
      authMode: "delegated_worker",
      tenantId: "tenant-1",
      userId: 1,
      apiKeyId: null,
      scopes: ["library:read"],
      createdAt: new Date("2026-04-21T00:00:00.000Z").toISOString(),
      ownerUserId: 1,
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "session-1",
      runtimeType: "external_worker",
      scopeProfile: "worker_gateway_readonly",
    },
    delegatedManifest: {
      availability: {
        http: "ready",
        mcp: "ready",
        knowledge: "ready",
      },
      allowedMcpNamespaces: ["knowledge"],
      grantSummary: {
        skills: [],
        agencies: [],
        libraryItemIds: [],
        libraryContextPackIds,
        mcpNamespaces: ["knowledge"],
      },
      knowledgeAccess: {
        libraryRead: true,
        librarySearch: false,
        libraryUpload: false,
        ragSearch: false,
        ragIngest: false,
      },
    },
    idempotencyKey: null,
  } as any;
}

describe("MCP context pack Knowledge Vault gates", () => {
  it("exposes context pack tools when delegated MCP rollout is enabled", async () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "ready";
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = "true";

    const { tools, hidden } = await listMcpToolsForSession(delegatedContext());

    expect(tools.map((tool) => tool.name)).toContain(
      "smartspec.knowledge.context_packs.list",
    );
    expect(tools.map((tool) => tool.name)).toContain(
      "smartspec.knowledge.context_packs.resolve",
    );
    expect(hidden).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "smartspec.knowledge.context_packs.list",
        }),
      ]),
    );
  });

  it("hides and blocks context pack tools when delegated MCP rollout is disabled", async () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED = "false";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "ready";
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = "true";

    const { tools, hidden } = await listMcpToolsForSession(delegatedContext());

    expect(tools.map((tool) => tool.name)).not.toContain(
      "smartspec.knowledge.context_packs.list",
    );
    expect(hidden).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "smartspec.knowledge.context_packs.list",
          reason: "resource_grant_unavailable",
        }),
      ]),
    );
    await expect(
      executeMcpToolByName(
        "smartspec.knowledge.context_packs.resolve",
        { context_pack_id: 123 },
        delegatedContext(),
      ),
    ).rejects.toThrow(/current grants/);
  });

  it("lists only granted context packs that are trusted and approved for agents", async () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "ready";
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = "true";

    contextPackServiceMocks.getLibraryContextPack.mockImplementation(
      ({ id }: { id: number }) => Promise.resolve({
        id,
        slug: `pack-${id}`,
        title: `Pack ${id}`,
        description: null,
        status: "active",
        sourceMode: "manual",
        approvedForAgents: id === 123,
        readinessStatus: id === 123 ? "trusted" : "review_pending",
        defaultRuntimeTier: "retrieved_evidence",
        memberCounts: { include: 1, exclude: 0, pin: 0 },
        estimatedTokenHint: 100,
        updatedAt: "2026-04-21T00:00:00.000Z",
        archivedAt: null,
      }),
    );

    const response = await executeMcpToolByName(
      "smartspec.knowledge.context_packs.list",
      {},
      delegatedContext([123, 456]),
    );
    const listed = JSON.parse((response.result as any).content[0].text);

    expect(listed).toEqual([
      expect.objectContaining({
        id: 123,
        approvedForAgents: true,
        readinessStatus: "trusted",
      }),
    ]);
  });

  it("rejects delegated resolve for granted packs that are not trusted and agent-approved", async () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED = "true";
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "ready";
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = "true";

    contextPackServiceMocks.getLibraryContextPack.mockResolvedValue({
      id: 123,
      slug: "draft-pack",
      title: "Draft Pack",
      description: null,
      status: "active",
      sourceMode: "manual",
      approvedForAgents: false,
      readinessStatus: "review_pending",
      defaultRuntimeTier: "retrieved_evidence",
      memberCounts: { include: 1, exclude: 0, pin: 0 },
      estimatedTokenHint: 100,
      updatedAt: "2026-04-21T00:00:00.000Z",
      archivedAt: null,
    });

    await expect(
      executeMcpToolByName(
        "smartspec.knowledge.context_packs.resolve",
        { context_pack_id: 123 },
        delegatedContext([123]),
      ),
    ).rejects.toThrow(/not trusted and approved/i);
    expect(contextPackServiceMocks.resolveLibraryContextPack).not.toHaveBeenCalled();
  });
});
