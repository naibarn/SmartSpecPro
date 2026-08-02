import { useEffect } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  HyperframesAutoPlanOverrideInput,
  HyperframesAutoStoryboardReviewPlan,
} from "@shared/hyperframes/autoPlan";
import { HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES } from "@shared/hyperframes/autoPlan";
import { MARKETPLACE_AUTO_REVIEW_CURATED_VISION_QA_MODELS } from "@shared/marketplaceAutoReview/contracts";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface AutoStoryboardAdvancedOverridesProps {
  plan?: HyperframesAutoStoryboardReviewPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: HyperframesAutoPlanOverrideInput;
  onChange: (value: HyperframesAutoPlanOverrideInput) => void;
  onResetToAuto: () => void;
  locale?: MarketplaceHyperframesUiLocale | string;
  imageModelOptions?: ReadonlyArray<{ value: string; label: string }>;
  videoModelOptions?: ReadonlyArray<{ value: string; label: string }>;
  visionQaModelOptions?: ReadonlyArray<{ value: string; label: string }>;
  /** Recommended-first LLM list for authoring the story / running the
   *  storyboard skill. First entry is the recommended default. */
  storyPlanningModelOptions?: ReadonlyArray<{ value: string; label: string }>;
  /**
   * Feature 136 (section 11, §6.6). Flag-gated: `frameStrategyOptions`
   * conditionally appends the sequential option; the array is otherwise
   * byte-identical. Default `false` keeps every existing caller/test
   * (including the shipped `AutoStoryboardAdvancedOverrides.test.tsx`)
   * unchanged.
   */
  sequentialStrategyEnabled?: boolean;
  /**
   * Marketplace two-character-conversation feature (planning/marketplace-
   * two-character-conversation/plan.md §3.6/§3.8), Wave 3 frontend — the
   * STAGED pipeline's per-shot requested video duration. Deliberately a
   * dedicated prop pair (not folded into `value`/`onChange`'s
   * `HyperframesAutoPlanOverrideInput`, whose schema is `.strict()` in
   * `shared/hyperframes/autoPlan.ts` and unrelated to the STAGED run's own
   * `referenceAnchors.shotDurationSeconds` field) so this stays fully
   * additive without touching that shared contract. `undefined` (both here
   * and at the caller) omits the field entirely — the run-start mutation's
   * `referenceAnchors` gets no `shotDurationSeconds` key at all, matching
   * today's implicit 10s default byte-for-byte.
   */
  shotDurationSeconds?: number;
  onShotDurationSecondsChange?: (value: number | undefined) => void;
  /**
   * Marketplace flexible-shots-and-creation-casting (planning/marketplace-
   * flexible-shots-and-creation-casting/plan.md, W1/W3) — the STAGED
   * pipeline's flexible shot count (7-30, or "auto" to let the story-arc LLM
   * planner pick a count based on content + the requested per-shot
   * duration). Deliberately a dedicated prop pair, same precedent as
   * `shotDurationSeconds` above: NOT folded into `value`/`onChange`'s
   * `HyperframesAutoPlanOverrideInput` (whose own `.strict()` `shotCount`
   * field is legacy-only, hard-capped 7-9, and feeds a completely different
   * machinery). `undefined` (both here and at the caller) omits the field
   * entirely — the run-start mutation's `referenceAnchors` gets no
   * `shotCount` key at all, matching today's implicit 9-shot default
   * byte-for-byte.
   */
  stagedShotCount?: "auto" | number;
  onStagedShotCountChange?: (value: "auto" | number | undefined) => void;
  videoSegmentPreview?: {
    loading?: boolean;
    error?: string | null;
    effectiveMode?: string | null;
    creditSource?: string | null;
    fallbackReason?: string | null;
    segments?: ReadonlyArray<{
      segmentId?: string | null;
      shotIds: ReadonlyArray<string>;
      durationSeconds?: number | null;
      referenceMode?: string | null;
    }>;
    warnings?: ReadonlyArray<{
      code?: string;
      message: string;
      source?: string;
    }>;
  } | null;
}

type OverrideKey = keyof HyperframesAutoPlanOverrideInput;

const baseAutoDefaultValues: Record<OverrideKey, string> = {
  ...HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  // Ensures the "auto" default prunes to an omitted key even before the shared
  // schema/base-values gain characterPresenceMode from the backend agent.
  characterPresenceMode: "auto",
};

