/**
 * Vertical Drama Series — Final Render filter graph (task #21 / W12.5 "Final
 * Render Suite", phase A: RENDER ENGINE layer).
 *
 * Pure, DB-free, exec-free ffmpeg argv/`.ass` builders. Extends the episode
 * assembler's concat-only pipeline (`verticalDramaEpisodeVideoAssembly.ts`'s
 * `buildConcatFfmpegArgs`) into a full final-render `-filter_complex` graph
 * supporting:
 *   1. dialogue audio mixdown (per-line `adelay`/`volume` -> `amix`, optional
 *      `loudnorm`),
 *   2. burned-in subtitles + speaker names (libass `.ass` file, styled per the
 *      existing HyperFrames caption preset ids),
 *   3. ad banner image overlays (`shared/verticalDramaSeries/adBannerPresets.ts`
 *      placements, cover-fit + fade + timed `enable=`).
 *
 * Architecture: kept as a SEPARATE module from the job service on purpose (see
 * `verticalDramaEpisodeVideoAssembly.ts`'s own header doc comment for why the
 * Node in-process ffmpeg architecture was chosen over the Python compositor) —
 * this file owns the big pure graph-string construction so the job service
 * only orchestrates staging/IO. Nothing in this module ever spawns a process
 * or touches the DB/network; every export is a plain string/array builder,
 * which is what makes it fully unit-testable without a real ffmpeg binary.
 *
 * Regression lock: when NO banners/dialogueAudio/subtitles are supplied,
 * `buildFinalRenderFfmpegArgs` returns an argv array that is BYTE-IDENTICAL to
 * `buildConcatFfmpegArgs`'s output for the same concat/output paths — see the
 * `LEGACY_SCALE_PAD_VF` constant below, which mirrors that function's `-vf`
 * value exactly. This file intentionally does NOT import from
 * `verticalDramaEpisodeVideoAssembly.ts` (avoiding a circular dependency
 * between the two sibling modules — the job service imports FROM this file,
 * not the other way around); the two literals are kept in sync by a dedicated
 * byte-equality regression test in `__tests__/verticalDramaFinalRenderGraph.test.ts`
 * that imports both real functions and asserts array equality, so any future
 * drift fails CI loudly instead of silently.
 *
 * `-map` policy: whenever `-filter_complex` is used at all (any one of the
 * three features present), this module ALWAYS emits explicit `-map` flags for
 * both the final video and audio labels, rather than relying on ffmpeg's
 * "automatic stream selection for filtergraph outputs not otherwise mapped"
 * behavior. That behavior is real but version-sensitive and hard to assert in
 * a string-only unit test; being fully explicit is the standard production
 * pattern once a filter graph exists, and it is what our tests can actually
 * pin down deterministically. The audio map degrades to `0:a?` (ffmpeg's
 * optional-stream-map syntax) when no dialogue-audio mixing is requested, so a
 * silent source clip still produces a (video-only) output instead of erroring
 * — matching today's implicit-no-`-map` tolerance for that edge case.
 *
 * Scope exclusions (explicit, per task #21 phase A):
 *  - `dialogueAudio.duckClipAudioDb` is accepted in the type contract (phase B
 *    forward-compat) but is a DOCUMENTED NO-OP here — sidechain-free ducking is
 *    out of scope for this wave (see `buildAudioFilterGraph`'s doc comment).
 *  - No upload/publish/scheduling of any kind (owner explicitly excluded it).
 *  - No live paid renders — every builder here is a pure string/array
 *    function; `verticalDramaEpisodeVideoAssembly.ts` decides when/whether to
 *    actually spawn ffmpeg with the args this module produces.
 *
 * ASS style precedent: the 10 subtitle preset ids burned in here are the SAME
 * ids as `HyperframesFinalCompositeSubtitlePresetSchema`
 * (`@shared/hyperframes/runtimeApiSchemas.ts`) — the storyboard-review capture
 * system's caption presets, reused whole per the owner's direction ("ใช้
 * preset subtitle มาได้ยกชุดเลย"). That system already ships a PRODUCTION
 * ffmpeg/libass ASS-fallback renderer for these exact ids
 * (`server/workers/hyperframesRenderWorker.ts`'s `buildFinalCompositeAss` /
 * `subtitleStyleForPreset` / its `[V4+ Styles]` block, all calibrated for the
 * SAME 1080x1920 canvas this feature uses) — `VD_CAPTION_PRESET_ASS_STYLES`
 * below adapts those exact, already-shipped font/size/color/alignment/margin
 * values (see the per-preset comments for the citation + any deviation) rather
 * than inventing new numbers, for both visual consistency across the app and
 * because they are the closest thing this codebase has to a "spec" for what
 * each preset name should look like. This module does NOT import from that
 * worker file (different feature domain/pipeline, and it is not part of this
 * task's read-only or owned file list) — the values are ported, not shared.
 */

import { z } from "zod";
import { HyperframesFinalCompositeSubtitlePresetSchema } from "@shared/hyperframes/runtimeApiSchemas";
import {
  VD_AD_BANNER_FRAME_WIDTH,
  VD_AD_BANNER_MAX_PER_SERIES,
  VD_AD_BANNER_PLACEMENT_IDS,
  getAdBannerPlacementPreset,
  resolvePlacementBox,
  type VdAdBannerPlacementId,
} from "@shared/verticalDramaSeries/adBannerPresets";

/* -------------------------------------------------------------------------- */
/* Public input contracts (phase B wiring surface)                            */
/* -------------------------------------------------------------------------- */

/**
 * A single ad banner, fully resolved to a LOCAL staged PNG file and absolute
 * render-timeline seconds — the job service (`verticalDramaEpisodeVideoAssembly.ts`)
 * downloads the design's `imageAsset.url` to the job temp dir and resolves
 * `defaultTiming`/per-episode overrides into `startSec`/`endSec` BEFORE
 * calling into this module (mirrors plan.md §7's `ResolvedBanner` shape).
 */
export interface ResolvedBanner {
  localPngPath: string;
  placementId: VdAdBannerPlacementId;
  /** Only meaningful for `placementId === "side_vertical"` — see `resolvePlacementBox`. */
  sideAlign?: "left" | "right";
  startSec: number;
  endSec: number;
  fadeSec: number;
}

/** One dialogue/TTS line's rendered audio, positioned on the render timeline. */
export interface DialogueAudioSegment {
  localPath: string;
  startSec: number;
  /** Optional per-segment gain trim in dB (e.g. `-2` to attenuate, `3` to boost). */
  gainDb?: number;
}

export interface DialogueAudioInput {
  segments: DialogueAudioSegment[];
  /** Apply EBU-ish `loudnorm` to the mixed (or, with zero segments, the plain
   *  clip) audio. */
  loudnessNormalize?: boolean;
  /**
   * Reserved for a future sidechain-free "duck the clip audio while dialogue
   * plays" wave — see this module's header doc comment. Accepted so the type
   * contract matches phase B's expected shape; NOT wired into the filter
   * graph in this phase. A caller passing a value here gets a byte-identical
   * audio graph to passing nothing.
   */
  duckClipAudioDb?: number;
}

/**
 * Subtitle burn-in input. Extends the task's literal `{assPath}` contract with
 * an optional `fontsDir`, since the ffmpeg `subtitles` filter needs its own
 * `fontsdir` option SEPARATELY from `.ass` file generation (`buildAssSubtitleFile`
 * cannot embed a filesystem font directory into the `.ass` content itself) —
 * without this, custom Thai fonts referenced by the mapped ASS styles would
 * only resolve if they happened to already be installed system-wide via
 * fontconfig. Never hardcoded here — always caller-supplied (see
 * `resolveVdSubtitleFontsDir` in `verticalDramaEpisodeVideoAssembly.ts`).
 */
export interface SubtitlesInput {
  assPath: string;
  fontsDir?: string;
}

/**
 * A resolved (locally-staged) IMAGE watermark (task #34, plan.md ลายน้ำ —
 * `type: "image"` only; `type: "text"` renders through the ASS overlay
 * channel instead, see `VdTextOverlayAssEvent`'s `"watermark_text"` kind).
 * Spans the WHOLE video by construction (the job service loops it for
 * exactly `videoDurationSeconds`, mirroring how a `fullscreen`
 * `ResolvedBanner` would if it covered the entire clip) — there is no
 * start/end window because a watermark is always "entire clip" by design.
 */
