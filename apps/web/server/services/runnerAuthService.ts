import crypto from "crypto";
import type { Request } from "express";

import type { TokenClaims } from "../_core/tokens";
import { hasScope, signBearerToken, verifyBearerToken } from "../_core/tokens";
import { isJtiRevoked, revokeJti } from "../_core/revocation";
import { getCacheClient } from "./redisClients";

export const RUNNER_CONTROL_PLANE_AUDIENCE = "smartspec-runner-control-plane";
export const RUNNER_REGISTRATION_AUDIENCE = "smartspec-runner-registration";
/** Compatibility name for callers that still call the bootstrap flow enrollment. */
export const RUNNER_ENROLLMENT_AUDIENCE = RUNNER_REGISTRATION_AUDIENCE;
export type RunnerTokenUse =
  | "runner_registration"
  | "runner_execution"
  | "runner_upload"
  | "runner_refresh"
  | "runner_control";

type RunnerProfile = "local_device" | "shared_container";
type RunnerNodeKind = "local_device" | "managed_container";
type RunnerTokenSet = {
  executionToken: string;
  uploadToken: string;
  refreshToken: string;
};

const RUNNER_REFRESH_GRACE_MS = 60 * 1000;
const RUNNER_REFRESH_GRACE_REDIS_PREFIX = "runner:refresh-grace:";

type RunnerRefreshGraceEntry = {
  expiresAtMs: number;
  tokens: RunnerTokenSet;
};

const runnerRefreshGrace = new Map<string, RunnerRefreshGraceEntry>();

function pruneRunnerRefreshGrace(now: number): void {
  for (const [jti, entry] of runnerRefreshGrace.entries()) {
    if (entry.expiresAtMs <= now) runnerRefreshGrace.delete(jti);
  }
}

function hasRunnerRefreshGraceRedis(): boolean {
  return Boolean(
    process.env.REDIS_UPSTASH_URL ||
    process.env.REDIS_CLOUD_URL ||
    process.env.REDIS_URL
  );
}

function runnerRefreshGraceKey(jti: string): string {
  return `${RUNNER_REFRESH_GRACE_REDIS_PREFIX}${crypto
    .createHash("sha256")
    .update(jti)
    .digest("hex")}`;
}

async function readDistributedRunnerRefreshGrace(
  jti: string
): Promise<RunnerTokenSet | null> {
  if (!jti || !hasRunnerRefreshGraceRedis()) return null;
  try {
    const raw = await getCacheClient().get(runnerRefreshGraceKey(jti));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunnerTokenSet>;
    if (
      typeof parsed.executionToken !== "string" ||
      typeof parsed.uploadToken !== "string" ||
      typeof parsed.refreshToken !== "string"
    )
      return null;
    return {
      executionToken: parsed.executionToken,
      uploadToken: parsed.uploadToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}

async function persistDistributedRunnerRefreshGrace(
  jti: string,
  tokens: RunnerTokenSet
): Promise<RunnerTokenSet> {
  if (!jti || !hasRunnerRefreshGraceRedis()) return tokens;
  try {
    const stored = await getCacheClient().set(
      runnerRefreshGraceKey(jti),
      JSON.stringify(tokens),
      "EX",
      Math.ceil(RUNNER_REFRESH_GRACE_MS / 1000),
      "NX"
    );
    if (stored === "OK") return tokens;
    return (await readDistributedRunnerRefreshGrace(jti)) ?? tokens;
  } catch {
    return tokens;
  }
}

/** Test seam for proving replay denial after the bounded grace state is removed. */
export function __clearRunnerRefreshGraceForTests(): void {
  runnerRefreshGrace.clear();
}

export class RunnerAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "RunnerAuthError";
  }
}

type RunnerTokenContext = {
  audience: string;
  runnerId: string;
  tenantId: string;
  subject: string;
  profile: RunnerProfile;
  nodeKind: RunnerNodeKind;
  deviceId: string | null;
  devicePublicKey: string | null;
  devicePublicKeyFingerprint: string | null;
  machineFingerprintHash: string | null;
  scopes: string[];
  tokenUse: RunnerTokenUse;
  ownerUserId: number | null;
  runnerSessionId: string | null;
};

