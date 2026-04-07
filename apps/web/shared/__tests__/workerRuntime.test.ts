import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLAW_GATEWAY_COMPATIBILITY,
  WORKER_RUNTIME_PROTOCOL_VERSION,
  workerHeartbeatPayloadSchema,
  workerRegistrationPayloadSchema,
  workerRuntimeTypeValues,
  workerScopeValues,
} from "../workerRuntime";

describe("workerRuntime shared contracts", () => {
  it("includes openclaw_gateway in the runtime vocabulary", () => {
    expect(workerRuntimeTypeValues).toContain("openclaw_gateway");
  });

  it("exposes worker scopes for the control-plane loop", () => {
    expect(workerScopeValues).toEqual(expect.arrayContaining([
      "workers:register",
      "workers:heartbeat",
      "workers:claim",
      "workers:report",
      "workers:diagnostics",
    ]));
  });

  it("defines registration payload compatibility metadata", () => {
    const parsed = workerRegistrationPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      displayName: "Main Office OpenClaw",
      externalReference: "openclaw://main-office",
    });

    expect(parsed.compatibility.protocolVersion).toBe(WORKER_RUNTIME_PROTOCOL_VERSION);
    expect(parsed.runtimeType).toBe("openclaw_gateway");
  });

  it("defines heartbeat payload compatibility metadata", () => {
    const parsed = workerHeartbeatPayloadSchema.parse({
      compatibility: {
        protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
        runtimeVersion: "1.2.3",
      },
      runtimeType: "openclaw_gateway",
      status: "online",
    });

    expect(parsed.status).toBe("online");
    expect(parsed.compatibility.runtimeVersion).toBe("1.2.3");
  });

  it("defines default HTTP gateway compatibility metadata", () => {
    expect(DEFAULT_CLAW_GATEWAY_COMPATIBILITY.httpEndpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/v1/chat/completions" }),
      expect.objectContaining({ path: "/v1/responses" }),
      expect.objectContaining({ path: "/v1/models" }),
    ]));
  });
});
