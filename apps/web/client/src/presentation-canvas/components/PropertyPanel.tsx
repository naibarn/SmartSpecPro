import { useEffect, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LibraryFilePicker } from "@/components/library/LibraryFilePicker";
import type {
  PresentationMediaMotion,
  PresentationMediaMotionEasing,
  PresentationMediaMotionPreset,
  PresentationMediaMotionTimingMode,
  PresentationMediaShape,
} from "@shared/presentation/contracts";
import {
  DEFAULT_MEDIA_MOTION_DURATION_MS,
  DEFAULT_MEDIA_MOTION_EASING,
  DEFAULT_MEDIA_MOTION_INTENSITY,
  DEFAULT_MEDIA_MOTION_TIMING_MODE,
  PRESENTATION_MEDIA_MOTION_PRESET_OPTIONS as MEDIA_MOTION_PRESET_OPTIONS,
  normalizeMediaMotion,
  serializeMediaMotion,
} from "@shared/presentation/mediaMotion";
import { presentationMediaShapeRequiresSquare } from "@shared/presentation/mediaShape";
import type { PresentationElement, PresentationElementPatch, PresentationSlideBackground } from "@/lib/presentationEditorState";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
  Loader2,
  Sparkles,
  Upload,
  Type,
  ImageIcon,
  Video,
  RectangleHorizontal,
  Minus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyPanelProps {
  selectedElement: PresentationElement | null;
  selectedElementCount?: number;
  selectionHasMixedTypes?: boolean;
  onPatchSelected: (patch: PresentationElementPatch) => void;
  onPatchElementById?: (elementId: string, patch: PresentationElementPatch) => void;
  slideBackground?: PresentationSlideBackground;
  onSetSlideBackground?: (background: PresentationSlideBackground | undefined) => void;
  cropModeElementId?: string | null;
  cropModeTarget?: "content" | "frame";
  onToggleCropMode?: (elementId: string | null) => void;
  onSetCropModeTarget?: (target: "content" | "frame") => void;
}

interface TextPresetDefinition {
  id: string;
  label: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  ariaLabel: string;
  patch: PresentationElementPatch;
}

const TEXT_STYLE_PRESETS: TextPresetDefinition[] = [
  {
    id: "heading",
    label: "Heading",
    fontSize: 28,
    fontWeight: "700",
    fontStyle: "normal",
    ariaLabel: "Apply Heading Text Preset",
    patch: { fontSize: 64, fontWeight: "700", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.1, letterSpacing: 0, backgroundColor: "transparent" },
  },
  {
    id: "subheading",
    label: "Subheading",
    fontSize: 20,
    fontWeight: "600",
    fontStyle: "normal",
    ariaLabel: "Apply Subheading Text Preset",
    patch: { fontSize: 44, fontWeight: "600", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.2, letterSpacing: 0, backgroundColor: "transparent" },
  },
  {
    id: "body",
    label: "Body",
    fontSize: 14,
    fontWeight: "400",
    fontStyle: "normal",
    ariaLabel: "Apply Body Text Preset",
    patch: { fontSize: 32, fontWeight: "normal", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.5, letterSpacing: 0, backgroundColor: "transparent" },
  },
  {
    id: "caption",
    label: "Caption",
    fontSize: 11,
    fontWeight: "400",
    fontStyle: "italic",
    ariaLabel: "Apply Caption Text Preset",
    patch: { fontSize: 22, fontWeight: "normal", fontStyle: "italic", textDecoration: "none", textAlign: "left", lineHeight: 1.4, letterSpacing: 0.05, backgroundColor: "transparent" },
  },
  {
    id: "citation",
    label: "Citation",
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "italic",
    ariaLabel: "Apply Citation Text Preset",
    patch: { fontSize: 26, fontWeight: "500", fontStyle: "italic", textDecoration: "none", textAlign: "right", lineHeight: 1.3, letterSpacing: 0.1, backgroundColor: "transparent" },
  },
  {
    id: "overline",
    label: "OVERLINE",
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "normal",
    ariaLabel: "Apply Overline Text Preset",
    patch: { fontSize: 18, fontWeight: "700", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.3, letterSpacing: 2, backgroundColor: "transparent" },
  },
];

const FONT_FAMILIES = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Lora", value: "Lora, serif" },
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "DM Sans", value: "'DM Sans', sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
];

const FONT_WEIGHTS = [
  { label: "Normal", value: "normal" },
  { label: "Medium", value: "500" },
  { label: "SemiBold", value: "600" },
  { label: "Bold", value: "700" },
] as const;

interface MediaModelOption {
  id: string;
  name: string;
  provider?: string;
  configJson?: unknown;
}

interface ModelInputFieldOption {
  value: string | number | boolean;
  label: string;
}

type ModelInputSyncTarget = "none" | "reference_images" | "prompt" | "aspect_ratio";

interface ModelInputField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "library_file";
  options?: ModelInputFieldOption[];
  default?: unknown;
  required?: boolean;
  syncWith: ModelInputSyncTarget;
  affectsPricing?: boolean;
}

const COMMON_ASPECT_RATIOS = [
  { value: "16:9", decimal: 16 / 9 },
  { value: "9:16", decimal: 9 / 16 },
  { value: "4:3", decimal: 4 / 3 },
  { value: "3:4", decimal: 3 / 4 },
  { value: "4:5", decimal: 4 / 5 },
  { value: "5:4", decimal: 5 / 4 },
  { value: "1:1", decimal: 1 },
] as const;
const MAX_IMAGE_REFERENCES = 5;
const LIBRARY_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];
const LIBRARY_VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "avi", "mkv"];
const LIBRARY_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "flac", "ogg"];
const RETRY_AFTER_SECONDS_PATTERN = /retry after\s+(\d+)s/i;
const TASK_POLL_INTERVAL_MS = 2000;
const TASK_POLL_MAX_ATTEMPTS = 90;
const MEDIA_MOTION_EASING_OPTIONS: Array<{ value: PresentationMediaMotionEasing; label: string }> = [
  { value: "ease-in-out", label: "Ease In-Out" },
  { value: "linear", label: "Linear" },
];

const MEDIA_SHAPE_OPTIONS: Array<{ label: string; value: PresentationMediaShape }> = [
  { label: "Rectangle", value: "rect" },
  { label: "Rounded", value: "rounded" },
  { label: "Circle", value: "circle" },
  { label: "Ellipse", value: "ellipse" },
  { label: "Diamond", value: "diamond" },
  { label: "Star", value: "star" },
];
const MEDIA_MOTION_TIMING_OPTIONS: Array<{ value: PresentationMediaMotionTimingMode; label: string }> = [
  { value: "duration", label: "Custom Duration" },
  { value: "until-slide-end", label: "Until Slide Ends" },
];

function normalizeGenerateType(configJson: unknown): string | null {
  if (!configJson || typeof configJson !== "object") {
    return null;
  }
  const raw = (configJson as { generateType?: unknown }).generateType;
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isTextToImageModel(model: MediaModelOption): boolean {
  const generateType = normalizeGenerateType(model.configJson);
  if (!generateType) {
    return true;
  }
  return ["text-to-image", "text2image", "txt2img", "t2i"].includes(generateType);
}

function isTextToVideoModel(model: MediaModelOption): boolean {
  const generateType = normalizeGenerateType(model.configJson);
  if (!generateType) {
    return true;
  }
  return ["text-to-video", "text2video", "txt2video", "txt2vid", "t2v"].includes(generateType);
}

function parseModelInputFields(model: MediaModelOption | undefined): ModelInputField[] {
  if (!model?.configJson || typeof model.configJson !== "object") {
    return [];
  }
  const rawFields = Array.isArray((model.configJson as { inputFields?: unknown }).inputFields)
    ? ((model.configJson as { inputFields?: unknown }).inputFields as unknown[])
    : [];
  const parsed: ModelInputField[] = [];
  const inferSyncTarget = (
    key: string,
    type: ModelInputField["type"],
    explicit: ModelInputSyncTarget | null,
  ): ModelInputSyncTarget => {
    if (explicit) {
      return explicit;
    }
    if (type === "image_urls" || type === "video_urls" || type === "audio_urls") {
      return "reference_images";
    }
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (normalizedKey === "prompt" || normalizedKey.endsWith("prompt")) {
      return "prompt";
    }
    if (normalizedKey.includes("aspect") && normalizedKey.includes("ratio")) {
      return "aspect_ratio";
    }
    if (
      normalizedKey.includes("imageurls")
      || normalizedKey.includes("imageurl")
      || normalizedKey.includes("referenceimages")
      || normalizedKey.includes("referenceimage")
    ) {
      return "reference_images";
    }
    return "none";
  };
  for (const field of rawFields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const record = field as Record<string, unknown>;
    const rawKey = record.key;
    if (typeof rawKey !== "string" || rawKey.trim().length === 0) {
      continue;
    }
    const key = rawKey.trim();
    const rawType = typeof record.type === "string" ? record.type.trim() : "text";
    const type: ModelInputField["type"] = (
      rawType === "select"
      || rawType === "text"
      || rawType === "number"
      || rawType === "boolean"
      || rawType === "image_urls"
      || rawType === "video_urls"
      || rawType === "audio_urls"
      || rawType === "library_file"
    )
      ? rawType
      : "text";
    const rawSyncWith = typeof record.syncWith === "string" ? record.syncWith.trim() : "";
    const explicitSyncWith: ModelInputSyncTarget | null = (
      rawSyncWith === "none"
      || rawSyncWith === "reference_images"
      || rawSyncWith === "prompt"
      || rawSyncWith === "aspect_ratio"
    )
      ? rawSyncWith
      : null;
    const options = Array.isArray(record.options)
      ? (record.options as unknown[])
          .filter((entry): entry is ModelInputFieldOption => (
            Boolean(entry)
            && typeof entry === "object"
            && "value" in (entry as Record<string, unknown>)
            && "label" in (entry as Record<string, unknown>)
            && (typeof (entry as Record<string, unknown>).label === "string")
          ))
      : undefined;
    parsed.push({
      key,
      label: (typeof record.label === "string" && record.label.trim().length > 0) ? record.label.trim() : key,
      type,
      options,
      default: record.default,
      required: Boolean(record.required),
      syncWith: inferSyncTarget(key, type, explicitSyncWith),
      affectsPricing: Boolean(record.affectsPricing),
    });
  }
  return parsed;
}

function resolveClosestAspectRatio(width: number, height: number): string {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const ratio = safeWidth / safeHeight;
  let closest: (typeof COMMON_ASPECT_RATIOS)[number] = COMMON_ASPECT_RATIOS[0];
  let minDelta = Math.abs(ratio - closest.decimal);
  for (const candidate of COMMON_ASPECT_RATIOS) {
    const delta = Math.abs(ratio - candidate.decimal);
    if (delta < minDelta) {
      minDelta = delta;
      closest = candidate;
    }
  }
  return closest.value;
}

function parseAspectRatioValue(value: string): number | null {
  const parts = value.split(":").map((part) => Number.parseFloat(part));
  if (parts.length !== 2) {
    return null;
  }
  const [rawWidth, rawHeight] = parts;
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return null;
  }
  return rawWidth / rawHeight;
}

function calculateDimensionsForAspectRatio(
  currentWidth: number,
  currentHeight: number,
  aspectRatio: string,
): { width: number; height: number } | null {
  const decimalRatio = parseAspectRatioValue(aspectRatio);
  if (!decimalRatio) {
    return null;
  }
  const safeWidth = Math.max(1, Number.isFinite(currentWidth) ? currentWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(currentHeight) ? currentHeight : 1);
  const baseArea = Math.max(1, safeWidth * safeHeight);
  const nextWidth = Math.max(1, Math.round(Math.sqrt(baseArea * decimalRatio)));
  const nextHeight = Math.max(1, Math.round(nextWidth / decimalRatio));
  return {
    width: nextWidth,
    height: nextHeight,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function extractGeneratedImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const rawData = (payload as { data?: unknown }).data;
  if (!Array.isArray(rawData)) {
    return null;
  }
  for (const entry of rawData) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const url = (entry as { url?: unknown }).url;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }
  return null;
}

function extractTaskResultUrl(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const data = task as {
    resultUrl?: unknown;
    resultData?: unknown;
    data?: unknown;
  };
  if (typeof data.resultUrl === "string" && data.resultUrl.trim().length > 0) {
    return data.resultUrl.trim();
  }

  const fromValue = (value: unknown): string | null => {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed;
      }
      return null;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = fromValue(entry);
        if (found) {
          return found;
        }
      }
      return null;
    }
    if (typeof value !== "object") {
      return null;
    }
    const obj = value as Record<string, unknown>;
    const directKeys = ["url", "image_url", "imageUrl", "video_url", "videoUrl", "result_url", "resultUrl"];
    for (const key of directKeys) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        const trimmed = candidate.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return trimmed;
        }
      }
    }
    return null;
  };

  const resultData = data.resultData;
  if (resultData && typeof resultData === "object") {
    const resultDataObj = resultData as Record<string, unknown>;
    const candidates: unknown[] = [
      resultDataObj,
      resultDataObj.data,
      resultDataObj.response,
      resultDataObj.taskResult,
      resultDataObj.resultJson,
      resultDataObj.output,
      resultDataObj.kie_ai_response,
    ];
    if (typeof resultDataObj.resultJson === "string") {
      try {
        candidates.push(JSON.parse(resultDataObj.resultJson));
      } catch {
        // Ignore invalid JSON and keep other candidates.
      }
    }
    for (const candidate of candidates) {
      const found = fromValue(candidate);
      if (found) {
        return found;
      }
    }
  }

  return fromValue(data.data);
}

