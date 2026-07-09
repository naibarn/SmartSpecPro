/**
 * VerticalDramaSeriesTrailerPanel (spec feature 131, Bible tab addendum,
 * 2026-07-07 series trailer feature).
 *
 * Client-side orchestration for the "สร้างตัวอย่างซีรีส์" (auto series
 * trailer) flow: builds a narration script from the story bible
 * (logline + main plot, sanitized, no field-label leakage, localized CTA),
 * synthesizes it via the existing `media.generateAudio` TTS mutation (same
 * endpoint/shape Media Studio uses for synchronous audio generation), then
 * hands the resulting audio off to `verticalDramaSeries.generateTrailer`
 * (server gathers episode images/video clips itself) and polls
 * `getTrailerStatus` until the background ffmpeg assembly job reaches a
 * terminal state. Mirrors the submit -> background-job -> poll convention
 * already used for the whole-episode compiled video
 * (`VerticalDramaStoryboardPanel`'s `compiledVideo` card) so a page reload
 * mid-flight resumes polling instead of losing the in-flight job.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Mic, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import type { VerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import type { VerticalDramaSeriesTrailerState } from "@shared/verticalDramaSeries/assembly";

const TRAILER_VOICE_STORAGE_KEY = "vertical-drama-trailer-voice";

interface StoredTrailerVoicePref {
  modelId?: string;
  voiceId?: string;
}

function readStoredTrailerVoicePref(): StoredTrailerVoicePref {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRAILER_VOICE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        modelId: typeof parsed.modelId === "string" ? parsed.modelId : undefined,
        voiceId: typeof parsed.voiceId === "string" ? parsed.voiceId : undefined,
      };
    }
  } catch {
    // Ignore malformed localStorage content — treat as "no preference saved".
  }
  return {};
}

function writeStoredTrailerVoicePref(pref: StoredTrailerVoicePref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRAILER_VOICE_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // Best-effort persistence only — ignore quota/availability errors.
  }
}

/** Strip markdown/special characters before sending text to TTS, collapsing
 *  whitespace/newlines into single spaces. Keeps Thai/Latin letters, digits,
 *  and basic punctuation. */
