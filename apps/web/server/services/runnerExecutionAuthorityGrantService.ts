import { randomUUID, sign as signBytes } from "node:crypto";

import type { RunnerExecutionSessionBinding } from "./runnerExecutionSessionContracts";

export const RUNNER_EXECUTION_AUTHORITY_GRANT_MAX_TTL_MS = 15 * 60 * 1000;
const MAX_REQUIRED_SAFETY_FEATURES = 32;

export type RunnerExecutionAuthorityClaims = {
  grantId: string;
  keyId: string;
  workerJobId: string;
  sessionId: string;
  runnerId: string;
  sessionGeneration: number;
  authorityEpoch: number;
  placementEpoch: number;
  jobControlRevision: number;
  effectClass: string;
  issuedAtUnixMs: number;
  notAfterUnixMs: number;
  requiredSafetyFeatures: string[];
};

export type RunnerExecutionAuthorityGrant = {
  claims: RunnerExecutionAuthorityClaims;
  signatureBase64: string;
};

export function validateRunnerExecutionAuthorityGrant(
  value: unknown,
  command: {
    jobId: string;
    attempt: number;
    fencingToken: number;
    runnerId: string;
  },
  session: RunnerExecutionSessionBinding
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "RUNNER_AUTHORITY_GRANT_INVALID";
  const grant = value as Record<string, unknown>;
  if (
    Object.keys(grant).sort().join(",") !== "claims,signatureBase64" ||
    typeof grant.signatureBase64 !== "string" ||
    !/^[A-Za-z0-9+/]{256,4096}={0,2}$/.test(grant.signatureBase64) ||
    !grant.claims ||
    typeof grant.claims !== "object" ||
    Array.isArray(grant.claims)
  ) {
    return "RUNNER_AUTHORITY_GRANT_INVALID";
  }
  const claims = grant.claims as Record<string, unknown>;
  const expectedKeys = [
    "authorityEpoch", "effectClass", "grantId", "issuedAtUnixMs", "jobControlRevision",
    "keyId", "notAfterUnixMs", "placementEpoch", "requiredSafetyFeatures",
    "runnerId", "sessionGeneration", "sessionId", "workerJobId",
  ].sort();
  if (Object.keys(claims).sort().join(",") !== expectedKeys.join(","))
    return "RUNNER_AUTHORITY_GRANT_INVALID";
  const positiveIntegers = [
    claims.sessionGeneration,
    claims.authorityEpoch,
    claims.placementEpoch,
    claims.jobControlRevision,
  ];
  if (
    positiveIntegers.some(
      value => !Number.isSafeInteger(value) || (value as number) < 1
    ) ||
    !Number.isSafeInteger(claims.issuedAtUnixMs) ||
    !Number.isSafeInteger(claims.notAfterUnixMs) ||
    (claims.notAfterUnixMs as number) <= (claims.issuedAtUnixMs as number) ||
    (claims.notAfterUnixMs as number) - (claims.issuedAtUnixMs as number) >
      RUNNER_EXECUTION_AUTHORITY_GRANT_MAX_TTL_MS ||
    claims.workerJobId !== command.jobId ||
    claims.runnerId !== command.runnerId ||
    claims.sessionGeneration !== command.attempt ||
    claims.sessionGeneration !== session.generation ||
    claims.sessionId !== session.sessionId ||
    claims.authorityEpoch !== session.authorityEpoch ||
    claims.placementEpoch !== session.placementEpoch ||
    claims.jobControlRevision !== session.jobControlRevision ||
    session.workerJobId !== command.jobId ||
    session.workerJobAttempt !== command.attempt ||
    session.leaseFencingVersion !== command.fencingToken ||
    session.runnerId !== command.runnerId ||
    claims.effectClass !== "external_agent_task" ||
    typeof claims.grantId !== "string" ||
    !claims.grantId.trim() ||
    claims.grantId.length > 160 ||
    typeof claims.keyId !== "string" ||
    !claims.keyId.trim() ||
    claims.keyId.length > 128 ||
    typeof claims.sessionId !== "string" ||
    !claims.sessionId.trim() ||
    claims.sessionId.length > 160 ||
    !Array.isArray(claims.requiredSafetyFeatures) ||
    claims.requiredSafetyFeatures.length > MAX_REQUIRED_SAFETY_FEATURES ||
    claims.requiredSafetyFeatures.some(
      feature =>
        typeof feature !== "string" || !feature.trim() || feature.length > 128
    )
    ||
    new Set(claims.requiredSafetyFeatures).size !==
      claims.requiredSafetyFeatures.length
  ) {
    return "RUNNER_AUTHORITY_GRANT_SCOPE_INVALID";
  }
  return null;
}

