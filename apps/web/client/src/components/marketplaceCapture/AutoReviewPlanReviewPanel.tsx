/**
 * Marketplace mandatory text-plan review gate (2026-07-23,
 * planning/marketplace-storyboard-text-gate, commit f997ba1a9). Every Auto
 * Review run now HOLDS after the text plan (`concept_story` +, for
 * sequential runs, the per-shot pack) is authored and BEFORE the
 * `image_generation` stage reserves any credit, until the user approves the
 * text or asks the AI to redraft it. Server contract:
 * `metadataJson.planReview = { required: true, status: "awaiting" |
 * "approved", heldAt?, approvedAt?, redraftCount, lastNotes }`
 * (`server/services/marketplaceAutoReviewService.ts`).
 *
 * Presentational component — props in, callbacks out, following the
 * `SequentialShotReviewSection` precedent: this file owns pure projection
 * helpers (exported for direct unit testing) that turn a run's raw
 * `metadataJson` into plain view-model props; `MarketplaceCaptureProductDetail.tsx`
 * calls those helpers and mounts this component, it never receives a raw
 * metadata blob itself. Renders `null` whenever `planReview` is absent or not
 * `{ required: true, status: "awaiting" }` — this is what makes the panel
 * self-disable for approved/older runs with zero page-level branching beyond
 * the caller's own guard (mirrors `SequentialShotReviewSection`'s
 * `shots.length === 0` self-disable).
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTO_STORYBOARD_QUALITY_MODE_ROUNDS,
  type AutoStoryboardQualityMode,
} from "./AutoStoryboardQualityModeControl";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

const REDRAFT_NOTES_MAX_CHARS = 2000;
// Marketplace mandatory text-plan review gate follow-up (2026-07-23 user
// feedback on the live gate) — matches the server's
// `updateAutoReviewPlanShotDialogue` input contract.
const SHOT_DIALOGUE_MAX_CHARS = 2000;
// One-stop plan-review gate (2026-07-23 user request — "ตรวจสอบรอบเดียว
// จบ"). Mirrors the SAME defaults `StoryboardReviewPage.tsx` already passes
// to `SequentialShotReviewSection`'s `budgets` prop (`{ imageMaxChars: 4000,
// videoMaxChars: 2000 }`) and the server's own
// `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS`
// (`server/services/marketplaceAutoReviewService.ts`) — the video budget has
// no per-run override today, so it is always this constant; the image
// budget defers to the run's own `sequentialImagePromptMaxChars` override
// when set (section 01, server-bounded 1000-4000).
const DEFAULT_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS = 4000;
const SEQUENTIAL_VIDEO_PROMPT_MAX_CHARS = 2000;
// Display heuristic only (roughly 3-4 lines of product facts) — collapses
// the product-facts block so a long spec sheet does not push the approve /
// redraft actions far below the fold. Never hides content outright; the
// section always defaults OPEN (see `PlanReviewProductDetail` below) because
// this text is the primary thing the gate exists to have the user read.
const PRODUCT_DETAIL_COLLAPSE_THRESHOLD = 320;

/* -------------------------------------------------------------------------- */
/* Tolerant local helpers (every marketplaceCapture module keeps its own —    */
/* see `@/lib/marketplaceSequentialStoryboardUi.ts` for the same convention). */
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

