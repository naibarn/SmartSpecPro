import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../contextEngineAdapter", () => ({
  buildChatExecutionContextPack: vi.fn(),
  buildTeamExecutionContextPack: vi.fn(),
  summarizeContextPack: vi.fn((pack) => `summary:${pack.surface}`),
}));

vi.mock("../libraryContextPackService", () => ({
  resolveLibraryContextPack: vi.fn(),
}));

vi.mock("../libraryService", () => ({
  getLibraryMarkdownContent: vi.fn(),
}));

import {
  buildChatExecutionContextPack,
  buildTeamExecutionContextPack,
} from "../contextEngineAdapter";
import { resolveLibraryContextPack } from "../libraryContextPackService";
import { getLibraryMarkdownContent } from "../libraryService";
import { build_context_pack, summarizeContextPack } from "../contextPackBuilder";

const mockBuildChatExecutionContextPack = vi.mocked(buildChatExecutionContextPack);
const mockBuildTeamExecutionContextPack = vi.mocked(buildTeamExecutionContextPack);
const mockResolveLibraryContextPack = vi.mocked(resolveLibraryContextPack);
const mockGetLibraryMarkdownContent = vi.mocked(getLibraryMarkdownContent);

const ORIGINAL_LIBRARY_ENABLED = process.env.LIBRARY_ENABLED;
const ORIGINAL_KNOWLEDGE_VAULT_ENABLED = process.env.KNOWLEDGE_VAULT_ENABLED;
const ORIGINAL_CONTEXT_PACKS_RUNTIME_ENABLED =
  process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED;
const ORIGINAL_RELEASE_GATE_STATUS =
  process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS;
const ORIGINAL_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED =
  process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LIBRARY_ENABLED = "true";
  process.env.KNOWLEDGE_VAULT_ENABLED = "true";
  process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED = "true";
  process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS = "ready";
  mockResolveLibraryContextPack.mockResolvedValue({
    pack: {
      id: 1,
      slug: "ops-memory",
      title: "Ops Memory",
      sourceMode: "manual",
      defaultRuntimeTier: "retrieved_evidence",
      approvedForAgents: true,
      readinessStatus: "trusted",
    },
    status: "complete",
    relationExpansionApplied: false,
    totals: {
      candidateCount: 1,
      resolvedCount: 1,
      missingCount: 0,
      excludedCount: 0,
      estimatedTokens: 20,
    },
    items: [
      {
        libraryItemId: 55,
        title: "Runbook",
        logicalPath: "ops/runbook",
        runtimeTier: "retrieved_evidence",
        freshness: "recent",
        includedReason: "Explicitly included",
        citations: [
          {
            sourceRef: "library_item:55",
            excerpt: "excerpt",
          },
        ],
      },
    ],
    diagnostics: [],
  });
  mockGetLibraryMarkdownContent.mockResolvedValue({
    item_id: 55,
    content: "# Runbook\n\nKeep calm.",
    updated_at: new Date("2026-04-21T00:00:00.000Z").toISOString(),
  });
});

afterEach(() => {
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

  if (ORIGINAL_CONTEXT_PACKS_RUNTIME_ENABLED === undefined) {
    delete process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED;
  } else {
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED =
      ORIGINAL_CONTEXT_PACKS_RUNTIME_ENABLED;
  }

  if (ORIGINAL_RELEASE_GATE_STATUS === undefined) {
    delete process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS;
  } else {
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS =
      ORIGINAL_RELEASE_GATE_STATUS;
  }

  if (ORIGINAL_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED === undefined) {
    delete process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED;
  } else {
    process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED =
      ORIGINAL_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED;
  }
});

