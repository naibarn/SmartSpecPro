import type { AgentRuntimeSurface } from "../../../shared/agentRuntime/types";

export interface AgentRuntimeBackpressureLimits {
  perTenant: number;
  perTeamRoom: number;
  perChatUser: number;
  requestTimeoutMs: number;
  streamIdleTimeoutMs: number;
  maxRetryAttempts: number;
}

export interface AgentRuntimeConcurrencyScope {
  tenantId: string;
  surface: AgentRuntimeSurface;
  roomId?: string | null;
  userId?: string | null;
}

export interface AgentRuntimeBackpressureLease {
  key: string;
  release(): void;
}

export class AgentRuntimeBackpressureError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentRuntimeBackpressureError";
    this.code = code;
  }
}

function increment(map: Map<string, number>, key: string): number {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

function decrement(map: Map<string, number>, key: string): void {
  const current = map.get(key) ?? 0;
  if (current <= 1) {
    map.delete(key);
    return;
  }
  map.set(key, current - 1);
}

export class AgentRuntimeBackpressureController {
  private readonly tenantCounts = new Map<string, number>();
  private readonly roomCounts = new Map<string, number>();
  private readonly userCounts = new Map<string, number>();

  constructor(private readonly limits: AgentRuntimeBackpressureLimits) {}

  acquire(scope: AgentRuntimeConcurrencyScope): AgentRuntimeBackpressureLease {
    const tenantCount = increment(this.tenantCounts, scope.tenantId);
    if (tenantCount > this.limits.perTenant) {
      decrement(this.tenantCounts, scope.tenantId);
      throw new AgentRuntimeBackpressureError(
        "tenant_limit_exceeded",
        `Tenant ${scope.tenantId} exceeded the agent runtime concurrency limit.`,
      );
    }

    let roomKey: string | null = null;
    if (scope.surface === "team" && scope.roomId) {
      roomKey = `${scope.tenantId}:${scope.roomId}`;
      const roomCount = increment(this.roomCounts, roomKey);
      if (roomCount > this.limits.perTeamRoom) {
        decrement(this.tenantCounts, scope.tenantId);
        decrement(this.roomCounts, roomKey);
        throw new AgentRuntimeBackpressureError(
          "room_limit_exceeded",
          `Room ${scope.roomId} exceeded the Team runtime concurrency limit.`,
        );
      }
    }

    let userKey: string | null = null;
    if (scope.surface === "chat" && scope.userId) {
      userKey = `${scope.tenantId}:${scope.userId}`;
      const userCount = increment(this.userCounts, userKey);
      if (userCount > this.limits.perChatUser) {
        decrement(this.tenantCounts, scope.tenantId);
        decrement(this.userCounts, userKey);
        throw new AgentRuntimeBackpressureError(
          "user_limit_exceeded",
          `User ${scope.userId} exceeded the Chat runtime concurrency limit.`,
        );
      }
    }

    const release = () => {
      decrement(this.tenantCounts, scope.tenantId);
      if (roomKey) decrement(this.roomCounts, roomKey);
      if (userKey) decrement(this.userCounts, userKey);
    };

    return {
      key: `${scope.tenantId}:${scope.surface}:${scope.roomId ?? scope.userId ?? "global"}`,
      release,
    };
  }

  getTimeouts() {
    return {
      requestTimeoutMs: this.limits.requestTimeoutMs,
      streamIdleTimeoutMs: this.limits.streamIdleTimeoutMs,
    };
  }
}

const RETRYABLE_TRANSPORT_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "gateway_unavailable",
  "adapter_timeout",
  "fetch_failed",
]);

const NON_RETRYABLE_CODES = new Set([
  "tool_denied",
  "selected_tool_not_allowed",
  "selected_skill_not_allowed",
  "selected_agent_not_allowed",
  "invalid_envelope",
  "guardrail_block",
  "invalid_request",
  "adapter_runtime_contract_unsupported",
  "adapter_trace_schema_unsupported",
  "adapter_checkpoint_schema_unsupported",
]);

export function shouldRetryAgentRuntimeFailure(input: {
  code?: string | null;
  attempt: number;
  maxAttempts: number;
  idempotencyKey?: string | null;
}): boolean {
  if (!input.idempotencyKey?.trim()) return false;
  if (input.attempt >= input.maxAttempts) return false;
  if (!input.code) return false;
  if (NON_RETRYABLE_CODES.has(input.code)) return false;
  return RETRYABLE_TRANSPORT_CODES.has(input.code);
}