function pickLabel(
  map: Record<string, string> | undefined,
  key: string
): string | null {
  if (!map || !key) return null;
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

/**
 * One-stop plan-review gate — prefers a PERSISTED character count (authored
 * by the skill/runner itself, e.g. `image_prompt_character_count` /
 * `video_prompt_character_count`,
 * `server/services/productReviewSequentialStoryboardSkillRunner.ts`) and
 * falls back to the live text's `.length` only when that count is absent,
 * non-numeric, or negative — never recomputes over an already-authoritative
 * count.
 */
function resolvePersistedOrLiveCharCount(
  persisted: unknown,
  text: string
): number {
  const count = Number(persisted);
  return Number.isFinite(count) && count >= 0 ? count : text.length;
}

/* -------------------------------------------------------------------------- */
/* View models                                                               */
/* -------------------------------------------------------------------------- */

export type AutoReviewPlanReviewStatus = "awaiting" | "approved" | string;

export interface AutoReviewPlanReviewState {
  required?: boolean;
  status?: AutoReviewPlanReviewStatus;
  heldAt?: string | null;
  approvedAt?: string | null;
  redraftCount?: number;
  lastNotes?: string | null;
}

export interface AutoReviewPlanReviewSettingRow {
  key: string;
  label: string;
  value: string;
}

export interface AutoReviewPlanReviewSequentialShotRow {
  shotId: number;
  purpose: string;
  visualSummary: string;
  dialogue: string;
  durationSeconds: number | null;
  /** The exact prompt text this shot will submit (or already submitted) as
   *  its start-frame image-generation prompt — read-only at this gate (see
   *  `buildAutoReviewPlanReviewSequentialShotRows`'s doc comment). */
  startFrameImagePrompt: string;
  startFrameImagePromptChars: number;
  /** The exact prompt text this shot will submit (or already submitted) as
   *  its video-generation prompt — read-only at this gate. */
  videoPrompt: string;
  videoPromptChars: number;
}

export interface AutoReviewPlanReviewCreditEstimate {
  typical: number;
  worst: number;
}

export interface AutoReviewPlanReviewPlanData {
  productDetail: string;
  storyboardGuide: string;
  voiceoverScript: string;
  sequentialShots: AutoReviewPlanReviewSequentialShotRow[];
  settings: AutoReviewPlanReviewSettingRow[];
  creditEstimate: AutoReviewPlanReviewCreditEstimate | null;
  /** One-stop plan-review gate (2026-07-23) — the prompt-length budgets the
   *  image/video prompt disclosures compare each shot's character count
   *  against. */
  promptBudgets: AutoReviewPlanReviewPromptBudgets;
  /** One-stop plan-review gate (2026-07-23) — the reference-image legend +
   *  citation-verification cross-reference set. Empty for non-sequential
   *  runs or a sequential run that has not reached `prompt_plan` yet. */
  referenceManifest: AutoReviewPlanReviewReferenceManifestRow[];
  /** True for the deterministic degraded fallback pack
   *  (`buildDegradedSequentialStoryboardPack`,
   *  `server/services/marketplaceAutoReviewService.ts`) — never has
   *  enrichment dialogue and does not honor the user's tone/structure
   *  settings. See `isAutoReviewPlanReviewDegradedPlan`. */
  isDegradedFallback: boolean;
}

/**
 * `metadataJson.qualityMode` ("fast_draft" | "balanced" | "premium_strict_qa"
 * — `server/services/marketplaceAutoReviewService.ts`
 * `MarketplaceAutoReviewQualityModeInput`) 1:1 with this control's own enum
 * ("fast" | "balanced" | "high"), same mapping as
 * `toMarketplaceAutoReviewQualityMode()`'s inverse in
 * `server/services/hyperframesRuntimeApiService.ts`.
 */
function toAutoStoryboardQualityMode(
  qualityMode: string
): AutoStoryboardQualityMode {
  if (qualityMode === "fast_draft") return "fast";
  if (qualityMode === "premium_strict_qa") return "high";
  return "balanced";
}

/**
 * Per-shot rows for the sequential (`sequential_shot_storyboard`) strategy's
 * review table — `shot_id`/`purpose`/`visual_summary`/`dialogue`/
 * `duration_seconds`/`start_frame_image_prompt`/`video_prompt` from
 * `metadataJson.sequentialStoryboard.shots` (`SequentialStoryboardShot`,
 * `server/services/productReviewSequentialStoryboardSkillRunner.ts`).
 *
 * 2026-07-23 user request ("ควรแสดง prompt ในการสร้างภาพไปพร้อม ๆ กันเลย
 * ตรวจสอบรอบเดียวจบ") REVERSES this projector's earlier "story only, never
 * the generation prompts" stance — the actual `start_frame_image_prompt`/
 * `video_prompt` the run will submit now render alongside the story fields
 * so the ENTIRE plan (story + the literal generation prompts + their
 * reference citations) can be verified in one pass, before any image
 * credit is spent. Direct hand-editing of these two fields still belongs to
 * the Storyboard Review page (a later, per-shot, credit-bearing stage) —
 * this gate only displays them read-only, folded into the SAME whole-plan
 * redraft loop as the rest of the text plan.
 *
 * `*PromptChars` prefers the persisted `image_prompt_character_count` /
 * `video_prompt_character_count` (see `resolvePersistedOrLiveCharCount`)
 * and falls back to the live `.length` of the prompt text only when that
 * count is absent/non-finite.
 *
 * Never throws on malformed/missing data — resolves to `[]`.
 */
export function buildAutoReviewPlanReviewSequentialShotRows(
  metadataJson: unknown
): AutoReviewPlanReviewSequentialShotRow[] {
  const sequential = asRecord(asRecord(metadataJson).sequentialStoryboard);
  const rawShots = Array.isArray(sequential.shots) ? sequential.shots : [];
  const rows: AutoReviewPlanReviewSequentialShotRow[] = [];
  for (const rawShot of rawShots) {
    if (!isPlainObject(rawShot)) continue;
    const shotId = Number(rawShot.shot_id);
    if (!Number.isFinite(shotId) || shotId <= 0) continue;
    const durationSeconds =
      typeof rawShot.duration_seconds === "number" &&
      Number.isFinite(rawShot.duration_seconds)
        ? rawShot.duration_seconds
        : null;
    const startFrameImagePrompt = cleanText(rawShot.start_frame_image_prompt);
    const videoPrompt = cleanText(rawShot.video_prompt);
    rows.push({
      shotId,
      purpose: cleanText(rawShot.purpose),
      visualSummary: cleanText(rawShot.visual_summary),
      dialogue: cleanText(rawShot.dialogue),
      durationSeconds,
      startFrameImagePrompt,
      startFrameImagePromptChars: resolvePersistedOrLiveCharCount(
        rawShot.image_prompt_character_count,
        startFrameImagePrompt
      ),
      videoPrompt,
      videoPromptChars: resolvePersistedOrLiveCharCount(
        rawShot.video_prompt_character_count,
        videoPrompt
      ),
    });
  }
  return rows.sort((a, b) => a.shotId - b.shotId);
}

export interface AutoReviewPlanReviewPromptBudgets {
  imageMaxChars: number;
  videoMaxChars: number;
}

/**
 * Per-run prompt-length budgets for the plan-review gate's image/video
 * prompt disclosures. Mirrors the SAME defaults `StoryboardReviewPage.tsx`
 * already passes to `SequentialShotReviewSection` (`{ imageMaxChars: 4000,
 * videoMaxChars: 2000 }`) — the video budget has no per-run override today,
 * so it is always `SEQUENTIAL_VIDEO_PROMPT_MAX_CHARS`; the image budget
 * defers to `metadataJson.sequentialImagePromptMaxChars` (section 01,
 * server-bounded 1000-4000) when it is a finite positive number, else the
 * same 4000 default the server itself falls back to
 * (`resolveSequentialImagePromptBudget`,
 * `server/services/marketplaceAutoReviewService.ts`). Never throws on
 * malformed/missing metadata.
 */
export function buildAutoReviewPlanReviewPromptBudgets(
  metadataJson: unknown
): AutoReviewPlanReviewPromptBudgets {
  const override = Number(asRecord(metadataJson).sequentialImagePromptMaxChars);
  const imageMaxChars =
    Number.isFinite(override) && override > 0
      ? override
      : DEFAULT_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS;
  return { imageMaxChars, videoMaxChars: SEQUENTIAL_VIDEO_PROMPT_MAX_CHARS };
}

export interface AutoReviewPlanReviewReferenceManifestRow {
  /** 1-based — the number inside the shared `@ImageN` placeholder
   *  convention (`SequentialReferenceManifestEntry.index`,
   *  `server/services/productReviewSequentialStoryboardSkillRunner.ts`). */
  index: number;
  /** `"primary_product" | "product_angle" | "character" | "environment"`
   *  (`resolveSequentialReferenceAttachmentPlan`'s `storedManifest`,
   *  `server/services/marketplaceAutoReviewService.ts`) — kept a loose
   *  `string` here so an unrecognized future role never throws; render-time
   *  falls back to `planReviewReferenceManifestUnknownRoleLabel`. */
  role: string;
  /** Only meaningful when `role === "product_angle"`. */
  angleLabel?: string;
  evidenceOnly: boolean;
}

/**
 * The reference-image legend backing the plan-review gate's citation
 * verification (2026-07-23 user request — "เปิดโอกาสให้ตรวจสอบความถูกต้อง
 * ได้") — decodes what each `@ImageN` placeholder cited inside a shot's
 * generation prompts actually resolves to. Reads
 * `metadataJson.sequentialStoryboard.referenceManifest`
 * (`SequentialReferenceManifestEntry[]`,
 * `server/services/productReviewSequentialStoryboardSkillRunner.ts`) —
 * never re-derives capacity/attachment-order logic, purely projects the
 * ALREADY-resolved manifest. Never throws — malformed/missing metadata or
 * entries resolve to `[]`/are dropped individually.
 */
export function buildAutoReviewPlanReviewReferenceManifestRows(
  metadataJson: unknown
): AutoReviewPlanReviewReferenceManifestRow[] {
  const sequential = asRecord(asRecord(metadataJson).sequentialStoryboard);
  const rawManifest = Array.isArray(sequential.referenceManifest)
    ? sequential.referenceManifest
    : [];
  const rows: AutoReviewPlanReviewReferenceManifestRow[] = [];
  for (const rawEntry of rawManifest) {
    if (!isPlainObject(rawEntry)) continue;
    const index = Number(rawEntry.index);
    const role = cleanText(rawEntry.role);
    if (!Number.isFinite(index) || index <= 0 || !role) continue;
    rows.push({
      index,
      role,
      angleLabel: cleanText(rawEntry.angleLabel) || undefined,
      evidenceOnly: rawEntry.evidenceOnly === true,
    });
  }
  return rows.sort((a, b) => a.index - b.index);
}

/**
 * Scans a generation prompt for every `@ImageN` reference citation — the
 * SAME placeholder convention the runner itself writes into these prompts
 * (`@Image${n}`, `providerManifest`/
 * `buildStartFramePromptEngineReferenceManifestBlock`,
 * `server/services/*.ts`). Returns cited indices in FIRST-SEEN order,
 * deduplicated (a prompt citing `@Image1` three times still yields one
 * entry). Pure regex scan — no server calls, never throws on empty/
 * malformed input.
 */
export function extractAutoReviewPlanReviewPromptImageCitations(
  prompt: string
): number[] {
  if (!prompt) return [];
  const seen = new Set<number>();
  const ordered: number[] = [];
  const pattern = /@Image(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prompt)) !== null) {
    const index = Number(match[1]);
    if (!Number.isFinite(index) || seen.has(index)) continue;
    seen.add(index);
    ordered.push(index);
  }
  return ordered;
}