type RunnerTokenExpectation = {
  runnerId?: string;
  tenantId?: string;
  runnerSessionId?: string;
  requiredScopes?: string[];
  requestProof?: RunnerDeviceRequestProof | null;
};

export type RunnerDeviceBindingInput = {
  deviceId: string;
  machineFingerprint: string;
  publicKey: string;
};

export type RunnerDeviceRequestProof = {
  bodyHash: string;
  deviceId: string;
  machineFingerprint?: string;
  nonce: string;
  path: string;
  publicKey: string;
  signature: string;
  method: string;
  timestamp: string;
};

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePublicKey(raw: string): string {
  const normalized = raw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (!normalized) return normalized;
  try {
    crypto.createPublicKey(normalized);
  } catch {
    throw new Error("runner_device_public_key_invalid");
  }
  return normalized;
}

function normalizeRunnerDeviceBinding(input?: RunnerDeviceBindingInput): {
  deviceId: string;
  machineFingerprintHash: string;
  publicKey: string;
  publicKeyFingerprint: string;
} | null {
  if (!input) return null;
  const deviceId = input.deviceId.trim();
  const machineFingerprint = input.machineFingerprint.trim();
  const publicKey = normalizePublicKey(input.publicKey);
  if (!deviceId || !machineFingerprint || !publicKey)
    throw new Error(
      "deviceId, machineFingerprint, and publicKey are required for runner device binding"
    );
  const machineFingerprintHash = /^[a-f0-9]{64}$/i.test(machineFingerprint)
    ? machineFingerprint.toLowerCase()
    : sha256Hex(machineFingerprint);
  return {
    deviceId,
    machineFingerprintHash,
    publicKey,
    publicKeyFingerprint: sha256Hex(publicKey),
  };
}

