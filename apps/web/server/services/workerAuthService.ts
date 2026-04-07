import crypto from "crypto";

import type { Request } from "express";

import type { TokenClaims } from "../_core/tokens";
import { hasScope, signBearerToken, verifyBearerToken } from "../_core/tokens";
import { isJtiRevoked } from "../_core/revocation";
import type { WorkerRuntimeType, WorkerScope } from "../../shared/workerRuntime";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

export const WORKER_REGISTRATION_AUDIENCE = "smartspec-worker-registration";
export const WORKER_CONTROL_PLANE_AUDIENCE = "smartspec-worker-control-plane";

export type WorkerTokenUse = "worker_registration" | "worker_execution" | "worker_upload";

export interface WorkerRegistrationAuthContext {
  audience: string;
  externalReference: string | null;
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
  runtimeType: WorkerRuntimeType;
  scopes: WorkerScope[];
  subject: string;
  teamId: string | null;
  tenantId: string;
  tokenUse: "worker_execution" | "worker_upload";
  workerId: string;
}

export interface CreateWorkerRegistrationTokenInput {
  externalReference?: string | null;
  registeredByUserId?: number | null;
  runtimeType?: WorkerRuntimeType | null;
  scopes?: WorkerScope[];
  subject?: string;
  teamId?: string | null;
  tenantId: string;
}

export interface IssueWorkerAccessTokensInput {
  runtimeType: WorkerRuntimeType;
  scopes?: WorkerScope[];
  subject?: string;
  teamId?: string | null;
  tenantId: string;
  workerId: string;
}

export interface VerifyWorkerAccessTokenOptions {
  allowedTokenUses?: Array<Exclude<WorkerTokenUse, "worker_registration">>;
  requiredScopes?: WorkerScope[];
  runtimeType?: WorkerRuntimeType;
  workerId?: string;
}

type WorkerTokenExpiresIn = Parameters<typeof signBearerToken>[1];

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

async function assertTenantFeatureEnabled(tenantId: string): Promise<void> {
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.openClawExternalRuntime) {
    throw new WorkerAuthError(
      "feature_disabled",
      403,
      "OpenClaw external worker runtime is disabled for this tenant",
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
  expiresIn: WorkerTokenExpiresIn = "30m",
): string {
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
      jti: randomJti("worker_register"),
    },
    expiresIn,
  );
}

export function issueWorkerAccessTokens(
  input: IssueWorkerAccessTokensInput,
  executionExpiresIn: WorkerTokenExpiresIn = "8h",
  uploadExpiresIn: WorkerTokenExpiresIn = "2h",
): { executionToken: string; uploadToken: string } {
  const executionScopes = input.scopes ?? [
    "workers:heartbeat",
    "workers:claim",
    "workers:report",
    "workers:diagnostics",
  ];
  const baseClaims = {
    sub: input.subject ?? `worker:${input.workerId}`,
    type: "access" as const,
    aud: WORKER_CONTROL_PLANE_AUDIENCE,
    tenantId: input.tenantId,
    teamId: input.teamId ?? undefined,
    workerId: input.workerId,
    runtimeType: input.runtimeType,
  };

  return {
    executionToken: signBearerToken(
      {
        ...baseClaims,
        tokenUse: "worker_execution",
        scopes: executionScopes,
        jti: randomJti("worker_exec"),
      },
      executionExpiresIn,
    ),
    uploadToken: signBearerToken(
      {
        ...baseClaims,
        tokenUse: "worker_upload",
        scopes: ["workers:report"],
        jti: randomJti("worker_upload"),
      },
      uploadExpiresIn,
    ),
  };
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

  await assertTenantFeatureEnabled(tenantId);

  return {
    audience,
    externalReference: claims.externalReference ? String(claims.externalReference) : null,
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

  await assertTenantFeatureEnabled(tenantId);

  return {
    audience,
    runtimeType,
    scopes,
    subject: String(claims.sub || ""),
    teamId: claims.teamId ? String(claims.teamId) : null,
    tenantId,
    tokenUse: tokenUse as "worker_execution" | "worker_upload",
    workerId,
  };
}
