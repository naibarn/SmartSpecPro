import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetMessages,
  mockBuildSmartSummary,
  mockListMemories,
  mockCreateMemory,
  mockUpdateMemory,
  mockDeleteMemory,
  mockExtractEntitiesFromMessage,
  mockUpsertEntityMemory,
  mockIsTeamRoomMemoryEnabled,
  mockCaptureTeamProjectProviderContextBinding,
  mockRevalidateTeamProjectProviderContextBinding,
} = vi.hoisted(() => ({
  mockGetMessages: vi.fn(),
  mockBuildSmartSummary: vi.fn(),
  mockListMemories: vi.fn(),
  mockCreateMemory: vi.fn(),
  mockUpdateMemory: vi.fn(),
  mockDeleteMemory: vi.fn(),
  mockExtractEntitiesFromMessage: vi.fn(),
  mockUpsertEntityMemory: vi.fn(),
  mockIsTeamRoomMemoryEnabled: vi.fn(() => false),
  mockCaptureTeamProjectProviderContextBinding: vi.fn(),
  mockRevalidateTeamProjectProviderContextBinding: vi.fn(),
}));

vi.mock("../roomService", () => ({
  getMessages: mockGetMessages,
}));

vi.mock("../smartSummarizer", () => ({
  buildSmartSummary: mockBuildSmartSummary,
}));

vi.mock("../scopedMemoryService", () => ({
  createMemory: mockCreateMemory,
  deleteMemory: mockDeleteMemory,
  listMemories: mockListMemories,
  updateMemory: mockUpdateMemory,
}));

vi.mock("../memoryService", () => ({
  extractEntitiesFromMessage: mockExtractEntitiesFromMessage,
  upsertEntityMemory: mockUpsertEntityMemory,
}));

vi.mock("../teamRoomMemoryPolicy", () => ({
  isTeamRoomMemoryEnabled: mockIsTeamRoomMemoryEnabled,
}));

vi.mock("../teamProjectProviderAuthorization", () => ({
  captureTeamProjectProviderContextBinding: mockCaptureTeamProjectProviderContextBinding,
  revalidateTeamProjectProviderContextBinding: mockRevalidateTeamProjectProviderContextBinding,
}));

import {
  captureUserMemoryFromTeamMessage,
  recordAssistantTurnScopedMemories,
  refreshRollingSummaryMemories,
} from "../teamRoomMemoryService";

