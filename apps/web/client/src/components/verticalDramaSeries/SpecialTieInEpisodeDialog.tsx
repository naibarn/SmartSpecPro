import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Expand,
  ImagePlus,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { trpc } from "@/lib/trpc";
import {
  canAddSpecialReferences,
  resolveSpecialTieInCharacterId,
  toggleBoundedSelection,
} from "@/lib/specialTieInUi";
import {
  specialTieInInputSchema,
  SPECIAL_TIE_IN_DURATIONS_SECONDS,
  type SpecialModelSnapshot,
  type SpecialTieInInput,
} from "@shared/verticalDramaSeries/specialTieInContracts";
import type { MarketplaceReviewIdea } from "@shared/marketplaceReviewIdeas/contracts";
import {
  footageBrollPlacementSchema,
  footageGuideSchema,
  mediaSourceManifestSchema,
  type FootageBrollPlacement,
  type MediaSourceManifest,
} from "@shared/verticalDramaMedia/contracts";

type ReferenceType = "product" | "location" | "store" | "mixed";
type Reference = {
  mediaAssetId: string;
  source: "upload" | "marketplace_capture" | "series_asset";
  role?: "product" | "location" | "store";
  label?: string;
  previewUrl?: string;
  provenance?: Record<string, unknown>;
};

type FootageBrollAsset = {
  manifest: MediaSourceManifest;
  previewUrl: string;
  thumbnailUrl?: string | null;
};

function parseEditableDialogueScript(
  script: string,
  fallback: MarketplaceReviewIdea["dialogue"]
): MarketplaceReviewIdea["dialogue"] {
  const parsed = script
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line => {
      const separator = line.indexOf(":");
      if (separator <= 0) return null;
      const speaker = line.slice(0, separator).trim();
      const spokenLine = line.slice(separator + 1).trim();
      return speaker && spokenLine ? { speaker, line: spokenLine } : null;
    })
    .filter((line): line is { speaker: string; line: string } => Boolean(line))
    .slice(0, 12);
  return parsed.length > 0 ? parsed : fallback;
}

type CharacterPortraitAsset = {
  characterId?: string;
  role?: string;
  approved?: boolean;
  state?: string;
  thumbnailUrl?: string;
  updatedAt?: string;
};

type PublicMediaModel = {
  modelId: string;
  name?: string | null;
  provider?: string | null;
  aspectRatios?: string[] | null;
  durations?: number[] | null;
  supportsStartFrame?: boolean;
  maxReferenceImages?: number | null;
  nativeAudioDialogue?: boolean;
};

type IdeaLlmModel = {
  modelId: string;
  label: string;
  provider: string;
  isRecommended: boolean;
  isDefault: boolean;
};

