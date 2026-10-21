import { describe, expect, it } from "vitest";
import {
  assertProductionRouteMatchesGrant,
  buildProductionCanaryWeights,
  buildProductionPromotionWeights,
  CloudflareProductionCanaryError,
  CLOUDFLARE_PRODUCTION_ROUTE_PATTERN,
} from "./cloudflareProductionCanary";

const baseline = {
  versionId: "11111111-1111-4111-8111-111111111111",
  sourceSha: "a".repeat(40),
  buildDigest: "b".repeat(64),
  configurationDigest: "c".repeat(64),
  deploymentId: "22222222-2222-4222-8222-222222222222",
};
const candidate = {
  versionId: "33333333-3333-4333-8333-333333333333",
  sourceSha: "d".repeat(40),
  buildDigest: "e".repeat(64),
  configurationDigest: "f".repeat(64),
  deploymentId: "44444444-4444-4444-8444-444444444444",
};

describe("Cloudflare production canary contract", () => {
  it("binds the route to the exact zone, host pattern, and Worker", () => {
    const intended = { zoneId: "9".repeat(32), routeId: "route-a", pattern: CLOUDFLARE_PRODUCTION_ROUTE_PATTERN,
      script: "smartspec-cloudflare-runtime" };
    expect(assertProductionRouteMatchesGrant({ expectedZoneId: intended.zoneId,
      expectedScript: "smartspec-cloudflare-runtime", expectedRouteId: intended.routeId,
      expectedRouteScript: intended.script, current: intended })).toEqual(intended);
    expect(() => assertProductionRouteMatchesGrant({ expectedZoneId: intended.zoneId,
      expectedScript: "smartspec-cloudflare-runtime", expectedRouteId: intended.routeId,
      expectedRouteScript: intended.script, current: { ...intended, pattern: "*.smartaihub.app/*" } as never }))
      .toThrowError(CloudflareProductionCanaryError);
    expect(() => assertProductionRouteMatchesGrant({ expectedZoneId: intended.zoneId,
      expectedScript: "smartspec-cloudflare-runtime", expectedRouteId: intended.routeId,
      expectedRouteScript: intended.script, current: { ...intended, script: "smartspec-cloudflare-staging" } }))
      .toThrow("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
    expect(() => assertProductionRouteMatchesGrant({ expectedZoneId: "8".repeat(32),
      expectedScript: "smartspec-cloudflare-runtime", expectedRouteId: intended.routeId,
      expectedRouteScript: intended.script, current: intended }))
      .toThrow("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
    expect(() => assertProductionRouteMatchesGrant({ expectedZoneId: intended.zoneId,
      expectedScript: "smartspec-cloudflare-runtime", expectedRouteId: null,
      expectedRouteScript: null, current: intended }))
      .toThrow("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
  });

  it("refuses a first-release canary without a verified Worker baseline", () => {
    expect(() => buildProductionCanaryWeights({ baseline: null, expectedBaseline: baseline, candidate,
      expectedCandidate: { sourceSha: candidate.sourceSha, buildDigest: candidate.buildDigest,
        configurationDigest: candidate.configurationDigest } }))
      .toThrow("CLOUDFLARE_PRODUCTION_CANARY_BASELINE_OR_CANDIDATE_INVALID");
  });

  it("splits exactly 1% to the digest-bound candidate and keeps 99% on the known baseline", () => {
    expect(buildProductionCanaryWeights({ baseline, expectedBaseline: baseline, candidate,
      expectedCandidate: { sourceSha: candidate.sourceSha, buildDigest: candidate.buildDigest,
        configurationDigest: candidate.configurationDigest } })).toEqual([
      { version_id: baseline.versionId, percentage: 99 },
      { version_id: candidate.versionId, percentage: 1 },
    ]);
    expect(() => buildProductionCanaryWeights({ baseline, expectedBaseline: baseline, candidate, candidatePercent: 5,
      expectedCandidate: { sourceSha: candidate.sourceSha, buildDigest: candidate.buildDigest,
        configurationDigest: candidate.configurationDigest } }))
      .toThrow("CLOUDFLARE_PRODUCTION_CANARY_BASELINE_OR_CANDIDATE_INVALID");
    expect(() => buildProductionCanaryWeights({ baseline, expectedBaseline: baseline, candidate,
      expectedCandidate: { sourceSha: "0".repeat(40), buildDigest: candidate.buildDigest,
        configurationDigest: candidate.configurationDigest } }))
      .toThrow("CLOUDFLARE_PRODUCTION_CANARY_BASELINE_OR_CANDIDATE_INVALID");
    expect(() => buildProductionCanaryWeights({ baseline, expectedBaseline: { ...baseline, sourceSha: "0".repeat(40) }, candidate,
      expectedCandidate: { sourceSha: candidate.sourceSha, buildDigest: candidate.buildDigest,
        configurationDigest: candidate.configurationDigest } }))
      .toThrow("CLOUDFLARE_PRODUCTION_CANARY_BASELINE_OR_CANDIDATE_INVALID");
  });

  it("requires a separate explicit promotion plan after canary validation", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const canaryEvidence = { deploymentId: "55555555-5555-4555-8555-555555555555",
      candidateVersionId: candidate.versionId, candidatePercent: 1, verifiedAt: "2026-10-22T09:58:00Z" };
    expect(buildProductionPromotionWeights({ candidate, canaryEvidence, now })).toEqual([
      { version_id: candidate.versionId, percentage: 100 },
    ]);
    expect(() => buildProductionPromotionWeights({ candidate,
      canaryEvidence: { ...canaryEvidence, verifiedAt: "2026-10-22T09:54:59Z" }, now }))
      .toThrow("CLOUDFLARE_PRODUCTION_PROMOTION_CANDIDATE_INVALID");
  });
});
