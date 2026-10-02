import {
  getThailandProviderPack,
  isThailandCapabilityQualified,
  type ThailandCapabilityDefinition,
  type ThailandQualificationEvidence,
  type ThailandSourceDefinition,
} from "./manifest";

export type ThailandCapabilityHealthStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "DEGRADED"
  | "STALE"
  | "NOT_CONFIGURED"
  | "TEMPORARILY_UNAVAILABLE"
  | "UNSUPPORTED";

export type ThailandCapabilityDataState =
  | "HAS_DATA"
  | "EMPTY_HEALTHY"
  | "EXPECTED_SILENCE"
  | "INCOMPLETE_PAGINATION"
  | "OUTAGE"
  | "NO_SUCCESS";

export interface ThailandCapabilityHealth {
  readonly status: ThailandCapabilityHealthStatus;
  readonly publishable: boolean;
  readonly dataState: ThailandCapabilityDataState;
  readonly geography: string;
  readonly lastSuccessAt?: string;
  readonly staleAgeSeconds?: number;
}

export interface EvaluateThailandCapabilityHealthInput {
  readonly source: ThailandSourceDefinition;
  readonly capability: ThailandCapabilityDefinition;
  readonly evidence: Partial<ThailandQualificationEvidence>;
  /** Current geography for this projection, e.g. TH-10. */
  readonly geography: string;
  /** Optional already-reviewed coverage set; when present it takes precedence over evidence metadata. */
  readonly verifiedGeographies?: readonly string[];
  readonly lastSuccessAt?: string;
  readonly now: string;
  readonly lastResult?:
    | "HAS_DATA"
    | "EMPTY_HEALTHY"
    | "EXPECTED_SILENCE"
    | "INCOMPLETE_PAGINATION"
    | "OUTAGE"
    | "NO_SUCCESS";
}

const GEO_CODE = /^(?:TH|TH-[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,3})$/;
const ISO_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function hasValidClock(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 32 &&
    ISO_CLOCK.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function codeContains(parent: string, child: string): boolean {
  return parent === child || child.startsWith(`${parent}-`);
}

function supportsTargetScope(
  capability: ThailandCapabilityDefinition,
  geography: string
): boolean {
  return (
    GEO_CODE.test(geography) &&
    capability.geographyScopes.some(scope => codeContains(scope, geography))
  );
}

function capabilityIsInManifest(
  source: ThailandSourceDefinition,
  capability: ThailandCapabilityDefinition
): boolean {
  return getThailandProviderPack().sources.some(
    candidate =>
      candidate.sourceId === source.sourceId &&
      candidate.capabilities.some(
        candidateCapability =>
          candidateCapability.capabilityId === capability.capabilityId
      )
  );
}

/** Converts verified source/coverage evidence and the latest capture outcome into a safe capability status. */
export function evaluateThailandCapabilityHealth(
  input: EvaluateThailandCapabilityHealthInput
): ThailandCapabilityHealth {
  const { source, capability, evidence, geography } = input;
  const empty = (
    status: ThailandCapabilityHealthStatus
  ): ThailandCapabilityHealth => ({
    status,
    publishable: false,
    dataState: input.lastResult ?? "NO_SUCCESS",
    geography,
    ...(input.lastSuccessAt === undefined
      ? {}
      : { lastSuccessAt: input.lastSuccessAt }),
  });

  if (
    !capabilityIsInManifest(source, capability) ||
    !supportsTargetScope(capability, geography) ||
    !Array.isArray(capability.geographyScopes)
  ) {
    return empty("UNSUPPORTED");
  }
  if (!hasValidClock(input.now)) return empty("DEGRADED");
  if (
    evidence.expectedCadenceSeconds === undefined ||
    evidence.staleAfterSeconds === undefined
  )
    return empty("NOT_CONFIGURED");
  if (
    !Number.isSafeInteger(evidence.expectedCadenceSeconds) ||
    evidence.expectedCadenceSeconds < 1 ||
    !Number.isSafeInteger(evidence.staleAfterSeconds) ||
    evidence.staleAfterSeconds < evidence.expectedCadenceSeconds
  ) {
    return empty("DEGRADED");
  }

  const effectiveEvidence: Partial<ThailandQualificationEvidence> = {
    ...evidence,
    verifiedGeographies:
      input.verifiedGeographies ?? evidence.verifiedGeographies,
  };
  if (
    !isThailandCapabilityQualified(
      source,
      capability,
      effectiveEvidence,
      geography
    )
  )
    return empty("NOT_CONFIGURED");

  const result =
    input.lastResult ?? (input.lastSuccessAt ? "HAS_DATA" : "NO_SUCCESS");
  if (
    result === "OUTAGE" ||
    result === "NO_SUCCESS" ||
    input.lastSuccessAt === undefined
  ) {
    return { ...empty("TEMPORARILY_UNAVAILABLE"), dataState: result };
  }
  if (!hasValidClock(input.lastSuccessAt)) return empty("DEGRADED");

  const nowMs = Date.parse(input.now);
  const successMs = Date.parse(input.lastSuccessAt);
  if (successMs > nowMs) return empty("DEGRADED");
  const staleAgeSeconds = Math.floor((nowMs - successMs) / 1000);
  if (result === "INCOMPLETE_PAGINATION") {
    return {
      status: "PARTIAL",
      publishable: false,
      dataState: result,
      geography,
      lastSuccessAt: input.lastSuccessAt,
      staleAgeSeconds,
    };
  }
  if (staleAgeSeconds > (evidence.staleAfterSeconds as number)) {
    return {
      status: "STALE",
      publishable: false,
      dataState: result,
      geography,
      lastSuccessAt: input.lastSuccessAt,
      staleAgeSeconds,
    };
  }
  if (
    result !== "HAS_DATA" &&
    result !== "EMPTY_HEALTHY" &&
    result !== "EXPECTED_SILENCE"
  )
    return empty("DEGRADED");
  return {
    status: "AVAILABLE",
    publishable: true,
    dataState: result === "HAS_DATA" ? "HAS_DATA" : result,
    geography,
    lastSuccessAt: input.lastSuccessAt,
    staleAgeSeconds,
  };
}