export interface ResolvedWatermarkImage {
  localPngPath: string;
  position: "top_left" | "top_right" | "bottom_left" | "bottom_right";
  /** 0.2-0.8 (validated by the caller's zod schema; this module trusts it). */
  opacity: number;
  /** 5-20 (% of the 1080px-wide compositing frame). */
  scalePct: number;
  marginPx: number;
}

export interface BuildFinalRenderFfmpegArgsInput {
  /** Absolute path to the concat-demuxer list file (same as `buildConcatFfmpegArgs`). */
  concatListPath: string;
  /** Absolute output path. */
  output: string;
  /** Total duration (seconds) of the concatenated source clips — REQUIRED so
   *  banner timing/validation and looped-image input durations can be
   *  resolved without a two-pass encode. The job service computes this by
   *  probing the already-downloaded source clips before calling here. */
  videoDurationSeconds: number;
  fps?: number;
  banners?: ResolvedBanner[];
  dialogueAudio?: DialogueAudioInput;
  subtitles?: SubtitlesInput | null;
  /** Task #34 — a series' IMAGE watermark, composited as the ABSOLUTE
   *  TOP-MOST layer (above fullscreen banners, plan.md "z-order บนสุดเหนือ
   *  ทุกชั้นรวม fullscreen banner — branding ต้องรอดเสมอ"). See
   *  `resolveWatermarkOverlayFragment`'s doc comment for the z-order
   *  implementation and its one documented scope limit (the TEXT watermark
   *  variant does not get this same guarantee). */
  watermarkImage?: ResolvedWatermarkImage;
}

/** One caption/subtitle line to burn in — shot-timeline-agnostic; the caller
 *  (job service) is responsible for resolving cue timing onto the FINAL
 *  render's absolute timeline before calling `buildAssSubtitleFile`. */
export interface AssSubtitleLine {
  startSec: number;
  endSec: number;
  speakerName?: string;
  text: string;
}

export interface AssSubtitleBuildOpts {
  fontsDir?: string;
  playResX: number;
  playResY: number;
}

/** The 10 HyperFrames subtitle preset ids, reused whole (see module doc comment). */
export type CaptionPresetId = z.infer<
  typeof HyperframesFinalCompositeSubtitlePresetSchema
>;

export interface VdFinalRenderBannerIssue {
  code:
    | "VD_FINAL_RENDER_BANNER_TOO_MANY"
    | "VD_FINAL_RENDER_BANNER_UNKNOWN_PLACEMENT"
    | "VD_FINAL_RENDER_BANNER_INVALID_WINDOW"
    | "VD_FINAL_RENDER_BANNER_OUT_OF_BOUNDS"
    | "VD_FINAL_RENDER_BANNER_FULLSCREEN_OVERLAP"
    | "VD_FINAL_RENDER_BANNER_FULLSCREEN_BUDGET";
  severity: "error" | "warning";
  message: string;
  bannerIndex?: number;
  placementId?: string;
}

/* -------------------------------------------------------------------------- */
/* Shared numeric/string formatting helpers                                   */
/* -------------------------------------------------------------------------- */

/** Format a seconds value for embedding in an ffmpeg filter option — trims
 *  floating point noise (e.g. `12.299999999999997`) and normalizes `-0`. */
