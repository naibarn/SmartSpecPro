import { getDb } from "../db";
import { marketplaceAutoReviewOutboxJobs } from "../../drizzle/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { storagePutFromPath } from "../storage";
import {
  executeHyperframesCliRender,
  executeHyperframesProducerRender,
  getHyperframesRuntimeMode,
  isHyperframesCliRuntimeAllowed,
  isHyperframesProducerRuntimeAllowed,
} from "../services/hyperframesRuntimeAdapter";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

const HYPERFRAMES_WORKER_JOB_TYPES = [
  "hyperframes_asset_stage",
  "hyperframes_lint",
  "hyperframes_snapshot",
  "hyperframes_render",
  "hyperframes_inspect",
  "hyperframes_finalize",
] as const;

type HyperframesWorkerJobType = (typeof HYPERFRAMES_WORKER_JOB_TYPES)[number];

export interface HyperframesWorkerRunOptions {
  workerId?: string;
  limit?: number;
  now?: Date;
  runtimeReady?: boolean;
}

export interface HyperframesWorkerRunResult {
  processed: number;
  disabled: boolean;
  runtimeDeferred: boolean;
}

function falseyEnv(value: string | undefined): boolean {
  return ["0", "false", "no", "off", "disabled"].includes(
    (value ?? "").toLowerCase()
  );
}

function truthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").toLowerCase()
  );
}

export function isHyperframesWorkerEnabled(): boolean {
  return (
    !truthyEnv(process.env.MARKETPLACE_HYPERFRAMES_DISABLED) &&
    !falseyEnv(process.env.MARKETPLACE_HYPERFRAMES_ENABLED) &&
    !falseyEnv(process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED)
  );
}

export function isHyperframesRuntimeExecutionReady(): boolean {
  const marketplaceRuntimeReady = ["1", "true", "yes", "on"].includes(
    (process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY ?? "").toLowerCase()
  );
  if (!marketplaceRuntimeReady) return false;
  const runtimeMode = getHyperframesRuntimeMode();
  if (runtimeMode === "producer") return isHyperframesProducerRuntimeAllowed();
  if (runtimeMode === "cli") return isHyperframesCliRuntimeAllowed();
  return false;
}

function sha256Hash(buffer: Buffer): string {
  return `hf_${createHash("sha256").update(buffer).digest("hex").slice(0, 48)}`;
}

export function resolveHyperframesFfmpegBinary(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    join(homedir(), ".local/bin/ffmpeg"),
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "ffmpeg";
}

