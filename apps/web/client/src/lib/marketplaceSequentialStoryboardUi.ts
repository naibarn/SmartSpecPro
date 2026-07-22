/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.1. Pure client projections + selection helpers for the
 * sequential-shot-storyboard UI. No React, no tRPC, no `Date.now()` in
 * output (every date-like field is passed through verbatim from server
 * data, never generated here). Tolerant readers: `undefined`, malformed, or
 * legacy 3x3 metadata never throw — every projector degrades to an
 * empty/null result (spec §5.1).
 *
 * Field names read from `metadataJson` are snake_case to match the real
 * persisted shape (`SequentialStoryboardShot` /
 * `SequentialStoryboardLoopReport`, `server/services/
 * productReviewSequentialStoryboardSkillRunner.ts`) — this module reads
 * that wire shape and projects it into the camelCase UI models below. It
 * never re-derives capacity/trim arithmetic (delegates to the shared
 * section-05 helper) and never rewrites or truncates prompt text.
 */
import {
  computeSequentialReferenceCapacity,
  type SequentialReferenceAngleCandidate,
} from "@shared/marketplaceCapture/sequentialEvidencePreview";

export type SequentialAngleLabel =
  | "front"
  | "back"
  | "side"
  | "top"
  | "base"
  | "detail"
  | "package"
  | "parts_diagram"
  | "scale"
  | "other";

export const SEQUENTIAL_ANGLE_LABELS: readonly SequentialAngleLabel[] = [
  "front",
  "back",
  "side",
  "top",
  "base",
  "detail",
  "package",
  "parts_diagram",
  "scale",
  "other",
];

// Evidence-only angles are never attached to the model (spec §8.3) — they
// exist purely as claim-evidence for the skill/preflight, so the capacity
// meter must never count them as competing for an attachment slot.
const SEQUENTIAL_EVIDENCE_ONLY_ANGLE_LABELS = new Set<SequentialAngleLabel>([
  "package",
  "parts_diagram",
]);

export function isSequentialEvidenceOnlyAngleLabel(
  label: SequentialAngleLabel
): boolean {
  return SEQUENTIAL_EVIDENCE_ONLY_ANGLE_LABELS.has(label);
}

export function isSequentialFrameStrategy(
  value: unknown
): value is "sequential_shot_storyboard" {
  return value === "sequential_shot_storyboard";
}

export type SequentialAngleSelectionEntry = {
  imageId: string;
  url: string;
  ref?: string | null;
  hash?: string | null;
  storageKey?: string | null;
  source: string;
  angleLabel: SequentialAngleLabel;
  evidenceOnly: boolean;
};

export type SequentialClaimSource = { text: string; support: string };

export type SequentialShotCardModel = {
  shotId: number;
  purpose: string;
  demonstrationType: string;
  depictsMinor: boolean;
  guardianRequired: boolean;
  dialogue: string;
  imagePrompt: string;
  imagePromptChars: number;
  videoPrompt: string;
  videoPromptChars: number;
  claimSources: SequentialClaimSource[];
  qcStatus: string;
  qcScores?: Record<string, number>;
  frameUrl?: string | null;
  edited: boolean;
  editedAt?: string | null;
};

export type SequentialLoopReportRound = {
  round: number;
  totalScore?: number;
  candidateCount: number;
  disqualified?: boolean;
  summary?: string;
};

export type SequentialLoopReportModel = {
  rounds: SequentialLoopReportRound[];
  /** Parsed from the persisted `"round_N"` label; `null` when unparsable
   *  (e.g. `"unknown"`/`"degraded"`/`"none"`). */
  selectedVersion?: number | null;
  degradedFallback?: boolean;
};

