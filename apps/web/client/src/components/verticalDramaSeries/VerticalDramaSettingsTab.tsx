/**
 * VerticalDramaSettingsTab (spec feature 131, section-10/11 — Series detail
 * "Settings" tab).
 *
 * Minimal series-level configuration: title + status. Saves via the existing
 * `verticalDramaSeries.updateSeries` mutation (title/status fields only —
 * `bible`/`policy`/`productTieIn` are left untouched by omitting them from the
 * payload). Disabled entirely when the series is archived (`readOnly`).
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const STATUS_OPTIONS: VerticalDramaSeriesStatus[] = [
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
];

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

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation({
    onSuccess: () => {
      toast.success(lang === "th" ? "บันทึกการตั้งค่าแล้ว" : "Settings saved");
      void utils.verticalDramaSeries.get.invalidate();
      onSaved?.();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "บันทึกไม่สำเร็จ" : "Failed to save settings"));
    },
  });

  const regionMutation = trpc.verticalDramaSeries.setSeriesTargetAudienceRegion.useMutation({
    onSuccess: () => {
      toast.success(lang === "th" ? "บันทึกกลุ่มผู้ชมเป้าหมายแล้ว" : "Target audience region saved");
      void utils.verticalDramaSeries.get.invalidate();
      onSaved?.();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "บันทึกไม่สำเร็จ" : "Failed to save settings"));
    },
  });

  const dirty = titleInput !== title || statusInput !== status;
  const regionDirty = regionInput !== bibleRegion;

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
    { label: { th: "ภาษา", en: "Locale" }, value: locale },
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
              disabled={readOnly || updateMutation.isPending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "สถานะ" : "Status"}
            </Label>
            <Select
              value={statusInput}
              onValueChange={(v) => setStatusInput(v as VerticalDramaSeriesStatus)}
              disabled={readOnly || updateMutation.isPending}
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
              disabled={readOnly || regionMutation.isPending}
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
            {!readOnly && (
              <Button
                variant="outline"
                onClick={() =>
                  regionMutation.mutate({ seriesId, targetAudienceRegion: regionInput })
                }
                disabled={regionMutation.isPending || !regionDirty}
                className="w-fit gap-2"
              >
                {regionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {regionMutation.isPending
                  ? lang === "th"
                    ? "กำลังบันทึก…"
                    : "Saving…"
                  : lang === "th"
                    ? "บันทึกกลุ่มผู้ชมเป้าหมาย"
                    : "Save target audience"}
              </Button>
            )}
          </div>

          {!readOnly && (
            <Button
              onClick={() =>
                updateMutation.mutate({
                  seriesId,
                  title: titleInput.trim() || undefined,
                  status: statusInput,
                })
              }
              disabled={updateMutation.isPending || !dirty || titleInput.trim().length === 0}
              className="w-fit gap-2"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {updateMutation.isPending
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