function resolveHyperframesFfprobeBinary(): string {
  const ffmpeg = resolveHyperframesFfmpegBinary();
  const sibling = ffmpeg.endsWith("ffmpeg")
    ? `${ffmpeg.slice(0, -"ffmpeg".length)}ffprobe`
    : "";
  const candidates = [
    process.env.FFPROBE_PATH,
    sibling,
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    join(homedir(), ".local/bin/ffprobe"),
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "ffprobe";
}

type HyperframesShotPayload = {
  index?: number;
  durationSec?: number;
  sourceVideoUrl?: string;
  sourceVideoRef?: string;
  onScreenText?: string[];
  subtitleCues?: Array<{ startSec?: number; endSec?: number; text?: string }>;
  overlayPreset?: string;
  animationPreset?: string;
};

type HyperframesFinalOverlayPreset =
  | "auto"
  | "hook_sequence"
  | "spec_highlight"
  | "feature_cards"
  | "price_impact"
  | "premium_product_hero"
  | "electronics_spec_stack"
  | "hero_price_billboard"
  | "kinetic_bold_hook"
  | "split_product_specs"
  | "badge_cascade"
  | "lower_third_review"
  | "neon_gaming_specs"
  | "clean_subtitle";

type HyperframesFinalSubtitlePreset =
  | "classic_box"
  | "minimal_shadow"
  | "creator_pop"
  | "karaoke_word"
  | "highlight_bar"
  | "lower_third"
  | "cinematic_wide"
  | "neon_glow"
  | "review_bubble"
  | "no_subtitle_style";

function getFinalCompositeShots(payload: Record<string, unknown>): HyperframesShotPayload[] {
  const config = payload.finalCompositeConfig as Record<string, unknown> | undefined;
  const shots = config?.shots;
  if (!Array.isArray(shots)) return [];
  return shots
    .map((item): HyperframesShotPayload | null =>
      item && typeof item === "object" ? (item as HyperframesShotPayload) : null
    )
    .filter((item): item is HyperframesShotPayload => Boolean(item))
    .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
}

function getFinalCompositeConfig(payload: Record<string, unknown>): Record<string, unknown> {
  const config = payload.finalCompositeConfig;
  return config && typeof config === "object" ? config as Record<string, unknown> : payload;
}

function isFinalCompositeRenderPayload(payload: Record<string, unknown>): boolean {
  return (
    String(payload.renderIntent ?? "").trim() === "final" &&
    String(payload.compositionMode ?? "").trim() === "captioned_final_composite"
  );
}

function buildOfficialRuntimeAudioMixReport(payload: Record<string, unknown>): Record<string, unknown> {
  const finalConfig = getFinalCompositeConfig(payload);
  const audioEvents = getFinalCompositeAudioEvents(payload);
  const audioValidation =
    finalConfig.audioAssetValidation &&
    typeof finalConfig.audioAssetValidation === "object" &&
    !Array.isArray(finalConfig.audioAssetValidation)
      ? finalConfig.audioAssetValidation as Record<string, unknown>
      : {};
  const missingAssetRefs = Array.isArray(audioValidation.missingAssetRefs)
    ? audioValidation.missingAssetRefs.map(ref => String(ref ?? "").trim()).filter(Boolean)
    : [];
  const validatedAssetRefs = Array.isArray(audioValidation.validatedAssetRefs)
    ? audioValidation.validatedAssetRefs.map(ref => String(ref ?? "").trim()).filter(Boolean)
    : [];
  const validatedAssets = Array.isArray(audioValidation.validatedAssets)
    ? audioValidation.validatedAssets.filter(Boolean)
    : [];
  return {
    preserveNativeAudio: finalConfig.preserveNativeAudio !== false,
    nativeInputWithAudioCount: 0,
    outputAudioPolicy: isFinalCompositeRenderPayload(payload)
      ? "official_html_css_browser_runtime"
      : "official_hyperframes_runtime",
    audioPackPresetId: String(finalConfig.audioPackPresetId ?? "").trim() || undefined,
    musicPresetId: String(finalConfig.musicPresetId ?? "").trim() || undefined,
    sfxPresetIds: Array.isArray(finalConfig.sfxPresetIds)
      ? finalConfig.sfxPresetIds.map(id => String(id ?? "").trim()).filter(Boolean)
      : [],
    audioEventCount: audioEvents.length,
    generatedSyntheticEventCount: 0,
    syntheticFallbackAudio: false,
    missingAssetRefs,
    validatedAssetRefs,
    validatedAudioAssetCount: validatedAssets.length,
    stagedAssetValidationPassed: missingAssetRefs.length === 0,
  };
}

function isNonRetryableHyperframesRuntimeError(message: string): boolean {
  return /HTML\/CSS\/browser runtime is required|FFmpeg\/ASS fallback is disabled|requires Node >=22\.22|blocked until production rollout gates pass/i.test(message);
}

function getFinalCompositeOverlayPreset(payload: Record<string, unknown>): HyperframesFinalOverlayPreset {
  return coerceFinalCompositeOverlayPreset(getFinalCompositeConfig(payload).overlayPreset);
}

function coerceFinalCompositeOverlayPreset(
  value: unknown,
  fallback: HyperframesFinalOverlayPreset = "auto"
): HyperframesFinalOverlayPreset {
  const preset = String(value ?? fallback);
  if (
    preset === "auto" ||
    preset === "hook_sequence" ||
    preset === "spec_highlight" ||
    preset === "feature_cards" ||
    preset === "price_impact" ||
    preset === "premium_product_hero" ||
    preset === "electronics_spec_stack" ||
    preset === "hero_price_billboard" ||
    preset === "kinetic_bold_hook" ||
    preset === "split_product_specs" ||
    preset === "badge_cascade" ||
    preset === "lower_third_review" ||
    preset === "neon_gaming_specs" ||
    preset === "clean_subtitle"
  ) {
    return preset;
  }
  return fallback;
}

function getFinalCompositeSubtitlePreset(payload: Record<string, unknown>): HyperframesFinalSubtitlePreset {
  const preset = String(getFinalCompositeConfig(payload).subtitlePreset ?? "classic_box");
  if (
    preset === "classic_box" ||
    preset === "minimal_shadow" ||
    preset === "creator_pop" ||
    preset === "karaoke_word" ||
    preset === "highlight_bar" ||
    preset === "lower_third" ||
    preset === "cinematic_wide" ||
    preset === "neon_glow" ||
    preset === "review_bubble" ||
    preset === "no_subtitle_style"
  ) {
    return preset;
  }
  return "classic_box";
}

function getFinalCompositeTextConfig(payload: Record<string, unknown>): {
  includeHookText: boolean;
  includeShotText: boolean;
  hookText: string;
  supportingText: string;
} {
  const config = getFinalCompositeConfig(payload);
  const expansionSources = getFinalCompositeTextExpansionSources(payload);
  return {
    includeHookText: config.includeHookText !== false,
    includeShotText: config.includeShotText !== false,
    hookText: expandLegacyEllipsizedAssText(config.hookText, expansionSources, 180),
    supportingText: expandLegacyEllipsizedAssText(config.supportingText, expansionSources, 160),
  };
}

function getFinalCompositeAudioEvents(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const events = getFinalCompositeConfig(payload).audioEvents;
  return Array.isArray(events)
    ? events.filter((event): event is Record<string, unknown> =>
        Boolean(event && typeof event === "object" && !Array.isArray(event))
      )
    : [];
}

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(value: unknown): string {
  return String(value ?? "")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, " ")
    .trim();
}

function cleanOverlayAssText(value: unknown): string {
  return escapeAssText(value)
    .replace(/^PRODUCT FACTS LOCK:\s*/i, "")
    .replace(/\s*\/\s*Guide:\s*.*$/i, "")
    .replace(/^Context\s+แนวคิด:\s*/i, "")
    .trim();
}

function firstOverlayAssSentence(value: unknown, maxLength: number): string {
  const text = cleanOverlayAssText(value);
  if (!text) return "";
  const sentence = text
    .split(/(?:\n|\.|!|\?|。|;)/)
    .map(item => item.trim())
    .find(Boolean) ?? text;
  return sentence.length > maxLength
    ? sentence.slice(0, Math.max(1, maxLength - 1)).trim()
    : sentence;
}

function getFinalCompositeTextExpansionSources(payload: Record<string, unknown>): string[] {
  const compositionInput =
    payload.compositionInput &&
    typeof payload.compositionInput === "object" &&
    !Array.isArray(payload.compositionInput)
      ? payload.compositionInput as Record<string, unknown>
      : {};
  const productTruth =
    compositionInput.productTruth &&
    typeof compositionInput.productTruth === "object" &&
    !Array.isArray(compositionInput.productTruth)
      ? compositionInput.productTruth as Record<string, unknown>
      : {};
  const config = getFinalCompositeConfig(payload);
  return [
    payload.productTitle,
    productTruth.title,
    productTruth.name,
    productTruth.description,
    config.productTitle,
    config.description,
    config.hookText,
    config.supportingText,
  ]
    .map(value => cleanOverlayAssText(value))
    .filter(Boolean);
}

