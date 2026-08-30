import { getSeriesProfile, type VdSeriesProfile } from "../../shared/verticalDramaSeries/seriesProfile";
import { evaluateSourcePackReadiness, type VdSourceAssetForReadiness, type VdSourcePackSlotForReadiness } from "../../shared/verticalDramaSeries/sourcePack";
import type { VisualSourceSnapshot } from "../../shared/verticalDramaSeries/visualSource";
import {
  buildProductionContextSnapshot,
  validateProductionContextSnapshotRef,
  type ProductionContextReadiness,
  type ProductionContextSnapshot,
  type ProductionContextSnapshotRef,
  type ProductionContextSourcePackRef,
} from "../../shared/verticalDramaSeries/verticalDramaAssuranceContext";
import type { VerticalDramaAssuranceReadiness, VerticalDramaAssuranceSourceRef } from "../../shared/verticalDramaSeries/assurance";

export type ProductionContextOwner = { tenantId: string; userId: number | string };
export type ProductionContextSourcePack = ProductionContextSourcePackRef & {
  slots?: VdSourcePackSlotForReadiness[];
  assets?: VdSourceAssetForReadiness[];
  promptExpansion?: { approved: boolean };
};
export type ProductionContextReferences = ProductionContextSnapshot["references"];
export interface ProductionContextCaptureDependencies {
  loadSeriesOwner(owner: ProductionContextOwner, seriesId: number): Promise<ProductionContextOwner | null>;
  loadProfile(owner: ProductionContextOwner, seriesId: number): Promise<VdSeriesProfile>;
  loadSourcePack(owner: ProductionContextOwner, seriesId: number): Promise<ProductionContextSourcePack | null>;
  loadVisualSnapshot(owner: ProductionContextOwner, seriesId: number): Promise<VisualSourceSnapshot | null>;
  loadClaimLedger(owner: ProductionContextOwner, seriesId: number): Promise<{ version: number; fingerprint: string } | null>;
  loadCoveragePlan(owner: ProductionContextOwner, seriesId: number): Promise<{ version: number; fingerprint: string } | null>;
  loadReferences(owner: ProductionContextOwner, seriesId: number): Promise<ProductionContextReferences>;
}

export type ProductionContextFinding = { code: "VD_ASSURANCE_TENANT_MISMATCH" | "VD_ASSURANCE_CONTEXT_MISSING" | "VD_ASSURANCE_CONTEXT_STALE" | "VD_ASSURANCE_SOURCE_NOT_READY"; message: string };
export type ProductionContextCaptureResult = { ok: true; snapshot: ProductionContextSnapshot } | { ok: false; finding: ProductionContextFinding };

function sameOwner(left: ProductionContextOwner, right: ProductionContextOwner): boolean {
  return left.tenantId === right.tenantId && String(left.userId) === String(right.userId);
}

function readinessRank(value: ProductionContextReadiness["state"] | VerticalDramaAssuranceReadiness): number {
  return { needs_review: -1, draft: 0, verified: 1, provider_ready: 2, production_ready: 3 }[value];
}

export function evaluateProductionContextReadiness(input: { profile: VdSeriesProfile; sourcePack: ProductionContextSourcePack | null; visualSnapshot: VisualSourceSnapshot | null; coverageReady?: boolean }): ProductionContextReadiness {
  const blockingReasons: ProductionContextReadiness["blockingReasons"] = [];
  if (!input.visualSnapshot) blockingReasons.push("visual_source_missing");
  if (input.profile.sourceGatePolicy === "required" && !input.sourcePack) blockingReasons.push("source_pack_missing");
  // Optional source absence is a valid, explicit authoring decision, but it is
  // not enough evidence for a paid/provider boundary. Keep preview/editing
  // available while requiring an explicit source or later final-gate proof.
  if (input.profile.sourceGatePolicy === "optional" && !input.sourcePack) blockingReasons.push("context_facts_missing");
  if (input.sourcePack?.slots && input.sourcePack.assets) {
    const readiness = evaluateSourcePackReadiness({ profile: input.profile, slots: input.sourcePack.slots, assets: input.sourcePack.assets, promptExpansion: input.sourcePack.promptExpansion });
    if (!readiness.productionReady) blockingReasons.push("source_pack_not_ready");
  } else if (input.sourcePack && input.sourcePack.readiness !== "production_ready") {
    blockingReasons.push("source_pack_not_ready");
  }
  if (input.coverageReady === false) blockingReasons.push("coverage_incomplete");
  return blockingReasons.length ? { state: "draft", blockingReasons } : { state: "production_ready", blockingReasons: [] };
}

