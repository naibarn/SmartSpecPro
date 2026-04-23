import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetMessages,
  mockBuildSmartSummary,
  mockListMemories,
  mockCreateMemory,
  mockUpdateMemory,
  mockDeleteMemory,
} = vi.hoisted(() => ({
  mockGetMessages: vi.fn(),
  mockBuildSmartSummary: vi.fn(),
  mockListMemories: vi.fn(),
  mockCreateMemory: vi.fn(),
  mockUpdateMemory: vi.fn(),
  mockDeleteMemory: vi.fn(),
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

import { refreshRollingSummaryMemories } from "../teamRoomMemoryService";

describe("teamRoomMemoryService", () => {
  beforeEach(() => {
    mockGetMessages.mockReset();
    mockBuildSmartSummary.mockReset();
    mockListMemories.mockReset();
    mockCreateMemory.mockReset();
    mockUpdateMemory.mockReset();
    mockDeleteMemory.mockReset();
  });

  it("creates room and team rolling summaries from recent messages", async () => {
    mockGetMessages.mockResolvedValue([
      { senderType: "user", content: "Need a concise plan", summaryContent: null },
      { senderType: "assistant", content: "Draft plan: research, review, publish", summaryContent: null },
    ]);
    mockBuildSmartSummary.mockResolvedValue({
      summary: "Research, review, and publish a concise plan.",
    });
    mockListMemories.mockResolvedValue([]);
    mockCreateMemory.mockResolvedValueOnce({ id: "room-summary-1" });
    mockCreateMemory.mockResolvedValueOnce({ id: "team-summary-1" });

    const result = await refreshRollingSummaryMemories({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      assistantId: "assistant-1",
      objective: "Produce a concise plan",
      initiatedByUserId: 9,
      projectId: "project-1",
      windowSize: 8,
    });

    expect(result).toEqual(["room-summary-1", "team-summary-1"]);
    expect(mockBuildSmartSummary).toHaveBeenCalledTimes(1);
    expect(mockCreateMemory).toHaveBeenCalledTimes(2);
    expect(mockCreateMemory.mock.calls[0]?.[0]).toMatchObject({
      ownerType: "room",
      ownerId: "room-1",
      memoryKind: "note",
      sourceAssistantId: "assistant-1",
      sourceRoomId: "room-1",
    });
    expect(mockCreateMemory.mock.calls[1]?.[0]).toMatchObject({
      ownerType: "team",
      ownerId: "team-1",
      memoryKind: "note",
      sourceAssistantId: "assistant-1",
      sourceRoomId: "room-1",
    });
  });

  it("updates existing rolling summary and prunes duplicates", async () => {
    mockGetMessages.mockResolvedValue([
      { senderType: "assistant", content: "Initial update", summaryContent: null },
    ]);
    mockBuildSmartSummary.mockResolvedValue({
      summary: "Initial update",
    });
    mockListMemories.mockResolvedValue([
      {
        id: "old-summary-1",
        title: "Working summary: room-1",
        metadataJson: { contextRole: "working_summary" },
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        reinforcementCount: 1,
      },
      {
        id: "current-summary-1",
        title: "Working summary: room-1",
        metadataJson: { contextRole: "working_summary" },
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        reinforcementCount: 2,
      },
    ]);
    mockUpdateMemory.mockResolvedValue({ id: "current-summary-1" });
    mockDeleteMemory.mockResolvedValue(true);

    const result = await refreshRollingSummaryMemories({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      assistantId: "assistant-1",
      objective: "Keep the room summary current",
      initiatedByUserId: 9,
      projectId: "project-1",
    });

    expect(result).toEqual(["current-summary-1", "current-summary-1"]);
    expect(mockDeleteMemory).toHaveBeenCalledTimes(2);
    expect(mockDeleteMemory).toHaveBeenCalledWith("old-summary-1", "tenant-1");
    expect(mockUpdateMemory).toHaveBeenCalledTimes(2);
  });
});