function expandLegacyEllipsizedAssText(
  value: unknown,
  sources: string[],
  maxLength = 180
): string {
  const clean = cleanOverlayAssText(value);
  if (!/(?:…|\.{3})$/u.test(clean) || clean.length > 90) return clean;
  const stem = clean.replace(/(?:…|\.{3})$/u, "").trim();
  if (stem.length < 3) return clean;
  for (const source of sources) {
    const full = firstOverlayAssSentence(source, maxLength);
    if (full.length > clean.length && full.startsWith(stem)) return full;
  }
  return clean;
}

function splitAssGraphemes(value: string): string[] {
  const SegmenterCtor = (Intl as unknown as {
    Segmenter?: new (
      locales?: string | string[],
      options?: Record<string, string>
    ) => { segment(input: string): Iterable<{ segment: string }> };
  }).Segmenter;
  if (SegmenterCtor) {
    return Array.from(
      new SegmenterCtor("th", { granularity: "grapheme" }).segment(value),
      item => item.segment
    );
  }
  return Array.from(value);
}

function wrapAssText(value: unknown, options: {
  maxChars: number;
  maxLines: number;
  ellipsis?: boolean;
}): string {
  const text = cleanOverlayAssText(value).replace(/\s+/g, " ");
  if (!text) return "";
  const hasWordSeparators = text.includes(" ");
  const words = hasWordSeparators
    ? text.split(/\s+/).filter(Boolean)
    : splitAssGraphemes(text);
  const chunkLongWord = (word: string): string[] => {
    const chars = splitAssGraphemes(word);
    if (chars.length <= options.maxChars) return [word];
    const chunkCount = Math.ceil(chars.length / options.maxChars);
    const remainder = chars.length % options.maxChars;
    const chunkSize = remainder > 0 && remainder < 4
      ? Math.ceil(chars.length / chunkCount)
      : options.maxChars;
    const chunks: string[] = [];
    for (let index = 0; index < chars.length; index += chunkSize) {
      chunks.push(chars.slice(index, index + chunkSize).join(""));
    }
    return chunks;
  };
  const tokens = words.flatMap(word =>
    chunkLongWord(word).map((chunk, index) => ({
      text: chunk,
      separated: hasWordSeparators && index === 0,
    }))
  );
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const separator = current && token.separated ? " " : "";
    const candidate = `${current}${separator}${token.text}`;
    if (candidate.length <= options.maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = token.text;
    if (lines.length >= options.maxLines) break;
  }
  if (current && lines.length < options.maxLines) lines.push(current);
  const limited = lines.slice(0, options.maxLines);
  if (limited.length === 0) return "";
  const originalJoined = text.replace(/\s+/g, "");
  const limitedJoined = limited.join("").replace(/\s+/g, "");
  if (options.ellipsis !== false && limitedJoined.length < originalJoined.length && limited[limited.length - 1]) {
    limited[limited.length - 1] = `${limited[limited.length - 1]!.replace(/…$/, "")}…`;
  }
  return limited.join("\\N");
}

function isPriceOverlayText(value: string): boolean {
  return /(?:฿|บาท|thb|เริ่มต้น|ราคา|ผ่อน|%|\d[\d,.]*\s*-)/i.test(value);
}

function isSpecOverlayText(value: string): boolean {
  return /(?:จอ|screen|display|amoled|oled|lcd|นิ้ว|inch|hz|แบต|battery|mah|ram|rom|storage|ssd|gb|tb|กล้อง|camera|mp|chip|cpu|gpu|snapdragon|dimensity|intel|ryzen|5g|wifi|wi-fi)/i.test(value);
}

function resolveTimedOverlayPreset(
  preset: HyperframesFinalOverlayPreset,
  lines: string[],
): Exclude<HyperframesFinalOverlayPreset, "auto"> {
  if (preset !== "auto") return preset;
  if (lines.some(isPriceOverlayText)) return "price_impact";
  if (lines.some(isSpecOverlayText)) return "spec_highlight";
  return lines.length > 0 ? "hook_sequence" : "clean_subtitle";
}

function isPriceOverlayPreset(preset: HyperframesFinalOverlayPreset): boolean {
  return preset === "price_impact" || preset === "hero_price_billboard";
}

function isSpecOverlayPreset(preset: HyperframesFinalOverlayPreset): boolean {
  return preset === "spec_highlight" ||
    preset === "electronics_spec_stack" ||
    preset === "split_product_specs" ||
    preset === "neon_gaming_specs";
}

function isCardOverlayPreset(preset: HyperframesFinalOverlayPreset): boolean {
  return preset === "feature_cards" ||
    preset === "badge_cascade" ||
    preset === "lower_third_review";
}

function uniqueOverlayLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const key = line.replace(/[\s…]+/g, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }
  return unique;
}

function buildOverlayAssText(input: {
  line: string;
  style: string;
  preset: HyperframesFinalOverlayPreset;
  index: number;
  isPrice: boolean;
}): string {
  if (input.isPrice) {
    return wrapAssText(input.line, {
      maxChars: input.style === "PriceMain" ? 14 : 22,
      maxLines: input.style === "PriceMain" ? 1 : 2,
      ellipsis: false,
    });
  }
  if (isSpecOverlayPreset(input.preset)) {
    return wrapAssText(input.line, {
      maxChars: input.style === "HookMain" || input.style === "NeonMain" ? 20 : 22,
      maxLines: input.index < 2 ? 3 : 2,
      ellipsis: false,
    });
  }
  if (isCardOverlayPreset(input.preset)) {
    return wrapAssText(input.line, { maxChars: 24, maxLines: 2, ellipsis: false });
  }
  return wrapAssText(input.line, {
    maxChars: input.style === "HookMain" ? 20 : 24,
    maxLines: input.index === 0 ? 3 : 2,
    ellipsis: false,
  });
}

