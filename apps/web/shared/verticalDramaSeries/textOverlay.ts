/**
 * Vertical Drama Series — Text Overlay Suite (task #34,
 * `planning/vertical-drama-end-card-teaser/plan.md` v2).
 *
 * Pure, DB-free, framework-agnostic (no server-only imports — safe for the
 * client bundle too, same posture as `dialogueAudioTimeline.ts`/`subtitles.ts`).
 * Owns:
 *  - The `vertical_drama_episodes.textOverlayPlan` jsonb shape (zod + types).
 *  - The `vertical_drama_series.watermark` jsonb shape (zod + types).
 *  - Deterministic text-derivation priority resolvers (manual > auto-source >
 *    fallback) for `endCard`/`openerRecap`.
 *  - Deterministic derivation helpers for `titleBumper`/`episodeIndicator`/
 *    `characterIntroCards`.
 *  - Structural validation (duration bounds, concurrency warnings, fullscreen
 *    banner overlap warnings) and the opener+titleBumper auto-queue / watermark
 *    corner auto-avoid resolvers.
 *
 * Architecture note (plan.md "สถาปัตยกรรมรวม"): every overlay "kind" here is
 * eventually rendered as one ASS event on the SAME subtitle channel #21
 * already ships (`server/services/verticalDramaFinalRenderGraph.ts`'s
 * `buildAssSubtitleFile`) — this module only owns the DATA MODEL + derivation
 * logic; the ASS style/event construction itself lives in that render-engine
 * module (server-only, since it deals with `.ass` file text construction).
 * This module is intentionally free of any `VdTextOverlayAssEvent`-shaped
 * export so it never needs to import from a server-only file.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Kinds, positions, and tuning constants                                     */
/* -------------------------------------------------------------------------- */

export const VD_TEXT_OVERLAY_CARD_KINDS = [
  "time_setting",
  "narrative_hook",
  "custom",
] as const;
export type VdTextOverlayCardKind = (typeof VD_TEXT_OVERLAY_CARD_KINDS)[number];

/** The card list's visual TREATMENT is one of two archetypal styles (plan.md
 *  "Styles"), independent of `kind` — a `"custom"` card commonly reuses
 *  `"narrative_hook"`'s bigger/emphasis look, but the author can always pick
 *  either explicitly. */
export const VD_TEXT_OVERLAY_CARD_STYLE_VARIANTS = [
  "time_setting",
  "narrative_hook",
] as const;
export type VdTextOverlayCardStyleVariant =
  (typeof VD_TEXT_OVERLAY_CARD_STYLE_VARIANTS)[number];

/** Default style variant per card `kind` when the author never picked one explicitly. */
export function defaultCardStyleVariantForKind(
  kind: VdTextOverlayCardKind
): VdTextOverlayCardStyleVariant {
  return kind === "time_setting" ? "time_setting" : "narrative_hook";
}

export const VD_END_CARD_STYLE_VARIANTS = [
  "center_card",
  "lower_band",
] as const;
export type VdEndCardStyleVariant = (typeof VD_END_CARD_STYLE_VARIANTS)[number];

/**
 * Nine screen anchors, row-major. Widened from the original four corners on
 * 2026-07-30 for parity with the Marketplace overlay picker. The four corner
 * values keep their exact original spelling, so every stored series watermark
 * config keeps resolving to the same place.
 */
export const VD_WATERMARK_POSITIONS = [
  "top_left",
  "top_center",
  "top_right",
  "middle_left",
  "middle_center",
  "middle_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
] as const;
export type VdWatermarkPosition = (typeof VD_WATERMARK_POSITIONS)[number];

export const VD_EPISODE_INDICATOR_POSITIONS = [
  "top_right",
  "top_left",
] as const;
export type VdEpisodeIndicatorPosition =
  (typeof VD_EPISODE_INDICATOR_POSITIONS)[number];

export const VD_WATERMARK_TYPES = ["text", "image"] as const;
export type VdWatermarkType = (typeof VD_WATERMARK_TYPES)[number];