function secStr(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

function formatDb(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * Escape a filesystem path for safe embedding as an ffmpeg filter OPTION VALUE
 * (e.g. `subtitles=filename=...`), per ffmpeg's own filtergraph escaping rules
 * (distinct from shell escaping — these args are always spawned with
 * `shell: false`, so only ffmpeg's `:`/`,`/`'` syntax matters here): backslash
 * and colon are backslash-escaped, then the whole value is wrapped in single
 * quotes with any embedded single quote closed/escaped/reopened. Returns the
 * ALREADY-QUOTED literal, ready to drop straight after `filename=`/`fontsdir=`.
 */
export function escapeFfmpegFilterPath(rawPath: string): string {
  const backslashAndColonEscaped = rawPath
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:");
  const quoteEscaped = backslashAndColonEscaped.replace(/'/g, "'\\''");
  return `'${quoteEscaped}'`;
}

/* -------------------------------------------------------------------------- */
/* Legacy concat -vf (byte-identical regression anchor)                       */
/* -------------------------------------------------------------------------- */

/** Mirrors `buildConcatFfmpegArgs`'s `-vf` value exactly — see module doc
 *  comment's "Regression lock" section. */
const LEGACY_SCALE_PAD_VF =
  "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1";

/* -------------------------------------------------------------------------- */
/* ASS subtitle style mapping (caption preset -> ASS style)                   */
/* -------------------------------------------------------------------------- */

interface VdAssStyleSpec {
  /** ASS `[V4+ Styles]` `Name` field — also the `Style` field every
   *  `Dialogue:` line for this preset references. */
  name: string;
  fontName: string;
  fontSize: number;
  /** `&HAABBGGRR` — AA is TRANSPARENCY (00 = opaque, FF = fully transparent),
   *  not alpha, per the ASS/SSA spec. */
  primaryColour: string;
  secondaryColour: string;
  outlineColour: string;
  backColour: string;
  bold: 0 | 1;
  italic: 0 | 1;
  /** 1 = outline + drop shadow (no fill box); 3 = opaque box behind the line. */
  borderStyle: 1 | 3;
  outline: number;
  shadow: number;
  /** ASS numpad alignment (2 = bottom-center, 1 = bottom-left, ...). */
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  /** When true, `buildAssDialogueEvent` renders the body text as evenly-timed
   *  `\k` karaoke word tags instead of plain text (see `buildKaraokeAssText`). */
  supportsKaraoke?: boolean;
  /** ASS `[V4+ Styles]` `Spacing` field (letter-spacing, px) — defaults to
   *  `0` (byte-identical to before task #34) when omitted; used by
   *  `VdTimeSetting` (task #34, see that style's own comment). */
  spacing?: number;
}

/**
 * Caption preset -> ASS style mapping table (the deliverable "mapping table").
 * All ten `CaptionPresetId` values are covered; `no_subtitle_style` maps to
 * `null`, meaning "skip burn-in entirely" (matches
 * `hyperframesRenderWorker.ts`'s own `if (subtitlePreset === "no_subtitle_style") continue;`
 * behavior). PlayRes is fixed at 1080x1920 by the caller (this is a 9:16-only
 * feature) — every numeric value below was tuned by the cited precedent
 * against exactly that canvas size, so it is used as-is rather than re-derived.
 *
 * Every font name below is one of `hyperframesThaiFontFamilies`
 * (`@shared/hyperframes/creativePresets.ts`) — the same 5-font allow-list this
 * app already uses for burned-in Thai text elsewhere.
 */
const VD_CAPTION_PRESET_ASS_STYLES: Record<
  CaptionPresetId,
  VdAssStyleSpec | null
> = {
  // classic_box — the safe, default look: opaque box, bottom-center, no bold.
  // Ported 1:1 from hyperframesRenderWorker.ts's "Default" style (its own
  // classic_box fallback target), which is itself calibrated for 1080x1920.
  classic_box: {
    name: "VdClassicBox",
    fontName: "Noto Sans Thai",
    fontSize: 60,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H7A000000",
    backColour: "&HA0000000",
    bold: 0,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 2,
    marginL: 96,
    marginR: 96,
    marginV: 170,
  },
  // minimal_shadow — no box; a soft drop shadow (Shadow=2) does the contrast
  // work instead. Ported from "SubMinimal".
  minimal_shadow: {
    name: "VdMinimalShadow",
    fontName: "Noto Sans Thai",
    fontSize: 58,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H95000000",
    backColour: "&H00000000",
    bold: 0,
    italic: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 2,
    alignment: 2,
    marginL: 96,
    marginR: 96,
    marginV: 168,
  },
  // creator_pop — dark text on a near-white pill-like wash, bold, Prompt (a
  // rounder, more "creator/social" Thai face than Noto Sans Thai). Ported
  // from "SubPop".
  creator_pop: {
    name: "VdCreatorPop",
    fontName: "Prompt",
    fontSize: 58,
    primaryColour: "&H00111111",
    secondaryColour: "&H000000FF",
    outlineColour: "&H00FFFFFF",
    backColour: "&HDCFFFFFF",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 1.5,
    shadow: 0,
    alignment: 2,
    marginL: 80,
    marginR: 80,
    marginV: 170,
  },
  // karaoke_word — gold "sung" primary / white "unsung" secondary, matching
  // ASS's real \k semantics (see `buildKaraokeAssText`: since our input
  // contract only carries a per-LINE start/end, not per-word timing, word
  // boundaries are split evenly across the line's duration — the SAME
  // even-split technique `hyperframesRenderWorker.ts`'s `buildSubtitleAssText`
  // uses for its own karaoke_word branch, cited/reimplemented locally so this
  // module stays free of cross-pipeline imports. True per-word timing is a
  // documented future enhancement once dialogue lines carry word-level cues.
  karaoke_word: {
    name: "VdKaraokeWord",
    fontName: "Noto Sans Thai",
    fontSize: 58,
    primaryColour: "&H0000D7FF",
    secondaryColour: "&H00FFFFFF",
    outlineColour: "&H7A000000",
    backColour: "&HA0000000",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 2,
    marginL: 96,
    marginR: 96,
    marginV: 170,
    supportsKaraoke: true,
  },
  // highlight_bar — solid amber/gold bar behind white bold text (hyperframes'
  // own alias for this preset is literally "TikTok Red Sweep" /
  // "แดงปาดคำแบบสั้น" — the shipped color is actually amber #FACC15, matching
  // the CSS renderer's `rgba(250,204,21,.84)` for the same preset id). Ported
  // from "SubHighlight".
  highlight_bar: {
    name: "VdHighlightBar",
    fontName: "Noto Sans Thai",
    fontSize: 58,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H40111111",
    backColour: "&H0015CCFA",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 1,
    shadow: 0,
    alignment: 2,
    marginL: 96,
    marginR: 96,
    marginV: 170,
  },
  // lower_third — bottom-LEFT aligned (Alignment=1, not center), much larger
  // MarginV (300) so it sits as a news-chyron-style lower third rather than
  // hugging the bottom edge. hyperframes' own Thai alias is literally
  // "ซับล่างแบบผู้รีวิว" (reviewer-style lower third) — a natural fit for the
  // speaker-name chip (see `buildAssDialogueEvent`). Ported from "SubLowerThird".
  lower_third: {
    name: "VdLowerThird",
    fontName: "Noto Sans Thai",
    fontSize: 54,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H80111111",
    backColour: "&HB0000000",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 1,
    marginL: 92,
    marginR: 96,
    marginV: 300,
  },
  // cinematic_wide — off-white (not pure white), not bold, narrow side
  // margins (64 vs the 96 default) for a "wide" film-subtitle band, sitting
  // closer to the bottom edge (MarginV 126) per cinema convention. Ported
  // from "SubCinematic".
  cinematic_wide: {
    name: "VdCinematicWide",
    fontName: "Noto Sans Thai",
    fontSize: 54,
    primaryColour: "&H00F8FAFC",
    secondaryColour: "&H000000FF",
    outlineColour: "&H7A000000",
    backColour: "&HA0000000",
    bold: 0,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 2,
    marginL: 64,
    marginR: 64,
    marginV: 126,
  },
  // neon_glow — light cyan text with a magenta outline (classic duotone
  // "neon" look), Kanit (a more geometric/modern Thai face, matching the
  // gaming/tech-adjacent vibe of this preset). Ported from "SubNeon".
  neon_glow: {
    name: "VdNeonGlow",
    fontName: "Kanit",
    fontSize: 56,
    primaryColour: "&H00FEE2A8",
    secondaryColour: "&H000000FF",
    outlineColour: "&H00FF2ABF",
    backColour: "&HB0000000",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 1,
    alignment: 2,
    marginL: 84,
    marginR: 84,
    marginV: 170,
  },
  // review_bubble — dark text on a near-white bubble background — the ONE
  // inverted-contrast preset in the set (chat/review-bubble UI convention).
  // Ported from "SubBubble".
  review_bubble: {
    name: "VdReviewBubble",
    fontName: "Noto Sans Thai",
    fontSize: 54,
    primaryColour: "&H00111111",
    secondaryColour: "&H000000FF",
    outlineColour: "&H00FFFFFF",
    backColour: "&HEAFFFFFF",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 1,
    shadow: 0,
    alignment: 2,
    marginL: 96,
    marginR: 96,
    marginV: 170,
  },
  // no_subtitle_style — sentinel: burn in nothing.
  no_subtitle_style: null,
};

/* -------------------------------------------------------------------------- */
/* ASS text escaping + timestamp helpers                                      */
/* -------------------------------------------------------------------------- */

/**
 * Escape a raw string for safe embedding inside an ASS `Dialogue:` Text
 * field. Handles the three cases the task calls out explicitly:
 *  - `{`/`}` (would otherwise open/close an override block, letting user text
 *    inject arbitrary `\...` style overrides) are replaced with their
 *    fullwidth Unicode look-alikes (｛｝) — a visible, non-destructive
 *    neutralization, preferred here over `hyperframesRenderWorker.ts`'s
 *    strip-entirely `escapeAssText` so a writer's literal "{sigh}" stage
 *    direction is still visible rather than silently vanishing.
 *  - Newlines (`\n`, `\r\n`) become the literal two-character ASS forced
 *    line break `\N` (a `Dialogue:` line must be a single physical line in
 *    the `.ass` file, so a raw embedded newline is invalid).
 *  - Commas need NO escaping here: this function only ever fills the LAST
 *    field of a `Dialogue:` line (Text), which is constructed by this module
 *    (never parsed) — the ASS format defines the Text field as "everything
 *    after the 9th comma", so literal commas inside it are safe verbatim.
 */
function escapeAssInlineText(raw: string): string {
  return String(raw ?? "")
    .replace(/\{/g, "｛")
    .replace(/\}/g, "｝")
    .replace(/\r\n|\r|\n/g, "\\N")
    .trim();
}

/** `H:MM:SS.CC` ASS timestamp format. */
function assTimeStamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.min(
    99,
    Math.round((safe - Math.floor(safe)) * 100)
  );
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(
    centiseconds
  ).padStart(2, "0")}`;
}

/**
 * Split text into "words" for even-duration `\k` karaoke tagging — mirrors
 * `hyperframesRenderWorker.ts`'s `splitSubtitleWords`: whitespace-delimited
 * words when present, else fixed 5-character grapheme chunks (Thai script
 * commonly has no inter-word spaces, so a pure `split(" ")` would produce one
 * giant "word" — chunking keeps the karaoke reveal visually incremental).
 */
function splitCaptionWordsForKaraoke(text: string): string[] {
  const normalized = escapeAssInlineText(text)
    .replace(/\\N/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  const spaced = normalized.split(/\s+/).filter(Boolean);
  if (spaced.length > 1) return spaced;
  const chars = Array.from(normalized);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += 5) {
    chunks.push(chars.slice(index, index + 5).join(""));
  }
  return chunks;
}

/**
 * Even-duration `\k` karaoke text for `karaoke_word` — approximates real
 * per-word timing by splitting the line's total duration equally across its
 * words (see `VD_CAPTION_PRESET_ASS_STYLES.karaoke_word`'s doc comment for
 * why: this module's input contract only carries per-LINE timing).
 */
function buildKaraokeAssText(text: string, durationSec: number): string {
  const words = splitCaptionWordsForKaraoke(text);
  if (words.length === 0) return "";
  const totalCentiseconds = Math.max(20, Math.round(durationSec * 100));
  const perWord = Math.max(10, Math.floor(totalCentiseconds / words.length));
  return words.map(word => `{\\k${perWord}}${word}`).join(" ");
}

function formatAssStyleLine(style: VdAssStyleSpec): string {
  return [
    "Style:",
    [
      style.name,
      style.fontName,
      style.fontSize,
      style.primaryColour,
      style.secondaryColour,
      style.outlineColour,
      style.backColour,
      style.bold,
      style.italic,
      0,
      0,
      100,
      100,
      style.spacing ?? 0,
      0,
      style.borderStyle,
      style.outline,
      style.shadow,
      style.alignment,
      style.marginL,
      style.marginR,
      style.marginV,
      1,
    ].join(","),
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/* Text Overlay Suite (task #34) — 8 overlay kinds, one shared ASS channel   */
/* -------------------------------------------------------------------------- */

/**
 * The 8 overlay "kinds" (task #34, plan.md v2): each gets its OWN named ASS
 * style (`VD_TEXT_OVERLAY_ASS_STYLES` below), independent of the 10 caption
 * presets above — a rendered `.ass` file may carry a caption-preset style, any
 * subset of these 8, or (subtitlePreset "none" + at least one overlay) ONLY
 * overlay styles, since `buildAssSubtitleFile`'s 4th `overlays` argument is
 * fully independent of its `preset` argument (see that function's doc
 * comment). `cards[].kind === "custom"` reuses the `narrative_hook` ASS kind
 * (see `defaultCardStyleVariantForKind` in
 * `@shared/verticalDramaSeries/textOverlay.ts`) — there is no dedicated
 * "custom" style, keeping the ASS style budget at exactly 8.
 */
export const VD_TEXT_OVERLAY_ASS_KINDS = [
  "end_card",
  "opener_recap",
  "title_bumper",
  "episode_indicator",
  "character_intro",
  "time_setting",
  "narrative_hook",
  "watermark_text",
] as const;
export type VdTextOverlayAssKind = (typeof VD_TEXT_OVERLAY_ASS_KINDS)[number];

/** The 4 frame-corner positions shared by `episode_indicator` (top corners
 *  only) and `watermark_text` (all 4) — mirrors
 *  `@shared/verticalDramaSeries/textOverlay.ts`'s `VdWatermarkPosition`
 *  (this module intentionally does NOT import that shared type, to keep this
 *  file's own contract self-contained/pure like its sibling banner types). */
export type VdTextOverlayCornerPosition =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

function isCornerPosition(value: unknown): value is VdTextOverlayCornerPosition {
  return (
    value === "top_left" ||
    value === "top_right" ||
    value === "bottom_left" ||
    value === "bottom_right"
  );
}

/**
 * One resolved (render-time, absolute-timeline) text overlay event. The
 * caller (`verticalDramaEpisodeVideoAssembly.ts`'s `runAssemblyJob` /
 * `resolveEpisodeTextOverlayRunInputs`) is responsible for resolving every
 * anchor (shot-local, "entire clip", or "end of clip") down to concrete
 * `startSec`/`endSec` BEFORE calling `buildAssSubtitleFile` — mirrors
 * `AssSubtitleLine`'s own "shot-timeline-agnostic" contract exactly.
 */
export interface VdTextOverlayAssEvent {
  kind: VdTextOverlayAssKind;
  startSec: number;
  endSec: number;
  text: string;
  /** A second, smaller line rendered below `text` via `\N` (end card's
   *  "follow line", character intro's role, title bumper's "EP N: ..." line).
   */
  secondaryText?: string;
  /** `end_card` only: `"lower_band"` repositions the event to a lower-third-
   *  ish band via an inline `\an2\pos()` override (default/omitted =
   *  `"center_card"`, the style's own baked-in middle-center alignment).
   *  `episode_indicator`/`watermark_text`: the corner to render in (episode
   *  indicator only ever sends a TOP corner; watermark sends all 4). */
  variant?: "center_card" | "lower_band" | VdTextOverlayCornerPosition;
  /** `watermark_text` only — 0.2-0.8; overrides the style's baked-in primary
   *  fill alpha via an inline `\1a` tag so ONE style can serve any
   *  series-configured opacity. */
  opacity?: number;
  /** `watermark_text` only — pixel margin from its `variant` corner; drives
   *  an explicit `\pos()` override so a continuous, series-configurable
   *  value is respected regardless of the style's own fixed MarginL/R/V
   *  (which can only ever express ONE fixed number, not a per-series one). */
  marginPx?: number;
}

/**
 * Style table for the 8 overlay kinds (task #34, plan.md "Styles" section) —
 * ALL eight are always defined (unlike `VD_CAPTION_PRESET_ASS_STYLES`, which
 * has a `null` sentinel for "skip burn-in"): an overlay event is only ever
 * present in `overlays` when its owning kind is actually enabled, so there is
 * no "kind with nothing to render" case here. Every font name is one of
 * `hyperframesThaiFontFamilies` (`@shared/hyperframes/creativePresets.ts`),
 * same allow-list convention as `VD_CAPTION_PRESET_ASS_STYLES`. Canvas is
 * fixed 1080x1920 (9:16-only feature, same as the caption presets) — every
 * margin/size below is tuned against exactly that canvas, placed clear of the
 * existing caption safe zones (top ~130px indicator band, bottom ~170-300px
 * caption/lower-third band) per plan.md "ปลอด safe zones".
 */
const VD_TEXT_OVERLAY_ASS_STYLES: Record<VdTextOverlayAssKind, VdAssStyleSpec> = {
  // end_card — "ใหญ่ 1.6x กลางจอ/แถบล่าง, fade 0.4s": 1.6x classic_box's
  // 60px base size, bold, middle-center by default (event-level `\an2\pos()`
  // override switches to the "lower_band" variant — see `buildOverlayAssEvent`).
  end_card: {
    name: "VdEndCardTeaser",
    fontName: "Prompt",
    fontSize: 96,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H90000000",
    backColour: "&HB0000000",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 3,
    shadow: 0,
    alignment: 5,
    marginL: 90,
    marginR: 90,
    marginV: 200,
  },
  // opener_recap — "บนจอ, มีหัว 'ความเดิม…'": top-center, off-white, the
  // "ความเดิมตอนที่แล้ว" header is rendered as `secondaryText`... actually
  // rendered as the PRIMARY line (bigger/first) with the recap body as
  // `secondaryText` — see `buildOverlayAssEvent`'s doc comment for the exact
  // two-line composition `resolveEpisodeTextOverlayRunInputs` builds.
  opener_recap: {
    name: "VdOpenerRecap",
    fontName: "Noto Sans Thai",
    fontSize: 46,
    primaryColour: "&H00F8FAFC",
    secondaryColour: "&H000000FF",
    outlineColour: "&H85000000",
    backColour: "&HA0000000",
    bold: 0,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 8,
    marginL: 90,
    marginR: 90,
    marginV: 140,
  },
  // title_bumper — "ใหญ่กลางจอ 1.2s fade": bold, no box (drop-shadow only,
  // BorderStyle 1) so it reads as a clean title card, not a caption line.
  title_bumper: {
    name: "VdTitleBumper",
    fontName: "Prompt",
    fontSize: 80,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&HA0000000",
    backColour: "&H00000000",
    bold: 1,
    italic: 0,
    borderStyle: 1,
    outline: 3,
    shadow: 2,
    alignment: 5,
    marginL: 80,
    marginR: 80,
    marginV: 80,
  },
  // episode_indicator — "เล็ก มุมจอ, opacity ~55%": PrimaryColour's AA byte
  // (`0x73` = 115/255 transparency) bakes in the ~55% visible opacity
  // directly (no per-event override needed — unlike `watermark_text`, this
  // kind's opacity is NOT series-configurable). Default top-right; an
  // event-level `\an7` override switches to top-left (plan.md
  // `episodeIndicator.position`).
  episode_indicator: {
    name: "VdEpIndicator",
    fontName: "Noto Sans Thai",
    fontSize: 34,
    primaryColour: "&H73FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H90000000",
    backColour: "&H00000000",
    bold: 0,
    italic: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    alignment: 9,
    marginL: 40,
    marginR: 40,
    marginV: 50,
  },
  // character_intro — "lower-third ซ้าย ชื่อหนา+บทบาทบาง": bottom-left,
  // mirrors `lower_third` caption preset's own MarginV(300)/Alignment(1)
  // convention exactly (same news-chyron-style placement) so it never
  // collides with the dialogue caption band above it. Role is rendered as
  // `secondaryText` (smaller, thin — see `buildOverlayAssEvent`).
  character_intro: {
    name: "VdCharacterIntro",
    fontName: "Noto Sans Thai",
    fontSize: 46,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H80111111",
    backColour: "&HB0000000",
    bold: 1,
    italic: 0,
    borderStyle: 3,
    outline: 2,
    shadow: 0,
    alignment: 1,
    marginL: 92,
    marginR: 96,
    marginV: 300,
  },
  // time_setting — "สไตล์ cinema — เหลือง/ขาว serif-ish กลางจอบน,
  // letter-spacing": Sarabun (the allow-list's most editorial/book-like
  // face), pale gold, top-center, positive `Spacing` for the "cinema title
  // card" letter-spaced look.
  time_setting: {
    name: "VdTimeSetting",
    fontName: "Sarabun",
    fontSize: 50,
    primaryColour: "&H003CCCFA",
    secondaryColour: "&H000000FF",
    outlineColour: "&HA0000000",
    backColour: "&H00000000",
    bold: 0,
    italic: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 1,
    alignment: 8,
    marginL: 90,
    marginR: 90,
    marginV: 130,
    spacing: 3,
  },
  // narrative_hook — "ใหญ่ เอียงเล็กน้อย มี accent": Kanit italic+bold,
  // amber/gold OUTLINE as the "accent" (reusing `highlight_bar`'s own amber
  // tone, here as an outline rather than a fill — same reuse-the-tuned-
  // palette rationale `VD_CAPTION_PRESET_ASS_STYLES`'s own comments cite).
  // `cards[].kind === "custom"` also renders through this style (see this
  // section's own header comment).
  narrative_hook: {
    name: "VdNarrativeHook",
    fontName: "Kanit",
    fontSize: 62,
    primaryColour: "&H00FFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H0015CCFA",
    backColour: "&H00000000",
    bold: 1,
    italic: 1,
    borderStyle: 1,
    outline: 3,
    shadow: 1,
    alignment: 5,
    marginL: 80,
    marginR: 80,
    marginV: 80,
  },
  // watermark_text — "จาง opacity ต่ำ" (plan.md ลายน้ำ, text variant):
  // PrimaryColour's baked-in alpha is just a NEUTRAL default (`0x4D` ≈ 30%)
  // — every real event overrides it via `\1a` from the series' OWN
  // configured `opacity` (0.2-0.8, see `VdTextOverlayAssEvent.opacity`),
  // since (unlike `episode_indicator`) this kind's opacity IS per-series
  // configurable and one style can only bake in one fixed number.
  watermark_text: {
    name: "VdWatermark",
    fontName: "Noto Sans Thai",
    fontSize: 32,
    primaryColour: "&H4DFFFFFF",
    secondaryColour: "&H000000FF",
    outlineColour: "&H60000000",
    backColour: "&H00000000",
    bold: 0,
    italic: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    alignment: 9,
    marginL: 32,
    marginR: 32,
    marginV: 32,
  },
};

/** ASS numpad alignment for a frame corner (7=top-left, 9=top-right,
 *  1=bottom-left, 3=bottom-right) — shared by the `\an` override tag AND
 *  `cornerPositionPx`'s matching `\pos()` anchor point. */
function overlayAnchorForCorner(corner: VdTextOverlayCornerPosition): number {
  switch (corner) {
    case "top_left":
      return 7;
    case "top_right":
      return 9;
    case "bottom_left":
      return 1;
    case "bottom_right":
      return 3;
  }
}

/** Absolute `\pos(x,y)` coordinates for `corner` at `marginPx` from BOTH
 *  edges it touches, on the fixed 1080x1920 canvas (matches
 *  `overlayAnchorForCorner`'s anchor point exactly, so the margin is
 *  measured from the correct edge regardless of corner). */
function cornerPositionPx(
  corner: VdTextOverlayCornerPosition,
  marginPx: number
): { x: number; y: number } {
  const frameW = 1080;
  const frameH = 1920;
  const isLeft = corner === "top_left" || corner === "bottom_left";
  const isTop = corner === "top_left" || corner === "top_right";
  return {
    x: isLeft ? marginPx : frameW - marginPx,
    y: isTop ? marginPx : frameH - marginPx,
  };
}

/** `\1a&HXX&` primary-fill-alpha override tag for `opacity` (0-1 visible
 *  opacity -> `XX` = the ASS transparency byte, `00`=opaque/`FF`=invisible —
 *  same AA-byte convention as every `PrimaryColour` value in this file). */
function overlayAlphaOverrideTag(opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  const alphaByte = Math.round((1 - clamped) * 255);
  const hex = alphaByte.toString(16).toUpperCase().padStart(2, "0");
  return `\\1a&H${hex}&`;
}

/**
 * Build one overlay `Dialogue:` event. Every kind gets a `\fad(in,out)` fade
 * (plan.md "ทุกตัว fade in/out"), capped so a very short-lived event's
 * in/out windows never overlap each other. `end_card`'s `"lower_band"`
 * variant and BOTH corner-driven kinds (`episode_indicator`/`watermark_text`)
 * layer an inline `\an`/`\pos()` override on top of the style's own default
 * alignment/margins (see this section's header comment for why `\pos()` is
 * necessary for `watermark_text` specifically: its margin is a continuous,
 * per-series configurable value a fixed ASS style margin cannot express).
 * `secondaryText`, when present, is rendered as a smaller second line via the
 * SAME chip technique `buildAssDialogueEvent` uses for the speaker-name chip
 * (a font-size override + `\N`), just with the roles reversed (primary text
 * first/bigger, secondary second/smaller) — end card's "follow line",
 * character intro's role, title bumper's "EP N: ..." line, and opener
 * recap's body (below the header) all reuse this one mechanism.
 */
function buildOverlayAssEvent(
  event: VdTextOverlayAssEvent,
  style: VdAssStyleSpec
): string {
  const start = assTimeStamp(event.startSec);
  const end = assTimeStamp(event.endSec);
  const durationSec = Math.max(0.01, event.endSec - event.startSec);
  const fadeMs = Math.max(50, Math.min(400, Math.round((durationSec * 1000) / 2) - 10));

  const overrides: string[] = [`\\fad(${fadeMs},${fadeMs})`];

  if (event.kind === "end_card" && event.variant === "lower_band") {
    overrides.push("\\an2", "\\pos(540,1650)");
  }
  if (event.kind === "episode_indicator" && event.variant === "top_left") {
    overrides.push("\\an7");
  }
  if (event.kind === "watermark_text") {
    const corner = isCornerPosition(event.variant) ? event.variant : "top_right";
    const marginPx = event.marginPx ?? 32;
    const { x, y } = cornerPositionPx(corner, marginPx);
    overrides.push(`\\an${overlayAnchorForCorner(corner)}`, `\\pos(${x},${y})`);
    if (event.opacity != null) overrides.push(overlayAlphaOverrideTag(event.opacity));
  }

  const primary = escapeAssInlineText(event.text);
  const secondary = event.secondaryText?.trim();
  const text = secondary
    ? `{${overrides.join("")}}${primary}\\N{\\fs${Math.round(style.fontSize * 0.62)}}${escapeAssInlineText(secondary)}`
    : `{${overrides.join("")}}${primary}`;

  return `Dialogue: 0,${start},${end},${style.name},,0,0,0,,${text}`;
}

/**
 * Build one `Dialogue:` event. When `line.speakerName` is present, the text
 * is a two-line block: a bold, ~60%-sized speaker-name chip (via inline
 * override tags, reset with `{\r}` back to the preset's own base style)
 * followed by a forced line break (`\N`) and the normal-weight dialogue text.
 *
 * Deliberately NOT a second `drawtext` filter (the task allows either): a
 * dialogue-heavy episode can have dozens of lines, and one `drawtext` filter
 * PER LINE (each needing its own `enable='between(t,S,E)'`) would explode the
 * filter graph the same way N per-banner overlay stages do — a single ASS
 * event with an inline override handles per-line speaker styling with zero
 * additional filter stages, since libass already walks the whole cue list
 * for us. The speaker chip intentionally REUSES the preset's own text color
 * (bold + smaller size only) rather than inventing a new per-preset accent
 * color, so it always inherits that preset's already-tuned contrast.
 */
function buildAssDialogueEvent(
  line: AssSubtitleLine,
  style: VdAssStyleSpec
): string {
  const start = assTimeStamp(line.startSec);
  const end = assTimeStamp(line.endSec);
  const durationSec = Math.max(0.01, line.endSec - line.startSec);
  const body = style.supportsKaraoke
    ? buildKaraokeAssText(line.text, durationSec)
    : escapeAssInlineText(line.text);
  const speaker = line.speakerName?.trim();
  const text = speaker
    ? `{\\b1\\fs${Math.round(style.fontSize * 0.6)}}${escapeAssInlineText(speaker)}:{\\r}\\N${body}`
    : body;
  return `Dialogue: 0,${start},${end},${style.name},,0,0,0,,${text}`;
}

/**
 * Build a full `.ass` subtitle file for `preset`. Returns a header-only
 * (zero-Dialogue-event) file for `no_subtitle_style` and for an empty `lines`
 * array — both are valid, harmless inputs to the ffmpeg `subtitles` filter
 * (burns in nothing) rather than error conditions.
 *
 * `WrapStyle: 0` (libass's default "smart wrap") is used deliberately instead
 * of manually pre-wrapping text into fixed-width lines: dialogue cue text
 * reaching this function has already passed the upstream per-shot subtitle
 * safe-area validation (`VerticalDramaSubtitleSafeArea.maxLines`/character
 * budgets in `@shared/verticalDramaSeries/subtitles.ts`), so relying on
 * libass's own wrapper here is a safety net, not the primary line-fitting
 * mechanism — a deliberate scope simplification for phase A.
 *
 * `opts.fontsDir` is accepted (never used to resolve an ACTUAL font at
 * generation time — libass/ffmpeg resolve fonts at burn-in time via the
 * `subtitles` filter's own `fontsdir` option, see `SubtitlesInput`'s doc
 * comment) and is recorded as an informational `;`-prefixed ASS comment line
 * so the parameter is not silently dropped.
 *
 * `overlays` (task #34, default `[]`) is COMPLETELY INDEPENDENT of `preset`:
 * a `[V4+ Styles]` entry is emitted for every DISTINCT overlay kind actually
 * present (not all 8 unconditionally, keeping the file lean), and every
 * valid overlay event is always rendered — even when `preset` is
 * `"no_subtitle_style"` (`style` is `null`, so `events` below is `[]`, but
 * `overlayEvents` is NOT gated on `style`). This is what lets a render with
 * `subtitlePreset: "none"` still carry end-card/opener/watermark/etc. text
 * (plan.md "works when subtitlePreset is 'none'"). Omitting the 4th argument
 * entirely (every pre-existing call site) is BYTE-IDENTICAL to before task
 * #34 — this is purely additive.
 */
export function buildAssSubtitleFile(
  lines: AssSubtitleLine[],
  preset: CaptionPresetId,
  opts: AssSubtitleBuildOpts,
  overlays: VdTextOverlayAssEvent[] = []
): string {
  const style = VD_CAPTION_PRESET_ASS_STYLES[preset];
  const headerLines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${opts.playResX}`,
    `PlayResY: ${opts.playResY}`,
    "WrapStyle: 0",
    opts.fontsDir
      ? `; Fonts directory (resolved by caller; not embedded): ${opts.fontsDir}`
      : undefined,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ].filter((l): l is string => l !== undefined);
  if (style) headerLines.push(formatAssStyleLine(style));

  const validOverlays = overlays.filter(
    ov => ov.endSec > ov.startSec && ov.text.trim().length > 0
  );
  const overlayKindsPresent = Array.from(new Set(validOverlays.map(ov => ov.kind)));
  for (const kind of overlayKindsPresent) {
    headerLines.push(formatAssStyleLine(VD_TEXT_OVERLAY_ASS_STYLES[kind]));
  }

  const eventsHeader = [
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = style
    ? lines
        .filter(
          line => line.endSec > line.startSec && line.text.trim().length > 0
        )
        .map(line => buildAssDialogueEvent(line, style))
    : [];

  const overlayEvents = [...validOverlays]
    .sort((a, b) => a.startSec - b.startSec || a.kind.localeCompare(b.kind))
    .map(ov => buildOverlayAssEvent(ov, VD_TEXT_OVERLAY_ASS_STYLES[ov.kind]));

  return (
    [...headerLines, ...eventsHeader, ...events, ...overlayEvents].join("\n") + "\n"
  );
}

/* -------------------------------------------------------------------------- */
/* Ad banner overlay chain                                                    */
/* -------------------------------------------------------------------------- */

const VALID_PLACEMENT_IDS = new Set<string>(VD_AD_BANNER_PLACEMENT_IDS);

/**
 * Validate a full set of RESOLVED (render-time) banners: placement id known,
 * time windows well-formed and within the video's duration, no two
 * `fullscreen` banners overlapping, and the overall count within
 * `VD_AD_BANNER_MAX_PER_SERIES` — reused directly rather than re-declaring a
 * separate "max per render" constant, since plan.md pins both caps to the
 * same value (5) by design (§2, §8). The fullscreen-overlap and
 * within-duration checks have no existing equivalent in
 * `adBannerPresets.ts`'s `validateAdBannerDesigns` (that validator only
 * covers SERIES-level design authoring, not resolved render timing), so they
 * are implemented fresh here.
 *
 * Pure — never throws; returns `error`/`warning` issues for the caller to act
 * on. `buildFinalRenderFfmpegArgs` throws when any `error`-severity issue is
 * present; `resolveBannerOverlayChain` assumes its input has already passed
 * this check and does not re-validate.
 */
export function validateResolvedBanners(
  banners: ResolvedBanner[],
  videoDurationSeconds: number
): VdFinalRenderBannerIssue[] {
  const issues: VdFinalRenderBannerIssue[] = [];

  if (banners.length > VD_AD_BANNER_MAX_PER_SERIES) {
    issues.push({
      code: "VD_FINAL_RENDER_BANNER_TOO_MANY",
      severity: "error",
      message: `A rendered video may include at most ${VD_AD_BANNER_MAX_PER_SERIES} ad banners (found ${banners.length}).`,
    });
  }

  banners.forEach((banner, index) => {
    if (!VALID_PLACEMENT_IDS.has(banner.placementId)) {
      issues.push({
        code: "VD_FINAL_RENDER_BANNER_UNKNOWN_PLACEMENT",
        severity: "error",
        message: `Banner at index ${index} has an unknown placementId "${banner.placementId}".`,
        bannerIndex: index,
        placementId: banner.placementId,
      });
      return;
    }
    const windowValid =
      Number.isFinite(banner.startSec) &&
      Number.isFinite(banner.endSec) &&
      banner.startSec >= 0 &&
      banner.endSec > banner.startSec;
    if (!windowValid) {
      issues.push({
        code: "VD_FINAL_RENDER_BANNER_INVALID_WINDOW",
        severity: "error",
        message: `Banner at index ${index} has an invalid time window (startSec=${banner.startSec}, endSec=${banner.endSec}).`,
        bannerIndex: index,
        placementId: banner.placementId,
      });
      return;
    }
    if (banner.endSec > videoDurationSeconds + 1e-6) {
      issues.push({
        code: "VD_FINAL_RENDER_BANNER_OUT_OF_BOUNDS",
        severity: "error",
        message: `Banner at index ${index} ends at ${banner.endSec}s, after the video's ${videoDurationSeconds}s duration.`,
        bannerIndex: index,
        placementId: banner.placementId,
      });
    }
  });

  const fullscreen = banners
    .map((banner, index) => ({ banner, index }))
    .filter(
      ({ banner }) =>
        banner.placementId === "fullscreen" &&
        Number.isFinite(banner.startSec) &&
        Number.isFinite(banner.endSec)
    );
  for (let i = 0; i < fullscreen.length; i += 1) {
    for (let j = i + 1; j < fullscreen.length; j += 1) {
      const a = fullscreen[i]!.banner;
      const b = fullscreen[j]!.banner;
      const overlaps = a.startSec < b.endSec && b.startSec < a.endSec;
      if (overlaps) {
        issues.push({
          code: "VD_FINAL_RENDER_BANNER_FULLSCREEN_OVERLAP",
          severity: "error",
          message: `Fullscreen banners at index ${fullscreen[i]!.index} and ${fullscreen[j]!.index} overlap in time.`,
          bannerIndex: fullscreen[j]!.index,
          placementId: "fullscreen",
        });
      }
    }
  }

  // Soft guardrail (plan.md §8): fullscreen banners totalling >20% of the
  // video's duration are a warning, not a hard block.
  if (videoDurationSeconds > 0 && fullscreen.length > 0) {
    const totalFullscreenSec = fullscreen.reduce(
      (sum, { banner }) => sum + Math.max(0, banner.endSec - banner.startSec),
      0
    );
    if (totalFullscreenSec > videoDurationSeconds * 0.2) {
      issues.push({
        code: "VD_FINAL_RENDER_BANNER_FULLSCREEN_BUDGET",
        severity: "warning",
        message: `Fullscreen banners total ${totalFullscreenSec.toFixed(1)}s, more than 20% of the ${videoDurationSeconds}s video.`,
      });
    }
  }

  return issues;
}

