import crypto from "node:crypto";

import { getCacheClient } from "./redisClients";
import {
  hasScope,
  parseScopes,
  signBearerToken,
  verifyBearerTokenIgnoringExpiration,
} from "../_core/tokens";
import { revokeJti, isJtiRevoked } from "../_core/revocation";
import {
  revokeConnectedDeviceForBinding,
  updateConnectedDeviceTokenMetadata,
  upsertConnectedDevice,
} from "./connectedDeviceService";

const PAIRING_TTL_SECONDS = 900;
const REDEEMED_TTL_SECONDS = 120;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const PAIRING_PREFIX = "ssp:f145:v1:mcp:pairing:";
const PAIRING_CODE_PREFIX = "ssp:f145:v1:mcp:pairing-code:";
const DEVICE_REVOCATION_PREFIX = "ssp:f145:v1:mcp:device-revoked:";
const AGENT_TOKEN_USE = "mcp_agent_pairing";

const ALLOWED_PAIRING_SCOPES = new Set([
  "mcp:read",
  "mcp:write",
  "hermes:connect",
  "hermes:read",
  "hermes:disconnect",
  "hermes:generate",
  "remotion:submit",
  "remotion:read",
  "remotion:cancel",
  "library:search",
  "library:read",
  "library:download",
  "media:read",
  "media:download",
]);

type PairingState = {
  pairingId: string;
  tenantId: string;
  userId: number;
  deviceIdHash: string;
  requestedScopeHash: string;
  approvedScopeHash: string | null;
  requestedScopes: string[];
  approvedScopes: string[] | null;
  codeChallenge: string;
  userCode: string;
  consentId: string | null;
  status: "pending" | "approved" | "redeemed";
  createdAt: string;
  expiresAt: string;
  displayName?: string | null;
  platform?: string | null;
  architecture?: string | null;
  runtimeType?: string | null;
};

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function key(pairingId: string): string {
  return `${PAIRING_PREFIX}${hash(pairingId)}`;
}

function codeKey(userCode: string): string {
  return `${PAIRING_CODE_PREFIX}${hash(userCode.trim().toUpperCase())}`;
}

export function hermesAgentDeviceRevocationKey(input: {
  tenantId: string;
  userId: number;
  deviceIdHash: string;
  consentId?: string | null;
}): string {
  const consent = input.consentId?.trim() || "legacy";
  return `${DEVICE_REVOCATION_PREFIX}${hash(`${input.tenantId}:${input.userId}:${input.deviceIdHash}:${consent}`)}`;
}

function normalizeScopes(scopes: unknown): string[] {
  const values = Array.isArray(scopes)
    ? scopes.filter((scope): scope is string => typeof scope === "string")
    : parseScopes(typeof scopes === "string" ? scopes : undefined);
  return Array.from(new Set(values.map((scope) => scope.trim()).filter(Boolean))).sort();
}

function assertAllowedScopes(scopes: string[]): void {
  if (!scopes.length || scopes.some((scope) => !ALLOWED_PAIRING_SCOPES.has(scope))) {
    throw Object.assign(new Error("Pairing requested unsupported scope"), { code: "pairing_scope_invalid" });
  }
  if (!hasScope(scopes, "mcp:read")) {
    throw Object.assign(new Error("MCP pairing requires mcp:read"), { code: "pairing_scope_invalid" });
  }
  if (hasScope(scopes, "mcp:write") && !scopes.some((scope) => scope.endsWith(":generate") || scope.includes(":submit") || scope.includes(":cancel") || scope === "hermes:connect" || scope === "hermes:disconnect")) {
    throw Object.assign(new Error("Write pairing requires an explicit operation scope"), { code: "pairing_scope_invalid" });
  }
}

function verifyPkce(verifier: string, challenge: string): boolean {
  const digest = crypto.createHash("sha256").update(verifier).digest("base64url");
  const digestBuffer = Buffer.from(digest);
  const challengeBuffer = Buffer.from(challenge);
  if (digestBuffer.length !== challengeBuffer.length) return false;
  return crypto.timingSafeEqual(digestBuffer, challengeBuffer);
}