/** Duration bounds (seconds), per plan.md's inline shape comments. */
export const VD_END_CARD_DURATION_BOUNDS = {
  min: 2,
  max: 5,
  default: 3,
} as const;
export const VD_OPENER_RECAP_DURATION_BOUNDS = {
  min: 3,
  max: 5,
  default: 4,
} as const;
export const VD_CARD_DURATION_BOUNDS = {
  min: 1.5,
  max: 5,
  default: 2.5,
} as const;
export const VD_TITLE_BUMPER_DURATION_SECONDS = 1.2 as const;
export const VD_CHARACTER_INTRO_DURATION_SECONDS = 2.5 as const;
/** ">2 การ์ดพร้อมกัน = เตือน" — a THIRD concurrent card triggers the warning. */
export const VD_CARD_MAX_CONCURRENT = 2 as const;
/** "clamp ~90 Thai chars at word boundary". */
export const VD_TEXT_CLAMP_MAX_THAI_CHARS = 90 as const;
export const VD_OPENER_TEXT_CLAMP_MAX_CHARS = 160 as const;

export const VD_WATERMARK_OPACITY_BOUNDS = {
  min: 0.2,
  max: 0.8,
  default: 0.45,
} as const;
export const VD_WATERMARK_SCALE_PCT_BOUNDS = {
  min: 5,
  max: 20,
  default: 10,
} as const;
export const VD_WATERMARK_MARGIN_PX_DEFAULT = 32 as const;

/* -------------------------------------------------------------------------- */
/* Episode text overlay plan — zod schema + types                             */
/* -------------------------------------------------------------------------- */

export const vdTextOverlaySourceSchema = z.enum(["auto", "manual"]);
export type VdTextOverlaySource = z.infer<typeof vdTextOverlaySourceSchema>;

export const vdEndCardConfigSchema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(240).optional(),
  source: vdTextOverlaySourceSchema.optional(),
  durationSec: z
    .number()
    .min(VD_END_CARD_DURATION_BOUNDS.min)
    .max(VD_END_CARD_DURATION_BOUNDS.max)
    .default(VD_END_CARD_DURATION_BOUNDS.default),
  showFollowLine: z.boolean().default(true),
  styleVariant: z.enum(VD_END_CARD_STYLE_VARIANTS).default("center_card"),
});
export type VdEndCardConfig = z.infer<typeof vdEndCardConfigSchema>;

export const vdOpenerRecapConfigSchema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(320).optional(),
  source: vdTextOverlaySourceSchema.optional(),
  durationSec: z
    .number()
    .min(VD_OPENER_RECAP_DURATION_BOUNDS.min)
    .max(VD_OPENER_RECAP_DURATION_BOUNDS.max)
    .default(VD_OPENER_RECAP_DURATION_BOUNDS.default),
});
export type VdOpenerRecapConfig = z.infer<typeof vdOpenerRecapConfigSchema>;

export const vdTitleBumperConfigSchema = z.object({
  enabled: z.boolean(),
  /** Optional manual override of the derived "ชื่อซีรีส์ / EP N: ชื่อตอน" text. */
  text: z.string().trim().max(160).optional(),
});
export type VdTitleBumperConfig = z.infer<typeof vdTitleBumperConfigSchema>;

export const vdEpisodeIndicatorConfigSchema = z.object({
  enabled: z.boolean(),
  position: z.enum(VD_EPISODE_INDICATOR_POSITIONS).default("top_right"),
});
export type VdEpisodeIndicatorConfig = z.infer<
  typeof vdEpisodeIndicatorConfigSchema
>;

export const vdCharacterIntroCardsConfigSchema = z.object({
  enabled: z.boolean(),
});
export type VdCharacterIntroCardsConfig = z.infer<
  typeof vdCharacterIntroCardsConfigSchema
>;

export const vdTextOverlayCardAnchorSchema = z.object({
  shotNumber: z.number().int().positive(),
  offsetSec: z.number().min(0).max(30).optional(),
});
export type VdTextOverlayCardAnchor = z.infer<
  typeof vdTextOverlayCardAnchorSchema
>;

/**
 * Where a per-episode card sits on screen. Same nine anchors as the series
 * watermark (and the Marketplace overlay picker) so the whole product speaks
 * one placement vocabulary. Optional — omitted keeps each style's own baked-in
 * alignment, so every card authored before this field existed renders exactly
 * as it did.
 */
export const VD_TEXT_OVERLAY_CARD_POSITIONS = VD_WATERMARK_POSITIONS;
export type VdTextOverlayCardPosition = VdWatermarkPosition;

