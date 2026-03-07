import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "@shared/presentation/aiStylePresets";
import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import {
  AI_STYLE_PRESET_IDS,
  MAX_AI_DRAFT_SLIDES,
} from "@shared/presentation/aiTypes";
import {
  classifyDraftSkillCapability,
  getDraftSkillMediaType,
  getDraftSkillModeLabel,
  isArticleDraftSkill,
  isSupportedDraftSkill,
  shouldUseDraftSkillForMedia,
} from "@shared/presentation/draftSkillCapabilities";
import { SearchableCombobox } from "./SearchableCombobox";
import { ImageModelCombobox } from "./ImageModelCombobox";
import DynamicSkillForm from "@/components/media/DynamicSkillForm";
import type { SkillInputSchema } from "@/components/media/DynamicSkillForm";
import { ModelInputFieldsPanel } from "@/components/media/ModelInputFieldsPanel";
import {
  PRESENTATION_CANVAS_PRESETS,
  getCanvasPresetById,
  getCanvasPresetBySize,
} from "@/presentation-canvas/constants";
import {
  inferWatermarkFormatFromSourceUrl,
  normalizeWatermarkLibraryOptions,
  type LibraryWatermarkOption,
} from "@/lib/presentationWatermark";
import {
  applyModelSyncTargets,
  buildDefaultExtraParamsForModel,
  getMissingRequiredModelFields,
  isTextToImageModel,
  isTextToVideoModel,
  mergeExtraParams,
  parseModelInputFields,
  pickExtraParamsForModel,
  type MediaModelOption,
} from "@/lib/mediaModelInputs";
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Upload,
  Plus,
  Trash2,
  Settings2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: number;
  expectedVersion: number;
  currentSlideCount: number;
  canvasWidth: number;
  canvasHeight: number;
  onComplete?: (context: {
    deckId: number;
    taskId: string;
    result: {
      slidesAdded: number;
      newDeckVersion: number;
      articlePreview: string;
      warnings: string[];
    };
    close: () => void;
  }) => Promise<void> | void;
}

interface ReferenceImageItem {
  url: string;
  name: string;
}

type VisibleSkillOption = {
  slug: string;
  name: string;
  description?: string;
  category?: string | null;
  executionMode?: string | null;
  type?: string | null;
};

const ARTICLE_TARGET_WORDS_MIN = 320;
const ARTICLE_TARGET_WORDS_MAX = 3600;
const ARTICLE_WORDS_PER_SLIDE_EN = 108;
const ARTICLE_WORDS_PER_SLIDE_TH = 92;
const MAX_MEDIA_REFERENCES = 5;
const TOTAL_AI_DRAFT_PHASES = 7;

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function computeRecommendedWordsForLanguage(
  language: "th" | "en",
  numSlides: number,
): number {
  const perSlide = language === "th"
    ? ARTICLE_WORDS_PER_SLIDE_TH
    : ARTICLE_WORDS_PER_SLIDE_EN;
  return clampInteger(
    Math.max(1, numSlides) * perSlide,
    ARTICLE_TARGET_WORDS_MIN,
    ARTICLE_TARGET_WORDS_MAX,
  );
}

function formatAIDraftWarningMessage(warning: string): string | null {
  const cleaned = String(warning || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  const coverageMatch = cleaned.match(
    /^Slide coverage check:\s*([^,]+),\s*avg bullets\s*(.+)$/i,
  );
  if (coverageMatch) {
    return `Slide coverage review: ${coverageMatch[1]}, average bullets ${coverageMatch[2]}.`;
  }

  const returnedNoMediaMatch = cleaned.match(
    /^Slide (\d+): (image|video) generation returned no media \((.+)\)(?: \[task=[^\]]+\])?$/i,
  );
  if (returnedNoMediaMatch) {
    const [, slideNumber, mediaType, rawReason] = returnedNoMediaMatch;
    const normalizedReason = rawReason.toLowerCase();
    const mediaLabel = mediaType.toLowerCase() === "video" ? "Video" : "Image";
    if (
      normalizedReason.includes("timeout_waiting_for_result")
      || normalizedReason.includes("status=processing")
      || normalizedReason.includes("status=pending")
    ) {
      return `Slide ${slideNumber}: ${mediaLabel} is still being processed by the media provider. The system will fetch it automatically when it is ready.`;
    }
    return `Slide ${slideNumber}: ${mediaLabel} generation did not return a usable file.`;
  }

  const deferredTaskMatch = cleaned.match(
    /^Slide (\d+): queued deferred (image|video) task for later fetch(?: \[task=[^\]]+\])?$/i,
  );
  if (deferredTaskMatch) {
    return null;
  }

  const deferredRegionMatch = cleaned.match(
    /^Slide (\d+): deferred media task could not find a target region on slide$/i,
  );
  if (deferredRegionMatch) {
    return `Slide ${deferredRegionMatch[1]}: Media finished later, but the slide no longer had a valid target area to place it.`;
  }

  const audioFailureMatch = cleaned.match(
    /^Slide (\d+): audio generation failed \((.+)\)$/i,
  );
  if (audioFailureMatch) {
    const [, slideNumber, rawReason] = audioFailureMatch;
    const normalizedReason = rawReason.toLowerCase();
    if (normalizedReason.includes("uvoice") && normalizedReason.includes("http 403")) {
      return `Slide ${slideNumber}: Audio generation was rejected by UVoice (403). The current UVoice key likely does not allow this selected voice or tier, so this slide was added without narration.`;
    }
    if (normalizedReason.includes("http 403")) {
      return `Slide ${slideNumber}: Audio generation was rejected by the audio provider (403), so this slide was added without narration.`;
    }
    if (
      normalizedReason.includes("timeout_waiting_for_result")
      || normalizedReason.includes("status=processing")
      || normalizedReason.includes("status=pending")
    ) {
      return `Slide ${slideNumber}: Audio is still being processed by the media provider.`;
    }
    return `Slide ${slideNumber}: Audio generation failed, so this slide was added without narration.`;
  }

  return cleaned.replace(/\s*\[task=[^\]]+\]/gi, "");
}

function formatAIDraftWarnings(warnings: string[] | undefined): string[] {
  if (!warnings || warnings.length === 0) {
    return [];
  }

  const formatted: string[] = [];
  const seen = new Set<string>();
  for (const warning of warnings) {
    const next = formatAIDraftWarningMessage(warning);
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    formatted.push(next);
  }
  return formatted;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const temp = x % y;
    x = y;
    y = temp;
  }
  return x || 1;
}

function toAspectRatio(width: number, height: number): string {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const divisor = gcd(safeWidth, safeHeight);
  return `${Math.round(safeWidth / divisor)}:${Math.round(safeHeight / divisor)}`;
}

function inferUvoiceTierFromModelId(modelId: string | undefined): "standard" | "natural" | "premium" | null {
  const normalized = String(modelId || "").trim().toLowerCase();
  if (normalized.endsWith("/tts-premium")) return "premium";
  if (normalized.endsWith("/tts-natural")) return "natural";
  if (normalized.endsWith("/tts-standard")) return "standard";
  return null;
}

function inferUvoiceTierFromVoiceId(voiceId: unknown): "standard" | "natural" | "premium" | null {
  const normalized = String(voiceId || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("premium")) return "premium";
  if (normalized.includes("natural")) return "natural";
  if (normalized.includes("standard") || normalized.endsWith("sd")) return "standard";
  return null;
}

export function resolveAudioExtraParamsForModel(
  model: MediaModelOption | undefined,
  extraParams: Record<string, unknown>,
): Record<string, unknown> {
  const scopedCurrent = pickExtraParamsForModel(model, extraParams);
  const nextScopedCurrent = { ...(scopedCurrent ?? {}) };
  if (model?.provider?.trim().toLowerCase() === "uvoice") {
    const modelTier = inferUvoiceTierFromModelId(model.id);
    const voiceTier = inferUvoiceTierFromVoiceId(
      nextScopedCurrent.voiceID
      ?? nextScopedCurrent.voiceId
      ?? nextScopedCurrent.voice_id,
    );
    if (modelTier && voiceTier && modelTier !== voiceTier) {
      delete nextScopedCurrent.voiceID;
      delete nextScopedCurrent.voiceId;
      delete nextScopedCurrent.voice_id;
    }
  }
  return mergeExtraParams(
    buildDefaultExtraParamsForModel(model),
    nextScopedCurrent,
  ) ?? {};
}