async function readPairing(pairingId: string): Promise<PairingState | null> {
  const redis = getCacheClient();
  const raw = await redis.get(key(pairingId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PairingState;
    if (parsed.pairingId !== pairingId || !Array.isArray(parsed.requestedScopes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePairing(state: PairingState, ttl: number, nx = false): Promise<void> {
  const redis = getCacheClient();
  if (nx) {
    const result = await redis.set(key(state.pairingId), JSON.stringify(state), "EX", ttl, "NX");
    if (result !== "OK") {
      throw Object.assign(new Error("Pairing collision"), { code: "pairing_retry" });
    }
    return;
  }
  await redis.set(key(state.pairingId), JSON.stringify(state), "EX", ttl);
}

export async function startHermesAgentPairing(input: {
  tenantId: string;
  userId: number;
  deviceId: string;
  requestedScopes: string[];
  codeChallenge: string;
  userCode: string;
  verificationUri: string;
  displayName?: string | null;
  platform?: string | null;
  architecture?: string | null;
  runtimeType?: string | null;
}): Promise<{ pairingId: string; userCode: string; verificationUri: string; expiresIn: number }> {
  const requestedScopes = normalizeScopes(input.requestedScopes);
  assertAllowedScopes(requestedScopes);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) {
    throw Object.assign(new Error("A valid PKCE code challenge is required"), { code: "pairing_pkce_invalid" });
  }
  const now = new Date();
  const state: PairingState = {
    pairingId: crypto.randomUUID(),
    tenantId: input.tenantId,
    userId: input.userId,
    deviceIdHash: hash(input.deviceId),
    requestedScopeHash: hash(requestedScopes.join(" ")),
    approvedScopeHash: null,
    requestedScopes,
    approvedScopes: null,
    codeChallenge: input.codeChallenge,
    userCode: input.userCode,
    consentId: null,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000).toISOString(),
    displayName: input.displayName?.trim().slice(0, 255) || null,
    platform: input.platform?.trim().slice(0, 40) || null,
    architecture: input.architecture?.trim().slice(0, 40) || null,
    runtimeType: input.runtimeType?.trim().slice(0, 80) || "hermes_agent_gateway",
  };
  await writePairing(state, PAIRING_TTL_SECONDS, true);
  const codeResult = await getCacheClient().set(codeKey(state.userCode), state.pairingId, "EX", PAIRING_TTL_SECONDS, "NX");
  if (codeResult !== "OK") {
    await getCacheClient().del(key(state.pairingId));
    throw Object.assign(new Error("Pairing code collision"), { code: "pairing_retry" });
  }
  return {
    pairingId: state.pairingId,
    userCode: state.userCode,
    verificationUri: input.verificationUri,
    expiresIn: PAIRING_TTL_SECONDS,
  };
}

export async function resolveHermesPairingIdByUserCode(userCode: string): Promise<string | null> {
  const normalized = userCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalized)) return null;
  return getCacheClient().get(codeKey(normalized));
}

export async function approveHermesAgentPairing(input: {
  pairingId: string;
  tenantId: string;
  userId: number;
  approvedScopes?: string[];
}): Promise<{ status: "approved"; consentId: string; scopes: string[] }> {
  const state = await readPairing(input.pairingId);
  if (!state || state.tenantId !== input.tenantId || state.userId !== input.userId || state.status !== "pending") {
    throw Object.assign(new Error("Pairing not found or already used"), { code: "pairing_not_found" });
  }
  if (Date.parse(state.expiresAt) <= Date.now()) {
    throw Object.assign(new Error("Pairing expired"), { code: "pairing_expired" });
  }
  const approvedScopes = normalizeScopes(input.approvedScopes ?? state.requestedScopes);
  assertAllowedScopes(approvedScopes);
  if (approvedScopes.some((scope) => !state.requestedScopes.includes(scope))) {
    throw Object.assign(new Error("Pairing scope widening is forbidden"), { code: "pairing_scope_widened" });
  }
  state.approvedScopes = approvedScopes;
  state.approvedScopeHash = hash(approvedScopes.join(" "));
  state.consentId = crypto.randomUUID();
  state.status = "approved";
  await writePairing(state, PAIRING_TTL_SECONDS);
  return { status: "approved", consentId: state.consentId, scopes: approvedScopes };
}

export async function exchangeHermesAgentPairing(input: {
  pairingId: string;
  deviceId: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] }> {
  const state = await readPairing(input.pairingId);
  if (!state || state.status !== "approved" || !state.approvedScopes || !state.consentId) {
    throw Object.assign(new Error("Pairing is not approved"), { code: "pairing_not_approved" });
  }
  if (state.deviceIdHash !== hash(input.deviceId) || !verifyPkce(input.codeVerifier, state.codeChallenge)) {
    throw Object.assign(new Error("Pairing device or PKCE verification failed"), { code: "pairing_binding_failed" });
  }
  const now = Math.floor(Date.now() / 1000);
  const common = {
    sub: String(state.userId),
    userId: state.userId,
    tenantId: state.tenantId,
    scopes: state.approvedScopes,
    tokenUse: AGENT_TOKEN_USE,
    deviceIdHash: state.deviceIdHash,
    consentId: state.consentId,
  };
  const accessJti = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const accessToken = signBearerToken({ ...common, type: "access", jti: accessJti }, `${ACCESS_TTL_SECONDS}s`);
  const refreshToken = signBearerToken({ ...common, type: "refresh", jti: refreshJti }, `${REFRESH_TTL_SECONDS}s`);
  state.status = "redeemed";
  await writePairing(state, REDEEMED_TTL_SECONDS);
  const accessTokenExpiresAt = new Date((now + ACCESS_TTL_SECONDS) * 1000);
  const refreshTokenExpiresAt = new Date((now + REFRESH_TTL_SECONDS) * 1000);
  await upsertConnectedDevice({
    tenantId: state.tenantId,
    ownerUserId: state.userId,
    deviceId: input.deviceId,
    displayName: state.displayName ?? "Hermes MCP device",
    runtimeType: state.runtimeType ?? "hermes_agent_gateway",
    authKind: AGENT_TOKEN_USE,
    connectionMethod: "remote_mcp",
    platform: state.platform ?? null,
    architecture: state.architecture ?? null,
    scopes: state.approvedScopes,
    consentId: state.consentId,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    metadataJson: { source: "mcp_pairing" },
  }).catch((error) => {
    console.warn("[hermesAgentPairing] connected device metadata unavailable", error instanceof Error ? error.message : String(error));
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS, scopes: state.approvedScopes };
}

export async function refreshHermesAgentPairing(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] }> {
  const claims = await verifyBearerTokenIgnoringExpiration(refreshToken);
  const userId = Number(claims.userId);
  const tenantId = typeof claims.tenantId === "string" ? claims.tenantId.trim() : "";
  const deviceIdHash = typeof claims.deviceIdHash === "string" ? claims.deviceIdHash.trim() : "";
  if (
    claims.type !== "refresh"
    || claims.tokenUse !== AGENT_TOKEN_USE
    || !claims.jti
    || !Number.isInteger(userId)
    || userId <= 0
    || !tenantId
    || !deviceIdHash
    || await isJtiRevoked(claims.jti)
    || await isJtiRevoked(hermesAgentDeviceRevocationKey({
      tenantId,
      userId,
      deviceIdHash,
      consentId: typeof (claims as any).consentId === "string" ? String((claims as any).consentId) : null,
    }))
  ) {
    throw Object.assign(new Error("Invalid MCP pairing refresh token"), { code: "pairing_refresh_invalid" });
  }
  const expiresAtMs = claims.exp ? claims.exp * 1000 : Date.now() + REFRESH_TTL_SECONDS * 1000;
  await revokeJti(claims.jti, expiresAtMs);
  const scopes = normalizeScopes(claims.scopes ?? []);
  assertAllowedScopes(scopes);
  const common = {
    sub: String(claims.sub),
    userId,
    tenantId,
    scopes,
    tokenUse: AGENT_TOKEN_USE,
    deviceIdHash,
    consentId: (claims as any).consentId,
  };
  const accessToken = signBearerToken({ ...common, type: "access", jti: crypto.randomUUID() }, `${ACCESS_TTL_SECONDS}s`);
  const rotatedRefresh = signBearerToken({ ...common, type: "refresh", jti: crypto.randomUUID() }, `${REFRESH_TTL_SECONDS}s`);
  await updateConnectedDeviceTokenMetadata({
    tenantId,
    ownerUserId: userId,
    deviceId: deviceIdHash,
    authKind: "mcp_agent_pairing",
    accessTokenExpiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  }).catch((error) => {
    console.warn("[hermesAgentPairing] connected device token metadata unavailable", error instanceof Error ? error.message : String(error));
  });
  return { accessToken, refreshToken: rotatedRefresh, expiresIn: ACCESS_TTL_SECONDS, scopes };
}

export async function revokeHermesAgentDevice(input: {
  tenantId: string;
  userId: number;
  deviceIdHash: string;
}): Promise<void> {
  if (!input.tenantId || !Number.isInteger(input.userId) || input.userId <= 0 || !/^[a-f0-9]{64}$/i.test(input.deviceIdHash)) {
    throw Object.assign(new Error("Invalid Hermes agent device binding"), { code: "pairing_binding_invalid" });
  }
  const record = await revokeConnectedDeviceForBinding({
    tenantId: input.tenantId,
    ownerUserId: input.userId,
    deviceIdHash: input.deviceIdHash,
    reason: "mcp_disconnect",
  });
  if (record) return;
  await revokeJti(
    hermesAgentDeviceRevocationKey(input),
    Date.now() + REFRESH_TTL_SECONDS * 1000,
  );
}

export function isHermesAgentTokenUse(value: unknown): boolean {
  return value === AGENT_TOKEN_USE;
}