export const vdTextOverlayCardSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(VD_TEXT_OVERLAY_CARD_KINDS),
  anchor: vdTextOverlayCardAnchorSchema,
  position: z.enum(VD_TEXT_OVERLAY_CARD_POSITIONS).optional(),
  text: z.string().trim().min(1).max(240),
  durationSec: z
    .number()
    .min(VD_CARD_DURATION_BOUNDS.min)
    .max(VD_CARD_DURATION_BOUNDS.max),
  styleVariant: z.enum(VD_TEXT_OVERLAY_CARD_STYLE_VARIANTS).optional(),
  enabled: z.boolean(),
});
export type VdTextOverlayCard = z.infer<typeof vdTextOverlayCardSchema>;

/** Reasonable cap so one episode can never balloon the `.ass` file/UI list unboundedly. */
export const VD_TEXT_OVERLAY_MAX_CARDS = 24 as const;

export const vdTextOverlayPlanSchema = z.object({
  endCard: vdEndCardConfigSchema.optional(),
  openerRecap: vdOpenerRecapConfigSchema.optional(),
  titleBumper: vdTitleBumperConfigSchema.optional(),
  episodeIndicator: vdEpisodeIndicatorConfigSchema.optional(),
  characterIntroCards: vdCharacterIntroCardsConfigSchema.optional(),
  cards: z
    .array(vdTextOverlayCardSchema)
    .max(VD_TEXT_OVERLAY_MAX_CARDS)
    .optional(),
});
export type VdTextOverlayPlan = z.infer<typeof vdTextOverlayPlanSchema>;

/**
 * Defensively parse the `vertical_drama_episodes.textOverlayPlan` jsonb column
 * (`unknown` at the type level — never trust a jsonb column's runtime shape)
 * into a `VdTextOverlayPlan`, or `null` for a legacy/pre-migration row (`NULL`)
 * OR a malformed record — NEVER throws (mirrors
 * `verticalDramaEpisodes.ts`'s `parseEpisodeAdBannerPlan`).
 */