function runnerDeviceClaims(
  profile: RunnerProfile,
  deviceBinding?: RunnerDeviceBindingInput
): Record<string, string> {
  if (profile === "shared_container" && deviceBinding) {
    throw new Error(
      "Shared Container Runner cannot carry a local device binding"
    );
  }
  const binding = normalizeRunnerDeviceBinding(deviceBinding);
  if (!binding) return {};
  return {
    deviceId: binding.deviceId,
    machineFingerprintHash: binding.machineFingerprintHash,
    devicePublicKey: binding.publicKey,
    devicePublicKeyFingerprint: binding.publicKeyFingerprint,
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function hashRequestBody(body: unknown): string {
  return sha256Hex(stableJson(body ?? {}));
}

export function runnerDeviceProofPayload(input: {
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

function verifyRunnerSignature(
  publicKey: string,
  payload: string,
  signature: string
): boolean {
  try {
    const verifier = crypto.createVerify("sha256");
    verifier.update(payload);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

const runnerProofNonces = new Map<string, number>();

function cleanupRunnerProofNonces(): void {
  const now = Date.now();
  for (const [key, expiresAt] of runnerProofNonces.entries()) {
    if (expiresAt <= now) runnerProofNonces.delete(key);
  }
}

function hasRunnerProofRedis(): boolean {
  return Boolean(
    process.env.REDIS_UPSTASH_URL ||
    process.env.REDIS_CLOUD_URL ||
    process.env.REDIS_URL
  );
}

async function assertRunnerDeviceProof(
  claims: TokenClaims,
  proof: RunnerDeviceRequestProof | null | undefined
): Promise<void> {
  const expectedDeviceId = String(claims.deviceId || "");
  const expectedPublicKey = normalizePublicKey(
    String(claims.devicePublicKey || "")
  );
  const expectedPublicKeyFingerprint = String(
    claims.devicePublicKeyFingerprint || ""
  );
  const expectedMachineFingerprintHash = String(
    claims.machineFingerprintHash || ""
  );
  if (!expectedDeviceId || !expectedPublicKeyFingerprint) {
    throw new RunnerAuthError(
      "runner_device_binding_missing",
      401,
      "Runner device binding is missing"
    );
  }
  if (!proof)
    throw new RunnerAuthError(
      "runner_device_proof_required",
      401,
      "Runner device proof is required"
    );
  const publicKey = normalizePublicKey(proof.publicKey);
  const fingerprint = sha256Hex(publicKey);
  const machineFingerprintHash = proof.machineFingerprint
    ? /^[a-f0-9]{64}$/i.test(proof.machineFingerprint.trim())
      ? proof.machineFingerprint.trim().toLowerCase()
      : sha256Hex(proof.machineFingerprint.trim())
    : "";
  if (
    proof.deviceId !== expectedDeviceId ||
    fingerprint !== expectedPublicKeyFingerprint ||
    (expectedMachineFingerprintHash &&
      machineFingerprintHash !== expectedMachineFingerprintHash)
  )
    throw new RunnerAuthError(
      "runner_device_mismatch",
      401,
      "Runner device proof does not match the enrolled device"
    );
  const timestampMs = Date.parse(proof.timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000
  )
    throw new RunnerAuthError(
      "runner_device_mismatch",
      401,
      "Runner device proof timestamp is invalid"
    );
  const jti = String(claims.jti || "");
  const nonceKey = `${jti}:${proof.nonce}`;
  const payload = runnerDeviceProofPayload({
    bodyHash: proof.bodyHash || hashRequestBody({}),
    jti,
    method: proof.method,
    nonce: proof.nonce,
    path: proof.path,
    timestamp: proof.timestamp,
  });
  if (!verifyRunnerSignature(expectedPublicKey, payload, proof.signature)) {
    throw new RunnerAuthError(
      "runner_device_mismatch",
      401,
      "Runner device proof signature is invalid"
    );
  }
  if (hasRunnerProofRedis()) {
    try {
      const consumed = await getCacheClient().set(
        `runner:device-proof:nonce:${sha256Hex(nonceKey)}`,
        "1",
        "EX",
        300,
        "NX"
      );
      if (consumed !== "OK")
        throw new RunnerAuthError(
          "runner_device_mismatch",
          401,
          "Runner device proof was replayed"
        );
    } catch (error) {
      if (error instanceof RunnerAuthError) throw error;
      throw new RunnerAuthError(
        "runner_proof_unavailable",
        503,
        "Runner proof replay protection is temporarily unavailable"
      );
    }
  } else {
    cleanupRunnerProofNonces();
    if (runnerProofNonces.has(nonceKey))
      throw new RunnerAuthError(
        "runner_device_mismatch",
        401,
        "Runner device proof was replayed"
      );
    runnerProofNonces.set(nonceKey, Date.now() + 5 * 60 * 1000);
  }
}

export function extractRunnerDeviceProofFromRequest(
  req: Pick<
    Request,
    "body" | "headers" | "method" | "originalUrl" | "path" | "url"
  >
): RunnerDeviceRequestProof | null {
  const deviceId = String(req.headers["x-runner-device-id"] || "").trim();
  const publicKey = String(
    req.headers["x-runner-device-public-key"] || ""
  ).trim();
  const nonce = String(req.headers["x-runner-device-nonce"] || "").trim();
  const timestamp = String(
    req.headers["x-runner-device-timestamp"] || ""
  ).trim();
  const signature = String(
    req.headers["x-runner-device-signature"] || ""
  ).trim();
  if (!deviceId && !publicKey && !nonce && !timestamp && !signature)
    return null;
  return {
    // Never trust the client-supplied body hash. Recompute it from the parsed
    // request so the signature is bound to the request the server will apply.
    bodyHash: hashRequestBody(req.body ?? {}),
    deviceId,
    machineFingerprint:
      String(req.headers["x-runner-machine-fingerprint"] || "").trim() ||
      undefined,
    nonce,
    path: String(req.originalUrl || req.path || req.url || ""),
    publicKey,
    signature,
    method: String(req.method || "GET").toUpperCase(),
    timestamp,
  };
}

export type RunnerAuthContext = RunnerTokenContext & {
  tokenUse: "runner_control";
};
export type RunnerRegistrationContext = RunnerTokenContext & {
  tokenUse: "runner_registration";
};
export type RunnerAccessAuthContext = RunnerTokenContext & {
  tokenUse: "runner_execution" | "runner_upload";
};
export type RunnerRefreshAuthContext = RunnerTokenContext & {
  tokenUse: "runner_refresh";
};

export function extractRunnerBearerToken(
  req: Pick<Request, "headers">
): string | null {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

export function createRunnerControlToken(
  input: {
    runnerId: string;
    tenantId: string;
    subject?: string;
    profile: RunnerProfile;
    nodeKind: RunnerNodeKind;
    scopes?: string[];
    deviceBinding?: RunnerDeviceBindingInput;
    runnerSessionId?: string;
  },
  expiresIn: "5m" | "15m" | "1h" = "15m"
): string {
  return signBearerToken(
    {
      sub: input.subject ?? input.runnerId,
      tenantId: input.tenantId,
      runnerId: input.runnerId,
      runnerProfile: input.profile,
      runnerNodeKind: input.nodeKind,
      ...runnerDeviceClaims(input.profile, input.deviceBinding),
      ...(input.runnerSessionId ? { runnerSessionId: input.runnerSessionId } : {}),
      aud: RUNNER_CONTROL_PLANE_AUDIENCE,
      tokenUse: "runner_control",
      scopes: input.scopes ?? [
        "runner:heartbeat",
        "runner:capabilities",
        "runner:status",
        "runner:update",
      ],
      jti: `runner_control_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    expiresIn
  );
}

export function createRunnerRegistrationToken(input: {
  runnerId: string;
  tenantId: string;
  subject?: string;
  profile: RunnerProfile;
  nodeKind: RunnerNodeKind;
  scopes?: string[];
  deviceBinding?: RunnerDeviceBindingInput;
  ownerUserId?: number | null;
  runnerSessionId?: string;
}): string {
  return signBearerToken(
    {
      sub: input.subject ?? input.runnerId,
      tenantId: input.tenantId,
      runnerId: input.runnerId,
      runnerProfile: input.profile,
      runnerNodeKind: input.nodeKind,
      ...runnerDeviceClaims(input.profile, input.deviceBinding),
      ...(input.runnerSessionId ? { runnerSessionId: input.runnerSessionId } : {}),
      ...(input.ownerUserId ? { runnerOwnerUserId: input.ownerUserId } : {}),
      aud: RUNNER_REGISTRATION_AUDIENCE,
      tokenUse: "runner_registration",
      scopes: input.scopes ?? ["runner:enroll"],
      jti: `runner_registration_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m"
  );
}

export function issueRunnerAccessTokens(input: {
  runnerId: string;
  tenantId: string;
  subject?: string;
  profile: RunnerProfile;
  nodeKind: RunnerNodeKind;
  scopes?: string[];
  deviceBinding?: RunnerDeviceBindingInput;
  runnerSessionId?: string;
}): { executionToken: string; uploadToken: string; refreshToken: string } {
  const base = {
    sub: input.subject ?? input.runnerId,
    tenantId: input.tenantId,
    runnerId: input.runnerId,
    runnerProfile: input.profile,
    runnerNodeKind: input.nodeKind,
    ...runnerDeviceClaims(input.profile, input.deviceBinding),
    ...(input.runnerSessionId ? { runnerSessionId: input.runnerSessionId } : {}),
    aud: RUNNER_CONTROL_PLANE_AUDIENCE,
    scopes: input.scopes ?? ["runner:execute", "runner:upload"],
  } as const;
  return {
    executionToken: signBearerToken(
      {
        ...base,
        tokenUse: "runner_execution",
        jti: `runner_execution_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
      },
      "15m"
    ),
    uploadToken: signBearerToken(
      {
        ...base,
        tokenUse: "runner_upload",
        jti: `runner_upload_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
      },
      "15m"
    ),
    refreshToken: signBearerToken(
      {
        ...base,
        tokenUse: "runner_refresh",
        type: "refresh",
        jti: `runner_refresh_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
      },
      "7d"
    ),
  };
}

export async function verifyRunnerControlToken(
  token: string,
  expected?: RunnerTokenExpectation
): Promise<RunnerAuthContext> {
  return (await verifyRunnerToken(token, {
    audience: RUNNER_CONTROL_PLANE_AUDIENCE,
    tokenUses: ["runner_control"],
    expected,
  })) as RunnerAuthContext;
}

export async function verifyRunnerRegistrationToken(
  token: string,
  expected?: RunnerTokenExpectation
): Promise<RunnerRegistrationContext> {
  return (await verifyRunnerToken(token, {
    audience: RUNNER_REGISTRATION_AUDIENCE,
    tokenUses: ["runner_registration"],
    expected,
  })) as RunnerRegistrationContext;
}

export async function verifyRunnerAccessToken(
  token: string,
  expected?: RunnerTokenExpectation,
  allowedTokenUses: Array<"runner_execution" | "runner_upload"> = [
    "runner_execution",
    "runner_upload",
  ]
): Promise<RunnerAccessAuthContext> {
  return (await verifyRunnerToken(token, {
    audience: RUNNER_CONTROL_PLANE_AUDIENCE,
    tokenUses: allowedTokenUses,
    expected,
  })) as RunnerAccessAuthContext;
}

export async function verifyRunnerRefreshToken(
  token: string,
  expected?: RunnerTokenExpectation
): Promise<RunnerRefreshAuthContext> {
  return (await verifyRunnerToken(token, {
    audience: RUNNER_CONTROL_PLANE_AUDIENCE,
    tokenUses: ["runner_refresh"],
    expected,
  })) as RunnerRefreshAuthContext;
}

export async function refreshRunnerAccessTokens(
  token: string,
  expected?: RunnerTokenExpectation
): Promise<RunnerTokenSet> {
  const now = Date.now();
  pruneRunnerRefreshGrace(now);
  let presentedJti = "";
  try {
    presentedJti = String((await verifyBearerToken(token)).jti || "");
  } catch {
    // verifyRunnerToken below owns the canonical invalid-token error.
  }
  const localGrace = presentedJti
    ? runnerRefreshGrace.get(presentedJti)
    : undefined;
  const distributedGrace =
    await readDistributedRunnerRefreshGrace(presentedJti);
  const current = await verifyRunnerToken(token, {
    audience: RUNNER_CONTROL_PLANE_AUDIENCE,
    tokenUses: ["runner_refresh"],
    expected,
    allowRevokedJti: async () =>
      Boolean((localGrace && localGrace.expiresAtMs > now) || distributedGrace),
  });
  if (localGrace && localGrace.expiresAtMs > now) return localGrace.tokens;
  if (distributedGrace) {
    runnerRefreshGrace.set(presentedJti, {
      expiresAtMs: now + RUNNER_REFRESH_GRACE_MS,
      tokens: distributedGrace,
    });
    return distributedGrace;
  }

  await revokeRunnerToken(token);
  const issued = issueRunnerAccessTokens({
    runnerId: current.runnerId,
    tenantId: current.tenantId,
    subject: current.subject,
    profile: current.profile,
    nodeKind: current.nodeKind,
    runnerSessionId: current.runnerSessionId ?? undefined,
    scopes: current.scopes,
    deviceBinding:
      current.deviceId && current.devicePublicKey
        ? {
            deviceId: current.deviceId,
            machineFingerprint: current.machineFingerprintHash ?? "",
            publicKey: current.devicePublicKey,
          }
        : undefined,
  });
  const converged = await persistDistributedRunnerRefreshGrace(
    presentedJti,
    issued
  );
  if (presentedJti) {
    runnerRefreshGrace.set(presentedJti, {
      expiresAtMs: now + RUNNER_REFRESH_GRACE_MS,
      tokens: converged,
    });
  }
  return converged;
}

async function verifyRunnerToken(
  token: string,
  input: {
    audience: string;
    tokenUses: RunnerTokenUse[];
    expected?: RunnerTokenExpectation;
    allowRevokedJti?: (jti: string) => boolean | Promise<boolean>;
  }
): Promise<RunnerTokenContext> {
  let claims: TokenClaims;
  try {
    claims = await verifyBearerToken(token);
  } catch (error) {
    throw new RunnerAuthError(
      "runner_auth_invalid",
      401,
      error instanceof Error ? error.message : "Invalid runner token"
    );
  }
  const jti = String(claims.jti || "");
  if (jti && (await isJtiRevoked(jti)) && !(await input.allowRevokedJti?.(jti)))
    throw new RunnerAuthError(
      "runner_auth_invalid",
      401,
      "Runner token has been revoked"
    );
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const tokenUse = String(claims.tokenUse || "") as RunnerTokenUse;
  if (
    !audiences.includes(input.audience) ||
    !input.tokenUses.includes(tokenUse)
  )
    throw new RunnerAuthError(
      "runner_auth_invalid",
      401,
      "Runner token namespace is invalid"
    );
  const runnerId = String(claims.runnerId || "");
  const tenantId = String(claims.tenantId || "");
  const profile = claims.runnerProfile;
  const nodeKind = claims.runnerNodeKind;
  if (
    !runnerId ||
    !tenantId ||
    (profile !== "local_device" && profile !== "shared_container") ||
    (nodeKind !== "local_device" && nodeKind !== "managed_container") ||
    (profile === "local_device") !== (nodeKind === "local_device")
  )
    throw new RunnerAuthError(
      "runner_auth_invalid",
      401,
      "Runner token binding is incomplete"
    );
  if (input.expected?.runnerId && input.expected.runnerId !== runnerId)
    throw new RunnerAuthError(
      "runner_scope_mismatch",
      403,
      "Runner token does not match the requested runner"
    );
  if (input.expected?.tenantId && input.expected.tenantId !== tenantId)
    throw new RunnerAuthError(
      "runner_scope_mismatch",
      403,
      "Runner token tenant does not match the request"
    );
  const runnerSessionId = claims.runnerSessionId
    ? String(claims.runnerSessionId)
    : null;
  if (
    input.expected?.runnerSessionId &&
    input.expected.runnerSessionId !== runnerSessionId
  )
    throw new RunnerAuthError(
      "runner_session_mismatch",
      403,
      "Runner token session does not match the active Runner session"
    );
  if (
    profile === "local_device" &&
    input.expected &&
    Object.prototype.hasOwnProperty.call(input.expected, "requestProof")
  ) {
    await assertRunnerDeviceProof(claims, input.expected.requestProof);
  }
  const missingScopes = (input.expected?.requiredScopes ?? []).filter(
    scope => !hasScope(Array.isArray(claims.scopes) ? claims.scopes : [], scope)
  );
  if (missingScopes.length > 0)
    throw new RunnerAuthError(
      "runner_permission_denied",
      403,
      "Runner token lacks the required operation scope"
    );
  const ownerUserIdClaim = (
    claims as TokenClaims & {
      runnerOwnerUserId?: unknown;
    }
  ).runnerOwnerUserId;
  const ownerUserIdNumber = Number(ownerUserIdClaim);
  return {
    audience: input.audience,
    runnerId,
    tenantId,
    subject: String(claims.sub || ""),
    profile,
    nodeKind,
    deviceId: claims.deviceId ? String(claims.deviceId) : null,
    devicePublicKey: claims.devicePublicKey
      ? String(claims.devicePublicKey)
      : null,
    devicePublicKeyFingerprint: claims.devicePublicKeyFingerprint
      ? String(claims.devicePublicKeyFingerprint)
      : null,
    machineFingerprintHash: claims.machineFingerprintHash
      ? String(claims.machineFingerprintHash)
      : null,
    ownerUserId:
      Number.isInteger(ownerUserIdNumber) && ownerUserIdNumber > 0
        ? ownerUserIdNumber
        : null,
    runnerSessionId,
    scopes: Array.isArray(claims.scopes) ? claims.scopes : [],
    tokenUse,
  };
}

export async function revokeRunnerToken(token: string): Promise<void> {
  try {
    const claims = await verifyBearerToken(token);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !String(claims.tokenUse || "").startsWith("runner_") ||
      (!audiences.includes(RUNNER_CONTROL_PLANE_AUDIENCE) &&
        !audiences.includes(RUNNER_REGISTRATION_AUDIENCE)) ||
      !claims.jti
    )
      return;
    const ttlSeconds =
      typeof claims.exp === "number"
        ? Math.max(1, claims.exp - Math.floor(Date.now() / 1000))
        : 900;
    await revokeJti(String(claims.jti), Date.now() + ttlSeconds * 1000);
  } catch {
    // Revocation is idempotent and never reveals token validity to callers.
  }
}

export async function rotateRunnerControlToken(token: string): Promise<string> {
  const current = await verifyRunnerControlToken(token);
  await revokeRunnerToken(token);
  return createRunnerControlToken({
    runnerId: current.runnerId,
    tenantId: current.tenantId,
    subject: current.subject,
    profile: current.profile,
    nodeKind: current.nodeKind,
    runnerSessionId: current.runnerSessionId ?? undefined,
    scopes: current.scopes,
    deviceBinding:
      current.deviceId && current.devicePublicKey
        ? {
            deviceId: current.deviceId,
            machineFingerprint: current.machineFingerprintHash ?? "",
            publicKey: current.devicePublicKey,
          }
        : undefined,
  });
}
