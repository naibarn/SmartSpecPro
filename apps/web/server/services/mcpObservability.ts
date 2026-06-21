import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";

const REDACTED_KEYS = /token|secret|session|prompt|url|response|payload|account/i;

export interface McpObservabilityEvent {
  event: string;
  provider?: string | null;
  transport?: string | null;
  originSurface?: string | null;
  connectionId?: string | null;
  ownerUserId?: number | null;
  actorUserId?: number | null;
  groupId?: number | null;
  toolName?: string | null;
  schemaHash?: string | null;
  assetType?: string | null;
  jobId?: string | null;
  providerJobId?: string | null;
  attemptCount?: number | null;
  errorClass?: string | null;
  latencyMs?: number | null;
  creditPolicy?: string | null;
  status?: string | null;
  details?: Record<string, unknown>;
}

export function redactMcpObservabilityDetails(input: Record<string, unknown> = {}) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_KEYS.test(key)) continue;
    redacted[key] = typeof value === "string" && value.length > 256 ? `${value.slice(0, 256)}...` : value;
  }
  return redacted;
}

export function buildMcpObservabilityEvent(params: {
  event: string;
  metadata?: Partial<MediaTaskTransportMetadata> | null;
  jobId?: string | null;
  providerJobId?: string | null;
  status?: string | null;
  error?: unknown;
  latencyMs?: number | null;
  details?: Record<string, unknown>;
}): McpObservabilityEvent {
  return {
    event: params.event,
    provider: params.metadata?.providerKey ?? null,
    transport: params.metadata?.transport ?? null,
    originSurface: params.metadata?.originSurface ?? null,
    connectionId: params.metadata?.connectionId ?? null,
    ownerUserId: params.metadata?.ownerUserId ?? null,
    actorUserId: params.metadata?.actorUserId ?? null,
    groupId: params.metadata?.sharedGroupId ?? null,
    toolName: params.metadata?.toolName ?? null,
    schemaHash: params.metadata?.schemaHash ?? null,
    assetType: params.metadata?.assetType ?? null,
    jobId: params.jobId ?? null,
    providerJobId: params.providerJobId ?? params.metadata?.providerJobId ?? null,
    attemptCount: params.metadata?.attemptCount ?? null,
    errorClass: params.error instanceof Error ? params.error.name : params.error ? "UnknownError" : null,
    latencyMs: params.latencyMs ?? null,
    creditPolicy: params.metadata?.creditPolicy ?? null,
    status: params.status ?? null,
    details: redactMcpObservabilityDetails(params.details),
  };
}

export function logMcpObservabilityEvent(event: McpObservabilityEvent): void {
  console.info("[mcp-connect]", event);
}
