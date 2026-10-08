import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

/** Candidate remote-source evidence contract. A PASS is evidence only and never dispatch permission. */
export const SPEC224_REMOTE_TRUST_CONTRACT =
  "spec224-remote-source-trust.v1" as const;
const MAX_ENVELOPE_BYTES = 256 * 1024;
const MAX_OBJECTS = 128;
const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export type Spec224RemoteObjectRef = {
  provider: "r2" | "s3";
  bucketIdentity: string;
  objectKey: string;
  sha256: string;
  size: number;
};

export type Spec224RemoteSourceEvidence = {
  contract: typeof SPEC224_REMOTE_TRUST_CONTRACT;
  attestationId: string;
  issuerId: string;
  keyId: string;
  keyFingerprintSha256: string;
  issuedAt: string;
  expiresAt: string;
  evidenceObject: Pick<
    Spec224RemoteObjectRef,
    "provider" | "bucketIdentity" | "objectKey"
  >;
  binding: {
    tenantId: string;
    developmentRunId: string;
    developmentRunFencingVersion: number;
    workUnitId: string;
    jobId: string;
    attemptId: string;
    attemptNumber: number;
    attemptFencingVersion: number;
    repository: string;
    sourceCommitSha: string;
    sourceTreeSha: string;
    sourceManifestSha256: string;
    sourceContentSha256: string;
    profileId: string;
    profileVersion: string;
    profileSha256: string;
    artifacts: Array<{ name: string; sha256: string; size: number }>;
    runnerNodeId: string;
    runnerSessionId: string;
    capabilityRevision: number;
  };
  objects: Spec224RemoteObjectRef[];
};

export type Spec224RemoteTrustExpectedBinding =
  Spec224RemoteSourceEvidence["binding"];

export type Spec224RemoteTrustKey = {
  issuerId: string;
  keyId: string;
  fingerprintSha256: string;
  publicKeyPem: string;
  notBefore: string;
  notAfter: string;
  revokedAt: string | null;
  allowedTenantIds: string[];
  allowedProfileIds: string[];
};

export type Spec224RemoteTrustDecision =
  | {
      contract: typeof SPEC224_REMOTE_TRUST_CONTRACT;
      status: "VERIFIED";
      reason: "VERIFIED";
      evidence: Spec224RemoteSourceEvidence;
    }
  | {
      contract: typeof SPEC224_REMOTE_TRUST_CONTRACT;
      status: "DENIED";
      reason: Spec224RemoteTrustDenyReason;
    };

export type Spec224RemoteTrustDenyReason =
  | "MALFORMED_EVIDENCE"
  | "AUTHORITY_UNAVAILABLE"
  | "AUTHORITY_TIMEOUT"
  | "UNTRUSTED_ISSUER"
  | "KEY_INVALID"
  | "KEY_REVOKED"
  | "KEY_NOT_YET_VALID"
  | "KEY_EXPIRED"
  | "SIGNATURE_INVALID"
  | "EVIDENCE_FUTURE"
  | "EVIDENCE_EXPIRED"
  | "EVIDENCE_TOO_OLD"
  | "BINDING_MISMATCH"
  | "TENANT_OR_PROFILE_NOT_ALLOWED"
  | "OBJECT_REFERENCE_INVALID"
  | "OBJECT_LIMIT_EXCEEDED"
  | "OBJECT_TOO_LARGE"
  | "TOTAL_SIZE_EXCEEDED"
  | "OBJECT_CONTENT_MISMATCH"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_TIMEOUT"
  | "REVOKED"
  | "REPLAYED";

export interface Spec224RemoteTrustAuthority {
  /** Must resolve only owner-approved trust configuration. */
  resolveKey(
    issuerId: string,
    keyId: string
  ): Promise<Spec224RemoteTrustKey | null>;
  /** Resolves bucket and prefix from the owner-approved trust configuration. */
  resolveStoragePolicy(
    issuerId: string,
    tenantId: string,
    profileId: string
  ): Promise<{ bucketIdentities: string[]; objectPrefix: string } | null>;
  /** Must read from one explicitly approved bucket identity; no URL support. */
  readObject(
    ref: Spec224RemoteObjectRef,
    options: { signal: AbortSignal; maxBytes: number }
  ): Promise<Uint8Array>;
  /** Must query the canonical revocation authority, not a caller-provided flag. */
  isRevoked(attestationId: string, jobId: string): Promise<boolean>;
  /** Checks durable canonical evidence-consumption records for this exact attempt. */
  isReplay(
    attestationId: string,
    jobId: string,
    attemptId: string
  ): Promise<boolean>;
}

