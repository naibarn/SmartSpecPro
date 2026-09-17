import { createHash } from "node:crypto";

import {
  JobControlPlaneError,
  type JobDefinition,
} from "./jobControlPlaneTypes";

export const MCP_GOVERNANCE_CONTRACT_VERSION = "sah-mcp-governance-v1";
export type McpRiskLevel = "low" | "medium" | "high";
export type McpConnectionState =
  "discovered" | "quarantined" | "approved" | "active" | "revoked";

export type McpToolDescriptor = {
  connectionId: string;
  tenantId: string;
  toolName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  schemaRevision: string;
  risk: McpRiskLevel;
  mutatesExternalState: boolean;
};

export type McpGrant = {
  grantId: string;
  tenantId: string;
  connectionId: string;
  toolName: string;
  grantRevision: string;
  state: "active" | "revoked" | "expired";
  expiresAt?: string;
  requiresApproval: boolean;
};

export type McpExecutionRequest = {
  requestId: string;
  tenantId: string;
  actorId: number;
  connectionId: string;
  connectionState: McpConnectionState;
  toolName: string;
  grantId: string;
  grantRevision: string;
  arguments: Record<string, unknown>;
  durable: boolean;
  approvedByCommand?: boolean;
};

function invalid(message: string): never {
  throw new JobControlPlaneError("MCP_GOVERNANCE_CONTRACT_INVALID", message);
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") invalid(`${field} is invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength)
    invalid(`${field} is invalid`);
  return normalized;
}

function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(`${field} is invalid`);
  return value as Record<string, unknown>;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child)])
    );
  return value;
}

function containsCredentialKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      /authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key/i.test(
        key
      ) || containsCredentialKey(child)
  );
}

export function canonicalizeMcpToolSchema(schema: Record<string, unknown>): {
  schema: Record<string, unknown>;
  schemaHash: string;
} {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    invalid("inputSchema must be an object");
  if (containsCredentialKey(schema))
    invalid("tool schema cannot contain credentials");
  const normalized = stable(schema) as Record<string, unknown>;
  return {
    schema: normalized,
    schemaHash: createHash("sha256")
      .update(JSON.stringify(normalized), "utf8")
      .digest("hex"),
  };
}

export function classifyMcpRisk(
  tool: Pick<
    McpToolDescriptor,
    "mutatesExternalState" | "toolName" | "description"
  >
): McpRiskLevel {
  if (tool.mutatesExternalState) return "high";
  if (
    /delete|remove|write|send|publish|execute|shell|code/i.test(
      `${tool.toolName} ${tool.description ?? ""}`
    )
  )
    return "medium";
  return "low";
}

export function canExecuteMcpTool(input: {
  connectionState: McpConnectionState;
  tool: McpToolDescriptor;
  grant: McpGrant;
  now?: Date;
  approvedByCommand?: boolean;
}): void {
  if (!["approved", "active"].includes(input.connectionState))
    throw new JobControlPlaneError(
      "MCP_CONNECTION_NOT_APPROVED",
      "MCP connection is not approved"
    );
  if (
    input.grant.state !== "active" ||
    input.grant.tenantId !== input.tool.tenantId ||
    input.grant.connectionId !== input.tool.connectionId ||
    input.grant.toolName !== input.tool.toolName ||
    input.grant.grantRevision !== input.tool.schemaRevision
  )
    throw new JobControlPlaneError(
      "MCP_GRANT_STALE",
      "MCP grant is missing, revoked or stale"
    );
  if (
    input.grant.expiresAt !== undefined &&
    (typeof input.grant.expiresAt !== "string" ||
      Number.isNaN(Date.parse(input.grant.expiresAt)))
  )
    invalid("MCP grant expiry is invalid");
  if (
    input.grant.expiresAt &&
    Date.parse(input.grant.expiresAt) <= (input.now ?? new Date()).getTime()
  )
    throw new JobControlPlaneError(
      "MCP_GRANT_EXPIRED",
      "MCP grant has expired"
    );
  if (
    (input.tool.risk === "high" || input.grant.requiresApproval) &&
    input.approvedByCommand !== true
  )
    throw new JobControlPlaneError(
      "MCP_APPROVAL_REQUIRED",
      "MCP tool approval is required"
    );
}

export function buildMcpExecutionJobDefinition(
  input: McpExecutionRequest & { tool: McpToolDescriptor; grant: McpGrant }
): JobDefinition {
  const requestId = requiredText(input.requestId, "requestId", 160);
  const tenantId = requiredText(input.tenantId, "tenantId", 36);
  const connectionId = requiredText(input.connectionId, "connectionId", 160);
  const toolName = requiredText(input.toolName, "toolName", 200);
  const grantId = requiredText(input.grantId, "grantId", 160);
  const grantRevision = requiredText(input.grantRevision, "grantRevision", 128);
  const argumentsValue = recordValue(input.arguments, "arguments");
  canExecuteMcpTool({
    connectionState: input.connectionState,
    tool: input.tool,
    grant: input.grant,
    approvedByCommand: input.approvedByCommand,
  });
  if (!input.durable)
    invalid("MCP external side effects must use a durable Job");
  if (
    !Number.isSafeInteger(input.actorId) ||
    input.actorId <= 0 ||
    tenantId !== input.tool.tenantId ||
    connectionId !== input.tool.connectionId ||
    toolName !== input.tool.toolName ||
    grantId !== input.grant.grantId ||
    grantRevision !== input.grant.grantRevision
  )
    invalid("MCP actor, grant or tenant scope is invalid");
  if (containsCredentialKey(argumentsValue))
    invalid("MCP arguments cannot contain credentials");
  return {
    contractVersion: "feature-186-v1",
    tenantId,
    requestedByUserId: input.actorId,
    jobType: "mcp.tool.execute",
    executionClass: "external",
    input: {
      requestId,
      connectionId,
      toolName,
      grantId,
      grantRevision,
      arguments: argumentsValue,
    },
    idempotencyKey: `mcp:${requestId}`.slice(0, 128),
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 1_000,
      maxDelayMs: 60_000,
      jitter: "bounded",
      deadlineMs: 900_000,
      allowedErrorClasses: ["timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 60_000, hardTimeoutMs: 900_000 },
    requiredCapabilities: {
      capabilityId: `mcp:${connectionId}:${toolName}`,
      grantRevision,
    },
  };
}
