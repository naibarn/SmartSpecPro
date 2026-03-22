import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../visualStateService", () => ({
  getOrCreateState: vi.fn(),
}));
vi.mock("../multimodalRetrievalService", () => ({
  hasImageReferenceKeywords: vi.fn(() => false),
  resolveVisualReferences: vi.fn(() => Promise.resolve([])),
  retrieveRelevantAssets: vi.fn(() => Promise.resolve([])),
  buildImageContext: vi.fn(() =>
    Promise.resolve({ imageAssets: [], visualMemoryContext: null, memoryCards: null }),
  ),
}));
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(),
  isRedisAvailable: vi.fn(() => false),
}));
vi.mock("../personaService", () => ({
  resolvePersona: vi.fn(() => null),
  buildPersonaPromptSegments: vi.fn(() => ({
    prefix: "[PERSONA START]\nPersona prefix\n[PERSONA END]",
    styleInstructions: null,
    restrictionsBulletPoints: null,
  })),
  listPersonas: vi.fn(() => Promise.resolve([])),
  matchPersonaByNickname: vi.fn(() => null),
}));
vi.mock("../piiFilter", () => ({
  sanitizeEntityForStorage: vi.fn((entity: any) => entity),
  filterEntityFacts: vi.fn((facts: string[]) => ({
    filteredFacts: facts,
    removedCount: 0,
    redactedCount: 0,
  })),
}));
vi.mock("../relevanceScorer", () => ({
  rankMemories: vi.fn((_, memories: any[]) => memories.map((memory: any) => ({ memory, score: 1 }))),
}));
vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(),
}));
vi.mock("../modelLookup", () => ({
  buildModelProviderMapLookupCondition: vi.fn(() => ({})),
}));
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(() => Promise.resolve({ multimodalMemory: true })),
}));

import { getDb } from "../../db";
import { getOrCreateState } from "../visualStateService";
import * as personaService from "../personaService";
import { buildChatContext, upsertEntityMemory } from "../memoryService";

const mockGetDb = vi.mocked(getDb);
const mockGetOrCreateState = vi.mocked(getOrCreateState);
const mockResolvePersona = vi.mocked(personaService.resolvePersona);
const mockBuildPersonaPromptSegments = vi.mocked(personaService.buildPersonaPromptSegments);
const mockListPersonas = vi.mocked(personaService.listPersonas);
const mockMatchPersonaByNickname = vi.mocked(personaService.matchPersonaByNickname);

const EMPTY_STATE = {
  conversationId: 1,
  recentAssetIds: [],
  activeAssetIds: [],
  comparedAssetIds: [],
  namedSets: {},
  updatedAt: null,
};

function makeDb(limitResults: unknown[] = []) {
  let limitCall = 0;
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(limitResults[limitCall++] ?? [])),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    delete: vi.fn().mockReturnThis(),
  };

  for (const method of [
    "select",
    "from",
    "where",
    "leftJoin",
    "innerJoin",
    "orderBy",
    "insert",
    "values",
    "update",
    "set",
    "delete",
  ]) {
    (db[method] as any).mockReturnValue(db);
  }

  return db;
}