export interface AutoReviewPlanReviewPromptCitationChip {
  index: number;
  /** `false` when this `@ImageN` has no matching row in the run's real
   *  `referenceManifest` — i.e. the prompt cites an image slot that was
   *  never actually attached, a correctness problem worth flagging BEFORE
   *  any image credit is spent. */
  valid: boolean;
}

/**
 * The plan-review gate's citation-verification aid (2026-07-23 user request
 * — "เปิดโอกาสให้ตรวจสอบความถูกต้องได้"): cross-references every `@ImageN`
 * citation found in `prompt` against `manifestIndices` (the run's real
 * `buildAutoReviewPlanReviewReferenceManifestRows` indices). Pure — the
 * caller owns rendering (chip color, warning text); this never mutates the
 * prompt or invents a manifest entry.
 */
export function buildAutoReviewPlanReviewPromptCitationChips(
  prompt: string,
  manifestIndices: ReadonlySet<number>
): AutoReviewPlanReviewPromptCitationChip[] {
  return extractAutoReviewPlanReviewPromptImageCitations(prompt).map(index => ({
    index,
    valid: manifestIndices.has(index),
  }));
}

/**
 * `productDetail` / `storyboardGuide` / `voiceoverScript` from
 * `metadataJson.concept` (`AutoReviewPlan`,
 * `server/services/marketplaceAutoReviewService.ts`) — present for every
 * frame strategy (the base plan every strategy authors before frame-specific
 * rendering). Never throws — resolves every field to `""` when absent.
 */
export function buildAutoReviewPlanReviewPlanText(metadataJson: unknown): {
  productDetail: string;
  storyboardGuide: string;
  voiceoverScript: string;
} {
  const concept = asRecord(asRecord(metadataJson).concept);
  return {
    productDetail: cleanText(concept.productDetail),
    storyboardGuide: cleanText(concept.storyboardGuide),
    voiceoverScript: cleanText(concept.voiceoverScript),
  };
}

/**
 * First-pass / worst-case image job estimate for the confirm button, reusing
 * `imageJobsEstimatedWorstCase` copy + this codebase's own quality-mode
 * rounds mapping (`AUTO_STORYBOARD_QUALITY_MODE_ROUNDS`).
 *
 * Deliberately SEQUENTIAL-ONLY: for `sequential_shot_storyboard`, 1 image
 * job per authored shot is an unambiguous, already-established mapping (see
 * `hyperframesUiCopy.ts`'s `imageJobsEstimated` comment — "shown only when
 * creditEstimate.imageJobCount > 1 (sequential storyboard strategy)" — and
 * `shared/hyperframes/autoPlan.ts`'s `resolveHyperframesAutoPlanImageJobCount`,
 * which hardcodes the SAME strategy check). For `storyboard_3x3_split` (one
 * grid image regardless of shot count) and `video_shot_start_stop`
 * (documented in that same shared resolver as "actually submits
 * `shots.length × 2` jobs but that correction is deliberately deferred" —
 * i.e. this codebase has not itself committed to a correct multiplier),
 * there is no single correct N derivable from shot count alone without
 * inventing one — so this returns `null` and the caller omits the line
 * entirely, per the explicit "omit rather than invent" instruction.
 */
export function buildAutoReviewPlanReviewCreditEstimate(
  metadataJson: unknown,
  frameStrategy: unknown
): AutoReviewPlanReviewCreditEstimate | null {
  if (frameStrategy !== "sequential_shot_storyboard") return null;
  const typical =
    buildAutoReviewPlanReviewSequentialShotRows(metadataJson).length;
  if (typical <= 0) return null;
  const qualityMode = cleanText(asRecord(metadataJson).qualityMode);
  const rounds =
    AUTO_STORYBOARD_QUALITY_MODE_ROUNDS[
      toAutoStoryboardQualityMode(qualityMode)
    ];
  return { typical, worst: typical * rounds };
}

