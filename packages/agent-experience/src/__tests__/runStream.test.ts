import { describe, expect, it } from "vitest";
import { runStreamToAgentEvents, type RunStreamLikeEvent } from "../index";

function event(overrides: Partial<RunStreamLikeEvent>): RunStreamLikeEvent {
  return {
    eventId: "evt-1",
    eventType: "workflow.step.started",
    tenantId: "tenant-1",
    teamId: "team-1",
    roomId: "room-1",
    runId: "run-1",
    ts: "2026-06-22T00:00:00.000Z",
    actorType: "assistant",
    actorId: "agent-1",
    visibility: "transparent",
    data: {},
    ...overrides,
  };
}

describe("runStreamToAgentEvents", () => {
  it("preserves Team run identity and maps workflow events", () => {
    const result = runStreamToAgentEvents([
      event({ eventId: "evt-1", eventType: "workflow.step.started", data: { stepId: "s1", label: "Research" } }),
    ]);

    expect(result.dropped).toEqual([]);
    expect(result.events[0]).toMatchObject({
      type: "workflow.step",
      sourceEventId: "evt-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      actorId: "agent-1",
    });
  });

  it("maps message, tool, approval, and artifact event families", () => {
    const result = runStreamToAgentEvents([
      event({ eventId: "evt-2", eventType: "message_delta", data: { delta: "Hi" } }),
      event({ eventId: "evt-3", eventType: "tool_start", data: { toolCallId: "tc-1", toolName: "search" } }),
      event({ eventId: "evt-4", eventType: "approval_requested", data: { approvalId: "approval-1" } }),
      event({ eventId: "evt-5", eventType: "artifact_created", data: { artifactId: "artifact-1" } }),
    ]);

    expect(result.events.map((item) => item.type)).toEqual([
      "message.delta",
      "tool.start",
      "approval.request",
      "artifact.created",
    ]);
  });

  it("hides private/internal events from normal renderer output", () => {
    const result = runStreamToAgentEvents([
      event({ eventId: "evt-private", visibility: "private_internal" }),
    ]);

    expect(result.events).toHaveLength(0);
    expect(result.dropped[0]?.reason).toBe("private_internal");
  });

  it("converts unknown events to debug output only when requested", () => {
    expect(runStreamToAgentEvents([event({ eventType: "opaque" })]).dropped[0]?.reason)
      .toBe("unsupported_event");

    const debug = runStreamToAgentEvents([event({ eventType: "opaque" })], { includeDebugEvents: true });
    expect(debug.events[0]?.type).toBe("debug.trace");
    expect(debug.events[0]?.visibility).toBe("debug_only");
  });
});
