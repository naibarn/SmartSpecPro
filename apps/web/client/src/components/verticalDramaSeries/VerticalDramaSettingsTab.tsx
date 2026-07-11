/**
 * VerticalDramaSettingsTab (spec feature 131, section-10/11 — Series detail
 * "Settings" tab).
 *
 * Minimal series-level configuration: title + status. Saves via the existing
 * `verticalDramaSeries.updateSeries` mutation (title/status fields only —
 * `bible`/`policy`/`productTieIn` are left untouched by omitting them from the
 * payload). Disabled entirely when the series is archived (`readOnly`).
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  pickCopy,
  seriesStatusCopy,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VerticalDramaDeleteSeriesDialog } from "@/components/verticalDramaSeries/VerticalDramaDeleteSeriesDialog";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH,
  normalizeTargetAudienceRegion,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES,
  type VerticalDramaSeriesLlmModelPolicy,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries/contracts";
// Text Overlay Suite (F131AB, task #34) — series watermark card. Pure/
// isomorphic module, safe as a normal static import (same posture as
// `targetAudienceRegion.ts` above).
import {
  parseSeriesWatermarkConfig,
  VD_WATERMARK_POSITIONS,
  type VdSeriesWatermarkConfig,
  type VdWatermarkPosition,
} from "@shared/verticalDramaSeries/textOverlay";
import { vdTextOverlayCopy } from "@/components/verticalDramaSeries/verticalDramaTextOverlayCopy";

const STATUS_OPTIONS: VerticalDramaSeriesStatus[] = [
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
];

/**
 * Manual LLM model override (added 2026-07-11 — see
 * `/home/dev/.claude/plans/polished-toasting-gadget.md`) — sentinel `<Select>`
 * value standing in for "automatic" (`null`/unset in `llmModelPolicy`), since
 * Radix `Select.Item` doesn't accept an empty-string value.
 */
const AUTOMATIC_LLM_MODEL_VALUE = "__automatic__";

/**
 * `bible` jsonb fields captured at series-creation time that we surface
 * read-only in the "Series Origin" section below. Other (LLM-expanded)
 * bible fields are shown by the Bible tab, not here.
 */
interface SeriesOriginBible {
  logline?: string | null;
  mainPlot?: string | null;
  visualStyle?: string | null;
  cliffhangerStyle?: string | null;
}

export interface VerticalDramaSettingsTabProps {
  lang: "th" | "en";
  seriesId: string;
  title: string;
  status: string;
  readOnly: boolean;
  onSaved?: () => void;
  /** Creation-time fields — read-only "Series Origin" traceability section. */
  genre?: string | null;
  tone?: string | null;
  targetAudience?: string | null;
  targetEpisodeCount?: number | null;
  defaultEpisodeDurationSeconds?: number | null;
  locale?: string | null;
  bible?: unknown;
  /** Manual LLM model override (added 2026-07-11 — see
   *  `/home/dev/.claude/plans/polished-toasting-gadget.md`) — raw
   *  `series.llmModelPolicy` jsonb value. Parsed defensively below (never
   *  trust a jsonb column's runtime shape client-side, same convention as
   *  `watermark`/`bible` in this same file). Absent/`null` field = automatic. */
  llmModelPolicy?: unknown;
  /** Text Overlay Suite (F131AB, task #34) — gates the watermark card
   *  entirely (fail-closed, default `false`, same convention as every other
   *  Vertical Drama flag threaded into this component's siblings). */
  textOverlaySuiteEnabled?: boolean;
  /** Raw `series.watermark` jsonb value — parsed defensively via
   *  `parseSeriesWatermarkConfig` inside this component (never trust a
   *  jsonb column's runtime shape client-side either). */
  watermark?: unknown;
}

