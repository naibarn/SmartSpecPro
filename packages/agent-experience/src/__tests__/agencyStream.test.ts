import { describe, expect, it } from "vitest";
import { agencyStreamToAgentEvents, type AgencyStreamLikeEvent } from "../index";

const context = {
  tenantId: "tenant-1",
  userId: "user-1",
  conversationId: "conv-1",
  runId: "run-1",
} as const;

describe("agencyStreamToAgentEvents", () => {
  it("maps Agency happy path events in stable order", () => {
    const source: AgencyStreamLikeEvent[] = [
      { event: "meta", id: "1", ts: "2026-06-22T00:00:00.000Z", data: { runId: "run-1", agencyId: "agency-1" } },
      { event: "text_delta", id: "2", ts: "2026-06-22T00:00:01.000Z", data: { agentName: "Researcher", delta: "Hi" } },
      { event: "tool_start", id: "3", ts: "2026-06-22T00:00:02.000Z", data: { agentName: "Researcher", toolName: "search", toolCallId: "tc-1" } },
      { event: "tool_progress", id: "4", ts: "2026-06-22T00:00:03.000Z", data: { toolCallId: "tc-1", message: "Searching" } },
      { event: "tool_end", id: "5", ts: "2026-06-22T00:00:04.000Z", data: { toolCallId: "tc-1", status: "success", result: "done" } },
      { event: "run_complete", id: "6", ts: "2026-06-22T00:00:05.000Z", data: { runId: "run-1", usage: { tokens: 10, cost: 0.01 } } },
    ];

    const result = agencyStreamToAgentEvents(source, context);
    expect(result.dropped).toEqual([]);
    expect(result.events.map((event) => event.type)).toEqual([
      "session.started",
      "message.delta",
      "tool.start",
      "tool.progress",
      "tool.done",
      "workflow.step",
    ]);
    expect(result.events.map((event) => event.sourceEventId)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("maps legacy token/tool_result, approval, artifact, and malformed events", () => {
    const result = agencyStreamToAgentEvents([
      { event: "token", id: "7", ts: "2026-06-22T00:00:06.000Z", data: { token: "A" } },
      { event: "tool_result", id: "8", ts: "2026-06-22T00:00:07.000Z", data: { toolCallId: "tc-1", result: "ok" } },
      { event: "approval_required", id: "9", ts: "2026-06-22T00:00:08.000Z", data: { approvalKey: "approval-1", step: "Review", summary: "Approve?" } },
      { event: "preview_ready", id: "10", ts: "2026-06-22T00:00:09.000Z", data: { artifactId: "artifact-1", title: "Preview" } },
      { event: "unknown", id: "11", ts: "2026-06-22T00:00:10.000Z", data: {} },
      { event: "text_delta", id: "12", ts: "bad-date", data: null as unknown as Record<string, unknown> },
    ], context);

    expect(result.events.map((event) => event.type)).toEqual([
      "message.delta",
      "tool.done",
      "approval.request",
      "artifact.created",
    ]);
    expect(result.dropped.map((event) => event.reason)).toEqual(["unsupported_event", "malformed"]);
  });
});
