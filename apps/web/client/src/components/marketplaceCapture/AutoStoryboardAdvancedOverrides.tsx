import { useEffect } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  HyperframesAutoPlanOverrideInput,
  HyperframesAutoStoryboardReviewPlan,
} from "@shared/hyperframes/autoPlan";
import { HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES } from "@shared/hyperframes/autoPlan";
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
    warnings?: ReadonlyArray<{ code?: string; message: string; source?: string }>;
  } | null;
}

type OverrideKey = keyof HyperframesAutoPlanOverrideInput;

const baseAutoDefaultValues: Record<OverrideKey, string> =
  HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES;

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
    return overrideValueString(left[typedKey]) === overrideValueString(right[typedKey]);
  });
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
  videoSegmentPreview,
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
    videoStructure: thai ? "โครงสร้างวิดีโอ" : "Video structure",
    manualGroupSize: thai ? "กำหนดจำนวนช็อตต่อคลิป" : "Manual group size",
    creativeBrief: thai ? "แนวเรื่องหรือคำบรรยายเพิ่มเติม" : "Creative brief",
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
    videoStructureMode: labels.videoStructure,
    manualVideoGroupSize: labels.manualGroupSize,
    creativeBrief: labels.creativeBrief,
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
  const frameStrategyOptions = [
    {
      value: "storyboard_3x3_split",
      label: thai ? "ตาราง storyboard 3x3" : "3x3 storyboard grid",
    },
    {
      value: "video_shot_start_stop",
      label: thai ? "เฟรมเริ่ม/จบแต่ละช็อต" : "Start/stop frame pairs",
    },
  ] as const;
  const videoStructureOptions = [
    { value: "per_shot", label: thai ? "Per-shot: 1 ช็อตต่อ 1 วิดีโอ" : "Per-shot: 1 shot per video" },
    {
      value: "adaptive_multi_shot",
      label: thai ? "Multi-shot อัตโนมัติ: รวม sub-shot ตามโมเดล" : "Adaptive multi-shot: model groups sub-shots",
    },
    {
      value: "compact_multi_shot",
      label: thai ? "Compact multi-shot: รวมหลาย sub-shot ต่อวิดีโอ" : "Compact multi-shot: more sub-shots per video",
    },
    {
      value: "manual_group_size",
      label: thai ? "Manual multi-shot: กำหนด sub-shot ต่อวิดีโอ" : "Manual multi-shot: sub-shots per video",
    },
  ] as const;
  const manualGroupSizeOptions = ["2", "3", "4", "5", "6"].map(value => ({
    value,
    label: thai ? `${value} ช็อตต่อคลิป` : `${value} shots per clip`,
  }));
  const imageModelOptions = providedImageModelOptions?.length
    ? providedImageModelOptions
    : [
    {
      value: "google-nano-banana-pro",
      label: thai ? "Nano Banana Pro" : "Nano Banana Pro",
    },
    {
      value: "google-banana-2",
      label: thai ? "Banana 2" : "Banana 2",
    },
  ] as const;
  const videoModelOptions = providedVideoModelOptions?.length
    ? providedVideoModelOptions
    : [
    {
      value: "veo3/generate-veo-3-video-lite",
      label: thai ? "Veo 3 Lite" : "Veo 3 Lite",
    },
  ] as const;
  const defaultValueFor = (key: OverrideKey): string => baseAutoDefaultValues[key];
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
      next.shotCount =
        Number(nextValue) as HyperframesAutoPlanOverrideInput["shotCount"];
      if (key === "manualVideoGroupSize") {
        next.manualVideoGroupSize =
          Number(nextValue) as HyperframesAutoPlanOverrideInput["manualVideoGroupSize"];
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
  const labelClass =
    "text-xs font-semibold text-slate-500 dark:text-slate-400";
  const selectedVideoStructure = selectedValueFor("videoStructureMode");
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
          <Button type="button" variant="outline" size="sm" onClick={onResetToAuto}>
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
                onChange={event => update("platformPresetId", event.target.value)}
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
                onChange={event => update("overlayTextMode", event.target.value)}
              >
                {overlayTextModeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>{labels.creativeBrief}</span>
            <textarea
              aria-label={labels.creativeBrief}
              className={`${fieldClass} min-h-24 py-2`}
              value={selectedValueFor("creativeBrief")}
              onChange={event => update("creativeBrief", event.target.value)}
              placeholder={
                thai
                  ? "เช่น อยากได้แนวรีวิวอบอุ่น กระชับ เน้นผลลัพธ์จริง"
                  : "Example: warmer pacing, concise proof-first review, practical result emphasis"
              }
            />
          </label>
          {videoSegmentPreview ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-slate-700 dark:border-sky-900 dark:bg-sky-950 dark:text-slate-200">
              {videoSegmentPreview.loading ? (
                <p>{thai ? "กำลังดูตัวอย่างโครงสร้างวิดีโอ..." : "Loading video structure preview..."}</p>
              ) : videoSegmentPreview.error ? (
                <p className="text-rose-700 dark:text-rose-300">
                  {videoSegmentPreview.error}
                </p>
              ) : (
                <div className="space-y-1">
                  <p>
                    {thai ? "ตัวอย่างจากระบบ:" : "Backend preview:"}{" "}
                    {videoSegmentPreview.effectiveMode || selectedVideoStructure}
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
                          <li key={segment.segmentId ?? `${index}-${segment.shotIds.join("-")}`} className="text-slate-700 dark:text-slate-200">
                            {thai ? `วิดีโอ ${index + 1}: ` : `Video ${index + 1}: `}
                            {segment.shotIds.length > 1
                              ? (thai
                                  ? `รวม ${segment.shotIds.length} sub-shot`
                                  : `${segment.shotIds.length} sub-shots`)
                              : (thai ? "1 sub-shot" : "1 sub-shot")}
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
