import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../teamRoomMemoryService", () => ({
  refreshRollingSummaryMemories: vi.fn().mockResolvedValue(["summary-1"]),
}));

import { refreshRollingSummaryMemories } from "../teamRoomMemoryService";
import {
  buildContextCompactionPlan,
  refreshContextRollingSummaries,
} from "../contextCompactionService";
import { buildContextStateItem, buildContextOwnerScope } from "../../../shared/contextEngine";

const mockRefreshRollingSummaryMemories = vi.mocked(refreshRollingSummaryMemories);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contextCompactionService", () => {
  it("derives prune and promotion candidates from shared state items", () => {
    const session = buildContextStateItem({
      tier: "session_state",
      title: "Session",
      content: "Track current turn",
      ownerScope: buildContextOwnerScope({ type: "room", id: "room-1" }),
      sourceRef: "room-1/session",
      source: "semantic",
      includedReason: "session state",
    });
    const workingSummary = buildContextStateItem({
      tier: "working_summary",
      title: "Summary",
      content: "Keep continuity",
      ownerScope: buildContextOwnerScope({ type: "team", id: "team-1" }),
      sourceRef: "team-1/summary",
      source: "hybrid",
      includedReason: "summary",
    });
    const toolResult = buildContextStateItem({
      tier: "tool_result",
      title: "Tool",
      content: "raw tool output",
      ownerScope: buildContextOwnerScope({ type: "room", id: "room-1" }),
      sourceRef: "tool://1",
      source: "structured",
      trust: "untrusted",
      freshness: "stale",
      includedReason: "tool output",
    });

    const plan = buildContextCompactionPlan({
      sessionState: session as never,
      workingSummary: workingSummary as never,
      toolResults: [toolResult as never],
    });

    expect(plan.hasWorkingSummary).toBe(true);
    expect(plan.pruneCandidates).toContain("tool://1");
    expect(plan.pruneableTiers).toContain("tool_result");
  });

  it("delegates rolling summaries to the room memory service", async () => {
    await expect(
      refreshContextRollingSummaries({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        assistantId: "assistant-1",
        objective: "Keep continuity",
      }),
    ).resolves.toEqual(["summary-1"]);

    expect(mockRefreshRollingSummaryMemories).toHaveBeenCalledOnce();
  });
});