function overrideValueString(value: unknown): string {
  return typeof value === "number" ? String(value) : String(value ?? "");
}

function pruneBaseAutoDefaultOverrides(
  value: HyperframesAutoPlanOverrideInput
): HyperframesAutoPlanOverrideInput {
  const next = { ...value };
  (Object.keys(next) as OverrideKey[]).forEach(key => {
    if (overrideValueString(next[key]) === baseAutoDefaultValues[key]) {
      delete next[key];
    }
  });
  return next;
}

function overridesEqual(
  left: HyperframesAutoPlanOverrideInput,
  right: HyperframesAutoPlanOverrideInput
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => {
    const typedKey = key as OverrideKey;
    return (
      overrideValueString(left[typedKey]) ===
      overrideValueString(right[typedKey])
    );
  });
}

const storyMotionFieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const storyMotionLabelClass =
  "text-xs font-semibold text-slate-500 dark:text-slate-400";

/**
 * Prominent always-visible story/motion free-text fields for the Auto
 * Storyboard Review flow. Writes into the SAME overrides object (and with the
 * same prune-empty semantics) as AutoStoryboardAdvancedOverrides, so payload
 * behavior is identical — this is a UI relocation of the two textareas out of
 * the advanced panel.
 */
export function AutoStoryboardStoryMotionFields({
  value,
  onChange,
  locale,
}: {
  value: HyperframesAutoPlanOverrideInput;
  onChange: (value: HyperframesAutoPlanOverrideInput) => void;
  locale?: AutoStoryboardAdvancedOverridesProps["locale"];
}) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const thai = copy.locale === "th";
  const labels = {
    creativeBrief: thai ? "แนวเรื่องหรือคำบรรยายเพิ่มเติม" : "Creative brief",
    motionDirection: thai
      ? "คำกำกับการเคลื่อนไหวในวิดีโอ (ไม่บังคับ)"
      : "Video motion direction (optional)",
  };
  const update = (
    key: "creativeBrief" | "motionDirection",
    nextValue: string
  ) => {
    const next = { ...value };
    if (nextValue === "") {
      delete next[key];
    } else {
      next[key] = nextValue as never;
    }
    onChange(pruneBaseAutoDefaultOverrides(next));
  };
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <label className="block space-y-1">
        <span className={storyMotionLabelClass}>{labels.creativeBrief}</span>
        <textarea
          aria-label={labels.creativeBrief}
          className={`${storyMotionFieldClass} min-h-24 py-2`}
          value={overrideValueString(value.creativeBrief)}
          onChange={event => update("creativeBrief", event.target.value)}
          placeholder={
            thai
              ? "เช่น อยากได้แนวรีวิวอบอุ่น กระชับ เน้นผลลัพธ์จริง"
              : "Example: warmer pacing, concise proof-first review, practical result emphasis"
          }
        />
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {thai
            ? "กำหนดแนวเรื่อง ตัวละคร หรือสถานการณ์ให้ระบบวางแผนทุก shot ตาม"
            : "Steers the story/scenario the planner weaves into every shot"}
        </p>
      </label>
      <label className="block space-y-1">
        <span className={storyMotionLabelClass}>{labels.motionDirection}</span>
        <textarea
          aria-label={labels.motionDirection}
          className={`${storyMotionFieldClass} min-h-24 py-2`}
          value={overrideValueString(value.motionDirection)}
          onChange={event => update("motionDirection", event.target.value)}
          placeholder={
            thai
              ? "เช่น นางแบบหยิบขวดแชมพูขึ้นมา กดหัวปั๊ม... ปิดท้ายโชว์สินค้า"
              : "Example: the model picks up the shampoo bottle, presses the pump... closing on a clear product showcase"
          }
        />
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {thai
            ? "ใช้กำกับท่วงท่า/ลำดับการเคลื่อนไหวของวิดีโอ (โหมดวิดีโอ)"
            : "Choreographs the video motion sequence (video mode)"}
        </p>
      </label>
    </div>
  );
}

