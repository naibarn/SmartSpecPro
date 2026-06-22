import crypto from "crypto";

import type { Request } from "express";

import type { TokenClaims } from "../_core/tokens";
import { hasScope, signBearerToken, verifyBearerToken } from "../_core/tokens";
import { isJtiRevoked, revokeJti } from "../_core/revocation";
import {
  getWorkerRuntimeDefinition,
  type WorkerRuntimeType,
  type WorkerScope,
} from "../../shared/workerRuntime";
import {
  getWorkerAccessPermissionScopesForPreset,
  normalizeWorkerAccessPermissionScopes,
  type WorkerAccessPermissionPreset,
  type WorkerAccessPermissionScope,
} from "../../shared/workerAccessKeys";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

export const WORKER_REGISTRATION_AUDIENCE = "smartspec-worker-registration";
export const WORKER_CONTROL_PLANE_AUDIENCE = "smartspec-worker-control-plane";

export type WorkerTokenUse = "worker_registration" | "worker_execution" | "worker_upload" | "worker_refresh";

export interface WorkerRegistrationAuthContext {
  audience: string;
  externalReference: string | null;
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  permissionPreset: WorkerAccessPermissionPreset;
  permissionScopes: WorkerAccessPermissionScope[];
  quotaHourly: number | null;
  quotaDaily: number | null;
  quotaWeekly: number | null;
  quotaMonthly: number | null;
  registeredByUserId: number | null;
  runtimeType: WorkerRuntimeType | null;
  scopes: string[];
  subject: string;
  teamId: string | null;
  tenantId: string;
  tokenUse: "worker_registration";
}

export interface WorkerAccessAuthContext {
  audience: string;
  deviceId?: string | null;
  devicePublicKeyFingerprint?: string | null;
  machineFingerprintHash?: string | null;
  runtimeType: WorkerRuntimeType;
  scopes: WorkerScope[];
  subject: string;
  teamId: string | null;
  tenantId: string;
  tokenUse: "worker_execution" | "worker_upload";
  workerConnectionId?: string | null;
  workerId: string;
}

export interface WorkerDeviceBindingInput {
  deviceId: string;
  machineFingerprint: string;
  publicKey: string;
}

export interface CreateWorkerRegistrationTokenInput {
  externalReference?: string | null;
  llmRoutingMode?: "auto" | "pinned_provider";
  preferredProviderId?: number | null;
  preferredProviderName?: string | null;
  permissionPreset?: WorkerAccessPermissionPreset;
  permissionScopes?: WorkerAccessPermissionScope[];
  quotaHourly?: number | null;
  quotaDaily?: number | null;
  quotaWeekly?: number | null;
  quotaMonthly?: number | null;
  jti?: string;
  registeredByUserId?: number | null;
  runtimeType?: WorkerRuntimeType | null;
  scopes?: WorkerScope[];
  subject?: string;
  teamId?: string | null;
  tenantId: string;
}

export interface IssueWorkerAccessTokensInput {
  connectionId?: string;
  deviceBinding?: WorkerDeviceBindingInput;
  runtimeType: WorkerRuntimeType;
  scopes?: WorkerScope[];
  subject?: string;
  teamId?: string | null;
  tenantId: string;
  workerId: string;
}

export interface VerifyWorkerAccessTokenOptions {
  allowedTokenUses?: Array<Extract<WorkerTokenUse, "worker_execution" | "worker_upload">>;
  requiredScopes?: WorkerScope[];
  requestProof?: WorkerDeviceRequestProof | null;
  runtimeType?: WorkerRuntimeType;
  workerId?: string;
}

type WorkerTokenExpiresIn = Parameters<typeof signBearerToken>[1];

interface WorkerIssuedTokenSet {
  blockedAtMs?: number;
  blockReason?: string;
  jtis: Set<string>;
}

interface NormalizedWorkerDeviceBinding {
  deviceId: string;
  machineFingerprintHash: string;
  publicKey: string;
  publicKeyFingerprint: string;
}