/** Issue a bounded Runner authority grant only for the explicitly enabled
 * Session Host path. The signing key comes from the control-plane secret
 * manager through process environment and is never returned or persisted.
 */
export function issueRunnerExecutionAuthorityGrant(input: {
  session: RunnerExecutionSessionBinding;
  effectClass: string;
  leaseExpiresAt: Date;
  commandDeadline: Date;
  requiredSafetyFeatures: string[];
  now?: Date;
  privateKeyPem?: string;
  keyId?: string;
  grantId?: string;
}): RunnerExecutionAuthorityGrant | null {
  if (process.env.SMARTAIHUB_SPEC278_SESSION_HOST !== "true") return null;
  const keyId = input.keyId ?? process.env.SMARTAIHUB_SPEC278_AUTHORITY_KEY_ID;
  const privateKeyPem =
    input.privateKeyPem ?? process.env.SMARTAIHUB_SPEC278_AUTHORITY_SIGNING_KEY_PEM;
  if (!keyId?.trim() || !privateKeyPem?.trim()) {
    throw new Error("RUNNER_AUTHORITY_SIGNING_KEY_UNAVAILABLE");
  }
  const now = input.now ?? new Date();
  const issuedAtUnixMs = now.getTime();
  const notAfterUnixMs = Math.min(
    issuedAtUnixMs + RUNNER_EXECUTION_AUTHORITY_GRANT_MAX_TTL_MS,
    input.leaseExpiresAt.getTime(),
    input.commandDeadline.getTime()
  );
  const features = [...new Set(input.requiredSafetyFeatures)].sort();
  if (
    !Number.isSafeInteger(issuedAtUnixMs) ||
    !Number.isSafeInteger(notAfterUnixMs) ||
    notAfterUnixMs <= issuedAtUnixMs ||
    !Number.isSafeInteger(input.session.generation) ||
    !Number.isSafeInteger(input.session.authorityEpoch) ||
    !Number.isSafeInteger(input.session.placementEpoch) ||
    !Number.isSafeInteger(input.session.jobControlRevision) ||
    input.session.generation < 1 ||
    input.session.authorityEpoch < 1 ||
    input.session.placementEpoch < 1 ||
    input.session.jobControlRevision < 1 ||
    !input.effectClass.trim() ||
    input.effectClass.length > 128 ||
    features.length > MAX_REQUIRED_SAFETY_FEATURES ||
    features.some(feature => !feature.trim() || feature.length > 128)
  ) {
    throw new Error("RUNNER_AUTHORITY_GRANT_INVALID");
  }
  const claims: RunnerExecutionAuthorityClaims = {
    grantId: input.grantId ?? randomUUID(),
    keyId,
    workerJobId: input.session.workerJobId,
    sessionId: input.session.sessionId,
    runnerId: input.session.runnerId ?? "",
    sessionGeneration: input.session.generation,
    authorityEpoch: input.session.authorityEpoch,
    placementEpoch: input.session.placementEpoch,
    jobControlRevision: input.session.jobControlRevision,
    effectClass: input.effectClass,
    issuedAtUnixMs,
    notAfterUnixMs,
    requiredSafetyFeatures: features,
  };
  if (!claims.runnerId.trim()) throw new Error("RUNNER_AUTHORITY_GRANT_INVALID");
  const signatureBase64 = signBytes(
    "RSA-SHA256",
    Buffer.from(JSON.stringify(claims), "utf8"),
    privateKeyPem.replace(/\\n/g, "\n")
  ).toString("base64");
  return { claims, signatureBase64 };
}