export type Spec224RemoteTrustVerifyInput = {
  evidence: unknown;
  signatureBase64: string;
  expectedBinding: Spec224RemoteTrustExpectedBinding;
  expectedEvidenceObject: Spec224RemoteObjectRef;
  now?: Date;
  maxEvidenceAgeMs: number;
  timeoutMs: number;
  authority: Spec224RemoteTrustAuthority;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateObjectRef(value: unknown): value is Spec224RemoteObjectRef {
  if (!isObject(value)) return false;
  return (
    (value.provider === "r2" || value.provider === "s3") &&
    typeof value.bucketIdentity === "string" &&
    value.bucketIdentity.length > 0 &&
    typeof value.objectKey === "string" &&
    !value.objectKey.startsWith("/") &&
    !value.objectKey
      .split("/")
      .some(part => part === ".." || part === "." || !part) &&
    typeof value.sha256 === "string" &&
    SHA256.test(value.sha256) &&
    Number.isSafeInteger(value.size) &&
    (value.size as number) >= 0
  );
}

function deny(
  reason: Spec224RemoteTrustDenyReason
): Spec224RemoteTrustDecision {
  return { contract: SPEC224_REMOTE_TRUST_CONTRACT, status: "DENIED", reason };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      handle = setTimeout(
        () => reject(new Error("SPEC224_TRUST_TIMEOUT")),
        timeoutMs
      );
    }),
  ]).finally(() => clearTimeout(handle!));
}

function withinPrefix(
  ref: Spec224RemoteObjectRef,
  policy: { bucketIdentities: ReadonlySet<string>; objectPrefix: string }
): boolean {
  return (
    policy.bucketIdentities.has(ref.bucketIdentity) &&
    ref.objectKey.startsWith(policy.objectPrefix) &&
    !ref.objectKey.includes("?") &&
    !ref.objectKey.includes("#") &&
    !ref.objectKey.includes("\\")
  );
}

function isValidEvidence(value: unknown): value is Spec224RemoteSourceEvidence {
  if (
    !isObject(value) ||
    value.contract !== SPEC224_REMOTE_TRUST_CONTRACT ||
    typeof value.attestationId !== "string" ||
    !value.attestationId ||
    typeof value.issuerId !== "string" ||
    !value.issuerId ||
    typeof value.keyId !== "string" ||
    !value.keyId ||
    typeof value.keyFingerprintSha256 !== "string" ||
    !SHA256.test(value.keyFingerprintSha256) ||
    typeof value.issuedAt !== "string" ||
    typeof value.expiresAt !== "string" ||
    !isObject(value.evidenceObject) ||
    (value.evidenceObject.provider !== "r2" &&
      value.evidenceObject.provider !== "s3") ||
    typeof value.evidenceObject.bucketIdentity !== "string" ||
    typeof value.evidenceObject.objectKey !== "string" ||
    !isObject(value.binding) ||
    !Array.isArray(value.objects)
  )
    return false;
  const binding = value.binding;
  const stringFields = [
    "tenantId",
    "developmentRunId",
    "workUnitId",
    "jobId",
    "attemptId",
    "repository",
    "sourceCommitSha",
    "sourceTreeSha",
    "sourceManifestSha256",
    "sourceContentSha256",
    "profileId",
    "profileVersion",
    "profileSha256",
    "runnerNodeId",
    "runnerSessionId",
  ];
  if (
    stringFields.some(
      field => typeof binding[field] !== "string" || !binding[field]
    ) ||
    typeof binding.sourceManifestSha256 !== "string" ||
    !SHA256.test(binding.sourceManifestSha256) ||
    typeof binding.sourceContentSha256 !== "string" ||
    !SHA256.test(binding.sourceContentSha256) ||
    typeof binding.sourceCommitSha !== "string" ||
    !GIT_OBJECT_ID.test(binding.sourceCommitSha) ||
    typeof binding.sourceTreeSha !== "string" ||
    !GIT_OBJECT_ID.test(binding.sourceTreeSha) ||
    typeof binding.profileSha256 !== "string" ||
    !SHA256.test(binding.profileSha256) ||
    !Number.isSafeInteger(binding.developmentRunFencingVersion) ||
    !Number.isSafeInteger(binding.attemptNumber) ||
    !Number.isSafeInteger(binding.attemptFencingVersion) ||
    !Number.isSafeInteger(binding.capabilityRevision) ||
    !Array.isArray(binding.artifacts)
  )
    return false;
  if (
    binding.artifacts.some(
      artifact =>
        !isObject(artifact) ||
        typeof artifact.name !== "string" ||
        !artifact.name ||
        typeof artifact.sha256 !== "string" ||
        !SHA256.test(artifact.sha256) ||
        !Number.isSafeInteger(artifact.size) ||
        (artifact.size as number) < 0
    )
  )
    return false;
  return value.objects.every(validateObjectRef);
}

