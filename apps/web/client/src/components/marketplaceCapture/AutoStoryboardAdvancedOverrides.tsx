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
  };
  const describeFields = (fieldNames: string[]) =>
    fieldNames.map(field => fieldLabels[field] ?? field);
  const localOverrideFields = describeFields(Object.keys(effectiveValue));
  const serverOverrideFields = describeFields(fields);
  const platformPresetOptions = [
    { value: "", label: thai ? "ให้ระบบเลือกรูปแบบ" : "Auto format" },
    {
      value: "generic_vertical_9_16",
      label: thai ? "แนวตั้ง 9:16" : "Vertical 9:16",
    },
    { value: "tiktok_reels_shorts_9_16", label: "TikTok / Reels / Shorts" },
  ] as const;
  const qualityModeOptions = [
    { value: "", label: thai ? "ให้ระบบเลือกคุณภาพ" : "Auto quality" },
    { value: "fast", label: thai ? "ร่างเร็ว" : "Fast draft" },
    { value: "balanced", label: thai ? "สมดุล" : "Balanced" },
    { value: "high", label: thai ? "คุณภาพสูง QA" : "High QA" },
  ] as const;
  const audioStrategyOptions = [
    { value: "", label: thai ? "ให้ระบบเลือกเสียง" : "Auto audio" },
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
    { value: "", label: thai ? "ให้ระบบเลือกข้อความ" : "Auto text policy" },
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
    { value: "", label: thai ? "ให้ระบบเลือกจำนวนช็อต" : "Auto shot count" },
    { value: "7", label: thai ? "7 ช็อต" : "7 shots" },
    { value: "8", label: thai ? "8 ช็อต" : "8 shots" },
    { value: "9", label: thai ? "9 ช็อต" : "9 shots" },
  ] as const;
  const frameStrategyOptions = [
    { value: "", label: thai ? "ให้ระบบเลือกเฟรม" : "Auto frames" },
    {
      value: "storyboard_3x3_split",
      label: thai ? "ตาราง storyboard 3x3" : "3x3 storyboard grid",
    },
    {
      value: "video_shot_start_stop",
      label: thai ? "เฟรมเริ่ม/จบแต่ละช็อต" : "Start/stop frame pairs",
    },
  ] as const;
  const imageModelOptions = [
    { value: "", label: thai ? "ให้ระบบเลือกโมเดลภาพ" : "Auto image model" },
    {
      value: "google-nano-banana-pro",
      label: thai ? "Nano Banana Pro" : "Nano Banana Pro",
    },
    {
      value: "google-banana-2",
      label: thai ? "Banana 2" : "Banana 2",
    },
  ] as const;
  const defaultValueFor = (key: OverrideKey): string => {
    const defaults = plan?.defaults;
    if (!defaults) return "";
    if (key === "platformPresetId") return defaults.platformPreset.presetId;
    const value = defaults[key as keyof typeof defaults];
    return typeof value === "number" ? String(value) : String(value ?? "");
  };
  const update = (key: OverrideKey, nextValue: string) => {
    const next = { ...effectiveValue };
    if (
      !nextValue ||
      nextValue === defaultValueFor(key) ||
      nextValue === baseAutoDefaultValues[key]
    ) {
      delete next[key];
    } else if (key === "shotCount") {
      next.shotCount =
        Number(nextValue) as HyperframesAutoPlanOverrideInput["shotCount"];
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
                value={effectiveValue.platformPresetId ?? ""}
                onChange={event => update("platformPresetId", event.target.value)}
              >
                {platformPresetOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
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
                value={effectiveValue.qualityMode ?? ""}
                onChange={event => update("qualityMode", event.target.value)}
              >
                {qualityModeOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
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
                value={effectiveValue.audioStrategy ?? ""}
                onChange={event => update("audioStrategy", event.target.value)}
              >
                {audioStrategyOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
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
                value={effectiveValue.overlayTextMode ?? ""}
                onChange={event => update("overlayTextMode", event.target.value)}
              >
                {overlayTextModeOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
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
                value={effectiveValue.shotCount ? String(effectiveValue.shotCount) : ""}
                onChange={event => update("shotCount", event.target.value)}
              >
                {shotCountOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
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
                value={effectiveValue.frameStrategy ?? ""}
                onChange={event => update("frameStrategy", event.target.value)}
              >
                {frameStrategyOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
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
                value={effectiveValue.imageModel ?? ""}
                onChange={event => update("imageModel", event.target.value)}
              >
                {imageModelOptions.map(option => (
                  <option key={option.value || "auto"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