export function AutoStoryboardAdvancedOverrides({
  plan,
  open,
  onOpenChange,
  value,
  onChange,
  onResetToAuto,
  locale,
  imageModelOptions: providedImageModelOptions,
  videoModelOptions: providedVideoModelOptions,
  visionQaModelOptions: providedVisionQaModelOptions,
  storyPlanningModelOptions,
  videoSegmentPreview,
  sequentialStrategyEnabled = false,
  shotDurationSeconds,
  onShotDurationSecondsChange,
  stagedShotCount,
  onStagedShotCountChange,
}: AutoStoryboardAdvancedOverridesProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const fields = plan?.overrideDiff.fields ?? [];
  const effectiveValue = pruneBaseAutoDefaultOverrides(value);
  const localOverrideActive = Object.keys(effectiveValue).length > 0;
  const showResetToAuto = fields.length > 0 || localOverrideActive;
  const thai = copy.locale === "th";
  const labels = {
    format: thai ? "รูปแบบ" : "Format",
    quality: thai ? "คุณภาพ" : "Quality",
    audio: thai ? "เสียง" : "Audio",
    textPolicy: thai ? "นโยบายข้อความ" : "Text policy",
    shots: thai ? "จำนวนช็อต" : "Shots",
    frames: thai ? "เฟรม" : "Frames",
    imageModel: thai ? "โมเดลภาพ" : "Image model",
    videoModel: thai ? "โมเดลวิดีโอ" : "Video model",
    shotDurationSeconds: thai
      ? "ความยาวต่อช็อต (วินาที)"
      : "Per-shot duration (seconds)",
    stagedShotCount: thai
      ? "จำนวนช็อต (Staged)"
      : "Shot count (Staged)",
    visionQaModel: copy.visionQaModel,
    storyPlanningModel: copy.storyPlanningModel,
    videoStructure: thai ? "โครงสร้างวิดีโอ" : "Video structure",
    manualGroupSize: thai ? "กำหนดจำนวนช็อตต่อคลิป" : "Manual group size",
    speechLanguage: thai ? "ภาษาพูด" : "Spoken language",
    creativeBrief: thai ? "แนวเรื่องหรือคำบรรยายเพิ่มเติม" : "Creative brief",
    motionDirection: thai
      ? "คำกำกับการเคลื่อนไหวในวิดีโอ (ไม่บังคับ)"
      : "Video motion direction (optional)",
    characterPresenceMode: thai
      ? "การปรากฏของบุคคลในภาพ 3x3"
      : "Character presence in 3x3 frames",
  };
  const fieldLabels: Record<string, string> = {
    platformPreset: labels.format,
    platformPresetId: labels.format,
    qualityMode: labels.quality,
    audioStrategy: labels.audio,
    overlayTextMode: labels.textPolicy,
    shotCount: labels.shots,
    frameStrategy: labels.frames,
    imageModel: labels.imageModel,
    videoModel: labels.videoModel,
    visionQaModel: labels.visionQaModel,
    storyPlanningModel: labels.storyPlanningModel,
    videoStructureMode: labels.videoStructure,
    manualVideoGroupSize: labels.manualGroupSize,
    speechLanguage: labels.speechLanguage,
    creativeBrief: labels.creativeBrief,
    motionDirection: labels.motionDirection,
    characterPresenceMode: labels.characterPresenceMode,
    // Feature 136 (section 11, §6.6 item 3) — override-diff labels for the
    // five new Feature 136 override keys (section 01). `confirmedAttributes`
    // is included here for label purposes only; the evidence panel (not
    // this component) owns writing/pruning that key (binding decision §3.4).
    confirmedAttributes: copy.confirmedAttributesLabel,
    forbiddenClaims: copy.forbiddenClaimsLabel,
    targetAudience: copy.targetAudienceLabel,
    userRequirements: copy.userRequirementsLabel,
    sequentialImagePromptMaxChars: copy.sequentialImagePromptMaxCharsLabel,
  };
  const describeFields = (fieldNames: string[]) =>
    fieldNames.map(field => fieldLabels[field] ?? field);
  const localOverrideFields = describeFields(Object.keys(effectiveValue));
  const serverOverrideFields = describeFields(fields);
  const platformPresetOptions = [
    {
      value: "generic_vertical_9_16",
      label: thai ? "แนวตั้ง 9:16" : "Vertical 9:16",
    },
    { value: "tiktok_reels_shorts_9_16", label: "TikTok / Reels / Shorts" },
  ] as const;
  const qualityModeOptions = [
    { value: "fast", label: thai ? "ร่างเร็ว" : "Fast draft" },
    { value: "balanced", label: thai ? "สมดุล" : "Balanced" },
    { value: "high", label: thai ? "คุณภาพสูง QA" : "High QA" },
  ] as const;
  const audioStrategyOptions = [
    {
      value: "auto",
      label: thai ? "ให้ระบบตัดสินเสียง" : "Auto decision",
    },
    {
      value: "native_video_audio",
      label: thai ? "ใช้เสียงจากวิดีโอ" : "Use native video audio",
    },
    {
      value: "separate_tts_voiceover",
      label: thai ? "สร้างเสียงบรรยาย" : "Generate voiceover",
    },
    { value: "silent", label: thai ? "ไม่มีเสียง" : "Silent" },
  ] as const;
  const overlayTextModeOptions = [
    {
      value: "no_text",
      label: thai ? "ไม่สร้างข้อความบนภาพ" : "No generated text",
    },
    {
      value: "allow_text",
      label: thai ? "อนุญาตข้อความที่ปลอดภัย" : "Allow safe overlay text",
    },
  ] as const;
  const shotCountOptions = [
    { value: "7", label: thai ? "7 ช็อต" : "7 shots" },
    { value: "8", label: thai ? "8 ช็อต" : "8 shots" },
    { value: "9", label: thai ? "9 ช็อต" : "9 shots" },
  ] as const;
  // Marketplace flexible-shots-and-creation-casting (planning/marketplace-
  // flexible-shots-and-creation-casting/plan.md, W1/W3) — STAGED-only,
  // separate from `shotCountOptions` above (legacy, hard-capped 7-9).
  const stagedShotCountOptions = [
    {
      value: "auto",
      label: thai
        ? "อัตโนมัติ (ระบบเลือกตามเนื้อหา — แนะนำ)"
        : "Automatic (AI decides based on content — recommended)",
    },
    { value: "7", label: thai ? "7 ช็อต" : "7 shots" },
    { value: "8", label: thai ? "8 ช็อต" : "8 shots" },
    { value: "9", label: thai ? "9 ช็อต (ค่าเริ่มต้น)" : "9 shots (default)" },
    { value: "10", label: thai ? "10 ช็อต" : "10 shots" },
    { value: "12", label: thai ? "12 ช็อต" : "12 shots" },
    { value: "15", label: thai ? "15 ช็อต" : "15 shots" },
    { value: "18", label: thai ? "18 ช็อต" : "18 shots" },
    { value: "21", label: thai ? "21 ช็อต" : "21 shots" },
    { value: "24", label: thai ? "24 ช็อต" : "24 shots" },
    { value: "27", label: thai ? "27 ช็อต" : "27 shots" },
    { value: "30", label: thai ? "30 ช็อต" : "30 shots" },
  ] as const;
  const frameStrategyOptions = [
    {
      value: "storyboard_3x3_split",
      label: thai ? "ตาราง storyboard 3x3" : "3x3 storyboard grid",
    },
    {
      value: "video_shot_start_stop",
      label: thai ? "เฟรมเริ่ม/จบแต่ละช็อต" : "Start/stop frame pairs",
    },
    // Feature 136 (section 11, §6.6 item 1) — flag-gated third option; the
    // array above is otherwise byte-identical for every existing caller.
    ...(sequentialStrategyEnabled
      ? ([
          {
            value: "sequential_shot_storyboard",
            label: copy.sequentialStrategyOptionLabel,
          },
        ] as const)
      : []),
  ] as const;
  const videoStructureOptions = [
    {
      value: "per_shot",
      label: thai
        ? "Per-shot: 1 ช็อตต่อ 1 วิดีโอ"
        : "Per-shot: 1 shot per video",
    },
    {
      value: "adaptive_multi_shot",
      label: thai
        ? "Multi-shot อัตโนมัติ: รวม sub-shot ตามโมเดล"
        : "Adaptive multi-shot: model groups sub-shots",
    },
    {
      value: "compact_multi_shot",
      label: thai
        ? "Compact multi-shot: รวมหลาย sub-shot ต่อวิดีโอ"
        : "Compact multi-shot: more sub-shots per video",
    },
    {
      value: "manual_group_size",
      label: thai
        ? "Manual multi-shot: กำหนด sub-shot ต่อวิดีโอ"
        : "Manual multi-shot: sub-shots per video",
    },
  ] as const;
  const manualGroupSizeOptions = ["2", "3", "4", "5", "6"].map(value => ({
    value,
    label: thai ? `${value} ช็อตต่อคลิป` : `${value} shots per clip`,
  }));
  // Marketplace two-character-conversation feature (§3.6) — small fixed set
  // of common per-shot durations for the STAGED pipeline's requested video
  // length. Server-side, the pipeline still snaps this to whatever the
  // selected video model actually supports at dispatch time (e.g. Veo 3.1
  // only supports 8s), so this is a "requested" duration, not a guarantee.
  const shotDurationSecondsOptions = [
    { value: "5", label: thai ? "5 วินาที" : "5 seconds" },
    { value: "8", label: thai ? "8 วินาที" : "8 seconds" },
    { value: "10", label: thai ? "10 วินาที" : "10 seconds" },
    { value: "15", label: thai ? "15 วินาที" : "15 seconds" },
    { value: "20", label: thai ? "20 วินาที" : "20 seconds" },
    { value: "24", label: thai ? "24 วินาที" : "24 seconds" },
    { value: "30", label: thai ? "30 วินาที" : "30 seconds" },
  ] as const;
  const speechLanguageOptions = [
    { value: "en", label: thai ? "อังกฤษ (ค่าเริ่มต้น)" : "English (default)" },
    { value: "th", label: thai ? "ไทย" : "Thai" },
    { value: "zh", label: thai ? "จีน" : "Chinese" },
    { value: "ja", label: thai ? "ญี่ปุ่น" : "Japanese" },
    { value: "ko", label: thai ? "เกาหลี" : "Korean" },
    { value: "es", label: thai ? "สเปน" : "Spanish" },
    { value: "fr", label: thai ? "ฝรั่งเศส" : "French" },
    { value: "de", label: thai ? "เยอรมัน" : "German" },
    { value: "vi", label: thai ? "เวียดนาม" : "Vietnamese" },
    { value: "id", label: thai ? "อินโดนีเซีย" : "Indonesian" },
    { value: "ms", label: thai ? "มาเลย์" : "Malay" },
    { value: "hi", label: thai ? "ฮินดี" : "Hindi" },
    { value: "ar", label: thai ? "อาหรับ" : "Arabic" },
    { value: "pt", label: thai ? "โปรตุเกส" : "Portuguese" },
    { value: "it", label: thai ? "อิตาลี" : "Italian" },
  ] as const;
  const characterPresenceModeOptions = [
    {
      value: "auto",
      label: thai ? "อัตโนมัติ (ค่าเริ่มต้น)" : "Auto (default)",
    },
    {
      value: "every_frame",
      label: thai ? "มีคนทุกเฟรม (9/9)" : "Person in every frame (9/9)",
    },
    {
      value: "most_frames",
      label: thai
        ? "มีคนเกือบทุกเฟรม (อย่างน้อย 7/9)"
        : "Person in most frames (at least 7/9)",
    },
  ] as const;
  const imageModelOptions = providedImageModelOptions?.length
    ? providedImageModelOptions
    : ([
        {
          value: "google-nano-banana-pro",
          label: thai ? "Nano Banana Pro" : "Nano Banana Pro",
        },
        {
          value: "google-banana-2",
          label: thai ? "Banana 2" : "Banana 2",
        },
      ] as const);
  const videoModelOptions = providedVideoModelOptions?.length
    ? providedVideoModelOptions
    : ([
        {
          value: "veo3/generate-veo-3-video-lite",
          label: thai ? "Veo 3 Lite" : "Veo 3 Lite",
        },
      ] as const);
  const visionQaModelOptions = providedVisionQaModelOptions?.length
    ? providedVisionQaModelOptions
    : MARKETPLACE_AUTO_REVIEW_CURATED_VISION_QA_MODELS.map(modelId => ({
        value: modelId,
        label: modelId,
      }));
  const defaultValueFor = (key: OverrideKey): string =>
    baseAutoDefaultValues[key];
  const selectedValueFor = (key: OverrideKey): string =>
    overrideValueString(effectiveValue[key] ?? defaultValueFor(key));
  const update = (key: OverrideKey, nextValue: string) => {
    const next = { ...effectiveValue };
    if (
      nextValue === defaultValueFor(key) ||
      nextValue === baseAutoDefaultValues[key]
    ) {
      delete next[key];
    } else if (key === "shotCount" || key === "manualVideoGroupSize") {
      next.shotCount = Number(
        nextValue
      ) as HyperframesAutoPlanOverrideInput["shotCount"];
      if (key === "manualVideoGroupSize") {
        next.manualVideoGroupSize = Number(
          nextValue
        ) as HyperframesAutoPlanOverrideInput["manualVideoGroupSize"];
        delete next.shotCount;
      }
    } else {
      next[key] = nextValue as never;
    }
    onChange(pruneBaseAutoDefaultOverrides(next));
  };

  useEffect(() => {
    if (!overridesEqual(value, effectiveValue)) {
      onChange(effectiveValue);
    }
  }, [effectiveValue, onChange, value]);

  const fieldClass =
    "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
  const selectedVideoStructure = selectedValueFor("videoStructureMode");
  // Marketplace flexible-shots-and-creation-casting (planning/marketplace-
  // flexible-shots-and-creation-casting/plan.md, W3) — the legacy 7-9 "Shots"
  // select only feeds the non-staged hyperframes template machinery and
  // means nothing once the STAGED sequential pipeline is selected (that
  // pipeline reads `stagedShotCount`/`referenceAnchors.shotCount` instead,
  // 7-30 + "auto"). Rather than show two shot-count controls at once, swap
  // between them based on the currently selected `frameStrategy`.
  const isSequentialFrameStrategySelected =
    selectedValueFor("frameStrategy") === "sequential_shot_storyboard";
  const previewSegments = videoSegmentPreview?.segments ?? [];
  const previewTotalShots = previewSegments.reduce(
    (sum, segment) => sum + segment.shotIds.length,
    0
  );

  return (
    <section
      className="rounded-lg border bg-white p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      aria-label={copy.advancedOverrides}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-slate-100"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {copy.advancedOverrides}
        </button>
        {showResetToAuto ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetToAuto}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {copy.useAutoPlan}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 space-y-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          <p>{copy.autoNoSetup}</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1">
              <span className={labelClass}>{labels.format}</span>
              <select
                aria-label={labels.format}
                className={fieldClass}
                value={selectedValueFor("platformPresetId")}
                onChange={event =>
                  update("platformPresetId", event.target.value)
                }
              >
                {platformPresetOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>{labels.quality}</span>
              <select
                aria-label={labels.quality}
                className={fieldClass}
                value={selectedValueFor("qualityMode")}
                onChange={event => update("qualityMode", event.target.value)}
              >
                {qualityModeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>{labels.audio}</span>
              <select
                aria-label={labels.audio}
                className={fieldClass}
                value={selectedValueFor("audioStrategy")}
                onChange={event => update("audioStrategy", event.target.value)}
              >
                {audioStrategyOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>{labels.textPolicy}</span>
              <select
                aria-label={labels.textPolicy}
                className={fieldClass}
                value={selectedValueFor("overlayTextMode")}
                onChange={event =>
                  update("overlayTextMode", event.target.value)
                }
              >
                {overlayTextModeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {!isSequentialFrameStrategySelected ? (
              <label className="space-y-1">
                <span className={labelClass}>{labels.shots}</span>
                <select
                  aria-label={labels.shots}
                  className={fieldClass}
                  value={selectedValueFor("shotCount")}
                  onChange={event => update("shotCount", event.target.value)}
                >
                  {shotCountOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {isSequentialFrameStrategySelected && onStagedShotCountChange ? (
              <label className="space-y-1">
                <span className={labelClass}>{labels.stagedShotCount}</span>
                <select
                  aria-label={labels.stagedShotCount}
                  aria-describedby="staged-shot-count-caption"
                  className={fieldClass}
                  value={
                    stagedShotCount !== undefined
                      ? String(stagedShotCount)
                      : "9"
                  }
                  onChange={event => {
                    const raw = event.target.value;
                    onStagedShotCountChange(
                      raw === "9"
                        ? undefined
                        : raw === "auto"
                          ? "auto"
                          : Number(raw)
                    );
                  }}
                >
                  {stagedShotCountOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p
                  id="staged-shot-count-caption"
                  className="text-xs leading-5 text-slate-500 dark:text-slate-400"
                >
                  {thai
                    ? "โหมดอัตโนมัติให้ AI เลือกจำนวนช็อตตามรายละเอียดสินค้า โดยอิงความยาวต่อช็อตที่เลือก"
                    : "Automatic mode lets the AI choose the shot count based on the product's content, using the selected per-shot duration as the pacing guide."}
                </p>
              </label>
            ) : null}
            <label className="space-y-1">
              <span className={labelClass}>{labels.frames}</span>
              <select
                aria-label={labels.frames}
                className={fieldClass}
                value={selectedValueFor("frameStrategy")}
                onChange={event => update("frameStrategy", event.target.value)}
              >
                {frameStrategyOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>{labels.imageModel}</span>
              <select
                aria-label={labels.imageModel}
                className={fieldClass}
                value={selectedValueFor("imageModel")}
                onChange={event => update("imageModel", event.target.value)}
              >
                {imageModelOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>{labels.videoModel}</span>
              <select
                aria-label={labels.videoModel}
                className={fieldClass}
                value={selectedValueFor("videoModel")}
                onChange={event => update("videoModel", event.target.value)}
              >
                {videoModelOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {onShotDurationSecondsChange ? (
              <label className="space-y-1">
                <span className={labelClass}>{labels.shotDurationSeconds}</span>
                <select
                  aria-label={labels.shotDurationSeconds}
                  aria-describedby="shot-duration-caveat"
                  className={fieldClass}
                  value={
                    shotDurationSeconds != null ? String(shotDurationSeconds) : ""
                  }
                  onChange={event => {
                    const raw = event.target.value;
                    onShotDurationSecondsChange(
                      raw === "" ? undefined : Number(raw)
                    );
                  }}
                >
                  <option value="">
                    {thai ? "อัตโนมัติ (10 วินาที)" : "Automatic (10 seconds)"}
                  </option>
                  {shotDurationSecondsOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p
                  id="shot-duration-caveat"
                  className="text-xs leading-5 text-slate-500 dark:text-slate-400"
                >
                  {thai
                    ? "ระบบจะปรับให้เข้ากับโมเดลวิดีโอที่เลือกโดยอัตโนมัติหากจำเป็น"
                    : "The system will automatically adjust this to fit the selected video model if needed."}
                </p>
              </label>
            ) : null}
            <label className="space-y-1">
              <span className={labelClass}>{labels.visionQaModel}</span>
              <select
                aria-label={labels.visionQaModel}
                className={fieldClass}
                value={selectedValueFor("visionQaModel")}
                onChange={event =>
                  update("visionQaModel", event.target.value)
                }
              >
                <option value="">{copy.visionQaModelAuto}</option>
                {visionQaModelOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {/* Story / skill LLM — "อัตโนมัติ" resolves from the admin-curated
                RECOMMENDED set, not the cheapest eligible model
                (`planning/marketplace-four-character-cast/plan.md`). */}
            {storyPlanningModelOptions && storyPlanningModelOptions.length > 0 ? (
              <label className="space-y-1">
                <span className={labelClass}>{labels.storyPlanningModel}</span>
                <select
                  aria-label={labels.storyPlanningModel}
                  className={fieldClass}
                  value={selectedValueFor("storyPlanningModel")}
                  onChange={event =>
                    update("storyPlanningModel", event.target.value)
                  }
                  data-testid="auto-overrides-story-planning-model"
                >
                  <option value="">{copy.storyPlanningModelAuto}</option>
                  {storyPlanningModelOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-1">
              <span className={labelClass}>{labels.videoStructure}</span>
              <select
                aria-label={labels.videoStructure}
                className={fieldClass}
                value={selectedVideoStructure}
                onChange={event =>
                  update("videoStructureMode", event.target.value)
                }
              >
                {videoStructureOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedVideoStructure === "manual_group_size" ? (
              <label className="space-y-1">
                <span className={labelClass}>{labels.manualGroupSize}</span>
                <select
                  aria-label={labels.manualGroupSize}
                  className={fieldClass}
                  value={selectedValueFor("manualVideoGroupSize")}
                  onChange={event =>
                    update("manualVideoGroupSize", event.target.value)
                  }
                >
                  {manualGroupSizeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-1">
              <span className={labelClass}>{labels.speechLanguage}</span>
              <select
                aria-label={labels.speechLanguage}
                className={fieldClass}
                value={selectedValueFor("speechLanguage")}
                onChange={event => update("speechLanguage", event.target.value)}
              >
                {speechLanguageOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>{labels.characterPresenceMode}</span>
              <select
                aria-label={labels.characterPresenceMode}
                className={fieldClass}
                value={selectedValueFor("characterPresenceMode")}
                onChange={event =>
                  update("characterPresenceMode", event.target.value)
                }
              >
                {characterPresenceModeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {videoSegmentPreview ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-slate-700 dark:border-sky-900 dark:bg-sky-950 dark:text-slate-200">
              {videoSegmentPreview.loading ? (
                <p>
                  {thai
                    ? "กำลังดูตัวอย่างโครงสร้างวิดีโอ..."
                    : "Loading video structure preview..."}
                </p>
              ) : videoSegmentPreview.error ? (
                <p className="text-rose-700 dark:text-rose-300">
                  {videoSegmentPreview.error}
                </p>
              ) : (
                <div className="space-y-1">
                  <p>
                    {thai ? "ตัวอย่างจากระบบ:" : "Backend preview:"}{" "}
                    {videoSegmentPreview.effectiveMode ||
                      selectedVideoStructure}
                    {videoSegmentPreview.creditSource
                      ? ` · ${videoSegmentPreview.creditSource}`
                      : ""}
                  </p>
                  {previewSegments.length > 0 ? (
                    <div className="mt-2 rounded-md border border-sky-200 bg-white/70 p-2 dark:border-sky-900 dark:bg-slate-900/60">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {thai
                          ? `Multi-shot/Sub-shot preview: จะแตกเป็น ${previewSegments.length} วิดีโอ จาก ${previewTotalShots} storyboard shot`
                          : `Multi-shot/sub-shot preview: ${previewSegments.length} video segment(s) from ${previewTotalShots} storyboard shot(s)`}
                      </p>
                      <ol className="mt-1 space-y-1">
                        {previewSegments.slice(0, 12).map((segment, index) => (
                          <li
                            key={
                              segment.segmentId ??
                              `${index}-${segment.shotIds.join("-")}`
                            }
                            className="text-slate-700 dark:text-slate-200"
                          >
                            {thai
                              ? `วิดีโอ ${index + 1}: `
                              : `Video ${index + 1}: `}
                            {segment.shotIds.length > 1
                              ? thai
                                ? `รวม ${segment.shotIds.length} sub-shot`
                                : `${segment.shotIds.length} sub-shots`
                              : thai
                                ? "1 sub-shot"
                                : "1 sub-shot"}
                            {" · "}
                            {segment.shotIds.join(" → ")}
                            {segment.durationSeconds
                              ? ` · ${segment.durationSeconds}s`
                              : ""}
                          </li>
                        ))}
                      </ol>
                      {previewSegments.length > 12 ? (
                        <p className="mt-1 text-slate-500">
                          {thai
                            ? `ยังมีอีก ${previewSegments.length - 12} วิดีโอ`
                            : `${previewSegments.length - 12} more video segment(s)`}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {videoSegmentPreview.fallbackReason ? (
                    <p className="text-amber-700 dark:text-amber-300">
                      {videoSegmentPreview.fallbackReason}
                    </p>
                  ) : null}
                  {videoSegmentPreview.warnings?.map((warning, index) => (
                    <p key={`${warning.code ?? "warning"}-${index}`}>
                      {warning.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {fields.length > 0 ? (
            <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">
              {copy.overrideDiff(serverOverrideFields)}
            </p>
          ) : localOverrideActive ? (
            <p className="mt-2 font-medium text-sky-700 dark:text-sky-300">
              {copy.overridePending}
              {localOverrideFields.length > 0
                ? ` (${localOverrideFields.join(", ")})`
                : ""}
            </p>
          ) : (
            <p className="mt-2 font-medium text-emerald-700 dark:text-emerald-300">
              {copy.noOverridesActive}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
