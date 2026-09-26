import { createHash } from "node:crypto";

export type GatewayEnvironment = "development" | "preview" | "staging" | "production";

export type ProductPrincipalContext = {
  principalId: string;
  tenantId: string;
  productId?: string;
  environment: GatewayEnvironment;
  runtimeReleaseId?: string;
  roleRefs: string[];
  entitlementRefs: string[];
  capabilityGrantRefs: string[];
  sessionId?: string;
  authMethod: string;
};

type ServerPrincipalContext = ProductPrincipalContext;

export type GatewayTargetScope = {
  tenantId: string;
  productId?: string;
  environment: GatewayEnvironment;
};

export type CapabilityInvocationEnvelope = {
  contractVersion: "spec-220-v1";
  capabilityId: string;
  capabilityVersion: string;
  principalId: string;
  tenantId: string;
  productId?: string;
  environment: GatewayEnvironment;
  target: GatewayTargetScope;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId: string;
  sideEffect: boolean;
};

export type GatewayScope = {
  tenantId: string;
  productId?: string;
  environment: GatewayEnvironment;
  collectionName: string;
  resourceId?: string;
};

export type SafeGatewayFilter = {
  field: string;
  operator: "eq" | "neq" | "in" | "prefix" | "contains";
  value: unknown;
};

export type SafeGatewayQuery = {
  fields?: string[];
  filters?: SafeGatewayFilter[];
  limit: number;
  cursor?: string;
};

export type SecretReference = {
  secretId: string;
  tenantId: string;
  productId?: string;
  environment: GatewayEnvironment;
  purpose: string;
  expiresAt: string;
};

export class GatewayContractError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "GatewayContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const FORBIDDEN_SECRET_KEY = /(?:^|[_-])(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key|signed[_-]?url)$/i;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_COLLECTION = /^[a-z][a-z0-9_.-]{0,63}$/;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new GatewayContractError(code);
  return value.trim();
}

function isEnvironment(value: unknown): value is GatewayEnvironment {
  return value === "development" || value === "preview" || value === "staging" || value === "production";
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

function containsForbiddenSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSecretKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    FORBIDDEN_SECRET_KEY.test(key) || containsForbiddenSecretKey(child)
  );
}

export function buildProductPrincipalContext(input: {
  server: ServerPrincipalContext;
  requested?: Partial<ProductPrincipalContext>;
}): ProductPrincipalContext {
  const server = input.server;
  const requested = input.requested;
  for (const key of ["principalId", "tenantId", "productId", "environment", "runtimeReleaseId", "sessionId", "authMethod"] as const) {
    if (requested?.[key] !== undefined && requested[key] !== server[key])
      throw new GatewayContractError("GATEWAY_IDENTITY_FORBIDDEN");
  }
  for (const key of ["roleRefs", "entitlementRefs", "capabilityGrantRefs"] as const) {
    if (requested?.[key] !== undefined && JSON.stringify(requested[key]) !== JSON.stringify(server[key]))
      throw new GatewayContractError("GATEWAY_IDENTITY_FORBIDDEN");
  }
  const context: ProductPrincipalContext = {
    principalId: requiredText(server.principalId, "GATEWAY_CONTEXT_INVALID"),
    tenantId: requiredText(server.tenantId, "GATEWAY_CONTEXT_INVALID"),
    environment: server.environment,
    roleRefs: [...server.roleRefs],
    entitlementRefs: [...server.entitlementRefs],
    capabilityGrantRefs: [...server.capabilityGrantRefs],
    authMethod: requiredText(server.authMethod, "GATEWAY_CONTEXT_INVALID"),
  };
  if (!isEnvironment(server.environment)) throw new GatewayContractError("GATEWAY_CONTEXT_INVALID");
  if (server.productId !== undefined) context.productId = requiredText(server.productId, "GATEWAY_CONTEXT_INVALID");
  if (server.runtimeReleaseId !== undefined) context.runtimeReleaseId = requiredText(server.runtimeReleaseId, "GATEWAY_CONTEXT_INVALID");
  if (server.sessionId !== undefined) context.sessionId = requiredText(server.sessionId, "GATEWAY_CONTEXT_INVALID");
  for (const refs of [context.roleRefs, context.entitlementRefs, context.capabilityGrantRefs]) {
    if (refs.some(ref => !SAFE_IDENTIFIER.test(ref))) throw new GatewayContractError("GATEWAY_CONTEXT_INVALID");
  }
  return context;
}