export async function captureProductionContextSnapshot(input: { owner: ProductionContextOwner; seriesId: number; snapshotId: string; revision: number }, deps: ProductionContextCaptureDependencies): Promise<ProductionContextCaptureResult> {
  const authoritativeOwner = await deps.loadSeriesOwner(input.owner, input.seriesId);
  if (!authoritativeOwner || !sameOwner(input.owner, authoritativeOwner)) {
    return { ok: false, finding: { code: "VD_ASSURANCE_TENANT_MISMATCH", message: "Series does not belong to the supplied tenant and user" } };
  }
  const [profile, sourcePack, visualSnapshot, claimLedger, coveragePlan, references] = await Promise.all([
    deps.loadProfile(input.owner, input.seriesId), deps.loadSourcePack(input.owner, input.seriesId), deps.loadVisualSnapshot(input.owner, input.seriesId),
    deps.loadClaimLedger(input.owner, input.seriesId), deps.loadCoveragePlan(input.owner, input.seriesId), deps.loadReferences(input.owner, input.seriesId),
  ]);
  if (!visualSnapshot) return { ok: false, finding: { code: "VD_ASSURANCE_CONTEXT_MISSING", message: "An authoritative visual source snapshot is required" } };
  const readiness = evaluateProductionContextReadiness({ profile, sourcePack, visualSnapshot });
  try {
    const snapshot = buildProductionContextSnapshot({
      schemaVersion: 1, snapshotId: input.snapshotId, revision: input.revision, seriesId: input.seriesId,
      profile: { profileId: profile.profileId, version: profile.version, contentKind: profile.contentKind, visualGroundingVersion: profile.visualVersion, visualGroundingFingerprint: visualSnapshot.fingerprint, factPolicyVersion: profile.version, brollPolicyVersion: profile.version },
      sourcePackPolicy: profile.sourceGatePolicy === "required" ? "required" : "optional",
      sourcePackDecision: sourcePack ? "selected" : "explicit_none", sourcePack,
      visualSource: { snapshotId: visualSnapshot.snapshotId, revision: visualSnapshot.revision, fingerprint: visualSnapshot.fingerprint, visualCanonVersion: profile.visualVersion, visualCanonFingerprint: visualSnapshot.fingerprint },
      claimLedger, coveragePlan, references, readiness,
    });
    return { ok: true, snapshot };
  } catch {
    return { ok: false, finding: { code: "VD_ASSURANCE_CONTEXT_MISSING", message: "Authoritative production context is incomplete or invalid" } };
  }
}

export function validateProductionContextAdmission(input: { owner: ProductionContextOwner; expectedOwner?: ProductionContextOwner | null; snapshot: ProductionContextSnapshot; contextRef: ProductionContextSnapshotRef | null; sourceRef: VerticalDramaAssuranceSourceRef | null; requiredReadiness: VerticalDramaAssuranceReadiness }): ProductionContextFinding | null {
  if (input.expectedOwner && !sameOwner(input.owner, input.expectedOwner)) return { code: "VD_ASSURANCE_TENANT_MISMATCH", message: "Assurance owner does not match the authoritative series owner" };
  if (!input.contextRef) return { code: "VD_ASSURANCE_CONTEXT_MISSING", message: "Production context reference is required" };
  if (!validateProductionContextSnapshotRef(input.snapshot, input.contextRef).ok) return { code: "VD_ASSURANCE_CONTEXT_STALE", message: "Production context reference is stale" };
  if (input.snapshot.sourcePack) {
    if (!input.sourceRef) return { code: "VD_ASSURANCE_SOURCE_NOT_READY", message: "Selected source-pack reference is required" };
    if (input.sourceRef.packId !== input.snapshot.sourcePack.packId || input.sourceRef.version !== input.snapshot.sourcePack.version || input.sourceRef.fingerprint !== input.snapshot.sourcePack.fingerprint) return { code: "VD_ASSURANCE_CONTEXT_STALE", message: "Source-pack reference is stale" };
  } else if (input.snapshot.sourcePackPolicy === "required") {
    return { code: "VD_ASSURANCE_SOURCE_NOT_READY", message: "A required source pack is missing" };
  }
  if (readinessRank(input.snapshot.readiness.state) < readinessRank(input.requiredReadiness)) return { code: "VD_ASSURANCE_SOURCE_NOT_READY", message: "Production context does not meet the required readiness" };
  return null;
}

/** Default profile authority retained server-side for later router/job wiring. */
export function defaultProductionContextProfile(profileId: string): VdSeriesProfile {
  return getSeriesProfile(profileId);
}
