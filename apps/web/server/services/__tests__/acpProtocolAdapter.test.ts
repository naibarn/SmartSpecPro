import { describe, expect, it } from "vitest";
import {
  AcpProtocolError,
  AcpProtocolAdapter,
  parseAcpFrame,
} from "../acpProtocolAdapter";

describe("acpProtocolAdapter", () => {
  it("rejects JSON-RPC envelopes without a method or response payload", () => {
    expect(() => parseAcpFrame({ jsonrpc: "2.0", id: "bad" })).toThrowError(
      new AcpProtocolError("RPC_INVALID")
    );
  });

  it("applies a bounded permission backpressure limit", () => {
    const adapter = new AcpProtocolAdapter({
      maxFrameBytes: 1024,
      maxPendingPermissions: 1,
    });
    adapter.requestPermission({
      requestId: "permission-1",
      sessionId: "session-1",
      turnId: "turn-1",
      capability: "browser.click",
    });
    expect(() =>
      adapter.requestPermission({
        requestId: "permission-2",
        sessionId: "session-1",
        turnId: "turn-1",
        capability: "browser.type",
      })
    ).toThrowError(new AcpProtocolError("BACKPRESSURE"));
  });

  it("parses single and batch JSON-RPC frames with bounded size", () => {
    expect(
      parseAcpFrame(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        })
      )
    ).toHaveLength(1);
    expect(
      parseAcpFrame(
        JSON.stringify([
          { jsonrpc: "2.0", id: 1, result: {} },
          { jsonrpc: "2.0", method: "session/update", params: {} },
        ])
      )
    ).toHaveLength(2);
    expect(() => parseAcpFrame("x".repeat(100), { maxBytes: 20 })).toThrowError(
      new AcpProtocolError("FRAME_TOO_LARGE")
    );
    expect(() => parseAcpFrame("{bad")).toThrowError(
      new AcpProtocolError("FRAME_INVALID")
    );
  });

  it("negotiates capabilities, preserves unknown updates, and binds permissions", () => {
    const adapter = new AcpProtocolAdapter({ maxFrameBytes: 10000 });
    const init = adapter.initialize({
      protocolVersion: "1",
      capabilities: ["session/prompt"],
    });
    expect(init).toMatchObject({ method: "initialize", status: "ready" });
    expect(
      adapter.normalizeUpdate({
        sessionId: "s1",
        updateType: "future/update",
        payload: { x: 1 },
      })
    ).toMatchObject({ type: "unknown", rawType: "future/update" });
    expect(
      adapter.requestPermission({
        requestId: "permission-1",
        sessionId: "s1",
        turnId: "turn-1",
        capability: "file.write",
      })
    ).toMatchObject({ status: "pending" });
    expect(() =>
      adapter.resolvePermission({
        requestId: "permission-1",
        sessionId: "s1",
        turnId: "turn-2",
        decision: "allow",
      })
    ).toThrowError(new AcpProtocolError("PERMISSION_SCOPE_MISMATCH"));
    expect(
      adapter.resolvePermission({
        requestId: "permission-1",
        sessionId: "s1",
        turnId: "turn-1",
        decision: "deny",
      })
    ).toMatchObject({ status: "denied" });
  });
});
