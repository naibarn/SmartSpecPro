import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../scopedMemoryService", () => ({
  retrieveForPrompt: vi.fn(),
}));
vi.mock("../contextRetrievalRanker", () => ({
  rankContextRetrievalResults: vi.fn((results) => results),
}));

import { retrieveForPrompt } from "../scopedMemoryService";
import { rankContextRetrievalResults } from "../contextRetrievalRanker";
import { retrieveContextCandidates } from "../contextRetrievalService";

const mockRetrieveForPrompt = vi.mocked(retrieveForPrompt);
const mockRankContextRetrievalResults = vi.mocked(rankContextRetrievalResults);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contextRetrievalService", () => {
  it("delegates to the prompt retriever and ranker with the shared contract", async () => {
    mockRetrieveForPrompt.mockResolvedValue([
      {
        memory: {
          id: "memory-1",
          ownerType: "room",
          title: "Project state",
          content: "Track the latest project status",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        score: 0.8,
        matchType: "hybrid",
        retrievalClass: "structured",
      },
    ] as never);

    const results = await retrieveContextCandidates({
      tenantId: "tenant-1",
      assistantId: "assistant-1",
      query: "project state",
      tokenBudget: 1200,
      roomId: "room-1",
      teamId: "team-1",
      runId: "run-1",
    });

    expect(mockRetrieveForPrompt).toHaveBeenCalledOnce();
    expect(mockRankContextRetrievalResults).toHaveBeenCalledOnce();
    expect(results[0]?.memory.id).toBe("memory-1");
  });
});

