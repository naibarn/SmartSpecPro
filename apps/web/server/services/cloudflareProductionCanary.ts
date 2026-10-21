import { z } from "zod";

/**
 * Cloudflare percentage deployments divide requests between Worker versions;
 * they do not leave the remainder on the previous DNS/origin destination.
 * Production canary therefore requires an already active, known-safe Worker
 * version as the 99% baseline.
 */
export const CLOUDFLARE_PRODUCTION_ROUTE_PATTERN = "smartaihub.app/*" as const;
export const CLOUDFLARE_PRODUCTION_CANARY_PERCENT = 1 as const;

const versionId = z.string().uuid();
const routeId = z.string().min(1).max(32);

export const cloudflareProductionRouteStateSchema = z.object({
  zoneId: z.string().regex(/^[a-f0-9]{32}$/),
  routeId: routeId.nullable(),
  pattern: z.literal(CLOUDFLARE_PRODUCTION_ROUTE_PATTERN),
  script: z.string().nullable(),
}).strict();

export type CloudflareProductionRouteState = z.infer<typeof cloudflareProductionRouteStateSchema>;

export type CloudflareProductionVersion = Readonly<{
  versionId: string;
  sourceSha: string;
  buildDigest: string;
  configurationDigest: string;
}>;

export type CloudflareProductionBaseline = CloudflareProductionVersion & Readonly<{
  deploymentId: string;
}>;

export type CloudflareProductionVersionWeight = Readonly<{
  version_id: string;
  percentage: number;
}>;

export class CloudflareProductionCanaryError extends Error {
  constructor(readonly diagnosticCode: string) {
    super(diagnosticCode);
    this.name = "CloudflareProductionCanaryError";
  }
}

/** The first production route must be installed only after the runtime is proven on staging. */
export function assertProductionRouteMatchesGrant(input: {
  expectedZoneId: string;
  expectedScript: "smartspec-cloudflare-runtime";
  expectedRouteId: string | null;
  expectedRouteScript: "smartspec-cloudflare-runtime" | null;
  current: CloudflareProductionRouteState;
}) {
  const parsed = cloudflareProductionRouteStateSchema.safeParse(input.current);
  if (!parsed.success || parsed.data.zoneId !== input.expectedZoneId ||
      parsed.data.routeId !== input.expectedRouteId || parsed.data.script !== input.expectedRouteScript ||
      (parsed.data.routeId === null ? parsed.data.script !== null : parsed.data.script !== input.expectedScript)) {
    throw new CloudflareProductionCanaryError("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
  }
  return parsed.data;
}

/**
 * Build a 1% Worker canary only when the remaining 99% is an independently
 * verified Cloudflare Worker release. An origin/DNS fallback is not a version
 * and cannot be smuggled in as a percentage deployment.
 */
export function buildProductionCanaryWeights(input: {
  baseline: CloudflareProductionBaseline | null;
  expectedBaseline: Omit<CloudflareProductionVersion, "versionId">;
  candidate: CloudflareProductionVersion;
  expectedCandidate: Omit<CloudflareProductionVersion, "versionId" | "deploymentId">;
  candidatePercent?: number;
}): readonly CloudflareProductionVersionWeight[] {
  const candidatePercent = input.candidatePercent ?? CLOUDFLARE_PRODUCTION_CANARY_PERCENT;
  if (!input.baseline || !versionId.safeParse(input.baseline.versionId).success ||
      !versionId.safeParse(input.candidate.versionId).success ||
      input.baseline.versionId === input.candidate.versionId ||
      candidatePercent !== CLOUDFLARE_PRODUCTION_CANARY_PERCENT ||
      input.candidate.sourceSha !== input.expectedCandidate.sourceSha ||
      input.candidate.buildDigest !== input.expectedCandidate.buildDigest ||
      input.candidate.configurationDigest !== input.expectedCandidate.configurationDigest ||
      !/^[a-f0-9]{40}$/.test(input.baseline.sourceSha) ||
      !/^[a-f0-9]{64}$/.test(input.baseline.buildDigest) ||
      !/^[a-f0-9]{64}$/.test(input.baseline.configurationDigest) ||
      !/^[a-f0-9-]{36}$/i.test(input.baseline.deploymentId) ||
      input.baseline.sourceSha !== input.expectedBaseline.sourceSha ||
      input.baseline.buildDigest !== input.expectedBaseline.buildDigest ||
      input.baseline.configurationDigest !== input.expectedBaseline.configurationDigest) {
    throw new CloudflareProductionCanaryError("CLOUDFLARE_PRODUCTION_CANARY_BASELINE_OR_CANDIDATE_INVALID");
  }
  return [
    { version_id: input.baseline.versionId, percentage: 100 - candidatePercent },
    { version_id: input.candidate.versionId, percentage: candidatePercent },
  ];
}

/** Promotion is a distinct, separately authorized operation after canary probes pass. */
export function buildProductionPromotionWeights(input: {
  candidate: CloudflareProductionVersion;
  canaryEvidence: { deploymentId: string; candidateVersionId: string; candidatePercent: number; verifiedAt: string };
  now?: Date;
}) {
  const candidate = input.candidate;
  const verifiedAt = Date.parse(input.canaryEvidence.verifiedAt);
  const now = input.now ?? new Date();
  if (!versionId.safeParse(candidate.versionId).success ||
      !/^[a-f0-9]{40}$/.test(candidate.sourceSha) ||
      !/^[a-f0-9]{64}$/.test(candidate.buildDigest) ||
      !/^[a-f0-9]{64}$/.test(candidate.configurationDigest) ||
      !/^[a-f0-9-]{36}$/i.test(input.canaryEvidence.deploymentId) ||
      input.canaryEvidence.candidateVersionId !== candidate.versionId ||
      input.canaryEvidence.candidatePercent !== CLOUDFLARE_PRODUCTION_CANARY_PERCENT ||
      !Number.isFinite(verifiedAt) || verifiedAt > now.getTime() || now.getTime() - verifiedAt > 30 * 60_000) {
    throw new CloudflareProductionCanaryError("CLOUDFLARE_PRODUCTION_PROMOTION_CANDIDATE_INVALID");
  }
  return [{ version_id: candidate.versionId, percentage: 100 }] as const;
}