function normalizeTaskStatus(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const raw = (task as { status?: unknown }).status;
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function extractTaskFailureMessage(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const direct = (task as { errorMessage?: unknown }).errorMessage;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  const resultData = (task as { resultData?: unknown }).resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }
  const candidates = ["error", "errorMessage", "message", "detail", "failMsg"] as const;
  for (const key of candidates) {
    const value = (resultData as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

async function pollTaskUntilTerminal(
  taskId: string,
  fetchTask: (taskId: string) => Promise<unknown>,
  options?: {
    mediaLabel?: string;
  },
): Promise<unknown> {
  const mediaLabel = options?.mediaLabel ?? "Media";
  for (let attempt = 0; attempt < TASK_POLL_MAX_ATTEMPTS; attempt += 1) {
    const task = await fetchTask(taskId);
    const status = normalizeTaskStatus(task);
    if (status === "completed") {
      return task;
    }
    if (status === "failed" || status === "cancelled") {
      const errorMessage = extractTaskFailureMessage(task);
      throw new Error(errorMessage || `${mediaLabel} generation ${status}.`);
    }
    await sleepMs(TASK_POLL_INTERVAL_MS);
  }
  throw new Error(`${mediaLabel} generation timeout. Please try again.`);
}

function isAllowedReferenceUrl(value: string): boolean {
  return value.startsWith("/") || /^https?:\/\//i.test(value);
}

function normalizeReferenceUrls(urls: string[] | undefined): string[] {
  if (!Array.isArray(urls) || urls.length === 0) {
    return [];
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (typeof raw !== "string") {
      continue;
    }
    const value = raw.trim();
    if (!value || value.length > 2048 || !isAllowedReferenceUrl(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
    if (deduped.length >= MAX_IMAGE_REFERENCES) {
      break;
    }
  }
  return deduped;
}

function mergeExtraParams(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }
  return { ...base, ...override };
}

function buildDefaultExtraParamsForModel(model: MediaModelOption | undefined): Record<string, unknown> | undefined {
  const fields = parseModelInputFields(model);
  if (!fields.length) {
    return undefined;
  }
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      defaults[field.key] = field.default;
      continue;
    }
    if (field.required && field.type === "select" && field.options && field.options.length > 0) {
      defaults[field.key] = field.options[0]?.value;
    }
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

function pickExtraParamsForModel(
  model: MediaModelOption | undefined,
  current: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!model || !current) {
    return undefined;
  }
  const fieldKeys = new Set(parseModelInputFields(model).map((field) => field.key));
  if (fieldKeys.size === 0) {
    return undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (fieldKeys.has(key)) {
      next[key] = value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function applyModelSyncTargets(
  model: MediaModelOption | undefined,
  baseExtraParams: Record<string, unknown> | undefined,
  syncValues: {
    prompt?: string;
    aspectRatio?: string;
    referenceImageUrls?: string[];
  },
): Record<string, unknown> | undefined {
  const fields = parseModelInputFields(model);
  if (!fields.length) {
    return baseExtraParams;
  }
  const next: Record<string, unknown> = { ...(baseExtraParams ?? {}) };
  for (const field of fields) {
    const syncWith = field.syncWith;
    if (syncWith === "prompt" && syncValues.prompt) {
      next[field.key] = syncValues.prompt;
      continue;
    }
    if (syncWith === "aspect_ratio" && syncValues.aspectRatio) {
      next[field.key] = syncValues.aspectRatio;
      continue;
    }
    if (
      syncWith === "reference_images"
      && syncValues.referenceImageUrls
      && syncValues.referenceImageUrls.length > 0
    ) {
      next[field.key] = syncValues.referenceImageUrls;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function hasReferenceImageSyncField(model: MediaModelOption | undefined): boolean {
  return parseModelInputFields(model).some((field) => {
    return field.syncWith === "reference_images";
  });
}

function isMissingRequiredInputValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function getMissingRequiredModelFields(
  fields: ModelInputField[],
  values: {
    extraParams: Record<string, unknown> | undefined;
    prompt?: string;
    aspectRatio?: string;
    referenceImageUrls?: string[];
  },
): string[] {
  const missing: string[] = [];
  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    const syncWith = field.syncWith;
    let value: unknown;
    if (syncWith === "prompt") {
      value = values.prompt;
    } else if (syncWith === "aspect_ratio") {
      value = values.aspectRatio;
    } else if (syncWith === "reference_images") {
      value = values.referenceImageUrls;
    } else {
      value = values.extraParams?.[field.key];
      if (value === undefined) {
        value = field.default;
      }
      if (value === undefined && field.type === "select" && field.options && field.options.length > 0) {
        value = field.options[0]?.value;
      }
    }
    if (isMissingRequiredInputValue(value)) {
      missing.push(field.label);
    }
  }
  return missing;
}

function getErrorMessage(error: unknown, fallback = "Failed to regenerate media"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }
  return fallback;
}

function getRetryAfterSeconds(errorMessage: string): number | null {
  const match = RETRY_AFTER_SECONDS_PATTERN.exec(errorMessage);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getAllowedLibraryExtensionsForField(field: ModelInputField): string[] | undefined {
  if (field.type === "image_urls") {
    return LIBRARY_IMAGE_EXTENSIONS;
  }
  if (field.type === "video_urls") {
    return LIBRARY_VIDEO_EXTENSIONS;
  }
  if (field.type === "audio_urls") {
    return LIBRARY_AUDIO_EXTENSIONS;
  }
  return undefined;
}

function toColorInputValue(value: string, fallback: string): string {
  const candidate = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) return candidate;
  if (/^#[0-9a-fA-F]{3}$/.test(candidate)) {
    return `#${candidate.slice(1).split("").map((c) => `${c}${c}`).join("")}`;
  }
  return fallback;
}

interface ColorFieldProps {
  label: string;
  textAriaLabel: string;
  pickerAriaLabel: string;
  value: string;
  fallback: string;
  onChange: (next: string) => void;
}

function ColorField({ label, textAriaLabel, pickerAriaLabel, value, fallback, onChange }: ColorFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          aria-label={pickerAriaLabel}
          type="color"
          className="h-8 w-8 rounded-md border border-zinc-700 cursor-pointer shrink-0 p-0.5 bg-transparent"
          value={toColorInputValue(value, fallback)}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={textAriaLabel}
          className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">{label}</p>
      {children}
    </div>
  );
}

interface MediaMotionControlsProps {
  mediaLabel: string;
  motion: PresentationMediaMotion | undefined;
  onChange: (motion: PresentationMediaMotion | undefined) => void;
}

interface MediaMotionTemplateDefinition {
  id: string;
  label: string;
  description: string;
  motion: NonNullable<ReturnType<typeof serializeMediaMotion>>;
}

const MEDIA_MOTION_TEMPLATES: MediaMotionTemplateDefinition[] = [
  {
    id: "ken-burns-in",
    label: "Ken Burns In",
    description: "Slow zoom-in across the full slide.",
    motion: {
      intro: {
        preset: "zoom-in",
        intensity: 0.7,
        easing: "ease-in-out",
        timingMode: "until-slide-end",
        durationMs: DEFAULT_MEDIA_MOTION_DURATION_MS,
      },
    },
  },
  {
    id: "ken-burns-out",
    label: "Ken Burns Out",
    description: "Slow zoom-out across the full slide.",
    motion: {
      intro: {
        preset: "zoom-out",
        intensity: 0.65,
        easing: "ease-in-out",
        timingMode: "until-slide-end",
        durationMs: DEFAULT_MEDIA_MOTION_DURATION_MS,
      },
    },
  },
  {
    id: "hold-then-exit",
    label: "Hold then Exit",
    description: "Hold the shot, then drift out near the end.",
    motion: {
      outro: {
        preset: "pan-left",
        intensity: 1,
        easing: "ease-in-out",
        timingMode: "duration",
        durationMs: 1500,
      },
    },
  },
];

function MediaMotionPhaseControls({
  mediaLabel,
  phaseLabel,
  description,
  effectAriaLabel,
  intensityAriaLabel,
  easingAriaLabel,
  timingAriaLabel,
  durationAriaLabel,
  normalizedMotion,
  onChange,
}: {
  mediaLabel: string;
  phaseLabel: string;
  description: string;
  effectAriaLabel: string;
  intensityAriaLabel: string;
  easingAriaLabel: string;
  timingAriaLabel: string;
  durationAriaLabel: string;
  normalizedMotion: ReturnType<typeof normalizeMediaMotion>["intro"];
  onChange: (patch: Partial<ReturnType<typeof normalizeMediaMotion>["intro"]>) => void;
}) {
  const hasActiveMotion = normalizedMotion.preset !== "none";
  const durationSeconds = (normalizedMotion.durationMs / 1000).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-200">{phaseLabel}</span>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">{hasActiveMotion ? "Active" : "Off"}</span>
        </div>
        <p className="text-[10px] text-zinc-500">{description}</p>
      </div>

      <div className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400">Effect</span>
          <select
            aria-label={effectAriaLabel}
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={normalizedMotion.preset}
            onChange={(event) => onChange({
              preset: event.target.value as PresentationMediaMotionPreset,
            })}
          >
            {MEDIA_MOTION_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>Intensity</span>
            <span className="tabular-nums">{Math.round(normalizedMotion.intensity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            aria-label={intensityAriaLabel}
            className="w-full accent-blue-500"
            disabled={!hasActiveMotion}
            value={normalizedMotion.intensity}
            onChange={(event) => onChange({
              intensity: clampNumber(
                parseNumberInput(event.target.value, normalizedMotion.intensity),
                0,
                1,
              ),
            })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400">Easing</span>
          <select
            aria-label={easingAriaLabel}
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={normalizedMotion.easing ?? DEFAULT_MEDIA_MOTION_EASING}
            disabled={!hasActiveMotion}
            onChange={(event) => onChange({
              easing: event.target.value as PresentationMediaMotionEasing,
            })}
          >
            {MEDIA_MOTION_EASING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-400">Timing</span>
          <select
            aria-label={timingAriaLabel}
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={normalizedMotion.timingMode ?? DEFAULT_MEDIA_MOTION_TIMING_MODE}
            disabled={!hasActiveMotion}
            onChange={(event) => onChange({
              timingMode: event.target.value as PresentationMediaMotionTimingMode,
            })}
          >
            {MEDIA_MOTION_TIMING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {normalizedMotion.timingMode === "duration" ? (
          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Duration</span>
              <span className="tabular-nums">{durationSeconds}s</span>
            </div>
            <Input
              aria-label={durationAriaLabel}
              type="number"
              min={0.25}
              max={120}
              step={0.1}
              disabled={!hasActiveMotion}
              value={durationSeconds}
              onChange={(event) => onChange({
                durationMs: Math.round(
                  clampNumber(
                    parseNumberInput(event.target.value, normalizedMotion.durationMs / 1000),
                    0.25,
                    120,
                  ) * 1000,
                ),
              })}
              className="h-8 bg-zinc-800 border-zinc-700 text-xs text-zinc-100"
            />
          </label>
        ) : (
          <p className="text-[10px] text-zinc-500">
            {phaseLabel === "At Slide Start"
              ? `${mediaLabel} starts moving immediately and keeps progressing until the slide ends.`
              : `${mediaLabel} keeps this ending motion active across the slide and lands on its final frame at the end.`}
          </p>
        )}
      </div>
    </div>
  );
}

function MediaMotionControls({
  mediaLabel,
  motion,
  onChange,
}: MediaMotionControlsProps) {
  const normalizedMotion = normalizeMediaMotion(motion);
  const hasAnyActiveMotion = normalizedMotion.intro.preset !== "none" || normalizedMotion.outro.preset !== "none";

  const updatePhase = (
    phase: "intro" | "outro",
    patch: Partial<typeof normalizedMotion.intro>,
  ) => {
    const next = {
      ...normalizedMotion,
      [phase]: {
        ...normalizedMotion[phase],
        ...patch,
        timingMode: patch.timingMode ?? normalizedMotion[phase].timingMode ?? DEFAULT_MEDIA_MOTION_TIMING_MODE,
        durationMs: patch.durationMs ?? normalizedMotion[phase].durationMs ?? DEFAULT_MEDIA_MOTION_DURATION_MS,
        intensity: patch.intensity ?? normalizedMotion[phase].intensity ?? DEFAULT_MEDIA_MOTION_INTENSITY,
        easing: patch.easing ?? normalizedMotion[phase].easing ?? DEFAULT_MEDIA_MOTION_EASING,
      },
    };
    onChange(serializeMediaMotion(next));
  };

  return (
    <Section label="Motion">
      <div className="space-y-2">
        <span className="text-[10px] text-zinc-400">Motion Presets</span>
        <div className="grid grid-cols-1 gap-2">
          {MEDIA_MOTION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left transition hover:border-zinc-700 hover:bg-zinc-800/80"
              onClick={() => onChange(template.motion)}
              aria-label={`Apply ${mediaLabel} ${template.label} Motion Preset`}
            >
              <span className="block text-xs font-medium text-zinc-200">{template.label}</span>
              <span className="block text-[10px] text-zinc-500">{template.description}</span>
            </button>
          ))}
        </div>
      </div>

      <MediaMotionPhaseControls
        mediaLabel={mediaLabel}
        phaseLabel="At Slide Start"
        description="Runs from the beginning of the slide."
        effectAriaLabel={`${mediaLabel} Motion Effect`}
        intensityAriaLabel={`${mediaLabel} Motion Intensity`}
        easingAriaLabel={`${mediaLabel} Motion Easing`}
        timingAriaLabel={`${mediaLabel} Motion Timing`}
        durationAriaLabel={`${mediaLabel} Motion Duration Seconds`}
        normalizedMotion={normalizedMotion.intro}
        onChange={(patch) => updatePhase("intro", patch)}
      />

      <MediaMotionPhaseControls
        mediaLabel={mediaLabel}
        phaseLabel="Before Slide Ends"
        description="Runs near the end of the slide or can keep evolving until the final frame."
        effectAriaLabel={`${mediaLabel} Outro Motion Effect`}
        intensityAriaLabel={`${mediaLabel} Outro Motion Intensity`}
        easingAriaLabel={`${mediaLabel} Outro Motion Easing`}
        timingAriaLabel={`${mediaLabel} Outro Motion Timing`}
        durationAriaLabel={`${mediaLabel} Outro Motion Duration Seconds`}
        normalizedMotion={normalizedMotion.outro}
        onChange={(patch) => updatePhase("outro", patch)}
      />

      <div className="flex gap-1.5">
        <button
          type="button"
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          onClick={() => onChange(undefined)}
        >
          Clear Motion
        </button>
      </div>

      <span className="text-[10px] text-zinc-500">
        {hasAnyActiveMotion
          ? `${mediaLabel} keeps its base crop while intro and outro motion animate during slideshow preview, Play Mode, and MP4 export.`
          : "Select an effect to animate this media during slideshow preview and MP4 export."}
      </span>
    </Section>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all",
        active
          ? "bg-blue-600 text-white shadow-sm shadow-blue-900"
          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

export function PropertyPanel({
  selectedElement,
  selectedElementCount = 0,
  selectionHasMixedTypes = false,
  onPatchSelected,
  onPatchElementById,
  slideBackground,
  onSetSlideBackground,
  cropModeElementId = null,
  cropModeTarget = "content",
  onToggleCropMode,
  onSetCropModeTarget,
}: PropertyPanelProps) {
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [weightDropdownOpen, setWeightDropdownOpen] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isRegeneratingVideo, setIsRegeneratingVideo] = useState(false);
  const [showAdvancedModelInputs, setShowAdvancedModelInputs] = useState(false);
  const [modelInputOptionSearchTerms, setModelInputOptionSearchTerms] = useState<Record<string, string>>({});
  const [bgTab, setBgTab] = useState<"none" | "color" | "image">(() => slideBackground?.type ?? "none");
  const [bgSearch, setBgSearch] = useState("");
  const trpcUtils = trpc.useUtils();
  const imageModelsQuery = trpc.media.getModels.useQuery(
    { type: "image" },
    { staleTime: 300_000 },
  );
  const videoModelsQuery = trpc.media.getModels.useQuery(
    { type: "video" },
    { staleTime: 300_000 },
  );
  const generateImageAsyncMutation = trpc.media.generateImageAsync.useMutation();
  const generateVideoAsyncMutation = trpc.media.generateVideoAsync.useMutation();
  const uploadReferenceMutation = trpc.ai.upload.useMutation();
  const bgImageListQuery = trpc.library.listDocuments.useQuery(
    { filters: { itemType: "image" }, limit: 30 },
    { enabled: !selectedElement && bgTab === "image" && bgSearch.trim().length === 0, staleTime: 60_000 },
  );
  const bgImageSearchQuery = trpc.library.search.useQuery(
    { query: bgSearch.trim(), filters: { itemType: "image" }, limit: 30 },
    { enabled: !selectedElement && bgTab === "image" && bgSearch.trim().length > 0, staleTime: 30_000 },
  );

  const imageModels = (imageModelsQuery.data?.models ?? []) as MediaModelOption[];
  const videoModels = (videoModelsQuery.data?.models ?? []) as MediaModelOption[];
  const compatibleImageModels = imageModels.filter(isTextToImageModel);
  const compatibleVideoModels = videoModels.filter(isTextToVideoModel);
  const displayVideoModels = compatibleVideoModels.length > 0 ? compatibleVideoModels : videoModels;
  const defaultImageModelId = compatibleImageModels[0]?.id
    || imageModelsQuery.data?.defaults?.image
    || "";
  const defaultVideoModelId = displayVideoModels[0]?.id
    || videoModelsQuery.data?.defaults?.video
    || "";
  const selectedImageModelId = selectedElement?.type === "image"
    ? selectedElement.imageModelId?.trim() || defaultImageModelId
    : defaultImageModelId;
  const selectedVideoModelId = selectedElement?.type === "video"
    ? selectedElement.videoModelId?.trim() || defaultVideoModelId
    : defaultVideoModelId;
  const selectedImageModel = imageModels.find((model) => model.id === selectedImageModelId);
  const selectedVideoModel = videoModels.find((model) => model.id === selectedVideoModelId);
  const selectedImageModelSupportsReferenceSync = hasReferenceImageSyncField(selectedImageModel);
  const selectedVideoModelSupportsReferenceSync = hasReferenceImageSyncField(selectedVideoModel);
  const cropModeActive = Boolean(
    selectedElement
    && (selectedElement.type === "image" || selectedElement.type === "video")
    && cropModeElementId === selectedElement.id,
  );

  useEffect(() => {
    setModelInputOptionSearchTerms({});
  }, [selectedImageModelId, selectedVideoModelId]);

  useEffect(() => {
    setShowAdvancedModelInputs(false);
  }, [selectedElement?.id, selectedElement?.type]);

  const patchImageElementById = (elementId: string, patch: PresentationElementPatch) => {
    if (onPatchElementById) {
      onPatchElementById(elementId, patch);
      return;
    }
    onPatchSelected(patch);
  };

  const getSelectedElementExtraParams = (): Record<string, unknown> => {
    if (!selectedElement) {
      return {};
    }
    if (selectedElement.type === "image") {
      return (selectedElement.imageExtraParams as Record<string, unknown> | undefined) ?? {};
    }
    if (selectedElement.type === "video") {
      return (selectedElement.videoExtraParams as Record<string, unknown> | undefined) ?? {};
    }
    return {};
  };

  const updateSelectedElementExtraParams = (key: string, value: unknown) => {
    if (!selectedElement) {
      return;
    }
    const current = getSelectedElementExtraParams();
    const next: Record<string, unknown> = { ...current };
    if (value === undefined || value === null || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
    if (selectedElement.type === "image") {
      onPatchSelected({
        imageExtraParams: next,
      } as PresentationElementPatch);
      return;
    }
    if (selectedElement.type === "video") {
      onPatchSelected({
        videoExtraParams: next,
      } as PresentationElementPatch);
    }
  };

  const handleApplyAspectRatioToSelectedMedia = (aspectRatio: string) => {
    if (!selectedElement || (selectedElement.type !== "image" && selectedElement.type !== "video")) {
      return;
    }
    const nextDimensions = calculateDimensionsForAspectRatio(
      selectedElement.width,
      selectedElement.height,
      aspectRatio,
    );
    if (!nextDimensions) {
      return;
    }
    if (presentationMediaShapeRequiresSquare(selectedElement.mediaShape)) {
      const size = Math.max(nextDimensions.width, nextDimensions.height);
      onPatchSelected({
        width: size,
        height: size,
      } as PresentationElementPatch);
      return;
    }
    onPatchSelected(nextDimensions as PresentationElementPatch);
  };

  const handleAppendImageReferences = (incomingUrls: string[]) => {
    if (!selectedElement || selectedElement.type !== "image") {
      return;
    }
    const nextReferences = normalizeReferenceUrls([
      ...(selectedElement.imageReferenceUrls ?? []),
      ...incomingUrls,
    ]);
    onPatchSelected({
      imageReferenceUrls: nextReferences,
    } as PresentationElementPatch);
  };

  const handleAppendVideoReferences = (incomingUrls: string[]) => {
    if (!selectedElement || selectedElement.type !== "video") {
      return;
    }
    const nextReferences = normalizeReferenceUrls([
      ...(selectedElement.videoReferenceUrls ?? []),
      ...incomingUrls,
    ]);
    onPatchSelected({
      videoReferenceUrls: nextReferences,
    } as PresentationElementPatch);
  };

  const handleUseCurrentImageAsReference = () => {
    if (!selectedElement || selectedElement.type !== "image" || (selectedElement as any).svgContent) {
      return;
    }
    const currentSource = (selectedElement.src ?? "").trim();
    if (!currentSource) {
      toast.error("Current image has no source URL to use as reference.");
      return;
    }
    if (!isAllowedReferenceUrl(currentSource)) {
      toast.error("Current image URL is not a valid reference URL.");
      return;
    }
    handleAppendImageReferences([currentSource]);
    toast.success("Current image added to references.");
  };

  const handleAddImageReferenceFromLibrary = (url: string) => {
    const normalized = url.trim();
    if (!normalized) {
      return;
    }
    handleAppendImageReferences([normalized]);
  };

  const handleAddVideoReferenceFromLibrary = (url: string) => {
    const normalized = url.trim();
    if (!normalized) {
      return;
    }
    handleAppendVideoReferences([normalized]);
  };

  const handleRemoveImageReference = (url: string) => {
    if (!selectedElement || selectedElement.type !== "image") {
      return;
    }
    const nextReferences = normalizeReferenceUrls(
      (selectedElement.imageReferenceUrls ?? []).filter((item) => item !== url),
    );
    onPatchSelected({
      imageReferenceUrls: nextReferences,
    } as PresentationElementPatch);
  };

  const handleClearImageReferences = () => {
    if (!selectedElement || selectedElement.type !== "image") {
      return;
    }
    onPatchSelected({
      imageReferenceUrls: [],
    } as PresentationElementPatch);
  };

  const handleRemoveVideoReference = (url: string) => {
    if (!selectedElement || selectedElement.type !== "video") {
      return;
    }
    const nextReferences = normalizeReferenceUrls(
      (selectedElement.videoReferenceUrls ?? []).filter((item) => item !== url),
    );
    onPatchSelected({
      videoReferenceUrls: nextReferences,
    } as PresentationElementPatch);
  };

  const handleClearVideoReferences = () => {
    if (!selectedElement || selectedElement.type !== "video") {
      return;
    }
    onPatchSelected({
      videoReferenceUrls: [],
    } as PresentationElementPatch);
  };

  const handleReferenceFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    target: "image" | "video",
  ) => {
    const files = event.target.files;
    event.target.value = "";
    if (!selectedElement || selectedElement.type !== target || !files || files.length === 0) {
      return;
    }

    let currentReferences: string[];
    if (target === "image") {
      currentReferences = normalizeReferenceUrls(
        (selectedElement as Extract<PresentationElement, { type: "image" }>).imageReferenceUrls,
      );
    } else {
      currentReferences = normalizeReferenceUrls(
        (selectedElement as Extract<PresentationElement, { type: "video" }>).videoReferenceUrls,
      );
    }
    const remainingSlots = Math.max(0, MAX_IMAGE_REFERENCES - currentReferences.length);
    if (remainingSlots === 0) {
      toast.error("Maximum 5 reference images");
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const uploadedUrls: string[] = [];
    for (const file of filesToUpload) {
      if (!file.type.startsWith("image/")) {
        toast.error(`Unsupported file type for ${file.name}`);
        continue;
      }
      try {
        const fileBase64 = await readFileAsDataUrl(file);
        const result = await uploadReferenceMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64,
        });
        const uploadedUrl = String(result.url || "").trim();
        if (uploadedUrl) {
          uploadedUrls.push(uploadedUrl);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `Upload failed (${file.name}): ${error.message}`
            : `Upload failed (${file.name})`,
        );
      }
    }

    if (uploadedUrls.length === 0) {
      return;
    }
    if (target === "image") {
      handleAppendImageReferences(uploadedUrls);
      return;
    }
    handleAppendVideoReferences(uploadedUrls);
  };

  const handleRegenerateImage = async () => {
    if (!selectedElement || selectedElement.type !== "image" || (selectedElement as any).svgContent) {
      return;
    }
    if (isRegeneratingImage) {
      return;
    }
    const imagePrompt = (selectedElement.imagePrompt ?? "").trim();
    if (!imagePrompt) {
      toast.error("Please enter an image prompt before regenerating.");
      return;
    }
    const targetElementId = selectedElement.id;
    const requestedModel = selectedElement.imageModelId?.trim() || undefined;
    const aspectRatio = resolveClosestAspectRatio(selectedElement.width, selectedElement.height);
    const referenceImageUrls = normalizeReferenceUrls(selectedElement.imageReferenceUrls);
    const modelForRequest = imageModels.find((model) => model.id === (requestedModel || defaultImageModelId));
    const storedExtraParams = (selectedElement.imageExtraParams as Record<string, unknown> | undefined);
    const mergedExtraParams = mergeExtraParams(
      buildDefaultExtraParamsForModel(modelForRequest),
      storedExtraParams,
    );
    const syncedExtraParams = applyModelSyncTargets(
      modelForRequest,
      mergedExtraParams,
      {
        prompt: imagePrompt,
        aspectRatio,
        referenceImageUrls,
      },
    );
    const modelInputFields = parseModelInputFields(modelForRequest);
    const missingRequiredFields = getMissingRequiredModelFields(modelInputFields, {
      extraParams: syncedExtraParams,
      prompt: imagePrompt,
      aspectRatio,
      referenceImageUrls,
    });
    if (missingRequiredFields.length > 0) {
      toast.error(`Please fill required model inputs: ${missingRequiredFields.join(", ")}`);
      return;
    }
    const requestPayload = {
      prompt: imagePrompt,
      model: requestedModel,
      aspectRatio,
      numImages: 1 as const,
      ...(referenceImageUrls.length > 0 ? { referenceImageUrls } : {}),
      ...(syncedExtraParams ? { extraParams: syncedExtraParams } : {}),
    };
    try {
      setIsRegeneratingImage(true);
      let taskResult;
      try {
        taskResult = await generateImageAsyncMutation.mutateAsync(requestPayload);
      } catch (initialError) {
        const initialMessage = getErrorMessage(initialError, "Failed to regenerate image");
        const retryAfterSeconds = getRetryAfterSeconds(initialMessage);
        const isBurstAnomalyError = initialMessage.toLowerCase().includes("burst_anomaly");
        if (!isBurstAnomalyError || !retryAfterSeconds) {
          throw initialError;
        }
        toast.info(`Rate limit reached, retrying in ${retryAfterSeconds}s...`);
        await sleepMs((retryAfterSeconds + 1) * 1000);
        taskResult = await generateImageAsyncMutation.mutateAsync(requestPayload);
      }
      let generatedUrl =
        extractTaskResultUrl(taskResult)
        || extractGeneratedImageUrl(taskResult);
      if (!generatedUrl) {
        const createdTaskId = (taskResult as { id?: unknown; taskId?: unknown }).id;
        const taskId = typeof createdTaskId === "string" && createdTaskId.trim().length > 0
          ? createdTaskId.trim()
          : null;
        if (!taskId) {
          throw new Error("Image generation started but task ID was not returned.");
        }
        const terminalTask = await pollTaskUntilTerminal(
          taskId,
          async (id) => trpcUtils.media.getTask.fetch({ taskId: id }),
          { mediaLabel: "Image" },
        );
        generatedUrl = extractTaskResultUrl(terminalTask);
      }
      if (!generatedUrl) {
        throw new Error("Image provider returned no URL");
      }
      patchImageElementById(targetElementId, {
        src: generatedUrl,
        imagePrompt,
        imageModelId: requestedModel ?? (taskResult as { model?: string }).model ?? undefined,
        ...(referenceImageUrls.length > 0 ? { imageReferenceUrls: referenceImageUrls } : {}),
        ...(syncedExtraParams ? { imageExtraParams: syncedExtraParams } : {}),
      } as PresentationElementPatch);
      toast.success("Image regenerated and replaced.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to regenerate image"));
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  const handleRegenerateVideo = async () => {
    if (!selectedElement || selectedElement.type !== "video") {
      return;
    }
    if (isRegeneratingVideo) {
      return;
    }
    const videoPrompt = (selectedElement.videoPrompt ?? "").trim();
    if (!videoPrompt) {
      toast.error("Please enter a video prompt before regenerating.");
      return;
    }

    const targetElementId = selectedElement.id;
    const requestedModel = selectedElement.videoModelId?.trim() || undefined;
    const aspectRatio = resolveClosestAspectRatio(selectedElement.width, selectedElement.height);
    const referenceImageUrls = normalizeReferenceUrls(selectedElement.videoReferenceUrls);
    const modelForRequest = videoModels.find((model) => model.id === (requestedModel || defaultVideoModelId));
    const storedExtraParams = (selectedElement.videoExtraParams as Record<string, unknown> | undefined);
    const mergedExtraParams = mergeExtraParams(
      buildDefaultExtraParamsForModel(modelForRequest),
      storedExtraParams,
    );
    const syncedExtraParams = applyModelSyncTargets(
      modelForRequest,
      mergedExtraParams,
      {
        prompt: videoPrompt,
        aspectRatio,
        referenceImageUrls,
      },
    );
    const modelInputFields = parseModelInputFields(modelForRequest);
    const missingRequiredFields = getMissingRequiredModelFields(modelInputFields, {
      extraParams: syncedExtraParams,
      prompt: videoPrompt,
      aspectRatio,
      referenceImageUrls,
    });
    if (missingRequiredFields.length > 0) {
      toast.error(`Please fill required model inputs: ${missingRequiredFields.join(", ")}`);
      return;
    }

    const normalizedDuration = (() => {
      const raw = syncedExtraParams?.duration;
      const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return undefined;
      }
      return Math.min(60, Math.max(1, Math.round(parsed)));
    })();
    const normalizedResolution = (() => {
      const raw = syncedExtraParams?.resolution;
      if (typeof raw !== "string") {
        return undefined;
      }
      const value = raw.trim();
      return value.length > 0 ? value : undefined;
    })();

    const requestPayload = {
      prompt: videoPrompt,
      model: requestedModel,
      aspectRatio,
      ...(referenceImageUrls.length > 0 ? { referenceImageUrls } : {}),
      ...(normalizedDuration ? { duration: normalizedDuration } : {}),
      ...(normalizedResolution ? { resolution: normalizedResolution } : {}),
      ...(syncedExtraParams ? { extraParams: syncedExtraParams } : {}),
    };

    try {
      setIsRegeneratingVideo(true);
      let taskResult;
      try {
        taskResult = await generateVideoAsyncMutation.mutateAsync(requestPayload);
      } catch (initialError) {
        const initialMessage = getErrorMessage(initialError, "Failed to regenerate video");
        const retryAfterSeconds = getRetryAfterSeconds(initialMessage);
        const isBurstAnomalyError = initialMessage.toLowerCase().includes("burst_anomaly");
        if (!isBurstAnomalyError || !retryAfterSeconds) {
          throw initialError;
        }
        toast.info(`Rate limit reached, retrying in ${retryAfterSeconds}s...`);
        await sleepMs((retryAfterSeconds + 1) * 1000);
        taskResult = await generateVideoAsyncMutation.mutateAsync(requestPayload);
      }

      let generatedUrl = extractTaskResultUrl(taskResult);
      if (!generatedUrl) {
        const createdTaskId = (taskResult as { id?: unknown; taskId?: unknown }).id;
        const taskId = typeof createdTaskId === "string" && createdTaskId.trim().length > 0
          ? createdTaskId.trim()
          : null;
        if (!taskId) {
          throw new Error("Video generation started but task ID was not returned.");
        }
        const terminalTask = await pollTaskUntilTerminal(
          taskId,
          async (id) => trpcUtils.media.getTask.fetch({ taskId: id }),
          { mediaLabel: "Video" },
        );
        generatedUrl = extractTaskResultUrl(terminalTask);
      }
      if (!generatedUrl) {
        throw new Error("Video provider returned no URL");
      }
      patchImageElementById(targetElementId, {
        src: generatedUrl,
        videoPrompt,
        videoModelId: requestedModel ?? (taskResult as { model?: string }).model ?? undefined,
        ...(referenceImageUrls.length > 0 ? { videoReferenceUrls: referenceImageUrls } : {}),
        ...(syncedExtraParams ? { videoExtraParams: syncedExtraParams } : {}),
      } as PresentationElementPatch);
      toast.success("Video regenerated and replaced.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to regenerate video"));
    } finally {
      setIsRegeneratingVideo(false);
    }
  };

  if (!selectedElement) {
    const rawBgItems: Array<{ source_url?: string | null; thumbnail_url?: string | null; title?: string | null; id?: number; item_id?: number }> = bgSearch.trim().length > 0
      ? ((bgImageSearchQuery.data?.results ?? []) as Array<{ source_url?: string | null; thumbnail_url?: string | null; title?: string | null; item_id?: number }>)
      : ((bgImageListQuery.data?.results ?? []) as Array<{ source_url?: string | null; thumbnail_url?: string | null; title?: string | null; id?: number }>);
    const bgLoading = bgSearch.trim().length > 0
      ? bgImageSearchQuery.isLoading
      : bgImageListQuery.isLoading;

    const COLOR_PRESETS = [
      "#ffffff", "#f1f5f9", "#e2e8f0", "#cbd5e1",
      "#1e293b", "#0f172a", "#1e3a5f", "#312e81",
      "#0d4f3c", "#166534", "#7f1d1d", "#78350f",
    ];

    return (
      <div className="space-y-4 text-sm p-1" data-testid="canvas-background-panel">
        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium">Slide Background</span>

        {/* Mode tabs: None / Color / Image */}
        <div className="flex gap-1 rounded-md bg-zinc-900 p-1">
          {(["none", "color", "image"] as const).map((mode) => (
            <button
              key={mode}
              className={cn(
                "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors capitalize",
                bgTab === mode ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
              )}
              onClick={() => {
                if (mode === "none") {
                  setBgTab("none");
                  onSetSlideBackground?.(undefined);
                } else if (mode === "color") {
                  setBgTab("color");
                  onSetSlideBackground?.({
                    type: "color",
                    value: slideBackground?.type === "color" ? slideBackground.value : "#ffffff",
                  });
                } else {
                  setBgTab("image");
                  // Don't call onSetSlideBackground yet — user needs to pick an image
                }
              }}
            >
              {mode === "none" ? "None" : mode === "color" ? "Color" : "Image"}
            </button>
          ))}
        </div>

        {/* Color panel */}
        {bgTab === "color" && (
          <div className="space-y-3">
            <ColorField
              label="Background Color"
              textAriaLabel="Slide background color"
              pickerAriaLabel="Slide background color picker"
              value={slideBackground?.type === "color" ? slideBackground.value : "#ffffff"}
              fallback="#ffffff"
              onChange={(v) => onSetSlideBackground?.({ type: "color", value: v })}
            />
            <div>
              <span className="text-[10px] text-zinc-500 mb-1.5 block">Presets</span>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    aria-label={`Set background to ${color}`}
                    title={color}
                    className="h-6 w-6 rounded border border-zinc-600 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      outline: slideBackground?.type === "color" && slideBackground.value === color
                        ? "2px solid #38bdf8"
                        : "2px solid transparent",
                      outlineOffset: "2px",
                    }}
                    onClick={() => onSetSlideBackground?.({ type: "color", value: color })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Image panel */}
        {bgTab === "image" && (
          <div className="space-y-2">
            {/* Current background image preview */}
            {slideBackground?.type === "image" && (
              <div className="relative rounded-md overflow-hidden border border-zinc-600" style={{ height: "64px" }}>
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${slideBackground.url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <button
                  className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-black/80"
                  onClick={() => {
                    onSetSlideBackground?.(undefined);
                    setBgTab("none");
                  }}
                >
                  Remove
                </button>
              </div>
            )}

            {/* Search input */}
            <input
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Search library images..."
              value={bgSearch}
              onChange={(e) => setBgSearch(e.target.value)}
            />

            {/* Loading */}
            {bgLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              </div>
            )}

            {/* Empty state */}
            {!bgLoading && rawBgItems.length === 0 && (
              <p className="text-center text-xs text-zinc-500 py-3">
                {bgSearch.trim() ? "No images found" : "No images in library"}
              </p>
            )}

            {/* Image grid */}
            {!bgLoading && rawBgItems.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                {rawBgItems.map((item) => {
                  const itemUrl = String(item.source_url || "").trim();
                  const thumbUrl = String(item.thumbnail_url || item.source_url || "").trim();
                  const itemId = Number(item.id ?? item.item_id ?? 0);
                  if (!itemUrl) return null;
                  const isActive = slideBackground?.type === "image" && slideBackground.url === itemUrl;
                  const itemTitle = String(item.title || "image");
                  return (
                    <button
                      key={itemId || itemUrl}
                      aria-label={`Set background to ${itemTitle}`}
                      title={itemTitle}
                      className={cn(
                        "relative aspect-video overflow-hidden rounded border-2 transition-colors",
                        isActive ? "border-blue-400" : "border-zinc-700 hover:border-zinc-500",
                      )}
                      onClick={() =>
                        onSetSlideBackground?.({
                          type: "image",
                          url: itemUrl,
                          ...(Number.isFinite(itemId) && itemId > 0 ? { libraryItemId: itemId } : {}),
                        })
                      }
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={String(item.title || "")}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-zinc-700 flex items-center justify-center">
                          <span className="text-[10px] text-zinc-400">IMG</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Text-element specific derived values (safe to compute; guarded by type check below)
  const textEl = selectedElement.type === "text" ? selectedElement : null;
  const isMultiSelection = selectedElementCount > 1;
  const isMixedTypeSelection = isMultiSelection && selectionHasMixedTypes;
  const currentFont = textEl?.fontFamily ?? "Inter, system-ui, sans-serif";
  const currentWeight = textEl?.fontWeight ?? "600";
  const currentFontLabel = FONT_FAMILIES.find((f) => f.value === currentFont)?.label ?? currentFont.split(",")[0];
  const currentWeightLabel = FONT_WEIGHTS.find((w) => w.value === currentWeight)?.label ?? currentWeight;
  const selectedImageInputFields = parseModelInputFields(selectedImageModel);
  const selectedVideoInputFields = parseModelInputFields(selectedVideoModel);

  const renderDynamicModelInputFields = (
    model: MediaModelOption | undefined,
    fields: ModelInputField[],
    options: {
      prompt: string;
      aspectRatio: string;
      referenceImageUrls?: string[];
      extraParams: Record<string, unknown>;
      onChange: (key: string, value: unknown) => void;
      showReferenceSyncDescription?: boolean;
    },
  ) => {
    if (!model || fields.length === 0) {
      return null;
    }

    const syncedFields = fields.filter((field) => field.syncWith !== "none");
    const editableFields = fields.filter((field) => field.syncWith === "none");

    if (syncedFields.length === 0 && editableFields.length === 0) {
      return null;
    }

    const SYNC_LABELS: Record<ModelInputSyncTarget, string> = {
      none: "None",
      prompt: "Prompt",
      reference_images: "Reference Images",
      aspect_ratio: "Aspect Ratio",
    };

    return (
      <div className="space-y-2 rounded-md border border-zinc-700/70 bg-zinc-900/40 p-2">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
          Model Inputs ({model.name})
        </div>
        {syncedFields.map((field) => {
          const syncWith = field.syncWith;
          let preview = "—";
          if (syncWith === "prompt") {
            preview = options.prompt.trim() || "No prompt yet";
          } else if (syncWith === "aspect_ratio") {
            preview = options.aspectRatio;
          } else if (syncWith === "reference_images") {
            const count = options.referenceImageUrls?.length ?? 0;
            preview = count > 0 ? `${count} reference image${count === 1 ? "" : "s"}` : "No references";
          }
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-300">{field.label}{field.required ? " *" : ""}</span>
                <span className="rounded border border-zinc-600 px-1 py-0 text-[10px] text-zinc-400">
                  Sync: {SYNC_LABELS[syncWith]}
                </span>
              </div>
              <input
                className="w-full rounded-md bg-zinc-800/80 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400"
                value={preview}
                readOnly
              />
            </label>
          );
        })}
        {editableFields.map((field) => {
          const value = options.extraParams[field.key] ?? field.default ?? "";
          if (field.type === "select" && field.options && field.options.length > 0) {
            const selectValue = String(value ?? field.options[0]?.value ?? "");
            const searchKey = `${model.id}:${field.key}`;
            const searchTerm = (modelInputOptionSearchTerms[searchKey] ?? "").trim().toLowerCase();
            const selectedOption = field.options.find((option) => String(option.value) === selectValue);
            const filteredOptions = searchTerm.length === 0
              ? field.options
              : field.options.filter((option) => {
                const label = String(option.label || "").toLowerCase();
                const optionValue = String(option.value ?? "").toLowerCase();
                return label.includes(searchTerm) || optionValue.includes(searchTerm);
              });
            const visibleOptions = filteredOptions.length > 0
              ? filteredOptions
              : (selectedOption ? [selectedOption] : []);
            return (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-300">{field.label}{field.required ? " *" : ""}</span>
                {field.options.length >= 8 ? (
                  <input
                    className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    type="text"
                    aria-label={`Search ${field.label}`}
                    placeholder={`Search ${field.label.toLowerCase()}...`}
                    value={modelInputOptionSearchTerms[searchKey] ?? ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setModelInputOptionSearchTerms((prev) => ({
                        ...prev,
                        [searchKey]: nextValue,
                      }));
                    }}
                  />
                ) : null}
                <select
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectValue}
                  onChange={(event) => {
                    const matched = field.options?.find(
                      (option) => String(option.value) === event.target.value,
                    );
                    options.onChange(field.key, matched?.value ?? event.target.value);
                  }}
                >
                  {visibleOptions.map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {searchTerm.length > 0 && filteredOptions.length === 0 ? (
                  <span className="text-[10px] text-zinc-500">
                    No matching options. Showing current selected value.
                  </span>
                ) : null}
              </label>
            );
          }
          if (field.type === "boolean") {
            const checked = typeof value === "boolean"
              ? value
              : String(value).trim().toLowerCase() === "true";
            return (
              <label key={field.key} className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200">
                <span>{field.label}{field.required ? " *" : ""}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => options.onChange(field.key, event.target.checked)}
                />
              </label>
            );
          }
          if (field.type === "number") {
            return (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-300">{field.label}{field.required ? " *" : ""}</span>
                <Input
                  type="number"
                  value={value === "" ? "" : String(value)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw.trim() === "") {
                      options.onChange(field.key, "");
                      return;
                    }
                    const parsed = Number(raw);
                    options.onChange(field.key, Number.isFinite(parsed) ? parsed : raw);
                  }}
                />
              </label>
            );
          }
          if (field.type === "library_file") {
            return (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-300">{field.label}{field.required ? " *" : ""}</span>
                <LibraryFilePicker
                  value={String(value ?? "")}
                  onValueChange={(url) => options.onChange(field.key, url)}
                />
              </label>
            );
          }
          if (field.type === "image_urls" || field.type === "video_urls" || field.type === "audio_urls") {
            const currentUrls = Array.isArray(value)
              ? value.filter((entry): entry is string => typeof entry === "string")
              : [];
            const urlList = currentUrls.join("\n");
            return (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-300">{field.label}{field.required ? " *" : ""}</span>
                <Textarea
                  className="min-h-[72px] resize-y bg-zinc-800 border-zinc-700 text-zinc-100 text-xs focus:ring-blue-500"
                  placeholder="One URL per line"
                  value={urlList}
                  onChange={(event) => {
                    const urls = event.target.value
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean);
                    options.onChange(field.key, urls.length > 0 ? urls : "");
                  }}
                />
                <LibraryFilePicker
                  value=""
                  onValueChange={(url) => {
                    const normalized = String(url || "").trim();
                    if (!normalized) {
                      return;
                    }
                    const deduped = Array.from(new Set([...currentUrls, normalized]));
                    options.onChange(field.key, deduped);
                  }}
                  allowedExtensions={getAllowedLibraryExtensionsForField(field)}
                />
              </label>
            );
          }
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-300">{field.label}{field.required ? " *" : ""}</span>
              <Input
                type="text"
                value={String(value ?? "")}
                onChange={(event) => options.onChange(field.key, event.target.value)}
              />
            </label>
          );
        })}
        {options.showReferenceSyncDescription ? (
          <span className="text-[10px] text-zinc-500">
            {hasReferenceImageSyncField(model)
              ? "Reference images are mapped to model-specific reference fields."
              : "References are sent via standard referenceImageUrls."}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="space-y-5 text-sm"
      data-testid="canvas-property-panel"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* ── Element Info ── */}
      <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg bg-zinc-800/70 border border-zinc-700/50">
        <div className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md shrink-0",
          selectedElement.type === "text" && "bg-blue-500/25 text-blue-300",
          selectedElement.type === "image" && "bg-green-500/25 text-green-300",
          selectedElement.type === "video" && "bg-purple-500/25 text-purple-300",
          selectedElement.type === "rect" && "bg-amber-500/25 text-amber-300",
          selectedElement.type === "line" && "bg-zinc-500/25 text-zinc-300",
        )}>
          {selectedElement.type === "text" && <Type className="h-4 w-4" />}
          {selectedElement.type === "image" && <ImageIcon className="h-4 w-4" />}
          {selectedElement.type === "video" && <Video className="h-4 w-4" />}
          {selectedElement.type === "rect" && <RectangleHorizontal className="h-4 w-4" />}
          {selectedElement.type === "line" && <Minus className="h-4 w-4" />}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-white capitalize">{selectedElement.type} Element</span>
          <span className="text-[10px] text-zinc-300 font-mono select-all cursor-text" title={selectedElement.id}>
            {selectedElement.id.length > 12 ? `${selectedElement.id.slice(0, 8)}…` : selectedElement.id}
          </span>
        </div>
      </div>

      {/* ── Position & Size ── */}
      <Section label="Transform">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "X", field: "x" as const, value: selectedElement.x },
            { label: "Y", field: "y" as const, value: selectedElement.y },
            { label: "W", field: "width" as const, value: selectedElement.width },
            { label: "H", field: "height" as const, value: selectedElement.height },
          ].map(({ label, field, value }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">{label}</span>
              <input
                aria-label={`Element ${field}`}
                type="number"
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={value}
                disabled={isMixedTypeSelection}
                onChange={(e) => onPatchSelected({ [field]: parseNumberInput(e.target.value, value) } as PresentationElementPatch)}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-[10px] text-zinc-400">Rotation (°)</span>
            <input
              aria-label="Element Rotation"
              type="number"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selectedElement.rotation ?? 0}
              disabled={isMixedTypeSelection}
              onChange={(e) => onPatchSelected({ rotation: parseNumberInput(e.target.value, selectedElement.rotation ?? 0) })}
            />
          </label>
        </div>
      </Section>

      <Section label="Appearance">
        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>Opacity</span>
            <span className="tabular-nums">{Math.round((selectedElement.opacity ?? 1) * 100)}%</span>
          </div>
          <input
            aria-label={`${selectedElement.type} Opacity`}
            type="range"
            min={0}
            max={1}
            step={0.01}
            className="w-full accent-blue-500"
            value={selectedElement.opacity ?? 1}
            disabled={isMixedTypeSelection}
            onChange={(event) => onPatchSelected({
              opacity: clampNumber(parseNumberInput(event.target.value, selectedElement.opacity ?? 1), 0, 1),
            } as PresentationElementPatch)}
          />
        </label>
      </Section>

      {isMixedTypeSelection ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Mixed object types selected. Property editing is disabled for safety.
          Resize all selected objects directly on the canvas.
        </div>
      ) : null}

      {/* ── TEXT ELEMENT ── */}
      {!isMixedTypeSelection && selectedElement.type === "text" && (
        <>
          {/* Text Content */}
          <Section label="Content">
            <Textarea
              aria-label="Text Content"
              className="min-h-[72px] resize-none bg-zinc-800 border-zinc-700 text-zinc-100 text-sm focus:ring-blue-500"
              value={selectedElement.text}
              disabled={isMultiSelection}
              onChange={(e) => onPatchSelected({ text: e.target.value } as PresentationElementPatch)}
            />
            {isMultiSelection ? (
              <p className="mt-1 text-[11px] text-zinc-400">
                Text editing is locked while multiple elements are selected.
              </p>
            ) : null}
          </Section>

          {/* Presets */}
          <Section label="Text Presets">
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={preset.ariaLabel}
                  onClick={() => onPatchSelected(preset.patch)}
                  className="flex h-10 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 px-2 text-zinc-200 transition-all hover:border-blue-500 hover:bg-zinc-700 hover:text-white"
                  style={{
                    fontSize: Math.min(preset.fontSize, 13),
                    fontWeight: preset.fontWeight,
                    fontStyle: preset.fontStyle,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Text Effects */}
          <Section label="Text Effects">
            <div className="grid grid-cols-2 gap-2">
              {/* None */}
              <button
                type="button"
                aria-label="Clear text effects"
                onClick={() => onPatchSelected({ textShadow: undefined, textStroke: undefined, color: "#ffffff" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 transition-all hover:border-zinc-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "1.7rem", color: "#e5e7eb", fontWeight: 700, lineHeight: 1 }}>Text</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">NONE</span>
              </button>
              {/* Blue — Bangers */}
              <button
                type="button"
                aria-label="Blue outline effect"
                onClick={() => onPatchSelected({ color: "#60a5fa", textStroke: "3px #ffffff", textShadow: "3px 3px 0px #1e3a8a, 0 0 15px #3b82f6", fontWeight: "700", fontFamily: "Bangers, cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-blue-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Bangers, cursive", fontSize: "2rem", letterSpacing: "0.05em", color: "#60a5fa", WebkitTextStroke: "2.5px #ffffff", textShadow: "3px 3px 0 #1e3a8a, 0 0 12px #3b82f6", lineHeight: 1 }}>BLUE</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">OUTLINE</span>
              </button>
              {/* Red — Paytone One */}
              <button
                type="button"
                aria-label="Red bold effect"
                onClick={() => onPatchSelected({ color: "#ef4444", textStroke: "3px #1a0000", textShadow: "4px 4px 0px #7f1d1d, 0 0 15px #ef4444", fontWeight: "700", fontFamily: "'Paytone One', sans-serif" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-red-600 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "'Paytone One', sans-serif", fontSize: "1.9rem", color: "#ef4444", WebkitTextStroke: "2.5px #1a0000", textShadow: "4px 4px 0 #7f1d1d", lineHeight: 1 }}>RED</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">BOLD</span>
              </button>
              {/* Gold — Bebas Neue */}
              <button
                type="button"
                aria-label="Gold effect"
                onClick={() => onPatchSelected({ color: "#fbbf24", textStroke: "3px #92400e", textShadow: "4px 4px 0px #78350f, 0 0 20px #fbbf24, 0 0 40px #f59e0b", fontWeight: "700", fontFamily: "'Bebas Neue', sans-serif" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-yellow-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.05em", color: "#fbbf24", WebkitTextStroke: "2.5px #92400e", textShadow: "3px 3px 0 #78350f, 0 0 16px #fbbf24", lineHeight: 1 }}>GOLD</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">GLOW</span>
              </button>
              {/* Purple — Fredoka One */}
              <button
                type="button"
                aria-label="Purple glow effect"
                onClick={() => onPatchSelected({ color: "#c4b5fd", textStroke: "3px #4c1d95", textShadow: "3px 3px 0px #4c1d95, 0 0 20px #7c3aed, 0 0 40px #7c3aed", fontWeight: "700", fontFamily: "'Fredoka One', cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-purple-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: "1.9rem", color: "#c4b5fd", WebkitTextStroke: "2.5px #4c1d95", textShadow: "2px 2px 0 #4c1d95, 0 0 15px #7c3aed", lineHeight: 1 }}>Magic</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">PURPLE</span>
              </button>
              {/* Neon — Righteous */}
              <button
                type="button"
                aria-label="Neon green effect"
                onClick={() => onPatchSelected({ color: "#ffffff", textStroke: "2px #22c55e", textShadow: "0 0 10px #22c55e, 0 0 25px #16a34a, 0 0 50px #15803d, 0 0 80px #14532d", fontWeight: "700", fontFamily: "Righteous, cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-green-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Righteous, cursive", fontSize: "1.9rem", color: "#ffffff", WebkitTextStroke: "1.5px #22c55e", textShadow: "0 0 10px #22c55e, 0 0 25px #16a34a, 0 0 40px #15803d", lineHeight: 1 }}>Neon</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">GLOW</span>
              </button>
              {/* 3D — Oswald */}
              <button
                type="button"
                aria-label="3D shadow effect"
                onClick={() => onPatchSelected({ color: "#e2e8f0", textStroke: "2px #475569", textShadow: "1px 1px 0 #cbd5e1, 2px 2px 0 #94a3b8, 3px 3px 0 #64748b, 4px 4px 0 #475569, 5px 5px 8px rgba(0,0,0,0.7)", fontWeight: "700", fontFamily: "Oswald, sans-serif" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-slate-400 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Oswald, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#e2e8f0", WebkitTextStroke: "1.5px #475569", textShadow: "1px 1px 0 #94a3b8, 3px 3px 0 #475569, 5px 5px 6px rgba(0,0,0,0.6)", lineHeight: 1 }}>3D</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">DEPTH</span>
              </button>
              {/* Hollow — Boogaloo */}
              <button
                type="button"
                aria-label="Hollow outline effect"
                onClick={() => onPatchSelected({ color: "transparent", textStroke: "4px #ffffff", textShadow: "0 0 10px rgba(255,255,255,0.4)", fontWeight: "700", fontFamily: "Boogaloo, cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-zinc-400 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Boogaloo, cursive", fontSize: "2rem", color: "transparent", WebkitTextStroke: "2.5px #ffffff", lineHeight: 1 }}>Open</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">HOLLOW</span>
              </button>
            </div>
          </Section>

          {/* Subtitle Styles */}
          <Section label="Subtitle Styles">
            <div className="grid grid-cols-1 gap-2">
              {/* Classic — white text + semi-transparent dark bg */}
              <button
                type="button"
                aria-label="Classic subtitle style"
                onClick={() => onPatchSelected({
                  color: "#ffffff", backgroundColor: "rgba(0,0,0,0.7)",
                  textStroke: undefined, textShadow: "none",
                  fontSize: 32, fontWeight: "normal", textAlign: "center",
                  fontFamily: "Poppins, sans-serif", lineHeight: 1.5, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-zinc-500"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.95rem", color: "#fff", background: "rgba(0,0,0,0.7)", padding: "4px 16px", borderRadius: "4px", fontWeight: 400 }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Yellow Highlight */}
              <button
                type="button"
                aria-label="Yellow highlight subtitle"
                onClick={() => onPatchSelected({
                  color: "#0a0a0a", backgroundColor: "#facc15",
                  textStroke: undefined, textShadow: "none",
                  fontSize: 30, fontWeight: "700", textAlign: "center",
                  fontFamily: "'Nunito', sans-serif", lineHeight: 1.4, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-yellow-500"
              >
                <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: "0.9rem", fontWeight: 800, color: "#0a0a0a", background: "#facc15", padding: "4px 12px", borderRadius: "2px" }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Soft Gradient bar — pink/purple */}
              <button
                type="button"
                aria-label="Gradient bar subtitle"
                onClick={() => onPatchSelected({
                  color: "#ffffff", backgroundColor: "rgba(168,85,247,0.75)",
                  textStroke: undefined, textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                  fontSize: 30, fontWeight: "600", textAlign: "center",
                  fontFamily: "Poppins, sans-serif", lineHeight: 1.4, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-purple-500"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff", background: "linear-gradient(90deg, #ec4899 0%, #a855f7 100%)", padding: "5px 16px", borderRadius: "4px" }}>
                  Please Put Your Title Here
                </span>
              </button>
              {/* Bordered Box */}
              <button
                type="button"
                aria-label="Bordered box subtitle"
                onClick={() => onPatchSelected({
                  color: "#ffffff", backgroundColor: "transparent",
                  textStroke: "2px #ffffff", textShadow: "2px 2px 8px rgba(0,0,0,0.8)",
                  fontSize: 30, fontWeight: "700", textAlign: "center",
                  fontFamily: "Montserrat, sans-serif", lineHeight: 1.4, letterSpacing: 1
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-zinc-400"
              >
                <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#fff", WebkitTextStroke: "0.5px #fff", border: "1.5px solid #ffffff", padding: "4px 14px", borderRadius: "4px", letterSpacing: "0.05em" }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Cinema — thin elegant white */}
              <button
                type="button"
                aria-label="Cinema subtitle style"
                onClick={() => onPatchSelected({
                  color: "#f8f8f8", backgroundColor: "transparent",
                  textStroke: undefined, textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
                  fontSize: 28, fontWeight: "normal", textAlign: "center",
                  fontFamily: "Montserrat, sans-serif", lineHeight: 1.5, letterSpacing: 1
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-zinc-400"
              >
                <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "0.85rem", fontWeight: 300, color: "#f8f8f8", textShadow: "0 1px 8px rgba(0,0,0,1)", letterSpacing: "0.08em" }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Teal / Neon Pop */}
              <button
                type="button"
                aria-label="Neon teal subtitle"
                onClick={() => onPatchSelected({
                  color: "#ccfbf1", backgroundColor: "rgba(15,118,110,0.8)",
                  textStroke: undefined, textShadow: "0 0 10px #14b8a6",
                  fontSize: 30, fontWeight: "700", textAlign: "center",
                  fontFamily: "Righteous, cursive", lineHeight: 1.4, letterSpacing: 0.5
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-teal-500"
              >
                <span style={{ fontFamily: "Righteous, cursive", fontSize: "0.9rem", fontWeight: 700, color: "#ccfbf1", background: "rgba(15,118,110,0.85)", padding: "4px 14px", borderRadius: "4px", textShadow: "0 0 8px #14b8a6" }}>
                  Please edit your text.
                </span>
              </button>
              {/* Dark Glass / Frosted */}
              <button
                type="button"
                aria-label="Dark glass subtitle"
                onClick={() => onPatchSelected({
                  color: "#e0f2fe", backgroundColor: "rgba(12,43,77,0.85)",
                  textStroke: undefined, textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                  fontSize: 28, fontWeight: "600", textAlign: "left",
                  fontFamily: "Poppins, sans-serif", lineHeight: 1.5, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-blue-500"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.85rem", fontWeight: 600, color: "#e0f2fe", background: "rgba(12,43,77,0.9)", padding: "5px 14px", borderRadius: "6px", border: "1px solid rgba(100,180,255,0.3)" }}>
                  [Lorem ipsum dolor sit amet]
                </span>
              </button>
              {/* Comic / Pop Art */}
              <button
                type="button"
                aria-label="Comic pop art subtitle"
                onClick={() => onPatchSelected({
                  color: "#fef08a", backgroundColor: "transparent",
                  textStroke: "2px #000000", textShadow: "3px 3px 0 #000",
                  fontSize: 36, fontWeight: "700", textAlign: "center",
                  fontFamily: "Bangers, cursive", lineHeight: 1.2, letterSpacing: 2
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-yellow-400"
              >
                <span style={{ fontFamily: "Bangers, cursive", fontSize: "1.1rem", color: "#fef08a", WebkitTextStroke: "1.5px #000", textShadow: "2px 2px 0 #000", letterSpacing: "0.08em" }}>
                  YOU DON'T WANT TO BE
                </span>
              </button>
            </div>
          </Section>

          {/* Font Family */}
          <Section label="Font Family">
            <div className="relative">
              <button
                type="button"
                onClick={() => { setFontDropdownOpen(!fontDropdownOpen); setWeightDropdownOpen(false); }}
                className="flex w-full items-center justify-between rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:border-zinc-500 transition-colors"
                style={{ fontFamily: currentFont }}
              >
                <span>{currentFontLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              {fontDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                  {FONT_FAMILIES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => { onPatchSelected({ fontFamily: f.value } as PresentationElementPatch); setFontDropdownOpen(false); }}
                      className={cn(
                        "flex w-full items-center px-3 py-2 text-sm hover:bg-zinc-700 transition-colors text-left",
                        currentFont === f.value ? "bg-blue-600/20 text-blue-300" : "text-zinc-200"
                      )}
                      style={{ fontFamily: f.value }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Font Size + Weight */}
          <Section label="Typography">
            <div className="flex items-center gap-2">
              {/* Font Size */}
              <div className="flex flex-col gap-1 w-20 shrink-0">
                <span className="text-[10px] text-zinc-400">Size</span>
                <input
                  aria-label="Text Font Size"
                  type="number"
                  min={6}
                  step={1}
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedElement.fontSize ?? 48}
                  onChange={(e) => onPatchSelected({ fontSize: parseNumberInput(e.target.value, selectedElement.fontSize ?? 48) } as PresentationElementPatch)}
                />
              </div>
              {/* Font Weight */}
              <div className="flex flex-col gap-1 flex-1 relative">
                <span className="text-[10px] text-zinc-400">Weight</span>
                <button
                  type="button"
                  onClick={() => { setWeightDropdownOpen(!weightDropdownOpen); setFontDropdownOpen(false); }}
                  className="flex w-full items-center justify-between rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:border-zinc-500 transition-colors"
                >
                  <span style={{ fontWeight: currentWeight }}>{currentWeightLabel}</span>
                  <ChevronDown className="h-3 w-3 text-zinc-400" />
                </button>
                {weightDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden max-h-44 overflow-y-auto">
                    {FONT_WEIGHTS.map((w) => (
                      <button
                        key={w.value}
                        type="button"
                        onClick={() => { onPatchSelected({ fontWeight: w.value as any } as PresentationElementPatch); setWeightDropdownOpen(false); }}
                        className={cn(
                          "flex w-full items-center px-3 py-1.5 text-xs hover:bg-zinc-700 transition-colors",
                          currentWeight === w.value ? "bg-blue-600/20 text-blue-300" : "text-zinc-200"
                        )}
                        style={{ fontWeight: w.value }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Style toolbar: B, I, U, S */}
            <div className="flex items-center gap-1 mt-2">
              <ToolbarButton
                title="Bold"
                active={textEl?.fontWeight === "700"}
                onClick={() => onPatchSelected({ fontWeight: (textEl?.fontWeight === "700" ? "normal" : "700") } as PresentationElementPatch)}
              >
                <Bold className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Italic"
                active={selectedElement.fontStyle === "italic"}
                onClick={() => onPatchSelected({ fontStyle: (selectedElement.fontStyle === "italic" ? "normal" : "italic") } as PresentationElementPatch)}
              >
                <Italic className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Underline"
                active={selectedElement.textDecoration === "underline"}
                onClick={() => onPatchSelected({ textDecoration: (selectedElement.textDecoration === "underline" ? "none" : "underline") } as PresentationElementPatch)}
              >
                <Underline className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Strikethrough"
                active={selectedElement.textDecoration === "line-through"}
                onClick={() => onPatchSelected({ textDecoration: (selectedElement.textDecoration === "line-through" ? "none" : "line-through") } as PresentationElementPatch)}
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </ToolbarButton>

              <div className="h-4 w-px bg-zinc-600 mx-1" />

              {/* Text Align */}
              {(["left", "center", "right", "justify"] as const).map((align) => {
                const Icon = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[align];
                return (
                  <ToolbarButton
                    key={align}
                    title={`Align ${align}`}
                    active={(selectedElement.textAlign || "left") === align}
                    onClick={() => onPatchSelected({ textAlign: align } as PresentationElementPatch)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </ToolbarButton>
                );
              })}
            </div>
          </Section>

          {/* Spacing */}
          <Section label="Spacing">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Line Height</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.6}
                    max={4}
                    step={0.05}
                    className="flex-1 accent-blue-500"
                    value={selectedElement.lineHeight ?? 1.25}
                    onChange={(e) => onPatchSelected({ lineHeight: parseNumberInput(e.target.value, selectedElement.lineHeight ?? 1.25) } as PresentationElementPatch)}
                  />
                  <span className="text-[11px] text-zinc-300 w-8 text-right tabular-nums">
                    {(selectedElement.lineHeight ?? 1.25).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Letter Spacing</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-5}
                    max={20}
                    step={0.1}
                    className="flex-1 accent-blue-500"
                    value={selectedElement.letterSpacing ?? 0}
                    onChange={(e) => onPatchSelected({ letterSpacing: parseNumberInput(e.target.value, selectedElement.letterSpacing ?? 0) } as PresentationElementPatch)}
                  />
                  <span className="text-[11px] text-zinc-300 w-8 text-right tabular-nums">
                    {(selectedElement.letterSpacing ?? 0).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </Section>

          {/* Color */}
          <Section label="Color">
            <ColorField
              label="Text Color"
              textAriaLabel="Text Color"
              pickerAriaLabel="Text Color Picker"
              value={selectedElement.color}
              fallback="#ffffff"
              onChange={(v) => onPatchSelected({ color: v } as PresentationElementPatch)}
            />
            <ColorField
              label="Background"
              textAriaLabel="Text Background Color"
              pickerAriaLabel="Text Background Color Picker"
              value={selectedElement.backgroundColor || "transparent"}
              fallback="#000000"
              onChange={(v) => onPatchSelected({ backgroundColor: v } as PresentationElementPatch)}
            />
          </Section>
        </>
      )}

      {/* ── IMAGE / SVG GRAPHIC ── */}
      {!isMixedTypeSelection && selectedElement.type === "image" && (
        <>
          {/* SVG Graphic color picker */}
          {(selectedElement as any).svgContent && (
            <Section label="Graphic Color">
              <div className="flex flex-col gap-2">
                {/* Quick color swatches */}
                <div className="grid grid-cols-8 gap-1">
                  {[
                    "#ffffff", "#f1f5f9", "#fbbf24", "#f87171",
                    "#60a5fa", "#34d399", "#c084fc", "#fb923c",
                    "#000000", "#1e293b", "#92400e", "#991b1b",
                    "#1e3a8a", "#065f46", "#4c1d95", "#7c2d12",
                  ].map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`Set graphic color to ${swatch}`}
                      onClick={() => onPatchSelected({ svgColor: swatch } as PresentationElementPatch)}
                      className="aspect-square w-full rounded-md border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: swatch,
                        borderColor: (selectedElement as any).svgColor === swatch ? "#38bdf8" : "transparent",
                      }}
                    />
                  ))}
                </div>
                {/* Custom color input */}
                <label className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 shrink-0">Custom</span>
                  <div className="flex flex-1 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1">
                    <input
                      type="color"
                      value={(selectedElement as any).svgColor || "#ffffff"}
                      onChange={(e) => onPatchSelected({ svgColor: e.target.value } as PresentationElementPatch)}
                      className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label="Custom graphic color"
                    />
                    <span className="text-xs font-mono text-zinc-300">
                      {(selectedElement as any).svgColor || "#ffffff"}
                    </span>
                  </div>
                </label>
              </div>
            </Section>
          )}
          {/* Regular image info */}
          {!(selectedElement as any).svgContent && (
            <Section label="Image">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">URL</span>
                <input className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 cursor-default" value={selectedElement.src} readOnly aria-label="Image URL" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Alt Text</span>
                <input className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 cursor-default" value={selectedElement.alt} readOnly aria-label="Image Alt Text" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Image Prompt</span>
                <Textarea
                  aria-label="Image Prompt"
                  className="min-h-[72px] resize-y bg-zinc-800 border-zinc-700 text-zinc-100 text-xs focus:ring-blue-500"
                  placeholder="Describe the image you want to generate..."
                  value={selectedElement.imagePrompt ?? ""}
                  maxLength={2000}
                  onChange={(event) => onPatchSelected({
                    imagePrompt: event.target.value,
                  } as PresentationElementPatch)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Media Model</span>
                <select
                  aria-label="Image Model"
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedElement.imageModelId?.trim() ?? ""}
                  onChange={(event) => {
                    const nextModelId = event.target.value.trim() || undefined;
                    const nextModel = imageModels.find((model) => model.id === (nextModelId || defaultImageModelId));
                    const scopedCurrentExtraParams = pickExtraParamsForModel(
                      nextModel,
                      (selectedElement.imageExtraParams as Record<string, unknown> | undefined),
                    );
                    const nextExtraParams = mergeExtraParams(
                      buildDefaultExtraParamsForModel(nextModel),
                      scopedCurrentExtraParams,
                    );
                    onPatchSelected({
                      imageModelId: nextModelId,
                      imageExtraParams: nextExtraParams,
                    } as PresentationElementPatch);
                  }}
                >
                  <option value="">
                    Default {defaultImageModelId ? `(${defaultImageModelId})` : "(auto)"}
                  </option>
                  {compatibleImageModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}{model.provider ? ` - ${model.provider}` : ""}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-zinc-500">
                  {imageModelsQuery.isLoading
                    ? "Loading image models..."
                    : compatibleImageModels.length > 0
                      ? "Only text-to-image compatible models are shown."
                      : "No compatible image models found."}
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Aspect Ratio</span>
                <select
                  aria-label="Image Aspect Ratio"
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={resolveClosestAspectRatio(selectedElement.width, selectedElement.height)}
                  onChange={(event) => {
                    handleApplyAspectRatioToSelectedMedia(event.target.value);
                  }}
                >
                  {COMMON_ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio.value} value={ratio.value}>
                      {ratio.value}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">Image References</span>
                  <span className="text-[10px] text-zinc-500">
                    {(selectedElement.imageReferenceUrls ?? []).length}/{MAX_IMAGE_REFERENCES}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <LibraryFilePicker
                    value=""
                    onValueChange={(url) => handleAddImageReferenceFromLibrary(url)}
                    allowedExtensions={LIBRARY_IMAGE_EXTENSIONS}
                    disabled={(selectedElement.imageReferenceUrls ?? []).length >= MAX_IMAGE_REFERENCES}
                  />
                  <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <Upload className="h-3.5 w-3.5" />
                    Upload Reference
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadReferenceMutation.isPending || (selectedElement.imageReferenceUrls ?? []).length >= MAX_IMAGE_REFERENCES}
                      onChange={(event) => {
                        void handleReferenceFileUpload(event, "image");
                      }}
                    />
                  </label>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleUseCurrentImageAsReference}
                    disabled={
                      !(selectedElement.src ?? "").trim()
                      || (selectedElement.imageReferenceUrls ?? []).length >= MAX_IMAGE_REFERENCES
                    }
                  >
                    Use Current Image
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleClearImageReferences}
                    disabled={(selectedElement.imageReferenceUrls ?? []).length === 0}
                  >
                    Clear
                  </button>
                </div>
                {(selectedElement.imageReferenceUrls ?? []).length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {(selectedElement.imageReferenceUrls ?? []).map((url) => (
                      <div
                        key={url}
                        className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1"
                      >
                        <span className="truncate text-[10px] text-zinc-300">{url}</span>
                        <button
                          type="button"
                          className="ml-auto rounded border border-zinc-700 px-1 py-0 text-[10px] text-zinc-300 hover:bg-zinc-700"
                          onClick={() => handleRemoveImageReference(url)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-500">
                    Add references to guide identity/style during regeneration.
                  </span>
                )}
                <span className="text-[10px] text-zinc-500">
                  {selectedImageModelSupportsReferenceSync
                    ? "Selected model supports image_urls input and references will also be mapped to model-specific fields."
                    : "References will be sent via standard referenceImageUrls."}
                </span>
              </div>
              {selectedImageInputFields.length > 0 ? (
                <>
                  <label className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200">
                    <span>Advanced Model Inputs</span>
                    <input
                      type="checkbox"
                      aria-label="Image Advanced Mode"
                      checked={showAdvancedModelInputs}
                      onChange={(event) => setShowAdvancedModelInputs(event.target.checked)}
                    />
                  </label>
                  {showAdvancedModelInputs
                    ? renderDynamicModelInputFields(
                      selectedImageModel,
                      selectedImageInputFields,
                      {
                        prompt: selectedElement.imagePrompt ?? "",
                        aspectRatio: resolveClosestAspectRatio(selectedElement.width, selectedElement.height),
                        referenceImageUrls: normalizeReferenceUrls(selectedElement.imageReferenceUrls),
                        extraParams: (selectedElement.imageExtraParams as Record<string, unknown> | undefined) ?? {},
                        onChange: (key, value) => updateSelectedElementExtraParams(key, value),
                        showReferenceSyncDescription: true,
                      },
                    )
                    : (
                      <span className="text-[10px] text-zinc-500">
                        Turn on Advanced Model Inputs to edit model-specific parameters.
                      </span>
                    )}
                </>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Fit Mode</span>
                <select
                  aria-label="Image Fit Mode"
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedElement.imageFit || "contain"}
                  onChange={(e) => onPatchSelected({ imageFit: e.target.value as "contain" | "cover" | "fill" } as PresentationElementPatch)}
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover (Crop)</option>
                  <option value="fill">Fill</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Media Shape</span>
                <select
                  aria-label="Image Media Shape"
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedElement.mediaShape || "rect"}
                  onChange={(event) => {
                    const nextShape = event.target.value as PresentationMediaShape;
                    const patch: PresentationElementPatch = {
                      mediaShape: nextShape,
                    };
                    if (presentationMediaShapeRequiresSquare(nextShape)) {
                      const size = Math.max(selectedElement.width, selectedElement.height);
                      patch.width = size;
                      patch.height = size;
                    }
                    onPatchSelected(patch);
                  }}
                >
                  {MEDIA_SHAPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {(selectedElement.mediaShape ?? "rect") === "rounded" ? (
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Corner Radius</span>
                    <span className="tabular-nums">{Math.round(selectedElement.mediaCornerRadius ?? 24)}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={160}
                    step={1}
                    className="w-full accent-blue-500"
                    value={selectedElement.mediaCornerRadius ?? 24}
                    onChange={(event) => onPatchSelected({
                      mediaCornerRadius: clampNumber(parseNumberInput(event.target.value, selectedElement.mediaCornerRadius ?? 24), 0, 160),
                    } as PresentationElementPatch)}
                  />
                </label>
              ) : null}
              {presentationMediaShapeRequiresSquare(selectedElement.mediaShape) ? (
                <button
                  type="button"
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                  onClick={() => {
                    const size = Math.max(selectedElement.width, selectedElement.height);
                    onPatchSelected({
                      width: size,
                      height: size,
                    } as PresentationElementPatch);
                  }}
                >
                  Normalize Shape Frame
                </button>
              ) : null}

              <MediaMotionControls
                mediaLabel="Image"
                motion={selectedElement.mediaMotion}
                onChange={(mediaMotion) => onPatchSelected({
                  mediaMotion,
                } as PresentationElementPatch)}
              />

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                    cropModeActive
                      ? "border border-amber-500 bg-amber-600 text-white hover:bg-amber-500"
                      : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  }`}
                  onClick={() => onToggleCropMode?.(cropModeActive ? null : selectedElement.id)}
                >
                  {cropModeActive ? "Exit Crop Mode" : "Enter Crop Mode"}
                </button>
                {cropModeActive ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                        cropModeTarget === "content"
                          ? "border border-sky-500 bg-sky-600 text-white hover:bg-sky-500"
                          : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                      }`}
                      onClick={() => onSetCropModeTarget?.("content")}
                    >
                      Edit Content
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                        cropModeTarget === "frame"
                          ? "border border-amber-500 bg-amber-600 text-white hover:bg-amber-500"
                          : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                      }`}
                      onClick={() => onSetCropModeTarget?.("frame")}
                    >
                      Edit Frame
                    </button>
                  </div>
                ) : null}
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Zoom</span>
                    <span className="tabular-nums">{(selectedElement.imageZoom ?? 1).toFixed(2)}x</span>
                  </div>
                  <input
                    aria-label="Image Crop Zoom"
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.01}
                    className="w-full accent-blue-500"
                    value={selectedElement.imageZoom ?? 1}
                    onChange={(e) => onPatchSelected({
                      imageZoom: clampNumber(parseNumberInput(e.target.value, selectedElement.imageZoom ?? 1), 0.5, 3),
                    } as PresentationElementPatch)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Focus X</span>
                    <span className="tabular-nums">{Math.round(selectedElement.imagePositionX ?? 50)}%</span>
                  </div>
                  <input
                    aria-label="Image Crop Focus X"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="w-full accent-blue-500"
                    value={selectedElement.imagePositionX ?? 50}
                    onChange={(e) => onPatchSelected({
                      imagePositionX: clampNumber(parseNumberInput(e.target.value, selectedElement.imagePositionX ?? 50), 0, 100),
                    } as PresentationElementPatch)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Focus Y</span>
                    <span className="tabular-nums">{Math.round(selectedElement.imagePositionY ?? 50)}%</span>
                  </div>
                  <input
                    aria-label="Image Crop Focus Y"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="w-full accent-blue-500"
                    value={selectedElement.imagePositionY ?? 50}
                    onChange={(e) => onPatchSelected({
                      imagePositionY: clampNumber(parseNumberInput(e.target.value, selectedElement.imagePositionY ?? 50), 0, 100),
                    } as PresentationElementPatch)}
                  />
                </label>

                <button
                  type="button"
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                  onClick={() => onPatchSelected({
                    imageFit: "cover",
                    mediaShape: "rect",
                    mediaCornerRadius: 24,
                    imageZoom: 1,
                    imagePositionX: 50,
                    imagePositionY: 50,
                  } as PresentationElementPatch)}
                >
                  Reset Crop
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 rounded-md border border-blue-600 bg-blue-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-700 disabled:text-zinc-300"
                  onClick={() => void handleRegenerateImage()}
                  disabled={isRegeneratingImage || generateImageAsyncMutation.isPending || !(selectedElement.imagePrompt ?? "").trim()}
                >
                  {isRegeneratingImage || generateImageAsyncMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Regenerate Image
                </button>
              </div>
            </Section>
          )}
        </>
      )}


      {/* ── VIDEO ── */}
      {!isMixedTypeSelection && selectedElement.type === "video" && (
        <Section label="Video">
          {[
            { label: "Source URL", field: "src" as const, value: selectedElement.src },
            { label: "Poster URL", field: "poster" as const, value: selectedElement.poster || "" },
            { label: "Title", field: "title" as const, value: selectedElement.title || "" },
          ].map(({ label, field, value }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">{label}</span>
              <input
                aria-label={`Video ${field}`}
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={value}
                onChange={(e) => onPatchSelected({ [field]: e.target.value } as PresentationElementPatch)}
              />
              {(field === "src" || field === "poster") ? (
                <LibraryFilePicker
                  value={value}
                  onValueChange={(url) => onPatchSelected({ [field]: url } as PresentationElementPatch)}
                  allowedExtensions={field === "src" ? LIBRARY_VIDEO_EXTENSIONS : LIBRARY_IMAGE_EXTENSIONS}
                />
              ) : null}
            </label>
          ))}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Video Prompt</span>
            <Textarea
              aria-label="Video Prompt"
              className="min-h-[72px] resize-y bg-zinc-800 border-zinc-700 text-zinc-100 text-xs focus:ring-blue-500"
              placeholder="Describe the video you want to generate..."
              value={selectedElement.videoPrompt ?? ""}
              maxLength={4000}
              onChange={(event) => onPatchSelected({
                videoPrompt: event.target.value,
              } as PresentationElementPatch)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Media Model</span>
            <select
              aria-label="Video Model"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selectedElement.videoModelId?.trim() ?? ""}
              onChange={(event) => {
                const nextModelId = event.target.value.trim() || undefined;
                const nextModel = videoModels.find((model) => model.id === (nextModelId || defaultVideoModelId));
                const scopedCurrentExtraParams = pickExtraParamsForModel(
                  nextModel,
                  (selectedElement.videoExtraParams as Record<string, unknown> | undefined),
                );
                const nextExtraParams = mergeExtraParams(
                  buildDefaultExtraParamsForModel(nextModel),
                  scopedCurrentExtraParams,
                );
                onPatchSelected({
                  videoModelId: nextModelId,
                  videoExtraParams: nextExtraParams,
                } as PresentationElementPatch);
              }}
            >
              <option value="">
                Default {defaultVideoModelId ? `(${defaultVideoModelId})` : "(auto)"}
              </option>
              {displayVideoModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}{model.provider ? ` - ${model.provider}` : ""}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-zinc-500">
              {videoModelsQuery.isLoading
                ? "Loading video models..."
                : displayVideoModels.length > 0
                  ? compatibleVideoModels.length > 0
                    ? "Only text-to-video compatible models are shown."
                    : "No text-to-video models detected; showing all video models."
                  : "No video models found."}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Aspect Ratio</span>
            <select
              aria-label="Video Aspect Ratio"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={resolveClosestAspectRatio(selectedElement.width, selectedElement.height)}
              onChange={(event) => {
                handleApplyAspectRatioToSelectedMedia(event.target.value);
              }}
            >
              {COMMON_ASPECT_RATIOS.map((ratio) => (
                <option key={ratio.value} value={ratio.value}>
                  {ratio.value}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Image References</span>
              <span className="text-[10px] text-zinc-500">
                {(selectedElement.videoReferenceUrls ?? []).length}/{MAX_IMAGE_REFERENCES}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <LibraryFilePicker
                value=""
                onValueChange={(url) => handleAddVideoReferenceFromLibrary(url)}
                allowedExtensions={LIBRARY_IMAGE_EXTENSIONS}
                disabled={(selectedElement.videoReferenceUrls ?? []).length >= MAX_IMAGE_REFERENCES}
              />
              <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Upload className="h-3.5 w-3.5" />
                Upload Reference
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadReferenceMutation.isPending || (selectedElement.videoReferenceUrls ?? []).length >= MAX_IMAGE_REFERENCES}
                  onChange={(event) => {
                    void handleReferenceFileUpload(event, "video");
                  }}
                />
              </label>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleClearVideoReferences}
                disabled={(selectedElement.videoReferenceUrls ?? []).length === 0}
              >
                Clear
              </button>
            </div>
            {(selectedElement.videoReferenceUrls ?? []).length > 0 ? (
              <div className="flex flex-col gap-1">
                {(selectedElement.videoReferenceUrls ?? []).map((url) => (
                  <div
                    key={url}
                    className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1"
                  >
                    <span className="truncate text-[10px] text-zinc-300">{url}</span>
                    <button
                      type="button"
                      className="ml-auto rounded border border-zinc-700 px-1 py-0 text-[10px] text-zinc-300 hover:bg-zinc-700"
                      onClick={() => handleRemoveVideoReference(url)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-zinc-500">
                Add references to guide style or identity during regeneration.
              </span>
            )}
            <span className="text-[10px] text-zinc-500">
              {selectedVideoModelSupportsReferenceSync
                ? "Selected model supports image_urls input and references will also be mapped to model-specific fields."
                : "References will be sent via standard referenceImageUrls."}
            </span>
          </div>

          {selectedVideoInputFields.length > 0 ? (
            <>
              <label className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200">
                <span>Advanced Model Inputs</span>
                <input
                  type="checkbox"
                  aria-label="Video Advanced Mode"
                  checked={showAdvancedModelInputs}
                  onChange={(event) => setShowAdvancedModelInputs(event.target.checked)}
                />
              </label>
              {showAdvancedModelInputs
                ? renderDynamicModelInputFields(
                  selectedVideoModel,
                  selectedVideoInputFields,
                  {
                    prompt: selectedElement.videoPrompt ?? "",
                    aspectRatio: resolveClosestAspectRatio(selectedElement.width, selectedElement.height),
                    referenceImageUrls: normalizeReferenceUrls(selectedElement.videoReferenceUrls),
                    extraParams: (selectedElement.videoExtraParams as Record<string, unknown> | undefined) ?? {},
                    onChange: (key, value) => updateSelectedElementExtraParams(key, value),
                  },
                )
                : (
                  <span className="text-[10px] text-zinc-500">
                    Turn on Advanced Model Inputs to edit model-specific parameters.
                  </span>
                )}
            </>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Fit Mode</span>
            <select
              aria-label="Video Fit Mode"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selectedElement.videoFit || "cover"}
              onChange={(event) => onPatchSelected({
                videoFit: event.target.value as "contain" | "cover" | "fill",
              } as PresentationElementPatch)}
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover (Crop)</option>
              <option value="fill">Fill</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Media Shape</span>
            <select
              aria-label="Video Media Shape"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selectedElement.mediaShape || "rect"}
              onChange={(event) => {
                const nextShape = event.target.value as PresentationMediaShape;
                const patch: PresentationElementPatch = {
                  mediaShape: nextShape,
                };
                if (presentationMediaShapeRequiresSquare(nextShape)) {
                  const size = Math.max(selectedElement.width, selectedElement.height);
                  patch.width = size;
                  patch.height = size;
                }
                onPatchSelected(patch);
              }}
            >
              {MEDIA_SHAPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {(selectedElement.mediaShape ?? "rect") === "rounded" ? (
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Corner Radius</span>
                <span className="tabular-nums">{Math.round(selectedElement.mediaCornerRadius ?? 24)}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={160}
                step={1}
                className="w-full accent-blue-500"
                value={selectedElement.mediaCornerRadius ?? 24}
                onChange={(event) => onPatchSelected({
                  mediaCornerRadius: clampNumber(parseNumberInput(event.target.value, selectedElement.mediaCornerRadius ?? 24), 0, 160),
                } as PresentationElementPatch)}
              />
            </label>
          ) : null}
          {presentationMediaShapeRequiresSquare(selectedElement.mediaShape) ? (
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              onClick={() => {
                const size = Math.max(selectedElement.width, selectedElement.height);
                onPatchSelected({
                  width: size,
                  height: size,
                } as PresentationElementPatch);
              }}
            >
              Normalize Shape Frame
            </button>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200 cursor-pointer">
              <span className="flex items-center gap-1.5">
                {selectedElement.muted === false ? (
                  <Volume2 className="h-3.5 w-3.5 text-blue-400" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-zinc-400" />
                )}
                Audio
              </span>
              <input
                type="checkbox"
                aria-label="Video Audio Enabled"
                checked={selectedElement.muted === false}
                onChange={(event) => onPatchSelected({ muted: !event.target.checked } as PresentationElementPatch)}
              />
            </label>
            <span className="text-[10px] text-zinc-500">
              Enable audio for videos with sound (e.g. Veo 3.1, Sora 2).
            </span>
          </div>

          <label className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200 cursor-pointer">
            <span>Loop</span>
            <input
              type="checkbox"
              aria-label="Video Loop"
              checked={selectedElement.loop ?? false}
              onChange={(event) => onPatchSelected({ loop: event.target.checked } as PresentationElementPatch)}
            />
          </label>

          <MediaMotionControls
            mediaLabel="Video"
            motion={selectedElement.mediaMotion}
            onChange={(mediaMotion) => onPatchSelected({
              mediaMotion,
            } as PresentationElementPatch)}
          />

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                cropModeActive
                  ? "border border-amber-500 bg-amber-600 text-white hover:bg-amber-500"
                  : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
              onClick={() => onToggleCropMode?.(cropModeActive ? null : selectedElement.id)}
            >
              {cropModeActive ? "Exit Crop Mode" : "Enter Crop Mode"}
            </button>
            {cropModeActive ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                    cropModeTarget === "content"
                      ? "border border-sky-500 bg-sky-600 text-white hover:bg-sky-500"
                      : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  }`}
                  onClick={() => onSetCropModeTarget?.("content")}
                >
                  Edit Content
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                    cropModeTarget === "frame"
                      ? "border border-amber-500 bg-amber-600 text-white hover:bg-amber-500"
                      : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  }`}
                  onClick={() => onSetCropModeTarget?.("frame")}
                >
                  Edit Frame
                </button>
              </div>
            ) : null}
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Zoom</span>
                <span className="tabular-nums">{(selectedElement.videoZoom ?? 1).toFixed(2)}x</span>
              </div>
              <input
                aria-label="Video Crop Zoom"
                type="range"
                min={0.5}
                max={3}
                step={0.01}
                className="w-full accent-blue-500"
                value={selectedElement.videoZoom ?? 1}
                onChange={(event) => onPatchSelected({
                  videoZoom: clampNumber(parseNumberInput(event.target.value, selectedElement.videoZoom ?? 1), 0.5, 3),
                } as PresentationElementPatch)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Focus X</span>
                <span className="tabular-nums">{Math.round(selectedElement.videoPositionX ?? 50)}%</span>
              </div>
              <input
                aria-label="Video Crop Focus X"
                type="range"
                min={0}
                max={100}
                step={1}
                className="w-full accent-blue-500"
                value={selectedElement.videoPositionX ?? 50}
                onChange={(event) => onPatchSelected({
                  videoPositionX: clampNumber(parseNumberInput(event.target.value, selectedElement.videoPositionX ?? 50), 0, 100),
                } as PresentationElementPatch)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Focus Y</span>
                <span className="tabular-nums">{Math.round(selectedElement.videoPositionY ?? 50)}%</span>
              </div>
              <input
                aria-label="Video Crop Focus Y"
                type="range"
                min={0}
                max={100}
                step={1}
                className="w-full accent-blue-500"
                value={selectedElement.videoPositionY ?? 50}
                onChange={(event) => onPatchSelected({
                  videoPositionY: clampNumber(parseNumberInput(event.target.value, selectedElement.videoPositionY ?? 50), 0, 100),
                } as PresentationElementPatch)}
              />
            </label>

            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              onClick={() => onPatchSelected({
                videoFit: "cover",
                mediaShape: "rect",
                mediaCornerRadius: 24,
                videoZoom: 1,
                videoPositionX: 50,
                videoPositionY: 50,
              } as PresentationElementPatch)}
            >
              Reset Crop
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-1 rounded-md border border-blue-600 bg-blue-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-700 disabled:text-zinc-300"
              onClick={() => void handleRegenerateVideo()}
              disabled={isRegeneratingVideo || generateVideoAsyncMutation.isPending || !(selectedElement.videoPrompt ?? "").trim()}
            >
              {isRegeneratingVideo || generateVideoAsyncMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Regenerate Video
            </button>
          </div>
        </Section>
      )}

      {/* ── RECT ── */}
      {!isMixedTypeSelection && selectedElement.type === "rect" && (
        <Section label="Rectangle">
          <ColorField label="Fill" textAriaLabel="Rectangle Fill" pickerAriaLabel="Rectangle Fill Picker" value={selectedElement.fill} fallback="#93c5fd" onChange={(v) => onPatchSelected({ fill: v } as PresentationElementPatch)} />
          <ColorField label="Stroke" textAriaLabel="Rectangle Border" pickerAriaLabel="Rectangle Border Picker" value={selectedElement.stroke || "#2563eb"} fallback="#2563eb" onChange={(v) => onPatchSelected({ stroke: v } as PresentationElementPatch)} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Border Width</span>
            <input type="number" min={0} step={1} aria-label="Rectangle Border Width" className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500" value={selectedElement.strokeWidth ?? 2} onChange={(e) => onPatchSelected({ strokeWidth: parseNumberInput(e.target.value, selectedElement.strokeWidth ?? 2) } as PresentationElementPatch)} />
          </label>
        </Section>
      )}

      {/* ── LINE ── */}
      {!isMixedTypeSelection && selectedElement.type === "line" && (
        <Section label="Line">
          <ColorField label="Fill" textAriaLabel="Line Fill" pickerAriaLabel="Line Fill Picker" value={selectedElement.fill || "transparent"} fallback="#ffffff" onChange={(v) => onPatchSelected({ fill: v } as PresentationElementPatch)} />
          <ColorField label="Stroke" textAriaLabel="Line Stroke" pickerAriaLabel="Line Stroke Picker" value={selectedElement.stroke} fallback="#1f2937" onChange={(v) => onPatchSelected({ stroke: v } as PresentationElementPatch)} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Stroke Width</span>
            <input type="number" aria-label="Line Stroke Width" className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500" value={selectedElement.strokeWidth} onChange={(e) => onPatchSelected({ strokeWidth: parseNumberInput(e.target.value, selectedElement.strokeWidth) } as PresentationElementPatch)} />
          </label>
        </Section>
      )}
    </div>
  );
}
