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
  /** Feature 136 (selection redesign, 2026-07-23) — optional. Enrollment is
   *  presence of this entry (a checkbox on the Product Images grid), never
   *  having a label; `undefined` means a normal, unlabeled supporting angle
   *  ("auto"), never evidence-only. */
  angleLabel?: SequentialAngleLabel;
  evidenceOnly: boolean;
};

export type SequentialClaimSource = { text: string; support: string };

/**
 * Marketplace spare-image repair (2026-07-23) — one already-generated,
 * already-paid-for candidate frame for a shot, sourced from a non-selected
 * image-attempt wave. `qualityScore` is the WHOLE-WAVE QA score (this
 * system never scores a single shot in isolation) and is `null` when that
 * wave was never scored. `isSelected` marks whichever wave is currently
 * live for this shot right now.
 */
export type SequentialShotAlternate = {
  attempt: number;
  qualityScore: number | null;
  imageUrl: string;
  isSelected: boolean;
};

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
  /** Legacy Auto Review's per-shot video output, when the old run already
   * persisted the completed clip array. */
  videoUrl?: string | null;
  /** Empty when the shot has fewer than 2 contributing image-attempt waves
   *  (the common case — the server OMITS the key entirely rather than
   *  persisting an empty array). Read from the TOP-LEVEL
   *  `metadataJson.sequentialShotAlternates[String(shotId)]`, mirroring
   *  `storyboardFrameUrls` — never nested under `sequentialStoryboard`. */
  alternates: SequentialShotAlternate[];
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
 * One shot's raw `metadataJson.sequentialShotAlternates[shotId]` value ->
 * `SequentialShotAlternate[]`. Never throws — a missing key, a non-array
 * value, or malformed entries all resolve to `[]`, which is also the
 * CORRECT (non-error) shape for the common case: a shot with fewer than 2
 * contributing image-attempt waves has its key omitted entirely by the
 * server, never persisted as an empty array — both must read as "no
 * spares". Malformed entries (missing/non-finite `attempt`, empty
 * `imageUrl`) are dropped individually rather than discarding the whole
 * list.
 */
function projectSequentialShotAlternateEntries(
  raw: unknown
): SequentialShotAlternate[] {
  if (!Array.isArray(raw)) return [];

  const alternates: SequentialShotAlternate[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const attempt = Number(entry.attempt);
    const imageUrl = cleanText(entry.imageUrl);
    if (!Number.isFinite(attempt) || attempt <= 0 || !imageUrl) continue;
    alternates.push({
      attempt,
      qualityScore:
        typeof entry.qualityScore === "number" ? entry.qualityScore : null,
      imageUrl,
      isSelected: entry.isSelected === true,
    });
  }
  return alternates;
}

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
  const videoUrls = Array.isArray(asRecord(metadataJson).videoClipUrls)
    ? (asRecord(metadataJson).videoClipUrls as unknown[])
    : [];
  // Marketplace spare-image repair — top-level on `metadataJson` (mirrors
  // `storyboardFrameUrls` above), never nested under `sequentialStoryboard`.
  const shotAlternates = asRecord(
    asRecord(metadataJson).sequentialShotAlternates
  );

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
      videoUrl: cleanText(videoUrls[shotId - 1]) || null,
      alternates: projectSequentialShotAlternateEntries(
        shotAlternates[String(shotId)]
      ),
      edited,
      editedAt: edited ? cleanText(override.editedAt) || null : null,
    });
  }

  return cards.sort((a, b) => a.shotId - b.shotId);
}

/* -------------------------------------------------------------------------- */
/* Storyboard Review clip list linkage                                       */
/* -------------------------------------------------------------------------- */

/**
 * Marketplace spare-image repair — Storyboard Review clip list placement
 * (2026-07-23 user feedback on b661284a6 moved the spare-image strip out of
 * the collapsed 9-shot grid and directly under each clip's own "Ref"
 * thumbnail in the clip list). Resolves which `SequentialShotCardModel` (if
 * any) a Storyboard Review clip/task corresponds to.
 *
 * Preferred linkage: `taskShotIdHint`, the clip's own
 * `storyboardContext.extraParams.shotId` string (when the per-shot video
 * generation pipeline set one, e.g. `"shot-3"` — see
 * `getStoryboardTaskShotId` in `storyboardReviewWorkspace.ts`). Reading the
 * TRAILING integer off this string survives the clip being reordered via
 * "up"/"down", because the id is stored ON the task, not derived from its
 * current list position.
 *
 * Fallback: positional — clip index N (0-based `task.index`) maps to shot
 * N+1. This mirrors how the clip list already labels the clip itself
 * ("Clip {task.index + 1}") and only applies when no explicit hint is
 * present, matching the per_shot pipeline's shot-ordered clip creation.
 *
 * Returns `undefined` when neither resolves to a card in `shots` — callers
 * must render nothing rather than guess a wrong shot.
 */
export function resolveSequentialShotCardForStoryboardTask(input: {
  taskIndex: number;
  taskShotIdHint?: string | null;
  shots: readonly SequentialShotCardModel[];
}): SequentialShotCardModel | undefined {
  if (input.shots.length === 0) return undefined;

  const hint = cleanText(input.taskShotIdHint);
  if (hint) {
    const match = /(\d+)\s*$/.exec(hint);
    const shotId = match ? Number(match[1]) : NaN;
    if (Number.isFinite(shotId)) {
      const byHint = input.shots.find(shot => shot.shotId === shotId);
      if (byHint) return byHint;
    }
  }

  const positionalShotId = input.taskIndex + 1;
  return input.shots.find(shot => shot.shotId === positionalShotId);
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
 * Already-selected product images (Feature 136 selection redesign — the
 * caller is expected to pass only ENROLLED images, i.e. images with a
 * checkbox-driven entry; this function never decides enrollment itself) +
 * optional user angle labels -> ordered, deduped (by hash, else by URL),
 * <=8 angle entries, primary excluded. Pure selection-state projection —
 * attachment ORDER, evidence-only exclusion for provider submission, and
 * dedupe against server-side truth are owned by the server (section 02);
 * this only drives the client picker + meter. `angleLabel` is optional per
 * entry; `undefined` means a normal supporting angle (never evidence-only).
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
  angleLabels: Record<string, SequentialAngleLabel | undefined>;
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

    const angleLabel = input.angleLabels?.[image.id];
    entries.push({
      imageId: image.id,
      url,
      ref: cleanText(image.ref) || null,
      hash,
      storageKey: cleanText(image.storageKey) || null,
      source: cleanText(image.source) || "marketplace_product_image",
      angleLabel,
      evidenceOnly: angleLabel
        ? isSequentialEvidenceOnlyAngleLabel(angleLabel)
        : false,
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
    // `angleLabel` is optional on the shared candidate type (undefined =
    // "auto"); this display-only list falls back to the "other" display key
    // for an unlabeled trimmed angle, without changing any stored value.
    trimmedAngles: result.trimmedAngles.map(
      candidate => candidate.angleLabel ?? "other"
    ),
    capacityImpossible: result.requiredSlotsExceedCap,
  };
}