describe("contextPackBuilder", () => {
  it("routes chat builds through the chat execution pack helper", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);
    const pack = await build_context_pack({
      surface: "chat",
      request: {
        channel: "chat",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "hello",
      },
      skillSystemPrompt: "You are helpful.",
    });

    expect(mockBuildChatExecutionContextPack).toHaveBeenCalledOnce();
    expect(pack.surface).toBe("chat");
    expect(summarizeContextPack(pack)).toBe("summary:chat");
  });

  it("routes team builds through the team execution pack helper", async () => {
    mockBuildTeamExecutionContextPack.mockResolvedValue({ surface: "team_room" } as never);
    const pack = await build_context_pack({
      surface: "team_room",
      tenantId: "tenant-1",
      request: {
        channel: "team_room",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "hello",
        teamContext: {
          assistantId: "assistant-1",
          roomId: "room-1",
          teamId: "team-1",
          objective: "hello",
        },
      },
      skillSystemPrompt: "You are a team orchestrator.",
    });

    expect(mockBuildTeamExecutionContextPack).toHaveBeenCalledOnce();
    expect(pack.surface).toBe("team_room");
  });

  it("injects resolved library context packs into retrieved evidence state", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);

    await build_context_pack({
      surface: "chat",
      request: {
        channel: "chat",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "summarize",
      },
      libraryContextPacks: [
        {
          ref: { slug: "ops-memory" },
        },
      ],
    });

    expect(mockResolveLibraryContextPack).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { slug: "ops-memory" },
        failIfPartial: true,
      }),
      expect.objectContaining({
        userId: 1,
        tenantId: "tenant-1",
      }),
    );
    expect(mockBuildChatExecutionContextPack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dynamicParams: expect.objectContaining({
          contextState: expect.objectContaining({
            retrievedEvidence: expect.arrayContaining([
              expect.objectContaining({
                title: "Ops Memory · Runbook",
                source: "library_context_pack.ops-memory",
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("rejects runtime requests with more than five explicit library context packs", async () => {
    await expect(
      build_context_pack({
        surface: "chat",
        request: {
          channel: "chat",
          userId: 1,
          tenantId: "tenant-1",
          userMessage: "summarize",
        },
        libraryContextPacks: Array.from({ length: 6 }, (_, index) => ({
          ref: { id: index + 1 },
        })),
      }),
    ).rejects.toThrow(/up to 5 library context packs/);

    expect(mockResolveLibraryContextPack).not.toHaveBeenCalled();
  });

  it("blocks library context pack runtime injection when the rollout surface is disabled", async () => {
    process.env.KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED = "false";

    await expect(
      build_context_pack({
        surface: "chat",
        request: {
          channel: "chat",
          userId: 1,
          tenantId: "tenant-1",
          userMessage: "summarize",
        },
        libraryContextPacks: [
          {
            ref: { slug: "ops-memory" },
          },
        ],
      }),
    ).rejects.toThrow(/contextPacksRuntime/);

    expect(mockResolveLibraryContextPack).not.toHaveBeenCalled();
    expect(mockGetLibraryMarkdownContent).not.toHaveBeenCalled();
    expect(mockBuildChatExecutionContextPack).not.toHaveBeenCalled();
  });

  it("deduplicates resolved library context packs by canonical pack id", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);

    await build_context_pack({
      surface: "chat",
      request: {
        channel: "chat",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "summarize",
      },
      libraryContextPacks: [
        { ref: { slug: "ops-memory" } },
        { ref: { id: 1 } },
      ],
    });

    expect(mockResolveLibraryContextPack).toHaveBeenCalledTimes(2);
    expect(mockGetLibraryMarkdownContent).toHaveBeenCalledTimes(1);
    expect(mockBuildChatExecutionContextPack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dynamicParams: expect.objectContaining({
          contextState: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                title: "Library context pack diagnostics",
                content: expect.stringContaining("Duplicate library context pack ops-memory"),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("records optional library context pack failures as diagnostics", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);
    mockResolveLibraryContextPack.mockRejectedValueOnce(new Error("not ready"));

    await build_context_pack({
      surface: "chat",
      request: {
        channel: "chat",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "summarize",
      },
      libraryContextPacks: [
        {
          ref: { slug: "ops-memory" },
          required: false,
        },
      ],
    });

    expect(mockBuildChatExecutionContextPack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dynamicParams: expect.objectContaining({
          contextState: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                title: "Library context pack diagnostics",
                content: expect.stringContaining("Optional library context pack was skipped: not ready"),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("rejects required library context packs that are not approved for agent runtime", async () => {
    mockResolveLibraryContextPack.mockResolvedValueOnce({
      pack: {
        id: 1,
        slug: "ops-memory",
        title: "Ops Memory",
        sourceMode: "manual",
        defaultRuntimeTier: "retrieved_evidence",
        approvedForAgents: false,
        readinessStatus: "trusted",
      },
      status: "complete",
      relationExpansionApplied: false,
      totals: {
        candidateCount: 1,
        resolvedCount: 1,
        missingCount: 0,
        excludedCount: 0,
        estimatedTokens: 20,
      },
      items: [],
      diagnostics: [],
    });

    await expect(
      build_context_pack({
        surface: "chat",
        request: {
          channel: "chat",
          userId: 1,
          tenantId: "tenant-1",
          userMessage: "summarize",
        },
        libraryContextPacks: [
          {
            ref: { slug: "ops-memory" },
          },
        ],
      }),
    ).rejects.toThrow(/not approved for agents/);
  });

  it("skips optional library context packs that are not trusted or approved", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);
    mockResolveLibraryContextPack.mockResolvedValueOnce({
      pack: {
        id: 1,
        slug: "ops-memory",
        title: "Ops Memory",
        sourceMode: "manual",
        defaultRuntimeTier: "retrieved_evidence",
        approvedForAgents: false,
        readinessStatus: "review_pending",
      },
      status: "complete",
      relationExpansionApplied: false,
      totals: {
        candidateCount: 1,
        resolvedCount: 1,
        missingCount: 0,
        excludedCount: 0,
        estimatedTokens: 20,
      },
      items: [],
      diagnostics: [],
    });

    await build_context_pack({
      surface: "chat",
      request: {
        channel: "chat",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "summarize",
      },
      libraryContextPacks: [
        {
          ref: { slug: "ops-memory" },
          required: false,
        },
      ],
    });

    expect(mockBuildChatExecutionContextPack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dynamicParams: expect.objectContaining({
          contextState: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                content: expect.stringContaining("Optional library context pack was skipped: not trusted (review_pending)"),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("requires explicit private-vault runtime unlock intent before enabling private vault access", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);
    process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED = "true";

    await expect(
      build_context_pack({
        surface: "chat",
        request: {
          channel: "chat",
          userId: 1,
          tenantId: "tenant-1",
          userMessage: "summarize",
          dynamicParams: {
            privateVaultRuntimeUnlock: true,
          },
        },
        dynamicParams: {
          privateVaultRuntimeUnlock: true,
        },
        libraryContextPacks: [
          {
            ref: { slug: "ops-memory" },
            allowPrivateVaultRuntimeUnlock: true,
          },
        ],
      }),
    ).rejects.toThrow(/explicit caller intent and authorization/i);
  });

  it("allows private-vault runtime unlock only when the feature flag and explicit authorization are both present", async () => {
    mockBuildChatExecutionContextPack.mockResolvedValue({ surface: "chat" } as never);
    process.env.KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED = "true";

    await build_context_pack({
      surface: "chat",
      request: {
        channel: "chat",
        userId: 1,
        tenantId: "tenant-1",
        userMessage: "summarize",
        dynamicParams: {
          privateVaultRuntimeUnlock: true,
          privateVaultAccessGranted: true,
        },
      },
      dynamicParams: {
        privateVaultRuntimeUnlock: true,
        privateVaultAccessGranted: true,
      },
      libraryContextPacks: [
        {
          ref: { slug: "ops-memory" },
          allowPrivateVaultRuntimeUnlock: true,
        },
      ],
    });

    expect(mockResolveLibraryContextPack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        privateVaultUnlocked: true,
      }),
    );
  });
});
