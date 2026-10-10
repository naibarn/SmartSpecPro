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
} = vi.hoisted(() => ({
  mockGetMessages: vi.fn(),
  mockBuildSmartSummary: vi.fn(),
  mockListMemories: vi.fn(),
  mockCreateMemory: vi.fn(),
  mockUpdateMemory: vi.fn(),
  mockDeleteMemory: vi.fn(),
  mockExtractEntitiesFromMessage: vi.fn(),
  mockUpsertEntityMemory: vi.fn(),
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
  });

  it("does not derive personal persistent memories from team-room messages", async () => {
    mockExtractEntitiesFromMessage.mockReturnValue([
      { type: "person", name: "Ada", fact: "likes plans" },
    ]);

    await expect(
      captureUserMemoryFromTeamMessage({
        tenantId: "tenant-1",
        userId: 9,
        content: "Ada likes plans",
        projectId: "project-1",
      })
    ).resolves.toBe(0);

    expect(mockExtractEntitiesFromMessage).not.toHaveBeenCalled();
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
        projectId: "project-1",
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
        projectId: "project-1",
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