/** Build the `-itsoffset/-loop/-t/-i` input args for EVERY banner, in array
 *  order — called once for the FULL banner list regardless of how the caller
 *  later splits banners into z-order phases, so ffmpeg global input indices
 *  stay stable and independent of phase-grouping. */
export function buildBannerInputArgs(banners: ResolvedBanner[]): string[] {
  const args: string[] = [];
  for (const banner of banners) {
    const durationSec = Math.max(0.05, banner.endSec - banner.startSec);
    args.push(
      "-itsoffset",
      secStr(banner.startSec),
      "-loop",
      "1",
      "-t",
      secStr(durationSec),
      "-i",
      banner.localPngPath
    );
  }
  return args;
}

/** A banner paired with its (caller-assigned) global ffmpeg input index —
 *  see `buildBannerInputArgs`'s doc comment for why indices are assigned
 *  once, up front, over the FULL banner list. */
export interface BannerChainItem {
  banner: ResolvedBanner;
  inputIndex: number;
}

/**
 * Build the overlay filter fragments for an ORDERED list of banners onto
 * `opts.baseLabel`, cover-fit + center-cropped into each banner's placement
 * box, fading alpha in/out, `enable`-gated to its `[startSec,endSec)` window
 * (plan.md §7). Pure chain-building only — does NOT validate (see
 * `validateResolvedBanners`, called once up front by
 * `buildFinalRenderFfmpegArgs` over the FULL banner set before any phase
 * splitting, so per-phase subsets passed here are already known-good).
 *
 * `-itsoffset` (applied to each banner's OWN `-i`, see `buildBannerInputArgs`)
 * shifts that banner's decoded frame timestamps to start at its `startSec`,
 * which is what lets `fade`'s `st=` values below be expressed in ABSOLUTE
 * render-timeline seconds (matching plan.md §7's literal snippet) instead of
 * relative-to-the-banner-clip seconds.
 */
