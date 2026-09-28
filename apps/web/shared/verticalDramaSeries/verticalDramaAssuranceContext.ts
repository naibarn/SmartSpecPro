import { z } from "zod";
import { canonicalJsonStringify, sha256Hex } from "./artifacts";
import {
  VD_SOURCE_DISCLOSURE_STATUSES,
  VD_SOURCE_PACK_STATUSES,
  VD_SOURCE_RIGHTS_STATUSES,
} from "./sourcePack";
import {
  VISUAL_EVIDENCE_STATUSES,
  VISUAL_SEMANTIC_ROLES,
} from "./visualSource";

export const VERTICAL_DRAMA_PRODUCTION_CONTEXT_SCHEMA_VERSION = 1;
export const PRODUCTION_CONTEXT_READINESS_STATES = [
  "draft",
  "verified",
  "provider_ready",
  "production_ready",
  "needs_review",
] as const;
export const PRODUCTION_CONTEXT_BLOCKING_REASONS = [
  "source_pack_missing",
  "source_pack_not_ready",
  "visual_source_missing",
  "visual_evidence_insufficient",
  "visual_rights_insufficient",
  "visual_disclosure_insufficient",
  "coverage_incomplete",
  "context_facts_missing",
] as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const referenceListSchema = z.array(z.string().trim().min(1)).max(2048);

export const ProductionContextReadinessSchema = z
  .object({
    state: z.enum(PRODUCTION_CONTEXT_READINESS_STATES),
    blockingReasons: z.array(z.enum(PRODUCTION_CONTEXT_BLOCKING_REASONS)).default([]),
  })
  .strict();
export type ProductionContextReadiness = z.infer<
  typeof ProductionContextReadinessSchema
>;

export const ProductionContextSourcePackDecisionSchema = z.enum([
  "selected",
  "explicit_none",
]);
export type ProductionContextSourcePackDecision = z.infer<
  typeof ProductionContextSourcePackDecisionSchema
>;

export const ProductionContextSourcePackRefSchema = z
  .object({
    packId: z.number().int().positive(),
    version: z.number().int().positive(),
    fingerprint: hashSchema,
    readiness: z.enum(VD_SOURCE_PACK_STATUSES),
    slotKeys: referenceListSchema.default([]),
    assetIds: z.array(z.number().int().positive()).max(2048).default([]),
    segmentIds: referenceListSchema.default([]),
    semanticRoles: z.array(z.enum(VISUAL_SEMANTIC_ROLES)).max(256).default([]),
    evidenceStatuses: z.array(z.enum(VISUAL_EVIDENCE_STATUSES)).max(256).default([]),
    rightsStatuses: z.array(z.enum(VD_SOURCE_RIGHTS_STATUSES)).max(256).default([]),
    disclosureStatuses: z.array(z.enum(VD_SOURCE_DISCLOSURE_STATUSES)).max(256).default([]),
  })
  .strict();
export type ProductionContextSourcePackRef = z.infer<
  typeof ProductionContextSourcePackRefSchema
>;

export const ProductionContextSnapshotRefSchema = z
  .object({
    snapshotId: z.string().trim().min(1).max(128),
    revision: z.number().int().positive(),
    fingerprint: hashSchema,
  })
  .strict();
export type ProductionContextSnapshotRef = z.infer<
  typeof ProductionContextSnapshotRefSchema
>;

const versionedFingerprintSchema = z
  .object({ version: z.number().int().positive(), fingerprint: hashSchema })
  .strict();
const profileSchema = z
  .object({
    profileId: z.string().trim().min(1).max(96),
    version: z.number().int().positive(),
    contentKind: z.enum(["fiction", "documentary", "review", "hybrid"]),
    visualGroundingVersion: z.number().int().positive(),
    visualGroundingFingerprint: hashSchema,
    factPolicyVersion: z.number().int().positive(),
    brollPolicyVersion: z.number().int().positive(),
  })
  .strict();
const visualSourceSchema = z
  .object({
    snapshotId: z.string().trim().min(1).max(128),
    revision: z.number().int().positive(),
    fingerprint: hashSchema,
    visualCanonVersion: z.number().int().positive(),
    visualCanonFingerprint: hashSchema,
  })
  .strict();