export type SequentialChildSubjectPolicy = {
  productChildRelated: boolean;
  childDepictionPlanned: boolean;
  guardianReferenceRef?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Tolerant guards                                                           */
/* -------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sequentialStoryboardRecord(
  metadataJson: unknown
): Record<string, unknown> {
  return asRecord(asRecord(metadataJson).sequentialStoryboard);
}

/* -------------------------------------------------------------------------- */
/* Shot cards                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * metadataJson -> per-shot card models (`shotOverrides` applied, `edited`
 * flagged). Never throws — a non-array/missing `shots`, a legacy 3x3
 * metadata blob, or malformed entries all resolve to `[]`.
 */
export function projectSequentialShotCards(
  metadataJson: unknown
): SequentialShotCardModel[] {
  const sequential = sequentialStoryboardRecord(metadataJson);
  const rawShots = Array.isArray(sequential.shots) ? sequential.shots : [];
  const overrides = asRecord(sequential.shotOverrides);
  const frameUrls = Array.isArray(asRecord(metadataJson).storyboardFrameUrls)
    ? (asRecord(metadataJson).storyboardFrameUrls as unknown[])
    : [];

  const cards: SequentialShotCardModel[] = [];
  for (const rawShot of rawShots) {
    if (!isPlainObject(rawShot)) continue;
    const shotId = Number(rawShot.shot_id);
    if (!Number.isFinite(shotId) || shotId <= 0) continue;

    const override = asRecord(overrides[String(shotId)]);
    const edited = Object.keys(override).length > 0;

    const dialogue =
      cleanText(override.dialogue) || cleanText(rawShot.dialogue);
    const imagePrompt =
      cleanText(override.start_frame_image_prompt) ||
      cleanText(rawShot.start_frame_image_prompt);
    const videoPrompt =
      cleanText(override.video_prompt) || cleanText(rawShot.video_prompt);

    const claimTrace = Array.isArray(rawShot.claim_trace)
      ? rawShot.claim_trace
      : [];
    const claimSources: SequentialClaimSource[] = claimTrace
      .filter(isPlainObject)
      .map(entry => ({
        text: cleanText(entry.text),
        support: cleanText(entry.support),
      }));

    const qc = asRecord(rawShot.qc);
    const qcScores: Record<string, number> = {};
    for (const [key, value] of Object.entries(qc)) {
      if (key === "status") continue;
      if (typeof value === "number") qcScores[key] = value;
    }

    cards.push({
      shotId,
      purpose: cleanText(rawShot.purpose),
      demonstrationType: cleanText(rawShot.demonstration_type),
      depictsMinor: rawShot.depicts_minor === true,
      guardianRequired: rawShot.guardian_required === true,
      dialogue,
      imagePrompt,
      imagePromptChars: imagePrompt.length,
      videoPrompt,
      videoPromptChars: videoPrompt.length,
      claimSources,
      qcStatus: cleanText(qc.status),
      qcScores: Object.keys(qcScores).length > 0 ? qcScores : undefined,
      frameUrl: cleanText(frameUrls[shotId - 1]) || null,
      edited,
      editedAt: edited ? cleanText(override.editedAt) || null : null,
    });
  }

  return cards.sort((a, b) => a.shotId - b.shotId);
}

/* -------------------------------------------------------------------------- */
/* Loop report                                                               */
/* -------------------------------------------------------------------------- */

const SEQUENTIAL_LOOP_ROUND_KEYS = ["round_1", "round_2", "round_3"] as const;

function parseRoundNumberFromSelectedVersion(value: string): number | null {
  const match = /^round_(\d+)$/.exec(value);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * metadataJson.sequentialStoryboard.loopReport -> UI model, or `null` when
 * `loopReport` itself is absent (legacy 3x3 metadata, or a sequential run
 * that has not reached prompt_plan yet). Once `loopReport` exists (even with
 * zero completed rounds, e.g. the degraded-fallback path, which persists
 * only `{selected_version: "degraded"}`), a model is always returned so the
 * degraded-fallback note can render — "absent" and "present with zero
 * rounds" are deliberately different outcomes.
 */
export function projectSequentialLoopReport(
  metadataJson: unknown
): SequentialLoopReportModel | null {
  const sequential = sequentialStoryboardRecord(metadataJson);
  const loopReportRaw = sequential.loopReport;
  if (!isPlainObject(loopReportRaw)) return null;

  const rounds: SequentialLoopReportRound[] = [];
  for (const key of SEQUENTIAL_LOOP_ROUND_KEYS) {
    const raw = loopReportRaw[key];
    if (!isPlainObject(raw)) continue;
    const roundNumberFromKey = Number(key.split("_")[1]);
    const round =
      typeof raw.round === "number" && Number.isFinite(raw.round)
        ? raw.round
        : roundNumberFromKey;
    const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
    const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
    rounds.push({
      round,
      totalScore:
        typeof raw.totalScore === "number" ? raw.totalScore : undefined,
      candidateCount: candidates.length,
      disqualified: Array.isArray(raw.disqualifiers)
        ? raw.disqualifiers.length > 0
        : undefined,
      summary: notes || undefined,
    });
  }

  const selectedVersionRaw = cleanText(loopReportRaw.selected_version);
  const selectedVersion = selectedVersionRaw
    ? parseRoundNumberFromSelectedVersion(selectedVersionRaw)
    : null;

  return {
    rounds,
    selectedVersion,
    degradedFallback: sequential.degraded === true,
  };
}

/* -------------------------------------------------------------------------- */
/* Guardian state                                                            */
/* -------------------------------------------------------------------------- */

function extractRunChildSubjectPolicy(
  metadataJson: unknown
): SequentialChildSubjectPolicy | null {
  const sequential = sequentialStoryboardRecord(metadataJson);
  const raw = sequential.childSubjectPolicy;
  if (!isPlainObject(raw)) return null;
  if (typeof raw.productChildRelated !== "boolean") return null;
  return {
    productChildRelated: raw.productChildRelated,
    childDepictionPlanned: raw.childDepictionPlanned === true,
    guardianReferenceRef: cleanText(raw.guardianReferenceRef) || null,
  };
}

function extractRunGuardianManifestAttached(metadataJson: unknown): boolean {
  const sequential = sequentialStoryboardRecord(metadataJson);
  const manifest = Array.isArray(sequential.referenceManifest)
    ? sequential.referenceManifest
    : [];
  return manifest.some(entry => isPlainObject(entry) && entry.role === "character");
}

/**
 * Guardian notice state from the plan preview (pre-run) and/or run metadata
 * (in-run). Pre-run, `childDepictionPlanned` is always `false` by
 * construction (spec §5.5 — "unknown until the skill runs"), so the plan
 * preview activates on `productChildRelated` alone. Once run metadata's
 * `sequentialStoryboard.childSubjectPolicy` exists, it reflects the REAL
 * shots (`depicts_minor`), so both flags are required. Never throws.
 */
export function projectSequentialGuardianState(input: {
  planChildSubjectPolicy?: {
    productChildRelated: boolean;
    childDepictionPlanned: boolean;
    guardianReferenceRef?: string;
  } | null;
  metadataJson?: unknown;
  characterReferenceAttached?: boolean;
}): { active: boolean; guardianReferenceAttached: boolean } {
  const characterAttached = Boolean(input.characterReferenceAttached);
  const runPolicy = extractRunChildSubjectPolicy(input.metadataJson);

  if (runPolicy) {
    const guardianFromManifest = extractRunGuardianManifestAttached(
      input.metadataJson
    );
    return {
      active: runPolicy.productChildRelated && runPolicy.childDepictionPlanned,
      guardianReferenceAttached:
        characterAttached ||
        guardianFromManifest ||
        Boolean(runPolicy.guardianReferenceRef),
    };
  }

  const planPolicy = input.planChildSubjectPolicy ?? null;
  if (planPolicy) {
    return {
      active: planPolicy.productChildRelated === true,
      guardianReferenceAttached:
        characterAttached || Boolean(planPolicy.guardianReferenceRef),
    };
  }

  return { active: false, guardianReferenceAttached: characterAttached };
}

/* -------------------------------------------------------------------------- */
/* Angle selection + capacity meter                                          */
/* -------------------------------------------------------------------------- */

const SEQUENTIAL_ANGLE_SELECTION_MAX_ENTRIES = 8;

/**
 * Product images + user angle labels -> ordered, deduped (by hash, else by
 * URL), <=8 angle entries, primary excluded. Pure selection-state
 * projection — attachment ORDER, evidence-only exclusion for provider
 * submission, and dedupe against server-side truth are owned by the server
 * (section 02); this only drives the client picker + meter.
 */
export function buildSequentialAngleSelectionEntries(input: {
  images: ReadonlyArray<{
    id: string;
    url: string;
    ref?: string | null;
    hash?: string | null;
    storageKey?: string | null;
    source?: string | null;
  }>;
  primaryImageId?: string | null;
  angleLabels: Record<string, SequentialAngleLabel>;
}): SequentialAngleSelectionEntry[] {
  const entries: SequentialAngleSelectionEntry[] = [];
  const seen = new Set<string>();

  for (const image of input.images ?? []) {
    if (entries.length >= SEQUENTIAL_ANGLE_SELECTION_MAX_ENTRIES) break;
    if (!image || !cleanText(image.id) || !cleanText(image.url)) continue;
    if (input.primaryImageId && image.id === input.primaryImageId) continue;

    const url = cleanText(image.url);
    const hash = cleanText(image.hash) || null;
    const dedupeKey = hash ? `hash:${hash}` : `url:${url}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const angleLabel = input.angleLabels?.[image.id] ?? "other";
    entries.push({
      imageId: image.id,
      url,
      ref: cleanText(image.ref) || null,
      hash,
      storageKey: cleanText(image.storageKey) || null,
      source: cleanText(image.source) || "marketplace_product_image",
      angleLabel,
      evidenceOnly: isSequentialEvidenceOnlyAngleLabel(angleLabel),
    });
  }

  return entries;
}

/**
 * Live capacity meter. Delegates to `computeSequentialReferenceCapacity`
 * (never re-derives trim rules) and excludes evidence-only entries before
 * they ever compete for an attachment slot, mirroring the server
 * resolver's own precondition (section 02, `resolveSequentialReferenceAttachmentPlan`).
 */
export function resolveSequentialCapacityMeter(input: {
  modelCap: number;
  entries: readonly SequentialAngleSelectionEntry[];
  guardianReserved: boolean;
  environmentAttached: boolean;
}): {
  modelCap: number;
  attachedAngles: number;
  trimmedAngles: string[];
  capacityImpossible: boolean;
} {
  const angleCandidates: SequentialReferenceAngleCandidate[] = (
    input.entries ?? []
  )
    .filter(entry => !entry.evidenceOnly)
    .map(entry => ({ ref: entry.imageId, angleLabel: entry.angleLabel }));

  const result = computeSequentialReferenceCapacity({
    modelCap: input.modelCap,
    angleCandidates,
    guardianRequired: input.guardianReserved,
    guardianPresent: input.guardianReserved,
    environmentPresent: input.environmentAttached,
  });

  return {
    modelCap: result.modelCap,
    attachedAngles: result.attachedAngleCount,
    trimmedAngles: result.trimmedAngles.map(candidate => candidate.angleLabel),
    capacityImpossible: result.requiredSlotsExceedCap,
  };
}