export function resolveBannerOverlayChain(
  items: BannerChainItem[],
  opts: { baseLabel: string; labelPrefix: string }
): { filterFragments: string[]; outputLabel: string } {
  if (items.length === 0) {
    return { filterFragments: [], outputLabel: opts.baseLabel };
  }
  const fragments: string[] = [];
  let prevLabel = opts.baseLabel;
  items.forEach(({ banner, inputIndex }, index) => {
    const placement = getAdBannerPlacementPreset(banner.placementId);
    const box = resolvePlacementBox(placement, banner.sideAlign);
    // Safety clamp: a fade longer than half the window would make in/out
    // overlap — never requested by any placement preset today (all 0.3s),
    // but defensive against a bad phase-B override.
    const fadeSec = Math.max(
      0,
      Math.min(banner.fadeSec, (banner.endSec - banner.startSec) / 2)
    );
    const imgLabel = `${opts.labelPrefix}img${index}`;
    const vLabel = `${opts.labelPrefix}${index}`;
    fragments.push(
      `[${inputIndex}:v]scale=${box.w}:${box.h}:force_original_aspect_ratio=increase,crop=${box.w}:${box.h},format=rgba,` +
        `fade=t=in:st=${secStr(banner.startSec)}:d=${secStr(fadeSec)}:alpha=1,` +
        `fade=t=out:st=${secStr(banner.endSec - fadeSec)}:d=${secStr(fadeSec)}:alpha=1[${imgLabel}]`
    );
    // Commas inside the `enable=` expression must be backslash-escaped —
    // they would otherwise be parsed as filter-chain separators by ffmpeg's
    // own `-filter_complex` grammar.
    fragments.push(
      `[${prevLabel}][${imgLabel}]overlay=${box.x}:${box.y}:enable='between(t\\,${secStr(banner.startSec)}\\,${secStr(banner.endSec)})'[${vLabel}]`
    );
    prevLabel = vLabel;
  });
  return { filterFragments: fragments, outputLabel: prevLabel };
}