export function parseTextOverlayPlan(value: unknown): VdTextOverlayPlan | null {
  if (value == null) return null;
  const parsed = vdTextOverlayPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/* Series watermark config — zod schema + types                               */
/* -------------------------------------------------------------------------- */

/**
 * ONE watermark slot. A series carries TWO independent slots (the series/title
 * logo and the channel logo) — the user places each in its own corner, so the
 * two slots share this exact shape and differ only in where they live in the
 * stored config (see `vdSeriesWatermarkConfigSchema` below).
 */
const vdSeriesWatermarkSlotShape = {
  enabled: z.boolean(),
  type: z.enum(VD_WATERMARK_TYPES),
  text: z.string().trim().max(80).optional(),
  /** `z.string()` (not `.url()`) deliberately — local storage returns
   *  relative `/api/storage/...` paths, same reasoning as every other asset
   *  URL field in this codebase (see MEMORY.md "URL validation errors in
   *  gallery"). */
  imageUrl: z.string().max(2048).optional(),
  position: z.enum(VD_WATERMARK_POSITIONS).default("top_right"),
  opacity: z
    .number()
    .min(VD_WATERMARK_OPACITY_BOUNDS.min)
    .max(VD_WATERMARK_OPACITY_BOUNDS.max)
    .default(VD_WATERMARK_OPACITY_BOUNDS.default),
  scalePct: z
    .number()
    .min(VD_WATERMARK_SCALE_PCT_BOUNDS.min)
    .max(VD_WATERMARK_SCALE_PCT_BOUNDS.max)
    .default(VD_WATERMARK_SCALE_PCT_BOUNDS.default),
  marginPx: z
    .number()
    .int()
    .min(0)
    .max(200)
    .default(VD_WATERMARK_MARGIN_PX_DEFAULT),
} as const;

export const vdSeriesWatermarkSlotSchema = z.object(vdSeriesWatermarkSlotShape);
export type VdSeriesWatermarkSlot = z.infer<typeof vdSeriesWatermarkSlotSchema>;

/**
 * The stored `vertical_drama_series.watermark` jsonb value.
 *
 * The FIRST slot is stored INLINE (the slot fields sit at the top level) and
 * the second lives under `secondary` — deliberately not an array or a
 * `{ primary, secondary }` pair, because every row written before the second
 * slot existed is a bare single-slot object. Inlining slot 1 keeps every one
 * of those rows parsing unchanged with `secondary === undefined`, so there is
 * no data migration and no back-compat branch anywhere downstream.
 */
export const vdSeriesWatermarkConfigSchema = z.object({
  ...vdSeriesWatermarkSlotShape,
  /** Slot 2 — absent on every pre-dual-watermark row. */
  secondary: vdSeriesWatermarkSlotSchema.optional(),
});
export type VdSeriesWatermarkConfig = z.infer<
  typeof vdSeriesWatermarkConfigSchema
>;

/** Stable identity for a slot — drives render-layer ids so a two-watermark
 *  render never collides on one id, and so logs name the right slot. */
export type VdSeriesWatermarkSlotId = "primary" | "secondary";

/**
 * The series' watermark slots in render order (slot 1 first), each tagged with
 * its `slotId`. Slots that are absent or `enabled: false` are dropped, so a
 * caller can iterate the result without re-checking `enabled`.
 *
 * This is the ONE place that knows slot 1 is stored inline and slot 2 under
 * `secondary` — resolution and both render engines go through it rather than
 * reaching into the config shape themselves.
 */
export function listEnabledWatermarkSlots(
  config: VdSeriesWatermarkConfig | null | undefined
): Array<{ slotId: VdSeriesWatermarkSlotId; slot: VdSeriesWatermarkSlot }> {
  if (!config) return [];
  const out: Array<{ slotId: VdSeriesWatermarkSlotId; slot: VdSeriesWatermarkSlot }> = [];
  const { secondary, ...primary } = config;
  if (primary.enabled) out.push({ slotId: "primary", slot: primary });
  if (secondary?.enabled) out.push({ slotId: "secondary", slot: secondary });
  return out;
}

/** Mirrors `parseTextOverlayPlan` — never throws. */
export function parseSeriesWatermarkConfig(
  value: unknown
): VdSeriesWatermarkConfig | null {
  if (value == null) return null;
  const parsed = vdSeriesWatermarkConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/* Text clamp (~90 Thai chars at a word/space boundary)                       */
/* -------------------------------------------------------------------------- */

/**
 * Clamp `raw` to at most `maxChars` Unicode code points (`Array.from` splits
 * by code point, not UTF-16 code unit — safer for Thai combining marks than a
 * raw `.slice`), cutting at the last space boundary when one exists past the
 * halfway point (avoids an awkwardly short truncation for text with an early
 * space), else hard-cutting at `maxChars`. Appends an ellipsis only when
 * truncation actually happened.
 */
export function clampVdOverlayText(
  raw: string,
  maxChars: number = VD_TEXT_CLAMP_MAX_THAI_CHARS
): string {
  const text = raw.trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const truncatedChars = chars.slice(0, maxChars);
  const truncated = truncatedChars.join("");
  const lastSpace = truncated.lastIndexOf(" ");
  const cut =
    lastSpace > Math.floor(maxChars * 0.5)
      ? truncated.slice(0, lastSpace)
      : truncated;
  return `${cut.trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* End card / opener recap — deterministic priority resolution                */
/* -------------------------------------------------------------------------- */

export const VD_END_CARD_FALLBACK_TEXT_TH = "ติดตามตอนต่อไป เร็ว ๆ นี้";
/** End card's optional smaller "follow line" (plan.md `showFollowLine`, default `true`). */
export const VD_END_CARD_FOLLOW_LINE_TH = "กดติดตามเพื่อไม่พลาดตอนต่อไป";
/** Opener recap's fixed header line (plan.md 'มีหัว "ความเดิม…"'). */
export const VD_OPENER_RECAP_HEADER_TH = "ความเดิมตอนย่อยที่แล้ว";

export interface VdResolvedOverlayText<TSource extends string> {
  text: string;
  source: TSource;
}

export type VdEndCardTextSource =
  | "manual"
  | "cliffhanger"
  | "hook"
  | "fallback";

/**
 * Priority: manual > `cliffhanger_line` (active breakdown item) > first
 * unresolved `hook_opened` memory event > fallback (plan.md "แหล่งข้อความ
 * อัตโนมัติ" table, `endCard` row). Pure — the caller resolves
 * `cliffhangerLine`/`unresolvedHooks` from the story bible / memory bundle
 * before calling this (see `server/services/verticalDramaTextOverlayResolution.ts`).
 */
export function resolveEndCardText(params: {
  manualText?: string | null;
  cliffhangerLine?: string | null;
  unresolvedHooks?: readonly string[] | null;
  fallbackText?: string;
}): VdResolvedOverlayText<VdEndCardTextSource> {
  const manual = params.manualText?.trim();
  if (manual) return { text: clampVdOverlayText(manual), source: "manual" };

  const cliffhanger = params.cliffhangerLine?.trim();
  if (cliffhanger)
    return { text: clampVdOverlayText(cliffhanger), source: "cliffhanger" };

  const hook = (params.unresolvedHooks ?? []).find(
    h => h && h.trim().length > 0
  );
  if (hook) return { text: clampVdOverlayText(hook.trim()), source: "hook" };

  return {
    text: clampVdOverlayText(
      params.fallbackText?.trim() || VD_END_CARD_FALLBACK_TEXT_TH
    ),
    source: "fallback",
  };
}

export type VdOpenerRecapTextSource = "manual" | "summary" | "none";

/**
 * Priority: manual > prior Sub-episode's `episode_summary` memory event >
 * none (Sub-episode 1 never has a recap — plan.md "ตอนย่อยที่ 1 ไม่มี recap"). Pure —
 * the caller resolves `priorEpisodeSummary` from the memory bundle.
 */
export function resolveOpenerRecapText(params: {
  manualText?: string | null;
  priorEpisodeSummary?: string | null;
  episodeNumber: number;
}): VdResolvedOverlayText<VdOpenerRecapTextSource> {
  const manual = params.manualText?.trim();
  if (manual) {
    return {
      text: clampVdOverlayText(manual, VD_OPENER_TEXT_CLAMP_MAX_CHARS),
      source: "manual",
    };
  }
  if (params.episodeNumber <= 1) return { text: "", source: "none" };

  const summary = params.priorEpisodeSummary?.trim();
  if (summary) {
    return {
      text: clampVdOverlayText(summary, VD_OPENER_TEXT_CLAMP_MAX_CHARS),
      source: "summary",
    };
  }
  return { text: "", source: "none" };
}

/* -------------------------------------------------------------------------- */
/* Title bumper / episode indicator — deterministic label derivation          */
/* -------------------------------------------------------------------------- */

export interface VdTitleBumperLines {
  primary: string;
  secondary: string;
}

/** "ชื่อซีรีส์ + 'SUB-EP N: ชื่อตอนย่อย'" (plan.md แหล่งข้อความอัตโนมัติ). */
export function deriveTitleBumperLines(params: {
  seriesTitle: string;
  episodeNumber: number;
  episodeTitle?: string | null;
}): VdTitleBumperLines {
  const episodeTitle = params.episodeTitle?.trim();
  const secondary = episodeTitle
    ? `SUB-EP ${params.episodeNumber}: ${episodeTitle}`
    : `SUB-EP ${params.episodeNumber}`;
  return { primary: params.seriesTitle.trim() || "—", secondary };
}

/** "SUB-EP N/รวม" from the planned Sub-episode count (legacy `targetEpisodeCount`). */
export function deriveEpisodeIndicatorLabel(
  episodeNumber: number,
  targetEpisodeCount?: number | null
): string {
  return targetEpisodeCount && targetEpisodeCount > 0
    ? `SUB-EP ${episodeNumber}/${targetEpisodeCount}`
    : `SUB-EP ${episodeNumber}`;
}

/* -------------------------------------------------------------------------- */
/* Character intro cards — first-appearance derivation                       */
/* -------------------------------------------------------------------------- */

/** Minimal per-shot projection needed — a subset of
 *  `VerticalDramaStartFramePlan["frames"][number]` (`@shared/verticalDramaSeries/contracts`). */
export interface VdCharacterIntroSourceFrame {
  shotNumber: number;
  requiredCharacterRefs: readonly string[];
}

/** Minimal character-roster projection needed — a subset of the
 *  `vertical_drama_characters` row shape. */
export interface VdCharacterIntroSourceCharacter {
  characterKey: string;
  name: string;
  role?: string | null;
}

export interface VdDerivedCharacterIntroCard {
  characterKey: string;
  shotNumber: number;
  name: string;
  role?: string;
}

/**
 * "ช็อตแรกที่ตัวละครโผล่" — the first shot (ascending `shotNumber`) each
 * character key appears in via `frame.requiredCharacterRefs`, projected to a
 * lower-third label {name, role}. A character key with no matching roster
 * entry (deleted/renamed character) is silently skipped — nothing to caption.
 * Pure, deterministic — sorted by `shotNumber` ascending in the result.
 */
export function deriveCharacterIntroCards(
  frames: readonly VdCharacterIntroSourceFrame[],
  characters: readonly VdCharacterIntroSourceCharacter[]
): VdDerivedCharacterIntroCard[] {
  const byKey = new Map(characters.map(c => [c.characterKey, c]));
  const firstShotByKey = new Map<string, number>();
  const sortedFrames = [...frames].sort((a, b) => a.shotNumber - b.shotNumber);
  for (const frame of sortedFrames) {
    for (const key of frame.requiredCharacterRefs) {
      if (!firstShotByKey.has(key)) firstShotByKey.set(key, frame.shotNumber);
    }
  }
  const cards: VdDerivedCharacterIntroCard[] = [];
  for (const [key, shotNumber] of firstShotByKey) {
    const character = byKey.get(key);
    if (!character) continue;
    cards.push({
      characterKey: key,
      shotNumber,
      name: character.name,
      role: character.role?.trim() || undefined,
    });
  }
  return cards.sort((a, b) => a.shotNumber - b.shotNumber);
}

/* -------------------------------------------------------------------------- */
/* Opening sequence auto-queue (titleBumper then openerRecap)                 */
/* -------------------------------------------------------------------------- */

export interface VdOverlayWindow {
  startSec: number;
  endSec: number;
}

/**
 * "opener+titleBumper ซ้อนต้นคลิป → จัดคิวต่อกันอัตโนมัติ (bumper ก่อน แล้ว
 * recap)" — both are START-anchored (unlike `endCard`, which is anchored to
 * the (not-yet-known-here) end of the video), so their windows are fully
 * resolvable without a real render duration: the bumper always occupies
 * `[0, 1.2)`; the recap starts right after it (or at `0` when the bumper is
 * disabled).
 */
export function resolveOpeningSequenceWindows(
  plan: Pick<VdTextOverlayPlan, "titleBumper" | "openerRecap">
): { titleBumper?: VdOverlayWindow; openerRecap?: VdOverlayWindow } {
  const bumperEnabled = plan.titleBumper?.enabled === true;
  const bumperEnd = bumperEnabled ? VD_TITLE_BUMPER_DURATION_SECONDS : 0;
  const result: {
    titleBumper?: VdOverlayWindow;
    openerRecap?: VdOverlayWindow;
  } = {};
  if (bumperEnabled) {
    result.titleBumper = { startSec: 0, endSec: bumperEnd };
  }
  if (plan.openerRecap?.enabled) {
    const dur =
      plan.openerRecap.durationSec ?? VD_OPENER_RECAP_DURATION_BOUNDS.default;
    result.openerRecap = { startSec: bumperEnd, endSec: bumperEnd + dur };
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Watermark / episode-indicator corner clash auto-avoid                      */
/* -------------------------------------------------------------------------- */

/**
 * "episodeIndicator กับ watermark มุมเดียวกัน → auto-เลี่ยงคนละมุม" —
 * `episodeIndicator` only ever takes a TOP corner (`top_left`/`top_right`),
 * so a clash is only possible when the watermark's OWN configured corner is
 * the exact same top corner; when it is, the watermark is deterministically
 * moved to the matching BOTTOM corner (same left/right side, so it stays
 * visually paired with the author's left/right intent) instead. A no-op
 * (returns the original position, `adjusted: false`) whenever the episode
 * indicator is disabled or the corners already differ.
 */
export function resolveWatermarkCornerAutoAvoid(params: {
  watermarkPosition: VdWatermarkPosition;
  episodeIndicatorEnabled: boolean;
  episodeIndicatorPosition?: VdEpisodeIndicatorPosition;
}): { position: VdWatermarkPosition; adjusted: boolean } {
  if (!params.episodeIndicatorEnabled || !params.episodeIndicatorPosition) {
    return { position: params.watermarkPosition, adjusted: false };
  }
  if (params.watermarkPosition !== params.episodeIndicatorPosition) {
    return { position: params.watermarkPosition, adjusted: false };
  }
  // Only the TOP row can collide with the episode indicator (which lives at
  // top_left/top_right), so a collision is resolved by dropping straight down
  // the same column — preserving the author's horizontal intent instead of
  // always jumping to a bottom corner as the four-corner version did.
  const moved: VdWatermarkPosition = params.watermarkPosition.startsWith("top_")
    ? (params.watermarkPosition.replace("top_", "bottom_") as VdWatermarkPosition)
    : params.watermarkPosition;
  return { position: moved, adjusted: moved !== params.watermarkPosition };
}

/* -------------------------------------------------------------------------- */
/* Structural validation (bounds + warnings; never blocks by itself)          */
/* -------------------------------------------------------------------------- */

export interface VdTextOverlayValidationIssue {
  code:
    | "VD_TEXT_OVERLAY_CARD_DURATION_OUT_OF_RANGE"
    | "VD_TEXT_OVERLAY_END_CARD_DURATION_OUT_OF_RANGE"
    | "VD_TEXT_OVERLAY_OPENER_DURATION_OUT_OF_RANGE"
    | "VD_TEXT_OVERLAY_TOO_MANY_CARDS"
    | "VD_TEXT_OVERLAY_TOO_MANY_CONCURRENT_CARDS"
    | "VD_TEXT_OVERLAY_FULLSCREEN_BANNER_OVERLAP";
  severity: "error" | "warning";
  message: string;
  cardId?: string;
}

/**
 * Deterministic, pure validation over a proposed episode text-overlay plan
 * (plan.md "กติกากันชนกันเอง"): duration bounds are ERRORS (zod already
 * enforces the same numeric bounds at the schema level for a freshly-typed
 * value, but this is re-checked here so callers building a plan
 * programmatically — e.g. from an auto-derived default — get the same
 * guarantee); concurrent-card and fullscreen-banner-overlap checks are
 * WARNINGS only (never block a save). `estimatedVideoDurationSeconds` is
 * OPTIONAL and only sharpens the end-card-vs-fullscreen-banner overlap check
 * (end card is END-anchored — its absolute window is unknowable without an
 * estimate); omitting it simply skips that one sub-check.
 */
export function validateTextOverlayPlan(
  plan: VdTextOverlayPlan,
  opts: {
    fullscreenBannerWindows?: readonly VdOverlayWindow[];
    estimatedVideoDurationSeconds?: number;
  } = {}
): VdTextOverlayValidationIssue[] {
  const issues: VdTextOverlayValidationIssue[] = [];

  if (plan.endCard?.enabled) {
    const dur = plan.endCard.durationSec ?? VD_END_CARD_DURATION_BOUNDS.default;
    if (
      dur < VD_END_CARD_DURATION_BOUNDS.min ||
      dur > VD_END_CARD_DURATION_BOUNDS.max
    ) {
      issues.push({
        code: "VD_TEXT_OVERLAY_END_CARD_DURATION_OUT_OF_RANGE",
        severity: "error",
        message: `End card duration must be between ${VD_END_CARD_DURATION_BOUNDS.min} and ${VD_END_CARD_DURATION_BOUNDS.max} seconds.`,
      });
    }
  }

  if (plan.openerRecap?.enabled) {
    const dur =
      plan.openerRecap.durationSec ?? VD_OPENER_RECAP_DURATION_BOUNDS.default;
    if (
      dur < VD_OPENER_RECAP_DURATION_BOUNDS.min ||
      dur > VD_OPENER_RECAP_DURATION_BOUNDS.max
    ) {
      issues.push({
        code: "VD_TEXT_OVERLAY_OPENER_DURATION_OUT_OF_RANGE",
        severity: "error",
        message: `Opener recap duration must be between ${VD_OPENER_RECAP_DURATION_BOUNDS.min} and ${VD_OPENER_RECAP_DURATION_BOUNDS.max} seconds.`,
      });
    }
  }

  const allCards = plan.cards ?? [];
  if (allCards.length > VD_TEXT_OVERLAY_MAX_CARDS) {
    issues.push({
      code: "VD_TEXT_OVERLAY_TOO_MANY_CARDS",
      severity: "error",
      message: `An episode may include at most ${VD_TEXT_OVERLAY_MAX_CARDS} mid-episode cards (found ${allCards.length}).`,
    });
  }

  const enabledCards = allCards.filter(c => c.enabled);
  for (const card of enabledCards) {
    if (
      card.durationSec < VD_CARD_DURATION_BOUNDS.min ||
      card.durationSec > VD_CARD_DURATION_BOUNDS.max
    ) {
      issues.push({
        code: "VD_TEXT_OVERLAY_CARD_DURATION_OUT_OF_RANGE",
        severity: "error",
        message: `Card "${card.id}" duration must be between ${VD_CARD_DURATION_BOUNDS.min} and ${VD_CARD_DURATION_BOUNDS.max} seconds.`,
        cardId: card.id,
      });
    }
  }

  // Concurrency warning (plan.md "การ์ดกลางตอนซ้อนเวลากับซับบทพูดได้ ...
  // แต่ >2 การ์ดพร้อมกัน = เตือน"): a coarse pre-flight proxy using each
  // card's own declared anchor (same `shotNumber` + overlapping
  // `[offsetSec, offsetSec+durationSec)` local window) — the TRUE absolute-
  // timeline overlap is only knowable once shots are mapped to clips at
  // render time; this catches the common "two cards anchored to literally
  // the same shot at overlapping offsets" authoring mistake early.
  const sorted = [...enabledCards].sort(
    (a, b) =>
      a.anchor.shotNumber - b.anchor.shotNumber ||
      (a.anchor.offsetSec ?? 0) - (b.anchor.offsetSec ?? 0)
  );
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    const aStart = a.anchor.offsetSec ?? 0;
    const aEnd = aStart + a.durationSec;
    let concurrent = 1;
    for (let j = 0; j < sorted.length; j += 1) {
      if (i === j) continue;
      const b = sorted[j]!;
      if (b.anchor.shotNumber !== a.anchor.shotNumber) continue;
      const bStart = b.anchor.offsetSec ?? 0;
      const bEnd = bStart + b.durationSec;
      if (aStart < bEnd && bStart < aEnd) concurrent += 1;
    }
    if (concurrent > VD_CARD_MAX_CONCURRENT) {
      issues.push({
        code: "VD_TEXT_OVERLAY_TOO_MANY_CONCURRENT_CARDS",
        severity: "warning",
        message: `More than ${VD_CARD_MAX_CONCURRENT} cards overlap around shot ${a.anchor.shotNumber}.`,
        cardId: a.id,
      });
      break;
    }
  }

  // Fullscreen-banner overlap warning (plan.md "fullscreen banner ทับช่วง
  // endCard/opener = เตือน (z-order banner ชนะ)").
  const fullscreenWindows = opts.fullscreenBannerWindows ?? [];
  if (fullscreenWindows.length > 0) {
    const opening = resolveOpeningSequenceWindows(plan);
    if (opening.openerRecap) {
      const overlapsOpener = fullscreenWindows.some(
        w =>
          w.startSec < opening.openerRecap!.endSec &&
          opening.openerRecap!.startSec < w.endSec
      );
      if (overlapsOpener) {
        issues.push({
          code: "VD_TEXT_OVERLAY_FULLSCREEN_BANNER_OVERLAP",
          severity: "warning",
          message:
            "A fullscreen ad banner overlaps the opener recap window; the banner will render on top.",
        });
      }
    }
    if (plan.endCard?.enabled && opts.estimatedVideoDurationSeconds != null) {
      const dur =
        plan.endCard.durationSec ?? VD_END_CARD_DURATION_BOUNDS.default;
      const endCardWindow: VdOverlayWindow = {
        startSec: Math.max(0, opts.estimatedVideoDurationSeconds - dur),
        endSec: opts.estimatedVideoDurationSeconds,
      };
      const overlapsEndCard = fullscreenWindows.some(
        w =>
          w.startSec < endCardWindow.endSec && endCardWindow.startSec < w.endSec
      );
      if (overlapsEndCard) {
        issues.push({
          code: "VD_TEXT_OVERLAY_FULLSCREEN_BANNER_OVERLAP",
          severity: "warning",
          message:
            "A fullscreen ad banner overlaps the end card window; the banner will render on top.",
        });
      }
    }
  }

  return issues;
}
