/**
 * Marketplace Auto Review — Feature 136 (sequential 9-image storyboard).
 *
 * Cross-section decision (spec §6 invariant 8, review round 1): the
 * reservation/trim arithmetic for the sequential storyboard's reference
 * images is SINGLE-SOURCED here. `resolveSequentialReferenceAttachmentPlan`
 * (server `marketplaceAutoReviewService.ts`, section 02) calls
 * `computeSequentialReferenceCapacity` to decide which angles survive a tight
 * model cap and which are trimmed, then layers on the server-only concerns it
 * owns (URL resolution, dedupe, attachment ORDER, evidence-only exclusion,
 * the fail-closed capacity throw). Section 05's plan-surface preview and
 * section 11's capacity meter ("ใช้ได้ {n}/{modelCap}" + trim warning chip)
 * both call this SAME function, so the UI meter can never drift from what the
 * server actually attaches. Section 05 extends this file with the
 * evidence-preview functions that build on this capacity result — it does
 * NOT re-derive the trim rules.
 *
 * Pure module — no server/db imports, no I/O, never throws (capacity
 * failures are reported via `requiredSlotsExceedCap` for the caller to act
 * on; only the server resolver decides whether/how to fail closed). Every
 * `modelCap`/count here is clamped to a non-negative integer so a caller
 * passing bad input degrades to "nothing fits" rather than throwing or going
 * negative.
 */

import { z } from "zod";

/**
 * One user-selected product angle candidate, already in user-selection
 * order, before capacity trimming. Only the fields the capacity calculation
 * itself needs — server-side URL resolution, dedupe, and evidence-only
 * exclusion happen upstream of this call (SVC
 * `resolveSequentialReferenceAttachmentPlan`); this module is pure math over
 * already-resolved, already-deduped candidates.
 */
export interface SequentialReferenceAngleCandidate {
  /** Stable identifier for trimmedAngles / meter display (a ref or resolved URL). */
  ref: string;
  /**
   * Optional (checkbox-selection UX): `undefined` means the user selected
   * this image as a supporting angle WITHOUT tagging a specific label — it
   * is still a normal angle candidate for capacity purposes, never
   * evidence-only and never dropped by this module (the caller decides
   * evidence-only status upstream from the label, not this type).
   */
  angleLabel?: string;
}

export interface SequentialReferenceCapacityInput {
  modelCap: number;
  /**
   * Angle candidates in user-selection order. Evidence-only angles
   * (`package` / `parts_diagram`) must already be excluded by the caller —
   * they never compete for an attachment slot.
   */
  angleCandidates: readonly SequentialReferenceAngleCandidate[];
  /** Whether a guardian/character reference slot is a hard requirement. */
  guardianRequired: boolean;
  /**
   * Whether a guardian/character reference is present at all. A present
   * guardian is reserved a slot ahead of angles even when not strictly
   * required (spec §5.5 step 5) — it simply does not cause a fail-closed
   * throw if it ends up not fitting.
   */
  guardianPresent: boolean;
  /** Whether an environment reference is present (never a hard requirement). */
  environmentPresent: boolean;
}

export interface SequentialReferenceCapacityResult {
  modelCap: number;
  /** 1 (primary) + 1 more only when the guardian is a hard requirement. */
  requiredReservedSlots: number;
  /**
   * True when even the hard-required slots (primary + required guardian)
   * exceed `modelCap`. This function never throws — the caller (server
   * resolver) decides whether/how to fail closed on this flag.
   */
  requiredSlotsExceedCap: boolean;
  guardianAttached: boolean;
  environmentAttached: boolean;
  /** Remaining slots available to angle candidates after primary/guardian/environment reservation. */
  angleSlotCount: number;
  /** Angle candidates that survive the cap, in original user order. */
  attachedAngles: SequentialReferenceAngleCandidate[];
  /** Angle candidates trimmed off the END, in trimmed order (first-trimmed first). */
  trimmedAngles: SequentialReferenceAngleCandidate[];
  attachedAngleCount: number;
}

/**
 * Slot RESERVATION priority (spec §5.5 step 5 — who survives a tight cap):
 * primary (1, always) → guardian (1, when required OR merely present) →
 * environment (1, when present) → remaining slots to angles, in user order,
 * with surplus trimmed from the END. This is a strict greedy allocation, not
 * a proportional split: whoever is earlier in priority simply takes a slot
 * first, and whoever doesn't fit afterward is left unattached (never a
 * throw, except via the caller's own required-slots check).
 *
 * NOTE: reservation priority and final attachment ORDER are different rules
 * (spec §5.5 step 6) — this function only decides WHO survives, not the
 * final `@ImageN` numbering. The server resolver owns attachment order.
 */