/* -------------------------------------------------------------------------- */
/* Watermark image overlay (task #34) — separate input/chain from banners    */
/* -------------------------------------------------------------------------- */

/** Build the `-loop/-t/-i` input args for the watermark image — looped for
 *  the FULL (real, post-probe) `videoDurationSeconds`, mirroring how a
 *  `fullscreen` banner's input args would look if it covered the entire
 *  clip. Called once, with the SAME `videoDurationSeconds` already used for
 *  the rest of this render (never a second probe). */
export function buildWatermarkInputArgs(
  watermark: ResolvedWatermarkImage,
  videoDurationSeconds: number
): string[] {
  return [
    "-loop",
    "1",
    "-t",
    secStr(videoDurationSeconds),
    "-i",
    watermark.localPngPath,
  ];
}

/** `x`/`y` overlay-filter EXPRESSIONS (not concrete numbers) anchored off
 *  ffmpeg's own `main_w`/`main_h`/`overlay_w`/`overlay_h` — deliberately
 *  expression-based rather than pre-computed pixels, since the watermark
 *  PNG's post-`scale` height is only known to ffmpeg itself at filter-graph
 *  EVALUATION time (the source image's aspect ratio isn't probed by this
 *  pure builder). */
function watermarkOverlayPositionExpr(
  position: ResolvedWatermarkImage["position"],
  marginPx: number
): { xExpr: string; yExpr: string } {
  const isLeft = position === "top_left" || position === "bottom_left";
  const isTop = position === "top_left" || position === "top_right";
  return {
    xExpr: isLeft ? `${marginPx}` : `main_w-overlay_w-${marginPx}`,
    yExpr: isTop ? `${marginPx}` : `main_h-overlay_h-${marginPx}`,
  };
}