const referencesSchema = z
  .object({
    storyControlRefs: referenceListSchema.default([]),
    characterRefs: referenceListSchema.default([]),
    sceneRefs: referenceListSchema.default([]),
    shotRefs: referenceListSchema.default([]),
    claimRefs: referenceListSchema.default([]),
    coverageRefs: referenceListSchema.default([]),
    slotRefs: referenceListSchema.default([]),
    assetRefs: referenceListSchema.default([]),
    segmentRefs: referenceListSchema.default([]),
    // Timeline binding order is authoritative and deliberately not sorted.
    mediaBindingRefs: referenceListSchema.default([]),
  })
  .strict();

export const ProductionContextSnapshotInputSchema = z
  .object({
    schemaVersion: z.literal(VERTICAL_DRAMA_PRODUCTION_CONTEXT_SCHEMA_VERSION),
    snapshotId: z.string().trim().min(1).max(128),
    revision: z.number().int().positive(),
    seriesId: z.number().int().positive(),
    profile: profileSchema,
    sourcePackPolicy: z.enum(["required", "optional", "not_applicable"]),
    sourcePackDecision: ProductionContextSourcePackDecisionSchema,
    sourcePack: ProductionContextSourcePackRefSchema.nullable(),
    visualSource: visualSourceSchema,
    claimLedger: versionedFingerprintSchema.nullable(),
    coveragePlan: versionedFingerprintSchema.nullable(),
    references: referencesSchema,
    readiness: ProductionContextReadinessSchema.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.sourcePackDecision === "selected" && !value.sourcePack) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourcePack"], message: "selected_source_pack_requires_reference" });
    }
    if (value.sourcePackDecision === "explicit_none" && value.sourcePack) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourcePack"], message: "explicit_none_source_pack_requires_null" });
    }
    if (value.sourcePackDecision === "explicit_none" && value.sourcePackPolicy === "required") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourcePackDecision"], message: "required_source_pack_cannot_be_explicit_none" });
    }
  });
export type ProductionContextSnapshotInput = z.infer<
  typeof ProductionContextSnapshotInputSchema
>;

export const ProductionContextSnapshotSchema = ProductionContextSnapshotInputSchema.and(z.object({
  fingerprint: hashSchema,
  readiness: ProductionContextReadinessSchema,
}).passthrough());
export type ProductionContextSnapshot = z.infer<
  typeof ProductionContextSnapshotSchema
>;

function sortStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function sortNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function normalizeInput(input: ProductionContextSnapshotInput): ProductionContextSnapshotInput {
  return {
    ...input,
    sourcePack: input.sourcePack
      ? {
          ...input.sourcePack,
          slotKeys: sortStrings(input.sourcePack.slotKeys),
          assetIds: sortNumbers(input.sourcePack.assetIds),
          segmentIds: sortStrings(input.sourcePack.segmentIds),
          semanticRoles: sortStrings(input.sourcePack.semanticRoles) as typeof input.sourcePack.semanticRoles,
          evidenceStatuses: sortStrings(input.sourcePack.evidenceStatuses) as typeof input.sourcePack.evidenceStatuses,
          rightsStatuses: sortStrings(input.sourcePack.rightsStatuses) as typeof input.sourcePack.rightsStatuses,
          disclosureStatuses: sortStrings(input.sourcePack.disclosureStatuses) as typeof input.sourcePack.disclosureStatuses,
        }
      : null,
    references: {
      storyControlRefs: sortStrings(input.references.storyControlRefs),
      characterRefs: sortStrings(input.references.characterRefs),
      sceneRefs: sortStrings(input.references.sceneRefs),
      shotRefs: sortStrings(input.references.shotRefs),
      claimRefs: sortStrings(input.references.claimRefs),
      coverageRefs: sortStrings(input.references.coverageRefs),
      slotRefs: sortStrings(input.references.slotRefs),
      assetRefs: sortStrings(input.references.assetRefs),
      segmentRefs: sortStrings(input.references.segmentRefs),
      mediaBindingRefs: [...input.references.mediaBindingRefs],
    },
  };
}