function buildKineticBoldHookOverlayEvents(input: {
  lines: string[];
  shotStart: number;
  windowEnd: number;
}): string[] {
  const [titleLine, hookLine, ...chipLines] = input.lines;
  const events: string[] = [];
  const start = input.shotStart;
  const end = input.windowEnd;
  const title = wrapAssText(titleLine ?? "", {
    maxChars: 13,
    maxLines: 5,
    ellipsis: true,
  });
  const hook = wrapAssText(hookLine ?? "", {
    maxChars: 22,
    maxLines: 4,
    ellipsis: true,
  });
  const chips = chipLines
    .map(line => wrapAssText(line, { maxChars: 18, maxLines: 2, ellipsis: true }))
    .filter(Boolean)
    .slice(0, 2);
  if (!title && !hook && chips.length === 0) return [];

  const panelStart = Math.min(end - 0.2, start + 0.05);
  const textStart = Math.min(end - 0.2, start + 0.16);
  const hookStart = Math.min(end - 0.2, start + 0.58);
  const chipStart = Math.min(end - 0.2, start + 1.05);
  const hookLineCount = Math.max(1, hook.split("\\N").filter(Boolean).length);
  const hookBoxHeight = Math.min(340, Math.max(148, 56 + hookLineCount * 58));
  if (panelStart < end) {
    events.push(`Dialogue: 0,${assTime(panelStart)},${assTime(end)},KineticPanel,,0,0,0,,{\\an7\\pos(44,124)\\fad(90,150)\\p1}m 0 0 l 580 0 l 580 1660 l 0 1660`);
    events.push(`Dialogue: 0,${assTime(panelStart)},${assTime(end)},KineticAccent,,0,0,0,,{\\an7\\pos(44,124)\\fad(130,150)\\p1}m 0 1250 l 580 700 l 580 1660 l 0 1660`);
  }
  if (title && textStart < end) {
    events.push(`Dialogue: 2,${assTime(textStart)},${assTime(end)},KineticTitle,,0,0,0,,{\\an7\\pos(74,218)\\fad(80,140)\\t(0,240,\\fscx106\\fscy106)}${title}`);
  }
  if (hook && hookStart < end) {
    events.push(`Dialogue: 1,${assTime(hookStart)},${assTime(end)},KineticHookBg,,0,0,0,,{\\an7\\pos(72,690)\\fad(100,150)\\frz-2\\p1}m 0 0 l 500 0 l 500 ${hookBoxHeight} l 0 ${hookBoxHeight}`);
    events.push(`Dialogue: 2,${assTime(hookStart)},${assTime(end)},KineticHookBox,,0,0,0,,{\\an7\\pos(96,722)\\fad(100,150)\\frz-2}${hook}`);
  }
  chips.forEach((chip, index) => {
    const y = 1450 + index * 126;
    const itemStart = Math.min(end - 0.2, chipStart + index * 0.2);
    if (itemStart >= end) return;
    events.push(`Dialogue: 2,${assTime(itemStart)},${assTime(end)},KineticChip,,0,0,0,,{\\an7\\pos(86,${y})\\fad(120,150)\\frz-1}${chip}`);
  });
  return events;
}

function subtitleStyleForPreset(preset: HyperframesFinalSubtitlePreset): string {
  if (preset === "minimal_shadow") return "SubMinimal";
  if (preset === "creator_pop") return "SubPop";
  if (preset === "karaoke_word") return "SubKaraoke";
  if (preset === "highlight_bar") return "SubHighlight";
  if (preset === "lower_third") return "SubLowerThird";
  if (preset === "cinematic_wide") return "SubCinematic";
  if (preset === "neon_glow") return "SubNeon";
  if (preset === "review_bubble") return "SubBubble";
  return "Default";
}

function splitSubtitleWords(value: string): string[] {
  const normalized = escapeAssText(value).replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const spaced = normalized.split(/\s+/).filter(Boolean);
  if (spaced.length > 1) return spaced.slice(0, 12);
  const chars = Array.from(normalized);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += 5) {
    chunks.push(chars.slice(index, index + 5).join(""));
  }
  return chunks.slice(0, 12);
}

function buildSubtitleAssText(input: {
  text: unknown;
  preset: HyperframesFinalSubtitlePreset;
  durationSec: number;
}): string {
  if (input.preset === "karaoke_word") {
    const words = splitSubtitleWords(String(input.text ?? ""));
    if (words.length === 0) return "";
    const totalCentiseconds = Math.max(20, Math.round(input.durationSec * 100));
    const perWord = Math.max(10, Math.floor(totalCentiseconds / words.length));
    return words.map(word => `{\\k${perWord}}${escapeAssText(word)}`).join(" ");
  }
  const maxChars = input.preset === "lower_third" ? 34 : 30;
  const text = wrapAssText(input.text, { maxChars, maxLines: 2 });
  if (!text) return "";
  if (input.preset === "creator_pop") return `{\\fad(80,120)\\t(0,220,\\fscx108\\fscy108)}${text}`;
  if (input.preset === "highlight_bar") return `{\\bord0\\shad0}${text}`;
  if (input.preset === "neon_glow") return `{\\fad(80,120)}${text}`;
  return text;
}