function formatUvoiceTierLabel(tier: "standard" | "natural" | "premium" | null): string | null {
  if (!tier) {
    return null;
  }
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function AIDraftModal({
  isOpen,
  onClose,
  deckId,
  expectedVersion,
  currentSlideCount,
  canvasWidth,
  canvasHeight,
  onComplete,
}: AIDraftModalProps) {
  const loadSavedValue = (key: string): string => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem(key) || "";
  };

  // Config state
  const [topic, setTopic] = useState("");
  const [useCustomArticle, setUseCustomArticle] = useState(false);
  const [customArticleText, setCustomArticleText] = useState("");
  const [hideTextOnSlides, setHideTextOnSlides] = useState(false);
  const [numSlides, setNumSlides] = useState(5);
  const [language, setLanguage] = useState<"auto" | "en" | "th">("auto");
  const [selectedArticleSkill, setSelectedArticleSkill] = useState(() => loadSavedValue("smartspec_aiDraft_articleSkill"));
  const [selectedImageSkill, setSelectedImageSkill] = useState(() => loadSavedValue("smartspec_aiDraft_imageSkill"));
  const [imageModel, setImageModel] = useState("");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [audioModel, setAudioModel] = useState("");
  const [audioModelExtraParams, setAudioModelExtraParams] = useState<Record<string, unknown>>({});
  const [draftAspectRatio, setDraftAspectRatio] = useState(() => {
    const initialPreset = getCanvasPresetBySize(canvasWidth, canvasHeight);
    if (initialPreset) {
      return initialPreset.id;
    }
    const derivedRatio = toAspectRatio(canvasWidth, canvasHeight);
    return getCanvasPresetById(derivedRatio)?.id ?? PRESENTATION_CANVAS_PRESETS[0]?.id ?? "16:9";
  });
  const [advancedMediaOptionsEnabled, setAdvancedMediaOptionsEnabled] = useState(false);
  const [mediaModelExtraParams, setMediaModelExtraParams] = useState<Record<string, unknown>>({});
  const [imagePromptContext, setImagePromptContext] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [selectedReferenceLibraryUrl, setSelectedReferenceLibraryUrl] = useState("");
  const [referenceLibrarySearchQuery, setReferenceLibrarySearchQuery] = useState("");
  const [debouncedReferenceLibrarySearchQuery, setDebouncedReferenceLibrarySearchQuery] = useState("");
  const [referenceUrlInput, setReferenceUrlInput] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("dark-professional");
  const [headerTitleText, setHeaderTitleText] = useState("");
  const [footerText, setFooterText] = useState("");
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic skill form params
  const [articleSkillParams, setArticleSkillParams] = useState<Record<string, any>>({});

  // Advanced style options default to OFF for this modal
  const [headerEnabled, setHeaderEnabled] = useState(false);
  const [showDeckTitle, setShowDeckTitle] = useState(false);
  const [footerEnabled, setFooterEnabled] = useState(false);
  const [showPageNumber, setShowPageNumber] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkSourceUrl, setWatermarkSourceUrl] = useState("");
  const [watermarkClarityPercent, setWatermarkClarityPercent] = useState(20);
  const [watermarkSearchQuery, setWatermarkSearchQuery] = useState("");
  const [debouncedWatermarkSearchQuery, setDebouncedWatermarkSearchQuery] = useState("");
  const [watermarkSelectionCache, setWatermarkSelectionCache] = useState<LibraryWatermarkOption | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Progress state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isFinalizingCompletion, setIsFinalizingCompletion] = useState(false);
  const [stalledSeconds, setStalledSeconds] = useState(0);
  const lastProgressAtRef = useRef<number>(Date.now());
  const lastProgressMarkerRef = useRef<string>("");
  const completionHandledRef = useRef<string | null>(null);

  const utils = trpc.useUtils();

  // Fetch skills
  const skillsQuery = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
  const skills = (skillsQuery.data?.skills ?? []) as VisibleSkillOption[];
  const watermarkLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: debouncedWatermarkSearchQuery || undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 50,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen,
    },
  );
  const referenceLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: debouncedReferenceLibrarySearchQuery || undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 30,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen,
    },
  );

  // Fetch skill input schema for dynamic form
  const skillSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedArticleSkill },
    { enabled: selectedArticleSkill !== "", staleTime: 300_000 },
  );
  const skillSchema = skillSchemaQuery.data?.hasSchema
    ? (skillSchemaQuery.data.schema as SkillInputSchema)
    : null;
  const selectedDraftSkillRecord = useMemo(
    () => skills.find((skill) => skill.slug === selectedArticleSkill) ?? null,
    [skills, selectedArticleSkill],
  );
  const selectedDraftSkillCapability = classifyDraftSkillCapability(selectedDraftSkillRecord);
  const selectedDraftSkillModeLabel = getDraftSkillModeLabel(selectedDraftSkillRecord);
  const selectedExplicitMediaSkillRecord = useMemo(
    () => (
      selectedImageSkill && selectedImageSkill !== "__none__"
        ? skills.find((skill) => skill.slug === selectedImageSkill) ?? null
        : null
    ),
    [skills, selectedImageSkill],
  );
  const effectiveMediaSkillRecord = selectedExplicitMediaSkillRecord
    ?? (shouldUseDraftSkillForMedia(selectedDraftSkillRecord) ? selectedDraftSkillRecord : null);
  const articleSkillFieldState = useMemo(() => {
    if (!skillSchema?.sections) {
      return { hasLengthField: false, hasWordCountField: false };
    }
    const fieldIds = new Set(
      skillSchema.sections.flatMap((section) =>
        section.fields.map((field) => String(field.id || "").trim()),
      ),
    );
    const hasLengthField = fieldIds.has("length");
    const hasWordCountField = (
      fieldIds.has("word_count")
      || fieldIds.has("wordCount")
      || fieldIds.has("max_words")
      || fieldIds.has("maxWords")
    );
    return { hasLengthField, hasWordCountField };
  }, [skillSchema]);
  const hasArticleWordCountOverrideHint = isArticleDraftSkill(selectedDraftSkillRecord)
    && articleSkillFieldState.hasLengthField
    && articleSkillFieldState.hasWordCountField;
  const wordCountRecommendationHint = useMemo(() => {
    if (!isArticleDraftSkill(selectedDraftSkillRecord) || !articleSkillFieldState.hasWordCountField) {
      return null;
    }
    const slideLabel = numSlides === 1 ? "slide" : "slides";
    if (language === "auto") {
      const thaiMax = computeRecommendedWordsForLanguage("th", numSlides);
      const englishMax = computeRecommendedWordsForLanguage("en", numSlides);
      return `Recommended Maximum Words for ${numSlides} ${slideLabel}: Thai up to ${thaiMax} words, English up to ${englishMax} words.`;
    }
    const recommendedMax = computeRecommendedWordsForLanguage(language, numSlides);
    const languageLabel = language === "th" ? "Thai" : "English";
    return `Recommended Maximum Words for ${numSlides} ${slideLabel} (${languageLabel}): up to ${recommendedMax} words.`;
  }, [articleSkillFieldState.hasWordCountField, language, numSlides, selectedDraftSkillRecord]);

  // Restore saved selections from localStorage when skills load
  useEffect(() => {
    if (skills.length === 0) return;
    const savedArticle = localStorage.getItem("smartspec_aiDraft_articleSkill");
    if (
      savedArticle &&
      !selectedArticleSkill &&
      skills.some(
        (s) => s.slug === savedArticle && isSupportedDraftSkill(s),
      )
    ) {
      setSelectedArticleSkill(savedArticle);
    }
    const savedImage = localStorage.getItem("smartspec_aiDraft_imageSkill");
    if (
      savedImage &&
      !selectedImageSkill &&
      (savedImage === "__none__" ||
        skills.some((s: { slug: string }) => s.slug === savedImage))
    ) {
      setSelectedImageSkill(savedImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills.length]);

  // Restore saved image model from localStorage
  useEffect(() => {
    const savedModel = localStorage.getItem("smartspec_aiDraft_imageModel");
    if (savedModel && !imageModel) {
      setImageModel(savedModel);
    }
    const savedAudioModel = localStorage.getItem("smartspec_aiDraft_audioModel");
    if (savedAudioModel && !audioModel) {
      setAudioModel(savedAudioModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const savedContext = localStorage.getItem("smartspec_aiDraft_imagePromptContext");
    if (savedContext && !imagePromptContext) {
      setImagePromptContext(savedContext);
    }
    const savedRefs = localStorage.getItem("smartspec_aiDraft_referenceImages");
    if (savedRefs && referenceImages.length === 0) {
      try {
        const parsed = JSON.parse(savedRefs);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((item) => item && typeof item.url === "string" && typeof item.name === "string")
            .slice(0, MAX_MEDIA_REFERENCES);
          if (normalized.length > 0) {
            setReferenceImages(normalized);
          }
        }
      } catch {
        // ignore corrupted localStorage payload
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize skill lists for comboboxes
  const draftSkillItems = useMemo(
    () =>
      skills
        .filter((skill) => isSupportedDraftSkill(skill))
        .map((s) => ({
          value: s.slug,
          label: s.name,
          description: `${getDraftSkillModeLabel(s)}${s.description ? ` - ${s.description}` : ""}`,
        })),
    [skills],
  );

  const imageSkillItems = useMemo(
    () => [
      { value: "__none__", label: "None" },
      ...skills
        .filter((skill) => shouldUseDraftSkillForMedia(skill))
        .map((s) => ({
          value: s.slug,
          label: s.name,
          description: `${getDraftSkillModeLabel(s)}${s.description ? ` - ${s.description}` : ""}`,
        })),
    ],
    [skills],
  );

  // Derive media type from selected image skill category
  const mediaModelType: "image" | "video" =
    getDraftSkillMediaType(effectiveMediaSkillRecord);
  const mediaModelsQuery = trpc.media.getModels.useQuery(
    { type: mediaModelType },
    { staleTime: 300_000 },
  );
  const mediaModels = (mediaModelsQuery.data?.models ?? []) as MediaModelOption[];
  const compatibleMediaModels = mediaModelType === "video"
    ? mediaModels.filter(isTextToVideoModel)
    : mediaModels.filter(isTextToImageModel);
  const displayedMediaModels = mediaModelType === "video"
    ? (compatibleMediaModels.length > 0 ? compatibleMediaModels : mediaModels)
    : compatibleMediaModels;
  const backendDefaultMediaModelId = mediaModelType === "video"
    ? mediaModelsQuery.data?.defaults?.video
    : mediaModelsQuery.data?.defaults?.image;
  const defaultMediaModelId = backendDefaultMediaModelId
    || displayedMediaModels[0]?.id
    || "";
  const selectedMediaModelId = (
    imageModel.trim() && mediaModels.some((model) => model.id === imageModel.trim())
      ? imageModel.trim()
      : defaultMediaModelId
  );
  const selectedMediaModelConfig = mediaModels.find((model) => model.id === selectedMediaModelId);
  const selectedMediaModelFields = useMemo(
    () => parseModelInputFields(selectedMediaModelConfig),
    [selectedMediaModelConfig],
  );
  const audioModelsQuery = trpc.media.getModels.useQuery(
    { type: "audio" },
    { staleTime: 300_000 },
  );
  const audioModels = (audioModelsQuery.data?.models ?? []) as MediaModelOption[];
  const defaultAudioModelId = audioModelsQuery.data?.defaults?.audio || audioModels[0]?.id || "";
  const selectedAudioModelId = (
    audioModel.trim() && audioModels.some((model) => model.id === audioModel.trim())
      ? audioModel.trim()
      : defaultAudioModelId
  );
  const selectedAudioModelConfig = audioModels.find((model) => model.id === selectedAudioModelId);
  const selectedUvoiceTierLabel = formatUvoiceTierLabel(
    selectedAudioModelConfig?.provider?.trim().toLowerCase() === "uvoice"
      ? inferUvoiceTierFromModelId(selectedAudioModelConfig.id)
      : null,
  );
  const selectedAudioModelFields = useMemo(
    () => parseModelInputFields(selectedAudioModelConfig),
    [selectedAudioModelConfig],
  );
  const canvasAspectRatio = useMemo(
    () => toAspectRatio(canvasWidth, canvasHeight),
    [canvasWidth, canvasHeight],
  );
  const detectedCanvasPresetId = useMemo(() => {
    const fromSize = getCanvasPresetBySize(canvasWidth, canvasHeight);
    if (fromSize) {
      return fromSize.id;
    }
    return getCanvasPresetById(canvasAspectRatio)?.id ?? PRESENTATION_CANVAS_PRESETS[0]?.id ?? "16:9";
  }, [canvasWidth, canvasHeight, canvasAspectRatio]);
  const selectedCanvasPreset = useMemo(
    () => getCanvasPresetById(draftAspectRatio) ?? getCanvasPresetById(detectedCanvasPresetId),
    [draftAspectRatio, detectedCanvasPresetId],
  );
  const selectedCanvasWidth = selectedCanvasPreset?.width ?? canvasWidth;
  const selectedCanvasHeight = selectedCanvasPreset?.height ?? canvasHeight;
  const selectedCanvasAspectRatio = selectedCanvasPreset?.id ?? canvasAspectRatio;
  const normalizedReferenceImageUrls = useMemo(
    () => {
      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const item of referenceImages) {
        const url = String(item.url || "").trim();
        if (!url || seen.has(url) || (!url.startsWith("/") && !/^https?:\/\//i.test(url))) {
          continue;
        }
        seen.add(url);
        deduped.push(url);
        if (deduped.length >= MAX_MEDIA_REFERENCES) {
          break;
        }
      }
      return deduped;
    },
    [referenceImages],
  );
  const watermarkOptions = useMemo(
    () => normalizeWatermarkLibraryOptions(watermarkLibraryQuery.data?.results),
    [watermarkLibraryQuery.data?.results],
  );
  const selectedWatermarkOption = useMemo(
    () => {
      const sourceUrl = watermarkSourceUrl.trim();
      if (!sourceUrl) {
        return null;
      }
      const fromList = watermarkOptions.find((option) => option.sourceUrl === sourceUrl);
      if (fromList) {
        return fromList;
      }
      if (watermarkSelectionCache?.sourceUrl === sourceUrl) {
        return watermarkSelectionCache;
      }
      const inferredFormat = inferWatermarkFormatFromSourceUrl(sourceUrl);
      if (!inferredFormat) {
        return null;
      }
      return {
        id: -1,
        label: sourceUrl.split("/").pop() || "Selected watermark",
        sourceUrl,
        thumbnailUrl: sourceUrl,
        format: inferredFormat,
      } satisfies LibraryWatermarkOption;
    },
    [watermarkOptions, watermarkSourceUrl, watermarkSelectionCache],
  );
  const watermarkComboboxItems = useMemo(
    () => watermarkOptions.map((option) => ({
      value: option.sourceUrl,
      label: option.label,
      description: `.${option.format}`,
    })),
    [watermarkOptions],
  );
  const referenceLibraryItems = useMemo(() => {
    const results = (referenceLibraryQuery.data?.results ?? []) as Array<{
      source_url?: string | null;
      title?: string | null;
      metadata?: { mimeType?: string | null; extension?: string | null } | null;
    }>;
    return results.reduce<Array<{ value: string; label: string; description?: string }>>((acc, item) => {
      const url = String(item.source_url || "").trim();
      if (!url) {
        return acc;
      }
      const extension = String(item.metadata?.extension || "").trim();
      acc.push({
        value: url,
        label: String(item.title || url.split("/").pop() || "Library image"),
        description: extension ? `.${extension}` : undefined,
      });
      return acc;
    }, []);
  }, [referenceLibraryQuery.data?.results]);

  const handleWatermarkSourceChange = useCallback((sourceUrl: string) => {
    setWatermarkSourceUrl(sourceUrl);
    const selected = watermarkOptions.find((option) => option.sourceUrl === sourceUrl) || null;
    if (selected) {
      setWatermarkSelectionCache(selected);
    }
  }, [watermarkOptions]);

  // Mutations
  const generateDraft = trpc.presentation.ai.generateDraft.useMutation();
  const cancelDraft = trpc.presentation.ai.cancelDraft.useMutation();
  const uploadReferenceMutation = trpc.ai.upload.useMutation();

  // Polling progress
  const progressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
    { taskId: taskId! },
    {
      enabled: isOpen && taskId !== null && !completed,
      refetchInterval: 2000,
    },
  );
  const progress = progressQuery.data;
  const formattedResultWarnings = useMemo(
    () => formatAIDraftWarnings(progress?.result?.warnings),
    [progress?.result?.warnings],
  );

  // Track completion
  useEffect(() => {
    if (progress?.completed && !completed) {
      setCompleted(true);
    }
  }, [progress?.completed, completed]);

  useEffect(() => {
    if (!isOpen || !taskId) {
      lastProgressAtRef.current = Date.now();
      lastProgressMarkerRef.current = "";
      setStalledSeconds(0);
      setIsFinalizingCompletion(false);
      return;
    }

    const marker = progress
      ? `${progress.phase}|${progress.phaseLabel}|${progress.slidesCompleted}|${progress.totalSlides}|${progress.completed ? 1 : 0}|${progress.error?.code ?? ""}`
      : "pending";

    if (marker !== lastProgressMarkerRef.current) {
      lastProgressMarkerRef.current = marker;
      lastProgressAtRef.current = Date.now();
      setStalledSeconds(0);
    }
  }, [
    isOpen,
    taskId,
    progress?.phase,
    progress?.phaseLabel,
    progress?.slidesCompleted,
    progress?.totalSlides,
    progress?.completed,
    progress?.error?.code,
  ]);

  useEffect(() => {
    if (!isOpen || !taskId || completed) {
      setStalledSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastProgressAtRef.current) / 1000);
      setStalledSeconds(elapsed);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, taskId, completed]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    setTaskId(null);
    setCompleted(false);
    setIsFinalizingCompletion(false);
    setStalledSeconds(0);
    lastProgressAtRef.current = Date.now();
    lastProgressMarkerRef.current = "";
    completionHandledRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedWatermarkSearchQuery(watermarkSearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [watermarkSearchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedReferenceLibrarySearchQuery(referenceLibrarySearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [referenceLibrarySearchQuery]);

  // Reset advanced options to modal defaults on each open
  useEffect(() => {
    if (!isOpen) return;
    completionHandledRef.current = null;
    setDraftAspectRatio(detectedCanvasPresetId);
    setAdvancedMediaOptionsEnabled(false);
    setMediaModelExtraParams({});
    setGenerateAudio(false);
    setHideTextOnSlides(false);
    setAudioModelExtraParams({});
    setSelectedReferenceLibraryUrl("");
    setReferenceLibrarySearchQuery("");
    setDebouncedReferenceLibrarySearchQuery("");
    setHeaderEnabled(false);
    setShowDeckTitle(false);
    setFooterEnabled(false);
    setShowPageNumber(false);
    setWatermarkEnabled(false);
    setWatermarkClarityPercent(20);
    setWatermarkSearchQuery("");
    setDebouncedWatermarkSearchQuery("");
  }, [isOpen, detectedCanvasPresetId]);

  useEffect(() => {
    if (!hideTextOnSlides) {
      return;
    }
    setHeaderEnabled(false);
    setShowDeckTitle(false);
    setFooterEnabled(false);
    setShowPageNumber(false);
  }, [hideTextOnSlides]);

  useEffect(() => {
    setMediaModelExtraParams((prev) => {
      const scopedCurrent = pickExtraParamsForModel(selectedMediaModelConfig, prev);
      const next = mergeExtraParams(
        buildDefaultExtraParamsForModel(selectedMediaModelConfig),
        scopedCurrent,
      ) ?? {};
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (!Object.is(prev[key], next[key])) {
          return next;
        }
      }
      return prev;
    });
  }, [selectedMediaModelConfig?.id]);

  useEffect(() => {
    setAudioModelExtraParams((prev) => {
      const next = resolveAudioExtraParamsForModel(selectedAudioModelConfig, prev);
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (!Object.is(prev[key], next[key])) {
          return next;
        }
      }
      return prev;
    });
  }, [selectedAudioModelConfig?.id]);

  useEffect(() => {
    if (!watermarkEnabled || watermarkSourceUrl) {
      return;
    }
    const first = watermarkOptions[0];
    if (!first) {
      return;
    }
    setWatermarkSourceUrl(first.sourceUrl);
    setWatermarkSelectionCache(first);
  }, [watermarkEnabled, watermarkSourceUrl, watermarkOptions]);

  const selectedPreset = getBuiltInPreset(selectedPresetId);
  const advancedMediaBaseExtraParams = useMemo(
    () => mergeExtraParams(
      buildDefaultExtraParamsForModel(selectedMediaModelConfig),
      advancedMediaOptionsEnabled
        ? pickExtraParamsForModel(selectedMediaModelConfig, mediaModelExtraParams)
        : undefined,
    ),
    [selectedMediaModelConfig, advancedMediaOptionsEnabled, mediaModelExtraParams],
  );
  const advancedMediaSyncedExtraParams = useMemo(
    () => applyModelSyncTargets(
      selectedMediaModelConfig,
      advancedMediaBaseExtraParams,
      {
        aspectRatio: selectedCanvasAspectRatio,
        referenceImageUrls: normalizedReferenceImageUrls,
      },
    ),
    [
      selectedMediaModelConfig,
      advancedMediaBaseExtraParams,
      selectedCanvasAspectRatio,
      normalizedReferenceImageUrls,
    ],
  );

  const canGenerate =
    (useCustomArticle
      ? customArticleText.trim().length > 0
      : topic.length >= 3 && selectedArticleSkill !== "") &&
    (!watermarkEnabled || selectedWatermarkOption !== null) &&
    !generateDraft.isPending;

  const isValidReferenceUrl = useCallback((value: string): boolean => {
    const trimmed = value.trim();
    return trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed);
  }, []);

  const persistReferenceImages = useCallback((images: ReferenceImageItem[]) => {
    if (images.length === 0) {
      localStorage.removeItem("smartspec_aiDraft_referenceImages");
      return;
    }
    localStorage.setItem("smartspec_aiDraft_referenceImages", JSON.stringify(images.slice(0, MAX_MEDIA_REFERENCES)));
  }, []);

  const handleAddReferenceUrl = useCallback(() => {
    const url = referenceUrlInput.trim();
    if (!url) {
      return;
    }
    if (!isValidReferenceUrl(url)) {
      toast.error("Reference URL must start with / or http(s)://");
      return;
    }
    setReferenceImages((prev) => {
      if (prev.some((item) => item.url === url)) {
        toast.info("This reference image is already added.");
        return prev;
      }
      if (prev.length >= MAX_MEDIA_REFERENCES) {
        toast.error("Maximum 5 reference images");
        return prev;
      }
      const next = [...prev, { url, name: `Reference ${prev.length + 1}` }];
      persistReferenceImages(next);
      return next;
    });
    setReferenceUrlInput("");
  }, [referenceUrlInput, isValidReferenceUrl, persistReferenceImages]);

  const handleAddReferenceFromLibrary = useCallback((url: string) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      return;
    }
    setReferenceImages((prev) => {
      if (prev.some((item) => item.url === normalizedUrl)) {
        toast.info("This reference image is already added.");
        return prev;
      }
      if (prev.length >= MAX_MEDIA_REFERENCES) {
        toast.error("Maximum 5 reference images");
        return prev;
      }
      const libraryItem = referenceLibraryItems.find((item) => item.value === normalizedUrl);
      const next = [...prev, {
        url: normalizedUrl,
        name: libraryItem?.label || `Reference ${prev.length + 1}`,
      }];
      persistReferenceImages(next);
      return next;
    });
    setSelectedReferenceLibraryUrl("");
  }, [persistReferenceImages, referenceLibraryItems]);

  const handleRemoveReferenceImage = useCallback((url: string) => {
    setReferenceImages((prev) => {
      const next = prev.filter((item) => item.url !== url);
      persistReferenceImages(next);
      return next;
    });
  }, [persistReferenceImages]);

  const handleReferenceFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const remainingSlots = Math.max(0, MAX_MEDIA_REFERENCES - referenceImages.length);
      if (remainingSlots === 0) {
        toast.error("Maximum 5 reference images");
        event.target.value = "";
        return;
      }

      const filesToUpload = Array.from(files).slice(0, remainingSlots);
      const nextImages: ReferenceImageItem[] = [];

      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) {
          continue;
        }
        try {
          const fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          });

          const result = await uploadReferenceMutation.mutateAsync({
            fileName: file.name,
            fileType: file.type,
            fileBase64,
          });
          nextImages.push({ url: result.url, name: file.name });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `Upload failed (${file.name}): ${error.message}`
              : `Upload failed (${file.name})`,
          );
        }
      }

      if (nextImages.length > 0) {
        setReferenceImages((prev) => {
          const deduped = [...prev];
          for (const img of nextImages) {
            if (
              !deduped.some((existing) => existing.url === img.url)
              && deduped.length < MAX_MEDIA_REFERENCES
            ) {
              deduped.push(img);
            }
          }
          persistReferenceImages(deduped);
          return deduped;
        });
      }

      event.target.value = "";
    },
    [referenceImages.length, uploadReferenceMutation, persistReferenceImages],
  );

  const handleGenerate = useCallback(() => {
    if (advancedMediaOptionsEnabled) {
      const missingRequiredFields = getMissingRequiredModelFields(selectedMediaModelFields, {
        extraParams: advancedMediaSyncedExtraParams,
        aspectRatio: selectedCanvasAspectRatio,
        referenceImageUrls: normalizedReferenceImageUrls,
      }, {
        treatPromptSyncAsAuto: true,
      });
      if (missingRequiredFields.length > 0) {
        toast.error(`Please fill required model inputs: ${missingRequiredFields.join(", ")}`);
        return;
      }
    }

    if (generateAudio) {
      const missingAudioFields = getMissingRequiredModelFields(selectedAudioModelFields, {
        extraParams: audioModelExtraParams,
      }, {
        treatPromptSyncAsAuto: true,
      });
      if (missingAudioFields.length > 0) {
        toast.error(`Please fill required audio inputs: ${missingAudioFields.join(", ")}`);
        return;
      }
    }

    // Always send explicit advanced style options from modal state
    const overrides = {
      headerEnabled: effectiveHeaderEnabled,
      showDeckTitle: effectiveShowDeckTitle,
      footerEnabled: effectiveFooterEnabled,
      showPageNumber: effectiveShowPageNumber,
    };
    const effectivePrompt = useCustomArticle
      ? (topic.trim() || customArticleText.trim().slice(0, 1000) || "Custom article")
      : topic;

    generateDraft.mutate(
      {
        deckId,
        expectedVersion,
        prompt: effectivePrompt,
        numSlides,
        language: language as "auto" | "en" | "th",
        draftSkillId:
          !useCustomArticle && selectedArticleSkill
            ? selectedArticleSkill
            : undefined,
        articleSkillId:
          !useCustomArticle && selectedArticleSkill && isArticleDraftSkill(selectedDraftSkillRecord)
            ? selectedArticleSkill
            : undefined,
        useCustomArticle,
        customArticleText:
          useCustomArticle && customArticleText.trim().length > 0
            ? customArticleText.trim()
            : undefined,
        hideTextOnSlides,
        imageSkillId:
          selectedImageSkill && selectedImageSkill !== "__none__"
            ? selectedImageSkill
            : undefined,
        imageModel: selectedMediaModelId || undefined,
        generateAudio,
        audioModel: generateAudio ? (selectedAudioModelId || undefined) : undefined,
        audioModelExtraParams:
          generateAudio
          && Object.keys(audioModelExtraParams).length > 0
            ? audioModelExtraParams
            : undefined,
        canvasWidth: selectedCanvasWidth,
        canvasHeight: selectedCanvasHeight,
        imagePromptContext: imagePromptContext.trim() || undefined,
        referenceImageUrls:
          normalizedReferenceImageUrls.length > 0
            ? normalizedReferenceImageUrls
            : undefined,
        mediaModelExtraParams:
          advancedMediaOptionsEnabled
          && advancedMediaSyncedExtraParams
          && Object.keys(advancedMediaSyncedExtraParams).length > 0
            ? advancedMediaSyncedExtraParams
            : undefined,
        stylePresetId: selectedPresetId as (typeof AI_STYLE_PRESET_IDS)[number],
        headerCustomText: headerTitleText.trim() || undefined,
        footerCustomText: footerText || undefined,
        styleOverrides: overrides,
        watermark:
          watermarkEnabled && selectedWatermarkOption
            ? {
              sourceUrl: selectedWatermarkOption.sourceUrl,
              format: selectedWatermarkOption.format,
              clarityPercent: watermarkClarityPercent,
            }
            : undefined,
        draftSkillParams:
          !useCustomArticle && Object.keys(articleSkillParams).length > 0
            ? articleSkillParams
            : undefined,
        articleSkillParams:
          !useCustomArticle && isArticleDraftSkill(selectedDraftSkillRecord) && Object.keys(articleSkillParams).length > 0
            ? articleSkillParams
            : undefined,
      },
      {
        onSuccess: (data) => {
          setTaskId(data.taskId);
          setCompleted(false);
          if (data.alreadyInProgress) {
            toast.info("Resuming your existing AI draft job");
          }
        },
        onError: (err) => {
          toast.error(err.message || "Failed to start generation");
        },
      },
    );
  }, [
    generateDraft,
    deckId,
    expectedVersion,
    topic,
    useCustomArticle,
    customArticleText,
    hideTextOnSlides,
    numSlides,
    language,
    selectedArticleSkill,
    selectedDraftSkillRecord,
    selectedImageSkill,
    imageModel,
    generateAudio,
    audioModel,
    selectedAudioModelFields,
    audioModelExtraParams,
    selectedCanvasWidth,
    selectedCanvasHeight,
    imagePromptContext,
    normalizedReferenceImageUrls,
    advancedMediaOptionsEnabled,
    selectedMediaModelFields,
    advancedMediaSyncedExtraParams,
    selectedCanvasAspectRatio,
    selectedPresetId,
    headerTitleText,
    footerText,
    headerEnabled,
    showDeckTitle,
    footerEnabled,
    showPageNumber,
    watermarkEnabled,
    selectedWatermarkOption,
    watermarkClarityPercent,
    articleSkillParams,
  ]);

  const handleCancel = useCallback(() => {
    if (taskId) {
      cancelDraft.mutate({ taskId });
    }
  }, [cancelDraft, taskId]);

  const handleClose = useCallback(() => {
    if (isFinalizingCompletion) {
      return;
    }
    if (completed && progress?.result) {
      utils.presentation.getDeck.invalidate({ deckId });
      utils.presentation.getDeckByLibraryItem.invalidate();
      utils.presentation.listVersions.invalidate({ deckId });
      utils.presentation.getSlideshow.invalidate({ deckId });
    }
    onClose();
  }, [completed, progress, utils, deckId, isFinalizingCompletion, onClose]);

  useEffect(() => {
    if (!onComplete || !taskId || !progress?.completed || !progress.result) {
      return;
    }
    if (completionHandledRef.current === taskId) {
      return;
    }

    completionHandledRef.current = taskId;
    setIsFinalizingCompletion(true);

    void Promise.resolve(
      onComplete({
        deckId,
        taskId,
        result: progress.result,
        close: handleClose,
      }),
    )
      .catch((error) => {
        completionHandledRef.current = null;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to finalize AI draft output.",
        );
      })
      .finally(() => {
        setIsFinalizingCompletion(false);
      });
  }, [deckId, handleClose, onComplete, progress?.completed, progress?.result, taskId]);

  const handlePresetSelect = useCallback((id: string) => {
    setSelectedPresetId(id);
    const preset = getBuiltInPreset(id);
    setFooterText(preset?.footer?.customText ?? "");
    // Keep advanced options OFF by default even when preset changes
    setHeaderEnabled(false);
    setShowDeckTitle(false);
    setFooterEnabled(false);
    setShowPageNumber(false);
  }, []);

  const progressPercent = progress
    ? Math.max(
        0,
        Math.round(
          ((progress.phase -
            1 +
            (progress.totalSlides > 0
              ? progress.slidesCompleted / progress.totalSlides
              : 0)) /
            TOTAL_AI_DRAFT_PHASES) *
            100,
        ),
      )
    : 0;
  const showStalledWarning = Boolean(
    taskId
    && progress
    && !progress.completed
    && !progress.error
    && stalledSeconds >= 120,
  );

  // Effective values for advanced toggles
  const effectiveHeaderEnabled = hideTextOnSlides ? false : headerEnabled;
  const effectiveShowDeckTitle = hideTextOnSlides ? false : showDeckTitle;
  const effectiveFooterEnabled = hideTextOnSlides ? false : footerEnabled;
  const effectiveShowPageNumber = hideTextOnSlides ? false : showPageNumber;
  const updateMediaModelExtraParam = useCallback((key: string, value: unknown) => {
    setMediaModelExtraParams((prev) => {
      const next: Record<string, unknown> = { ...prev };
      if (
        value === undefined
        || value === null
        || value === ""
        || (Array.isArray(value) && value.length === 0)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);
  const updateAudioModelExtraParam = useCallback((key: string, value: unknown) => {
    setAudioModelExtraParams((prev) => {
      const next: Record<string, unknown> = { ...prev };
      if (
        value === undefined
        || value === null
        || value === ""
        || (Array.isArray(value) && value.length === 0)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const renderDynamicMediaModelInputs = () => {
    return (
      <ModelInputFieldsPanel
        enabled={advancedMediaOptionsEnabled}
        model={selectedMediaModelConfig}
        fields={selectedMediaModelFields}
        extraParams={mediaModelExtraParams}
        onChange={updateMediaModelExtraParam}
        promptPreview="Auto from generated slide prompts"
        aspectRatioPreview={selectedCanvasAspectRatio}
        referenceImageUrls={normalizedReferenceImageUrls}
        panelTestId="advanced-media-model-inputs"
        emptyTestId="advanced-media-model-inputs-empty"
      />
    );
  };
  const renderDynamicAudioModelInputs = () => {
    return (
      <ModelInputFieldsPanel
        enabled={generateAudio}
        model={selectedAudioModelConfig}
        fields={selectedAudioModelFields}
        extraParams={audioModelExtraParams}
        onChange={updateAudioModelExtraParam}
        promptPreview="Auto from generated slide narration"
        panelTestId="audio-model-inputs"
        emptyTestId="audio-model-inputs-empty"
        titlePrefix="Audio Inputs"
        ariaLabelPrefix="Audio"
      />
    );
  };

  // Config phase
  const configView = (
    <div className="space-y-4">
      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-topic">Topic</Label>
        <textarea
          id="ai-topic"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          placeholder={useCustomArticle
            ? "Topic is optional when you provide your own article."
            : "Describe what your presentation should be about..."}
          maxLength={1000}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={useCustomArticle}
        />
      </div>

      <div className="space-y-2 rounded-md border border-muted bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Use Your Own Article</Label>
            <p className="text-xs text-muted-foreground">
              Paste your article below to skip article skill generation and go straight to slide structuring.
            </p>
          </div>
          <Switch
            aria-label="Use your own article"
            checked={useCustomArticle}
            onCheckedChange={setUseCustomArticle}
          />
        </div>
        {useCustomArticle && (
          <div className="space-y-1.5">
            <Label htmlFor="ai-custom-article">Article Content</Label>
            <textarea
              id="ai-custom-article"
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[180px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              placeholder="Paste your article here..."
              maxLength={20000}
              value={customArticleText}
              onChange={(e) => setCustomArticleText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The system will reuse your article, split it into slide-sized sections, and continue the normal draft flow.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-muted bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Hide On-Slide Text</Label>
            <p className="text-xs text-muted-foreground">
              Use the article only for generating media and narration. Slides will render full-canvas image or video without visible text.
            </p>
          </div>
          <Switch
            aria-label="Hide on-slide text"
            checked={hideTextOnSlides}
            onCheckedChange={setHideTextOnSlides}
          />
        </div>
      </div>

      {/* Slide count */}
      <div className="space-y-1.5">
        <Label>Number of slides: {numSlides}</Label>
        <Slider
          min={1}
          max={MAX_AI_DRAFT_SLIDES}
          step={1}
          value={[numSlides]}
          onValueChange={(v) => setNumSlides(v[0])}
          className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:rounded-full [&_[data-slot=slider-track]]:bg-gray-200 [&_[data-slot=slider-range]]:bg-teal-500 [&_[data-slot=slider-range]]:h-full [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-teal-500 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:rounded-full"
        />
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <Label>Language</Label>
        <Select value={language} onValueChange={(value) => setLanguage(value as "auto" | "en" | "th")}>
          <SelectTrigger>
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="th">Thai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Draft skill (searchable) */}
      {!useCustomArticle && (
        <div className="space-y-1.5">
          <Label>Draft Skill</Label>
          <p className="text-xs text-muted-foreground">
            Supports article generation, prompt-for-image, prompt-for-video, image generation, and video generation skills. Draft with AI will adapt its flow automatically from the selected skill type.
          </p>
          <SearchableCombobox
            items={draftSkillItems}
            value={selectedArticleSkill}
            onValueChange={(v) => {
              const previousDraftSkill = selectedDraftSkillRecord;
              const nextDraftSkill = skills.find((skill) => skill.slug === v) ?? null;
              const previousMediaType =
                selectedImageSkill && selectedImageSkill !== "__none__"
                  ? mediaModelType
                  : getDraftSkillMediaType(previousDraftSkill);
              const nextMediaType =
                selectedImageSkill && selectedImageSkill !== "__none__"
                  ? mediaModelType
                  : getDraftSkillMediaType(nextDraftSkill);
              if (previousMediaType !== nextMediaType) {
                setImageModel("");
                setAdvancedMediaOptionsEnabled(false);
                setMediaModelExtraParams({});
                localStorage.removeItem("smartspec_aiDraft_imageModel");
              }
              setSelectedArticleSkill(v);
              setArticleSkillParams({});
              localStorage.setItem("smartspec_aiDraft_articleSkill", v);
            }}
            placeholder="Select draft skill..."
            searchPlaceholder="Search skills..."
            emptyMessage="No supported draft skills found."
          />
          {selectedDraftSkillRecord && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
                {selectedDraftSkillModeLabel}
              </Badge>
              <span>
                {selectedDraftSkillCapability === "article"
                  ? "The skill will write a source article first, then the system will split it into slides."
                  : selectedDraftSkillCapability === "prompt"
                    ? "The system will plan slides from the topic, then use this skill to enhance prompts for the media phase."
                    : selectedDraftSkillCapability === "video"
                      ? "The system will plan slides from the topic and treat this as the default video-generation skill."
                      : "The system will plan slides from the topic and treat this as the default image-generation skill."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Dynamic skill form fields */}
      {!useCustomArticle && skillSchema && (
        <div className="rounded-md border border-muted bg-muted/30 p-3">
          <DynamicSkillForm
            schema={skillSchema}
            language={language === "th" ? "th" : "en"}
            values={articleSkillParams}
            onChange={setArticleSkillParams}
            excludeFields={["topic", "prompt", "subject"]}
            className="space-y-3"
          />
          {wordCountRecommendationHint && (
            <p
              data-testid="word-count-recommendation-hint"
              className="mt-2 text-xs text-muted-foreground"
            >
              {wordCountRecommendationHint}
            </p>
          )}
          {hasArticleWordCountOverrideHint && (
            <p
              data-testid="word-count-override-hint"
              className="mt-2 text-xs text-muted-foreground"
            >
              If both <span className="font-medium">Length</span> and <span className="font-medium">Maximum Words</span> are set, <span className="font-medium">Maximum Words</span> overrides Length.
            </p>
          )}
        </div>
      )}

      {/* Image skill (searchable, optional) */}
      <div className="space-y-1.5">
        <Label>Media Skill Override (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Leave empty to reuse the selected Draft Skill for prompt/media work when it supports that phase.
        </p>
        <SearchableCombobox
          items={imageSkillItems}
          value={selectedImageSkill || "__none__"}
          onValueChange={(v) => {
            // Detect if skill type changed; reset model to avoid cross-type mismatch
            const prevSkill =
              selectedImageSkill && selectedImageSkill !== "__none__"
                ? skills.find(
                    (s: { slug: string }) => s.slug === selectedImageSkill,
                  )
                : null;
            const nextSkill =
              v && v !== "__none__"
                ? skills.find((s: { slug: string }) => s.slug === v)
                : null;
            const prevType = getDraftSkillMediaType(
              prevSkill as { category?: string; executionMode?: string; type?: string } | null,
            );
            const nextType = getDraftSkillMediaType(
              nextSkill as { category?: string; executionMode?: string; type?: string } | null,
            );
            if (prevType !== nextType) {
              setImageModel("");
              setAdvancedMediaOptionsEnabled(false);
              setMediaModelExtraParams({});
              localStorage.removeItem("smartspec_aiDraft_imageModel");
            }
            setSelectedImageSkill(v);
            localStorage.setItem("smartspec_aiDraft_imageSkill", v);
          }}
            placeholder="None"
            searchPlaceholder="Search media skills..."
            emptyMessage="No compatible media skills found."
          />
      </div>

      {/* Media model (image/video generation) */}
      <div className="space-y-1.5">
        <Label>
          Media Model ({mediaModelType === "video" ? "Video" : "Image"}, optional)
        </Label>
        <p className="text-xs text-muted-foreground">
          {mediaModelType === "video"
            ? "Choose the video generation model for this draft."
            : "Choose the image model for this draft (text-to-image compatible models only)."}
        </p>
        <ImageModelCombobox
          value={imageModel}
          mediaType={mediaModelType}
          onValueChange={(v) => {
            setImageModel(v);
            const nextModelId = v.trim() || defaultMediaModelId;
            const nextModel = mediaModels.find((model) => model.id === nextModelId);
            const nextExtraParams = mergeExtraParams(
              buildDefaultExtraParamsForModel(nextModel),
              pickExtraParamsForModel(nextModel, mediaModelExtraParams),
            ) ?? {};
            setMediaModelExtraParams(nextExtraParams);
            if (v) {
              localStorage.setItem("smartspec_aiDraft_imageModel", v);
            } else {
              localStorage.removeItem("smartspec_aiDraft_imageModel");
            }
          }}
        />
      </div>

      <div className="space-y-2 rounded-md border border-muted bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Generate Slide Audio</Label>
            <p className="text-xs text-muted-foreground">
              Create voice narration for each slide.
            </p>
          </div>
          <Switch
            aria-label="Generate audio"
            checked={generateAudio}
            onCheckedChange={setGenerateAudio}
          />
        </div>
        {generateAudio && (
          <div className="space-y-1.5">
            <Label>Audio Model (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Choose the audio generation model for this draft. For UVoice, this is also where you select the tier: Standard, Natural, or Premium.
            </p>
            <ImageModelCombobox
              value={audioModel}
              mediaType="audio"
              onValueChange={(value) => {
                setAudioModel(value);
                if (value) {
                  localStorage.setItem("smartspec_aiDraft_audioModel", value);
                } else {
                  localStorage.removeItem("smartspec_aiDraft_audioModel");
                }
              }}
            />
            {selectedUvoiceTierLabel ? (
              <div
                className="flex items-center gap-2 text-xs"
                data-testid="uvoice-tier-row"
              >
                <span className="text-muted-foreground">Selected UVoice tier</span>
                <Badge variant="secondary">{selectedUvoiceTierLabel}</Badge>
              </div>
            ) : null}
            {audioModels.length === 0 && !audioModelsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">No audio models available.</p>
            ) : null}
            {!audioModel && defaultAudioModelId ? (
              <p className="text-xs text-muted-foreground">
                Using default audio model: {defaultAudioModelId}
              </p>
            ) : null}
            {selectedUvoiceTierLabel ? (
              <p className="text-xs text-muted-foreground" data-testid="uvoice-tier-hint">
                UVoice tier selected: {selectedUvoiceTierLabel}. Voice ID options below are filtered to this tier only.
              </p>
            ) : (
              audioModels.some((model) => model.provider?.trim().toLowerCase() === "uvoice") ? (
                <p className="text-xs text-muted-foreground" data-testid="uvoice-tier-hint">
                  For UVoice, choose the tier here via Audio Model: Standard, Natural, or Premium.
                </p>
              ) : null
            )}
            {renderDynamicAudioModelInputs()}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai-draft-aspect-ratio">Aspect Ratio</Label>
        <select
          id="ai-draft-aspect-ratio"
          aria-label="Draft Aspect Ratio"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          value={selectedCanvasAspectRatio}
          onChange={(event) => {
            const next = getCanvasPresetById(event.target.value);
            if (!next) {
              return;
            }
            setDraftAspectRatio(next.id);
          }}
        >
          {PRESENTATION_CANVAS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Used as draft canvas size and synced to model input fields that map to aspect ratio.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-muted bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Advanced Media Options</Label>
            <p className="text-xs text-muted-foreground">
              Enable to edit model-specific dynamic inputs manually. Off = simple default flow.
            </p>
          </div>
          <Switch
            aria-label="Advanced media options"
            checked={advancedMediaOptionsEnabled}
            onCheckedChange={setAdvancedMediaOptionsEnabled}
          />
        </div>
        {renderDynamicMediaModelInputs()}
      </div>

      {/* Image prompt context */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-image-prompt-context">
          Image Prompt Context (optional)
        </Label>
        <p className="text-xs text-muted-foreground">
          Add visual constraints to every slide image, for example: Thai child, Thai family, Thai environment.
        </p>
        <textarea
          id="ai-image-prompt-context"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[70px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          placeholder="Additional visual requirements..."
          maxLength={1000}
          value={imagePromptContext}
          onChange={(e) => {
            setImagePromptContext(e.target.value);
            if (e.target.value.trim()) {
              localStorage.setItem("smartspec_aiDraft_imagePromptContext", e.target.value);
            } else {
              localStorage.removeItem("smartspec_aiDraft_imagePromptContext");
            }
          }}
        />
      </div>

      {/* Reference images */}
      <div className="space-y-2">
        <Label>Reference Images (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Attach up to 5 images to guide character/style consistency for compatible models.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Add from Library</Label>
          <SearchableCombobox
            items={referenceLibraryItems}
            value={selectedReferenceLibraryUrl}
            onValueChange={(value) => {
              setSelectedReferenceLibraryUrl(value);
              handleAddReferenceFromLibrary(value);
            }}
            placeholder="Search image from Library..."
            searchPlaceholder="Search library images..."
            emptyMessage={referenceLibraryQuery.isLoading ? "Loading library..." : "No images found."}
            disabled={referenceImages.length >= MAX_MEDIA_REFERENCES}
            searchValue={referenceLibrarySearchQuery}
            onSearchValueChange={setReferenceLibrarySearchQuery}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={referenceFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleReferenceFileUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => referenceFileInputRef.current?.click()}
            disabled={uploadReferenceMutation.isPending || referenceImages.length >= MAX_MEDIA_REFERENCES}
          >
            {uploadReferenceMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Upload Image
          </Button>
          <div className="flex min-w-[280px] flex-1 items-center gap-2">
            <Input
              placeholder="https://... or /uploads/..."
              value={referenceUrlInput}
              onChange={(e) => setReferenceUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddReferenceUrl();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddReferenceUrl}
              disabled={!referenceUrlInput.trim() || referenceImages.length >= MAX_MEDIA_REFERENCES}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add URL
            </Button>
          </div>
        </div>

        {referenceImages.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {referenceImages.map((item) => (
              <div key={item.url} className="rounded-md border p-2">
                <div className="aspect-video overflow-hidden rounded bg-muted">
                  <img
                    src={item.url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-muted-foreground">
                    {item.name}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleRemoveReferenceImage(item.url)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Style preset selector */}
      <div className="space-y-1.5">
        <Label>Style Preset</Label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {BUILT_IN_PRESETS.map((preset: SlideStylePreset) => (
            <div
              key={preset.id}
              data-preset-id={preset.id}
              data-selected={
                preset.id === selectedPresetId ? "true" : "false"
              }
              role="radio"
              aria-checked={preset.id === selectedPresetId}
              aria-label={preset.name}
              tabIndex={0}
              className={`flex w-[120px] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
                preset.id === selectedPresetId
                  ? "border-blue-500 ring-2 ring-blue-500"
                  : "border-transparent hover:border-gray-300"
              }`}
              onClick={() => handlePresetSelect(preset.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handlePresetSelect(preset.id);
                }
              }}
            >
              <div className="flex gap-1">
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.background }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.primary }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.secondary }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.text }}
                />
              </div>
              <span className="text-xs font-medium">{preset.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced style options */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Advanced Style Options</span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-2 space-y-3 border-l-2 border-muted pl-3 pt-3">
            {hideTextOnSlides && (
              <p className="text-xs text-muted-foreground">
                Visual-only slides disable header, footer, deck title, and page number automatically.
              </p>
            )}
            {/* Header section */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Show Header</Label>
              <Switch
                checked={effectiveHeaderEnabled}
                onCheckedChange={setHeaderEnabled}
                disabled={hideTextOnSlides}
              />
            </div>
            {effectiveHeaderEnabled && (
              <>
                <div className="flex items-center justify-between pl-4">
                  <Label className="text-sm text-muted-foreground">
                    Show Deck Title
                  </Label>
                  <Switch
                    checked={effectiveShowDeckTitle}
                    onCheckedChange={setShowDeckTitle}
                    disabled={hideTextOnSlides}
                  />
                </div>
                {effectiveShowDeckTitle && (
                  <div className="space-y-1 pl-4">
                    <Label
                      htmlFor="ai-header-title"
                      className="text-sm text-muted-foreground"
                    >
                      Header Title Text
                    </Label>
                    <Input
                      id="ai-header-title"
                      placeholder="Enter header title..."
                      maxLength={200}
                      value={headerTitleText}
                      onChange={(e) => setHeaderTitleText(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {/* Footer section */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Show Footer</Label>
              <Switch
                checked={effectiveFooterEnabled}
                onCheckedChange={setFooterEnabled}
                disabled={hideTextOnSlides}
              />
            </div>
            {effectiveFooterEnabled && (
              <>
                <div className="flex items-center justify-between pl-4">
                  <Label className="text-sm text-muted-foreground">
                    Show Page Number
                  </Label>
                  <Switch
                    checked={effectiveShowPageNumber}
                    onCheckedChange={setShowPageNumber}
                    disabled={hideTextOnSlides}
                  />
                </div>
                <div className="space-y-1 pl-4">
                  <Label
                    htmlFor="ai-footer"
                    className="text-sm text-muted-foreground"
                  >
                    Custom Footer Text
                  </Label>
                  <Input
                    id="ai-footer"
                    placeholder="Enter custom footer text..."
                    maxLength={200}
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Watermark</Label>
                <Switch
                  checked={watermarkEnabled}
                  onCheckedChange={setWatermarkEnabled}
                />
              </div>
              {watermarkEnabled ? (
                <div className="space-y-3 pl-4">
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Watermark image (PNG/JPG from Library)</Label>
                    <SearchableCombobox
                      items={watermarkComboboxItems}
                      value={watermarkSourceUrl}
                      onValueChange={handleWatermarkSourceChange}
                      disabled={watermarkOptions.length === 0 || watermarkLibraryQuery.isLoading}
                      placeholder={watermarkOptions.length === 0
                        ? "No PNG/JPG image found in library"
                        : "Select watermark image"}
                      searchPlaceholder="Search watermark from Library..."
                      emptyMessage={watermarkLibraryQuery.isLoading
                        ? "Loading watermark images..."
                        : "No matching PNG/JPG watermark found."}
                      searchValue={watermarkSearchQuery}
                      onSearchValueChange={setWatermarkSearchQuery}
                    />
                    <p className="text-[11px] text-muted-foreground">Search in Library (RAG) by image title or keyword.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">
                      Clarity: {watermarkClarityPercent}%
                    </Label>
                    <Slider
                      min={5}
                      max={100}
                      step={5}
                      value={[watermarkClarityPercent]}
                      onValueChange={(value) => setWatermarkClarityPercent(value[0] ?? 20)}
                    />
                  </div>
                  {selectedWatermarkOption ? (
                    <div className="flex items-center gap-2 rounded border border-muted p-2">
                      <img
                        src={selectedWatermarkOption.thumbnailUrl || selectedWatermarkOption.sourceUrl}
                        alt={selectedWatermarkOption.label}
                        className="h-10 w-16 rounded border object-contain"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{selectedWatermarkOption.label}</p>
                        <p className="text-[11px] text-muted-foreground">{selectedWatermarkOption.format.toUpperCase()}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Non-empty deck warning */}
      {currentSlideCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {currentSlideCount} slides will be added at the end of your deck.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  // Progress phase
  const progressView = (
    <div className="space-y-4">
      {progress && !progress.completed && (
        <>
          <div className="text-sm font-medium">
            Phase {progress.phase}/{TOTAL_AI_DRAFT_PHASES}: {progress.phaseLabel}
          </div>
          <Progress value={progressPercent} />
          {showStalledWarning && (
            <Alert className="border-amber-500">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                No progress update for {stalledSeconds}s. The media provider may be delayed or stuck. You can wait, or click Cancel and retry.
              </AlertDescription>
            </Alert>
          )}
          {progress.slidePreview.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {progress.slidePreview.map(
                (
                  slide: { title: string; imageStatus: string },
                  i: number,
                ) => (
                  <div
                    key={i}
                    className="rounded border p-2 text-center text-xs"
                  >
                    <div className="font-medium">{slide.title}</div>
                    <div className="text-muted-foreground">
                      {slide.imageStatus === "done" ? (
                        <Check className="mx-auto h-3 w-3 text-green-500" />
                      ) : (
                        <Loader2 className="mx-auto h-3 w-3 animate-spin" />
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}

      {progress?.completed && progress.result && !progress.cancelled && (
        <Alert className="border-green-500">
          <Check className="h-4 w-4 text-green-500" />
          <AlertDescription>
            Successfully added {progress.result.slidesAdded} slides to your
            deck.
            {isFinalizingCompletion && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Finalizing output...
              </div>
            )}
            {formattedResultWarnings.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {formattedResultWarnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {progress?.completed && progress.cancelled && (
        <Alert className="border-amber-500">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>
            Generation cancelled. No slides were added.
          </AlertDescription>
        </Alert>
      )}

      {progress?.error && (
        <Alert className="border-red-500">
          <X className="h-4 w-4 text-red-500" />
          <AlertDescription>{progress.error.message}</AlertDescription>
        </Alert>
      )}

      {!progress && taskId && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting generation...
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Draft with AI
          </DialogTitle>
          <DialogDescription>
            Generate presentation slides from a topic with AI, or structure your own article into slides.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {taskId ? progressView : configView}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 pt-4 pb-6">
          {!taskId && (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || isFinalizingCompletion}
              aria-label="Generate slides"
            >
              {generateDraft.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          )}

          {taskId && !completed && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelDraft.isPending || isFinalizingCompletion}
              aria-label="Cancel generation"
            >
              {cancelDraft.isPending ? "Cancelling..." : "Cancel"}
            </Button>
          )}

          {taskId && completed && !progress?.error && (
            <Button
              onClick={handleClose}
              aria-label="Close"
              disabled={isFinalizingCompletion}
            >
              {isFinalizingCompletion ? "Finalizing..." : "Close"}
            </Button>
          )}

          {taskId && progress?.error && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setTaskId(null);
                  setCompleted(false);
                }}
              >
                Retry
              </Button>
              <Button onClick={handleClose}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