function deriveReadiness(input: ProductionContextSnapshotInput): ProductionContextReadiness {
  const blockingReasons: ProductionContextReadiness["blockingReasons"] = [];
  if (input.sourcePackPolicy === "required" && !input.sourcePack) {
    blockingReasons.push("source_pack_missing");
  } else if (input.sourcePack && input.sourcePack.readiness !== "production_ready") {
    blockingReasons.push("source_pack_not_ready");
  }
  return blockingReasons.length ? { state: "needs_review", blockingReasons } : { state: "production_ready", blockingReasons: [] };
}

function fingerprintPayload(snapshot: ProductionContextSnapshotInput | ProductionContextSnapshot) {
  const { snapshotId: _snapshotId, revision: _revision, readiness: _readiness, fingerprint: _fingerprint, ...payload } = snapshot as ProductionContextSnapshotInput & { fingerprint?: string };
  return payload;
}

/** Hashes only authoritative, canonicalized context facts. */
export function fingerprintProductionContextSnapshot(input: ProductionContextSnapshotInput | ProductionContextSnapshot): string {
  const parsed = ProductionContextSnapshotInputSchema.parse(input);
  return sha256Hex(canonicalJsonStringify(fingerprintPayload(normalizeInput(parsed))));
}

export function buildProductionContextSnapshot(input: ProductionContextSnapshotInput): ProductionContextSnapshot {
  const normalized = normalizeInput(ProductionContextSnapshotInputSchema.parse(input));
  const readiness = ProductionContextReadinessSchema.parse(normalized.readiness ?? deriveReadiness(normalized));
  return ProductionContextSnapshotSchema.parse({
    ...normalized,
    readiness,
    fingerprint: fingerprintProductionContextSnapshot(normalized),
  });
}

export type ProductionContextSnapshotRefValidation =
  | { ok: true }
  | { ok: false; code: "VD_ASSURANCE_CONTEXT_STALE"; reason: "snapshot_id" | "revision" | "fingerprint" };

export function validateProductionContextSnapshotRef(snapshot: ProductionContextSnapshot, expected: ProductionContextSnapshotRef): ProductionContextSnapshotRefValidation {
  const ref = ProductionContextSnapshotRefSchema.parse({
    snapshotId: expected.snapshotId,
    revision: expected.revision,
    fingerprint: expected.fingerprint,
  });
  if (snapshot.snapshotId !== ref.snapshotId) return { ok: false, code: "VD_ASSURANCE_CONTEXT_STALE", reason: "snapshot_id" };
  if (snapshot.revision !== ref.revision) return { ok: false, code: "VD_ASSURANCE_CONTEXT_STALE", reason: "revision" };
  if (snapshot.fingerprint !== ref.fingerprint) return { ok: false, code: "VD_ASSURANCE_CONTEXT_STALE", reason: "fingerprint" };
  return { ok: true };
}

export function productionContextStaleReasons(previous: ProductionContextSnapshot, current: ProductionContextSnapshot): string[] {
  const changes: string[] = [];
  if (canonicalJsonStringify(previous.profile) !== canonicalJsonStringify(current.profile)) changes.push("profile");
  if (previous.sourcePackPolicy !== current.sourcePackPolicy || previous.sourcePackDecision !== current.sourcePackDecision || canonicalJsonStringify(previous.sourcePack) !== canonicalJsonStringify(current.sourcePack)) changes.push("source_pack");
  if (canonicalJsonStringify(previous.visualSource) !== canonicalJsonStringify(current.visualSource)) changes.push("visual_canon");
  if (canonicalJsonStringify(previous.claimLedger) !== canonicalJsonStringify(current.claimLedger)) changes.push("claim_ledger");
  if (canonicalJsonStringify(previous.coveragePlan) !== canonicalJsonStringify(current.coveragePlan)) changes.push("coverage_plan");
  if (canonicalJsonStringify(previous.references) !== canonicalJsonStringify(current.references)) changes.push("references");
  return changes;
}