export function computeSequentialReferenceCapacity(
  input: SequentialReferenceCapacityInput,
): SequentialReferenceCapacityResult {
  const modelCap = Math.max(0, Math.floor(Number(input.modelCap) || 0));
  const requiredReservedSlots = 1 + (input.guardianRequired ? 1 : 0);
  const requiredSlotsExceedCap = requiredReservedSlots > modelCap;

  // Primary always takes the first slot (the resolver's fail-closed check
  // covers the case where even primary alone can't fit, i.e. modelCap === 0).
  let remaining = Math.max(0, modelCap - 1);

  let guardianAttached = false;
  if (input.guardianPresent && remaining > 0) {
    guardianAttached = true;
    remaining -= 1;
  }

  let environmentAttached = false;
  if (input.environmentPresent && remaining > 0) {
    environmentAttached = true;
    remaining -= 1;
  }

  const angleSlotCount = Math.max(0, remaining);
  const angleCandidates = input.angleCandidates.slice();
  const attachedAngles = angleCandidates.slice(0, angleSlotCount);
  const trimmedAngles = angleCandidates.slice(angleSlotCount);

  return {
    modelCap,
    requiredReservedSlots,
    requiredSlotsExceedCap,
    guardianAttached,
    environmentAttached,
    angleSlotCount,
    attachedAngles,
    trimmedAngles,
    attachedAngleCount: attachedAngles.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Section 05 (§5.5) — deterministic evidence preview & assembly derivation.  */
/* Pure, text-only, no I/O, no timestamps, no LLM/vision — sibling of the    */
/* capacity helper above. Full VISUAL verification happens in-run (skill     */
/* Phase A); this module only ever claims `source: "text"` /                */
/* `"user_confirmed"` confidence, never `"visual_verified"` (spec §5.5 cost  */
/* rule — the plan query must stay cheap).                                  */
/* -------------------------------------------------------------------------- */

export type AssemblyDocumentationDerivation = {
  documented: boolean;
  /** Short quoted snippets / labels, never full source text. */
  evidence: string[];
  source: "text" | "user_confirmed" | "parts_diagram_reference" | "none";
};

// Machine-checkable keyword lexicon only (mirrors the repo's other
// text-signal detectors, e.g. `referenceIndexMap.ts`) — no attempt at full
// NLU. Conservative by construction: a product that merely mentions
// "furniture" without one of these markers stays `documented: false`.
const ASSEMBLY_STEP_PATTERN =
  /step\s*\d|ขั้นตอนที่\s*\d|ขั้นตอนการประกอบ|ขั้นตอนการติดตั้ง/i;
const ASSEMBLY_PARTS_LIST_PATTERN =
  /parts list|package includes|box contents|what'?s in the box|รายการชิ้นส่วน|อุปกรณ์ในกล่อง|สิ่งที่ได้รับในกล่อง|รายการอุปกรณ์/i;
const ASSEMBLY_SECTION_PATTERN =
  /assembly instructions?|installation guide|self-assembly|some assembly required|คู่มือการประกอบ|คู่มือการติดตั้ง|วิธีการประกอบ|วิธีติดตั้ง|ประกอบเอง/i;
const ASSEMBLY_KEY_HINT_PATTERN = /assembly|installation|ประกอบ|ติดตั้ง/i;

function findAssemblyTextEvidence(text: string): string[] {
  const evidence: string[] = [];
  for (const pattern of [
    ASSEMBLY_STEP_PATTERN,
    ASSEMBLY_PARTS_LIST_PATTERN,
    ASSEMBLY_SECTION_PATTERN,
  ]) {
    const match = pattern.exec(text);
    if (match?.[0]) evidence.push(match[0]);
  }
  return evidence;
}

/**
 * Deterministic text-level assembly-evidence derivation (spec §5.5).
 * `documented` is true ONLY when the captured product text explicitly
 * documents assembly (numbered steps, a parts/contents list, an assembly or
 * installation section) or the user confirmed it via `confirmedAttributes`.
 * A `partsDiagramAttached` reference image can also justify it, but images
 * are NOT inspected here — the caller passes that flag from the angle
 * labels it already resolved. Conservative by construction: unknown ⇒
 * false ⇒ the section-07 demonstration guard forbids assembly content
 * until real evidence exists (spec §11.5 — a false negative costs a pivot
 * to benefit framing; a false positive ships invented parts).
 */
export function deriveAssemblyDocumentationFromProductTruth(input: {
  productName: string;
  description: string;
  specs: Record<string, string>;
  confirmedAttributes?: Record<string, string>;
  partsDiagramAttached?: boolean;
}): AssemblyDocumentationDerivation {
  const specsText = Object.entries(input.specs ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const combinedText = [input.productName, input.description, specsText]
    .filter(Boolean)
    .join("\n");
  const textEvidence = findAssemblyTextEvidence(combinedText);

  const confirmedEvidence: string[] = [];
  for (const [key, value] of Object.entries(
    input.confirmedAttributes ?? {}
  )) {
    if (
      ASSEMBLY_KEY_HINT_PATTERN.test(key) ||
      findAssemblyTextEvidence(String(value ?? "")).length > 0
    ) {
      confirmedEvidence.push(`${key}: ${value}`);
    }
  }

  if (confirmedEvidence.length > 0) {
    return {
      documented: true,
      evidence: confirmedEvidence,
      source: "user_confirmed",
    };
  }
  if (textEvidence.length > 0) {
    return { documented: true, evidence: textEvidence, source: "text" };
  }
  if (input.partsDiagramAttached) {
    return {
      documented: true,
      evidence: ["parts_diagram_reference_image_attached"],
      source: "parts_diagram_reference",
    };
  }
  return { documented: false, evidence: [], source: "none" };
}

export type SequentialEvidenceConfirmationItem = {
  id: string;
  attribute: string;
  claimText: string;
  reason: string;
  sources: string[];
};

export type SequentialEvidenceHighlight = {
  attribute: string;
  value: string;
  source: "text" | "user_confirmed";
};

export type SequentialEvidencePreviewChildSubjectPolicy = {
  productChildRelated: boolean;
  childDepictionPlanned: boolean;
  guardianReferenceRef?: string;
};

export type SequentialEvidencePreviewInput = {
  productName: string;
  description: string;
  specs: Record<string, string>;
  categoryText?: string;
  /** Section-01 override, echoed back. */
  confirmedAttributes?: Record<string, string>;
  forbiddenClaims?: string[];
  guardianReferenceRef?: string | null;
  /** Computed by the caller (SVC `computeMarketplaceAutoReviewChildSubjectPolicy`, `shots: undefined`). */
  productChildRelated: boolean;
};

export type SequentialEvidencePreview = {
  needsConfirmation: SequentialEvidenceConfirmationItem[];
  verifiedHighlights: SequentialEvidenceHighlight[];
  childSubjectPolicy: SequentialEvidencePreviewChildSubjectPolicy;
  assemblyDocumentation: AssemblyDocumentationDerivation;
};

/**
 * Mechanical numeric+unit extraction for the title-vs-description conflict
 * check (spec §5.5/§4.2). Deliberately mechanical (exact/normalized value
 * comparison per the SAME unit) — no unit conversion, no fuzzy matching;
 * creative wording/attribute-naming judgment belongs to the skill, never
 * here (skill-first boundary).
 */
const NUMERIC_UNIT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(cm|ซม\.?|mm|มม\.?|kg|กก\.?|ml|มล\.?|inch(?:es)?|นิ้ว|m\.?|ม\.?|g\.?|กรัม|l\.?|ลิตร)\b/gi;

function normalizeUnit(unit: string): string {
  return unit.toLowerCase().replace(/\./g, "").trim();
}

function firstNumericValueByUnit(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of String(text ?? "").matchAll(NUMERIC_UNIT_PATTERN)) {
    const unit = normalizeUnit(match[2]);
    if (!result.has(unit)) result.set(unit, match[1]);
  }
  return result;
}

function detectTitleDescriptionConflicts(
  productName: string,
  description: string
): SequentialEvidenceConfirmationItem[] {
  const titleValues = firstNumericValueByUnit(productName);
  const descriptionValues = firstNumericValueByUnit(description);
  const conflicts: SequentialEvidenceConfirmationItem[] = [];
  for (const [unit, titleValue] of titleValues) {
    const descriptionValue = descriptionValues.get(unit);
    if (descriptionValue !== undefined && descriptionValue !== titleValue) {
      conflicts.push({
        id: `title_description_conflict:${unit}`,
        attribute: unit,
        claimText: `${titleValue} ${unit} (title) vs ${descriptionValue} ${unit} (description)`,
        reason: "title_description_conflict",
        sources: ["title", "description"],
      });
    }
  }
  return conflicts;
}

function normalizedContains(haystack: string, needle: string): boolean {
  const normalizedNeedle = needle.trim().toLowerCase();
  if (!normalizedNeedle) return false;
  return haystack.toLowerCase().includes(normalizedNeedle);
}

/**
 * Deterministic, text-only evidence preview (spec §5.5). No LLM, no vision,
 * no network, no `Date.now`/randomness — calling this twice with the same
 * input yields deep-equal output (spec §4.2 determinism test).
 */
export function buildSequentialEvidencePreview(
  input: SequentialEvidencePreviewInput
): SequentialEvidencePreview {
  const forbidden = (input.forbiddenClaims ?? []).filter(Boolean);
  const confirmedAttributes = input.confirmedAttributes ?? {};
  const confirmedKeys = new Set(Object.keys(confirmedAttributes));

  const conflicts = detectTitleDescriptionConflicts(
    input.productName,
    input.description
  );
  const needsConfirmation: SequentialEvidenceConfirmationItem[] = [];
  const highlightsFromConflicts: SequentialEvidenceHighlight[] = [];
  for (const conflict of conflicts) {
    if (confirmedKeys.has(conflict.attribute)) {
      highlightsFromConflicts.push({
        attribute: conflict.attribute,
        value: confirmedAttributes[conflict.attribute],
        source: "user_confirmed",
      });
    } else {
      needsConfirmation.push(conflict);
    }
  }

  const specHighlights: SequentialEvidenceHighlight[] = Object.entries(
    input.specs ?? {}
  )
    .filter(([key]) => !confirmedKeys.has(key))
    .map(([key, value]) => ({
      attribute: key,
      value: String(value),
      source: "text" as const,
    }));

  const confirmedHighlights: SequentialEvidenceHighlight[] = Object.entries(
    confirmedAttributes
  )
    .filter(([key]) => !highlightsFromConflicts.some(h => h.attribute === key))
    .map(([key, value]) => ({
      attribute: key,
      value,
      source: "user_confirmed" as const,
    }));

  const verifiedHighlights = [
    ...specHighlights,
    ...highlightsFromConflicts,
    ...confirmedHighlights,
  ].filter(
    highlight =>
      !forbidden.some(
        claim =>
          normalizedContains(highlight.value, claim) ||
          normalizedContains(highlight.attribute, claim)
      )
  );

  const assemblyDocumentation = deriveAssemblyDocumentationFromProductTruth({
    productName: input.productName,
    description: input.description,
    specs: input.specs,
    confirmedAttributes: input.confirmedAttributes,
  });

  return {
    needsConfirmation,
    verifiedHighlights,
    childSubjectPolicy: {
      productChildRelated: input.productChildRelated,
      // Unknown until the skill runs (spec §5.5 documented semantic) — the
      // preview never claims a shot-level fact it cannot observe pre-run.
      childDepictionPlanned: false,
      guardianReferenceRef: input.guardianReferenceRef ?? undefined,
    },
    assemblyDocumentation,
  };
}

/* -------------------------------------------------------------------------- */
/* Zod wire schemas — consumed by shared/hyperframes/runtimeApiSchemas.ts.    */
/* Mirror the TS types above / `SequentialReferenceCapacityResult` exactly;   */
/* keep both in sync if either changes.                                      */
/* -------------------------------------------------------------------------- */

export const SequentialEvidenceConfirmationItemSchema = z
  .object({
    id: z.string().min(1),
    attribute: z.string().min(1),
    claimText: z.string().min(1),
    reason: z.string().min(1),
    sources: z.array(z.string().min(1)),
  })
  .strict();

export const SequentialEvidenceHighlightSchema = z
  .object({
    attribute: z.string().min(1),
    value: z.string(),
    source: z.enum(["text", "user_confirmed"]),
  })
  .strict();

export const SequentialEvidencePreviewChildSubjectPolicySchema = z
  .object({
    productChildRelated: z.boolean(),
    childDepictionPlanned: z.boolean(),
    guardianReferenceRef: z.string().min(1).optional(),
  })
  .strict();

export const AssemblyDocumentationDerivationSchema = z
  .object({
    documented: z.boolean(),
    evidence: z.array(z.string()),
    source: z.enum([
      "text",
      "user_confirmed",
      "parts_diagram_reference",
      "none",
    ]),
  })
  .strict();

export const SequentialEvidencePreviewSchema = z
  .object({
    needsConfirmation: z.array(SequentialEvidenceConfirmationItemSchema),
    verifiedHighlights: z.array(SequentialEvidenceHighlightSchema),
    childSubjectPolicy: SequentialEvidencePreviewChildSubjectPolicySchema,
    assemblyDocumentation: AssemblyDocumentationDerivationSchema,
  })
  .strict();

export const SequentialReferenceAngleCandidateSchema = z
  .object({
    ref: z.string().min(1),
    angleLabel: z.string().min(1).optional(),
  })
  .strict();

export const SequentialReferenceCapacitySchema = z
  .object({
    modelCap: z.number().int().min(0),
    requiredReservedSlots: z.number().int().min(0),
    requiredSlotsExceedCap: z.boolean(),
    guardianAttached: z.boolean(),
    environmentAttached: z.boolean(),
    angleSlotCount: z.number().int().min(0),
    attachedAngles: z.array(SequentialReferenceAngleCandidateSchema),
    trimmedAngles: z.array(SequentialReferenceAngleCandidateSchema),
    attachedAngleCount: z.number().int().min(0),
  })
  .strict();

export type SequentialReferenceCapacity = z.infer<
  typeof SequentialReferenceCapacitySchema
>;