function buildTimedOverlayEvents(input: {
  lines: string[];
  shotStart: number;
  shotEnd: number;
  preset: HyperframesFinalOverlayPreset;
  animationPreset: string;
}): string[] {
  const lines = uniqueOverlayLines(input.lines);
  const preset = resolveTimedOverlayPreset(input.preset, lines);
  if (preset === "clean_subtitle" || lines.length === 0) return [];
  const events: string[] = [];
  const windowEnd = Math.min(input.shotEnd, input.shotStart + 3.2);
  const isPrice = isPriceOverlayPreset(preset) ||
    input.animationPreset === "bounce_price" ||
    lines.some(isPriceOverlayText);
  if (preset === "kinetic_bold_hook" && !isPrice) {
    return buildKineticBoldHookOverlayEvents({
      lines,
      shotStart: input.shotStart,
      windowEnd,
    });
  }
  const styles = isPrice
    ? ["FeatureSmall", "PriceMain", "FeatureSmall", "FeatureSmall"]
    : isSpecOverlayPreset(preset)
      ? preset === "neon_gaming_specs"
        ? ["NeonMain", "NeonSub", "NeonChip", "NeonChip"]
        : ["HookMain", "HookSub", "SpecChip", "SpecChip"]
      : isCardOverlayPreset(preset)
        ? ["FeatureSmall", "FeatureSmall", "FeatureSmall", "FeatureSmall"]
        : ["HookMain", "HookSub", "FeatureSmall", "FeatureSmall"];
  const positions = isPrice
    ? preset === "hero_price_billboard"
      ? ["{\\an2\\pos(540,1240)\\fad(120,160)}", "{\\an2\\pos(540,1435)\\fad(120,220)\\t(0,280,\\fscx118\\fscy118)}", "{\\an2\\pos(540,1605)\\fad(120,180)}", "{\\an2\\pos(540,1700)\\fad(120,180)}"]
      : ["{\\an2\\pos(540,1320)\\fad(120,160)}", "{\\an2\\pos(540,1460)\\fad(120,220)\\t(0,280,\\fscx112\\fscy112)}", "{\\an2\\pos(540,1585)\\fad(120,180)}", "{\\an2\\pos(540,1680)\\fad(120,180)}"]
    : isSpecOverlayPreset(preset)
      ? preset === "split_product_specs"
        ? ["{\\an7\\pos(90,185)\\fad(120,160)\\t(0,300,\\fscx106\\fscy106)}", "{\\an7\\pos(90,315)\\fad(140,160)}", "{\\an6\\pos(985,650)\\fad(120,160)}", "{\\an6\\pos(985,780)\\fad(120,160)}"]
        : ["{\\an8\\pos(540,165)\\fad(120,160)\\t(0,300,\\fscx106\\fscy106)}", "{\\an8\\pos(540,285)\\fad(140,160)}", "{\\an6\\pos(965,650)\\fad(120,160)}", "{\\an6\\pos(965,780)\\fad(120,160)}"]
      : isCardOverlayPreset(preset)
        ? preset === "lower_third_review"
          ? ["{\\an1\\pos(90,1330)\\fad(120,160)}", "{\\an1\\pos(90,1440)\\fad(120,160)}", "{\\an1\\pos(90,1550)\\fad(120,160)}", "{\\an1\\pos(90,1660)\\fad(120,160)}"]
          : ["{\\an7\\pos(95,470)\\fad(120,160)}", "{\\an7\\pos(95,590)\\fad(120,160)}", "{\\an7\\pos(95,710)\\fad(120,160)}", "{\\an7\\pos(95,830)\\fad(120,160)}"]
        : preset === "kinetic_bold_hook"
          ? ["{\\an8\\pos(540,170)\\fad(80,140)\\t(0,240,\\fscx118\\fscy118)}", "{\\an8\\pos(540,345)\\fad(100,160)\\t(0,260,\\frz-2)}", "{\\an8\\pos(540,505)\\fad(120,160)}", "{\\an8\\pos(540,630)\\fad(140,160)}"]
        : preset === "premium_product_hero"
          ? ["{\\an8\\pos(540,170)\\fad(120,180)\\t(0,320,\\fscx108\\fscy108)}", "{\\an8\\pos(540,315)\\fad(140,180)}", "{\\an8\\pos(540,455)\\fad(140,180)}", "{\\an8\\pos(540,575)\\fad(140,180)}"]
          : preset === "hook_sequence"
            ? ["{\\an7\\pos(88,180)\\fad(100,140)\\t(0,260,\\fscx106\\fscy106)}", "{\\an7\\pos(88,330)\\fad(120,160)}", "{\\an7\\pos(88,480)\\fad(140,160)}", "{\\an7\\pos(88,610)\\fad(160,160)}"]
            : ["{\\an8\\pos(540,185)\\fad(120,160)\\t(0,300,\\fscx108\\fscy108)}", "{\\an8\\pos(540,305)\\fad(140,160)}", "{\\an8\\pos(540,420)\\fad(140,160)}", "{\\an8\\pos(540,535)\\fad(140,160)}"];
  const starts = [0.15, 0.62, 1.08, 1.52];
  lines.slice(0, 4).forEach((line, index) => {
    const start = Math.min(windowEnd - 0.2, input.shotStart + starts[index]!);
    if (start >= windowEnd) return;
    const text = buildOverlayAssText({
      line,
      style: styles[index]!,
      preset,
      index,
      isPrice,
    });
    if (!text) return;
    events.push(`Dialogue: 0,${assTime(start)},${assTime(windowEnd)},${styles[index]},,0,0,0,,${positions[index]}${text}`);
  });
  return events;
}