/**
 * Build the watermark's OWN overlay filter fragment: scale to `scalePct`% of
 * the 1080px-wide compositing frame (aspect-preserving, `-2` so the scaled
 * height always stays even — required for `yuv420p`), apply `opacity` via
 * `colorchannelmixer=aa=`, then overlay onto `opts.baseLabel` at the
 * corner + margin resolved by `watermarkOverlayPositionExpr`. Pure —
 * mirrors `resolveBannerOverlayChain`'s own fragment-building shape, kept as
 * a SEPARATE function (not folded into that one) because a watermark has no
 * time window/fade/crop (spans the whole clip, `format=rgba` only needs a
 * flat alpha multiply, not the banner chain's cover-crop-then-fade sequence).
 */
export function resolveWatermarkOverlayFragment(
  watermark: ResolvedWatermarkImage,
  inputIndex: number,
  opts: { baseLabel: string }
): { filterFragments: string[]; outputLabel: string } {
  const targetWidthPx = Math.max(
    2,
    Math.round(VD_AD_BANNER_FRAME_WIDTH * (watermark.scalePct / 100))
  );
  const evenWidthPx = targetWidthPx % 2 === 0 ? targetWidthPx : targetWidthPx + 1;
  const alpha = Math.min(1, Math.max(0, watermark.opacity));
  const { xExpr, yExpr } = watermarkOverlayPositionExpr(
    watermark.position,
    watermark.marginPx
  );
  const imgLabel = "wmimg";
  const outLabel = "wm";
  const fragments = [
    `[${inputIndex}:v]scale=${evenWidthPx}:-2,format=rgba,colorchannelmixer=aa=${alpha}[${imgLabel}]`,
    `[${opts.baseLabel}][${imgLabel}]overlay=${xExpr}:${yExpr}[${outLabel}]`,
  ];
  return { filterFragments: fragments, outputLabel: outLabel };
}

/* -------------------------------------------------------------------------- */
/* Audio mixdown                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Build the audio-side filter fragments (`adelay`/`volume` per segment ->
 * `amix` -> optional `loudnorm`) plus the final `-map` value for the mixed
 * audio. Returns `null` `mapLabel` semantics via the raw `"0:a?"` passthrough
 * string when there is nothing to mix (zero segments AND no loudnessNormalize)
 * — the caller should skip adding these fragments to `-filter_complex`
 * entirely in that case (see `buildFinalRenderFfmpegArgs`).
 *
 * `dropout_transition=0` on `amix` is deliberate, not just a stylistic
 * default: `amix`'s default 2-second dropout transition ramps the volume of
 * the REMAINING inputs up whenever one input ends before the others, which is
 * an unintended auto-ducking-like artifact — exactly the kind of implicit
 * ducking behavior this phase explicitly excludes (see `duckClipAudioDb`'s
 * doc comment). Setting it to 0 keeps the mix flat regardless of how the
 * dialogue segments' durations compare to the base clip audio.
 *
 * `duration=longest` (not ffmpeg's `amix` default `duration=longest` is
 * actually already the default, kept explicit here for clarity) avoids
 * truncating the output if a dialogue segment were to slightly outlast the
 * clip audio.
 */