function sanitizeForNarration(input: string): string {
  return input
    .replace(/[*_~`#>|[\]{}()"'“”‘’—–…/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const THAI_CTA = "ติดตามชมซีรีส์เรื่องนี้แบบเต็ม ๆ ได้ทุกตอน ห้ามพลาด!";
const EN_CTA = "Don't miss it — watch the full series, every episode!";

function buildNarrationText(params: {
  logline?: string | null;
  mainPlot?: string | null;
  locale?: string | null;
}): string {
  const parts = [
    sanitizeForNarration(params.logline ?? ""),
    sanitizeForNarration(params.mainPlot ?? ""),
  ].filter((part) => part.length > 0);
  const isThaiLocale = (params.locale ?? "th").toLowerCase().startsWith("th");
  parts.push(isThaiLocale ? THAI_CTA : EN_CTA);
  return parts.join(" ").trim();
}

/** Same blob-fetch + `<a download>` pattern as
 *  `VerticalDramaStoryboardPanel`'s `downloadStoryboardMediaUrl` — same-origin
 *  `/api/storage/...` URLs are fetched directly; external URLs are routed
 *  through the generic media proxy first. Falls back to `window.open` if the
 *  fetch/blob path fails. */
async function downloadTrailerVideo(url: string, filename: string): Promise<void> {
  const isCrossOrigin = (() => {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  })();
  const fetchUrl = isCrossOrigin
    ? `/api/media/image-proxy?url=${encodeURIComponent(url)}`
    : url;
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`download fetch failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** A model's `configJson.inputFields[n]` entry — only the shape this panel
 *  needs to resolve which field is the voice picker (mirrors the subset of
 *  fields `MediaStudio.tsx`'s `isVoiceSelectionField`/`hasProviderApiOptionsSource`
 *  read off the same `configJson.inputFields`). */
interface ModelInputFieldConfig {
  key?: string;
  searchable?: boolean;
  options?: unknown;
  optionsSource?: {
    type?: string;
    valueField?: string;
    previewField?: string;
  };
}

/** Same detection rule as `MediaStudio.tsx`'s `isVoiceSelectionField`: a field
 *  counts as "the voice picker" if its provider-API options source targets
 *  `voice_id`/`preview_url`, OR its (normalized) key is `voice`, `voiceid`, or
 *  `voiceidN` — this is what correctly matches UVoice's `voiceID` key (not
 *  just the literal string `"voice"`). */
function isVoiceSelectionField(field: ModelInputFieldConfig | null | undefined): boolean {
  if (!field || typeof field !== "object") return false;
  const source = field.optionsSource;
  if (source && typeof source === "object") {
    const valueField = String(source.valueField ?? "").trim().toLowerCase();
    const previewField = String(source.previewField ?? "").trim().toLowerCase();
    if (valueField === "voice_id" || previewField === "preview_url") {
      return true;
    }
  }
  const normalizedKey = String(field.key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]/g, "");
  return (
    normalizedKey === "voice" ||
    normalizedKey === "voiceid" ||
    /^voiceid\d+$/.test(normalizedKey)
  );
}

/** Normalizes a static `field.options` list (string[] or {value,label}[])
 *  into `{value,label}` pairs — same shape/rules as `MediaStudio.tsx`'s
 *  `normalizeModelFieldOptions`, reimplemented locally since that function
 *  isn't exported. */
function normalizeStaticFieldOptions(raw: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  const options: Array<{ value: string; label: string }> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const value = item.trim();
      if (value) options.push({ value, label: value });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const value = typeof record.value === "string" ? record.value.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : value;
    if (value) options.push({ value, label: label || value });
  }
  return options;
}

/** Best-effort extraction of the generated audio URL + optional duration from
 *  `media.generateAudio`'s sync response shape (`{ data: [{ url, data }] }`),
 *  matching the field-scan convention used by Media Studio's
 *  `extractTaskResultUrl`. */
function extractAudioResult(result: unknown): { url?: string; durationSeconds?: number } {
  if (!result || typeof result !== "object") return {};
  const record = result as Record<string, unknown>;
  const dataArray = Array.isArray(record.data) ? record.data : [];
  const first = dataArray[0] as Record<string, unknown> | undefined;
  const url =
    (typeof first?.url === "string" && first.url) ||
    (typeof record.resultUrl === "string" && record.resultUrl) ||
    (typeof record.audioUrl === "string" && record.audioUrl) ||
    undefined;
  const nestedData = first?.data as Record<string, unknown> | undefined;
  const durationRaw =
    nestedData?.durationSeconds ?? nestedData?.duration_seconds ?? nestedData?.duration;
  const durationSeconds =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) ? durationRaw : undefined;
  return { url: url || undefined, durationSeconds };
}

/** Read the model's per-request character limit (`configJson.maxPromptLength`
 *  / `max_prompt_length`, number or numeric string — same resolution rule as
 *  the server's `resolveConfiguredMaxPromptLength` in `media.ts`). `null`
 *  means the model enforces no limit and the script is sent in one request. */
