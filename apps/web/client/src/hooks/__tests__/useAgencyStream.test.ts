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
      // Let the async stream processing complete
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/agency/stream",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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

    // Should have user message + assistant message
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

    // Only user message, no phantom messages from keepalive
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

    // activeAgent may have been set then cleared on run_finished
    // Check activity events instead
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
});