export async function verifySpec224RemoteSourceEvidence(
  input: Spec224RemoteTrustVerifyInput
): Promise<Spec224RemoteTrustDecision> {
  if (
    !isValidEvidence(input.evidence) ||
    !Number.isFinite(input.maxEvidenceAgeMs) ||
    input.maxEvidenceAgeMs <= 0 ||
    !Number.isFinite(input.timeoutMs) ||
    input.timeoutMs <= 0
  ) {
    return deny("MALFORMED_EVIDENCE");
  }
  const evidence = input.evidence;
  const now = input.now ?? new Date();
  const issued = Date.parse(evidence.issuedAt);
  const expires = Date.parse(evidence.expiresAt);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now.getTime()
  )
    return deny("EVIDENCE_FUTURE");
  if (expires <= now.getTime() || expires <= issued)
    return deny("EVIDENCE_EXPIRED");
  if (now.getTime() - issued > input.maxEvidenceAgeMs)
    return deny("EVIDENCE_TOO_OLD");
  if (canonical(evidence.binding) !== canonical(input.expectedBinding))
    return deny("BINDING_MISMATCH");
  if (
    !validateObjectRef(input.expectedEvidenceObject) ||
    canonical(evidence.evidenceObject) !==
      canonical({
        provider: input.expectedEvidenceObject.provider,
        bucketIdentity: input.expectedEvidenceObject.bucketIdentity,
        objectKey: input.expectedEvidenceObject.objectKey,
      })
  )
    return deny("OBJECT_REFERENCE_INVALID");
  if (evidence.objects.length > MAX_OBJECTS)
    return deny("OBJECT_LIMIT_EXCEEDED");
  const total = evidence.objects.reduce((sum, ref) => sum + ref.size, 0);
  if (evidence.objects.some(ref => ref.size > MAX_OBJECT_BYTES))
    return deny("OBJECT_TOO_LARGE");
  if (total > MAX_TOTAL_BYTES) return deny("TOTAL_SIZE_EXCEEDED");
  if (
    !evidence.objects.some(
      ref => ref.sha256 === evidence.binding.sourceManifestSha256
    ) ||
    !evidence.objects.some(
      ref => ref.sha256 === evidence.binding.sourceContentSha256
    ) ||
    evidence.binding.artifacts.some(
      artifact =>
        !evidence.objects.some(
          ref => ref.sha256 === artifact.sha256 && ref.size === artifact.size
        )
    )
  )
    return deny("OBJECT_REFERENCE_INVALID");
  let key: Spec224RemoteTrustKey | null;
  try {
    key = await withTimeout(
      input.authority.resolveKey(evidence.issuerId, evidence.keyId),
      input.timeoutMs
    );
  } catch (error) {
    return deny(
      (error as Error)?.message === "SPEC224_TRUST_TIMEOUT"
        ? "AUTHORITY_TIMEOUT"
        : "AUTHORITY_UNAVAILABLE"
    );
  }
  if (
    !key ||
    key.issuerId !== evidence.issuerId ||
    key.keyId !== evidence.keyId
  )
    return deny("UNTRUSTED_ISSUER");
  if (
    !key.allowedTenantIds.includes(evidence.binding.tenantId) ||
    !key.allowedProfileIds.includes(evidence.binding.profileId)
  )
    return deny("TENANT_OR_PROFILE_NOT_ALLOWED");
  if (key.fingerprintSha256 !== evidence.keyFingerprintSha256)
    return deny("KEY_INVALID");
  const keyStart = Date.parse(key.notBefore),
    keyEnd = Date.parse(key.notAfter);
  const keyRevokedAt =
    key.revokedAt === null ? null : Date.parse(key.revokedAt);
  if (
    !Number.isFinite(keyStart) ||
    !Number.isFinite(keyEnd) ||
    keyStart >= keyEnd ||
    (key.revokedAt !== null && !Number.isFinite(keyRevokedAt))
  )
    return deny("KEY_INVALID");
  if (keyRevokedAt !== null && keyRevokedAt <= now.getTime())
    return deny("KEY_REVOKED");
  if (issued < keyStart) return deny("KEY_NOT_YET_VALID");
  if (issued > keyEnd) return deny("KEY_EXPIRED");
  let validSignature = false;
  try {
    const publicKey = createPublicKey(key.publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") return deny("KEY_INVALID");
    const actualFingerprint = createHash("sha256")
      .update(publicKey.export({ type: "spki", format: "der" }))
      .digest("hex");
    if (actualFingerprint !== key.fingerprintSha256) return deny("KEY_INVALID");
    validSignature = verifySignature(
      null,
      Buffer.from(canonical(evidence)),
      publicKey,
      Buffer.from(input.signatureBase64, "base64")
    );
  } catch {
    return deny("KEY_INVALID");
  }
  if (!validSignature) return deny("SIGNATURE_INVALID");

  let storagePolicy: {
    bucketIdentities: string[];
    objectPrefix: string;
  } | null;
  try {
    storagePolicy = await withTimeout(
      input.authority.resolveStoragePolicy(
        evidence.issuerId,
        evidence.binding.tenantId,
        evidence.binding.profileId
      ),
      input.timeoutMs
    );
  } catch (error) {
    return deny(
      (error as Error)?.message === "SPEC224_TRUST_TIMEOUT"
        ? "AUTHORITY_TIMEOUT"
        : "AUTHORITY_UNAVAILABLE"
    );
  }
  if (
    !storagePolicy ||
    !storagePolicy.objectPrefix.endsWith("/") ||
    !storagePolicy.objectPrefix.startsWith("spec224/") ||
    storagePolicy.objectPrefix.includes("..") ||
    storagePolicy.objectPrefix.includes("\\") ||
    storagePolicy.bucketIdentities.length === 0 ||
    storagePolicy.bucketIdentities.some(
      bucket => !bucket || /[/?#\\]/.test(bucket)
    )
  )
    return deny("AUTHORITY_UNAVAILABLE");
  const approvedStorage = {
    bucketIdentities: new Set(storagePolicy.bucketIdentities),
    objectPrefix: storagePolicy.objectPrefix,
  };
  if (
    !withinPrefix(input.expectedEvidenceObject, approvedStorage) ||
    evidence.objects.some(ref => !withinPrefix(ref, approvedStorage))
  )
    return deny("OBJECT_REFERENCE_INVALID");
  if (input.expectedEvidenceObject.size > MAX_ENVELOPE_BYTES)
    return deny("OBJECT_TOO_LARGE");

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error("SPEC224_TRUST_TIMEOUT"));
    }, input.timeoutMs);
  });
  let totalBytes = 0;
  try {
    const verifyObjects = async () => {
      const evidenceBytes = Buffer.from(canonical(evidence));
      const storedEvidence = await input.authority.readObject(
        input.expectedEvidenceObject,
        { signal: controller.signal, maxBytes: MAX_ENVELOPE_BYTES }
      );
      if (
        storedEvidence.byteLength > MAX_ENVELOPE_BYTES ||
        storedEvidence.byteLength !== input.expectedEvidenceObject.size ||
        createHash("sha256").update(storedEvidence).digest("hex") !==
          input.expectedEvidenceObject.sha256 ||
        !Buffer.from(storedEvidence).equals(evidenceBytes)
      )
        return "OBJECT_CONTENT_MISMATCH" as const;
      for (const ref of evidence.objects) {
        const body = await input.authority.readObject(ref, {
          signal: controller.signal,
          maxBytes: Math.min(ref.size, MAX_OBJECT_BYTES),
        });
        if (
          !(body instanceof Uint8Array) ||
          body.byteLength !== ref.size ||
          body.byteLength > MAX_OBJECT_BYTES ||
          createHash("sha256").update(body).digest("hex") !== ref.sha256
        )
          return "OBJECT_CONTENT_MISMATCH" as const;
        totalBytes += body.byteLength;
        if (totalBytes > MAX_TOTAL_BYTES) return "TOTAL_SIZE_EXCEEDED" as const;
      }
      if (
        await input.authority.isRevoked(
          evidence.attestationId,
          evidence.binding.jobId
        )
      )
        return "REVOKED" as const;
      if (
        await input.authority.isReplay(
          evidence.attestationId,
          evidence.binding.jobId,
          evidence.binding.attemptId
        )
      )
        return "REPLAYED" as const;
      return null;
    };
    const result = await Promise.race([verifyObjects(), timeout]);
    if (result) return deny(result);
  } catch (error) {
    return deny(
      (error as Error)?.message === "SPEC224_TRUST_TIMEOUT"
        ? "STORAGE_TIMEOUT"
        : "STORAGE_UNAVAILABLE"
    );
  } finally {
    clearTimeout(timeoutHandle!);
  }
  return {
    contract: SPEC224_REMOTE_TRUST_CONTRACT,
    status: "VERIFIED",
    reason: "VERIFIED",
    evidence,
  };
}