export function VerticalDramaSettingsTab({
  lang,
  seriesId,
  title,
  status,
  readOnly,
  onSaved,
  genre,
  tone,
  targetAudience,
  targetEpisodeCount,
  defaultEpisodeDurationSeconds,
  locale,
  bible,
  llmModelPolicy,
  textOverlaySuiteEnabled = false,
  watermark,
}: VerticalDramaSettingsTabProps) {
  const [, setLocation] = useLocation();
  const [titleInput, setTitleInput] = useState(title);
  const [statusInput, setStatusInput] = useState<VerticalDramaSeriesStatus>(
    (status as VerticalDramaSeriesStatus) ?? "draft",
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const bibleRegion = normalizeTargetAudienceRegion(
    (bible as { targetAudienceRegion?: unknown } | null | undefined)?.targetAudienceRegion,
  );
  const [regionInput, setRegionInput] =
    useState<VerticalDramaTargetAudienceRegion>(bibleRegion);

  // Manual LLM model override (added 2026-07-11) — parsed defensively from
  // the raw jsonb prop; `typeof === "string"` doubles as the "absent/null =
  // automatic" normalization (undefined, null, or any non-string all fall
  // through to `null`).
  const llmPolicyObj = (llmModelPolicy ?? null) as VerticalDramaSeriesLlmModelPolicy | null;
  const startFramePlanModelIdFromProps =
    typeof llmPolicyObj?.startFramePlanModelId === "string"
      ? llmPolicyObj.startFramePlanModelId
      : null;
  const storyboardModelIdFromProps =
    typeof llmPolicyObj?.storyboardModelId === "string" ? llmPolicyObj.storyboardModelId : null;
  const [startFramePlanModelInput, setStartFramePlanModelInput] = useState<string | null>(
    startFramePlanModelIdFromProps,
  );
  const [storyboardModelInput, setStoryboardModelInput] = useState<string | null>(
    storyboardModelIdFromProps,
  );

  // Keep local form state in sync when the parent series data changes
  // (e.g. after a refetch triggered elsewhere).
  useEffect(() => {
    setTitleInput(title);
  }, [title]);
  useEffect(() => {
    setStatusInput((status as VerticalDramaSeriesStatus) ?? "draft");
  }, [status]);
  useEffect(() => {
    setRegionInput(bibleRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bibleRegion]);
  useEffect(() => {
    setStartFramePlanModelInput(startFramePlanModelIdFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFramePlanModelIdFromProps]);
  useEffect(() => {
    setStoryboardModelInput(storyboardModelIdFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboardModelIdFromProps]);

  // Text Overlay Suite (F131AB, task #34) — series watermark local draft,
  // seeded from the parsed persisted config (never trust the raw jsonb
  // shape — `parseSeriesWatermarkConfig` never throws, same convention as
  // every other Vertical Drama jsonb reader).
  const parsedWatermark = useMemo(
    () =>
      parseSeriesWatermarkConfig(watermark) ?? {
        enabled: false,
        type: "text" as const,
        text: "",
        position: "top_right" as const,
        opacity: 0.45,
        scalePct: 10,
        marginPx: 32,
      },
    [watermark],
  );
  const [watermarkDraft, setWatermarkDraft] =
    useState<VdSeriesWatermarkConfig>(parsedWatermark);
  useEffect(() => {
    setWatermarkDraft(parsedWatermark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedWatermark]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation();
  const regionMutation = trpc.verticalDramaSeries.setSeriesTargetAudienceRegion.useMutation();
  // Manual LLM model override (added 2026-07-11) — eligible model list for
  // the two dropdowns below, and the dedicated merge-mutation that persists
  // them onto `llmModelPolicy`.
  const planningModelsQuery = trpc.verticalDramaSeries.listQualityPlanningModels.useQuery();
  const planningModels = planningModelsQuery.data ?? [];
  const llmModelPolicyMutation = trpc.verticalDramaSeries.setSeriesLlmModelPolicy.useMutation();
  const updateWatermarkMutation =
    trpc.verticalDramaSeries.updateSeriesWatermark.useMutation({
      onSuccess: () => {
        toast.success(lang === "th" ? "บันทึกลายน้ำแล้ว" : "Watermark saved");
        void utils.verticalDramaSeries.get.invalidate();
        onSaved?.();
      },
      onError: (err) => {
        toast.error(
          err.message ||
            (lang === "th" ? "บันทึกลายน้ำไม่สำเร็จ" : "Failed to save watermark"),
        );
      },
    });

  const dirty = titleInput !== title || statusInput !== status;
  const regionDirty = regionInput !== bibleRegion;
  const startFramePlanModelDirty = startFramePlanModelInput !== startFramePlanModelIdFromProps;
  const storyboardModelDirty = storyboardModelInput !== storyboardModelIdFromProps;
  const llmModelPolicyDirty = startFramePlanModelDirty || storyboardModelDirty;
  const isSaving =
    updateMutation.isPending || regionMutation.isPending || llmModelPolicyMutation.isPending;

  const handleSave = async () => {
    try {
      const mutations: Array<Promise<unknown>> = [
        updateMutation.mutateAsync({
          seriesId,
          title: titleInput.trim() || undefined,
          status: statusInput,
        }),
      ];
      if (regionDirty) {
        mutations.push(
          regionMutation.mutateAsync({ seriesId, targetAudienceRegion: regionInput }),
        );
      }
      if (llmModelPolicyDirty) {
        // Only send the fields that actually changed — mirrors this file's
        // own doc-comment discipline of "left untouched by omitting them
        // from the payload" (the mutation is a merge-write, an omitted key
        // is a no-op on that field server-side).
        mutations.push(
          llmModelPolicyMutation.mutateAsync({
            seriesId,
            ...(startFramePlanModelDirty
              ? { startFramePlanModelId: startFramePlanModelInput }
              : {}),
            ...(storyboardModelDirty ? { storyboardModelId: storyboardModelInput } : {}),
          }),
        );
      }
      await Promise.all(mutations);
      toast.success(lang === "th" ? "บันทึกการตั้งค่าแล้ว" : "Settings saved");
      void utils.verticalDramaSeries.get.invalidate();
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      toast.error(message || (lang === "th" ? "บันทึกไม่สำเร็จ" : "Failed to save settings"));
    }
  };

  const b = (bible ?? {}) as SeriesOriginBible;
  const notSet = lang === "th" ? "ไม่ได้ระบุ" : "Not set";
  const originFields: Array<{ label: { th: string; en: string }; value: string | number | null | undefined }> = [
    { label: { th: "แนวเรื่อง", en: "Genre" }, value: genre },
    { label: { th: "โทนเรื่อง", en: "Tone" }, value: tone },
    { label: { th: "กลุ่มเป้าหมาย", en: "Target audience" }, value: targetAudience },
    { label: { th: "จำนวนตอนเป้าหมาย", en: "Target episode count" }, value: targetEpisodeCount },
    {
      label: { th: "ความยาวต่อตอน (วินาที)", en: "Default episode duration (sec)" },
      value: defaultEpisodeDurationSeconds,
    },
    {
      label: { th: "ภาษา", en: "Locale" },
      value: locale
        ? (VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES[locale as VerticalDramaSeriesLocale] ??
          locale)
        : locale,
    },
    { label: { th: "โลจไลน์", en: "Logline" }, value: b.logline },
    { label: { th: "โครงเรื่องหลัก", en: "Main plot" }, value: b.mainPlot },
    { label: { th: "สไตล์ภาพ", en: "Visual style" }, value: b.visualStyle },
    { label: { th: "สไตล์ปมค้างตอนจบ", en: "Cliffhanger style" }, value: b.cliffhangerStyle },
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th" ? "ที่มาของซีรีย์" : "Series origin"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-2xl gap-3 sm:grid-cols-2">
          {originFields.map((field) => (
            <div key={field.label.en} className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {pickCopy(lang, field.label)}
              </span>
              <span className="text-sm">
                {field.value === null || field.value === undefined || field.value === ""
                  ? notSet
                  : String(field.value)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th" ? "ตั้งค่าซีรีย์" : "Series settings"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-4">
          {readOnly && (
            <Badge variant="outline" className="w-fit">
              {pickCopy(lang, verticalDramaCopy.readOnly)}
            </Badge>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="series-settings-title" className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "ชื่อซีรีย์" : "Series title"}
            </Label>
            <Input
              id="series-settings-title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={readOnly || isSaving}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "สถานะ" : "Status"}
            </Label>
            <Select
              value={statusInput}
              onValueChange={(v) => setStatusInput(v as VerticalDramaSeriesStatus)}
              disabled={readOnly || isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {pickCopy(lang, seriesStatusCopy[opt])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "กลุ่มผู้ชมเป้าหมาย (ภูมิภาค)" : "Target audience (region)"}
            </Label>
            <Select
              value={regionInput}
              onValueChange={(v) => setRegionInput(v as VerticalDramaTargetAudienceRegion)}
              disabled={readOnly || isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {lang === "th"
                      ? VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH[opt]
                      : VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {lang === "th"
                ? "ใช้เป็นค่าเริ่มต้นสำหรับรูปลักษณ์/เชื้อชาติของภาพตัวละครทุกภาพ — คำอธิบายตัวละครที่ระบุเชื้อชาติ/สัญชาติไว้แล้วจะมีผลเหนือกว่าค่านี้เสมอ"
                : "Used as the default look/ethnicity for every character image — a character's own description (when it states an ethnicity/nationality) always takes precedence over this default."}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th"
                ? "โมเดลสำหรับแผนภาพเริ่มต้น (start-frame plan)"
                : "Model for start-frame plan"}
            </Label>
            <Select
              value={startFramePlanModelInput ?? AUTOMATIC_LLM_MODEL_VALUE}
              onValueChange={(v) =>
                setStartFramePlanModelInput(v === AUTOMATIC_LLM_MODEL_VALUE ? null : v)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger data-testid="vd-settings-start-frame-plan-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_LLM_MODEL_VALUE}>
                  {lang === "th"
                    ? "อัตโนมัติ (เลือกโมเดลที่ดีที่สุดให้อัตโนมัติ)"
                    : "Automatic (best model auto-selected)"}
                </SelectItem>
                {planningModels.map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "โมเดลสำหรับสตอรีบอร์ด (storyboard)" : "Model for storyboard"}
            </Label>
            <Select
              value={storyboardModelInput ?? AUTOMATIC_LLM_MODEL_VALUE}
              onValueChange={(v) =>
                setStoryboardModelInput(v === AUTOMATIC_LLM_MODEL_VALUE ? null : v)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger data-testid="vd-settings-storyboard-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_LLM_MODEL_VALUE}>
                  {lang === "th"
                    ? "อัตโนมัติ (เลือกโมเดลที่ดีที่สุดให้อัตโนมัติ)"
                    : "Automatic (best model auto-selected)"}
                </SelectItem>
                {planningModels.map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!readOnly && (
            <Button
              onClick={() => void handleSave()}
              disabled={
                isSaving ||
                (!dirty && !regionDirty && !llmModelPolicyDirty) ||
                titleInput.trim().length === 0
              }
              className="w-fit gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {isSaving
                ? lang === "th"
                  ? "กำลังบันทึก…"
                  : "Saving…"
                : lang === "th"
                  ? "บันทึก"
                  : "Save"}
            </Button>
          )}
        </CardContent>
      </Card>

      {textOverlaySuiteEnabled ? (
        <VerticalDramaSeriesWatermarkCard
          lang={lang}
          readOnly={readOnly}
          draft={watermarkDraft}
          onChange={setWatermarkDraft}
          saving={updateWatermarkMutation.isPending}
          onSave={() =>
            updateWatermarkMutation.mutate({ seriesId, watermark: watermarkDraft })
          }
        />
      ) : null}

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            {pickCopy(lang, verticalDramaCopy.dangerZoneTitle)}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-2xl gap-3">
          <p className="text-sm text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.deleteSeriesBody)}
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-fit gap-2"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.deleteSeries)}
          </Button>
        </CardContent>
      </Card>

      <VerticalDramaDeleteSeriesDialog
        lang={lang}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        seriesId={seriesId}
        seriesTitle={title}
        onDeleted={() => setLocation(verticalDramaRoutes.seriesList())}
      />
    </div>
  );
}

/** Corner -> Tailwind absolute-position classes for the 9:16 mock preview
 *  box below (`VerticalDramaSeriesWatermarkCard`'s own small helper). */
const WATERMARK_PREVIEW_CORNER_CLASS: Record<VdWatermarkPosition, string> = {
  top_left: "left-1 top-1",
  top_right: "right-1 top-1",
  bottom_left: "left-1 bottom-1",
  bottom_right: "right-1 bottom-1",
};

/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2 "ลายน้ำ") — the series
 * watermark settings card, rendered on the Settings tab (see
 * `VerticalDramaSettingsTab`'s own render call above for the flag gate).
 * Local-draft + explicit-Save convention, mirroring
 * `VerticalDramaEpisodeWorkspace.tsx`'s `VerticalDramaAdBannerPlanSection`/
 * `VerticalDramaTextOverlayPlanSection` (draft passed up from the parent —
 * this card is a pure, controlled sub-component so the parent owns the
 * `useEffect` re-sync-on-fresh-query-data logic once, not duplicated here).
 */
function VerticalDramaSeriesWatermarkCard({
  lang,
  readOnly,
  draft,
  onChange,
  saving,
  onSave,
}: {
  lang: "th" | "en";
  readOnly: boolean;
  draft: VdSeriesWatermarkConfig;
  onChange: (next: VdSeriesWatermarkConfig) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const t = vdTextOverlayCopy(lang);

  function patch(next: Partial<VdSeriesWatermarkConfig>) {
    onChange({ ...draft, ...next });
  }

  return (
    <Card data-testid="vd-watermark-card">
      <CardHeader>
        <CardTitle className="text-base">{t.watermarkCardTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t.watermarkCardDescription}
        </p>
      </CardHeader>
      <CardContent className="grid max-w-2xl gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(next) => patch({ enabled: Boolean(next) })}
              disabled={readOnly}
              data-testid="vd-watermark-enabled-toggle"
            />
            <Label className="text-sm font-medium">
              {t.watermarkEnableLabel}
            </Label>
          </div>

          {draft.enabled ? (
            <>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t.watermarkTypeLabel}
                </Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) =>
                    patch({ type: v as "text" | "image" })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger data-testid="vd-watermark-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t.watermarkTypeText}</SelectItem>
                    <SelectItem value="image">{t.watermarkTypeImage}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.type === "text" ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t.watermarkTextLabel}
                  </Label>
                  <Input
                    value={draft.text ?? ""}
                    placeholder={t.watermarkTextPlaceholder}
                    onChange={(e) => patch({ text: e.target.value })}
                    disabled={readOnly}
                    data-testid="vd-watermark-text"
                  />
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t.watermarkImageUrlLabel}
                  </Label>
                  <Input
                    value={draft.imageUrl ?? ""}
                    placeholder="https://…/logo.png"
                    onChange={(e) => patch({ imageUrl: e.target.value })}
                    disabled={readOnly}
                    data-testid="vd-watermark-image-url"
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t.watermarkPositionLabel}
                </Label>
                <Select
                  value={draft.position}
                  onValueChange={(v) =>
                    patch({ position: v as VdWatermarkPosition })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger data-testid="vd-watermark-position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VD_WATERMARK_POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>
                        {pos === "top_left"
                          ? t.watermarkPositionTopLeft
                          : pos === "top_right"
                            ? t.watermarkPositionTopRight
                            : pos === "bottom_left"
                              ? t.watermarkPositionBottomLeft
                              : t.watermarkPositionBottomRight}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t.watermarkOpacityLabel}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(draft.opacity * 100)}%
                  </span>
                </div>
                <Slider
                  min={0.2}
                  max={0.8}
                  step={0.05}
                  value={[draft.opacity]}
                  onValueChange={([v]) => patch({ opacity: v ?? draft.opacity })}
                  disabled={readOnly}
                  data-testid="vd-watermark-opacity"
                />
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t.watermarkScalePctLabel}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {draft.scalePct}%
                  </span>
                </div>
                <Slider
                  min={5}
                  max={20}
                  step={1}
                  value={[draft.scalePct]}
                  onValueChange={([v]) => patch({ scalePct: v ?? draft.scalePct })}
                  disabled={readOnly}
                  data-testid="vd-watermark-scale"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t.watermarkMarginPxLabel}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  className="w-24"
                  value={draft.marginPx}
                  onChange={(e) =>
                    patch({ marginPx: Number(e.target.value) })
                  }
                  disabled={readOnly}
                  data-testid="vd-watermark-margin"
                />
              </div>
            </>
          ) : null}

          {!readOnly && (
            <Button
              onClick={onSave}
              disabled={saving}
              className="w-fit gap-2"
              data-testid="vd-watermark-save"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? t.watermarkSaving : t.watermarkSaveButton}
            </Button>
          )}
        </div>

        {draft.enabled ? (
          <div className="flex flex-col items-center gap-1">
            <Label className="text-xs font-medium text-muted-foreground">
              {t.watermarkPreviewLabel}
            </Label>
            <div
              className="relative h-40 w-[90px] shrink-0 overflow-hidden rounded-md border bg-muted"
              data-testid="vd-watermark-preview"
            >
              <span
                className={`absolute rounded bg-foreground/70 px-1 py-0.5 text-[9px] text-background ${WATERMARK_PREVIEW_CORNER_CLASS[draft.position]}`}
                style={{ opacity: draft.opacity }}
              >
                {draft.type === "text" ? draft.text || "LOGO" : "IMG"}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