describe("memoryService persona routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE);
    mockResolvePersona.mockResolvedValue(null);
    mockBuildPersonaPromptSegments.mockReturnValue({
      prefix: "[PERSONA START]\nPersona prefix\n[PERSONA END]",
      styleInstructions: null,
      restrictionsBulletPoints: null,
    });
    mockListPersonas.mockResolvedValue([]);
    mockMatchPersonaByNickname.mockReturnValue(null);
  });

  it("passes user and tenant defaults into persona resolution", async () => {
    const db = makeDb([
      [{ personaId: null, tenantId: "tenant-1" }],
      [{ defaultPersonaId: "user-default" }],
      [{ defaultPersonaId: "tenant-default" }],
      [],
    ]);
    mockGetDb.mockResolvedValue(db);

    await buildChatContext(101, 7, "Base system prompt", {
      currentUserMessage: "hello",
      tenantId: "tenant-1",
      memoryMode: "off",
    });

    expect(mockResolvePersona).toHaveBeenCalledWith(
      { personaId: null, tenantId: "tenant-1" },
      { id: 7, defaultPersonaId: "user-default" },
      { id: "tenant-1", defaultPersonaId: "tenant-default" },
    );
  });

  it("switches the conversation persona when a nickname is mentioned", async () => {
    const db = makeDb([
      [{ personaId: null, tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      [],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockListPersonas.mockResolvedValue([
      { id: "persona-2", assistantNickname: "น้องเจน" } as any,
    ]);
    mockMatchPersonaByNickname.mockReturnValue({
      id: "persona-2",
      assistantNickname: "น้องเจน",
    } as any);

    await buildChatContext(202, 7, "Base system prompt", {
      currentUserMessage: "น้องเจนช่วยตอบในโทนครีเอทีฟหน่อย",
      tenantId: "tenant-1",
      memoryMode: "off",
    });

    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        personaId: "persona-2",
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockResolvePersona).toHaveBeenCalledWith(
      { personaId: "persona-2", tenantId: "tenant-1" },
      { id: 7, defaultPersonaId: null },
      { id: "tenant-1", defaultPersonaId: null },
    );
  });

  it("stores personaId on long-term memories when the active persona is known", async () => {
    const db = makeDb([
      [],
    ]);
    db.returning.mockResolvedValueOnce([
      {
        id: 1,
        userId: 7,
        personaId: "persona-2",
        entityType: "rule",
        entityName: "editorial-policy",
        facts: ["Always verify headlines before posting"],
      },
    ]);
    mockGetDb.mockResolvedValue(db);

    await upsertEntityMemory(
      7,
      "rule",
      "editorial-policy",
      ["Always verify headlines before posting"],
      undefined,
      9,
      "manual",
      null,
      "persona-2",
    );

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        personaId: "persona-2",
        entityType: "rule",
        entityName: "editorial-policy",
      }),
    );
  });

  it("adds artifact and draft details for the active persona work items", async () => {
    const artifactId = "11111111-1111-1111-1111-111111111111";
    const db = makeDb([
      [{ personaId: "persona-2", tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      [{ id: "assistant-1", displayName: "Creative Writer" }],
      [{
        id: "work-1",
        teamId: "team-1",
        title: "Daily news post",
        objective: "Prepare the next Thai news post",
        roomId: "room-1",
        status: "awaiting_approval",
        threadRootMessageId: "msg-root",
        activeDraftArtifactId: artifactId,
        artifactRefsJson: [{ artifactId, label: "Draft article" }],
        assignedMemberId: "assistant-1",
        reviewerMemberId: null,
        approverMemberId: "assistant-1",
        updatedAt: new Date(),
      }],
      [{
        id: "msg-root",
        roomId: "room-1",
        summaryContent: "Draft article is ready for approval",
        content: "Prepared the latest draft article and queued the next news summary.",
        artifactRefsJson: [{ artifactId, label: "Draft article" }],
        metadataJson: { workItemId: "work-1", threadRootMessageId: "msg-root" },
        createdAt: new Date(),
      }],
      [{
        id: artifactId,
        artifactType: "document",
        intent: "text_content",
        summary: "Morning Brief draft prepared",
        payloadJson: {
          title: "Morning Brief",
          content: "Headline 1: Market opens higher. Headline 2: New policy update ready for publishing.",
        },
      }],
      [],
      [],
      [],
      [],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockResolvePersona.mockResolvedValue({
      id: "persona-2",
      name: "Creative Writer",
    } as any);

    const context = await buildChatContext(303, 7, "Base system prompt", {
      currentUserMessage: "ขอดู draft งานที่เตรียมไว้ของคนนี้หน่อย",
      tenantId: "tenant-1",
      memoryMode: "off",
    });

    expect(context.systemPrompt).toContain("Active work items for this persona:");
    expect(context.systemPrompt).toContain("Artifact details:");
    expect(context.systemPrompt).toContain("Morning Brief [preview:text_content]");
    expect(context.systemPrompt).toContain("Headline 1: Market opens higher.");
    expect(context.systemPrompt).toContain("Approve or reject this item in Team Room.");
    expect(context.systemPrompt).toContain("[Review approval in Team Room](/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root)");
    expect(context.systemPrompt).toContain("[Open Workflow Board](/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root&panel=workflow)");
    expect(context.systemPrompt).toContain("/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root");
  });

  it("adds action-first response guidance for approval-style questions", async () => {
    const artifactId = "11111111-1111-1111-1111-111111111111";
    const db = makeDb([
      [{ personaId: "persona-2", tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      [{ id: "assistant-1", displayName: "Creative Writer" }],
      [{
        id: "work-1",
        teamId: "team-1",
        title: "Daily news post",
        objective: "Prepare the next Thai news post",
        roomId: "room-1",
        status: "awaiting_approval",
        threadRootMessageId: "msg-root",
        activeDraftArtifactId: artifactId,
        artifactRefsJson: [{ artifactId, label: "Draft article" }],
        assignedMemberId: "assistant-1",
        reviewerMemberId: null,
        approverMemberId: "assistant-1",
        updatedAt: new Date(),
      }],
      [{
        id: "msg-root",
        roomId: "room-1",
        summaryContent: "Draft article is ready for approval",
        content: "Prepared the latest draft article and queued the next news summary.",
        artifactRefsJson: [{ artifactId, label: "Draft article" }],
        metadataJson: { workItemId: "work-1", threadRootMessageId: "msg-root" },
        createdAt: new Date(),
      }],
      [{
        id: artifactId,
        artifactType: "document",
        intent: "text_content",
        summary: "Morning Brief draft prepared",
        payloadJson: {
          title: "Morning Brief",
          content: "Headline 1: Market opens higher. Headline 2: New policy update ready for publishing.",
        },
      }],
      [],
      [],
      [],
      [],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockResolvePersona.mockResolvedValue({
      id: "persona-2",
      name: "Creative Writer",
    } as any);

    const context = await buildChatContext(404, 7, "Base system prompt", {
      currentUserMessage: "งานนี้อนุมัติได้หรือยัง",
      tenantId: "tenant-1",
      memoryMode: "off",
    });

    expect(context.systemPrompt).toContain("Response directive for this turn:");
    expect(context.systemPrompt).toContain("Keep the answer short and action-first.");
    expect(context.systemPrompt).toContain("Say clearly whether the item is awaiting approval or not.");
    expect(context.systemPrompt).toContain("Include the most relevant Markdown action link exactly as written in the work context.");
    expect(context.systemPrompt).toContain("Do not imply that approval happened inside chat.");
  });

  it("adds workflow-board guidance for workflow access questions", async () => {
    const artifactId = "11111111-1111-1111-1111-111111111111";
    const db = makeDb([
      [{ personaId: "persona-2", tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      [{ id: "assistant-1", displayName: "Creative Writer" }],
      [{
        id: "work-1",
        teamId: "team-1",
        title: "Daily news post",
        objective: "Prepare the next Thai news post",
        roomId: "room-1",
        status: "awaiting_approval",
        threadRootMessageId: "msg-root",
        activeDraftArtifactId: artifactId,
        artifactRefsJson: [{ artifactId, label: "Draft article" }],
        assignedMemberId: "assistant-1",
        reviewerMemberId: null,
        approverMemberId: "assistant-1",
        updatedAt: new Date(),
      }],
      [{
        id: "msg-root",
        roomId: "room-1",
        summaryContent: "Draft article is ready for approval",
        content: "Prepared the latest draft article and queued the next news summary.",
        artifactRefsJson: [{ artifactId, label: "Draft article" }],
        metadataJson: { workItemId: "work-1", threadRootMessageId: "msg-root" },
        createdAt: new Date(),
      }],
      [{
        id: artifactId,
        artifactType: "document",
        intent: "text_content",
        summary: "Morning Brief draft prepared",
        payloadJson: {
          title: "Morning Brief",
          content: "Headline 1: Market opens higher. Headline 2: New policy update ready for publishing.",
        },
      }],
      [],
      [],
      [],
      [],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockResolvePersona.mockResolvedValue({
      id: "persona-2",
      name: "Creative Writer",
    } as any);

    const context = await buildChatContext(405, 7, "Base system prompt", {
      currentUserMessage: "จะเข้า workflow board ของ persona นี้ได้อย่างไร",
      tenantId: "tenant-1",
      memoryMode: "off",
    });

    expect(context.systemPrompt).toContain("Include the Markdown workflow link exactly as written in the work context.");
    expect(context.systemPrompt).toContain("[Open Workflow Board](/teams/team-1?roomId=room-1&workItemId=work-1&messageId=msg-root&panel=workflow)");
  });
});
