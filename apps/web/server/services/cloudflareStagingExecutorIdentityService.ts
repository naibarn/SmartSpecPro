import { ORIGIN_PROVISION_CONTRACT, originProvisionAuthoritySchema, type OriginProvisionAuthority } from "./cloudflareOriginProvisionContract";
import { NATIVE_PROVISION_CONTRACT } from "./cloudflareNativeProvisionContract";
import { PRIVATE_DATABASE_CONTRACT } from "./cloudflarePrivateDatabaseContract";
import { HTTP_IMAGE_PROVISION_CONTRACT } from "./cloudflareHttpImageProvisionContract";
import crypto from "crypto";
import { CLOUDFLARE_STAGING_ORIGIN_CONTRACT, cloudflareStagingOriginAuthoritySchema, type CloudflareStagingOriginAuthority } from "./cloudflareStagingOriginContract";
import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { runnerNodes } from "../../drizzle/schema";
import { claimTtlDedupeKey } from "./postgresRateLimitStore";

export const CLOUDFLARE_STAGING_EXECUTOR_TARGET =
  "smartspec-cloudflare-staging" as const;
export const CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY =
  "cloudflare:staging:deploy" as const;
export const CLOUDFLARE_STAGING_EXECUTOR_PROFILE =
  "cloudflare_staging_executor" as const;

const MAX_PROOF_AGE_MS = 5 * 60 * 1000;
const nonceCache = new Map<string, number>();

export type CloudflareStagingExecutorProof = {
  executorId: string;
  tenantId: string;
  target: string;
  capability: string;
  bodySha256: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

export type VerifiedCloudflareStagingExecutorIdentity = {
  registered: true;
  executorId: string;
  tenantId: string;
  target: typeof CLOUDFLARE_STAGING_EXECUTOR_TARGET;
  capability: typeof CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY;
  expiresAt: string;
};

export class CloudflareStagingExecutorIdentityError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CloudflareStagingExecutorIdentityError";
  }
}

type ProofFields = Omit<CloudflareStagingExecutorProof, "signature">;

export type CloudflareStagingExecutorAttemptBinding = {
  jobId: string;
  tenantId: string;
  target: typeof CLOUDFLARE_STAGING_EXECUTOR_TARGET;
  artifactSha256: string;
  action: "deploy" | "rollback" | "bootstrap" | "provision";
  idempotencyKey: string;
  /** v2 authority is signed in full; it never follows from executor identity. */
  originAuthority?: CloudflareStagingOriginAuthority;
  provisionAuthority?: OriginProvisionAuthority;
  provisionContract?: typeof ORIGIN_PROVISION_CONTRACT | typeof NATIVE_PROVISION_CONTRACT | typeof PRIVATE_DATABASE_CONTRACT | typeof HTTP_IMAGE_PROVISION_CONTRACT;
};