export interface WorkerDeviceRequestProof {
  bodyHash?: string;
  deviceId: string;
  machineFingerprint?: string;
  nonce: string;
  path: string;
  publicKey: string;
  signature: string;
  method: string;
  timestamp: string;
}

export interface RefreshWorkerAccessTokensOptions {
  requestProof?: WorkerDeviceRequestProof | null;
}

const workerIssuedTokenSets = new Map<string, WorkerIssuedTokenSet>();
const workerProofNonces = new Map<string, number>();
const WORKER_PROOF_MAX_SKEW_MS = 5 * 60 * 1000;
const WORKER_CONNECTION_BLOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class WorkerAuthError extends Error {
  code: string;
  statusCode: number;
  type: string;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    type = "auth_error",
  ) {
    super(message);
    this.name = "WorkerAuthError";
    this.code = code;
    this.statusCode = statusCode;
    this.type = type;
  }
}

function normalizeAudience(raw: TokenClaims["aud"]): string[] {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value)).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

function randomJti(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(10).toString("hex")}`;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePublicKey(raw: string): string {
  return raw.trim().replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}

function normalizeDeviceBinding(input?: WorkerDeviceBindingInput): NormalizedWorkerDeviceBinding | null {
  if (!input) {
    return null;
  }
  const deviceId = input.deviceId.trim();
  const machineFingerprint = input.machineFingerprint.trim();
  const publicKey = normalizePublicKey(input.publicKey);
  if (!deviceId || !machineFingerprint || !publicKey) {
    throw new Error("deviceId, machineFingerprint, and publicKey are required for worker device binding");
  }
  return {
    deviceId,
    machineFingerprintHash: sha256Hex(machineFingerprint),
    publicKey,
    publicKeyFingerprint: sha256Hex(publicKey),
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
}

function hashRequestBody(body: unknown): string {
  return sha256Hex(stableJson(body ?? {}));
}

function tokenExpiryMs(claims: TokenClaims): number {
  return typeof claims.exp === "number" ? claims.exp * 1000 : Date.now() + 60 * 60 * 1000;
}

function rememberIssuedTokenSet(connectionId: string, jtis: string[]): void {
  const existing = workerIssuedTokenSets.get(connectionId) ?? { jtis: new Set<string>() };
  for (const jti of jtis) {
    if (jti) {
      existing.jtis.add(jti);
    }
  }
  workerIssuedTokenSets.set(connectionId, existing);
}

async function blockWorkerConnection(claims: TokenClaims, reason: string): Promise<void> {
  const connectionId = String(claims.workerConnectionId || "");
  const currentJti = String(claims.jti || "");
  const expiresAtMs = tokenExpiryMs(claims);
  if (connectionId) {
    const existing = workerIssuedTokenSets.get(connectionId) ?? { jtis: new Set<string>() };
    existing.blockedAtMs = Date.now();
    existing.blockReason = reason;
    if (currentJti) {
      existing.jtis.add(currentJti);
    }
    workerIssuedTokenSets.set(connectionId, existing);
    await Promise.all([
      revokeJti(`worker_connection:${connectionId}`, Math.max(expiresAtMs, Date.now() + WORKER_CONNECTION_BLOCK_TTL_MS)),
      ...[...existing.jtis].map((jti) => revokeJti(jti, expiresAtMs)),
    ]);
    return;
  }
  if (currentJti) {
    await revokeJti(currentJti, expiresAtMs);
  }
}

async function assertConnectionNotBlocked(claims: TokenClaims): Promise<void> {
  const connectionId = String(claims.workerConnectionId || "");
  if (!connectionId) {
    return;
  }
  const state = workerIssuedTokenSets.get(connectionId);
  const redisBackedBlocked = await isJtiRevoked(`worker_connection:${connectionId}`);
  if (state?.blockedAtMs || redisBackedBlocked) {
    throw new WorkerAuthError(
      "worker_connection_blocked",
      401,
      "Worker connection is blocked and must be paired again",
    );
  }
}

function canonicalWorkerProofPayload(input: {
  bodyHash: string;
  jti: string;
  method: string;
  nonce: string;
  path: string;
  timestamp: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.jti,
    input.timestamp,
    input.nonce,
    input.bodyHash,
  ].join("\n");
}

function verifySignature(publicKey: string, payload: string, signature: string): boolean {
  try {
    const verifier = crypto.createVerify("sha256");
    verifier.update(payload);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function cleanupProofNonces(): void {
  const now = Date.now();
  for (const [key, expiresAt] of workerProofNonces.entries()) {
    if (expiresAt <= now) {
      workerProofNonces.delete(key);
    }
  }
}

async function assertDeviceProof(claims: TokenClaims, proof: WorkerDeviceRequestProof | null | undefined): Promise<void> {
  const expectedDeviceId = String(claims.deviceId || "");
  const expectedPublicKey = claims.devicePublicKey ? normalizePublicKey(String(claims.devicePublicKey)) : "";
  const expectedPublicKeyFingerprint = String(claims.devicePublicKeyFingerprint || "");
  const expectedMachineFingerprintHash = String(claims.machineFingerprintHash || "");
  if (!expectedDeviceId && !expectedPublicKeyFingerprint && !expectedMachineFingerprintHash) {
    return;
  }
  if (!proof) {
    await blockWorkerConnection(claims, "missing_device_proof");
    throw new WorkerAuthError("worker_device_mismatch", 401, "Worker device proof is required");
  }

  const providedPublicKey = normalizePublicKey(proof.publicKey);
  const providedMachineFingerprintHash = proof.machineFingerprint
    ? (/^[a-f0-9]{64}$/i.test(proof.machineFingerprint.trim())
        ? proof.machineFingerprint.trim().toLowerCase()
        : sha256Hex(proof.machineFingerprint.trim()))
    : "";
  if (
    proof.deviceId !== expectedDeviceId
    || sha256Hex(providedPublicKey) !== expectedPublicKeyFingerprint
    || (expectedMachineFingerprintHash && providedMachineFingerprintHash && providedMachineFingerprintHash !== expectedMachineFingerprintHash)
  ) {
    await blockWorkerConnection(claims, "device_binding_mismatch");
    throw new WorkerAuthError("worker_device_mismatch", 401, "Worker token was used from a different device");
  }

  const timestampMs = Date.parse(proof.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > WORKER_PROOF_MAX_SKEW_MS) {
    await blockWorkerConnection(claims, "stale_device_proof");
    throw new WorkerAuthError("worker_device_mismatch", 401, "Worker device proof timestamp is invalid");
  }
  const jti = String(claims.jti || "");
  const nonceKey = `${String(claims.workerConnectionId || jti)}:${jti}:${proof.nonce}`;
  cleanupProofNonces();
  if (workerProofNonces.has(nonceKey)) {
    await blockWorkerConnection(claims, "replayed_device_proof");
    throw new WorkerAuthError("worker_device_mismatch", 401, "Worker device proof was replayed");
  }

  const payload = canonicalWorkerProofPayload({
    bodyHash: proof.bodyHash || hashRequestBody({}),
    jti,
    method: proof.method,
    nonce: proof.nonce,
    path: proof.path,
    timestamp: proof.timestamp,
  });
  if (!verifySignature(expectedPublicKey || providedPublicKey, payload, proof.signature)) {
    await blockWorkerConnection(claims, "invalid_device_signature");
    throw new WorkerAuthError("worker_device_mismatch", 401, "Worker device proof signature is invalid");
  }
  workerProofNonces.set(nonceKey, Date.now() + WORKER_PROOF_MAX_SKEW_MS);
}

export function extractWorkerDeviceProofFromRequest(
  req: Pick<Request, "body" | "headers" | "method" | "originalUrl" | "path" | "url">,
): WorkerDeviceRequestProof | null {
  const deviceId = String(req.headers["x-worker-device-id"] || "").trim();
  const publicKey = String(req.headers["x-worker-device-public-key"] || "").trim();
  const nonce = String(req.headers["x-worker-device-nonce"] || "").trim();
  const timestamp = String(req.headers["x-worker-device-timestamp"] || "").trim();
  const signature = String(req.headers["x-worker-device-signature"] || "").trim();
  if (!deviceId && !publicKey && !nonce && !timestamp && !signature) {
    return null;
  }
  return {
    bodyHash: String(req.headers["x-worker-body-sha256"] || hashRequestBody(req.body ?? {})).trim(),
    deviceId,
    machineFingerprint: String(req.headers["x-worker-machine-fingerprint"] || "").trim() || undefined,
    nonce,
    path: String(req.originalUrl || req.path || req.url || ""),
    publicKey,
    signature,
    method: String(req.method || "GET").toUpperCase(),
    timestamp,
  };
}

async function assertTenantFeatureEnabled(
  tenantId: string,
  runtimeType: WorkerRuntimeType | null,
): Promise<void> {
  if (!runtimeType) {
    throw new WorkerAuthError(
      "worker_auth_invalid",
      401,
      "Worker token is missing runtime binding",
    );
  }

  const runtimeDefinition = getWorkerRuntimeDefinition(runtimeType);
  const flags = await getTenantFeatureFlags(tenantId);
  const rolloutEnabled = Boolean(flags[runtimeDefinition.featureFlag as keyof typeof flags]);
  if (!rolloutEnabled) {
    throw new WorkerAuthError(
      "feature_disabled",
      403,
      `${runtimeDefinition.displayName} is disabled for this tenant`,
    );
  }
}

async function verifyBaseWorkerToken(token: string): Promise<TokenClaims> {
  let claims: TokenClaims;
  try {
    claims = await verifyBearerToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid token";
    throw new WorkerAuthError("worker_auth_invalid", 401, message);
  }

  const jti = String(claims.jti || "");
  if (jti) {
    const revoked = await isJtiRevoked(jti);
    if (revoked) {
      throw new WorkerAuthError("worker_auth_invalid", 401, "Worker token has been revoked");
    }
  }

  return claims;
}

function assertAudience(claims: TokenClaims, requiredAudience: string): string {
  const audiences = normalizeAudience(claims.aud);
  if (!audiences.includes(requiredAudience)) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker token audience is invalid");
  }
  return requiredAudience;
}

export function extractBearerTokenFromRequest(
  req: Pick<Request, "headers">,
): string | null {
  const header = String(req.headers.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

export function createWorkerRegistrationToken(
  input: CreateWorkerRegistrationTokenInput,
  expiresIn: WorkerTokenExpiresIn | null = "30m",
): string {
  const llmRoutingMode = input.llmRoutingMode ?? "auto";
  const preferredProviderId = input.preferredProviderId ?? null;
  const preferredProviderName = input.preferredProviderName ?? null;
  const permissionPreset = input.permissionPreset ?? "readonly";
  const permissionScopes = permissionPreset === "custom"
    ? normalizeWorkerAccessPermissionScopes(input.permissionScopes)
    : getWorkerAccessPermissionScopesForPreset(permissionPreset);
  if (llmRoutingMode === "pinned_provider" && !preferredProviderId) {
    throw new Error("preferredProviderId is required when llmRoutingMode is pinned_provider");
  }
  if (preferredProviderId != null && llmRoutingMode !== "pinned_provider") {
    throw new Error("llmRoutingMode must be pinned_provider when preferredProviderId is set");
  }
  if (permissionPreset === "custom" && permissionScopes.length === 0) {
    throw new Error("permissionScopes are required when permissionPreset is custom");
  }
  return signBearerToken(
    {
      sub: input.subject ?? `worker-bootstrap:${input.tenantId}`,
      type: "access",
      aud: WORKER_REGISTRATION_AUDIENCE,
      tokenUse: "worker_registration",
      scopes: input.scopes ?? ["workers:register"],
      tenantId: input.tenantId,
      teamId: input.teamId ?? undefined,
      runtimeType: input.runtimeType ?? undefined,
      registeredByUserId: input.registeredByUserId ?? undefined,
      externalReference: input.externalReference ?? undefined,
      llmRoutingMode,
      preferredProviderId: preferredProviderId ?? undefined,
      preferredProviderName: preferredProviderName ?? undefined,
      permissionPreset,
      permissionScopes,
      quotaHourly: input.quotaHourly ?? null,
      quotaDaily: input.quotaDaily ?? null,
      quotaWeekly: input.quotaWeekly ?? null,
      quotaMonthly: input.quotaMonthly ?? null,
      jti: input.jti ?? randomJti("worker_register"),
    },
    expiresIn ?? undefined,
  );
}

export function issueWorkerAccessTokens(
  input: IssueWorkerAccessTokensInput,
  executionExpiresIn: WorkerTokenExpiresIn = "8h",
  uploadExpiresIn: WorkerTokenExpiresIn = "2h",
  refreshExpiresIn: WorkerTokenExpiresIn = "7d",
): { executionToken: string; uploadToken: string; refreshToken: string } {
  const executionScopes = input.scopes ?? [
    "workers:heartbeat",
    "workers:claim",
    "workers:report",
    "workers:diagnostics",
  ];
  const connectionId = input.connectionId ?? randomJti("worker_conn");
  const tokenSetId = randomJti("worker_token_set");
  const deviceBinding = normalizeDeviceBinding(input.deviceBinding);
  const executionJti = randomJti("worker_exec");
  const uploadJti = randomJti("worker_upload");
  const refreshJti = randomJti("worker_refresh");
  const baseClaims = {
    sub: input.subject ?? `worker:${input.workerId}`,
    type: "access" as const,
    aud: WORKER_CONTROL_PLANE_AUDIENCE,
    tenantId: input.tenantId,
    teamId: input.teamId ?? undefined,
    workerId: input.workerId,
    workerConnectionId: connectionId,
    workerTokenSetId: tokenSetId,
    runtimeType: input.runtimeType,
    deviceId: deviceBinding?.deviceId,
    machineFingerprintHash: deviceBinding?.machineFingerprintHash,
    devicePublicKey: deviceBinding?.publicKey,
    devicePublicKeyFingerprint: deviceBinding?.publicKeyFingerprint,
  };
  rememberIssuedTokenSet(connectionId, [executionJti, uploadJti, refreshJti]);

  return {
    executionToken: signBearerToken(
      {
        ...baseClaims,
        tokenUse: "worker_execution",
        scopes: executionScopes,
        jti: executionJti,
      },
      executionExpiresIn,
    ),
    uploadToken: signBearerToken(
      {
        ...baseClaims,
        tokenUse: "worker_upload",
        scopes: ["workers:report"],
        jti: uploadJti,
      },
      uploadExpiresIn,
    ),
    refreshToken: signBearerToken(
      {
        ...baseClaims,
        type: "refresh" as const,
        tokenUse: "worker_refresh",
        scopes: executionScopes,
        jti: refreshJti,
      },
      refreshExpiresIn,
    ),
  };
}

export async function refreshWorkerAccessTokens(
  refreshToken: string,
  opts: RefreshWorkerAccessTokensOptions = {},
): Promise<{ executionToken: string; uploadToken: string; refreshToken: string }> {
  const claims = await verifyBaseWorkerToken(refreshToken);
  assertAudience(claims, WORKER_CONTROL_PLANE_AUDIENCE);
  await assertConnectionNotBlocked(claims);
  if (String(claims.tokenUse || "") !== "worker_refresh" || claims.type !== "refresh") {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker refresh token is invalid");
  }
  await assertDeviceProof(claims, opts.requestProof);
  const tenantId = String(claims.tenantId || "");
  const workerId = String(claims.workerId || "");
  const runtimeType = String(claims.runtimeType || "") as WorkerRuntimeType;
  if (!tenantId || !workerId || !runtimeType) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker refresh token is missing worker binding");
  }
  await revokeJti(String(claims.jti || ""), tokenExpiryMs(claims));
  const scopes = (Array.isArray(claims.scopes) ? claims.scopes : []) as WorkerScope[];
  return issueWorkerAccessTokens({
    connectionId: String(claims.workerConnectionId || randomJti("worker_conn")),
    deviceBinding: claims.deviceId && claims.machineFingerprintHash && claims.devicePublicKey
      ? {
          deviceId: String(claims.deviceId),
          machineFingerprint: String(claims.machineFingerprintHash),
          publicKey: String(claims.devicePublicKey),
        }
      : undefined,
    runtimeType,
    scopes,
    subject: String(claims.sub || ""),
    teamId: claims.teamId ? String(claims.teamId) : null,
    tenantId,
    workerId,
  });
}

export async function verifyWorkerRegistrationToken(
  token: string,
  opts: { runtimeType?: WorkerRuntimeType } = {},
): Promise<WorkerRegistrationAuthContext> {
  const claims = await verifyBaseWorkerToken(token);
  const audience = assertAudience(claims, WORKER_REGISTRATION_AUDIENCE);
  const tokenUse = String(claims.tokenUse || "");
  const tenantId = String(claims.tenantId || "");
  const runtimeType = claims.runtimeType ? String(claims.runtimeType) as WorkerRuntimeType : null;
  const scopes = Array.isArray(claims.scopes) ? claims.scopes : [];

  if (tokenUse !== "worker_registration") {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker registration token is invalid");
  }
  if (!tenantId) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker registration token is missing tenant binding");
  }
  if (!hasScope(scopes, "workers:register")) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker registration token lacks workers:register");
  }
  if (opts.runtimeType && runtimeType && runtimeType !== opts.runtimeType) {
    throw new WorkerAuthError("worker_scope_mismatch", 403, "Worker registration token runtime does not match request");
  }

  await assertTenantFeatureEnabled(tenantId, opts.runtimeType ?? runtimeType);

  return {
    audience,
    externalReference: claims.externalReference ? String(claims.externalReference) : null,
    llmRoutingMode: claims.llmRoutingMode === "pinned_provider" ? "pinned_provider" : "auto",
    preferredProviderId: typeof claims.preferredProviderId === "number" ? claims.preferredProviderId : null,
    preferredProviderName: typeof claims.preferredProviderName === "string" ? claims.preferredProviderName : null,
    permissionPreset:
      typeof claims.permissionPreset === "string"
        && (claims.permissionPreset === "custom"
          || claims.permissionPreset === "readonly"
          || claims.permissionPreset === "operator_basic"
          || claims.permissionPreset === "content_worker"
          || claims.permissionPreset === "knowledge_worker"
          || claims.permissionPreset === "work_os_worker"
          || claims.permissionPreset === "full_personal_worker")
        ? claims.permissionPreset
        : "readonly",
    permissionScopes: (() => {
      const preset =
        typeof claims.permissionPreset === "string"
          && (claims.permissionPreset === "custom"
            || claims.permissionPreset === "readonly"
            || claims.permissionPreset === "operator_basic"
            || claims.permissionPreset === "content_worker"
            || claims.permissionPreset === "knowledge_worker"
            || claims.permissionPreset === "work_os_worker"
            || claims.permissionPreset === "full_personal_worker")
          ? claims.permissionPreset
          : "readonly";
      const scopes = normalizeWorkerAccessPermissionScopes(claims.permissionScopes);
      if (scopes.length > 0) {
        return scopes;
      }
      return preset === "custom"
        ? []
        : getWorkerAccessPermissionScopesForPreset(preset);
    })(),
    quotaHourly: Number.isFinite(Number(claims.quotaHourly)) ? Number(claims.quotaHourly) : null,
    quotaDaily: Number.isFinite(Number(claims.quotaDaily)) ? Number(claims.quotaDaily) : null,
    quotaWeekly: Number.isFinite(Number(claims.quotaWeekly)) ? Number(claims.quotaWeekly) : null,
    quotaMonthly: Number.isFinite(Number(claims.quotaMonthly)) ? Number(claims.quotaMonthly) : null,
    registeredByUserId:
      typeof claims.registeredByUserId === "number" ? claims.registeredByUserId : null,
    runtimeType,
    scopes,
    subject: String(claims.sub || ""),
    teamId: claims.teamId ? String(claims.teamId) : null,
    tenantId,
    tokenUse: "worker_registration",
  };
}

export async function verifyWorkerAccessToken(
  token: string,
  opts: VerifyWorkerAccessTokenOptions = {},
): Promise<WorkerAccessAuthContext> {
  const claims = await verifyBaseWorkerToken(token);
  const audience = assertAudience(claims, WORKER_CONTROL_PLANE_AUDIENCE);
  await assertConnectionNotBlocked(claims);
  const tokenUse = String(claims.tokenUse || "") as WorkerTokenUse;
  const tenantId = String(claims.tenantId || "");
  const workerId = String(claims.workerId || "");
  const runtimeType = String(claims.runtimeType || "") as WorkerRuntimeType;
  const scopes = (Array.isArray(claims.scopes) ? claims.scopes : []) as WorkerScope[];
  const allowedTokenUses = opts.allowedTokenUses ?? ["worker_execution", "worker_upload"];

  if (!allowedTokenUses.includes(tokenUse as any)) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker access token type is invalid");
  }
  if (!tenantId || !workerId || !runtimeType) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker access token is missing worker binding");
  }
  if (opts.workerId && workerId !== opts.workerId) {
    throw new WorkerAuthError("worker_scope_mismatch", 403, "Worker token does not match the requested worker");
  }
  if (opts.runtimeType && runtimeType !== opts.runtimeType) {
    throw new WorkerAuthError("worker_scope_mismatch", 403, "Worker token runtime does not match the requested runtime");
  }
  for (const requiredScope of opts.requiredScopes ?? []) {
    if (!hasScope(scopes, requiredScope)) {
      throw new WorkerAuthError("worker_auth_invalid", 401, `Worker token lacks ${requiredScope}`);
    }
  }

  await assertTenantFeatureEnabled(tenantId, runtimeType);
  await assertDeviceProof(claims, opts.requestProof);

  return {
    audience,
    deviceId: claims.deviceId ? String(claims.deviceId) : null,
    devicePublicKeyFingerprint: claims.devicePublicKeyFingerprint ? String(claims.devicePublicKeyFingerprint) : null,
    machineFingerprintHash: claims.machineFingerprintHash ? String(claims.machineFingerprintHash) : null,
    runtimeType,
    scopes,
    subject: String(claims.sub || ""),
    teamId: claims.teamId ? String(claims.teamId) : null,
    tenantId,
    tokenUse: tokenUse as "worker_execution" | "worker_upload",
    workerConnectionId: claims.workerConnectionId ? String(claims.workerConnectionId) : null,
    workerId,
  };
}

export async function signWorkerDeviceProofForTest(input: {
  body?: unknown;
  bodyHash?: string;
  method: string;
  nonce: string;
  path: string;
  privateKey: CryptoKey;
  publicKey?: string;
  timestamp?: string;
  token: string;
}): Promise<WorkerDeviceRequestProof> {
  const claims = await verifyBearerToken(input.token);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const bodyHash = input.bodyHash ?? hashRequestBody(input.body ?? {});
  const payload = canonicalWorkerProofPayload({
    bodyHash,
    jti: String(claims.jti || ""),
    method: input.method,
    nonce: input.nonce,
    path: input.path,
    timestamp,
  });
  const pkcs8 = await crypto.webcrypto.subtle.exportKey("pkcs8", input.privateKey);
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(pkcs8),
    format: "der",
    type: "pkcs8",
  });
  const signer = crypto.createSign("sha256");
  signer.update(payload);
  signer.end();
  return {
    bodyHash,
    deviceId: String(claims.deviceId || ""),
    machineFingerprint: claims.machineFingerprintHash ? String(claims.machineFingerprintHash) : undefined,
    nonce: input.nonce,
    path: input.path,
    publicKey: input.publicKey ?? String(claims.devicePublicKey || ""),
    signature: signer.sign(privateKey).toString("base64"),
    method: input.method.toUpperCase(),
    timestamp,
  };
}

export function resetWorkerDeviceBindingStateForTest(): void {
  workerIssuedTokenSets.clear();
  workerProofNonces.clear();
}