/**
 * The user's selected settings, side-by-side with the plan text so a
 * mismatch (wrong tone, wrong structure, ignored brief) is instantly
 * visible. Reads ONLY fields `startMarketplaceAutoReviewRun` actually
 * persists into `metadataJson` (grep-verified against
 * `server/services/marketplaceAutoReviewService.ts`'s `buildRunMetadata`) —
 * a row is included only when the underlying value is present AND
 * meaningfully non-default (e.g. `characterPresenceMode: "auto"` is the
 * default/no-preference state and is omitted, not fabricated as a row).
 * Never invents a value that is not actually in metadata.
 */
export function buildAutoReviewPlanReviewSettingRows(
  metadataJson: unknown,
  frameStrategy: unknown,
  outputMode: unknown,
  locale?: MarketplaceHyperframesUiLocale | string
): AutoReviewPlanReviewSettingRow[] {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const metadata = asRecord(metadataJson);
  const referenceAnchors = asRecord(metadata.referenceAnchors);
  const sequentialUserInputs = asRecord(
    asRecord(metadata.sequentialStoryboard).userInputs
  );
  const rows: AutoReviewPlanReviewSettingRow[] = [];

  const outputModeText = cleanText(outputMode);
  const outputModeLabel = pickLabel(
    copy.planReviewOutputModeLabels,
    outputModeText
  );
  if (outputModeLabel) {
    rows.push({
      key: "outputMode",
      label: copy.planReviewOutputModeRowLabel,
      value: outputModeLabel,
    });
  }

  const frameStrategyText = cleanText(frameStrategy);
  const frameStrategyLabel = pickLabel(
    copy.frameStrategyLabels,
    frameStrategyText
  );
  if (frameStrategyLabel) {
    rows.push({
      key: "frameStrategy",
      label: copy.planReviewFrameStrategyRowLabel,
      value: frameStrategyLabel,
    });
  }

  const reviewTone = cleanText(referenceAnchors.reviewTone);
  const reviewToneLabel = pickLabel(
    copy.planReviewReviewToneLabels,
    reviewTone
  );
  if (reviewToneLabel) {
    rows.push({
      key: "reviewTone",
      label: copy.planReviewReviewToneRowLabel,
      value: reviewToneLabel,
    });
  }

  const storytellingStructure = cleanText(
    referenceAnchors.storytellingStructure
  );
  const storytellingStructureLabel = pickLabel(
    copy.planReviewStorytellingStructureLabels,
    storytellingStructure
  );
  if (storytellingStructureLabel) {
    rows.push({
      key: "storytellingStructure",
      label: copy.planReviewStorytellingStructureRowLabel,
      value: storytellingStructureLabel,
    });
  }

  const qualityMode = cleanText(metadata.qualityMode);
  if (qualityMode) {
    const mode = toAutoStoryboardQualityMode(qualityMode);
    rows.push({
      key: "qualityMode",
      label: copy.qualityModeControlLabel,
      value: `${copy.qualityModeControlOptions[mode]} (${copy.qualityModeControlRounds(
        AUTO_STORYBOARD_QUALITY_MODE_ROUNDS[mode]
      )})`,
    });
  }

  const creativeBrief = cleanText(metadata.creativeBrief);
  if (creativeBrief) {
    rows.push({
      key: "creativeBrief",
      label: copy.planReviewCreativeBriefLabel,
      value: creativeBrief,
    });
  }

  const motionDirection = cleanText(metadata.motionDirection);
  if (motionDirection) {
    rows.push({
      key: "motionDirection",
      label: copy.planReviewMotionDirectionLabel,
      value: motionDirection,
    });
  }

  // "auto" is the default/no-preference state (server:
  // `normalizeMarketplaceAutoReviewCharacterPresenceMode`) — omitted rather
  // than shown as a no-op row.
  const characterPresenceMode = cleanText(metadata.characterPresenceMode);
  const characterPresenceLabel =
    characterPresenceMode && characterPresenceMode !== "auto"
      ? pickLabel(copy.planReviewCharacterPresenceLabels, characterPresenceMode)
      : null;
  if (characterPresenceLabel) {
    rows.push({
      key: "characterPresenceMode",
      label: copy.planReviewCharacterPresenceRowLabel,
      value: characterPresenceLabel,
    });
  }

  const targetAudience = cleanText(sequentialUserInputs.targetAudience);
  if (targetAudience) {
    rows.push({
      key: "targetAudience",
      label: copy.targetAudienceLabel,
      value: targetAudience,
    });
  }

  const userRequirements = cleanText(sequentialUserInputs.userRequirements);
  if (userRequirements) {
    rows.push({
      key: "userRequirements",
      label: copy.userRequirementsLabel,
      value: userRequirements,
    });
  }

  const forbiddenClaims = Array.isArray(sequentialUserInputs.forbiddenClaims)
    ? sequentialUserInputs.forbiddenClaims.map(cleanText).filter(Boolean)
    : [];
  if (forbiddenClaims.length > 0) {
    rows.push({
      key: "forbiddenClaims",
      label: copy.forbiddenClaimsLabel,
      value: forbiddenClaims.join(", "),
    });
  }

  const confirmedAttributes = asRecord(
    sequentialUserInputs.confirmedAttributes
  );
  const confirmedAttributeEntries = Object.entries(confirmedAttributes)
    .map(([attribute, claim]) => `${attribute}: ${cleanText(claim)}`.trim())
    .filter(entry => !entry.endsWith(":"));
  if (confirmedAttributeEntries.length > 0) {
    rows.push({
      key: "confirmedAttributes",
      label: copy.confirmedAttributesLabel,
      value: confirmedAttributeEntries.join(" · "),
    });
  }

  const requestedShotCount = Number(metadata.requestedShotCount);
  if (Number.isFinite(requestedShotCount) && requestedShotCount > 0) {
    rows.push({
      key: "requestedShotCount",
      label: copy.planReviewShotCountRowLabel,
      value: String(requestedShotCount),
    });
  }

  const overlayTextMode = cleanText(metadata.overlayTextMode);
  const overlayTextModeLabel = pickLabel(
    copy.planReviewOverlayTextModeLabels,
    overlayTextMode
  );
  if (overlayTextModeLabel) {
    rows.push({
      key: "overlayTextMode",
      label: copy.planReviewOverlayTextRowLabel,
      value: overlayTextModeLabel,
    });
  }

  const resolvedAudioStrategy = cleanText(metadata.resolvedAudioStrategy);
  const resolvedAudioStrategyLabel = pickLabel(
    copy.planReviewResolvedAudioStrategyLabels,
    resolvedAudioStrategy
  );
  if (resolvedAudioStrategyLabel) {
    rows.push({
      key: "resolvedAudioStrategy",
      label: copy.planReviewAudioStrategyRowLabel,
      value: resolvedAudioStrategyLabel,
    });
  }

  const speechLanguage = cleanText(metadata.speechLanguage);
  if (speechLanguage) {
    rows.push({
      key: "speechLanguage",
      label: copy.planReviewSpeechLanguageRowLabel,
      value: speechLanguage.toUpperCase(),
    });
  }

  return rows;
}