function SpecialTieInModelCombobox({
  models,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  ariaLabel,
  disabled = false,
}: {
  models: SpecialModelSnapshot[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel = models.find(model => model.modelId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled || models.length === 0}
          className="h-auto min-h-9 w-full justify-between gap-2 text-left font-normal"
        >
          <span className="min-w-0 flex-1 truncate">
            {(selectedModel?.label ?? selectedModel?.modelId ?? value) || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[min(60vh,28rem)]">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {models.map(model => (
              <CommandItem
                key={model.modelId}
                value={`${model.label ?? model.modelId} ${model.modelId} ${model.provider}`}
                onSelect={() => {
                  onValueChange(model.modelId);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${value === model.modelId ? "opacity-100" : "opacity-0"}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {model.label ?? model.modelId}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    9:16 · {model.provider}
                    {model.supportedDurationsSeconds.length > 0
                      ? ` · ${model.supportedDurationsSeconds.join(", ")}s`
                      : ""}
                    {model.maxReferenceImages != null
                      ? ` · ${model.maxReferenceImages} refs`
                      : ""}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function IdeaLlmModelCombobox({
  models,
  value,
  onValueChange,
  lang,
  disabled = false,
}: {
  models: IdeaLlmModel[];
  value: string;
  onValueChange: (value: string) => void;
  lang: "th" | "en";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find(model => model.modelId === value);
  const selectedLabel = value === "auto"
    ? lang === "th" ? "อัตโนมัติ (แนะนำ)" : "Automatic (recommended)"
    : selected?.label ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={lang === "th" ? "เลือก LLM สร้างไอเดีย" : "Select idea LLM"}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between gap-2 text-left font-normal"
        >
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder={lang === "th" ? "ค้นหา LLM สร้างไอเดีย..." : "Search idea LLMs..."} />
          <CommandList className="max-h-[min(60vh,28rem)]">
            <CommandEmpty>{lang === "th" ? "ไม่พบ LLM ที่เลือกได้" : "No eligible LLM found"}</CommandEmpty>
            <CommandItem
              value="auto automatic recommended"
              onSelect={() => {
                onValueChange("auto");
                setOpen(false);
              }}
            >
              <Check className={`mr-2 h-4 w-4 ${value === "auto" ? "opacity-100" : "opacity-0"}`} />
              <span>
                <span className="block font-medium">{lang === "th" ? "อัตโนมัติ (แนะนำ)" : "Automatic (recommended)"}</span>
                <span className="block text-xs text-muted-foreground">{lang === "th" ? "ระบบเลือกจาก model ที่ admin แนะนำและพร้อมใช้งาน" : "Choose from admin-recommended, routable models"}</span>
              </span>
            </CommandItem>
            {models.map(model => (
              <CommandItem
                key={model.modelId}
                value={`${model.label} ${model.modelId} ${model.provider}`}
                onSelect={() => {
                  onValueChange(model.modelId);
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${value === model.modelId ? "opacity-100" : "opacity-0"}`} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {model.label}
                    {model.isRecommended ? <Badge variant="secondary" className="ml-2">{lang === "th" ? "แนะนำ" : "Recommended"}</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{model.provider}{model.isDefault ? ` · ${lang === "th" ? "ค่าเริ่มต้น" : "default"}` : ""}</span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function sha256Fingerprint(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  // Browser crypto is available in supported production browsers. This
  // deterministic fallback keeps the editor usable in older test harnesses;
  // the server still validates the resulting prepare payload and source revision.
  return "0".repeat(64);
}

export function SpecialTieInEpisodeDialog({
  lang,
  seriesId,
  open,
  onOpenChange,
  onCreated,
  initialInput,
  onSubmitInput,
}: {
  lang: "th" | "en";
  seriesId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (episodeId: string) => void;
  initialInput?: SpecialTieInInput | null;
  onSubmitInput?: (input: SpecialTieInInput) => Promise<void>;
}) {
  const [idea, setIdea] = useState("");
  const [referenceType, setReferenceType] = useState<ReferenceType>("product");
  const [references, setReferences] = useState<Reference[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [speakerCharacterIds, setSpeakerCharacterIds] = useState<string[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [dialogueMode, setDialogueMode] = useState<
    "none" | "character_dialogue"
  >("none");
  const [dialogueBrief, setDialogueBrief] = useState("");
  const [allowAdditionalCharacters, setAllowAdditionalCharacters] =
    useState(false);
  const [lockCharacterReferences, setLockCharacterReferences] = useState(true);
  const [lockReferenceImages, setLockReferenceImages] = useState(true);
  const [imageModelId, setImageModelId] = useState("");
  const [videoModelId, setVideoModelId] = useState("");
  const [ideaLlmModelId, setIdeaLlmModelId] = useState("auto");
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [pendingImageIds, setPendingImageIds] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [ideaHistory, setIdeaHistory] = useState<Array<{ runId: string; ideas: MarketplaceReviewIdea[] }>>([]);
  const [freshIdeaRunId, setFreshIdeaRunId] = useState<string | null>(null);
  const [showIdeaHistory, setShowIdeaHistory] = useState(false);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedMarketplaceIdea, setSelectedMarketplaceIdea] =
    useState<MarketplaceReviewIdea | null>(null);
  const [footageAssetId, setFootageAssetId] = useState<number | null>(null);
  const [footageFileName, setFootageFileName] = useState("");
  const [footagePreviewUrl, setFootagePreviewUrl] = useState<string | null>(null);
  const [footageAnalysisJobId, setFootageAnalysisJobId] = useState<string | null>(null);
  const [footagePrepareJobId, setFootagePrepareJobId] = useState<string | null>(null);
  const [footageTrimStartMs, setFootageTrimStartMs] = useState(0);
  const [footageTrimEndMs, setFootageTrimEndMs] = useState(0);
  const [footageFullscreen, setFootageFullscreen] = useState(false);
  const [brollAssetId, setBrollAssetId] = useState("");
  const [brollStartMs, setBrollStartMs] = useState(0);
  const [brollEndMs, setBrollEndMs] = useState(5000);
  const [brollSourceInMs, setBrollSourceInMs] = useState(0);
  const [brollPlacements, setBrollPlacements] = useState<FootageBrollPlacement[]>([]);
  const [brollRenderJobId, setBrollRenderJobId] = useState<string | null>(null);
  const [brollFullscreen, setBrollFullscreen] = useState(false);
  const debouncedProductQuery = useDebouncedValue(productQuery, 300);

  const charactersQuery = trpc.verticalDramaCharacters.listCharacters.useQuery(
    { seriesId },
    { enabled: open }
  );
  const modelsQuery =
    trpc.verticalDramaEpisodes.listSpecialTieInModels.useQuery(
      {
        durationSeconds: durationSeconds as 8 | 10 | 12 | 15 | 20 | 24 | 30,
        aspectRatio: "9:16",
        dialogueMode,
        referenceType,
        referenceImageCount: Math.max(1, references.length),
      },
      { enabled: open }
    );
  const ideaLlmModelsQuery =
    trpc.verticalDramaEpisodes.listMarketplaceReviewIdeaModels.useQuery(
      undefined,
      { enabled: open, staleTime: 30_000, refetchOnWindowFocus: false }
    );
  const publicImageModelsQuery = trpc.mediaModels.list.useQuery(
    { type: "image", verticalDramaReady: true },
    { enabled: open, staleTime: 30_000, refetchOnWindowFocus: false }
  );
  const publicVideoModelsQuery = trpc.mediaModels.list.useQuery(
    { type: "video", verticalDramaReady: true },
    { enabled: open, staleTime: 30_000, refetchOnWindowFocus: false }
  );
  const productsQuery = trpc.marketplaceCapture.listProducts.useInfiniteQuery(
    {
      limit: 20,
      cursor: null,
      query: debouncedProductQuery.trim() || undefined,
      ownerOnly: false,
      platform: "all",
      sortMode: "updated",
    },
    {
      enabled: open && marketplaceOpen,
      initialCursor: null,
      getNextPageParam: lastPage =>
        Array.isArray(lastPage)
          ? undefined
          : (lastPage.nextCursor ?? undefined),
      refetchOnWindowFocus: false,
    }
  );
  const imagesQuery =
    trpc.marketplaceCapture.listProductImages.useInfiniteQuery(
      {
        productId: selectedProductId,
        limit: 30,
        cursor: null,
        ownerOnly: false,
        platform: "all",
      },
      {
        enabled: open && marketplaceOpen && Boolean(selectedProductId),
        initialCursor: null,
        getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
        refetchOnWindowFocus: false,
      }
    );
  const locationsQuery = trpc.verticalDramaLocations.list.useQuery(
    { seriesId },
    {
      enabled:
        open &&
        (referenceType === "location" ||
          referenceType === "store" ||
          referenceType === "mixed"),
      staleTime: 15_000,
    }
  );
  const locationAssetsQuery =
    trpc.verticalDramaLocations.listLocationAssets.useQuery(
      { seriesId, locationId: selectedLocationId ?? "" },
      {
        enabled: open && Boolean(selectedLocationId),
        staleTime: 10_000,
      }
    );
  const uploadMutation = trpc.ai.upload.useMutation();
  const registerUploadMutation =
    trpc.verticalDramaSeries.registerUploadedSourceMedia.useMutation();
  const materializeMutation =
    trpc.verticalDramaEpisodes.materializeSpecialMarketplaceImage.useMutation();
  const createMutation =
    trpc.verticalDramaEpisodes.createSpecialTieInEpisode.useMutation();
  const generateIdeasMutation =
    trpc.verticalDramaEpisodes.generateMarketplaceReviewIdeas.useMutation();
  const selectIdeaMutation =
    trpc.verticalDramaEpisodes.selectMarketplaceReviewIdea.useMutation();
  const footageAnalysisMutation =
    trpc.verticalDramaEpisodes.enqueueSpecialTieInFootageAnalysis.useMutation();
  const footagePrepareMutation =
    trpc.verticalDramaEpisodes.enqueueSpecialTieInFootagePreparation.useMutation();
  const brollRenderMutation =
    trpc.verticalDramaEpisodes.enqueueSpecialTieInFootageBrollRender.useMutation();
  const brollAssetsQuery =
    trpc.verticalDramaEpisodes.listSpecialTieInFootageAssets.useQuery(
      { seriesId },
      { enabled: open && Boolean(footagePrepareJobId), staleTime: 15_000, refetchOnWindowFocus: false }
    );
  const brollRenderJobQuery =
    trpc.verticalDramaEpisodes.getSpecialTieInFootageJob.useQuery(
      { jobId: brollRenderJobId ?? "pending-footage-broll-render" },
      {
        enabled: open && Boolean(brollRenderJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return brollRenderJobId && !["completed", "published", "failed", "canceled", "expired"].includes(status ?? "") ? 2500 : false;
        },
        refetchOnWindowFocus: false,
      }
    );
  const footageAnalysisJobQuery =
    trpc.verticalDramaEpisodes.getSpecialTieInFootageJob.useQuery(
      { jobId: footageAnalysisJobId ?? "pending-footage-analysis" },
      {
        enabled: open && Boolean(footageAnalysisJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return footageAnalysisJobId && !["completed", "published", "failed", "canceled", "expired", "quarantined"].includes(status ?? "") ? 2500 : false;
        },
        refetchOnWindowFocus: false,
      }
    );
  const footagePrepareJobQuery =
    trpc.verticalDramaEpisodes.getSpecialTieInFootageJob.useQuery(
      { jobId: footagePrepareJobId ?? "pending-footage-prepare" },
      {
        enabled: open && Boolean(footagePrepareJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return footagePrepareJobId && !["completed", "published", "failed", "canceled", "expired"].includes(status ?? "") ? 2500 : false;
        },
        refetchOnWindowFocus: false,
      }
    );
  const ideaHistoryQuery =
    trpc.verticalDramaEpisodes.listMarketplaceReviewIdeas.useQuery(
      { seriesId, productId: selectedProductId ?? undefined },
      { enabled: open && Boolean(selectedProductId), staleTime: 10_000 }
    );
  const footageAnalysisOutput = footageAnalysisJobQuery.data?.outputJson as {
    guide?: { probe?: { durationMs?: number | null }; status?: { guide?: string; warnings?: string[] } };
  } | null | undefined;
  const footageDurationMs = Number(footageAnalysisOutput?.guide?.probe?.durationMs ?? 0);
  const footageAnalysisDone = ["published", "completed"].includes(footageAnalysisJobQuery.data?.status ?? "");
  const footagePrepared = ["completed", "published"].includes(footagePrepareJobQuery.data?.status ?? "");
  const preparedSource = mediaSourceManifestSchema.safeParse(
    (footagePrepareJobQuery.data?.outputJson as { preparedSource?: unknown } | null | undefined)?.preparedSource
  );
  const preparedDurationMs = preparedSource.success && preparedSource.data.durationMs != null
    ? preparedSource.data.durationMs
    : footageDurationMs;
  const brollAssets = (brollAssetsQuery.data?.assets ?? []) as FootageBrollAsset[];
  const brollOutput = brollRenderJobQuery.data?.outputJson as { outputUrl?: string } | null | undefined;
  const brollOutputUrl = typeof brollOutput?.outputUrl === "string" ? brollOutput.outputUrl : null;

  useEffect(() => {
    if (!open || !initialInput) return;
    setIdea(initialInput.idea);
    setReferenceType(initialInput.referenceType);
    setReferences(initialInput.referenceImages);
    setCharacterIds(initialInput.characterIds);
    setSpeakerCharacterIds(initialInput.speakerCharacterIds);
    setDurationSeconds(initialInput.durationSeconds);
    setDialogueMode(initialInput.dialogueMode);
    setDialogueBrief(initialInput.dialogueBrief ?? "");
    setAllowAdditionalCharacters(initialInput.allowAdditionalCharacters);
    setLockCharacterReferences(initialInput.lockCharacterReferences);
    setLockReferenceImages(initialInput.lockReferenceImages);
    setImageModelId(initialInput.imageModelId);
    setVideoModelId(initialInput.videoModelId);
    setIdeaLlmModelId("auto");
    setSelectedMarketplaceIdea(initialInput.marketplaceReviewIdea ?? null);
    if (initialInput.footage) {
      setFootageAssetId(Number(initialInput.footage.sourceMediaAssetId.replace(/^media-/, "")));
      setFootageAnalysisJobId(initialInput.footage.analysisJobId);
      setFootagePrepareJobId(initialInput.footage.prepareJobId);
      setFootageTrimEndMs(initialInput.footage.guide.probe.durationMs ?? 0);
    }
    if (initialInput.broll) {
      setBrollPlacements(initialInput.broll.placements);
      setBrollRenderJobId(initialInput.broll.renderJobId ?? null);
    }
  }, [open, initialInput]);

  useEffect(() => {
    if (footageAssetId && !footagePreviewUrl) {
      const source = brollAssets.find(asset => asset.manifest.assetId === `media-${footageAssetId}`);
      if (source?.previewUrl) setFootagePreviewUrl(source.previewUrl);
    }
  }, [brollAssets, footageAssetId, footagePreviewUrl]);

  useEffect(() => {
    if (!open) {
      setFootageAssetId(null);
      setFootageFileName("");
      setFootagePreviewUrl(null);
      setFootageAnalysisJobId(null);
      setFootagePrepareJobId(null);
      setFootageTrimStartMs(0);
      setFootageTrimEndMs(0);
      setFootageFullscreen(false);
      setBrollAssetId("");
      setBrollStartMs(0);
      setBrollEndMs(5000);
      setBrollSourceInMs(0);
      setBrollPlacements([]);
      setBrollRenderJobId(null);
      setBrollFullscreen(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (footagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(footagePreviewUrl);
    };
  }, [footagePreviewUrl]);

  const characters = (charactersQuery.data?.characters ??
    charactersQuery.data ??
    []) as Array<{
    characterId?: string | number;
    id?: string | number;
    name?: string;
    characterName?: string;
  }>;
  const characterPortraitById = useMemo(() => {
    const assets = (
      (
        charactersQuery.data as
          | { manifest?: { assets?: CharacterPortraitAsset[] } }
          | undefined
      )?.manifest?.assets ?? []
    ).filter(
      asset =>
        Boolean(asset.characterId && asset.thumbnailUrl) &&
        (asset.role === "primary_portrait" ||
          asset.role === "primary_reference" ||
          asset.role === "casting_reference") &&
        (asset.approved ||
          asset.state === "approved" ||
          asset.state === "generated" ||
          asset.state === "imported")
    );
    const portraitByCharacterId = new Map<string, CharacterPortraitAsset>();
    for (const asset of [...assets].sort((left, right) => {
      if (left.approved !== right.approved) return left.approved ? -1 : 1;
      return (
        new Date(right.updatedAt ?? 0).getTime() -
        new Date(left.updatedAt ?? 0).getTime()
      );
    })) {
      if (asset.characterId && !portraitByCharacterId.has(asset.characterId)) {
        portraitByCharacterId.set(asset.characterId, asset);
      }
    }
    return portraitByCharacterId;
  }, [charactersQuery.data]);
  const products = (productsQuery.data?.pages ?? []).flatMap(page =>
    Array.isArray(page) ? page : page.items
  );
  const selectedProduct = products.find(
    product => String(product.id) === selectedProductId
  );
  const productImages = (imagesQuery.data?.pages ?? []).flatMap(
    page => page.images
  );
  const locations = locationsQuery.data?.locations ?? [];
  const selectedLocation = locations.find(
    location => String(location.locationId) === selectedLocationId
  );
  const approvedLocationAssets = (
    locationAssetsQuery.data?.assets ?? []
  ).filter(asset => asset.approved && asset.mediaAssetId);
  const fallbackImageModels = useMemo<SpecialModelSnapshot[]>(() => {
    const models = (publicImageModelsQuery.data?.models ?? []) as unknown as PublicMediaModel[];
    return models
      .filter(model =>
        (!model.aspectRatios?.length || model.aspectRatios.includes("9:16")) &&
        (model.maxReferenceImages == null ||
          model.maxReferenceImages >= Math.max(1, references.length))
      )
      .map(model => ({
        modelId: model.modelId,
        label: model.name ?? model.modelId,
        provider: model.provider ?? "unknown",
        providerModel: model.modelId,
        catalogVersion: "public-media-models-fallback",
        supportedDurationsSeconds: [],
        supportedAspectRatios: model.aspectRatios?.length
          ? model.aspectRatios
          : ["9:16"],
        supportsReferenceConditioning: (model.maxReferenceImages ?? 1) > 0,
        maxReferenceImages: model.maxReferenceImages ?? undefined,
        supportsDialogueAudio: false,
      }));
  }, [publicImageModelsQuery.data?.models, references.length]);
  const fallbackVideoModels = useMemo<SpecialModelSnapshot[]>(() => {
    const models = (publicVideoModelsQuery.data?.models ?? []) as unknown as PublicMediaModel[];
    return models
      .filter(model =>
        (!model.aspectRatios?.length || model.aspectRatios.includes("9:16")) &&
        (!model.durations?.length || model.durations.includes(durationSeconds)) &&
        (model.maxReferenceImages == null ||
          model.maxReferenceImages >= Math.max(1, references.length)) &&
        model.supportsStartFrame === true &&
        (dialogueMode === "none" || model.nativeAudioDialogue === true)
      )
      .map(model => ({
        modelId: model.modelId,
        label: model.name ?? model.modelId,
        provider: model.provider ?? "unknown",
        providerModel: model.modelId,
        catalogVersion: "public-media-models-fallback",
        supportedDurationsSeconds: model.durations ?? [],
        supportedAspectRatios: model.aspectRatios?.length
          ? model.aspectRatios
          : ["9:16"],
        supportsReferenceConditioning: (model.maxReferenceImages ?? 1) > 0,
        maxReferenceImages: model.maxReferenceImages ?? undefined,
        supportsDialogueAudio: model.nativeAudioDialogue === true,
      }));
  }, [
    dialogueMode,
    durationSeconds,
    publicVideoModelsQuery.data?.models,
    references.length,
  ]);
  const imageModels =
    modelsQuery.data?.imageModels?.length
      ? modelsQuery.data.imageModels
      : fallbackImageModels;
  const videoModels =
    modelsQuery.data?.videoModels?.length
      ? modelsQuery.data.videoModels
      : fallbackVideoModels;
  const usingPublicModelFallback =
    !modelsQuery.data?.imageModels?.length || !modelsQuery.data?.videoModels?.length;
  const selectedImageModelIsValid = imageModels.some(
    model => model.modelId === imageModelId
  );
  const selectedVideoModelIsValid = videoModels.some(
    model => model.modelId === videoModelId
  );
  const canSubmit =
    idea.trim().length > 0 &&
    idea.trim().length <= 12000 &&
    references.length >= 1 &&
    references.length <= 3 &&
    selectedImageModelIsValid &&
    selectedVideoModelIsValid &&
    (!footageAssetId || ["completed", "published"].includes(footagePrepareJobQuery.data?.status ?? "")) &&
    !(
      dialogueMode === "character_dialogue" && speakerCharacterIds.length === 0
    );

  useEffect(() => {
    if (!imageModelId && imageModels.length > 0)
      setImageModelId(imageModels[0]?.modelId ?? "");
    if (!videoModelId && videoModels.length > 0)
      setVideoModelId(videoModels[0]?.modelId ?? "");
  }, [imageModelId, videoModelId, imageModels, videoModels]);

  useEffect(() => {
    const fallbackDuration = modelsQuery.data?.fallbackVideoDurationSeconds;
    if (
      !modelsQuery.isLoading &&
      videoModels.length === 0 &&
      typeof fallbackDuration === "number" &&
      fallbackDuration !== durationSeconds
    ) {
      setDurationSeconds(fallbackDuration);
    }
  }, [durationSeconds, modelsQuery.data, modelsQuery.isLoading, videoModels.length]);

  useEffect(() => {
    if (!ideaHistoryQuery.data) return;
    const nextHistory = ideaHistoryQuery.data.map((run: { id: string; ideas: MarketplaceReviewIdea[] }) => ({
      runId: run.id,
      ideas: run.ideas,
    }));
    setIdeaHistory(nextHistory);
    setFreshIdeaRunId(current =>
      current && nextHistory.some(run => run.runId === current) ? current : null
    );
  }, [ideaHistoryQuery.data]);

  const selectedCharacters = useMemo(
    () => new Set(characterIds),
    [characterIds]
  );
  const ideaRunsToShow = useMemo(() => {
    if (freshIdeaRunId) {
      const freshRun = ideaHistory.find(run => run.runId === freshIdeaRunId);
      return showIdeaHistory
        ? ideaHistory
        : freshRun
          ? [freshRun]
          : [];
    }
    return showIdeaHistory ? ideaHistory : [];
  }, [freshIdeaRunId, ideaHistory, showIdeaHistory]);
  const previousIdeaRunCount = freshIdeaRunId
    ? Math.max(0, ideaHistory.length - 1)
    : ideaHistory.length;
  const toggleCharacter = (id: string) => {
    setCharacterIds(current => {
      if (current.includes(id)) {
        setSpeakerCharacterIds(speakers =>
          speakers.filter(speaker => speaker !== id)
        );
        return current.filter(value => value !== id);
      }
      return toggleBoundedSelection(current, id, 4);
    });
  };

  const uploadReference = async (file: File) => {
    if (!file.type.startsWith("image/"))
      throw new Error(
        lang === "th" ? "รองรับเฉพาะไฟล์ภาพ" : "Only image files are supported"
      );
    if (!canAddSpecialReferences(references.length))
      throw new Error(
        lang === "th"
          ? "เลือกภาพอ้างอิงได้ไม่เกิน 3 ภาพ"
          : "Choose up to 3 reference images"
      );
    const previewUrl = await readAsDataUrl(file);
    const uploaded = await uploadMutation.mutateAsync({
      fileName: file.name,
      fileType: file.type,
      fileBase64: previewUrl,
    });
    const managed = await registerUploadMutation.mutateAsync({
      storageKey: uploaded.key,
      mediaType: "image",
      mimeType: file.type,
    });
    setReferences(current => [
      ...current,
      {
        mediaAssetId: String(managed.mediaAssetId),
        source: "upload",
        role:
          referenceType === "location" || referenceType === "store"
            ? referenceType
            : "product",
        label: file.name,
        previewUrl,
        provenance: { source: "user_upload", managed: true },
      },
    ]);
  };

  const uploadFootage = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      throw new Error(lang === "th" ? "รองรับเฉพาะไฟล์วิดีโอ" : "Only video files are supported");
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      throw new Error(lang === "th" ? "ไฟล์วิดีโอต้องมีขนาดไม่เกิน 2 GB" : "Video must be 2 GB or smaller");
    }
    const initResponse = await fetch("/api/media-jobs/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size }),
    });
    if (!initResponse.ok) throw new Error(lang === "th" ? "เริ่มอัปโหลด Footage ไม่สำเร็จ" : "Could not initialize footage upload");
    const init = (await initResponse.json()) as { method?: string; assetId?: string; key?: string; uploadUrl?: string };
    let mediaAssetId: string | number | undefined;
    let previewUrl: string | undefined;
    if (init.method === "presigned" && init.assetId && init.key && init.uploadUrl) {
      const putResponse = await fetch(init.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putResponse.ok) throw new Error(lang === "th" ? "อัปโหลด Footage ไป Storage ไม่สำเร็จ" : "Could not upload footage to storage");
      const completeResponse = await fetch("/api/media-jobs/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assetId: init.assetId, key: init.key, contentType: file.type, fileSize: file.size }),
      });
      if (!completeResponse.ok) throw new Error(lang === "th" ? "ยืนยัน Footage ไม่สำเร็จ" : "Could not finalize footage upload");
      const complete = (await completeResponse.json()) as { mediaAssetId?: string; uri?: string };
      mediaAssetId = complete.mediaAssetId;
      previewUrl = complete.uri;
    } else {
      // Local-storage fallback retains the existing authenticated upload path.
      const dataUrl = await readAsDataUrl(file);
      const uploaded = await uploadMutation.mutateAsync({ fileName: file.name, fileType: file.type, fileBase64: dataUrl });
      const managed = await registerUploadMutation.mutateAsync({ storageKey: uploaded.key, mediaType: "video", mimeType: file.type });
      mediaAssetId = managed.mediaAssetId;
      previewUrl = uploaded.url;
    }
    if (!mediaAssetId) throw new Error(lang === "th" ? "ไม่พบ Media Asset หลังอัปโหลด" : "No managed media asset was returned");
    setFootageAssetId(Number(mediaAssetId));
    setFootageFileName(file.name);
    setFootagePreviewUrl(previewUrl ?? URL.createObjectURL(file));
    setFootageAnalysisJobId(null);
    setFootagePrepareJobId(null);
    setFootageTrimStartMs(0);
    setFootageTrimEndMs(0);
  };

  const analyzeFootage = async () => {
    if (!footageAssetId) return;
    const result = await footageAnalysisMutation.mutateAsync({
      seriesId,
      mediaAssetId: footageAssetId,
      requestedLanguage: lang === "th" ? "th" : "en",
      transcriptionPolicy: "preferred",
      analysisProfile: "standard",
    });
    setFootageAnalysisJobId(result.job?.id ?? null);
    setFootagePrepareJobId(null);
  };

  const prepareFootage = async () => {
    if (!footageAssetId || !footageAnalysisJobQuery.data) return;
    const guide = (footageAnalysisJobQuery.data.outputJson as { guide?: { sourceRevision?: string; probe?: { durationMs?: number | null }; silenceRanges?: Array<{ startMs: number; endMs: number }> } } | null)?.guide;
    const durationMs = Math.max(1000, Number(guide?.probe?.durationMs ?? footageTrimEndMs ?? 60_000));
    const endMs = Math.min(durationMs, Math.max(footageTrimEndMs || durationMs, footageTrimStartMs + 1000));
    const startMs = Math.min(Math.max(0, footageTrimStartMs), endMs - 1000);
    const approvalFingerprint = await sha256Fingerprint(`${footageAssetId}:${guide?.sourceRevision ?? footageAnalysisJobQuery.data.id}:${startMs}:${endMs}:preserve:9:16_cover`);
    const result = await footagePrepareMutation.mutateAsync({
      seriesId,
      mediaAssetId: footageAssetId,
      analysisRevision: guide?.sourceRevision ?? footageAnalysisJobQuery.data.id,
      segments: [{ sourceInMs: startMs, sourceOutMs: endMs, keep: true, reason: "user_approved_primary_window" }],
      silenceRanges: guide?.silenceRanges ?? [],
      removeDeadAir: true,
      baseAudioPolicy: "preserve",
      fitPolicy: "9:16_cover",
      maxDurationMs: Math.min(90_000, endMs - startMs),
      approvalFingerprint,
    });
    setFootagePrepareJobId(result.job?.id ?? null);
  };

  const addBrollPlacement = () => {
    const asset = brollAssets.find(item => item.manifest.assetId === brollAssetId);
    const startMs = Math.max(0, Math.round(brollStartMs));
    const endMs = Math.min(preparedDurationMs, Math.round(brollEndMs));
    if (!asset) {
      toast.error(lang === "th" ? "เลือกวิดีโอ B-roll ก่อน" : "Choose a B-roll video first");
      return;
    }
    if (!preparedSource.success || preparedDurationMs <= 0 || endMs <= startMs) {
      toast.error(lang === "th" ? "ช่วงเวลาวาง B-roll ไม่ถูกต้อง" : "The B-roll placement range is invalid");
      return;
    }
    if (brollPlacements.length >= 32) {
      toast.error(lang === "th" ? "เพิ่ม B-roll ได้ไม่เกิน 32 ช่วง" : "You can add at most 32 B-roll placements");
      return;
    }
    const durationMs = endMs - startMs;
    const parsed = footageBrollPlacementSchema.safeParse({
      storyBeatId: `special-tie-in-beat-${Date.now()}-${brollPlacements.length + 1}`,
      startMs,
      endMs,
      sourceMediaAssetId: asset.manifest.assetId,
      sourceInMs: Math.max(0, Math.round(brollSourceInMs)),
      sourceOutMs: Math.max(1, Math.round(brollSourceInMs) + durationMs),
      placementMode: "cutaway",
      fitMode: "cover",
      baseAudioPolicy: "preserve",
      brollAudioPolicy: "mute",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? (lang === "th" ? "ข้อมูล B-roll ไม่ถูกต้อง" : "Invalid B-roll placement"));
      return;
    }
    setBrollPlacements(current => [...current, parsed.data]);
    setBrollStartMs(Math.min(preparedDurationMs, endMs));
    setBrollEndMs(Math.min(preparedDurationMs, endMs + 5000));
  };

  const renderBroll = async () => {
    if (!preparedSource.success || !selectedMarketplaceIdea || brollPlacements.length === 0) {
      toast.error(lang === "th" ? "เลือกไอเดีย ตรวจเรื่อง และเพิ่มตำแหน่ง B-roll ก่อน render" : "Select and review an idea, then add a B-roll placement before rendering");
      return;
    }
    const assetManifest = brollPlacements
      .map(placement => brollAssets.find(item => item.manifest.assetId === placement.sourceMediaAssetId)?.manifest)
      .filter((asset): asset is MediaSourceManifest => Boolean(asset));
    if (assetManifest.length !== new Set(brollPlacements.map(placement => placement.sourceMediaAssetId)).size) {
      toast.error(lang === "th" ? "ไม่พบ source ของ B-roll บางรายการ กรุณาโหลดรายการใหม่" : "Some B-roll sources are unavailable; refresh the list");
      return;
    }
    try {
      const storyRevisionId = await sha256Fingerprint(JSON.stringify({
        idea: idea.trim(),
        dialogueBrief: dialogueBrief.trim(),
        dialogueMode,
        characterIds,
        selectedIdeaId,
      }));
      const result = await brollRenderMutation.mutateAsync({
        seriesId,
        preparedSource: preparedSource.data,
        preparedRevision: preparedSource.data.sourceRevision,
        baseDurationMs: preparedDurationMs,
        placements: brollPlacements,
        storyRevisionId,
        shotPlanRevisionId: `special-tie-in-9-shot-${storyRevisionId}`,
        assetManifest,
      });
      setBrollRenderJobId(result.job?.id ?? null);
      toast.success(lang === "th" ? "ส่งงาน render B-roll ให้ Worker แล้ว" : "B-roll render was sent to the Worker");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : lang === "th" ? "ส่งงาน render B-roll ไม่สำเร็จ" : "Could not start B-roll render");
    }
  };

  const generateMarketplaceIdeas = async () => {
    const marketplaceReferenceImages = references
      .filter(reference => reference.source === "marketplace_capture")
      .map(reference => ({
        mediaAssetId: reference.mediaAssetId,
        imageId: String(reference.provenance?.marketplaceImageId ?? ""),
        label: reference.label,
      }));
    if (!selectedProductId || marketplaceReferenceImages.length === 0) {
      toast.error(lang === "th" ? "เลือกสินค้าและภาพจาก Marketplace ก่อน" : "Choose a Marketplace product and image first");
      return;
    }
    if (footageAssetId && !["completed", "published"].includes(footagePrepareJobQuery.data?.status ?? "")) {
      toast.error(lang === "th" ? "สร้าง Footage พร้อมใช้ให้เสร็จก่อนสร้างไอเดีย" : "Prepare the footage before generating ideas");
      return;
    }
    if (characterIds.length === 0) {
      toast.error(lang === "th" ? "เลือกตัวละครที่จะใช้สร้างไอเดียอย่างน้อย 1 คน" : "Choose at least one character for the idea");
      return;
    }
    try {
      const result = await generateIdeasMutation.mutateAsync({
        seriesId,
        productId: selectedProductId,
        referenceImages: marketplaceReferenceImages,
        dialogueMode,
        selectedCharacterIds: characterIds.slice(0, 4),
        customerJourney: selectedProduct?.supportingInsights ?? undefined,
        footageGuide: footageGuideSchema.safeParse(footageAnalysisOutput?.guide).success
          ? footageAnalysisOutput?.guide
          : undefined,
        direction:
          selectedMarketplaceIdea || !idea.trim()
            ? undefined
            : idea.trim().slice(0, 2_000),
        llmModelId: ideaLlmModelId === "auto" ? undefined : ideaLlmModelId,
        variationSeed: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setIdeaHistory(current => [
        { runId: result.runId, ideas: result.ideas },
        ...current,
      ]);
      setFreshIdeaRunId(result.runId);
      setSelectedIdeaId(null);
      setSelectedMarketplaceIdea(null);
      setShowIdeaHistory(false);
      toast.success(lang === "th" ? "สร้างไอเดียซีรีย์ 3 ใบแล้ว" : "Generated 3 series ideas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : lang === "th" ? "สร้างไอเดียไม่สำเร็จ" : "Could not generate ideas");
    }
  };

  const chooseMarketplaceIdea = async (runId: string, candidate: MarketplaceReviewIdea) => {
    try {
      const result = await selectIdeaMutation.mutateAsync({ seriesId, runId, ideaId: candidate.ideaId, selectedCharacterIds: characterIds.slice(0, 4) });
      setSelectedIdeaId(candidate.ideaId);
      setSelectedMarketplaceIdea(candidate);
      setIdea(candidate.episodeStory);
      const selectedCharacterIdSet = new Set(characterIds);
      const matchedSpeakerIds = characters
        .filter(character =>
          selectedCharacterIdSet.has(resolveSpecialTieInCharacterId(character)) &&
          candidate.dialogue.some(line => line.speaker === character.name)
        )
        .slice(0, 3)
        .map(resolveSpecialTieInCharacterId)
        .filter(Boolean);
      setCharacterIds(current =>
        Array.from(new Set([...current, ...matchedSpeakerIds])).slice(0, 4)
      );
      setSpeakerCharacterIds(matchedSpeakerIds);
      setDialogueMode(matchedSpeakerIds.length > 0 ? "character_dialogue" : "none");
      setDialogueBrief(candidate.dialogueScript);
      toast.success(lang === "th" ? `เลือกไอเดียแล้ว เพิ่ม slot ลุค ${result.slotRequests.looks.length} และฉาก ${result.slotRequests.scenes.length} รายการ` : "Idea selected and missing look/scene slots were added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : lang === "th" ? "เลือกไอเดียไม่สำเร็จ" : "Could not select idea");
    }
  };

  const confirmMarketplaceImages = async () => {
    if (!selectedProductId || pendingImageIds.length === 0) return;
    if (!canAddSpecialReferences(references.length, pendingImageIds.length)) {
      toast.error(
        lang === "th"
          ? "รวมภาพอ้างอิงได้ไม่เกิน 3 ภาพ"
          : "The total number of references cannot exceed 3"
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const added: Reference[] = [];
      for (const imageId of pendingImageIds) {
        const result = await materializeMutation.mutateAsync({
          seriesId,
          productId: selectedProductId,
          imageId,
        });
        added.push({
          mediaAssetId: result.mediaAssetId,
          source: "marketplace_capture",
          role:
            referenceType === "location" || referenceType === "store"
              ? referenceType
              : "product",
          label: result.label,
          previewUrl:
            result.url ??
            productImages.find(image => String(image.id) === imageId)?.url,
          provenance: result.provenance,
        });
      }
      setReferences(current => [...current, ...added]);
      setPendingImageIds([]);
      setMarketplaceOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "เพิ่มภาพจาก Marketplace ไม่สำเร็จ"
            : "Could not add Marketplace images"
      );
    }
  };

  const submit = async () => {
    const reviewedMarketplaceIdea = selectedMarketplaceIdea
      ? {
          ...selectedMarketplaceIdea,
          episodeStory: idea.trim(),
          dialogueScript: dialogueBrief.trim(),
          dialogue: parseEditableDialogueScript(
            dialogueBrief,
            selectedMarketplaceIdea.dialogue
          ),
        }
      : undefined;
    const storyRevisionId = selectedMarketplaceIdea
      ? await sha256Fingerprint(JSON.stringify({
          idea: idea.trim(),
          dialogueBrief: dialogueBrief.trim(),
          dialogueMode,
          characterIds,
          selectedIdeaId,
        }))
      : null;
    const parsed = specialTieInInputSchema.safeParse({
      schemaVersion: 1,
      idea,
      referenceType,
      referenceImages: references,
      characterIds,
      durationSeconds,
      aspectRatio: "9:16",
      imageModelId,
      videoModelId,
      dialogueMode,
      dialogueBrief: dialogueBrief.trim() || undefined,
      speakerCharacterIds,
      allowAdditionalCharacters,
      lockCharacterReferences,
      lockReferenceImages,
      marketplaceReviewIdea: reviewedMarketplaceIdea,
      footage: (() => {
        const guide = footageGuideSchema.safeParse(footageAnalysisOutput?.guide);
        if (!footageAssetId || !footageAnalysisJobId || !footagePrepareJobId || !guide.success) return undefined;
        return {
          sourceMediaAssetId: `media-${footageAssetId}`,
          analysisJobId: footageAnalysisJobId,
          prepareJobId: footagePrepareJobId,
          sourceRevision: guide.data.sourceRevision,
          guide: guide.data,
        };
      })(),
      broll: (() => {
        if (!preparedSource.success || brollPlacements.length === 0) return undefined;
        const assetManifest = brollPlacements
          .map(placement => brollAssets.find(asset => asset.manifest.assetId === placement.sourceMediaAssetId)?.manifest)
          .filter((asset): asset is MediaSourceManifest => Boolean(asset));
        if (assetManifest.length !== new Set(brollPlacements.map(placement => placement.sourceMediaAssetId)).size) return undefined;
        return {
          preparedSource: preparedSource.data,
          preparedRevision: preparedSource.data.sourceRevision,
          baseDurationMs: preparedDurationMs,
          placements: brollPlacements,
          storyRevisionId: storyRevisionId ?? "special-tie-in-story-reviewed",
          shotPlanRevisionId: `special-tie-in-9-shot-${storyRevisionId ?? "reviewed"}`,
          assetManifest,
          renderJobId: brollRenderJobId ?? undefined,
        };
      })(),
    });
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          (lang === "th"
            ? "กรอกข้อมูลให้ครบถ้วน"
            : "Complete the required fields")
      );
      return;
    }
    try {
      if (onSubmitInput) {
        await onSubmitInput(parsed.data);
        toast.success(
          lang === "th"
            ? "บันทึกโจทย์แล้ว ระบบกำลังสร้าง prompt ใหม่"
            : "Brief saved; prompts are being regenerated"
        );
        onOpenChange(false);
        return;
      }
      const result = await createMutation.mutateAsync({
        seriesId,
        createIntentId: crypto.randomUUID(),
        input: parsed.data,
      });
      toast.success(
        lang === "th"
          ? "สร้างตอนพิเศษแล้ว ระบบกำลังสร้าง prompt"
          : "Special episode created; prompts are being generated"
      );
      onOpenChange(false);
      onCreated?.(String(result.episodeId));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "สร้างตอนพิเศษไม่สำเร็จ"
            : "Could not create special episode"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setIdea("");
    setReferences([]);
    setCharacterIds([]);
    setSpeakerCharacterIds([]);
    setDialogueMode("none");
    setDialogueBrief("");
    setImageModelId("");
    setVideoModelId("");
    setIdeaLlmModelId("auto");
    setMarketplaceOpen(false);
    setPendingImageIds([]);
    setSelectedProductId(null);
    setSelectedLocationId(null);
    setIsSubmitting(false);
    setIdeaHistory([]);
    setFreshIdeaRunId(null);
    setShowIdeaHistory(false);
    setSelectedIdeaId(null);
    setSelectedMarketplaceIdea(null);
    setFootageAssetId(null);
    setFootageFileName("");
    setFootagePreviewUrl(null);
    setFootageAnalysisJobId(null);
    setFootagePrepareJobId(null);
    setFootageTrimStartMs(0);
    setFootageTrimEndMs(0);
    setFootageFullscreen(false);
    setBrollAssetId("");
    setBrollStartMs(0);
    setBrollEndMs(5000);
    setBrollSourceInMs(0);
    setBrollPlacements([]);
    setBrollRenderJobId(null);
    setBrollFullscreen(false);
  };

  const addExistingLocationAsset = (asset: {
    mediaAssetId: string;
    url?: string | null;
    role?: string | null;
  }) => {
    if (!canAddSpecialReferences(references.length)) return;
    if (
      references.some(
        reference => reference.mediaAssetId === asset.mediaAssetId
      )
    )
      return;
    const role = referenceType === "store" ? "store" : "location";
    setReferences(current => [
      ...current,
      {
        mediaAssetId: asset.mediaAssetId,
        source: "series_asset",
        role,
        label: selectedLocation?.name ?? role,
        previewUrl: asset.url ?? undefined,
        provenance: {
          source: "series_location",
          locationId: selectedLocationId,
          locationKey: selectedLocation?.locationKey,
          approved: true,
        },
      },
    ]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-none overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:p-6 lg:w-[96vw] lg:max-w-[96vw] xl:w-[94vw] xl:max-w-[94vw]">
        <DialogHeader>
          <DialogTitle>
            {lang === "th"
              ? "สร้างตอนพิเศษ Tie-in"
              : "Create special tie-in episode"}
          </DialogTitle>
          <DialogDescription>
            {lang === "th"
              ? "ใช้สำหรับสินค้า สถานที่ หรือร้านค้า ระบบจะสร้าง prompt ภาพเริ่มต้นและวิดีโอให้อัตโนมัติ โดยไม่ดึงเนื้อเรื่องจากภาพรวม"
              : "For product, location, or store tie-ins. Prompts for start frames and video are generated automatically without using the normal Overview story."}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3" aria-labelledby="special-tie-in-footage-heading">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 id="special-tie-in-footage-heading" className="font-medium">
                {lang === "th" ? "Footage จริงของผู้ใช้" : "Your real footage"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {lang === "th" ? "อัปโหลดก่อน แล้วให้ Worker วิเคราะห์/ตัดช่วงที่เลือก เพื่อให้เรื่อง Tie-in สอดคล้องกับภาพจริง" : "Upload first, then let the Worker analyze and prepare the usable footage before writing the tie-in story."}
              </p>
            </div>
            <Badge variant={footagePrepared ? "secondary" : "outline"} role="status">
              {footagePrepared ? (lang === "th" ? "พร้อมใช้" : "Prepared") : footageAnalysisJobId ? (lang === "th" ? "กำลังทำงาน" : "Processing") : (lang === "th" ? "ยังไม่มี footage" : "No footage")}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={uploadMutation.isPending || registerUploadMutation.isPending} onClick={() => document.getElementById("special-tie-in-footage-upload")?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {lang === "th" ? "อัปโหลด Footage จริง" : "Upload real footage"}
            </Button>
            <input id="special-tie-in-footage-upload" className="hidden" type="file" accept="video/*" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadFootage(file).catch(error => toast.error(error instanceof Error ? error.message : "Upload failed")); }} />
            {footageAssetId ? (
              <Button type="button" variant="secondary" disabled={footageAnalysisMutation.isPending} onClick={() => void analyzeFootage().catch(error => toast.error(error instanceof Error ? error.message : "Analysis failed"))}>
                {footageAnalysisMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {lang === "th" ? "วิเคราะห์ Footage" : "Analyze footage"}
              </Button>
            ) : null}
          </div>
          {footagePreviewUrl ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
              <div className="relative overflow-hidden rounded-md border bg-black">
                <video className="aspect-[9/16] max-h-64 w-full object-contain" src={footagePreviewUrl} controls preload="metadata" aria-label={footageFileName || "Footage preview"} />
                <Button type="button" size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => setFootageFullscreen(true)}>
                  <Expand className="mr-1 h-3.5 w-3.5" />
                  {lang === "th" ? "ดูเต็มจอ" : "Fullscreen"}
                </Button>
              </div>
              <div className="space-y-3 text-sm">
                <p className="truncate font-medium">{footageFileName}</p>
                <p className="text-xs text-muted-foreground" role="status">
                  {footageAnalysisJobQuery.data ? `${lang === "th" ? "ผลวิเคราะห์" : "Analysis"}: ${footageAnalysisJobQuery.data.status}` : (lang === "th" ? "ยังไม่ได้วิเคราะห์" : "Not analyzed yet")}
                </p>
                {footageAnalysisDone ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs">{lang === "th" ? "ช่วงตัดหลัก (มิลลิวินาที)" : "Primary trim window (milliseconds)"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input aria-label={lang === "th" ? "เริ่มต้น footage มิลลิวินาที" : "Footage start milliseconds"} type="number" min={0} value={footageTrimStartMs} onChange={event => setFootageTrimStartMs(Math.max(0, Number(event.target.value) || 0))} />
                      <Input aria-label={lang === "th" ? "สิ้นสุด footage มิลลิวินาที" : "Footage end milliseconds"} type="number" min={1000} value={footageTrimEndMs || footageDurationMs || ""} onChange={event => setFootageTrimEndMs(Math.max(0, Number(event.target.value) || 0))} />
                    </div>
                    <Button type="button" size="sm" disabled={footagePrepareMutation.isPending || footagePrepared} onClick={() => void prepareFootage().catch(error => toast.error(error instanceof Error ? error.message : "Preparation failed"))}>
                      {footagePrepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {footagePrepared ? (lang === "th" ? "Footage พร้อมใช้แล้ว" : "Footage prepared") : (lang === "th" ? "สร้าง Footage พร้อมใช้" : "Prepare footage")}
                    </Button>
                  </div>
                ) : null}
                {footageAnalysisOutput?.guide?.status?.warnings?.length ? <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">{lang === "th" ? "ผลวิเคราะห์บางส่วนยังไม่สมบูรณ์ ระบบจะแนบคำเตือนไปกับไอเดีย" : "Some analysis is partial; its warnings remain attached to the idea input."}</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        {footagePrepared && preparedSource.success ? (
          <section className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3" aria-labelledby="special-tie-in-broll-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="special-tie-in-broll-heading" className="font-medium">
                  {lang === "th" ? "วางวีดีโอ B-roll จาก AI/คลังวีดีโอ" : "Place AI/library video B-roll"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "th" ? `เลือกวีดีโอแล้วกำหนดจุดเริ่ม–จบใน Footage ที่ตัดแล้ว (${(preparedDurationMs / 1000).toFixed(1)} วินาที) ระบบจะส่งงานหนักให้ Worker` : `Choose a video and set its start/end on the prepared footage (${(preparedDurationMs / 1000).toFixed(1)}s). Heavy rendering runs on the Worker.`}
                </p>
              </div>
              <Badge variant="outline">{brollPlacements.length}/32</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.6fr)_minmax(7rem,0.6fr)_minmax(7rem,0.6fr)_auto] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="special-tie-in-broll-source">{lang === "th" ? "วีดีโอ B-roll" : "B-roll video"}</Label>
                <select
                  id="special-tie-in-broll-source"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={brollAssetId}
                  onChange={event => setBrollAssetId(event.target.value)}
                  disabled={brollAssetsQuery.isLoading || brollAssets.length === 0}
                >
                  <option value="">{brollAssetsQuery.isLoading ? (lang === "th" ? "กำลังโหลด…" : "Loading…") : lang === "th" ? "เลือกวีดีโอที่พร้อมใช้" : "Select an available video"}</option>
                  {brollAssets.map(asset => <option key={asset.manifest.assetId} value={asset.manifest.assetId}>{asset.manifest.fileName}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label htmlFor="special-tie-in-broll-start">{lang === "th" ? "เริ่ม (ms)" : "Start (ms)"}</Label><Input id="special-tie-in-broll-start" type="number" min={0} max={Math.max(0, preparedDurationMs - 1000)} value={brollStartMs} onChange={event => setBrollStartMs(Number(event.target.value) || 0)} /></div>
              <div className="space-y-1"><Label htmlFor="special-tie-in-broll-end">{lang === "th" ? "จบ (ms)" : "End (ms)"}</Label><Input id="special-tie-in-broll-end" type="number" min={1000} max={preparedDurationMs} value={brollEndMs} onChange={event => setBrollEndMs(Number(event.target.value) || 0)} /></div>
              <div className="space-y-1"><Label htmlFor="special-tie-in-broll-source-in">{lang === "th" ? "เริ่ม source (ms)" : "Source in (ms)"}</Label><Input id="special-tie-in-broll-source-in" type="number" min={0} value={brollSourceInMs} onChange={event => setBrollSourceInMs(Number(event.target.value) || 0)} /></div>
              <Button type="button" variant="outline" onClick={addBrollPlacement} disabled={!brollAssetId || brollAssetsQuery.isError}><span aria-hidden="true">+</span>{lang === "th" ? "เพิ่มช่วง" : "Add"}</Button>
            </div>
            {brollAssetsQuery.isError ? <p className="text-xs text-destructive" role="alert">{lang === "th" ? "โหลดวีดีโอ B-roll ไม่สำเร็จ กรุณาลองใหม่" : "Could not load B-roll videos. Try again."}</p> : null}
            {brollAssets.length === 0 && !brollAssetsQuery.isLoading && !brollAssetsQuery.isError ? <p className="text-xs text-muted-foreground" role="status">{lang === "th" ? "ยังไม่พบวีดีโอที่เป็น managed media และมี checksum สำหรับใช้เป็น B-roll" : "No managed, checksum-backed videos are available for B-roll."}</p> : null}
            {brollPlacements.length > 0 ? (
              <div className="space-y-2 rounded-md border bg-background p-2">
                <p className="text-xs font-medium">{lang === "th" ? "ตำแหน่งที่เลือก" : "Selected placements"}</p>
                {brollPlacements.map((placement, index) => (
                  <div key={placement.storyBeatId} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                    <span>{index + 1}. {brollAssets.find(asset => asset.manifest.assetId === placement.sourceMediaAssetId)?.manifest.fileName ?? placement.sourceMediaAssetId}</span>
                    <span>{placement.startMs}–{placement.endMs} ms</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBrollPlacements(current => current.filter(item => item.storyBeatId !== placement.storyBeatId))}>{lang === "th" ? "ลบ" : "Remove"}</Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => void renderBroll()} disabled={brollRenderMutation.isPending || brollPlacements.length === 0 || !selectedMarketplaceIdea}>
                {brollRenderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {lang === "th" ? "Render B-roll ตามเรื่องที่ตรวจแล้ว" : "Render B-roll for reviewed story"}
              </Button>
              {!selectedMarketplaceIdea ? <span className="text-xs text-amber-700 dark:text-amber-400">{lang === "th" ? "ต้องเลือกและตรวจไอเดียละครก่อน" : "Select and review a series idea first."}</span> : null}
              {brollRenderJobQuery.data ? <span className="text-xs text-muted-foreground" role="status">{lang === "th" ? `สถานะ Worker: ${brollRenderJobQuery.data.status}` : `Worker status: ${brollRenderJobQuery.data.status}`}</span> : null}
            </div>
            {brollOutputUrl ? (
              <div className="relative max-w-sm overflow-hidden rounded-md border bg-black">
                <video className="aspect-[9/16] max-h-80 w-full object-contain" src={brollOutputUrl} controls preload="metadata" aria-label="Rendered B-roll preview" />
                <Button type="button" size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => setBrollFullscreen(true)}><Expand className="mr-1 h-3.5 w-3.5" />{lang === "th" ? "ดูเต็มจอ" : "Fullscreen"}</Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-5 md:grid md:grid-cols-12 md:gap-6 md:space-y-0">
          <div className="space-y-5 md:col-span-7">
            <div className="space-y-2">
              <Label htmlFor="special-tie-in-idea">
                {selectedMarketplaceIdea
                  ? lang === "th"
                    ? "เรื่องละคร (แก้ไขได้ก่อนสร้าง 9 ช็อต)"
                    : "Episode story (edit before creating 9 shots)"
                  : lang === "th"
                    ? "ไอเดียหรือโจทย์"
                    : "Idea or brief"}
              </Label>
              {selectedMarketplaceIdea ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "ตรวจความต่อเนื่องของเหตุการณ์ การกระทำ และการ tie-in ให้เรียบร้อยก่อนสร้างตอนพิเศษและ Prompt"
                    : "Review the story flow, actions, and tie-in before creating the special episode and prompts."}
                </p>
              ) : null}
              <Textarea
                id="special-tie-in-idea"
                value={idea}
                onChange={event => setIdea(event.target.value)}
                maxLength={12000}
                rows={selectedMarketplaceIdea ? 12 : 6}
                placeholder={
                  lang === "th"
                    ? selectedMarketplaceIdea
                      ? "เรื่องละครที่เลือกจะแสดงตรงนี้ แก้ไขเนื้อหาได้ก่อนสร้าง 9 ช็อต…"
                      : "อธิบายสิ่งที่ต้องการให้เกิดขึ้นในตอนพิเศษ…"
                    : "Describe what should happen in the special episode…"
                }
              />
              <p className="text-right text-xs text-muted-foreground">
                {idea.length}/12000
              </p>
            </div>

            {selectedMarketplaceIdea ? (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Label htmlFor="special-tie-in-dialogue-script">
                  {lang === "th"
                    ? "บทพูดและท่าทาง (แก้ไขได้ก่อนสร้าง 9 ช็อต)"
                    : "Dialogue and actions (edit before creating 9 shots)"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "แยกจากเรื่องละครอย่างชัดเจน ตรวจชื่อผู้พูด ประโยค และท่าทางที่จะนำไปใช้จริงได้ที่นี่"
                    : "Edit this separately from the story. Check speaker names, lines, and usable stage directions here."}
                </p>
                <Textarea
                  id="special-tie-in-dialogue-script"
                  value={dialogueBrief}
                  onChange={event => setDialogueBrief(event.target.value)}
                  maxLength={12000}
                  rows={10}
                  placeholder={
                    lang === "th"
                      ? "พิมพ์ชนก: (ก้มเก็บของเล่น) ...\nลุงชาญ: ลองชิ้นนี้ดูไหม"
                      : "Character: (stage direction) ..."
                  }
                />
                <p className="text-right text-xs text-muted-foreground">
                  {dialogueBrief.length}/12000
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>
                {lang === "th" ? "ประเภทสิ่งอ้างอิง" : "Reference type"}
              </Label>
              <Select
                value={referenceType}
                onValueChange={value =>
                  setReferenceType(value as ReferenceType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">
                    {lang === "th" ? "สินค้า" : "Product"}
                  </SelectItem>
                  <SelectItem value="location">
                    {lang === "th" ? "สถานที่" : "Location"}
                  </SelectItem>
                  <SelectItem value="store">
                    {lang === "th" ? "ร้านค้า" : "Store"}
                  </SelectItem>
                  <SelectItem value="mixed">
                    {lang === "th" ? "ผสม" : "Mixed"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              className="space-y-2"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file)
                  void uploadReference(file).catch(error =>
                    toast.error(
                      error instanceof Error ? error.message : "Upload failed"
                    )
                  );
              }}
            >
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                {lang === "th"
                  ? "ลากภาพมาวางที่นี่ หรือเลือกจากเครื่อง/Marketplace Capture"
                  : "Drop an image here, or choose from your device/Marketplace Capture"}
              </p>
              <div className="flex items-center justify-between">
                <Label>
                  {lang === "th"
                    ? "ภาพสินค้า/สถานที่/ร้านค้า"
                    : "Product/location/store images"}
                </Label>
                <Badge variant="outline">{references.length}/3</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {references.map(reference => (
                  <div
                    key={reference.mediaAssetId}
                    className="flex items-center justify-between rounded-md border p-2 text-xs md:flex-col md:items-stretch"
                  >
                    {reference.previewUrl ? (
                      <div className="relative">
                        <AuthenticatedMediaImage
                          src={reference.previewUrl}
                          alt={reference.label ?? reference.source}
                          className="mr-2 h-10 w-10 shrink-0 rounded object-cover md:mb-2 md:mr-0 md:h-28 md:w-full"
                          loadingLabel={lang === "th" ? "กำลังโหลดภาพ..." : "Loading image..."}
                          errorLabel={lang === "th" ? "โหลดภาพไม่สำเร็จ" : "Image unavailable"}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute right-1 top-1 h-7 w-7"
                          aria-label={lang === "th" ? "ขยายภาพเต็มจอ" : "Open image fullscreen"}
                          title={lang === "th" ? "ขยายภาพเต็มจอ" : "Open image fullscreen"}
                          onClick={() => setLightbox({ src: reference.previewUrl!, alt: reference.label ?? reference.source })}
                        >
                          <Expand className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <ImagePlus
                        aria-hidden="true"
                        className="mr-2 h-5 w-5 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="min-w-0 truncate md:block">
                      {reference.label ?? reference.source}
                      <span className="block text-[10px] text-muted-foreground">
                        {reference.source === "marketplace_capture"
                          ? "Marketplace Capture"
                          : reference.source === "series_asset"
                            ? "Scenes"
                            : lang === "th"
                              ? "อัปโหลด"
                              : "Upload"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="md:self-end"
                      onClick={() =>
                        setReferences(current =>
                          current.filter(
                            item => item.mediaAssetId !== reference.mediaAssetId
                          )
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    references.length >= 3 ||
                    uploadMutation.isPending ||
                    registerUploadMutation.isPending
                  }
                  onClick={() =>
                    document.getElementById("special-tie-in-upload")?.click()
                  }
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {lang === "th"
                    ? "ลาก/เลือกภาพจากเครื่อง"
                    : "Drop/choose upload"}
                </Button>
                <input
                  id="special-tie-in-upload"
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file)
                      void uploadReference(file).catch(error =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Upload failed"
                        )
                      );
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={references.length >= 3}
                  onClick={() => setMarketplaceOpen(true)}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {lang === "th"
                    ? "เลือกจาก Marketplace Capture"
                    : "Choose from Marketplace Capture"}
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>{lang === "th" ? "Skill: สร้างไอเดียรีวิวแบบละครซีรีย์" : "Skill: series tie-in review ideas"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th" ? "ใช้สินค้าเป็นส่วนหนึ่งของเหตุการณ์ ไม่ยืนขายตรง ๆ ระบบจะสร้าง 3 ใบใหม่ทุกครั้ง" : "The product belongs inside the story, not a direct sales review. Each run creates 3 new cards."}
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" disabled={generateIdeasMutation.isPending || characterIds.length === 0} onClick={() => void generateMarketplaceIdeas()}>
                  {generateIdeasMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {lang === "th" ? "สร้างไอเดีย 3 ใบ" : "Generate 3 ideas"}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] sm:items-end">
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "ค่าเริ่มต้นเป็นอัตโนมัติ ระบบจะเลือก LLM ที่ admin แนะนำและพร้อมใช้งานให้เอง"
                    : "Automatic is the default; the system chooses an available admin-recommended LLM."}
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {lang === "th" ? "LLM สำหรับสร้างไอเดีย" : "LLM for idea generation"}
                  </Label>
                  <div data-testid="special-tie-in-idea-llm-model">
                    <IdeaLlmModelCombobox
                      models={(ideaLlmModelsQuery.data?.models ?? []) as IdeaLlmModel[]}
                      value={ideaLlmModelId}
                      onValueChange={setIdeaLlmModelId}
                      lang={lang}
                      disabled={ideaLlmModelsQuery.isLoading || ideaLlmModelsQuery.isError}
                    />
                  </div>
                  {ideaLlmModelsQuery.isError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {lang === "th" ? "โหลดรายการ LLM ไม่สำเร็จ ระบบยังลองเลือกอัตโนมัติได้เมื่อกดสร้าง" : "Could not load LLM options; automatic selection will still be attempted."}
                    </p>
                  ) : null}
                </div>
              </div>
              {ideaHistory.length > 0 ? (
                <div className="space-y-3" aria-live="polite">
                  <p className="text-xs font-medium text-muted-foreground">
                    {freshIdeaRunId
                      ? lang === "th"
                        ? "ไอเดียรอบล่าสุด — เลือก 1 ใบจาก 3 ใบ"
                        : "Latest idea round — choose 1 of 3"
                      : lang === "th"
                        ? "ประวัติไอเดีย — กดขยายเพื่อดู"
                        : "Idea history — expand to view"}
                  </p>
                  {ideaRunsToShow.map((run, runIndex) => (
                    <div key={run.runId} className="space-y-2">
                      {showIdeaHistory && runIndex > 0 ? (
                        <p className="text-xs font-medium text-muted-foreground">
                          {lang === "th" ? `รอบก่อนหน้า ${runIndex}` : `Previous round ${runIndex}`}
                        </p>
                      ) : null}
                      <div className="grid gap-2 lg:grid-cols-3">
                        {run.ideas.map((candidate, ideaIndex) => {
                          const selected = selectedIdeaId === candidate.ideaId;
                          return (
                            <button key={candidate.ideaId} type="button" aria-pressed={selected} className={`rounded-md border bg-background p-3 text-left transition-colors ${selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60"}`} onClick={() => void chooseMarketplaceIdea(run.runId, candidate)}>
                              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{lang === "th" ? `ไอเดียที่ ${ideaIndex + 1}` : `Idea ${ideaIndex + 1}`}</span>
                              <span className="block font-medium">{candidate.title}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">{candidate.logline}</span>
                              <span className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-primary">{lang === "th" ? "เรื่องละคร" : "Episode story"}</span>
                              <span className="mt-1 block max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-5">{candidate.episodeStory || candidate.logline}</span>
                              <span className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-primary">{dialogueMode === "none" ? lang === "th" ? "ท่าทางและการกระทำ (ไม่มีบทพูด)" : "Actions and body language (no dialogue)" : lang === "th" ? "บทพูดและท่าทาง" : "Dialogue and actions"}</span>
                              <span className="mt-1 block max-h-20 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{dialogueMode === "none" ? candidate.actions.join("\n") : candidate.dialogueScript || candidate.dialogue.map(line => `${line.speaker}: ${line.line}`).join("\n")}</span>
                              <span className="mt-2 block text-xs text-muted-foreground">{candidate.scene.location} · {candidate.productMentionReason}</span>
                              {candidate.lookSlotRequests.length || candidate.sceneSlotRequests.length ? <Badge variant="outline" className="mt-2">{lang === "th" ? `เพิ่ม slot ลุค ${candidate.lookSlotRequests.length} / ฉาก ${candidate.sceneSlotRequests.length}` : `Add ${candidate.lookSlotRequests.length} look / ${candidate.sceneSlotRequests.length} scene slots`}</Badge> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {previousIdeaRunCount > 0 || !freshIdeaRunId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowIdeaHistory(current => !current)}
                    >
                      {showIdeaHistory
                        ? lang === "th"
                          ? "ซ่อนประวัติรอบก่อน"
                          : "Hide previous rounds"
                        : lang === "th"
                          ? `ดูประวัติไอเดีย (${previousIdeaRunCount} รอบ)`
                          : `View idea history (${previousIdeaRunCount})`}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {referenceType === "location" ||
            referenceType === "store" ||
            referenceType === "mixed" ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label>
                  {lang === "th"
                    ? "เลือกฉาก/สถานที่เดิมที่อนุมัติแล้ว (ไม่บังคับ)"
                    : "Choose an existing approved scene/location (optional)"}
                </Label>
                <Select
                  value={selectedLocationId ?? ""}
                  onValueChange={value => setSelectedLocationId(value)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        locationsQuery.isLoading
                          ? "Loading…"
                          : lang === "th"
                            ? "เลือกสถานที่"
                            : "Select a location"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(location => (
                      <SelectItem
                        key={String(location.locationId)}
                        value={String(location.locationId)}
                      >
                        {location.name ?? location.locationKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLocationId ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {approvedLocationAssets.map(asset => (
                      <Button
                        key={asset.mediaAssetId}
                        type="button"
                        variant="outline"
                        className="h-auto justify-start p-2 text-left text-xs"
                        disabled={references.length >= 3}
                        onClick={() => addExistingLocationAsset(asset)}
                      >
                        {asset.url ? (
                          <AuthenticatedMediaImage
                            src={asset.url}
                            alt={selectedLocation?.name ?? "location"}
                            className="mr-2 h-10 w-10 rounded object-cover"
                            loadingLabel={
                              lang === "th"
                                ? "กำลังโหลดภาพ..."
                                : "Loading image..."
                            }
                            errorLabel={
                              lang === "th"
                                ? "โหลดภาพไม่สำเร็จ"
                                : "Image unavailable"
                            }
                          />
                        ) : null}
                        <span>
                          {lang === "th"
                            ? "เพิ่มภาพฉากนี้"
                            : "Add this scene image"}
                          <span className="block text-[10px] text-muted-foreground">
                            {asset.role ?? "approved reference"} ·{" "}
                            {asset.approved ? "approved" : "QC"}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : null}
                {selectedLocationId &&
                !locationAssetsQuery.isLoading &&
                approvedLocationAssets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {lang === "th"
                      ? "สถานที่นี้ยังไม่มีภาพที่อนุมัติแล้ว ให้แนบภาพใหม่แทน"
                      : "This location has no approved image; upload a new reference instead."}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>
                {lang === "th"
                  ? "ตัวละครจากซีรีย์ (เลือกได้สูงสุด 4 คน)"
                  : "Series characters (up to 4)"}
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {characters.map(character => {
                  const id = resolveSpecialTieInCharacterId(character);
                  if (!id) return null;
                  const portraitUrl =
                    characterPortraitById.get(id)?.thumbnailUrl;
                  const selected = selectedCharacters.has(id);
                  return (
                    <div
                      key={id}
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={String(character.name ?? character.characterName ?? id)}
                      tabIndex={0}
                      onClick={event => {
                        const target = event.target as HTMLElement;
                        if (target.closest("button, input, label")) return;
                        toggleCharacter(id);
                      }}
                      onKeyDown={event => {
                        if (event.currentTarget !== event.target) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleCharacter(id);
                        }
                      }}
                      className={`flex min-h-16 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}
                    >
                      <Checkbox
                        id={`special-tie-in-character-${id}`}
                        checked={selected}
                        onClick={event => event.stopPropagation()}
                        onCheckedChange={() => toggleCharacter(id)}
                      />
                      {portraitUrl ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={
                            lang === "th"
                              ? `ขยายภาพตัวละคร ${character.name ?? character.characterName ?? id} เต็มจอ`
                              : `Open ${character.name ?? character.characterName ?? id} portrait fullscreen`
                          }
                          title={
                            lang === "th"
                              ? "แตะเพื่อขยายภาพเต็มจอ"
                              : "Tap to open fullscreen"
                          }
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setLightbox({
                              src: portraitUrl,
                              alt:
                                character.name ??
                                character.characterName ??
                                id,
                            });
                          }}
                        >
                          <AuthenticatedMediaImage
                            src={portraitUrl}
                            alt=""
                            className="h-14 w-12 rounded-md object-cover"
                            loadingLabel={
                              lang === "th"
                                ? "กำลังโหลดภาพคน..."
                                : "Loading portrait..."
                            }
                            errorLabel={
                              lang === "th"
                                ? "ไม่พบภาพคน"
                                : "Portrait unavailable"
                            }
                          />
                        </button>
                      ) : (
                        <span className="flex h-14 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                          {lang === "th" ? "ไม่มีภาพ" : "No image"}
                        </span>
                      )}
                      <label
                        htmlFor={`special-tie-in-character-${id}`}
                        id={`special-tie-in-character-label-${id}`}
                        className="min-w-0 flex-1 cursor-pointer truncate"
                      >
                        {character.name ?? character.characterName ?? id}
                        <span className="block text-xs text-muted-foreground">
                          {selected
                            ? lang === "th"
                              ? "เลือกใช้ในตอนนี้"
                              : "Selected for this episode"
                            : lang === "th"
                              ? "แตะเพื่อเลือก"
                              : "Tap to select"}
                        </span>
                      </label>
                      {selected ? (
                        <Badge variant="secondary" className="shrink-0">
                          {lang === "th" ? "เลือกแล้ว" : "Selected"}
                        </Badge>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-5 md:col-span-5">
            <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {lang === "th" ? "ความยาวต่อช็อต" : "Duration per shot"}
                </Label>
                <Select
                  value={String(durationSeconds)}
                  onValueChange={value => setDurationSeconds(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIAL_TIE_IN_DURATIONS_SECONDS.map(value => (
                      <SelectItem key={value} value={String(value)}>
                        {value} {lang === "th" ? "วินาที" : "seconds"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{lang === "th" ? "โหมดบทพูด" : "Dialogue mode"}</Label>
                <Select
                  value={dialogueMode}
                  onValueChange={value => {
                    const next = value as "none" | "character_dialogue";
                    setDialogueMode(next);
                    if (next === "none") setSpeakerCharacterIds([]);
                    setFreshIdeaRunId(null);
                    setSelectedIdeaId(null);
                    if (selectedMarketplaceIdea) setIdea("");
                    setSelectedMarketplaceIdea(null);
                    setDialogueBrief("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {lang === "th" ? "ไม่มีบทพูด" : "No dialogue"}
                    </SelectItem>
                    <SelectItem value="character_dialogue">
                      {lang === "th" ? "ให้ตัวละครพูด" : "Character dialogue"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {dialogueMode === "character_dialogue" ? (
              <div className="space-y-2">
                <Label>
                  {lang === "th"
                    ? "ผู้พูด (เลือกได้สูงสุด 3 คน)"
                    : "Speakers (up to 3)"}
                </Label>
                <div className="grid gap-2 md:grid-cols-1 xl:grid-cols-2">
                  {characters
                    .filter(character =>
                      selectedCharacters.has(
                        resolveSpecialTieInCharacterId(character)
                      )
                    )
                    .map(character => {
                      const id = resolveSpecialTieInCharacterId(character);
                      if (!id) return null;
                      return (
                        <label
                          key={id}
                          className="flex items-center gap-2 rounded-md border p-2 text-sm"
                        >
                          <Checkbox
                            checked={speakerCharacterIds.includes(id)}
                            onCheckedChange={checked =>
                              setSpeakerCharacterIds(current =>
                                checked
                                  ? toggleBoundedSelection(current, id, 3)
                                  : current.filter(value => value !== id)
                              )
                            }
                          />
                          <span>
                            {character.name ?? character.characterName ?? id}
                          </span>
                        </label>
                      );
                    })}
                </div>
                {!selectedMarketplaceIdea ? (
                  <Textarea
                    value={dialogueBrief}
                    onChange={event => setDialogueBrief(event.target.value)}
                    maxLength={3000}
                    rows={3}
                    placeholder={
                      lang === "th"
                        ? "แนวทางบทพูด (ไม่บังคับ)…"
                        : "Dialogue guidance (optional)…"
                    }
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? selectedMarketplaceIdea
                      ? "เลือกผู้พูดด้านล่างเพื่อผูกบทเข้ากับตัวละครที่อนุมัติแล้ว หากต้องการล็อกประโยคตรงตัว ให้ขึ้นต้นด้วย EXACT:"
                      : "หากต้องการล็อกบทพูดตรงตัว ให้ขึ้นต้นแต่ละบรรทัดด้วย EXACT: ส่วนข้อความอื่นถือเป็นแนวทางให้ skill"
                    : "To lock exact dialogue, prefix each line with EXACT:. Other text is guidance for the skill."}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {lang === "th"
                    ? "Model สร้างภาพ (เฉพาะตอนนี้)"
                    : "Image model (episode only)"}
                </Label>
                <div data-testid="special-tie-in-image-model">
                  <SpecialTieInModelCombobox
                    models={imageModels}
                    value={imageModelId}
                    onValueChange={setImageModelId}
                    placeholder={
                      modelsQuery.isLoading ? "Loading…" : "Select model"
                    }
                    searchPlaceholder={
                      lang === "th" ? "ค้นหา model สร้างภาพ..." : "Search image models..."
                    }
                    emptyLabel={
                      lang === "th" ? "ไม่พบ model สร้างภาพ" : "No image models found"
                    }
                    ariaLabel={
                      lang === "th" ? "เลือก model สร้างภาพ" : "Select image model"
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>
                  {lang === "th"
                    ? "Model สร้างวิดีโอ (เฉพาะตอนนี้)"
                    : "Video model (episode only)"}
                </Label>
                <div data-testid="special-tie-in-video-model">
                  <SpecialTieInModelCombobox
                    models={videoModels}
                    value={videoModelId}
                    onValueChange={setVideoModelId}
                    placeholder={
                      modelsQuery.isLoading ? "Loading…" : "Select model"
                    }
                    searchPlaceholder={
                      lang === "th" ? "ค้นหา model สร้างวีดีโอ..." : "Search video models..."
                    }
                    emptyLabel={
                      lang === "th" ? "ไม่พบ model สร้างวีดีโอ" : "No video models found"
                    }
                    ariaLabel={
                      lang === "th" ? "เลือก model สร้างวีดีโอ" : "Select video model"
                    }
                  />
                </div>
              </div>
            </div>
            {modelsQuery.isError && !usingPublicModelFallback ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "โหลดรายการ model สำหรับตอนพิเศษไม่สำเร็จ กรุณาลองใหม่"
                  : "Could not load special tie-in models. Try again."}
              </p>
            ) : modelsQuery.isError && usingPublicModelFallback ? (
              <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
                {lang === "th"
                  ? "ใช้รายการ model กลางชั่วคราว เลือกได้ตามรายการที่แสดง"
                  : "Using the public model catalog temporarily; choose from the models shown."}
              </p>
            ) : !modelsQuery.isLoading &&
              (imageModels.length === 0 || videoModels.length === 0) ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "ยังไม่มี model ที่รองรับ 9:16 และการตั้งค่านี้"
                  : "No models support 9:16 and the current settings."}
              </p>
            ) : imageModelId && !selectedImageModelIsValid ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "model สร้างภาพเดิมไม่รองรับภาพอ้างอิง/สัดส่วนนี้ กรุณาเลือกใหม่"
                  : "The selected image model is incompatible with these references. Choose another."}
              </p>
            ) : videoModelId && !selectedVideoModelIsValid ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "model สร้างวิดีโอเดิมไม่รองรับความยาว/บทพูดนี้ กรุณาเลือกใหม่"
                  : "The selected video model is incompatible with this duration/dialogue mode. Choose another."}
              </p>
            ) : null}

            <div className="grid gap-2 md:grid-cols-1 xl:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allowAdditionalCharacters}
                  onCheckedChange={value =>
                    setAllowAdditionalCharacters(Boolean(value))
                  }
                />
                {lang === "th"
                  ? "อนุญาตตัวละคร/ตัวประกอบเพิ่ม"
                  : "Allow extra characters"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={lockCharacterReferences}
                  onCheckedChange={value =>
                    setLockCharacterReferences(Boolean(value))
                  }
                />
                {lang === "th" ? "ล็อกภาพคน" : "Lock people"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={lockReferenceImages}
                  onCheckedChange={value =>
                    setLockReferenceImages(Boolean(value))
                  }
                />
                {lang === "th"
                  ? "ล็อกภาพสินค้า/สถานที่"
                  : "Lock product/location references"}
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || createMutation.isPending || isSubmitting}
            onClick={() => void submit()}
          >
            {createMutation.isPending || isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {onSubmitInput
              ? lang === "th"
                ? "บันทึกและสร้าง Prompt ใหม่"
                : "Save and regenerate prompts"
              : lang === "th"
                ? "สร้างตอนพิเศษและ Prompt"
                : "Create episode & prompts"}
          </Button>
        </DialogFooter>

        <Dialog open={marketplaceOpen} onOpenChange={setMarketplaceOpen}>
          <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-none overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:p-6 lg:w-[94vw] lg:max-w-[94vw]">
            <DialogHeader>
              <DialogTitle>
                {lang === "th"
                  ? "เลือกภาพจาก Marketplace Capture"
                  : "Choose Marketplace Capture images"}
              </DialogTitle>
              <DialogDescription>
                {lang === "th"
                  ? "ค้นหาสินค้า เลือกรายการ แล้วเลือกภาพที่ต้องการ ระบบจะนำเข้าเป็น managed media ให้เอง"
                  : "Search a product, open it, then choose exact images. They are imported as managed media."}
              </DialogDescription>
            </DialogHeader>
            <div className="md:grid md:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)] md:gap-6">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={productQuery}
                    onChange={event => setProductQuery(event.target.value)}
                    placeholder={
                      lang === "th" ? "ค้นหารายการสินค้า…" : "Search products…"
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void productsQuery.refetch()}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground" role="status">
                  {lang === "th"
                    ? `พบ ${products.length} รายการ${productsQuery.hasNextPage ? "ขึ้นไป" : ""}`
                    : `${products.length} product${products.length === 1 ? "" : "s"} shown${productsQuery.hasNextPage ? " so far" : ""}`}
                </p>
                <div className="grid gap-2 lg:grid-cols-2">
                  {products.map((product: any) => (
                    <Button
                      key={product.id}
                      type="button"
                      variant={
                        selectedProductId === String(product.id)
                          ? "secondary"
                          : "outline"
                      }
                      className="h-auto min-h-14 justify-start gap-2 overflow-hidden p-2 text-left"
                      onClick={() => {
                        setSelectedProductId(String(product.id));
                        setPendingImageIds([]);
                      }}
                    >
                      {product.imageUrl || product.imageUrls?.[0] ? (
                        <AuthenticatedMediaImage
                          src={product.imageUrl ?? product.imageUrls[0]}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded object-cover"
                          loadingLabel={
                            lang === "th"
                              ? "กำลังโหลดภาพ..."
                              : "Loading image..."
                          }
                          errorLabel={
                            lang === "th" ? "ไม่พบภาพ" : "Image unavailable"
                          }
                        />
                      ) : (
                        <ImagePlus className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 truncate">
                        {product.productName ?? product.name ?? product.id}
                      </span>
                    </Button>
                  ))}
                </div>
                {productsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th"
                      ? "กำลังค้นหาสินค้า…"
                      : "Searching products…"}
                  </p>
                ) : productsQuery.isError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {lang === "th"
                      ? "ค้นหารายการสินค้าไม่สำเร็จ กรุณาลองใหม่"
                      : "Product search failed. Try again."}
                  </p>
                ) : products.length === 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th"
                      ? "ไม่พบสินค้า ลองเปลี่ยนคำค้นหา"
                      : "No products found. Try another search."}
                  </p>
                ) : null}
                {productsQuery.hasNextPage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={productsQuery.isFetchingNextPage}
                    onClick={() => void productsQuery.fetchNextPage()}
                  >
                    {productsQuery.isFetchingNextPage
                      ? lang === "th"
                        ? "กำลังโหลด…"
                        : "Loading…"
                      : lang === "th"
                        ? "โหลดสินค้าเพิ่มเติม"
                        : "Load more products"}
                  </Button>
                ) : null}
              </div>

              <div className="mt-5 space-y-3 md:mt-0">
                {selectedProductId ? (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {lang === "th"
                          ? "เลือกภาพสินค้านี้"
                          : "Choose product images"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedProduct?.productName ?? selectedProductId}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {pendingImageIds.length}/
                      {Math.max(0, 3 - references.length)}
                    </Badge>
                  </div>
                ) : null}
                {selectedProductId ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {productImages.map((image: any) => {
                      const selected = pendingImageIds.includes(
                        String(image.id)
                      );
                      return (
                        <div
                          key={image.id}
                          className={`relative overflow-hidden rounded-md border text-left transition-shadow ${selected ? "border-primary ring-2 ring-primary" : "hover:border-primary/60"}`}
                        >
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${selected ? "Remove" : "Select"} ${image.imageType ?? "Marketplace image"}`}
                            className="block w-full focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() =>
                              setPendingImageIds(current =>
                                selected
                                  ? current.filter(id => id !== String(image.id))
                                  : current.length >= 3 - references.length
                                    ? current
                                    : [...current, String(image.id)]
                              )
                            }
                          >
                            <AuthenticatedMediaImage
                              src={image.url}
                              alt={image.imageType ?? "Marketplace image"}
                              className="aspect-square w-full object-cover"
                              loadingLabel={lang === "th" ? "กำลังโหลดภาพ..." : "Loading image..."}
                              errorLabel={lang === "th" ? "โหลดภาพไม่สำเร็จ" : "Image unavailable"}
                            />
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-1 top-1 h-7 w-7"
                            aria-label={lang === "th" ? "ขยายภาพสินค้าเต็มจอ" : "Open product image fullscreen"}
                            title={lang === "th" ? "ขยายภาพเต็มจอ" : "Open fullscreen"}
                            onClick={() => setLightbox({ src: image.url, alt: image.imageType ?? "Marketplace image" })}
                          >
                            <Expand className="h-3.5 w-3.5" />
                          </Button>
                          <span className="flex items-center justify-between gap-1 p-2 text-xs">
                            <span className="truncate">
                              {image.imageType ?? "image"}
                            </span>
                            {selected ? (
                              <Badge
                                variant="secondary"
                                className="shrink-0 px-1.5 py-0 text-[10px]"
                              >
                                {lang === "th" ? "เลือกแล้ว" : "Selected"}
                              </Badge>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {lang === "th"
                      ? "เลือกรายการสินค้าเพื่อดูภาพ"
                      : "Choose a product to view its images"}
                  </p>
                )}
                {selectedProductId && imagesQuery.isError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {lang === "th"
                      ? "โหลดภาพสินค้าไม่สำเร็จ กรุณาลองใหม่"
                      : "Could not load product images. Try again."}
                  </p>
                ) : selectedProductId && imagesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th" ? "กำลังโหลดภาพ…" : "Loading images…"}
                  </p>
                ) : selectedProductId &&
                  !imagesQuery.isLoading &&
                  productImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th"
                      ? "ไม่พบภาพที่เลือกได้สำหรับสินค้านี้"
                      : "No selectable images were found for this product."}
                  </p>
                ) : null}
                {selectedProductId && imagesQuery.hasNextPage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={imagesQuery.isFetchingNextPage}
                    onClick={() => void imagesQuery.fetchNextPage()}
                  >
                    {imagesQuery.isFetchingNextPage
                      ? lang === "th"
                        ? "กำลังโหลด…"
                        : "Loading…"
                      : lang === "th"
                        ? "โหลดภาพเพิ่มเติม"
                        : "Load more images"}
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMarketplaceOpen(false)}
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={
                  pendingImageIds.length === 0 || materializeMutation.isPending
                }
                onClick={() => void confirmMarketplaceImages()}
              >
                {materializeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {lang === "th" ? "เพิ่มภาพที่เลือก" : "Add selected images"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={footageFullscreen} onOpenChange={setFootageFullscreen}>
          <DialogContent className="max-w-[95vw] p-3">
            <DialogTitle className="sr-only">{lang === "th" ? "Footage เต็มจอ" : "Fullscreen footage"}</DialogTitle>
            {footagePreviewUrl ? <video className="max-h-[88dvh] w-full object-contain" src={footagePreviewUrl} controls autoPlay aria-label={footageFileName || "Footage preview"} /> : null}
          </DialogContent>
        </Dialog>
        <Dialog open={brollFullscreen} onOpenChange={setBrollFullscreen}>
          <DialogContent className="max-w-[95vw] p-3">
            <DialogTitle className="sr-only">{lang === "th" ? "B-roll เต็มจอ" : "Fullscreen B-roll"}</DialogTitle>
            {brollOutputUrl ? <video className="max-h-[88dvh] w-full object-contain" src={brollOutputUrl} controls autoPlay aria-label="Rendered B-roll preview" /> : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(lightbox)}
          onOpenChange={value => !value && setLightbox(null)}
        >
          <DialogContent className="flex max-h-[95dvh] max-w-[95vw] items-center justify-center p-3">
            <DialogTitle className="sr-only">
              {lang === "th" ? "ภาพขยาย" : "Expanded image"}
            </DialogTitle>
            {lightbox ? (
              <AuthenticatedMediaImage
                src={lightbox.src}
                alt={lightbox.alt}
                className="max-h-[88dvh] max-w-full object-contain"
                loadingLabel={lang === "th" ? "กำลังโหลดภาพ..." : "Loading image..."}
                errorLabel={lang === "th" ? "โหลดภาพไม่สำเร็จ" : "Image unavailable"}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
