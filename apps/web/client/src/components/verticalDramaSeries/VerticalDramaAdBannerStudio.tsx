/**
 * VerticalDramaAdBannerStudio (spec feature 131, task #30-A, F131W —
 * `planning/vertical-drama-ad-banner-overlay/plan.md` §6).
 *
 * Series-level ad banner design studio, rendered inside
 * `VerticalDramaProductTieInTab.tsx` behind the `verticalDramaSeriesAdBannerOverlay`
 * tenant flag. Up to 5 banner designs per series, each with a style preset
 * (10 2026 trends), a placement (bottom band / side vertical / fullscreen),
 * user-authored copy, a generated+editable image prompt, and an optional
 * rendered image. Banner design CRUD (add/remove/edit settings/approve)
 * persists through the EXISTING `updateSeries` merge-patch — mirroring
 * `VerticalDramaProductTieInTab.tsx`'s own read-modify-write convention —
 * while prompt/image generation use the 3 dedicated `verticalDramaSeries`
 * procedures (`generateAdBannerPrompt`, `generateAdBannerImage`,
 * `getAdBannerImageStatus`).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  Copy,
  Pencil,
  ImageIcon,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { trpc } from "@/lib/trpc";
import {
  pickCopy,
  verticalDramaAdBannerCopy,
  type VerticalDramaAdBannerLang,
} from "@/components/verticalDramaSeries/verticalDramaAdBannerCopy";
import {
  VD_AD_BANNER_STYLE_PRESETS,
  VD_AD_BANNER_PLACEMENT_PRESETS,
  VD_AD_BANNER_MAX_PER_SERIES,
  VD_AD_BANNER_FRAME_WIDTH,
  VD_AD_BANNER_FRAME_HEIGHT,
  getAdBannerPlacementPreset,
  resolvePlacementBox,
  recommendStylePresets,
  styleMatchesProductCategory,
  parseAdBannerDesigns,
  createDefaultAdBannerDesign,
  type VdAdBannerDesign,
  type VdAdBannerStyleId,
  type VdAdBannerPlacementId,
  type VdAdBannerPlacementBox,
} from "@shared/verticalDramaSeries/adBannerPresets";

/* -------------------------------------------------------------------------- */
/* Small pure helpers                                                        */
/* -------------------------------------------------------------------------- */

/** Media model aspect ratio list, reordered so the placement's `preferredModelAspects` come first (in their own preferred order), rest afterward. */
function orderAspectsByPreference(
  modelAspects: string[] | undefined | null,
  preferred: readonly string[]
): string[] {
  const available = modelAspects ?? [];
  const preferredPresent = preferred.filter(a => available.includes(a));
  const rest = available.filter(a => !preferred.includes(a));
  return [...preferredPresent, ...rest];
}

interface AdBannerImageModel {
  modelId: string;
  name: string;
  aspectRatios?: string[] | null;
  sizes?: string[] | null;
}

/* -------------------------------------------------------------------------- */
/* Placement schematic — tiny 9:16 box preview drawn with divs               */
/* -------------------------------------------------------------------------- */