/** Canonical bytes the registered Ed25519 executor must sign for each operation. */
export function cloudflareStagingExecutorProofPayload(
  input: ProofFields
): string {
  return [
    "smartspec-cloudflare-staging-executor-v1",
    input.executorId,
    input.tenantId,
    input.target,
    input.capability,
    input.bodySha256.toLowerCase(),
    input.timestamp,
    input.nonce,
  ].join("\n");
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

function attemptBody(binding: CloudflareStagingExecutorAttemptBinding) {
  const provision = binding.action === "provision";
  const parsedProvision = originProvisionAuthoritySchema.safeParse(binding.provisionAuthority);
  if (provision !== (binding.provisionAuthority !== undefined) || (provision &&
      (!parsedProvision.success || parsedProvision.data.planDigest !== binding.artifactSha256 || binding.originAuthority !== undefined))
      || (binding.provisionContract !== undefined && (!provision || ![ORIGIN_PROVISION_CONTRACT, NATIVE_PROVISION_CONTRACT, PRIVATE_DATABASE_CONTRACT, HTTP_IMAGE_PROVISION_CONTRACT].includes(binding.provisionContract)))) {
    throw new CloudflareStagingExecutorIdentityError("executor_attempt_binding_invalid");
  }
  let originAuthority: CloudflareStagingOriginAuthority | undefined;
  if (binding.originAuthority !== undefined) {
    const parsed = cloudflareStagingOriginAuthoritySchema.safeParse(binding.originAuthority);
    if (!parsed.success || binding.action === "bootstrap") {
      throw new CloudflareStagingExecutorIdentityError("executor_attempt_binding_invalid");
    }
    originAuthority = parsed.data;
  }
  return {
    jobId: binding.jobId, tenantId: binding.tenantId, target: binding.target,
    artifactSha256: binding.artifactSha256.toLowerCase(), action: binding.action, idempotencyKey: binding.idempotencyKey,
    ...(originAuthority ? { contractVersion: CLOUDFLARE_STAGING_ORIGIN_CONTRACT, originAuthority } : {}),
    ...(provision && parsedProvision.success ? { contractVersion: binding.provisionContract ?? ORIGIN_PROVISION_CONTRACT, provisionAuthority: parsedProvision.data } : {}),
  };
}

/**
 * Create a short-lived proof for one immutable deployment attempt. The private key
 * is read only in the server executor process (or supplied by its server-side
 * secret resolver); this function never exposes or logs it.
 */
export async function createCloudflareStagingExecutorProof(
  binding: CloudflareStagingExecutorAttemptBinding,
  options: {
    resolvePrivateKey?: () => Promise<{
      executorId: string;
      privateKey: string;
    } | null>;
    now?: number;
    nonce?: string;
  } = {}
): Promise<CloudflareStagingExecutorProof> {
  if (
    binding.target !== CLOUDFLARE_STAGING_EXECUTOR_TARGET ||
    !binding.jobId.trim() ||
    !binding.tenantId.trim() ||
    !binding.idempotencyKey.trim() ||
    !/^[a-f0-9]{64}$/i.test(binding.artifactSha256) ||
    (binding.action !== "deploy" && binding.action !== "rollback" && binding.action !== "bootstrap" && binding.action !== "provision")
  )
    throw new CloudflareStagingExecutorIdentityError(
      "executor_attempt_binding_invalid"
    );
  attemptBody(binding);
  const resolved = options.resolvePrivateKey
    ? await options.resolvePrivateKey()
    : {
        executorId: process.env.CLOUDFLARE_STAGING_EXECUTOR_ID?.trim() ?? "",
        privateKey:
          process.env.CLOUDFLARE_STAGING_EXECUTOR_PRIVATE_KEY?.replace(
            /\\n/g,
            "\n"
          ).trim() ?? "",
      };
  if (!resolved?.executorId || !resolved.privateKey)
    throw new CloudflareStagingExecutorIdentityError(
      "executor_private_key_unconfigured"
    );
  let privateKey: crypto.KeyObject;
  try {
    privateKey = crypto.createPrivateKey(resolved.privateKey);
  } catch {
    throw new CloudflareStagingExecutorIdentityError(
      "executor_private_key_invalid"
    );
  }
  if (privateKey.asymmetricKeyType !== "ed25519")
    throw new CloudflareStagingExecutorIdentityError(
      "executor_private_key_invalid"
    );
  const now = options.now ?? Date.now();
  const timestamp = new Date(now).toISOString();
  const nonce = options.nonce ?? crypto.randomBytes(24).toString("base64url");
  const bodySha256 = crypto
    .createHash("sha256")
    .update(
      stableJson(attemptBody(binding))
    )
    .digest("hex");
  const fields: ProofFields = {
    executorId: resolved.executorId,
    tenantId: binding.tenantId,
    target: binding.target,
    capability: CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
    bodySha256,
    timestamp,
    nonce,
  };
  const signature = crypto
    .sign(
      null,
      Buffer.from(cloudflareStagingExecutorProofPayload(fields)),
      privateKey
    )
    .toString("base64url");
  return { ...fields, signature };
}

function normalizeEd25519PublicKey(value: string): {
  pem: string;
  fingerprint: string;
} {
  let key: crypto.KeyObject;
  try {
    key = crypto.createPublicKey(value);
  } catch {
    throw new CloudflareStagingExecutorIdentityError(
      "executor_public_key_invalid"
    );
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new CloudflareStagingExecutorIdentityError(
      "executor_public_key_invalid"
    );
  const pem = key.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = crypto
    .createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
  return { pem, fingerprint };
}

export function validateCloudflareStagingExecutorRegistration(
  input: {
    executorId: string;
    publicKey: string;
    expiresAt: Date;
  },
  now = Date.now()
): {
  executorId: string;
  publicKey: string;
  fingerprint: string;
  expiresAt: Date;
} {
  const executorId = input.executorId.trim();
  if (!/^cf-staging-executor:[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(executorId))
    throw new CloudflareStagingExecutorIdentityError("executor_id_invalid");
  if (
    !(input.expiresAt instanceof Date) ||
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt.getTime() <= now ||
    input.expiresAt.getTime() > now + 90 * 24 * 60 * 60 * 1000
  )
    throw new CloudflareStagingExecutorIdentityError("executor_expiry_invalid");
  const key = normalizeEd25519PublicKey(input.publicKey);
  return {
    executorId,
    publicKey: key.pem,
    fingerprint: key.fingerprint,
    expiresAt: input.expiresAt,
  };
}

function parseIdentityMetadata(
  value: unknown
): {
  publicKey: string;
  fingerprint: string;
  target: string;
  capability: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = (value as Record<string, unknown>).cloudflareStagingExecutor;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const record = metadata as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.publicKey !== "string" ||
    typeof record.fingerprint !== "string" ||
    typeof record.target !== "string" ||
    typeof record.capability !== "string"
  )
    return null;
  return {
    publicKey: record.publicKey,
    fingerprint: record.fingerprint,
    target: record.target,
    capability: record.capability,
  };
}

async function consumeNonce(key: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    const now = Date.now();
    for (const [candidate, expiresAt] of nonceCache)
      if (expiresAt <= now) nonceCache.delete(candidate);
    if (nonceCache.has(key)) return false;
    nonceCache.set(key, now + MAX_PROOF_AGE_MS);
    return true;
  }
  try {
    return await claimTtlDedupeKey(
      "cloudflare-staging-executor-proof",
      key,
      Math.ceil(MAX_PROOF_AGE_MS / 1000)
    );
  } catch {
    throw new CloudflareStagingExecutorIdentityError(
      "executor_proof_replay_store_unavailable"
    );
  }
}

export function __clearCloudflareStagingExecutorNoncesForTests(): void {
  nonceCache.clear();
}

/**
 * Authenticate an executor using only its signed proof and a fresh Runner Authority
 * record. executorId is a lookup hint; it becomes identity only after signature and
 * current registration state have both been verified.
 */
export async function verifyCloudflareStagingExecutorProof(
  proof: CloudflareStagingExecutorProof,
  options: {
    now?: number;
    expectedBinding: CloudflareStagingExecutorAttemptBinding;
  }
): Promise<VerifiedCloudflareStagingExecutorIdentity> {
  const now = options.now ?? Date.now();
  if (!proof || typeof proof !== "object" || Array.isArray(proof))
    throw new CloudflareStagingExecutorIdentityError("executor_proof_invalid");
  const expectedBinding = options.expectedBinding;
  if (
    !expectedBinding ||
    expectedBinding.target !== CLOUDFLARE_STAGING_EXECUTOR_TARGET ||
    !/^[a-f0-9]{64}$/i.test(expectedBinding.artifactSha256) ||
    (expectedBinding.action !== "deploy" &&
      expectedBinding.action !== "rollback" && expectedBinding.action !== "bootstrap" && expectedBinding.action !== "provision")
  )
    throw new CloudflareStagingExecutorIdentityError(
      "executor_attempt_binding_invalid"
    );
  const expectedBodySha256 = crypto
    .createHash("sha256")
    .update(
      stableJson(attemptBody(expectedBinding))
    )
    .digest("hex");
  const executorId =
    typeof proof.executorId === "string" ? proof.executorId.trim() : "";
  if (
    !/^cf-staging-executor:[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(executorId) ||
    proof.target !== CLOUDFLARE_STAGING_EXECUTOR_TARGET ||
    proof.capability !== CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY ||
    proof.tenantId !== expectedBinding.tenantId ||
    proof.bodySha256.toLowerCase() !== expectedBodySha256 ||
    typeof proof.tenantId !== "string" ||
    !proof.tenantId.trim() ||
    !/^[a-f0-9]{64}$/i.test(proof.bodySha256) ||
    typeof proof.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(proof.nonce) ||
    typeof proof.signature !== "string" ||
    !/^[A-Za-z0-9_-]{80,256}$/.test(proof.signature)
  )
    throw new CloudflareStagingExecutorIdentityError("executor_proof_invalid");
  const proofTime = Date.parse(proof.timestamp);
  if (
    !Number.isFinite(proofTime) ||
    Math.abs(now - proofTime) > MAX_PROOF_AGE_MS
  )
    throw new CloudflareStagingExecutorIdentityError("executor_proof_expired");

  const db = getDb();
  const [row] = await db
    .select()
    .from(runnerNodes)
    .where(eq(runnerNodes.runnerId, executorId))
    .limit(1);
  const expiry = row?.snapshotExpiresAt?.getTime();
  if (
    !row ||
    row.profile !== CLOUDFLARE_STAGING_EXECUTOR_PROFILE ||
    row.nodeKind !== "service_executor" ||
    row.trustState !== "trusted" ||
    row.status !== "registered" ||
    row.revokedAt ||
    !row.snapshotExpiresAt ||
    !expiry ||
    expiry <= now ||
    row.tenantId !== proof.tenantId
  )
    throw new CloudflareStagingExecutorIdentityError("executor_not_authorized");

  const metadata = parseIdentityMetadata(row.currentSnapshotJson);
  if (
    !metadata ||
    metadata.target !== CLOUDFLARE_STAGING_EXECUTOR_TARGET ||
    metadata.capability !== CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY
  )
    throw new CloudflareStagingExecutorIdentityError(
      "executor_registration_incomplete"
    );
  let key: crypto.KeyObject;
  try {
    key = crypto.createPublicKey(metadata.publicKey);
  } catch {
    throw new CloudflareStagingExecutorIdentityError(
      "executor_registration_incomplete"
    );
  }
  const fingerprint = crypto
    .createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
  if (
    key.asymmetricKeyType !== "ed25519" ||
    fingerprint !== metadata.fingerprint
  )
    throw new CloudflareStagingExecutorIdentityError(
      "executor_registration_incomplete"
    );
  const payload = cloudflareStagingExecutorProofPayload({
    executorId,
    tenantId: proof.tenantId,
    target: proof.target,
    capability: proof.capability,
    bodySha256: proof.bodySha256,
    timestamp: proof.timestamp,
    nonce: proof.nonce,
  });
  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      null,
      Buffer.from(payload),
      key,
      Buffer.from(proof.signature, "base64url")
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid)
    throw new CloudflareStagingExecutorIdentityError("executor_proof_invalid");
  const nonceKey = `${executorId}:${proof.nonce}`;
  if (!(await consumeNonce(nonceKey)))
    throw new CloudflareStagingExecutorIdentityError("executor_proof_replayed");

  return {
    registered: true,
    executorId: row.runnerId,
    tenantId: row.tenantId,
    target: CLOUDFLARE_STAGING_EXECUTOR_TARGET,
    capability: CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
    expiresAt: row.snapshotExpiresAt.toISOString(),
  };
}