function resolveModelMaxPromptLength(
  configJson: { maxPromptLength?: unknown; max_prompt_length?: unknown } | null | undefined,
): number | null {
  const raw = configJson?.maxPromptLength ?? configJson?.max_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

/**
 * Split the narration script into TTS-sized chunks, each at most
 * `limit - 25` chars (margin under the model's hard limit). Prefers cutting
 * at sentence punctuation (. ! ? …), then at a space; only hard-cuts
 * mid-run when a single unbreakable run exceeds the limit (possible in Thai
 * prose, which uses few spaces). Order-preserving; empty chunks dropped.
 */
function splitNarrationForTts(text: string, limit: number | null): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!limit || trimmed.length <= limit) return [trimmed];

  const max = Math.max(50, limit - 25);
  const minCut = Math.floor(max * 0.4);
  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = -1;
    for (let i = window.length - 1; i >= minCut; i -= 1) {
      if (".!?…".includes(window[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut < 0) {
      const spaceIdx = window.lastIndexOf(" ");
      if (spaceIdx >= minCut) cut = spaceIdx + 1;
    }
    if (cut < 0) cut = max;
    const piece = rest.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

type TrailerStage = "idle" | "narrating" | "assembling";

interface VerticalDramaSeriesTrailerPanelProps {
  lang: VerticalDramaLang;
  seriesId: string;
  locale?: string | null;
  logline?: string | null;
  mainPlot?: string | null;
  readOnly?: boolean;
}

export function VerticalDramaSeriesTrailerPanel({
  lang,
  seriesId,
  locale,
  logline,
  mainPlot,
  readOnly = false,
}: VerticalDramaSeriesTrailerPanelProps) {
  const utils = trpc.useUtils();

  const [voicePref, setVoicePref] = useState<StoredTrailerVoicePref>(() => readStoredTrailerVoicePref());
  const [stage, setStage] = useState<TrailerStage>("idle");
  // Multi-part narration progress ("2/3") while a long script is being
  // synthesized in several TTS requests; null when single-request or idle.
  const [narrationPartProgress, setNarrationPartProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  // Tracks a trailer job started in THIS component instance, so we resume
  // polling for both freshly-submitted jobs and jobs recovered from the
  // initial `getTrailerStatus` read on mount/reload.
  const pollingRef = useRef(false);

  const audioModelsQuery = trpc.mediaModels.list.useQuery({ type: "audio" });
  const audioModels: Array<{
    modelId: string;
    name?: string | null;
    voices?: string[] | null;
    configJson?: {
      inputFields?: ModelInputFieldConfig[];
      maxPromptLength?: number | string;
      max_prompt_length?: number | string;
    } | null;
  }> = audioModelsQuery.data?.models ?? [];

  // Restore a persisted model selection once models are loaded; default to
  // the first available model if nothing was stored (or the stored model no
  // longer exists).
  useEffect(() => {
    if (audioModels.length === 0) return;
    setVoicePref((prev) => {
      if (prev.modelId && audioModels.some((m) => m.modelId === prev.modelId)) {
        return prev;
      }
      return { ...prev, modelId: audioModels[0]?.modelId };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioModelsQuery.data]);

  const selectedModelId = voicePref.modelId;
  const selectedModel = audioModels.find((m) => m.modelId === selectedModelId);

  // Resolve which `inputFields` entry is the voice picker for the selected
  // model (e.g. UVoice models key it `voiceID`, not `voice`) — same detection
  // rule as MediaStudio's `isVoiceSelectionField`. `listModelFieldOptions`
  // looks the field up by EXACT key match server-side, so we must send the
  // field's real key, not a hardcoded `"voice"`.
  const voiceField = (selectedModel?.configJson?.inputFields ?? []).find((field) =>
    isVoiceSelectionField(field),
  );
  const voiceFieldKey = voiceField?.key;

  const voiceOptionsQuery = trpc.media.listModelFieldOptions.useQuery(
    { modelId: selectedModelId || "__no_model__", fieldKey: voiceFieldKey || "__no_field__", limit: 500 },
    { enabled: Boolean(selectedModelId) && Boolean(voiceFieldKey), staleTime: 5 * 60 * 1000 },
  );

  // Fallback chain: dynamic provider-API options -> the field's own static
  // `options` list -> the model's flat `voices` string[] column (used by
  // e.g. Gemini TTS models that don't have a dynamic voice field at all).
  const dynamicVoiceOptions = voiceOptionsQuery.data?.options ?? [];
  const staticFieldVoiceOptions = normalizeStaticFieldOptions(voiceField?.options);
  const modelVoicesColumnOptions = (selectedModel?.voices ?? []).map((v) => ({ value: v, label: v }));
  const voiceOptions =
    dynamicVoiceOptions.length > 0
      ? dynamicVoiceOptions
      : staticFieldVoiceOptions.length > 0
        ? staticFieldVoiceOptions
        : modelVoicesColumnOptions;

  // Restore/default the voice selection once voice options are loaded for
  // the currently selected model.
  useEffect(() => {
    if (voiceOptions.length === 0) return;
    setVoicePref((prev) => {
      if (prev.voiceId && voiceOptions.some((v) => v.value === prev.voiceId)) {
        return prev;
      }
      return { ...prev, voiceId: voiceOptions[0]?.value };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOptionsQuery.data, selectedModelId, selectedModel?.voices]);

  // Persist selections whenever they change.
  useEffect(() => {
    if (!voicePref.modelId && !voicePref.voiceId) return;
    writeStoredTrailerVoicePref(voicePref);
  }, [voicePref]);

  const trailerStatusQuery = trpc.verticalDramaSeries.getTrailerStatus.useQuery(
    { seriesId },
    {
      enabled: Boolean(seriesId),
      refetchInterval: (query) => {
        const data = query.state.data as VerticalDramaSeriesTrailerState | null | undefined;
        return data?.status === "processing" ? 5000 : false;
      },
    },
  );

  const trailer = trailerStatusQuery.data ?? null;

  // Resume the "assembling" UI stage automatically if the page loads (or is
  // reloaded) while a job is still processing server-side.
  useEffect(() => {
    if (trailer?.status === "processing" && !pollingRef.current) {
      pollingRef.current = true;
      setStage("assembling");
      setFlowError(null);
    } else if (trailer?.status === "completed" || trailer?.status === "failed") {
      pollingRef.current = false;
      setStage("idle");
    }
  }, [trailer?.status]);

  const generateAudioMutation = trpc.media.generateAudio.useMutation();
  const generateTrailerMutation = trpc.verticalDramaSeries.generateTrailer.useMutation();

  const narrationText = useMemo(
    () => buildNarrationText({ logline, mainPlot, locale }),
    [logline, mainPlot, locale],
  );
  const hasBibleContent = Boolean(
    (logline && logline.trim().length > 0) || (mainPlot && mainPlot.trim().length > 0),
  );

  const isRunning = stage !== "idle";
  const canGenerate =
    !readOnly && hasBibleContent && !isRunning && Boolean(selectedModelId) && Boolean(voicePref.voiceId);

  const handleGenerate = async () => {
    setFlowError(null);
    try {
      setStage("narrating");
      // Long scripts are split by the model's per-request char limit and
      // synthesized sequentially; the server concatenates the parts into one
      // narration track before assembling the video.
      const maxPromptLength = resolveModelMaxPromptLength(selectedModel?.configJson);
      const narrationChunks = splitNarrationForTts(narrationText, maxPromptLength);
      if (narrationChunks.length === 0) {
        throw new Error(
          lang === "th" ? "ไม่มีข้อความสำหรับสร้างเสียงบรรยาย" : "No narration text to synthesize.",
        );
      }

      const audioUrls: string[] = [];
      let totalDurationSeconds = 0;
      let allPartsHaveDuration = true;
      for (let i = 0; i < narrationChunks.length; i += 1) {
        if (narrationChunks.length > 1) {
          setNarrationPartProgress({ current: i + 1, total: narrationChunks.length });
        }
        const audioResult = await generateAudioMutation.mutateAsync({
          text: narrationChunks[i],
          model: selectedModelId,
          voice: voicePref.voiceId,
        });
        const { url: partUrl, durationSeconds: partDuration } = extractAudioResult(audioResult);
        if (!partUrl) {
          throw new Error(
            lang === "th"
              ? "สร้างเสียงบรรยายไม่สำเร็จ — ไม่ได้รับลิงก์ไฟล์เสียง"
              : "Narration audio generation failed — no audio URL was returned.",
          );
        }
        audioUrls.push(partUrl);
        if (typeof partDuration === "number" && partDuration > 0) {
          totalDurationSeconds += partDuration;
        } else {
          allPartsHaveDuration = false;
        }
      }
      setNarrationPartProgress(null);

      setStage("assembling");
      pollingRef.current = true;
      await generateTrailerMutation.mutateAsync({
        seriesId,
        audioUrls,
        audioDurationSeconds:
          allPartsHaveDuration && totalDurationSeconds > 0 ? totalDurationSeconds : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      await utils.verticalDramaSeries.getTrailerStatus.invalidate({ seriesId });
    } catch (err: unknown) {
      pollingRef.current = false;
      setNarrationPartProgress(null);
      setStage("idle");
      const message =
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "สร้างตัวอย่างซีรีส์ไม่สำเร็จ"
            : "Failed to generate the series trailer";
      setFlowError(message);
      toast.error(message);
    }
  };

  const narrationPartSuffix =
    narrationPartProgress && narrationPartProgress.total > 1
      ? ` (${narrationPartProgress.current}/${narrationPartProgress.total})`
      : "";
  const stageLabel =
    stage === "narrating"
      ? lang === "th"
        ? `กำลังสร้างเสียงบรรยาย${narrationPartSuffix}...`
        : `Generating narration audio${narrationPartSuffix}...`
      : stage === "assembling"
        ? lang === "th"
          ? "กำลังตัดต่อวีดีโอ..."
          : "Assembling the trailer video..."
        : null;

  const isCompleted = trailer?.status === "completed" && Boolean(trailer.videoUrl);
  const isFailed = trailer?.status === "failed" && !isRunning;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {lang === "th" ? "ตัวอย่างซีรีส์ (Trailer)" : "Series trailer"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!hasBibleContent && (
          <p className="text-muted-foreground">
            {lang === "th"
              ? "กรอกโลจไลน์และโครงเรื่องหลักในไบเบิลก่อน จึงจะสร้างตัวอย่างซีรีส์ได้"
              : "Fill in the logline and main plot in the story bible before generating a trailer."}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "เสียงบรรยาย model" : "Narration voice model"}
            </Label>
            <Select
              value={selectedModelId ?? ""}
              onValueChange={(value) => setVoicePref((prev) => ({ modelId: value, voiceId: undefined }))}
              disabled={readOnly || isRunning || audioModelsQuery.isLoading || audioModels.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    audioModelsQuery.isLoading
                      ? lang === "th"
                        ? "กำลังโหลด…"
                        : "Loading…"
                      : lang === "th"
                        ? "เลือก model"
                        : "Select a model"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[min(50vh,20rem)]">
                {audioModels.map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.name || model.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "เสียงพากย์ (Voice)" : "Voice"}
            </Label>
            <Select
              value={voicePref.voiceId ?? ""}
              onValueChange={(value) => setVoicePref((prev) => ({ ...prev, voiceId: value }))}
              disabled={
                readOnly ||
                isRunning ||
                !selectedModelId ||
                voiceOptionsQuery.isLoading ||
                voiceOptions.length === 0
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    voiceOptionsQuery.isLoading
                      ? lang === "th"
                        ? "กำลังโหลดเสียง…"
                        : "Loading voices…"
                      : voiceOptions.length === 0
                        ? lang === "th"
                          ? "ไม่มีเสียงให้เลือก"
                          : "No voices available"
                        : lang === "th"
                          ? "เลือกเสียง"
                          : "Select a voice"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[min(50vh,20rem)]">
                {voiceOptions.map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    {voice.label || voice.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {stageLabel && (
          <p className="flex items-center gap-2 text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {stageLabel}
          </p>
        )}

        {flowError && (
          <p className="font-medium text-destructive" role="alert">
            {flowError}
          </p>
        )}

        {isFailed && trailer?.error && (
          <p className="font-medium text-destructive" role="alert">
            {lang === "th" ? "สร้างตัวอย่างซีรีส์ไม่สำเร็จ: " : "Trailer generation failed: "}
            {trailer.error}
          </p>
        )}

        {isCompleted && trailer?.videoUrl && (
          <div className="flex flex-col gap-2">
            <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-md border border-border bg-black">
              <video
                src={trailer.videoUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-[9/16] w-full bg-black"
                data-testid="vd-series-trailer-player"
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {typeof trailer.durationSeconds === "number" && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {trailer.durationSeconds}s
                </Badge>
              )}
              {trailer.updatedAt && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {lang === "th" ? "สร้างเมื่อ " : "Created "}
                  {new Date(trailer.updatedAt).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
                </Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-1.5 text-[10px]"
                onClick={() =>
                  void downloadTrailerVideo(trailer.videoUrl!, `series-${seriesId}-trailer.mp4`)
                }
                data-testid="vd-series-trailer-download"
              >
                <Download aria-hidden="true" className="h-3 w-3" />
                {lang === "th" ? "ดาวน์โหลด" : "Download"}
              </Button>
            </div>
          </div>
        )}

        <Button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="gap-2"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Mic className="h-4 w-4" aria-hidden="true" />
          )}
          {isRunning
            ? stageLabel ?? (lang === "th" ? "กำลังทำงาน…" : "Working…")
            : isCompleted || isFailed
              ? lang === "th"
                ? "สร้างใหม่"
                : "Regenerate"
              : lang === "th"
                ? "สร้างตัวอย่างซีรีส์"
                : "Generate series trailer"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default VerticalDramaSeriesTrailerPanel;
