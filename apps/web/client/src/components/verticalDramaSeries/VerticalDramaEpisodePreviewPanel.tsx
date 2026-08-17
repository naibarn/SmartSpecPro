import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Clapperboard,
  Download,
  Expand,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  VideoOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { safeStorageGet, safeStorageSet } from "@/lib/safeLocalStorage";
import { WebAssetResolver } from "@/services/webAssetResolver";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { parseSeriesWatermarkConfig } from "@shared/verticalDramaSeries/textOverlay";
import type { VerticalDramaEpisodePreviewState } from "@shared/verticalDramaSeries/episodePreview";
import { useVerticalDramaCreditConfirmation } from "./VerticalDramaCreditConfirmDialog";
import { VerticalDramaEpisodeCoverSurface } from "./VerticalDramaEpisodeCoverSurface";
import type { VerticalDramaFinalRenderOptionsView } from "./VerticalDramaEpisodeWorkspace";

type PreviewShotOption = { shotNumber: number; ready: boolean };
type CoverModel = { modelId: string; name: string; isEnabled?: boolean };

const coverModelStorageKey = (seriesId: string) =>
  `smartspec_vd_series_${seriesId}_cover_model`;
const lastCoverModelStorageKey = "smartspec_vd_last_cover_model";

function readCoverModelPreference(seriesId: string): string {
  return (
    safeStorageGet(coverModelStorageKey(seriesId)) ??
    safeStorageGet(lastCoverModelStorageKey) ??
    ""
  );
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function VerticalDramaEpisodePreviewPanel({
  lang,
  seriesId,
  episodeId,
  episodeNumber,
  episodeTitle,
  watermark,
  shotOptions,
  previews,
  renderOptions,
  onPreviewChanged,
}: {
  lang: "th" | "en";
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle?: string | null;
  watermark?: unknown;
  shotOptions: PreviewShotOption[];
  previews: VerticalDramaEpisodePreviewState[];
  renderOptions?: Pick<
    VerticalDramaFinalRenderOptionsView,
    "subtitlePreset" | "subtitleFontSize"
  >;
  onPreviewChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const { requestConfirmation, creditConfirmDialog } =
    useVerticalDramaCreditConfirmation();
  const coverAssetResolverRef = useRef(new WebAssetResolver());
  const [coverModelId, setCoverModelId] = useState(() =>
    readCoverModelPreference(seriesId)
  );
  const [includeTitleLogo, setIncludeTitleLogo] = useState(true);
  const [includeChannelLogo, setIncludeChannelLogo] = useState(true);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [activeCoverSlotId, setActiveCoverSlotId] = useState<number | null>(null);
  const [selectedBySlot, setSelectedBySlot] = useState<
    Record<number, number[]>
  >(() =>
    Object.fromEntries(
      previews.map(preview => [preview.slotId, preview.selectedShotNumbers])
    )
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [failedPreviewSlots, setFailedPreviewSlots] = useState<Set<number>>(
    () => new Set(),
  );

  const imageModelsQuery = trpc.mediaModels.list.useQuery({
    type: "image",
    verticalDramaReady: true,
  });
  const imageModels = (imageModelsQuery.data?.models ?? []) as CoverModel[];
  const coverQuery1 = trpc.verticalDramaEpisodes.getEpisodeCoverStatus.useQuery({
    seriesId,
    episodeId,
    coverSlotId: 1,
  });
  const coverQuery2 = trpc.verticalDramaEpisodes.getEpisodeCoverStatus.useQuery({
    seriesId,
    episodeId,
    coverSlotId: 2,
  });
  const coverQuery3 = trpc.verticalDramaEpisodes.getEpisodeCoverStatus.useQuery({
    seriesId,
    episodeId,
    coverSlotId: 3,
  });
  const coverQuery4 = trpc.verticalDramaEpisodes.getEpisodeCoverStatus.useQuery({
    seriesId,
    episodeId,
    coverSlotId: 4,
  });
  const coverQueries = [coverQuery1, coverQuery2, coverQuery3, coverQuery4] as const;
  const coverImages = Array.from(
    new Map(
      coverQueries
        .flatMap(query => query.data?.coverImages ?? [])
        .map(item => [item.slotId, item] as const)
    ).values()
  );
  const coverImageBySlot = new Map(
    coverImages.map(item => [item.slotId, item.coverImage])
  );
  const hasReadyCover = coverImages.some(item => item.coverImage.status === "ready");
  const watermarkConfig = useMemo(
    () => parseSeriesWatermarkConfig(watermark),
    [watermark]
  );
  const hasTitleLogo = Boolean(
    watermarkConfig?.type === "image" && watermarkConfig.imageUrl
  );
  const hasChannelLogo = Boolean(
    watermarkConfig?.secondary?.type === "image" &&
    watermarkConfig.secondary.imageUrl
  );

  useEffect(() => {
    const stored = readCoverModelPreference(seriesId);
    if (
      stored &&
      imageModels.some(
        model => model.modelId === stored && model.isEnabled !== false
      ) &&
      coverModelId !== stored
    ) {
      setCoverModelId(stored);
    }
  }, [coverModelId, imageModels, seriesId]);

  useEffect(() => {
    if (!coverImages.some(item => item.coverImage.status === "generating")) return;
    const timer = window.setInterval(() => {
      void Promise.all(coverQueries.map(query => query.refetch()));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [coverImages, coverQueries]);

  useEffect(() => {
    setSelectedBySlot(current => {
      const next = { ...current };
      for (const preview of previews) {
        if (!next[preview.slotId]?.length)
          next[preview.slotId] = preview.selectedShotNumbers;
      }
      return next;
    });
  }, [previews]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxUrl]);

  const generateCoverMutation =
    trpc.verticalDramaEpisodes.generateEpisodeCover.useMutation({
      onSuccess: () => {
        setActiveCoverSlotId(null);
        void Promise.all(coverQueries.map(query => query.refetch()));
      },
      onError: error => {
        setActiveCoverSlotId(null);
        toast.error(error.message);
      },
    });
  const setCoverAssetMutation =
    trpc.verticalDramaEpisodes.setEpisodeCoverAsset.useMutation({
      onSuccess: () => {
        setActiveCoverSlotId(null);
        setUploadingCover(false);
        void Promise.all(coverQueries.map(query => query.refetch()));
        toast.success(lang === "th" ? "เปลี่ยนหน้าปกแล้ว" : "Cover replaced");
      },
      onError: error => {
        setActiveCoverSlotId(null);
        setUploadingCover(false);
        toast.error(error.message);
      },
    });
  const createPreviewMutation =
    trpc.verticalDramaEpisodes.createEpisodePreview.useMutation({
      onSuccess: () => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate({
          seriesId,
          episodeId,
        });
        onPreviewChanged?.();
        toast.success(
          lang === "th"
            ? "เริ่มสร้างตัวอย่างซีรีย์แล้ว"
            : "Episode preview render started"
        );
      },
      onError: error => toast.error(error.message),
    });

  const handleGenerateCover = (coverSlotId: number) => {
    if (!coverModelId || generateCoverMutation.isPending) return;
    const modelName =
      imageModels.find(model => model.modelId === coverModelId)?.name ??
      coverModelId;
    requestConfirmation({
      title:
        lang === "th"
          ? "ยืนยันสร้างหน้าปกตอนย่อย"
          : "Confirm Sub-episode cover generation",
      description:
        lang === "th"
          ? `ต้องการสร้างหน้าปกสำหรับ SUB-EP ${episodeNumber}${episodeTitle ? ` · ${episodeTitle}` : ""} ด้วย ${modelName} หรือไม่? การสร้างภาพด้วย AI จะหักเครดิตจากบัญชีของคุณ`
          : `Generate a cover for Sub-episode ${episodeNumber} with ${modelName}? AI image generation will spend credits from your account.`,
      confirmLabel: lang === "th" ? "สร้างหน้าปก" : "Generate cover",
      cancelLabel: lang === "th" ? "ยกเลิก" : "Cancel",
      testId: "vd-episode-preview-cover-confirm",
      onConfirm: () => {
        setActiveCoverSlotId(coverSlotId);
        generateCoverMutation.mutate({
          seriesId,
          episodeId,
          coverSlotId: coverSlotId as 1 | 2 | 3 | 4,
          modelId: coverModelId,
          includeTitleLogo,
          includeChannelLogo,
          idempotencyKey: newIdempotencyKey(),
        });
      },
    });
  };

  const handleUploadCover = async (file: File, coverSlotId: number) => {
    if (!file.type.startsWith("image/")) return;
    setActiveCoverSlotId(coverSlotId);
    setUploadingCover(true);
    try {
      const upload = coverAssetResolverRef.current.uploadAsset(file);
      const result = await upload.promise;
      if (!result.mediaAssetId) {
        throw new Error(
          lang === "th"
            ? "อัปโหลดหน้าปกไม่สำเร็จ: ไม่พบ media asset ID"
            : "Cover upload failed: the server did not return a media asset ID",
        );
      }
      setCoverAssetMutation.mutate({
        seriesId,
        episodeId,
        coverSlotId: coverSlotId as 1 | 2 | 3 | 4,
        mediaAssetId: result.mediaAssetId,
      });
    } catch (error) {
      setUploadingCover(false);
      setActiveCoverSlotId(null);
      toast.error(
        error instanceof Error ? error.message : "Cover upload failed"
      );
    }
  };

  const toggleShot = (slotId: number, shotNumber: number) => {
    setSelectedBySlot(current => {
      const selected = current[slotId] ?? [];
      const next = selected.includes(shotNumber)
        ? selected.filter(value => value !== shotNumber)
        : selected.length < 2
          ? [...selected, shotNumber]
          : selected;
      return { ...current, [slotId]: next.sort((a, b) => a - b) };
    });
  };

  const handleCreatePreview = (slotId: number) => {
    const selected = selectedBySlot[slotId] ?? [];
    if (selected.length !== 2 || createPreviewMutation.isPending) return;
    requestConfirmation({
      title:
        lang === "th"
          ? `ยืนยันสร้างตัวอย่างชุดที่ ${slotId}`
          : `Confirm preview set ${slotId}`,
      description:
        lang === "th"
          ? `ระบบจะรวมช็อต ${selected.join(" และ ")} พร้อมหน้าปกตอนนี้ด้วย Remotion และอาจมีการหักเครดิตสำหรับงาน render`
          : `Remotion will combine shots ${selected.join(" and ")} with this episode cover. The render job may spend credits.`,
      confirmLabel: lang === "th" ? "เริ่มสร้างตัวอย่าง" : "Render preview",
      cancelLabel: lang === "th" ? "ยกเลิก" : "Cancel",
      testId: `vd-episode-preview-confirm-${slotId}`,
      onConfirm: () => {
        createPreviewMutation.mutate({
          seriesId,
          episodeId,
          slotId: slotId as 1 | 2 | 3 | 4,
          selectedShotNumbers: selected as [number, number],
          subtitlePreset: renderOptions?.subtitlePreset ?? "classic_box",
          subtitleFontSize: renderOptions?.subtitleFontSize ?? "medium",
          idempotencyKey: newIdempotencyKey(),
        });
      },
    });
  };

  const previewBySlot = new Map<number, VerticalDramaEpisodePreviewState>(
    previews.map(preview => [preview.slotId, preview])
  );
  const hasPendingPreview = previews.some(
    preview => preview.status === "pending"
  );
  const readyShotCount = shotOptions.filter(option => option.ready).length;

  return (
    <section
      className="mt-2 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.04] shadow-sm"
      aria-labelledby="vd-episode-preview-title"
      data-testid="vd-episode-preview-panel"
    >
      <div className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              id="vd-episode-preview-title"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              {lang === "th"
                ? "ตัวอย่างซีรีย์ของตอนนี้"
                : "Episode series previews"}
            </p>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              {lang === "th"
                ? "เลือก 2 ช็อตเพื่อรวมเป็นตัวอย่างสั้น ระบบจะแสดงชื่อ Sub-EP ให้ชัดเจนและปิดท้ายด้วยหน้าปกตอนนี้ — สร้างได้สูงสุด 4 ชุด"
                : "Pick two shots for a short teaser. The Sub-EP title is shown clearly and the teaser ends with this episode cover — up to four sets."}
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Film className="h-3 w-3" aria-hidden="true" />
            {readyShotCount}/9 {lang === "th" ? "ช็อตพร้อมใช้" : "shots ready"}
          </Badge>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 p-4 sm:p-5 2xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
        <Card className="border-border/70 bg-background/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {lang === "th" ? "หน้าปกของตอน" : "Episode cover"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3" data-testid="vd-episode-cover-slots">
              {([1, 2, 3, 4] as const).map(coverSlotId => {
                const coverImage = coverImageBySlot.get(coverSlotId);
                const slotBusy =
                  (generateCoverMutation.isPending &&
                    activeCoverSlotId === coverSlotId) ||
                  (setCoverAssetMutation.isPending &&
                    activeCoverSlotId === coverSlotId);
                return (
                  <div
                    key={coverSlotId}
                    className="min-w-0 rounded-lg border border-border/60 bg-background/50 p-2"
                    data-testid={`vd-episode-cover-slot-${coverSlotId}`}
                  >
                    <p className="mb-2 text-xs font-semibold">
                      {lang === "th" ? `หน้าปกแบบที่ ${coverSlotId}` : `Cover variant ${coverSlotId}`}
                    </p>
                    <VerticalDramaEpisodeCoverSurface
                      lang={lang}
                      episodeNumber={episodeNumber}
                      title={episodeTitle}
                      imageUrl={coverImage?.url ?? null}
                      fallbackUrl={null}
                      status={coverImage?.status ?? undefined}
                      error={coverImage?.error ?? undefined}
                      isGenerating={slotBusy}
                      isUploading={slotBusy || uploadingCover}
                      canGenerate={Boolean(coverModelId) && !imageModelsQuery.isError}
                      onGenerate={() => handleGenerateCover(coverSlotId)}
                      onRetry={() => handleGenerateCover(coverSlotId)}
                      onOpen={url => setLightboxUrl(url)}
                      onUpload={file => void handleUploadCover(file, coverSlotId)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="w-full space-y-2">
              <Label className="text-xs text-muted-foreground">
                {lang === "th" ? "โมเดลสร้างหน้าปก" : "Cover model"}
              </Label>
              <Select
                value={coverModelId}
                onValueChange={value => {
                  setCoverModelId(value);
                  safeStorageSet(coverModelStorageKey(seriesId), value);
                  safeStorageSet(lastCoverModelStorageKey, value);
                }}
              >
                <SelectTrigger
                  className="h-9 text-xs"
                  data-testid="vd-episode-preview-cover-model"
                >
                  <SelectValue
                    placeholder={
                      lang === "th" ? "เลือกโมเดลภาพ" : "Choose image model"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[min(70vh,28rem)] overflow-y-auto">
                  {imageModels.map(model => (
                    <SelectItem
                      key={model.modelId}
                      value={model.modelId}
                      disabled={model.isEnabled === false}
                    >
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {lang === "th"
                  ? "กดไอคอนภาพบนหน้าปกเพื่อสร้างใหม่ ระบบจะยืนยันเครดิตก่อนทุกครั้ง"
                  : "Use the image button to regenerate; credit use is confirmed first."}
              </p>
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <p className="text-xs font-medium">
                  {lang === "th"
                    ? "โลโก้ที่แนบไปสร้างหน้าปก"
                    : "Logos sent with cover generation"}
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="vd-preview-title-logo"
                    checked={includeTitleLogo}
                    onCheckedChange={checked =>
                      setIncludeTitleLogo(checked === true)
                    }
                    disabled={!hasTitleLogo}
                  />
                  <Label htmlFor="vd-preview-title-logo" className="text-xs">
                    {lang === "th" ? "โลโก้ชื่อเรื่อง" : "Title logo"}
                    {!hasTitleLogo ? " (ยังไม่มีภาพ)" : ""}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="vd-preview-channel-logo"
                    checked={includeChannelLogo}
                    onCheckedChange={checked =>
                      setIncludeChannelLogo(checked === true)
                    }
                    disabled={!hasChannelLogo}
                  />
                  <Label htmlFor="vd-preview-channel-logo" className="text-xs">
                    {lang === "th" ? "โลโก้ชื่อช่อง" : "Channel logo"}
                    {!hasChannelLogo ? " (ยังไม่มีภาพ)" : ""}
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {lang === "th"
                  ? "เลือกช็อตสำหรับแต่ละชุด"
                  : "Choose shots per set"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "th"
                  ? "เลือกได้ 2 ช็อตต่อชุด · ช็อตที่ยังไม่มีวิดีโอจะกดไม่ได้"
                  : "Select two shots per set · shots without a rendered video are disabled."}
              </p>
              {readyShotCount < 2 ? (
                <p
                  className="mt-1 text-[11px] text-amber-700 dark:text-amber-400"
                  data-testid="vd-episode-preview-video-requirement"
                >
                  {lang === "th"
                    ? "สร้างหรืออัปโหลดวิดีโอให้พร้อมอย่างน้อย 2 ช็อตก่อนจึงจะสร้างตัวอย่างได้ — หน้าปกยังสร้างได้จากภาพ"
                    : "Render or upload at least two video shots before creating a preview — the cover can still be generated from images."}
                </p>
              ) : null}
            </div>
            <Badge variant="secondary">
              {lang === "th" ? "สูงสุด 4 ชุด" : "Up to 4 sets"}
            </Badge>
          </div>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
            {[1, 2, 3, 4].map(slotId => {
              const preview = previewBySlot.get(slotId);
              const selected = selectedBySlot[slotId] ?? [];
              const busy =
                createPreviewMutation.isPending &&
                createPreviewMutation.variables?.slotId === slotId;
              return (
                <Card
                  key={slotId}
                  className="min-w-0 border-border/70 bg-background/50 shadow-none"
                  data-testid={`vd-episode-preview-slot-${slotId}`}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm">
                      {lang === "th"
                        ? `ชุดตัวอย่างที่ ${slotId}`
                        : `Preview set ${slotId}`}
                    </CardTitle>
                    {preview?.status === "completed" ? (
                      <Badge className="gap-1 bg-emerald-600 text-[10px]">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        พร้อมดู
                      </Badge>
                    ) : preview?.status === "pending" ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Loader2
                          className="h-3 w-3 animate-spin"
                          aria-hidden="true"
                        />
                        กำลัง render
                      </Badge>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      className="grid grid-cols-3 gap-1.5 sm:grid-cols-3"
                      role="group"
                      aria-label={
                        lang === "th"
                          ? `เลือกช็อตสำหรับชุดที่ ${slotId}`
                          : `Select shots for preview set ${slotId}`
                      }
                    >
                      {shotOptions.map(option => {
                        const checked = selected.includes(option.shotNumber);
                        return (
                          <label
                            key={option.shotNumber}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${checked ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-muted/50"} ${!option.ready ? "cursor-not-allowed opacity-45" : ""}`}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={
                                !option.ready ||
                                (!checked && selected.length >= 2)
                              }
                              onCheckedChange={() =>
                                toggleShot(slotId, option.shotNumber)
                              }
                              aria-label={`${lang === "th" ? "ช็อต" : "Shot"} ${option.shotNumber}`}
                            />
                            <span>{option.shotNumber}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {selected.length}/2{" "}
                        {lang === "th" ? "ช็อตที่เลือก" : "shots selected"}
                      </span>
                      {preview?.status === "failed" ? (
                        <span className="text-destructive">
                          {preview.error ||
                            (lang === "th" ? "ล้มเหลว" : "Failed")}
                        </span>
                      ) : null}
                    </div>
                    {preview?.status === "completed" && preview.videoUrl ? (
                      failedPreviewSlots.has(slotId) ? (
                        <div
                          className="flex aspect-[9/16] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-400/70 bg-amber-50/50 px-2 text-center text-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
                          data-testid={`vd-episode-preview-expired-${slotId}`}
                        >
                          <VideoOff className="h-5 w-5" aria-hidden="true" />
                          <span className="text-xs font-medium">
                            {lang === "th" ? "ไฟล์หมดอายุ" : "File expired"}
                          </span>
                          <span className="text-[10px]">
                            {lang === "th"
                              ? "กดสร้างชุดนี้ใหม่ด้านล่าง"
                              : "Render this set again below"}
                          </span>
                        </div>
                      ) : (
                      <div className="space-y-2">
                        <div className="overflow-hidden rounded-lg border border-border bg-black">
                          <video
                            src={preview.videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="aspect-[9/16] w-full bg-black"
                            id={`vd-episode-preview-player-${slotId}`}
                            data-testid={`vd-episode-preview-player-${slotId}`}
                            onError={() =>
                              setFailedPreviewSlots(current =>
                                new Set(current).add(slotId),
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-[11px]"
                            onClick={() => {
                              const el = document.getElementById(
                                `vd-episode-preview-player-${slotId}`
                              ) as HTMLVideoElement | null;
                              if (el?.requestFullscreen)
                                void el
                                  .requestFullscreen()
                                  .catch(() => undefined);
                            }}
                            data-testid={`vd-episode-preview-fullscreen-${slotId}`}
                          >
                            <Expand className="h-3 w-3" aria-hidden="true" />
                            {lang === "th" ? "เต็มจอ" : "Fullscreen"}
                          </Button>
                          <a
                            href={preview.videoUrl}
                            download={`sub-ep-${episodeNumber}-preview-${slotId}.mp4`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-[11px] font-medium hover:bg-accent"
                          >
                            <Download className="h-3 w-3" aria-hidden="true" />
                            {lang === "th" ? "ดาวน์โหลด" : "Download"}
                          </a>
                        </div>
                      </div>
                      )
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="w-full gap-1.5"
                      disabled={
                        selected.length !== 2 ||
                        busy ||
                        hasPendingPreview ||
                        !hasReadyCover
                      }
                      onClick={() => handleCreatePreview(slotId)}
                      data-testid={`vd-episode-preview-create-${slotId}`}
                    >
                      {busy ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : preview?.status === "completed" ? (
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {preview?.status === "completed"
                        ? lang === "th"
                          ? "สร้างชุดนี้ใหม่"
                          : "Render this set again"
                        : lang === "th"
                          ? "สร้างตัวอย่างชุดนี้"
                          : "Render this set"}
                    </Button>
                    {!hasReadyCover ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        {lang === "th"
                          ? "สร้างหน้าปกอย่างน้อย 1 แบบให้เสร็จก่อนจึงจะสร้างตัวอย่างได้"
                          : "Generate at least one episode cover before rendering a preview."}
                      </p>
                    ) : null}
                    {hasPendingPreview ? (
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "th"
                          ? "รอชุดที่กำลัง render เสร็จก่อน แล้วจึงสร้างชุดถัดไปได้"
                          : "Wait for the active preview render to finish before starting another set."}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {lightboxUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightboxUrl(null)}
          aria-label={
            lang === "th" ? "ปิดหน้าปกเต็มจอ" : "Close fullscreen cover"
          }
        >
          <AuthenticatedMediaImage
            src={lightboxUrl}
            alt={lang === "th" ? "หน้าปกตอนย่อย" : "Episode cover"}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        </button>
      ) : null}
      {creditConfirmDialog}
    </section>
  );
}