function buildAudioFilterGraph(
  dialogueAudio: DialogueAudioInput | undefined,
  dialogueInputIndexStart: number
): { fragments: string[]; mapLabel: string } {
  const segments = dialogueAudio?.segments ?? [];
  const wantsMix =
    segments.length > 0 || dialogueAudio?.loudnessNormalize === true;
  if (!wantsMix) {
    return { fragments: [], mapLabel: "0:a?" };
  }

  const fragments: string[] = [];
  let mixLabel = "0:a";

  if (segments.length > 0) {
    const perSegmentLabels: string[] = [];
    segments.forEach((segment, index) => {
      const inputIndex = dialogueInputIndexStart + index;
      const label = `da${index}`;
      const delayMs = Math.max(0, Math.round(segment.startSec * 1000));
      const gainSuffix =
        segment.gainDb != null &&
        Number.isFinite(segment.gainDb) &&
        segment.gainDb !== 0
          ? `,volume=${formatDb(segment.gainDb)}dB`
          : "";
      fragments.push(
        `[${inputIndex}:a]adelay=${delayMs}:all=1${gainSuffix}[${label}]`
      );
      perSegmentLabels.push(label);
    });
    const allLabels = ["0:a", ...perSegmentLabels];
    const mixedLabel = dialogueAudio?.loudnessNormalize ? "amixed" : "afinal";
    fragments.push(
      `${allLabels.map(l => `[${l}]`).join("")}amix=inputs=${allLabels.length}:duration=longest:dropout_transition=0[${mixedLabel}]`
    );
    mixLabel = mixedLabel;
  }

  if (dialogueAudio?.loudnessNormalize) {
    fragments.push(`[${mixLabel}]loudnorm=I=-16:TP=-1.5:LRA=11[afinal]`);
    mixLabel = "afinal";
  }

  return { fragments, mapLabel: `[${mixLabel}]` };
}

/* -------------------------------------------------------------------------- */
/* Top-level composer                                                         */
/* -------------------------------------------------------------------------- */

function buildSubtitlesFilterOption(subtitles: SubtitlesInput): string {
  const parts = [`filename=${escapeFfmpegFilterPath(subtitles.assPath)}`];
  if (subtitles.fontsDir) {
    parts.push(`fontsdir=${escapeFfmpegFilterPath(subtitles.fontsDir)}`);
  }
  return parts.join(":");
}

/**
 * Build the full ffmpeg argv for the final render. Concat-only input (no
 * banners/dialogueAudio/subtitles) returns EXACTLY `buildConcatFfmpegArgs`'s
 * argv shape (see module doc comment's "Regression lock").
 *
 * Z-order (task #21 spec, matches plan.md §7): video -> bottom_band/side_vertical
 * banners -> subtitles -> fullscreen banners. Implemented by splitting
 * `banners` into two groups and interleaving the subtitle burn-in step
 * between them, so a fullscreen interstitial always fully covers any
 * subtitles/lower-thirds during its own window.
 */
export function buildFinalRenderFfmpegArgs(
  input: BuildFinalRenderFfmpegArgsInput
): string[] {
  const fps = input.fps ?? 30;
  const banners = input.banners ?? [];
  const dialogueSegments = input.dialogueAudio?.segments ?? [];
  const wantsAudioMix =
    dialogueSegments.length > 0 ||
    input.dialogueAudio?.loudnessNormalize === true;
  const wantsSubtitles = Boolean(input.subtitles);
  const wantsWatermarkImage = Boolean(input.watermarkImage);
  const wantsComplexGraph =
    banners.length > 0 || wantsAudioMix || wantsSubtitles || wantsWatermarkImage;

  if (!wantsComplexGraph) {
    return [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      input.concatListPath,
      "-r",
      String(fps),
      "-vf",
      LEGACY_SCALE_PAD_VF,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      input.output,
    ];
  }

  const bannerIssues = validateResolvedBanners(
    banners,
    input.videoDurationSeconds
  );
  const bannerErrors = bannerIssues.filter(issue => issue.severity === "error");
  if (bannerErrors.length > 0) {
    throw new Error(
      `vertical_drama_final_render_invalid_banners: ${bannerErrors.map(issue => issue.message).join("; ")}`
    );
  }

  const nonFullscreenBanners = banners.filter(
    b => b.placementId !== "fullscreen"
  );
  const fullscreenBanners = banners.filter(b => b.placementId === "fullscreen");

  // Global input order: 0 = concat list, 1..B = banners (ORIGINAL array
  // order, independent of the z-order phase split above), (B+1).. = dialogue
  // audio segments.
  const bannerInputIndex = new Map<ResolvedBanner, number>();
  banners.forEach((banner, index) => bannerInputIndex.set(banner, index + 1));
  const dialogueInputIndexStart = banners.length + 1;
  // Task #34 — appended LAST (after every banner + dialogue-audio input),
  // so pre-existing banner/dialogue-audio input indices are UNCHANGED
  // whenever no watermark is present (backward-compatible global input
  // ordering, same care `RunAssemblyJobBannerInput`'s own indexing takes).
  const watermarkInputIndex = dialogueInputIndexStart + dialogueSegments.length;

  const args: string[] = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    input.concatListPath,
  ];
  args.push(...buildBannerInputArgs(banners));
  for (const segment of dialogueSegments) {
    args.push("-i", segment.localPath);
  }
  if (input.watermarkImage) {
    args.push(
      ...buildWatermarkInputArgs(input.watermarkImage, input.videoDurationSeconds)
    );
  }

  const filterParts: string[] = [`[0:v]${LEGACY_SCALE_PAD_VF}[vbase]`];
  let currentVideoLabel = "vbase";

  if (nonFullscreenBanners.length > 0) {
    const items: BannerChainItem[] = nonFullscreenBanners.map(banner => ({
      banner,
      inputIndex: bannerInputIndex.get(banner)!,
    }));
    const chain = resolveBannerOverlayChain(items, {
      baseLabel: currentVideoLabel,
      labelPrefix: "nb",
    });
    filterParts.push(...chain.filterFragments);
    currentVideoLabel = chain.outputLabel;
  }

  if (wantsSubtitles && input.subtitles) {
    filterParts.push(
      `[${currentVideoLabel}]subtitles=${buildSubtitlesFilterOption(input.subtitles)}[vsub]`
    );
    currentVideoLabel = "vsub";
  }

  if (fullscreenBanners.length > 0) {
    const items: BannerChainItem[] = fullscreenBanners.map(banner => ({
      banner,
      inputIndex: bannerInputIndex.get(banner)!,
    }));
    const chain = resolveBannerOverlayChain(items, {
      baseLabel: currentVideoLabel,
      labelPrefix: "fb",
    });
    filterParts.push(...chain.filterFragments);
    currentVideoLabel = chain.outputLabel;
  }

  // Task #34 — the IMAGE watermark is composited LAST among the video
  // stages (after fullscreen banners), so it is the ABSOLUTE TOP-MOST layer
  // (plan.md "z-order บนสุดเหนือทุกชั้นรวม fullscreen banner"). Documented
  // scope limit: the ASS-rendered `watermark_text` variant (see
  // `VdTextOverlayAssEvent`) shares the SAME z-order slot as dialogue
  // captions/`episode_indicator` (burned in during the `subtitles` stage
  // above, BEFORE fullscreen banners) — reordering the subtitle burn-in
  // stage itself would change the ALREADY-REGRESSION-LOCKED z-order for
  // dialogue captions (this module's own header doc comment: "video ->
  // bottom_band/side_vertical banners -> subtitles -> fullscreen banners"),
  // which is out of scope for this feature. Only the IMAGE watermark gets
  // the "always survives fullscreen" guarantee.
  if (input.watermarkImage) {
    const watermark = resolveWatermarkOverlayFragment(
      input.watermarkImage,
      watermarkInputIndex,
      { baseLabel: currentVideoLabel }
    );
    filterParts.push(...watermark.filterFragments);
    currentVideoLabel = watermark.outputLabel;
  }

  const audio = buildAudioFilterGraph(
    input.dialogueAudio,
    dialogueInputIndexStart
  );
  filterParts.push(...audio.fragments);

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", `[${currentVideoLabel}]`);
  args.push("-map", audio.mapLabel);
  args.push("-r", String(fps));
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium");
  args.push("-c:a", "aac", "-b:a", "128k");
  args.push("-movflags", "+faststart");
  args.push(input.output);
  return args;
}