/**
 * True for the deterministic degraded fallback pack
 * (`buildDegradedSequentialStoryboardPack`,
 * `server/services/marketplaceAutoReviewService.ts`) — assembled when every
 * loop round of the real skill fails structurally, so the run can stay
 * alive. That pack never has enrichment dialogue (`dialogue: ""` on every
 * shot) and does not honor the user's tone/structure settings, so the
 * review gate warns the user and points at "ask AI to redraft" (which
 * re-attempts the real skill). Checked via EITHER persisted signal
 * (`sequentialStoryboard.degraded === true` or `skillVersion` containing the
 * literal substring "degraded", e.g. `"1.0.0-degraded"`) — never invents a
 * third heuristic. Never throws on malformed/missing metadata.
 */
export function isAutoReviewPlanReviewDegradedPlan(
  metadataJson: unknown
): boolean {
  const sequential = asRecord(asRecord(metadataJson).sequentialStoryboard);
  if (sequential.degraded === true) return true;
  return cleanText(sequential.skillVersion).toLowerCase().includes("degraded");
}

/**
 * One-call convenience bundling every projector above — the shape
 * `MarketplaceCaptureProductDetail.tsx` builds from the FULL
 * (`includeHeavyMetadata`) `getAutoReviewRun` response (the polled
 * `listAutoReviewRuns` summary payload omits `concept` /
 * `sequentialStoryboard.shots`) and passes into this panel's `plan` prop.
 */
