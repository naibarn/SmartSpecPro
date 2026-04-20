import { describe, expect, it } from "vitest";

import {
  AgentRuntimeBackpressureController,
  AgentRuntimeBackpressureError,
  shouldRetryAgentRuntimeFailure,
} from "../agentRuntime/backpressure";
import { evaluateShadowSideEffect } from "../agentRuntime/shadowPolicy";

describe("AgentRuntimeBackpressureController", () => {
  it("enforces the per-tenant SDK runtime limit", () => {
    const controller = new AgentRuntimeBackpressureController({
      perTenant: 1,
      perTeamRoom: 2,
      perChatUser: 2,
      requestTimeoutMs: 30_000,
      streamIdleTimeoutMs: 15_000,
      maxRetryAttempts: 2,
    });

    const lease = controller.acquire({
      tenantId: "tenant-1",
      surface: "responses",
    });

    expect(() =>
      controller.acquire({
        tenantId: "tenant-1",
        surface: "responses",
      }),
    ).toThrowError(AgentRuntimeBackpressureError);

    lease.release();
  });

  it("enforces the per-room Team runtime limit", () => {
    const controller = new AgentRuntimeBackpressureController({
      perTenant: 5,
      perTeamRoom: 1,
      perChatUser: 2,
      requestTimeoutMs: 30_000,
      streamIdleTimeoutMs: 15_000,
      maxRetryAttempts: 2,
    });

    const lease = controller.acquire({
      tenantId: "tenant-1",
      surface: "team",
      roomId: "room-1",
    });

    expect(() =>
      controller.acquire({
        tenantId: "tenant-1",
        surface: "team",
        roomId: "room-1",
      }),
    ).toThrow(/Room room-1 exceeded/);

    lease.release();
  });

  it("enforces the per-user Chat runtime limit", () => {
    const controller = new AgentRuntimeBackpressureController({
      perTenant: 5,
      perTeamRoom: 2,
      perChatUser: 1,
      requestTimeoutMs: 30_000,
      streamIdleTimeoutMs: 15_000,
      maxRetryAttempts: 2,
    });

    const lease = controller.acquire({
      tenantId: "tenant-1",
      surface: "chat",
      userId: "user-1",
    });

    expect(() =>
      controller.acquire({
        tenantId: "tenant-1",
        surface: "chat",
        userId: "user-1",
      }),
    ).toThrow(/User user-1 exceeded/);

    lease.release();
  });

  it("retries only safe transport failures with idempotency keys", () => {
    expect(
      shouldRetryAgentRuntimeFailure({
        code: "gateway_unavailable",
        attempt: 1,
        maxAttempts: 3,
        idempotencyKey: "idem-1",
      }),
    ).toBe(true);
  });

  it("does not retry invalid request classes", () => {
    expect(
      shouldRetryAgentRuntimeFailure({
        code: "invalid_request",
        attempt: 1,
        maxAttempts: 3,
        idempotencyKey: "idem-1",
      }),
    ).toBe(false);
  });
});

describe("evaluateShadowSideEffect", () => {
  it("suppresses mutating tools in shadow mode when no dry-run path exists", () => {
    expect(
      evaluateShadowSideEffect({
        mode: "shadow",
        effectKind: "tool",
        toolMutationClass: "mutating",
        dryRunAvailable: false,
      }),
    ).toMatchObject({
      allowed: false,
      suppressed: true,
      reason: "mutating_tool_suppressed_in_shadow_mode",
    });
  });

  it("suppresses connector writes in shadow mode", () => {
    expect(
      evaluateShadowSideEffect({
        mode: "shadow",
        effectKind: "connector_write",
      }),
    ).toMatchObject({
      allowed: false,
      suppressed: true,
      reason: "connector_write_suppressed_in_shadow_mode",
    });
  });

  it("suppresses media submits unless a sandbox route exists", () => {
    expect(
      evaluateShadowSideEffect({
        mode: "shadow",
        effectKind: "media_submit",
        sandboxRouteConfigured: false,
      }),
    ).toMatchObject({
      allowed: false,
      suppressed: true,
      reason: "media_submit_suppressed_without_sandbox_route",
    });
  });

  it("does not allow shadow execution to consume approval decisions or user-visible messages", () => {
    expect(
      evaluateShadowSideEffect({
        mode: "shadow",
        effectKind: "approval_decision",
      }).allowed,
    ).toBe(false);
    expect(
      evaluateShadowSideEffect({
        mode: "shadow",
        effectKind: "user_visible_message",
      }).allowed,
    ).toBe(false);
  });
});