describe("teamRoomMemoryService", () => {
  beforeEach(() => {
    mockGetMessages.mockReset();
    mockBuildSmartSummary.mockReset();
    mockListMemories.mockReset();
    mockCreateMemory.mockReset();
    mockUpdateMemory.mockReset();
    mockDeleteMemory.mockReset();
    mockExtractEntitiesFromMessage.mockReset();
    mockUpsertEntityMemory.mockReset();
    mockIsTeamRoomMemoryEnabled.mockReset().mockReturnValue(false);
    mockCaptureTeamProjectProviderContextBinding.mockReset();
    mockRevalidateTeamProjectProviderContextBinding.mockReset().mockResolvedValue(undefined);
  });

  it("does not derive personal persistent memories from team-room messages", async () => {
    mockExtractEntitiesFromMessage.mockReturnValue([
      { type: "person", name: "Ada", fact: "likes plans" },
    ]);

    await expect(
      captureUserMemoryFromTeamMessage({
        tenantId: "tenant-1",
        userId: 9,
        roomId: "room-1",
        teamId: "team-1",
        messageId: "message-1",
        content: "Ada likes plans",
      })
    ).resolves.toBe(0);

    expect(mockExtractEntitiesFromMessage).not.toHaveBeenCalled();
    expect(mockUpsertEntityMemory).not.toHaveBeenCalled();
  });

  it("writes user facts only against a fresh canonical project binding", async () => {
    mockIsTeamRoomMemoryEnabled.mockReturnValue(true);
    mockCaptureTeamProjectProviderContextBinding.mockResolvedValue({
      version: "team-room-provider-context.v1",
      tenantId: "tenant-1",
      roomId: "room-1",
      teamId: "team-1",
      userId: 9,
      runId: null,
      historyScope: "room",
      projectId: "canonical-project-1",
      projectAuthority: "canonical-member",
    });
    mockExtractEntitiesFromMessage.mockReturnValue([
      { type: "person", name: "Ada", fact: "likes plans", importance: 5 },
    ]);
    mockUpsertEntityMemory.mockResolvedValue({ id: 12 });

    await expect(captureUserMemoryFromTeamMessage({
      tenantId: "tenant-1",
      userId: 9,
      roomId: "room-1",
      teamId: "team-1",
      messageId: "message-1",
      content: "Ada likes plans",
    })).resolves.toBe(1);

    expect(mockCaptureTeamProjectProviderContextBinding).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      roomId: "room-1",
      teamId: "team-1",
      userId: 9,
      runId: null,
    });
    expect(mockRevalidateTeamProjectProviderContextBinding).toHaveBeenCalled();
    expect(mockUpsertEntityMemory).toHaveBeenCalledWith(
      9,
      "person",
      "Ada",
      ["likes plans"],
      undefined,
      5,
      "team_room",
      "canonical-project-1",
      null,
      {
        tenantId: "tenant-1",
        roomId: "room-1",
        teamId: "team-1",
        runId: null,
        sourceMessageId: "message-1",
        actorUserId: 9,
        canonicalProjectId: "canonical-project-1",
      },
    );
  });

  it("does not write team-room facts without current canonical project membership", async () => {
    mockIsTeamRoomMemoryEnabled.mockReturnValue(true);
    mockCaptureTeamProjectProviderContextBinding.mockResolvedValue({
      version: "team-room-provider-context.v1",
      tenantId: "tenant-1",
      roomId: "room-1",
      teamId: "team-1",
      userId: 9,
      runId: null,
      historyScope: "room",
      projectId: null,
      projectAuthority: "room-only",
    });

    await expect(captureUserMemoryFromTeamMessage({
      tenantId: "tenant-1",
      userId: 9,
      roomId: "room-1",
      teamId: "team-1",
      messageId: "message-1",
      content: "Ada likes plans",
    })).resolves.toBe(0);

    expect(mockExtractEntitiesFromMessage).not.toHaveBeenCalled();
    expect(mockUpsertEntityMemory).not.toHaveBeenCalled();
  });

  it("does not persist a fact if project membership changes before the write", async () => {
    mockIsTeamRoomMemoryEnabled.mockReturnValue(true);
    mockCaptureTeamProjectProviderContextBinding.mockResolvedValue({
      version: "team-room-provider-context.v1",
      tenantId: "tenant-1",
      roomId: "room-1",
      teamId: "team-1",
      userId: 9,
      runId: null,
      historyScope: "room",
      projectId: "canonical-project-1",
      projectAuthority: "canonical-member",
    });
    mockRevalidateTeamProjectProviderContextBinding.mockRejectedValue(new Error("membership revoked"));
    mockExtractEntitiesFromMessage.mockReturnValue([
      { type: "person", name: "Ada", fact: "likes plans", importance: 5 },
    ]);

    await expect(captureUserMemoryFromTeamMessage({
      tenantId: "tenant-1",
      userId: 9,
      roomId: "room-1",
      teamId: "team-1",
      messageId: "message-1",
      content: "Ada likes plans",
    })).resolves.toBe(0);

    expect(mockUpsertEntityMemory).not.toHaveBeenCalled();
  });

  it("does not persist assistant outputs to run, room, or team scopes", async () => {
    await expect(
      recordAssistantTurnScopedMemories({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        assistantId: "assistant-1",
        objective: "Keep continuity",
        content: "Assistant output",
        initiatedByUserId: 9,
      })
    ).resolves.toEqual([]);

    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it("does not load room history or invoke a summarizer for persistent rolling summaries", async () => {
    await expect(
      refreshRollingSummaryMemories({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        assistantId: "assistant-1",
        objective: "Keep continuity",
        initiatedByUserId: 9,
      })
    ).resolves.toEqual([]);

    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockBuildSmartSummary).not.toHaveBeenCalled();
    expect(mockListMemories).not.toHaveBeenCalled();
    expect(mockCreateMemory).not.toHaveBeenCalled();
    expect(mockUpdateMemory).not.toHaveBeenCalled();
    expect(mockDeleteMemory).not.toHaveBeenCalled();
  });
});
