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
import {
  readSeriesLookLockControl,
  type VdLookLockGenre,
} from "@shared/verticalDramaSeries/seriesLookLock";
import {
  SeriesLookLockPicker,
  type SeriesLookLockPickerValue,
} from "./SeriesLookLockPicker";

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
  lookLockEnabled?: boolean;
  /** Raw `series.watermark` jsonb value — parsed defensively via
   *  `parseSeriesWatermarkConfig` inside this component (never trust a
   *  jsonb column's runtime shape client-side either). */
  watermark?: unknown;
}

/**
 * Labels for the 3x3 watermark anchor grid (widened from four corners on
 * 2026-07-30). Kept as a data map rather than a nested ternary so adding an
 * anchor cannot silently fall through to the wrong label.
 */
const VD_WATERMARK_POSITION_LABELS: Record<
  (typeof VD_WATERMARK_POSITIONS)[number],
  { th: string; en: string }
> = {
  top_left: { th: "บน–ซ้าย", en: "Top left" },
  top_center: { th: "บน–กลาง", en: "Top centre" },
  top_right: { th: "บน–ขวา", en: "Top right" },
  middle_left: { th: "กลางจอ–ซ้าย", en: "Middle left" },
  middle_center: { th: "กลางจอ–กลาง", en: "Middle centre" },
  middle_right: { th: "กลางจอ–ขวา", en: "Middle right" },
  bottom_left: { th: "ล่าง–ซ้าย", en: "Bottom left" },
  bottom_center: { th: "ล่าง–กลาง", en: "Bottom centre" },
  bottom_right: { th: "ล่าง–ขวา", en: "Bottom right" },
};

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
  lookLockEnabled = false,
  watermark,
}: VerticalDramaSettingsTabProps) {
  const [, setLocation] = useLocation();
  const [titleInput, setTitleInput] = useState(title);
  const [statusInput, setStatusInput] = useState<VerticalDramaSeriesStatus>(
    (status as VerticalDramaSeriesStatus) ?? "draft"
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const bibleRegion = normalizeTargetAudienceRegion(
    (bible as { targetAudienceRegion?: unknown } | null | undefined)
      ?.targetAudienceRegion
  );
  const [regionInput, setRegionInput] =
    useState<VerticalDramaTargetAudienceRegion>(bibleRegion);

  // Manual LLM model override (added 2026-07-11, collapsed to a single
  // series-wide field 2026-07-11 — see
  // `planning/vertical-drama-centralized-model-policy/plan.md`) — parsed
  // defensively from the raw jsonb prop; `typeof === "string"` doubles as
  // the "absent/null = automatic" normalization (undefined, null, or any
  // non-string all fall through to `null`).
  const llmPolicyObj = (llmModelPolicy ??
    null) as VerticalDramaSeriesLlmModelPolicy | null;
  const defaultModelIdFromProps =
    typeof llmPolicyObj?.defaultModelId === "string"
      ? llmPolicyObj.defaultModelId
      : null;
  const [defaultModelInput, setDefaultModelInput] = useState<string | null>(
    defaultModelIdFromProps
  );
  const bibleRecord = bible && typeof bible === "object"
    ? bible as Record<string, unknown>
    : {};
  const lookControl = readSeriesLookLockControl(bibleRecord.lookLockControl);
  const lookValueFromProps: SeriesLookLockPickerValue = lookControl
    ? { mode: lookControl.mode, genreKey: lookControl.genreKey }
    : bibleRecord.presetVisualIdentity
      ? { mode: "inherit_source" }
      : { mode: "none" };
  const [lookInput, setLookInput] = useState<SeriesLookLockPickerValue>(lookValueFromProps);

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
    setDefaultModelInput(defaultModelIdFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelIdFromProps]);
  useEffect(() => {
    setLookInput(lookValueFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookControl?.mode, lookControl?.genreKey, lookControl?.revision, bibleRecord.presetVisualIdentity]);

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
    [watermark]
  );
  const [watermarkDraft, setWatermarkDraft] =
    useState<VdSeriesWatermarkConfig>(parsedWatermark);
  useEffect(() => {
    setWatermarkDraft(parsedWatermark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedWatermark]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation();
  const regionMutation =
    trpc.verticalDramaSeries.setSeriesTargetAudienceRegion.useMutation();
  // Manual LLM model override (added 2026-07-11, collapsed to a single
  // series-wide dropdown 2026-07-11) — eligible model list for the dropdown
  // below, and the dedicated mutation that persists it onto
  // `llmModelPolicy`. `includeModelId` grandfathers this series' already-
  // persisted pin into the list even if it's since fallen out of the
  // admin-curated recommended set (2026-07-31 quality-picker narrowing —
  // see `listQualityPlanningModels`'s own doc comment), so this controlled
  // `<Select value={defaultModelInput}>` always has a matching option.
  const planningModelsQuery =
    trpc.verticalDramaSeries.listQualityPlanningModels.useQuery({
      includeModelId: defaultModelIdFromProps,
    });
  const planningModels = planningModelsQuery.data ?? [];
  const llmModelPolicyMutation =
    trpc.verticalDramaSeries.setSeriesLlmModelPolicy.useMutation();
  const lookLockMutation = trpc.verticalDramaSeries.setSeriesLookLock.useMutation();
  const updateWatermarkMutation =
    trpc.verticalDramaSeries.updateSeriesWatermark.useMutation({
      onSuccess: () => {
        toast.success(lang === "th" ? "บันทึกลายน้ำแล้ว" : "Watermark saved");
        void utils.verticalDramaSeries.get.invalidate();
        onSaved?.();
      },
      onError: err => {
        toast.error(
          err.message ||
            (lang === "th"
              ? "บันทึกลายน้ำไม่สำเร็จ"
              : "Failed to save watermark")
        );
      },
    });

  const dirty = titleInput !== title || statusInput !== status;
  const regionDirty = regionInput !== bibleRegion;
  const llmModelPolicyDirty = defaultModelInput !== defaultModelIdFromProps;
  const lookLockDirty = lookInput.mode !== lookValueFromProps.mode
    || lookInput.genreKey !== lookValueFromProps.genreKey;
  const isSaving =
    updateMutation.isPending ||
    regionMutation.isPending ||
    llmModelPolicyMutation.isPending ||
    lookLockMutation.isPending;

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
          regionMutation.mutateAsync({
            seriesId,
            targetAudienceRegion: regionInput,
          })
        );
      }
      if (llmModelPolicyDirty) {
        // Single required-but-nullable field now (no more partial merge of
        // two independently-dirty fields) — the mutation overwrites
        // `llmModelPolicy` wholesale.
        mutations.push(
          llmModelPolicyMutation.mutateAsync({
            seriesId,
            defaultModelId: defaultModelInput,
          })
        );
      }
      if (lookLockEnabled && lookLockDirty) {
        mutations.push(
          lookLockMutation.mutateAsync({
            seriesId,
            mode: lookInput.mode,
            genreKey: lookInput.mode === "genre"
              ? lookInput.genreKey as VdLookLockGenre
              : undefined,
            expectedRevision: lookControl?.revision ?? 0,
          })
        );
      }
      await Promise.all(mutations);
      toast.success(lang === "th" ? "บันทึกการตั้งค่าแล้ว" : "Settings saved");
      void utils.verticalDramaSeries.get.invalidate();
      // A title change must also refresh the series LIST cache — the create
      // wizard's "source series" (sequel/special-edition) dropdown reads its
      // option labels from `verticalDramaSeries.list`, so without this it
      // keeps showing the pre-rename title until that cache expires.
      void utils.verticalDramaSeries.list.invalidate();
      onSaved?.();
    } catch (err) {
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      if (code === "CONFLICT") {
        toast.error(
          lang === "th"
            ? "ลุคซีรีส์ถูกแก้จากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่"
            : "The series look changed elsewhere. Reload the latest data and try again."
        );
        void utils.verticalDramaSeries.get.invalidate();
        onSaved?.();
        return;
      }
      const message = err instanceof Error ? err.message : undefined;
      toast.error(
        message ||
          (lang === "th" ? "บันทึกไม่สำเร็จ" : "Failed to save settings")
      );
    }
  };

  const b = (bible ?? {}) as SeriesOriginBible;
  const notSet = lang === "th" ? "ไม่ได้ระบุ" : "Not set";
  const originFields: Array<{
    label: { th: string; en: string };
    value: string | number | null | undefined;
  }> = [
    { label: { th: "แนวเรื่อง", en: "Genre" }, value: genre },
    { label: { th: "โทนเรื่อง", en: "Tone" }, value: tone },
    {
      label: { th: "กลุ่มเป้าหมาย", en: "Target audience" },
      value: targetAudience,
    },
    {
      label: { th: "จำนวนตอนย่อยที่วางแผน", en: "Planned Sub-episode count" },
      value: targetEpisodeCount,
    },
    {
      label: {
        th: "ความยาวต่อตอนย่อย (วินาที)",
        en: "Default Sub-episode duration (sec)",
      },
      value: defaultEpisodeDurationSeconds,
    },
    {
      label: { th: "ภาษา", en: "Locale" },
      value: locale
        ? (VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES[
            locale as VerticalDramaSeriesLocale
          ] ?? locale)
        : locale,
    },
    { label: { th: "โลจไลน์", en: "Logline" }, value: b.logline },
    { label: { th: "โครงเรื่องหลัก", en: "Main plot" }, value: b.mainPlot },
    { label: { th: "สไตล์ภาพ", en: "Visual style" }, value: b.visualStyle },
    {
      label: { th: "สไตล์ปมค้างตอนจบ", en: "Cliffhanger style" },
      value: b.cliffhangerStyle,
    },
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
          {originFields.map(field => (
            <div key={field.label.en} className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {pickCopy(lang, field.label)}
              </span>
              <span className="text-sm">
                {field.value === null ||
                field.value === undefined ||
                field.value === ""
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
            <Label
              htmlFor="series-settings-title"
              className="text-xs font-medium text-muted-foreground"
            >
              {lang === "th" ? "ชื่อซีรีย์" : "Series title"}
            </Label>
            <Input
              id="series-settings-title"
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              disabled={readOnly || isSaving}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "สถานะ" : "Status"}
            </Label>
            <Select
              value={statusInput}
              onValueChange={v =>
                setStatusInput(v as VerticalDramaSeriesStatus)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>
                    {pickCopy(lang, seriesStatusCopy[opt])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th"
                ? "กลุ่มผู้ชมเป้าหมาย (ภูมิภาค)"
                : "Target audience (region)"}
            </Label>
            <Select
              value={regionInput}
              onValueChange={v =>
                setRegionInput(v as VerticalDramaTargetAudienceRegion)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS.map(opt => (
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
                ? "โมเดล LLM สำหรับสร้างเนื้อหาละคร (แต่งบท/ตัวละคร/storyboard)"
                : "LLM model for drama content generation (script/characters/storyboard)"}
            </Label>
            <Select
              value={defaultModelInput ?? AUTOMATIC_LLM_MODEL_VALUE}
              onValueChange={v =>
                setDefaultModelInput(v === AUTOMATIC_LLM_MODEL_VALUE ? null : v)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger data-testid="vd-settings-default-llm-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_LLM_MODEL_VALUE}>
                  {lang === "th"
                    ? "อัตโนมัติ (เลือกโมเดลที่ดีที่สุดให้อัตโนมัติ)"
                    : "Automatic (best model auto-selected)"}
                </SelectItem>
                {planningModels.map(model => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {lang === "th"
                ? "มีผลกับทุกขั้นตอนของซีรีย์นี้ที่ใช้ LLM — แต่งบท, วิเคราะห์/สร้างตัวละคร, storyboard และอื่นๆ ตั้งครั้งเดียวใช้ได้ทั้งหมด"
                : "Applies to every LLM-driven step of this series — script writing, character analysis/generation, storyboard, and more. Set it once, it covers everything."}
            </p>
          </div>

          {lookLockEnabled ? (
            <SeriesLookLockPicker
              lang={lang}
              value={lookInput}
              hasInheritedLook={Boolean(
                lookControl?.inheritedIdentity || bibleRecord.presetVisualIdentity
              )}
              isDisabled={readOnly || isSaving}
              onChange={setLookInput}
            />
          ) : null}

          {!readOnly && (
            <Button
              onClick={() => void handleSave()}
              disabled={
                isSaving ||
                (!dirty && !regionDirty && !llmModelPolicyDirty && !lookLockDirty) ||
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
          seriesId={seriesId}
          draft={watermarkDraft}
          onChange={setWatermarkDraft}
          saving={updateWatermarkMutation.isPending}
          onSave={() =>
            updateWatermarkMutation.mutate({
              seriesId,
              watermark: watermarkDraft,
            })
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
/** Preview placement for all NINE anchors. `Record<VdWatermarkPosition, …>`
 *  makes a missing entry a compile error, which is why widening the enum to a
 *  3x3 grid had to update this map in the same change. */
const WATERMARK_PREVIEW_CORNER_CLASS: Record<VdWatermarkPosition, string> = {
  top_left: "left-1 top-1",
  top_center: "left-1/2 top-1 -translate-x-1/2",
  top_right: "right-1 top-1",
  middle_left: "left-1 top-1/2 -translate-y-1/2",
  middle_center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  middle_right: "right-1 top-1/2 -translate-y-1/2",
  bottom_left: "left-1 bottom-1",
  bottom_center: "left-1/2 bottom-1 -translate-x-1/2",
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
  seriesId,
  draft,
  onChange,
  saving,
  onSave,
}: {
  lang: "th" | "en";
  readOnly: boolean;
  seriesId: string;
  draft: VdSeriesWatermarkConfig;
  onChange: (next: VdSeriesWatermarkConfig) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const t = vdTextOverlayCopy(lang);
  const uploadWatermarkImageMutation =
    trpc.verticalDramaSeries.uploadSeriesWatermarkImage.useMutation();
  const [watermarkUploadBusy, setWatermarkUploadBusy] = useState(false);
  const [watermarkUploadError, setWatermarkUploadError] = useState<
    string | null
  >(null);
  const [watermarkDragActive, setWatermarkDragActive] = useState(false);

  function patch(next: Partial<VdSeriesWatermarkConfig>) {
    onChange({ ...draft, ...next });
  }

  const handleWatermarkFile = async (file: File | null | undefined) => {
    if (!file) return;
    setWatermarkUploadError(null);
    if (!file.type.toLowerCase().startsWith("image/")) {
      setWatermarkUploadError(
        lang === "th"
          ? "ไฟล์ต้องเป็นรูปภาพ (PNG / JPG / WebP / SVG)"
          : "File must be an image (PNG / JPG / WebP / SVG)"
      );
      return;
    }
    setWatermarkUploadBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read_failed"));
        reader.readAsDataURL(file);
      });
      const result = await uploadWatermarkImageMutation.mutateAsync({
        seriesId,
        fileName: file.name,
        fileType: file.type,
        fileBase64: base64,
      });
      const url = typeof result?.url === "string" ? result.url : "";
      if (!url) throw new Error("no_url");
      // Fill the field only — saving stays an explicit user action.
      patch({ imageUrl: url });
    } catch (error) {
      setWatermarkUploadError(
        `${lang === "th" ? "อัปโหลดไม่สำเร็จ" : "Upload failed"}${
          error instanceof Error && error.message ? `: ${error.message}` : ""
        }`
      );
    } finally {
      setWatermarkUploadBusy(false);
    }
  };

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
              onCheckedChange={next => patch({ enabled: Boolean(next) })}
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
                  onValueChange={v => patch({ type: v as "text" | "image" })}
                  disabled={readOnly}
                >
                  <SelectTrigger data-testid="vd-watermark-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t.watermarkTypeText}</SelectItem>
                    <SelectItem value="image">
                      {t.watermarkTypeImage}
                    </SelectItem>
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
                    onChange={e => patch({ text: e.target.value })}
                    disabled={readOnly}
                    data-testid="vd-watermark-text"
                  />
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t.watermarkImageUrlLabel}
                  </Label>
                  {/* Drag-and-drop upload (parity with the Marketplace overlay
                      picker). The drop only fills the URL field — saving stays
                      an explicit action, so a mis-drop is recoverable. */}
                  <div
                    className={`rounded-md border border-dashed p-2 text-xs ${
                      watermarkDragActive
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/30"
                    }`}
                    onDragOver={event => {
                      if (readOnly) return;
                      event.preventDefault();
                      setWatermarkDragActive(true);
                    }}
                    onDragLeave={() => setWatermarkDragActive(false)}
                    onDrop={event => {
                      if (readOnly) return;
                      event.preventDefault();
                      setWatermarkDragActive(false);
                      void handleWatermarkFile(event.dataTransfer?.files?.[0]);
                    }}
                    data-testid="vd-watermark-dropzone"
                  >
                    <p className="text-muted-foreground">
                      {lang === "th"
                        ? "ลากไฟล์จากเครื่องมาวางที่นี่ (อัปโหลดอัตโนมัติ) หรือกดเลือกไฟล์ · PNG / JPG / WebP / SVG · ไม่เกิน 10MB · แนะนำ PNG พื้นหลังโปร่งใส"
                        : "Drag an image here (uploads automatically) or pick a file · PNG / JPG / WebP / SVG · max 10MB · transparent PNG recommended"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="text-xs"
                        disabled={readOnly || watermarkUploadBusy}
                        onChange={event =>
                          void handleWatermarkFile(event.target.files?.[0])
                        }
                        data-testid="vd-watermark-file-input"
                      />
                      {watermarkUploadBusy ? (
                        <span className="text-primary" role="status">
                          {lang === "th" ? "กำลังอัปโหลด…" : "Uploading…"}
                        </span>
                      ) : null}
                    </div>
                    {watermarkUploadError ? (
                      <p className="mt-1 text-destructive" role="alert">
                        {watermarkUploadError}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    value={draft.imageUrl ?? ""}
                    placeholder="https://…/logo.png"
                    onChange={e => patch({ imageUrl: e.target.value })}
                    disabled={readOnly}
                    data-testid="vd-watermark-image-url"
                  />
                  {draft.imageUrl ? (
                    <img
                      src={draft.imageUrl}
                      alt=""
                      className="h-14 w-14 rounded border border-border bg-muted object-contain"
                      style={{ opacity: draft.opacity ?? 1 }}
                    />
                  ) : null}
                </div>
              )}

              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t.watermarkPositionLabel}
                </Label>
                <Select
                  value={draft.position}
                  onValueChange={v =>
                    patch({ position: v as VdWatermarkPosition })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger data-testid="vd-watermark-position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VD_WATERMARK_POSITIONS.map(pos => (
                      <SelectItem key={pos} value={pos}>
                        {VD_WATERMARK_POSITION_LABELS[pos][lang === "th" ? "th" : "en"]}
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
                  onValueChange={([v]) =>
                    patch({ opacity: v ?? draft.opacity })
                  }
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
                  onValueChange={([v]) =>
                    patch({ scalePct: v ?? draft.scalePct })
                  }
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
                  onChange={e => patch({ marginPx: Number(e.target.value) })}
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