export function buildAutoReviewPlanReviewPlanData(
  metadataJson: unknown,
  frameStrategy: unknown,
  outputMode: unknown,
  locale?: MarketplaceHyperframesUiLocale | string
): AutoReviewPlanReviewPlanData {
  const planText = buildAutoReviewPlanReviewPlanText(metadataJson);
  return {
    ...planText,
    sequentialShots: buildAutoReviewPlanReviewSequentialShotRows(metadataJson),
    settings: buildAutoReviewPlanReviewSettingRows(
      metadataJson,
      frameStrategy,
      outputMode,
      locale
    ),
    creditEstimate: buildAutoReviewPlanReviewCreditEstimate(
      metadataJson,
      frameStrategy
    ),
    promptBudgets: buildAutoReviewPlanReviewPromptBudgets(metadataJson),
    referenceManifest:
      buildAutoReviewPlanReviewReferenceManifestRows(metadataJson),
    isDegradedFallback: isAutoReviewPlanReviewDegradedPlan(metadataJson),
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                 */
/* -------------------------------------------------------------------------- */

/** `updateAutoReviewPlanShotDialogue` input's shot-scoped fields (the caller
 *  adds `runId`) — `server/routers/marketplaceCapture.ts`. */
export interface AutoReviewPlanReviewShotDialogueSaveInput {
  shotId: number;
  dialogue: string;
}

/** Per-shot inline save error, keyed by `shotId` so a failed save on one
 *  shot never blanks another shot's row (nullable-single-id convention,
 *  mirrors `SequentialShotReviewSection`'s `shotError`). */
export interface AutoReviewPlanReviewShotDialogueError {
  shotId: number;
  message: string;
}

export interface AutoReviewPlanReviewPanelProps {
  /** `metadataJson.planReview` (or `undefined`/`null` on older runs). */
  planReview: AutoReviewPlanReviewState | null | undefined;
  /**
   * Heavy plan content, only available once the caller's separate
   * `getAutoReviewRun` (full-metadata) fetch resolves. `null` means "not
   * loaded yet" — renders a loading state (or the error state below), NOT
   * "nothing to show" (the gate itself is already known from `planReview`).
   */
  plan: AutoReviewPlanReviewPlanData | null;
  planLoadError?: string | null;
  onRetryLoadPlan?: () => void;
  onApprove: () => void;
  approving?: boolean;
  approveError?: string | null;
  onRequestRedraft: (notes: string) => void;
  redrafting?: boolean;
  redraftError?: string | null;
  /** Reuses the page's EXISTING `cancelAutoReviewRun` mutation/button — this
   *  panel never defines a second cancel flow. */
  onCancelRun: () => void;
  cancelling?: boolean;
  /** 2026-07-23 user feedback on the live gate — inline per-shot dialogue
   *  edit, calling the server's `updateAutoReviewPlanShotDialogue`. Optional
   *  so a caller that has not wired it yet still renders read-only dialogue
   *  text (mirrors `onRetryLoadPlan`'s optionality convention) — the pencil
   *  affordance itself only renders when this is provided. */
  onSaveShotDialogue?: (input: AutoReviewPlanReviewShotDialogueSaveInput) => void;
  /** Shot whose dialogue-save mutation is currently in flight (nullable-
   *  single-id convention, mirrors `SequentialShotReviewSection`'s
   *  `savingShotId`). */
  dialogueSavingShotId?: number | null;
  dialogueSaveError?: AutoReviewPlanReviewShotDialogueError | null;
  locale?: MarketplaceHyperframesUiLocale | string;
}

function PlanReviewProductDetail({
  productDetail,
  title,
  showMoreLabel,
  showLessLabel,
}: {
  productDetail: string;
  title: string;
  showMoreLabel: string;
  showLessLabel: string;
}) {
  const isLong = productDetail.length > PRODUCT_DETAIL_COLLAPSE_THRESHOLD;
  // Defaults OPEN even when long — this text is the primary thing the gate
  // exists to have the user read; the toggle is for tidiness afterwards, not
  // to hide it by default.
  const [open, setOpen] = useState(true);

  if (!isLong) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
          {productDetail}
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            {open ? showLessLabel : showMoreLabel}
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
          {productDetail}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * One sequential-shot row — 2026-07-23 user feedback on the live gate.
 * Purpose + visual summary render as before; dialogue now ALWAYS renders
 * (never hidden when empty — the degraded fallback pack has no dialogue at
 * all, and hiding the row silently read as "dialogue was never wired") and
 * is inline-editable via `onSaveDialogue`. "แก้ภาพช็อตนี้" never edits
 * `visualSummary` directly (that English text grounds the image prompt and
 * must stay in the skill's own hands) — it only appends a prefilled note
 * into the panel's EXISTING redraft-notes textarea via `onRequestVisualFix`
 * (owned by the parent, since notes are the parent's state).
 */
function PlanReviewShotRow({
  shot,
  locale,
  busy,
  savingShotId,
  saveError,
  onSaveDialogue,
  onRequestVisualFix,
  promptBudgets,
  manifestIndices,
}: {
  shot: AutoReviewPlanReviewSequentialShotRow;
  locale?: MarketplaceHyperframesUiLocale | string;
  busy: boolean;
  savingShotId?: number | null;
  saveError?: AutoReviewPlanReviewShotDialogueError | null;
  onSaveDialogue?: (input: AutoReviewPlanReviewShotDialogueSaveInput) => void;
  onRequestVisualFix: (shotId: number) => void;
  /** One-stop plan-review gate (2026-07-23) — see `PlanReviewShotPromptBlock`. */
  promptBudgets: AutoReviewPlanReviewPromptBudgets;
  manifestIndices: ReadonlySet<number>;
}) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const isSaving = savingShotId === shot.shotId;
  const rowError =
    saveError && saveError.shotId === shot.shotId ? saveError.message : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.dialogue);
  const wasSavingRef = useRef(false);

  // A settle (isSaving true -> false) with no error means the save
  // succeeded — close the editor and adopt the fresh server text (already
  // reflected in `shot.dialogue` via the caller's query invalidation by the
  // time this fires). A failed attempt (error set) leaves the editor open
  // with exactly what the user typed, matching the redraft box's "retain
  // what the user typed" rule below.
  useEffect(() => {
    if (wasSavingRef.current && !isSaving && !rowError) {
      setEditing(false);
      setDraft(shot.dialogue);
    }
    wasSavingRef.current = isSaving;
  }, [isSaving, rowError, shot.dialogue]);

  return (
    <li
      data-testid={`plan-review-shot-${shot.shotId}`}
      className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {copy.planReviewShotLabel(shot.shotId)}
        </span>
        {shot.durationSeconds != null ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {copy.planReviewShotDurationLabel(shot.durationSeconds)}
          </span>
        ) : null}
      </div>
      {shot.purpose ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold">
            {copy.planReviewShotPurposeLabel}:
          </span>{" "}
          {shot.purpose}
        </p>
      ) : null}
      {shot.visualSummary ? (
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
          <span className="font-semibold text-slate-500 dark:text-slate-400">
            {copy.planReviewShotVisualSummaryLabel}:
          </span>{" "}
          <span className="mr-1 rounded border border-slate-300 px-1 align-middle text-[10px] font-semibold uppercase text-slate-500 dark:border-slate-600 dark:text-slate-400">
            {copy.planReviewVisualSummaryLanguageBadge}
          </span>
          {shot.visualSummary}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-1 text-xs font-medium text-sky-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline dark:text-sky-400"
        disabled={busy}
        onClick={() => onRequestVisualFix(shot.shotId)}
      >
        {copy.planReviewFixShotVisual}
      </button>

      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.planReviewShotDialogueLabel}
          </span>
          {!editing && onSaveDialogue ? (
            <button
              type="button"
              aria-label={copy.planReviewEditShotDialogueAriaLabel(shot.shotId)}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700"
              disabled={busy}
              onClick={() => {
                setDraft(shot.dialogue);
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-1 space-y-1">
            <Textarea
              aria-label={copy.planReviewEditShotDialogueAriaLabel(shot.shotId)}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              maxLength={SHOT_DIALOGUE_MAX_CHARS}
              className="min-h-16 bg-white dark:bg-slate-900"
              disabled={isSaving}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {copy.promptCharCount(draft.length, SHOT_DIALOGUE_MAX_CHARS)}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isSaving}
                  onClick={() => {
                    setDraft(shot.dialogue);
                    setEditing(false);
                  }}
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving || busy}
                  onClick={() =>
                    onSaveDialogue?.({
                      shotId: shot.shotId,
                      dialogue: draft.trim(),
                    })
                  }
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {copy.planReviewSaveShotDialogue}
                </Button>
              </div>
            </div>
            {rowError ? (
              <p className="text-xs text-red-700 dark:text-red-300">
                {rowError}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
            {shot.dialogue || copy.planReviewShotDialogueEmpty}
          </p>
        )}
      </div>

      <PlanReviewShotPromptBlock
        shotId={shot.shotId}
        kind="image"
        title={copy.planReviewShotImagePromptTitle}
        prompt={shot.startFrameImagePrompt}
        charCount={shot.startFrameImagePromptChars}
        maxChars={promptBudgets.imageMaxChars}
        manifestIndices={manifestIndices}
        locale={locale}
      />
      <PlanReviewShotPromptBlock
        shotId={shot.shotId}
        kind="video"
        title={copy.planReviewShotVideoPromptTitle}
        prompt={shot.videoPrompt}
        charCount={shot.videoPromptChars}
        maxChars={promptBudgets.videoMaxChars}
        manifestIndices={manifestIndices}
        locale={locale}
      />
    </li>
  );
}

/**
 * One collapsed-by-default generation-prompt disclosure inside a shot row
 * (2026-07-23 user request — "ควรแสดง prompt ในการสร้างภาพไปพร้อม ๆ กันเลย
 * ตรวจสอบรอบเดียวจบ"). The char-count-vs-budget badge and the citation
 * chips/warnings render REGARDLESS of collapse state — collapsing only
 * hides the (potentially long) raw prompt text itself — so a reviewer can
 * spot every budget/citation problem across all the shots' prompt blocks
 * without expanding any of them, and only expands the ones that need a
 * closer read. Never edits the prompt (read-only at this gate — see
 * `buildAutoReviewPlanReviewSequentialShotRows`'s doc comment).
 */
function PlanReviewShotPromptBlock({
  shotId,
  kind,
  title,
  prompt,
  charCount,
  maxChars,
  manifestIndices,
  locale,
}: {
  shotId: number;
  kind: "image" | "video";
  title: string;
  prompt: string;
  charCount: number;
  maxChars: number;
  manifestIndices: ReadonlySet<number>;
  locale?: MarketplaceHyperframesUiLocale | string;
}) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const [open, setOpen] = useState(false);
  const hasPrompt = Boolean(prompt);
  const overBudget = charCount > maxChars;
  const citationChips = hasPrompt
    ? buildAutoReviewPlanReviewPromptCitationChips(prompt, manifestIndices)
    : [];
  const hasUnknownCitation = citationChips.some(chip => !chip.valid);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid={`plan-review-${kind}-prompt-${shotId}`}
      className="mt-2 rounded-md border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={
              overBudget
                ? "rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200"
                : "rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400"
            }
          >
            {copy.promptCharCount(charCount, maxChars)}
          </span>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
            >
              {open ? copy.planReviewShowLess : copy.planReviewShowMore}
            </button>
          </CollapsibleTrigger>
        </div>
      </div>

      {citationChips.length > 0 ? (
        <div
          data-testid={`plan-review-${kind}-prompt-citations-${shotId}`}
          className="mt-1 flex flex-wrap gap-1"
        >
          {citationChips.map(chip => (
            <span
              key={chip.index}
              data-citation-valid={chip.valid}
              className={
                chip.valid
                  ? "inline-flex items-center gap-0.5 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200"
              }
            >
              {!chip.valid ? <AlertTriangle className="h-2.5 w-2.5" /> : null}
              @Image{chip.index}
            </span>
          ))}
        </div>
      ) : null}

      {overBudget ? (
        <p className="mt-1 text-xs text-red-700 dark:text-red-300">
          {copy.planReviewPromptOverBudgetWarning}
        </p>
      ) : null}
      {hasUnknownCitation ? (
        <p className="mt-1 text-xs text-red-700 dark:text-red-300">
          {copy.planReviewPromptUnknownCitationWarning}
        </p>
      ) : null}

      <CollapsibleContent>
        {hasPrompt ? (
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-slate-800 dark:text-slate-100">
            {prompt}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {copy.planReviewShotPromptEmpty}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The reference-image legend at the top of the sequential shots list
 * (2026-07-23 user request — "เปิดโอกาสให้ตรวจสอบความถูกต้องได้"): decodes
 * every `@ImageN` a shot's generation prompts may cite against the run's
 * real attachment manifest. Renders `null` when the manifest is empty (a
 * non-sequential run, or a sequential run that has not reached
 * `prompt_plan` yet) — omitted rather than shown empty, same convention as
 * the credit-estimate line at the bottom of this panel.
 */
function PlanReviewReferenceManifestLegend({
  rows,
  locale,
}: {
  rows: AutoReviewPlanReviewReferenceManifestRow[];
  locale?: MarketplaceHyperframesUiLocale | string;
}) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  if (rows.length === 0) return null;

  return (
    <div
      data-testid="plan-review-reference-manifest"
      className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {copy.planReviewReferenceManifestTitle}
      </p>
      <ul className="mt-2 space-y-1">
        {rows.map(row => {
          const roleLabel =
            pickLabel(copy.planReviewReferenceManifestRoleLabels, row.role) ??
            copy.planReviewReferenceManifestUnknownRoleLabel;
          const angleLabel =
            row.role === "product_angle" && row.angleLabel
              ? pickLabel(copy.angleChipLabels, row.angleLabel)
              : null;
          return (
            <li
              key={row.index}
              data-testid={`plan-review-reference-manifest-row-${row.index}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            >
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                @Image{row.index}
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {angleLabel ? `${roleLabel} (${angleLabel})` : roleLabel}
              </span>
              {row.evidenceOnly ? (
                <span className="rounded border border-slate-300 px-1 text-[10px] font-medium text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  {copy.referenceEvidenceOnly}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AutoReviewPlanReviewPanel({
  planReview,
  plan,
  planLoadError,
  onRetryLoadPlan,
  onApprove,
  approving,
  approveError,
  onRequestRedraft,
  redrafting,
  redraftError,
  onCancelRun,
  cancelling,
  onSaveShotDialogue,
  dialogueSavingShotId,
  dialogueSaveError,
  locale,
}: AutoReviewPlanReviewPanelProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const [redraftOpen, setRedraftOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const previousRedraftCountRef = useRef(planReview?.redraftCount ?? 0);
  const redraftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Set by `requestShotVisualFix` below (a per-shot "แก้ภาพช็อตนี้" click) —
  // consumed by the focus effect once the notes box is confirmed open, so
  // the user can start typing their correction immediately.
  const [pendingRedraftFocus, setPendingRedraftFocus] = useState(false);

  // A successful redraft increments `redraftCount` in the persisted
  // metadata — close the notes box and clear the buffer only on that signal
  // (never on a failed attempt, so the user's typed notes survive an error,
  // matching `SequentialShotEditorCard`'s "retain what the user typed" rule).
  useEffect(() => {
    const current = planReview?.redraftCount ?? 0;
    if (current !== previousRedraftCountRef.current) {
      previousRedraftCountRef.current = current;
      setRedraftOpen(false);
      setNotes("");
    }
  }, [planReview?.redraftCount]);

  // 2026-07-23 user feedback on the live gate — a per-shot "แก้ภาพช็อตนี้"
  // click opens the redraft-notes box (if closed) and appends a prefilled
  // line; this focuses the textarea and places the caret at the end right
  // after that DOM update commits, so the user can type their correction
  // without an extra click.
  useEffect(() => {
    if (!pendingRedraftFocus || !redraftOpen) return;
    const el = redraftTextareaRef.current;
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    setPendingRedraftFocus(false);
  }, [pendingRedraftFocus, redraftOpen]);

  const isAwaiting =
    planReview?.required === true && planReview?.status === "awaiting";
  if (!isAwaiting) return null;

  const busy = Boolean(approving) || Boolean(redrafting);
  const hasSequentialShots = (plan?.sequentialShots.length ?? 0) > 0;
  const hasPlanText = Boolean(
    plan &&
    (plan.productDetail ||
      plan.storyboardGuide ||
      plan.voiceoverScript ||
      hasSequentialShots)
  );
  // One-stop plan-review gate (2026-07-23) — computed once per render (cheap;
  // at most a handful of manifest rows) and passed down to every shot row's
  // `PlanReviewShotPromptBlock` citation check, rather than re-deriving a
  // `Set` per shot per render.
  const manifestIndices = new Set(
    (plan?.referenceManifest ?? []).map(row => row.index)
  );

  // "ภาพที่จะเห็น" (visualSummary) is never directly editable here — it
  // grounds the English image prompt and must stay in the skill's hands.
  // Instead this rides the EXISTING whole-plan redraft: append a prefilled
  // "Shot N: " line into the notes textarea (opening it if closed) and
  // focus it so the user can type the correction immediately.
  function requestShotVisualFix(shotId: number) {
    const prefix = `${copy.planReviewShotLabel(shotId)}: `;
    setNotes(current => {
      const trimmed = current.replace(/\s+$/, "");
      const next = trimmed ? `${trimmed}\n${prefix}` : prefix;
      return next.length > REDRAFT_NOTES_MAX_CHARS
        ? next.slice(0, REDRAFT_NOTES_MAX_CHARS)
        : next;
    });
    setRedraftOpen(true);
    setPendingRedraftFocus(true);
  }

  return (
    <div
      data-testid="auto-review-plan-review-panel"
      className="space-y-4 rounded-lg border-2 border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {copy.planReviewTitle}
          </h3>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            {copy.planReviewExplainer}
          </p>
        </div>
        {planReview &&
        planReview.redraftCount &&
        planReview.redraftCount > 0 ? (
          <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100">
            {copy.planReviewDraftBadge(planReview.redraftCount + 1)}
          </span>
        ) : null}
      </div>

      {plan?.isDegradedFallback ? (
        <div
          data-testid="plan-review-degraded-banner"
          className="flex items-start gap-2 rounded-md border-2 border-orange-400 bg-orange-50 p-3 text-sm text-orange-900 dark:border-orange-500/50 dark:bg-orange-950/30 dark:text-orange-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{copy.planReviewDegradedBanner}</p>
        </div>
      ) : null}

      {!plan ? (
        planLoadError ? (
          <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p>{copy.planReviewLoadError}</p>
            <p className="text-xs">{planLoadError}</p>
            {onRetryLoadPlan ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRetryLoadPlan}
              >
                {copy.planReviewRetry}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.planReviewLoading}
          </div>
        )
      ) : (
        <>
          {plan.settings.length > 0 ? (
            <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {copy.planReviewSettingsTitle}
              </p>
              <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {plan.settings.map(row => (
                  <div key={row.key} className="min-w-0">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">
                      {row.label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {!hasPlanText ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {copy.planReviewNoPlanTextFallback}
            </p>
          ) : (
            <>
              {plan.productDetail ? (
                <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <PlanReviewProductDetail
                    productDetail={plan.productDetail}
                    title={copy.planReviewProductDetailTitle}
                    showMoreLabel={copy.planReviewShowMore}
                    showLessLabel={copy.planReviewShowLess}
                  />
                </div>
              ) : null}

              {hasSequentialShots ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {copy.planReviewShotsTableTitle}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.planReviewVisualSummaryLanguageHint}
                  </p>
                  <PlanReviewReferenceManifestLegend
                    rows={plan.referenceManifest}
                    locale={locale}
                  />
                  <ol className="space-y-2">
                    {plan.sequentialShots.map(shot => (
                      <PlanReviewShotRow
                        key={shot.shotId}
                        shot={shot}
                        locale={locale}
                        busy={busy}
                        savingShotId={dialogueSavingShotId}
                        saveError={dialogueSaveError}
                        onSaveDialogue={onSaveShotDialogue}
                        onRequestVisualFix={requestShotVisualFix}
                        promptBudgets={plan.promptBudgets}
                        manifestIndices={manifestIndices}
                      />
                    ))}
                  </ol>
                </div>
              ) : (
                <>
                  {plan.storyboardGuide ? (
                    <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {copy.planReviewStoryboardGuideTitle}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                        {plan.storyboardGuide}
                      </p>
                    </div>
                  ) : null}
                  {plan.voiceoverScript ? (
                    <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {copy.planReviewVoiceoverScriptTitle}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                        {plan.voiceoverScript}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}

      {approveError ? (
        <p className="text-sm text-red-700 dark:text-red-300">{approveError}</p>
      ) : null}
      {redraftError ? (
        <p className="text-sm text-red-700 dark:text-red-300">{redraftError}</p>
      ) : null}

      {redraftOpen ? (
        <div className="space-y-2 rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {copy.planReviewRedraftNotesLabel}
            </span>
            <Textarea
              ref={redraftTextareaRef}
              aria-label={copy.planReviewRedraftNotesLabel}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder={copy.planReviewRedraftNotesPlaceholder}
              maxLength={REDRAFT_NOTES_MAX_CHARS}
              className="min-h-20"
              disabled={busy}
            />
            <span className="block text-right text-xs text-slate-400">
              {copy.promptCharCount(notes.length, REDRAFT_NOTES_MAX_CHARS)}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onRequestRedraft(notes.trim())}
            >
              {redrafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {copy.planReviewRedraftSubmit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setRedraftOpen(false)}
            >
              {copy.planReviewRedraftCancel}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={onApprove}>
          {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {copy.planReviewApprove}
        </Button>
        {!redraftOpen ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRedraftOpen(true)}
          >
            {copy.planReviewRequestRedraft}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
          disabled={cancelling}
          onClick={onCancelRun}
        >
          {copy.planReviewCancelRun}
        </Button>
      </div>

      {plan?.creditEstimate ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {copy.imageJobsEstimatedWorstCase(
            plan.creditEstimate.typical,
            plan.creditEstimate.worst
          )}
        </p>
      ) : null}
    </div>
  );
}
