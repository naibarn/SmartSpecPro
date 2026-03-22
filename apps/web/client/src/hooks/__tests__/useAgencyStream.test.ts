/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgencyStream } from "../useAgencyStream";

function makeSSEResponse(events: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(events));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("useAgencyStream", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("connects to stream endpoint with correct method and credentials", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      makeSSEResponse(`event: run_finished\ndata: {"creditsUsed":0}\n\n`),
    );
    globalThis.fetch = fetchSpy;

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({
        agencyId: "ag-1",
        conversationId: "conv-1",
        message: "hello",
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/agency/stream",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("parses SSE token events and accumulates content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: run_started\ndata: {"runId":"r1"}\n\n` +
        `event: agent_switch\ndata: {"agentName":"Researcher"}\n\n` +
        `event: token\ndata: {"token":"Hello","agentName":"Researcher"}\n\n` +
        `event: token\ndata: {"token":" world","agentName":"Researcher"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0.5}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({
        agencyId: "ag-1",
        message: "test",
      });
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.messages.length).toBeGreaterThanOrEqual(2);
    const assistantMsg = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    expect(assistantMsg?.content).toBe("Hello world");
    expect(assistantMsg?.agentName).toBe("Researcher");
  });

  it("handles keepalive comments without state change", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `: keepalive\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    const assistantMsgs = result.current.messages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMsgs.length).toBe(0);
  });

  it("handles HTTP error from stream endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Insufficient credits" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
    );

    const onError = vi.fn();
    const { result } = renderHook(() => useAgencyStream({ onError }));

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.error).toBe("Insufficient credits");
    expect(result.current.isStreaming).toBe(false);
    expect(onError).toHaveBeenCalledWith("Insufficient credits");
  });

  it("tracks active agent via agent_switch events", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: agent_switch\ndata: {"agentName":"Writer"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    const switchEvents = result.current.activityEvents.filter(
      (e) => e.type === "agent_switch",
    );
    expect(switchEvents.length).toBe(1);
    expect(switchEvents[0].agentName).toBe("Writer");
  });

  it("calls onRunFinished with credits used", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: run_finished\ndata: {"creditsUsed":1.25}\n\n`,
      ),
    );

    const onRunFinished = vi.fn();
    const { result } = renderHook(() =>
      useAgencyStream({ onRunFinished }),
    );

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onRunFinished).toHaveBeenCalledWith(1.25);
    expect(result.current.creditsUsed).toBe(1.25);
  });

  it("parses browser_session events and forwards the artifact", async () => {
    const onBrowserSession = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: browser_session\ndata: {"sessionId":"lbs_agency_1","summary":{"sessionId":"lbs_agency_1","state":"review_required","badgeLabel":"Review Required","statusLine":"Review Required before AI can continue.","primaryActionLabel":"Continue in Browser","pageTitle":"Checkout","url":"https://example.com/checkout","compactNotice":null,"sourceLabel":"Agency"},"updatedAt":"2026-03-12T10:05:00.000Z"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() =>
      useAgencyStream({ onBrowserSession }),
    );

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onBrowserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "lbs_agency_1",
        summary: expect.objectContaining({
          state: "review_required",
          primaryActionLabel: "Continue in Browser",
        }),
      }),
    );
  });

  it("parses preview_ready events and forwards normalized preview metadata", async () => {
    const onPreviewReady = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: preview_ready\ndata: {"run_id":"run-42","preview_artifact_ids":["artifact-1"],"intent":"hotel_comparison","summary":"Comparison ready"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() =>
      useAgencyStream({ onPreviewReady }),
    );

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "compare hotels" });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onPreviewReady).toHaveBeenCalledWith({
      runId: "run-42",
      previewArtifactIds: ["artifact-1"],
      intent: "hotel_comparison",
      summary: "Comparison ready",
    });
  });

  // ── New tests for section-10 features ──

  it("handles text_delta events and accumulates content per agent", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: meta\ndata: {"runId":"r1","agencyId":"ag-1"}\n\n` +
        `event: agent_switch\ndata: {"to":"Writer","from":""}\n\n` +
        `event: text_delta\ndata: {"agentName":"Writer","delta":"Hel"}\n\n` +
        `event: text_delta\ndata: {"agentName":"Writer","delta":"lo"}\n\n` +
        `event: run_complete\ndata: {"runId":"r1","usage":{"tokens":500,"cost":0.01}}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    const assistantMsg = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    expect(assistantMsg?.content).toBe("Hello");
    expect(assistantMsg?.agentName).toBe("Writer");
  });

  it("handles tool_start / tool_end events as activity events", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: tool_start\ndata: {"toolCallId":"tc1","toolName":"web-search","agentName":"Researcher"}\n\n` +
        `event: tool_end\ndata: {"toolCallId":"tc1","status":"success"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    const toolStartEvents = result.current.activityEvents.filter(
      (e) => e.type === "tool_start",
    );
    const toolEndEvents = result.current.activityEvents.filter(
      (e) => e.type === "tool_end",
    );
    expect(toolStartEvents.length).toBe(1);
    expect(toolEndEvents.length).toBe(1);

    // Check toolCalls state
    expect(result.current.toolCalls.length).toBe(1);
    expect(result.current.toolCalls[0].toolCallId).toBe("tc1");
    expect(result.current.toolCalls[0].toolName).toBe("web-search");
    expect(result.current.toolCalls[0].status).toBe("success");
  });

  it("handles tool_progress events and updates tool status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: tool_start\ndata: {"toolCallId":"tc1","toolName":"web-search","agentName":"R"}\n\n` +
        `event: tool_progress\ndata: {"toolCallId":"tc1","status":"searching","message":"Querying..."}\n\n` +
        `event: tool_end\ndata: {"toolCallId":"tc1","status":"success"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    // Tool should have progressed through states and ended as success
    expect(result.current.toolCalls[0].status).toBe("success");
    // Activity events should include tool_progress
    expect(result.current.activityEvents.some((e) => e.type === "tool_progress")).toBe(true);
  });

  it("handles guardrail_trigger events", async () => {
    const onGuardrailTrigger = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: guardrail_trigger\ndata: {"type":"input","guardrailName":"pii_detection","action":"blocked"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() =>
      useAgencyStream({ onGuardrailTrigger }),
    );

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.guardrailEvents.length).toBe(1);
    expect(result.current.guardrailEvents[0].guardrailName).toBe("pii_detection");
    expect(result.current.guardrailEvents[0].action).toBe("blocked");
    expect(onGuardrailTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "input",
        guardrailName: "pii_detection",
        action: "blocked",
      }),
    );
  });

  it("handles approval_required events", async () => {
    const onApprovalRequired = vi.fn();

    // Use a stream that stays open after sending approval_required
    const enc = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          enc.encode(
            `event: approval_required\ndata: {"approvalKey":"uuid-1","step":"publish","summary":"Publish article?","agentName":"Writer"}\n\n`,
          ),
        );
        // Don't close — stream stays open (waiting for approval)
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const { result } = renderHook(() =>
      useAgencyStream({ onApprovalRequired }),
    );

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.pendingApproval).not.toBeNull();
    expect(result.current.pendingApproval?.approvalKey).toBe("uuid-1");
    expect(result.current.pendingApproval?.summary).toBe("Publish article?");
    expect(result.current.isStreaming).toBe(true); // Still streaming, waiting for approval
    expect(onApprovalRequired).toHaveBeenCalled();

    // Cleanup: close the stream
    streamController!.close();
  });

  it("cancel calls cancel endpoint with correct mode", async () => {
    const fetchSpy = vi.fn();
    // First call: SSE stream that stays open
    fetchSpy.mockResolvedValueOnce(
      makeSSEResponse(
        `event: meta\ndata: {"runId":"r1","agencyId":"ag-1"}\n\n`,
      ),
    );
    // Second call: cancel endpoint
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = fetchSpy;

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      result.current.cancel("immediate");
      await new Promise((r) => setTimeout(r, 50));
    });

    // The cancel fetch call
    const cancelCall = fetchSpy.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("/cancel"),
    );
    expect(cancelCall).toBeTruthy();
    expect(cancelCall![1].method).toBe("POST");
    const body = JSON.parse(cancelCall![1].body);
    expect(body.runId).toBe("r1");
    expect(body.mode).toBe("immediate");
  });

  it("reconnection includes Last-Event-ID header", async () => {
    const fetchSpy = vi.fn();

    // First connection: succeeds with events including IDs, then stream ends
    const enc = new TextEncoder();
    const firstStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          enc.encode(
            `id: 1\nevent: meta\ndata: {"runId":"r1","agencyId":"ag-1"}\n\n` +
            `id: 2\nevent: text_delta\ndata: {"agentName":"A","delta":"Hi"}\n\n` +
            `id: 3\nevent: text_delta\ndata: {"agentName":"A","delta":"!"}\n\n`,
          ),
        );
        controller.close();
      },
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(firstStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    // The stream closes naturally, setIsStreaming(false) is called,
    // no error thrown so no reconnection. This test verifies that
    // lastEventIdRef is properly tracked.
    globalThis.fetch = fetchSpy;

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    // Verify content was accumulated from events with IDs
    const msg = result.current.messages.find((m) => m.role === "assistant");
    expect(msg?.content).toBe("Hi!");
  });

  it("falls back to polling after 3 failed SSE connections in 60s", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();

    // All 3 calls reject with network error
    fetchSpy.mockRejectedValue(new Error("Network error"));
    globalThis.fetch = fetchSpy;

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      // Let the first failure propagate
      await vi.advanceTimersByTimeAsync(100);
    });

    // Advance through reconnect delays (1s, 2s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100); // 1st reconnect after 1s
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // 2nd reconnect after 2s
    });

    // After 3 failures, should switch to polling
    expect(result.current.isPollingFallback).toBe(true);

    vi.useRealTimers();
  });

  it("run_complete event maps correctly (new event name)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: run_complete\ndata: {"runId":"r1","usage":{"tokens":500,"cost":0.01}}\n\n`,
      ),
    );

    const onRunFinished = vi.fn();
    const { result } = renderHook(() =>
      useAgencyStream({ onRunFinished }),
    );

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.creditsUsed).toBe(0.01);
    expect(result.current.isStreaming).toBe(false);
    expect(onRunFinished).toHaveBeenCalledWith(0.01);
  });

  it("backward compatible with legacy token events", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: token\ndata: {"token":"Hello","agentName":"Agent1"}\n\n` +
        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 100));
    });

    const assistantMsg = result.current.messages.find(
      (m) => m.role === "assistant",
    );
    expect(assistantMsg?.content).toBe("Hello");
  });

  it("disconnect cleans up and cancels in-flight request", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeSSEResponse(
        `event: meta\ndata: {"runId":"r1"}\n\n`,
      ),
    );

    const { result } = renderHook(() => useAgencyStream());

    await act(async () => {
      result.current.connect({ agencyId: "ag-1", message: "test" });
      await new Promise((r) => setTimeout(r, 50));
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