function PlacementSchematic({
  box,
  size = "sm",
}: {
  box: VdAdBannerPlacementBox;
  size?: "sm" | "lg";
}) {
  const frameW = size === "sm" ? 32 : 108;
  const frameH = size === "sm" ? 56.9 : 192; // matches 9:16
  const scaleX = frameW / VD_AD_BANNER_FRAME_WIDTH;
  const scaleY = frameH / VD_AD_BANNER_FRAME_HEIGHT;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-sm border border-border bg-muted/60"
      style={{ width: frameW, height: frameH }}
      data-testid="vd-ad-banner-schematic"
    >
      <div
        className="absolute rounded-[1px] bg-primary/70"
        style={{
          left: box.x * scaleX,
          top: box.y * scaleY,
          width: Math.max(1, box.w * scaleX),
          height: Math.max(1, box.h * scaleY),
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Radio cards — mirrors VerticalDramaDeepStoryDraftsPanel's DeepDraftRadioCard
   styling convention (feedback: reuse existing UI patterns)                 */
/* -------------------------------------------------------------------------- */

function AdBannerRadioCard({
  id,
  value,
  checked,
  ariaLabel,
  title,
  hint,
  badge,
  schematic,
  disabled,
}: {
  id: string;
  value: string;
  checked: boolean;
  ariaLabel: string;
  title: string;
  hint: string;
  badge?: string;
  schematic?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg p-2.5 text-sm transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
        disabled && "cursor-not-allowed opacity-60",
        checked
          ? "border-2 border-primary bg-primary/5"
          : "border border-border bg-background hover:bg-accent/50"
      )}
    >
      <RadioGroupItem
        value={value}
        id={id}
        aria-label={ariaLabel}
        className="size-4 shrink-0"
        disabled={disabled}
      />
      {schematic}
      <span className="grid min-w-0 gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate", checked && "font-medium")}>
            {title}
          </span>
          {badge ? (
            <Badge
              variant="secondary"
              className="h-4 shrink-0 px-1 text-[10px]"
            >
              {badge}
            </Badge>
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline editable prompt box — minimal local variant of
   VerticalDramaStoryboardPanel's InlineEditablePromptBox (not exported from
   that file, so replicated minimally here per the reuse-existing-ui rule) */
/* -------------------------------------------------------------------------- */

function AdBannerPromptBox({
  lang,
  prompt,
  isEditing,
  draft,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancelEdit,
  disabled,
  testIdPrefix,
}: {
  lang: VerticalDramaAdBannerLang;
  prompt: string;
  isEditing: boolean;
  draft: string;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  disabled: boolean;
  testIdPrefix: string;
}) {
  const [copied, setCopied] = useState(false);
  const t = verticalDramaAdBannerCopy;
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-md bg-muted/50 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {pickCopy(lang, t.promptBoxTitle)}
        </span>
        <div className="flex items-center gap-1">
          {!isEditing && prompt ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prompt);
                  setCopied(true);
                  toast.success(pickCopy(lang, t.copiedPrompt));
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  // Clipboard access can fail (permissions/non-secure context) — non-fatal.
                }
              }}
              data-testid={`${testIdPrefix}-copy`}
            >
              {copied ? (
                <Check aria-hidden="true" className="h-3 w-3" />
              ) : (
                <Copy aria-hidden="true" className="h-3 w-3" />
              )}
              {pickCopy(lang, t.copyPrompt)}
            </Button>
          ) : null}
          {!isEditing && !disabled ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={onStartEdit}
              data-testid={`${testIdPrefix}-edit`}
            >
              <Pencil aria-hidden="true" className="h-3 w-3" />
              {pickCopy(lang, t.editPrompt)}
            </Button>
          ) : null}
        </div>
      </div>
      {isEditing ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            rows={4}
            className="text-xs"
            autoFocus
            data-testid={`${testIdPrefix}-textarea`}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
            >
              {pickCopy(lang, t.cancel)}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={onSave}
              data-testid={`${testIdPrefix}-save`}
            >
              <Check aria-hidden="true" className="h-3 w-3" />
              {pickCopy(lang, t.savePrompt)}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {prompt || pickCopy(lang, t.promptEmptyLabel)}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One banner card                                                           */
/* -------------------------------------------------------------------------- */

interface AdBannerCardProps {
  lang: VerticalDramaAdBannerLang;
  seriesId: string;
  design: VdAdBannerDesign;
  readOnly: boolean;
  recommendedStyleIds: VdAdBannerStyleId[];
  productCategory?: string | null;
  imageModels: AdBannerImageModel[];
  imageModelsLoading: boolean;
  onPersistPatch: (bannerId: string, patch: Partial<VdAdBannerDesign>) => void;
  onRemove: (bannerId: string) => void;
  onRefreshSeries: () => void;
}

function AdBannerCard({
  lang,
  seriesId,
  design,
  readOnly,
  recommendedStyleIds,
  productCategory,
  imageModels,
  imageModelsLoading,
  onPersistPatch,
  onRemove,
  onRefreshSeries,
}: AdBannerCardProps) {
  const t = verticalDramaAdBannerCopy;

  const [stylePresetId, setStylePresetId] = useState<VdAdBannerStyleId>(
    design.stylePresetId
  );
  const [placementId, setPlacementId] = useState<VdAdBannerPlacementId>(
    design.placementId
  );
  const [sideAlign, setSideAlign] = useState<"left" | "right">(
    design.sideAlign ?? "left"
  );
  const [headline, setHeadline] = useState(design.copy.headline ?? "");
  const [subtext, setSubtext] = useState(design.copy.subtext ?? "");
  const [priceText, setPriceText] = useState(design.copy.priceText ?? "");
  const [ctaText, setCtaText] = useState(design.copy.ctaText ?? "");
  const [timingMode, setTimingMode] = useState<"entire" | "window">(
    design.defaultTiming.mode
  );
  const [startSec, setStartSec] = useState(
    String(design.defaultTiming.startSec ?? 0)
  );
  const [durationSec, setDurationSec] = useState(
    String(design.defaultTiming.durationSec ?? 3)
  );
  const [modelId, setModelId] = useState(design.generation.modelId ?? "");
  const [aspectRatio, setAspectRatio] = useState(
    design.generation.aspectRatio ?? ""
  );
  const [size, setSize] = useState(design.generation.size ?? "");

  useEffect(() => {
    setStylePresetId(design.stylePresetId);
    setPlacementId(design.placementId);
    setSideAlign(design.sideAlign ?? "left");
    setHeadline(design.copy.headline ?? "");
    setSubtext(design.copy.subtext ?? "");
    setPriceText(design.copy.priceText ?? "");
    setCtaText(design.copy.ctaText ?? "");
    setTimingMode(design.defaultTiming.mode);
    setStartSec(String(design.defaultTiming.startSec ?? 0));
    setDurationSec(String(design.defaultTiming.durationSec ?? 3));
    setModelId(design.generation.modelId ?? "");
    setAspectRatio(design.generation.aspectRatio ?? "");
    setSize(design.generation.size ?? "");
  }, [design]);

  const dirty =
    stylePresetId !== design.stylePresetId ||
    placementId !== design.placementId ||
    sideAlign !== (design.sideAlign ?? "left") ||
    headline !== (design.copy.headline ?? "") ||
    subtext !== (design.copy.subtext ?? "") ||
    priceText !== (design.copy.priceText ?? "") ||
    ctaText !== (design.copy.ctaText ?? "") ||
    timingMode !== design.defaultTiming.mode ||
    (timingMode === "window" &&
      (startSec !== String(design.defaultTiming.startSec ?? 0) ||
        durationSec !== String(design.defaultTiming.durationSec ?? 3))) ||
    modelId !== (design.generation.modelId ?? "") ||
    aspectRatio !== (design.generation.aspectRatio ?? "") ||
    size !== (design.generation.size ?? "");

  const placement = getAdBannerPlacementPreset(placementId);
  const selectedModel = imageModels.find(m => m.modelId === modelId);
  const orderedAspects = orderAspectsByPreference(
    selectedModel?.aspectRatios,
    placement.preferredModelAspects
  );

  const handleSaveSettings = () => {
    onPersistPatch(design.id, {
      stylePresetId,
      placementId,
      ...(placementId === "side_vertical" ? { sideAlign } : {}),
      copy: {
        headline: headline.trim() || undefined,
        subtext: subtext.trim() || undefined,
        priceText: priceText.trim() || undefined,
        ctaText: ctaText.trim() || undefined,
      },
      defaultTiming:
        timingMode === "entire"
          ? { mode: "entire" }
          : {
              mode: "window",
              startSec: Number(startSec) || 0,
              durationSec: Number(durationSec) || 1,
            },
      generation: {
        modelId: modelId || undefined,
        aspectRatio: aspectRatio || undefined,
        size: size || undefined,
      },
    });
  };

  const handleApprove = () => {
    onPersistPatch(design.id, {
      approval: { required: true, approvedAt: new Date().toISOString() },
    });
  };

  /* ---- Prompt generation ---- */
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState(
    design.prompt.final ?? design.prompt.generated ?? ""
  );
  useEffect(() => {
    setPromptDraft(design.prompt.final ?? design.prompt.generated ?? "");
  }, [design.prompt.final, design.prompt.generated]);

  const utils = trpc.useUtils();
  const generatePromptMutation =
    trpc.verticalDramaSeries.generateAdBannerPrompt.useMutation({
      onSuccess: () => {
        toast.success(pickCopy(lang, t.generatePrompt) + " ✓");
        onRefreshSeries();
      },
      onError: (err: { message?: string }) => {
        toast.error(err?.message || pickCopy(lang, t.genericError));
      },
    });

  const handleGeneratePrompt = () => {
    generatePromptMutation.mutate({ seriesId, bannerId: design.id });
  };

  const handleSavePromptFinal = () => {
    onPersistPatch(design.id, {
      prompt: {
        ...design.prompt,
        final: promptDraft,
        editedAt: new Date().toISOString(),
      },
    });
    setIsEditingPrompt(false);
  };

  /* ---- Image generation + polling ---- */
  const [isPolling, setIsPolling] = useState(false);
  const generateImageMutation =
    trpc.verticalDramaSeries.generateAdBannerImage.useMutation({
      onError: (err: { message?: string }) => {
        toast.error(err?.message || pickCopy(lang, t.genericError));
      },
    });

  async function pollImageStatus() {
    setIsPolling(true);
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const result =
          await utils.verticalDramaSeries.getAdBannerImageStatus.fetch({
            seriesId,
            bannerId: design.id,
          });
        const status = (result as { taskStatus?: string | null })?.taskStatus;
        if (status === "completed") {
          toast.success(pickCopy(lang, t.statusReady));
          onRefreshSeries();
          return;
        }
        if (status === "failed") {
          const errorMessage = (result as { errorMessage?: string })
            ?.errorMessage;
          toast.error(
            `${pickCopy(lang, t.statusFailed)}${errorMessage ? `: ${errorMessage}` : ""}`
          );
          onRefreshSeries();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    } finally {
      setIsPolling(false);
    }
  }

  const handleGenerateImage = () => {
    generateImageMutation.mutate(
      { seriesId, bannerId: design.id },
      {
        onSuccess: () => {
          onRefreshSeries();
          void pollImageStatus();
        },
      }
    );
  };

  const isGenerating =
    design.status === "generating" ||
    generateImageMutation.isPending ||
    isPolling;

  const statusLabel = {
    draft: t.statusDraft,
    prompt_ready: t.statusPromptReady,
    generating: t.statusGenerating,
    ready: t.statusReady,
    failed: t.statusFailed,
  }[design.status];

  return (
    <Card data-testid={`vd-ad-banner-card-${design.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{placement.nameTh}</CardTitle>
          <Badge variant="outline" className="text-xs">
            {pickCopy(lang, statusLabel)}
          </Badge>
          {design.approval?.required && (
            <Badge
              variant={design.approval.approvedAt ? "secondary" : "destructive"}
              className="gap-1 text-xs"
              data-testid={`vd-ad-banner-approval-badge-${design.id}`}
            >
              {design.approval.approvedAt ? (
                <ShieldCheck aria-hidden="true" className="h-3 w-3" />
              ) : (
                <ShieldAlert aria-hidden="true" className="h-3 w-3" />
              )}
              {pickCopy(
                lang,
                design.approval.approvedAt
                  ? t.approvalApprovedBadge
                  : t.approvalRequiredBadge
              )}
            </Badge>
          )}
        </div>
        {!readOnly && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={() => onRemove(design.id)}
            aria-label={pickCopy(lang, t.removeBanner)}
            data-testid={`vd-ad-banner-remove-${design.id}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {design.approval?.required &&
          !design.approval.approvedAt &&
          !readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit gap-1.5"
              onClick={handleApprove}
              data-testid={`vd-ad-banner-approve-${design.id}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {pickCopy(lang, t.approveAction)}
            </Button>
          )}

        {/* Style preset picker */}
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {pickCopy(lang, t.styleSectionTitle)}
          </Label>
          <RadioGroup
            value={stylePresetId}
            onValueChange={v => setStylePresetId(v as VdAdBannerStyleId)}
            className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
          >
            {recommendedStyleIds.map(id => {
              const preset = VD_AD_BANNER_STYLE_PRESETS.find(p => p.id === id);
              if (!preset) return null;
              const matched = styleMatchesProductCategory(
                preset,
                productCategory ?? null
              );
              return (
                <AdBannerRadioCard
                  key={preset.id}
                  id={`vd-ad-banner-style-${design.id}-${preset.id}`}
                  value={preset.id}
                  checked={stylePresetId === preset.id}
                  ariaLabel={pickCopy(lang, {
                    th: preset.nameTh,
                    en: preset.nameEn,
                  })}
                  title={pickCopy(lang, {
                    th: preset.nameTh,
                    en: preset.nameEn,
                  })}
                  hint={pickCopy(lang, {
                    th: preset.essenceTh,
                    en: preset.essenceTh,
                  })}
                  badge={
                    matched ? pickCopy(lang, t.recommendedBadge) : undefined
                  }
                  disabled={readOnly}
                />
              );
            })}
          </RadioGroup>
        </div>

        {/* Placement picker */}
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {pickCopy(lang, t.placementSectionTitle)}
          </Label>
          <RadioGroup
            value={placementId}
            onValueChange={v => setPlacementId(v as VdAdBannerPlacementId)}
            className="grid gap-1.5"
          >
            {VD_AD_BANNER_PLACEMENT_PRESETS.map(preset => (
              <AdBannerRadioCard
                key={preset.id}
                id={`vd-ad-banner-placement-${design.id}-${preset.id}`}
                value={preset.id}
                checked={placementId === preset.id}
                ariaLabel={preset.nameTh}
                title={preset.nameTh}
                hint={preset.targetAspect}
                schematic={
                  <PlacementSchematic
                    box={resolvePlacementBox(preset, sideAlign)}
                  />
                }
                disabled={readOnly}
              />
            ))}
          </RadioGroup>
          {placementId === "side_vertical" && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                {pickCopy(lang, t.sideAlignLabel)}
              </Label>
              <RadioGroup
                value={sideAlign}
                onValueChange={v => setSideAlign(v as "left" | "right")}
                className="flex gap-3"
              >
                <label className="flex items-center gap-1 text-xs">
                  <RadioGroupItem
                    value="left"
                    id={`vd-ad-banner-side-left-${design.id}`}
                    disabled={readOnly}
                  />
                  {pickCopy(lang, t.sideAlignLeft)}
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <RadioGroupItem
                    value="right"
                    id={`vd-ad-banner-side-right-${design.id}`}
                    disabled={readOnly}
                  />
                  {pickCopy(lang, t.sideAlignRight)}
                </label>
              </RadioGroup>
            </div>
          )}
        </div>

        {/* Copy fields */}
        <div className="grid gap-2">
          <Label className="text-xs font-medium text-muted-foreground">
            {pickCopy(lang, t.copySectionTitle)}
          </Label>
          <Input
            placeholder={pickCopy(lang, t.headlineLabel)}
            value={headline}
            onChange={e => setHeadline(e.target.value)}
            disabled={readOnly}
            data-testid={`vd-ad-banner-headline-${design.id}`}
          />
          <Input
            placeholder={pickCopy(lang, t.subtextLabel)}
            value={subtext}
            onChange={e => setSubtext(e.target.value)}
            disabled={readOnly}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={pickCopy(lang, t.priceTextLabel)}
              value={priceText}
              onChange={e => setPriceText(e.target.value)}
              disabled={readOnly}
            />
            <Input
              placeholder={pickCopy(lang, t.ctaTextLabel)}
              value={ctaText}
              onChange={e => setCtaText(e.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Timing */}
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {pickCopy(lang, t.timingSectionTitle)}
          </Label>
          <RadioGroup
            value={timingMode}
            onValueChange={v => setTimingMode(v as "entire" | "window")}
            className="flex gap-3"
          >
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem
                value="entire"
                id={`vd-ad-banner-timing-entire-${design.id}`}
                disabled={readOnly}
              />
              {pickCopy(lang, t.timingEntire)}
            </label>
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem
                value="window"
                id={`vd-ad-banner-timing-window-${design.id}`}
                disabled={readOnly}
              />
              {pickCopy(lang, t.timingWindow)}
            </label>
          </RadioGroup>
          {timingMode === "window" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-[11px] text-muted-foreground">
                  {pickCopy(lang, t.timingStartSecLabel)}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={startSec}
                  onChange={e => setStartSec(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px] text-muted-foreground">
                  {pickCopy(lang, t.timingDurationSecLabel)}
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={durationSec}
                  onChange={e => setDurationSec(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
          )}
        </div>

        {/* Media model + aspect/size */}
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {pickCopy(lang, t.modelSectionTitle)}
          </Label>
          <Select
            value={modelId}
            onValueChange={setModelId}
            disabled={readOnly || imageModelsLoading}
          >
            <SelectTrigger data-testid={`vd-ad-banner-model-${design.id}`}>
              <SelectValue
                placeholder={
                  imageModelsLoading
                    ? pickCopy(lang, t.loadingModels)
                    : pickCopy(lang, t.modelLabel)
                }
              />
            </SelectTrigger>
            <SelectContent>
              {imageModels.map(m => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={aspectRatio}
              onValueChange={setAspectRatio}
              disabled={readOnly || !selectedModel}
            >
              <SelectTrigger>
                <SelectValue placeholder={pickCopy(lang, t.aspectRatioLabel)} />
              </SelectTrigger>
              <SelectContent>
                {orderedAspects.map(a => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={size}
              onValueChange={setSize}
              disabled={readOnly || !selectedModel}
            >
              <SelectTrigger>
                <SelectValue placeholder={pickCopy(lang, t.sizeLabel)} />
              </SelectTrigger>
              <SelectContent>
                {(selectedModel?.sizes ?? []).map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit gap-1.5"
            disabled={!dirty}
            onClick={handleSaveSettings}
            data-testid={`vd-ad-banner-save-settings-${design.id}`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {pickCopy(lang, t.saveChanges)}
          </Button>
        )}

        {/* Prompt generation */}
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            className="w-fit gap-1.5"
            disabled={generatePromptMutation.isPending}
            onClick={handleGeneratePrompt}
            data-testid={`vd-ad-banner-generate-prompt-${design.id}`}
          >
            {generatePromptMutation.isPending ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {generatePromptMutation.isPending
              ? pickCopy(lang, t.generatingPrompt)
              : pickCopy(lang, t.generatePrompt)}
          </Button>
        )}
        <AdBannerPromptBox
          lang={lang}
          prompt={design.prompt.final ?? design.prompt.generated ?? ""}
          isEditing={isEditingPrompt}
          draft={promptDraft}
          onStartEdit={() => setIsEditingPrompt(true)}
          onDraftChange={setPromptDraft}
          onSave={handleSavePromptFinal}
          onCancelEdit={() => {
            setPromptDraft(
              design.prompt.final ?? design.prompt.generated ?? ""
            );
            setIsEditingPrompt(false);
          }}
          disabled={readOnly}
          testIdPrefix={`vd-ad-banner-prompt-${design.id}`}
        />

        {/* Image generation + preview */}
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-fit gap-1.5"
            disabled={
              isGenerating || !(design.prompt.final || design.prompt.generated)
            }
            onClick={handleGenerateImage}
            data-testid={`vd-ad-banner-generate-image-${design.id}`}
          >
            {isGenerating ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isGenerating
              ? pickCopy(lang, t.generatingImage)
              : design.imageAsset
                ? pickCopy(lang, t.regenerateImage)
                : pickCopy(lang, t.generateImage)}
          </Button>
        )}

        <BannerFramePreview
          design={design}
          placementBox={resolvePlacementBox(placement, sideAlign)}
          lang={lang}
        />
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Mock frame preview — shows the (optional) generated image positioned on a
   9:16 mock frame at the placement's box                                    */
/* -------------------------------------------------------------------------- */

function BannerFramePreview({
  design,
  placementBox,
  lang,
}: {
  design: VdAdBannerDesign;
  placementBox: VdAdBannerPlacementBox;
  lang: VerticalDramaAdBannerLang;
}) {
  const frameW = 108;
  const frameH = 192;
  const scaleX = frameW / VD_AD_BANNER_FRAME_WIDTH;
  const scaleY = frameH / VD_AD_BANNER_FRAME_HEIGHT;
  const t = verticalDramaAdBannerCopy;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-md border border-border bg-muted"
      style={{ width: frameW, height: frameH }}
      data-testid={`vd-ad-banner-frame-preview-${design.id}`}
    >
      <div
        className="absolute overflow-hidden rounded-[2px] border border-primary/50 bg-primary/10"
        style={{
          left: placementBox.x * scaleX,
          top: placementBox.y * scaleY,
          width: Math.max(1, placementBox.w * scaleX),
          height: Math.max(1, placementBox.h * scaleY),
        }}
      >
        {design.imageAsset?.url ? (
          <AuthenticatedMediaImage
            src={design.imageAsset.url}
            alt={pickCopy(lang, t.imagePreviewAlt)}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main studio component                                                      */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaAdBannerStudioProps {
  lang: VerticalDramaAdBannerLang;
  seriesId: string;
  readOnly: boolean;
  productTieIn: Record<string, unknown> | null | undefined;
  productCategory?: string | null;
  onSaved?: () => void;
}

export function VerticalDramaAdBannerStudio({
  lang,
  seriesId,
  readOnly,
  productTieIn,
  productCategory,
  onSaved,
}: VerticalDramaAdBannerStudioProps) {
  const t = verticalDramaAdBannerCopy;
  const banners = parseAdBannerDesigns(productTieIn?.adBanners);
  const recommendedStyleIds = recommendStylePresets(productCategory ?? null);

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation({
    onSuccess: () => {
      void utils.verticalDramaSeries.get.invalidate();
      onSaved?.();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || pickCopy(lang, t.genericError));
    },
  });

  const imageModelsQuery = trpc.mediaModels.list.useQuery({ type: "image" });
  const imageModels = (imageModelsQuery.data?.models ??
    []) as AdBannerImageModel[];

  const persistBanners = (nextBanners: VdAdBannerDesign[]) => {
    const merged = { ...(productTieIn ?? {}), adBanners: nextBanners };
    updateMutation.mutate({ seriesId, productTieIn: merged });
  };

  const handlePersistPatch = (
    bannerId: string,
    patch: Partial<VdAdBannerDesign>
  ) => {
    const nextBanners = banners.map(b =>
      b.id === bannerId ? { ...b, ...patch } : b
    );
    persistBanners(nextBanners);
  };

  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(
    null
  );
  const handleRemove = (bannerId: string) => {
    if (confirmingRemoveId !== bannerId) {
      setConfirmingRemoveId(bannerId);
      return;
    }
    setConfirmingRemoveId(null);
    persistBanners(banners.filter(b => b.id !== bannerId));
  };

  const handleAdd = () => {
    if (banners.length >= VD_AD_BANNER_MAX_PER_SERIES) return;
    const defaultStyleId =
      recommendedStyleIds[0] ?? VD_AD_BANNER_STYLE_PRESETS[0].id;
    const newBanner = createDefaultAdBannerDesign({
      id: crypto.randomUUID(),
      stylePresetId: defaultStyleId,
      placementId: "bottom_band",
    });
    persistBanners([...banners, newBanner]);
  };

  const handleRefreshSeries = () => {
    void utils.verticalDramaSeries.get.invalidate();
  };

  const atLimit = banners.length >= VD_AD_BANNER_MAX_PER_SERIES;

  return (
    <Card data-testid="vd-ad-banner-studio">
      <CardHeader>
        <CardTitle className="text-base">
          {pickCopy(lang, t.sectionTitle)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {pickCopy(lang, t.sectionHint)}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {banners.length === 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="vd-ad-banner-empty-state"
          >
            {pickCopy(lang, t.emptyState)}
          </p>
        )}

        {banners.map(design => (
          <div key={design.id} className="grid gap-2">
            <AdBannerCard
              lang={lang}
              seriesId={seriesId}
              design={design}
              readOnly={readOnly}
              recommendedStyleIds={recommendedStyleIds}
              productCategory={productCategory}
              imageModels={imageModels}
              imageModelsLoading={imageModelsQuery.isLoading}
              onPersistPatch={handlePersistPatch}
              onRemove={handleRemove}
              onRefreshSeries={handleRefreshSeries}
            />
            {confirmingRemoveId === design.id && (
              <div
                className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs"
                data-testid={`vd-ad-banner-remove-confirm-${design.id}`}
              >
                <span>{pickCopy(lang, t.removeBannerConfirm)}</span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingRemoveId(null)}
                  >
                    {pickCopy(lang, t.cancel)}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemove(design.id)}
                    data-testid={`vd-ad-banner-remove-confirm-submit-${design.id}`}
                  >
                    {pickCopy(lang, t.confirm)}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!readOnly && (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              className="w-fit gap-1.5"
              disabled={atLimit}
              onClick={handleAdd}
              data-testid="vd-ad-banner-add"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {pickCopy(lang, t.addBanner)}
            </Button>
            {atLimit && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="vd-ad-banner-limit-hint"
              >
                {pickCopy(lang, t.limitReachedHint)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