export function buildCapabilityInvocationEnvelope(input: {
  context: ProductPrincipalContext;
  capabilityId: string;
  capabilityVersion: string;
  target: GatewayTargetScope;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  sideEffect: boolean;
}): CapabilityInvocationEnvelope {
  const capabilityId = requiredText(input.capabilityId, "GATEWAY_CAPABILITY_INVALID");
  const capabilityVersion = requiredText(input.capabilityVersion, "GATEWAY_CONTRACT_VERSION_INVALID");
  if (!SAFE_IDENTIFIER.test(capabilityId) || !SAFE_VERSION.test(capabilityVersion))
    throw new GatewayContractError("GATEWAY_CAPABILITY_INVALID");
  if (input.target.tenantId !== input.context.tenantId || input.target.productId !== input.context.productId || input.target.environment !== input.context.environment)
    throw new GatewayContractError("GATEWAY_SCOPE_INVALID");
  if (containsForbiddenSecretKey(input.input)) throw new GatewayContractError("GATEWAY_SECRET_VALUE_FORBIDDEN");
  const idempotencyKey = input.idempotencyKey?.trim();
  if (input.sideEffect && !idempotencyKey) throw new GatewayContractError("GATEWAY_IDEMPOTENCY_REQUIRED");
  if (idempotencyKey && (idempotencyKey.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)))
    throw new GatewayContractError("GATEWAY_IDEMPOTENCY_INVALID");
  return {
    contractVersion: "spec-220-v1",
    capabilityId,
    capabilityVersion,
    principalId: input.context.principalId,
    tenantId: input.context.tenantId,
    ...(input.context.productId ? { productId: input.context.productId } : {}),
    environment: input.context.environment,
    target: structuredClone(input.target),
    input: cloneRecord(input.input),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    correlationId: input.correlationId?.trim() || idempotencyKey || `${capabilityId}:${capabilityVersion}`,
    sideEffect: input.sideEffect,
  };
}

export function buildLogicalGatewayScope(input: {
  context: ProductPrincipalContext;
  collectionName: string;
  resourceId?: string;
}): GatewayScope {
  const collectionName = requiredText(input.collectionName, "GATEWAY_SCOPE_INVALID").toLowerCase();
  if (!SAFE_COLLECTION.test(collectionName) || /(?:select|insert|update|delete|from|join|;|--)/i.test(collectionName))
    throw new GatewayContractError("GATEWAY_SCOPE_INVALID");
  if (input.resourceId !== undefined && !SAFE_IDENTIFIER.test(input.resourceId))
    throw new GatewayContractError("GATEWAY_SCOPE_INVALID");
  return {
    tenantId: input.context.tenantId,
    ...(input.context.productId ? { productId: input.context.productId } : {}),
    environment: input.context.environment,
    collectionName,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
  };
}

export function buildSafeGatewayQuery(input: Record<string, unknown>): SafeGatewayQuery {
  if ("sql" in input || "raw" in input || "table" in input || "joins" in input)
    throw new GatewayContractError("GATEWAY_QUERY_UNSAFE");
  const fields = input.fields === undefined ? undefined : input.fields;
  if (fields !== undefined && (!Array.isArray(fields) || fields.some(field => typeof field !== "string" || !SAFE_FIELD.test(field) || FORBIDDEN_SECRET_KEY.test(field))))
    throw new GatewayContractError("GATEWAY_QUERY_UNSAFE");
  const filters = input.filters === undefined ? undefined : input.filters;
  if (filters !== undefined && (!Array.isArray(filters) || filters.some(filter => {
    if (!filter || typeof filter !== "object") return true;
    const candidate = filter as SafeGatewayFilter;
    return !SAFE_FIELD.test(String(candidate.field))
      || FORBIDDEN_SECRET_KEY.test(String(candidate.field))
      || !["eq", "neq", "in", "prefix", "contains"].includes(candidate.operator);
  })))
    throw new GatewayContractError("GATEWAY_QUERY_UNSAFE");
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new GatewayContractError("GATEWAY_QUERY_LIMIT_INVALID");
  return {
    ...(fields ? { fields: [...fields] as string[] } : {}),
    ...(filters ? { filters: structuredClone(filters) as SafeGatewayFilter[] } : {}),
    limit,
    ...(typeof input.cursor === "string" && input.cursor ? { cursor: input.cursor } : {}),
  };
}

export function buildSecretReference(input: {
  context: ProductPrincipalContext;
  secretId: string;
  purpose: string;
  expiresAt: string;
  value?: unknown;
}): SecretReference {
  if (input.value !== undefined) throw new GatewayContractError("GATEWAY_SECRET_VALUE_FORBIDDEN");
  const secretId = requiredText(input.secretId, "GATEWAY_SECRET_REFERENCE_INVALID");
  const purpose = requiredText(input.purpose, "GATEWAY_SECRET_REFERENCE_INVALID");
  const expiresAt = requiredText(input.expiresAt, "GATEWAY_SECRET_REFERENCE_INVALID");
  if (!SAFE_IDENTIFIER.test(secretId) || Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
    throw new GatewayContractError("GATEWAY_SECRET_REFERENCE_INVALID");
  return {
    secretId,
    tenantId: input.context.tenantId,
    ...(input.context.productId ? { productId: input.context.productId } : {}),
    environment: input.context.environment,
    purpose,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function redactGatewayAuditDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactGatewayAuditDetails);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    FORBIDDEN_SECRET_KEY.test(key) || /^(prompt|content|transcript|raw)$/i.test(key)
      ? "[REDACTED]"
      : redactGatewayAuditDetails(child),
  ]));
}

export function scopedGatewayIdempotencyKey(input: {
  context: ProductPrincipalContext;
  capabilityId: string;
  key: string;
}): string {
  const raw = [input.context.tenantId, input.context.productId ?? "", input.context.principalId, input.capabilityId, input.key].join("\u001f");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