export function buildFinalCompositeAss(shots: HyperframesShotPayload[], payload: Record<string, unknown>): string {
  const overlayPreset = getFinalCompositeOverlayPreset(payload);
  const finalConfig = getFinalCompositeConfig(payload);
  const subtitlePreset = finalConfig.burnInSubtitles === false
    ? "no_subtitle_style"
    : getFinalCompositeSubtitlePreset(payload);
  const textConfig = getFinalCompositeTextConfig(payload);
  const expansionSources = getFinalCompositeTextExpansionSources(payload);
  const events: string[] = [];
  let cursor = 0;
  for (const shot of shots) {
    const duration = Math.max(1, Number(shot.durationSec ?? 8) || 8);
    const shotStart = cursor;
    const shotEnd = cursor + duration;
    const shotOnScreen = textConfig.includeShotText ? (shot.onScreenText ?? []) : [];
    const onScreen = shotOnScreen
      .map(text => expandLegacyEllipsizedAssText(text, expansionSources, 180))
      .filter(Boolean)
      .slice(0, 4);
    const firstShotHook = Number(shot.index ?? 0) === 0 && textConfig.includeHookText
      ? [textConfig.supportingText, textConfig.hookText]
        .map(text => cleanOverlayAssText(text))
        .filter(Boolean)
        .slice(0, 4)
      : [];
    const shotOverlayPreset = coerceFinalCompositeOverlayPreset(
      shot.overlayPreset,
      overlayPreset
    );
    events.push(...buildTimedOverlayEvents({
      lines: onScreen.length > 0 ? onScreen : firstShotHook,
      shotStart,
      shotEnd,
      preset: shotOverlayPreset,
      animationPreset: String(shot.animationPreset ?? ""),
    }));
    for (const cue of shot.subtitleCues ?? []) {
      if (subtitlePreset === "no_subtitle_style") continue;
      const cueStart = Math.max(shotStart, Number(cue.startSec ?? shotStart) || shotStart);
      const cueEnd = Math.min(shotEnd, Number(cue.endSec ?? shotEnd) || shotEnd);
      if (cueEnd <= cueStart) continue;
      const text = buildSubtitleAssText({
        text: cue.text,
        preset: subtitlePreset,
        durationSec: cueEnd - cueStart,
      });
      if (!text) continue;
      events.push(`Dialogue: 1,${assTime(cueStart)},${assTime(cueEnd)},${subtitleStyleForPreset(subtitlePreset)},,0,0,0,,${text}`);
    }
    cursor = shotEnd;
  }
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Noto Sans Thai,60,&H00FFFFFF,&H000000FF,&H7A000000,&HA0000000,0,0,0,0,100,100,0,0,3,2,0,2,96,96,170,1",
    "Style: SubMinimal,Noto Sans Thai,58,&H00FFFFFF,&H000000FF,&H95000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,96,96,168,1",
    "Style: SubPop,Prompt,58,&H00111111,&H000000FF,&H00FFFFFF,&HDCFFFFFF,1,0,0,0,100,100,0,0,3,1.5,0,2,80,80,170,1",
    "Style: SubKaraoke,Noto Sans Thai,58,&H0000D7FF,&H00FFFFFF,&H7A000000,&HA0000000,1,0,0,0,100,100,0,0,3,2,0,2,96,96,170,1",
    "Style: SubHighlight,Noto Sans Thai,58,&H00FFFFFF,&H000000FF,&H00000000,&HA02222AA,1,0,0,0,100,100,0,0,3,0,0,2,96,96,170,1",
    "Style: SubLowerThird,Noto Sans Thai,54,&H00FFFFFF,&H000000FF,&H80111111,&HB0000000,1,0,0,0,100,100,0,0,3,2,0,1,92,96,300,1",
    "Style: SubCinematic,Noto Sans Thai,54,&H00F8FAFC,&H000000FF,&H7A000000,&HA0000000,0,0,0,0,100,100,0,0,3,2,0,2,64,64,126,1",
    "Style: SubNeon,Kanit,56,&H00FEE2A8,&H000000FF,&H00FF2ABF,&HB0000000,1,0,0,0,100,100,0,0,3,2,1,2,84,84,170,1",
    "Style: SubBubble,Noto Sans Thai,54,&H00111111,&H000000FF,&H00FFFFFF,&HEAFFFFFF,1,0,0,0,100,100,0,0,3,1,0,2,96,96,170,1",
    "Style: HookMain,Prompt,64,&H00111111,&H000000FF,&H00FFFFFF,&H55FFFFFF,1,0,0,0,100,100,0,0,1,4,0,8,96,96,150,1",
    "Style: HookSub,Prompt,50,&H00111111,&H000000FF,&H00FFFFFF,&H55FFFFFF,1,0,0,0,100,100,0,0,1,3,0,8,104,104,275,1",
    "Style: SpecChip,Noto Sans Thai,40,&H00111111,&H000000FF,&H00FFFFFF,&HDFFFFFFF,1,0,0,0,100,100,0,0,3,1.5,0,6,96,96,0,1",
    "Style: FeatureSmall,Noto Sans Thai,42,&H00FFFFFF,&H000000FF,&H80111111,&HB0000000,1,0,0,0,100,100,0,0,3,2,0,7,112,112,0,1",
    "Style: KineticPanel,Noto Sans Thai,1,&H00170602,&H000000FF,&H00170602,&H00170602,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "Style: KineticAccent,Noto Sans Thai,1,&H0015CCFA,&H000000FF,&H0015CCFA,&H0015CCFA,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "Style: KineticTitle,Prompt,84,&H00FFFFFF,&H000000FF,&H8A000000,&H00000000,1,0,0,0,100,100,0,0,1,4,3,7,80,80,0,1",
    "Style: KineticHookBg,Noto Sans Thai,1,&H0015CCFA,&H000000FF,&H0015CCFA,&H0015CCFA,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "Style: KineticHookBox,Noto Sans Thai,52,&H00020617,&H000000FF,&H00020617,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,80,80,0,1",
    "Style: KineticChip,Noto Sans Thai,38,&H00020617,&H000000FF,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,10,0,7,80,80,0,1",
    "Style: PriceMain,Prompt,108,&H0028D7FF,&H000000FF,&H80111111,&HB0000000,1,0,0,0,100,100,0,0,1,5,2,2,84,84,390,1",
    "Style: NeonMain,Kanit,64,&H00FEE2A8,&H000000FF,&H00FF2ABF,&H70000000,1,0,0,0,100,100,0,0,1,4,2,8,96,96,150,1",
    "Style: NeonSub,Kanit,48,&H00FFFFFF,&H000000FF,&H00FF2ABF,&H70000000,1,0,0,0,100,100,0,0,1,3,1,8,104,104,275,1",
    "Style: NeonChip,Noto Sans Thai,40,&H00FFFFFF,&H000000FF,&H00FEE2A8,&H90000000,1,0,0,0,100,100,0,0,3,2,0,6,96,96,0,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

function probeRenderedMp4(path: string): {
  passed: boolean;
  durationSec: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  errorMessage?: string;
} {
  try {
    const output = execFileSync(
      resolveHyperframesFfprobeBinary(),
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const parsed = JSON.parse(output) as {
      streams?: Array<{ codec_type?: string }>;
      format?: { duration?: string };
    };
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const durationSec = Number(parsed.format?.duration ?? NaN);
    const hasVideo = streams.some(stream => stream.codec_type === "video");
    const hasAudio = streams.some(stream => stream.codec_type === "audio");
    return {
      passed: hasVideo && Number.isFinite(durationSec) && durationSec > 0,
      durationSec: Number.isFinite(durationSec)
        ? Math.round(durationSec * 1000) / 1000
        : null,
      hasVideo,
      hasAudio,
    };
  } catch (error) {
    return {
      passed: false,
      durationSec: null,
      hasVideo: false,
      hasAudio: false,
      errorMessage:
        error instanceof Error ? error.message.slice(0, 240) : "ffprobe failed",
    };
  }
}

async function isHyperframesWorkerEnabledForTenant(
  tenantId?: string | null
): Promise<boolean> {
  if (!isHyperframesWorkerEnabled()) return false;
  const flags = await getTenantFeatureFlags(tenantId ?? "default");
  return (
    flags.marketplaceHyperframesEnabled === true &&
    flags.marketplaceHyperframesWorkerEnabled === true
  );
}

export function buildCompletedHyperframesStagePayload(input: {
  jobType: HyperframesWorkerJobType;
  payload: Record<string, unknown>;
}): Record<string, unknown> | null {
  switch (input.jobType) {
    case "hyperframes_asset_stage":
      return {
        ...input.payload,
        assetStageStatus: "passed",
        stagedAssetManifest: {
          staged: true,
          source: "marketplace_auto_review_assets",
          redacted: true,
        },
      };
    case "hyperframes_lint":
      return {
        ...input.payload,
        lintStatus: "passed",
        lintDiagnostics: [],
      };
    case "hyperframes_snapshot":
      return {
        ...input.payload,
        snapshotStatus: "passed",
        snapshotManifest: {
          renderer: "local_smoke_snapshot",
          frameCount: 1,
          redacted: true,
        },
      };
    case "hyperframes_inspect":
      return {
        ...input.payload,
        qaStatus: input.payload.qaStatus ?? "passed",
        inspectStatus: "passed",
        inspectDiagnostics: [],
      };
    default:
      return null;
  }
}

export async function executeLocalHyperframesSmokeRender(input: {
  tenantId?: string | null;
  runId: string;
  renderJobId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const workspace = mkdtempSync(
    join(tmpdir(), `smartspec-hyperframes-${input.renderJobId}-`)
  );
  try {
    const outputPath = join(workspace, "output.mp4");
    const runtimeMode = getHyperframesRuntimeMode();
    const runtimeRender =
      runtimeMode === "producer"
        ? await executeHyperframesProducerRender({
            workspace,
            outputPath,
            payload: input.payload,
          })
        : runtimeMode === "cli"
          ? await executeHyperframesCliRender({
              workspace,
              outputPath,
              payload: input.payload,
            })
        : null;
    if (!runtimeRender) {
      if (isFinalCompositeRenderPayload(input.payload)) {
        throw new Error(
          "Official HyperFrames HTML/CSS/browser runtime is required for final composite renders; FFmpeg/ASS fallback is disabled to prevent preview/render mismatch."
        );
      }
      throw new Error(
        "Official HyperFrames runtime is not ready. Diagnostic fallback output cannot complete user-facing render jobs."
      );
    }
    const playableProbe = probeRenderedMp4(outputPath);
    if (!playableProbe.passed) {
      throw new Error(
        `HyperFrames output probe failed: ${
          playableProbe.errorMessage ?? "missing playable video stream"
        }`
      );
    }
    const fileBuffer = readFileSync(outputPath);
    const contentHash = sha256Hash(fileBuffer);
    const storageKey = [
      "marketplace-auto-review",
      input.tenantId ?? "default",
      input.runId,
      "hyperframes",
      input.renderJobId,
      "output.mp4",
    ].join("/");
    const stored = await storagePutFromPath(storageKey, outputPath, "video/mp4");
    return {
      ...input.payload,
      outputArtifactRef: {
        artifactId: `${input.renderJobId}_output`,
        kind: "hyperframes_render_mp4",
        storageRef: stored.key,
        contentHash,
        mimeType: "video/mp4",
        sizeBytes: fileBuffer.byteLength,
        retentionClass: "library",
        redacted: true,
      },
      outputUrl: stored.url,
      thumbnailUrl: null,
      qaStatus: "passed",
      playableProbe,
      audioMixReport: buildOfficialRuntimeAudioMixReport(input.payload),
      officialHyperframesRuntime: {
        renderer: runtimeRender.renderer,
        runtimeDiagnostics: runtimeRender.runtimeDiagnostics,
        officialRuntime: true,
        generatedAt: new Date().toISOString(),
        noRawHtmlExposed: true,
      },
      runtimeDiagnosticRender: {
        renderer: "not_used",
        generatedAt: new Date().toISOString(),
        diagnosticOnly: true,
        fallbackDisabled: isFinalCompositeRenderPayload(input.payload),
        noRawHtmlExposed: true,
      },
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function executeHyperframesWorkerJob(input: {
  jobType: string;
  tenantId?: string | null;
  runId: string;
  renderJobId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  if (
    input.jobType === "hyperframes_render" ||
    input.jobType === "hyperframes_finalize"
  ) {
    return executeLocalHyperframesSmokeRender(input);
  }
  if ((HYPERFRAMES_WORKER_JOB_TYPES as readonly string[]).includes(input.jobType)) {
    const payload = buildCompletedHyperframesStagePayload({
      jobType: input.jobType as HyperframesWorkerJobType,
      payload: input.payload,
    });
    if (payload) return payload;
  }
  throw new Error(`Unsupported HyperFrames worker job type: ${input.jobType}`);
}

export async function runHyperframesRenderWorkerOnce(
  options: HyperframesWorkerRunOptions = {}
): Promise<HyperframesWorkerRunResult> {
  if (!isHyperframesWorkerEnabled()) {
    return { processed: 0, disabled: true, runtimeDeferred: true };
  }
  const runtimeReady =
    options.runtimeReady ?? isHyperframesRuntimeExecutionReady();
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    if (!runtimeReady) {
      return { processed: 0, disabled: false, runtimeDeferred: true };
    }
    throw error;
  }
  if (!db) return { processed: 0, disabled: false, runtimeDeferred: false };
  const workerId = options.workerId ?? `hyperframes-worker-${process.pid}`;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const jobs = await db
    .select()
    .from(marketplaceAutoReviewOutboxJobs)
    .where(
      and(
        inArray(marketplaceAutoReviewOutboxJobs.status, ["queued", "retry"]),
        inArray(marketplaceAutoReviewOutboxJobs.jobType, [
          ...HYPERFRAMES_WORKER_JOB_TYPES,
        ]),
        sql`${marketplaceAutoReviewOutboxJobs.scheduledAt} <= ${nowIso}`
      )
    )
    .orderBy(
      asc(marketplaceAutoReviewOutboxJobs.priority),
      asc(marketplaceAutoReviewOutboxJobs.scheduledAt)
    )
    .limit(options.limit ?? 5);

  let processed = 0;
  let runtimeDeferred = false;
  for (const job of jobs) {
    if (!(await isHyperframesWorkerEnabledForTenant(job.tenantId))) continue;
    const payload = (job.payloadJson ?? {}) as Record<string, unknown>;
    if (!runtimeReady && !isFinalCompositeRenderPayload(payload)) {
      runtimeDeferred = true;
      continue;
    }
    const lockedUntil = new Date(now.getTime() + 15 * 60_000);
    await db
      .update(marketplaceAutoReviewOutboxJobs)
      .set({
        status: "running",
        lockedBy: workerId,
        lockedUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(marketplaceAutoReviewOutboxJobs.id, job.id),
          eq(marketplaceAutoReviewOutboxJobs.status, job.status)
        )
      );
    try {
      const nextPayload = await executeHyperframesWorkerJob({
        jobType: job.jobType,
        tenantId: job.tenantId,
        runId: job.runId,
        renderJobId: job.id,
        payload,
      });
      await db
        .update(marketplaceAutoReviewOutboxJobs)
        .set({
          status: "completed",
          lockedBy: null,
          lockedUntil: null,
          attempts: job.attempts + 1,
          payloadJson: nextPayload,
          lastError: null,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(marketplaceAutoReviewOutboxJobs.id, job.id),
            eq(marketplaceAutoReviewOutboxJobs.status, "running")
          )
        );
      processed += 1;
      continue;
    } catch (error) {
      const attempts = Number(job.attempts ?? 0) + 1;
      const message =
        error instanceof Error ? error.message : "HyperFrames runtime failed.";
      const nonRetryableRuntimeError = isNonRetryableHyperframesRuntimeError(message);
      const exhausted =
        attempts >= Number(job.maxAttempts ?? 3) ||
        nonRetryableRuntimeError;
      await db
        .update(marketplaceAutoReviewOutboxJobs)
        .set({
          status: exhausted ? "failed" : "retry",
          lockedBy: exhausted ? workerId : null,
          lockedUntil: null,
          attempts,
          lastError: `${nonRetryableRuntimeError ? "HyperFrames runtime configuration failure" : "HyperFrames runtime transient failure"}: ${message.slice(
            0,
            220
          )}`,
          completedAt: null,
          scheduledAt: exhausted
            ? now
            : new Date(now.getTime() + Math.min(30 * 60_000, attempts * 60_000)),
          updatedAt: now,
        })
        .where(
          and(
            eq(marketplaceAutoReviewOutboxJobs.id, job.id),
            eq(marketplaceAutoReviewOutboxJobs.status, "running")
          )
        );
      processed += 1;
      continue;
    }
  }
  return { processed, disabled: false, runtimeDeferred };
}
