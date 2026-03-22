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
  Film,
  Type,
  Palette,
  Volume2,
  FileText,
  ImageIcon,
  Video,
  Zap,
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

function getSkillCategoryIcon(skill: VisibleSkillOption | null | undefined) {
  const cap = classifyDraftSkillCapability(skill);
  const cls = "h-4 w-4";
  switch (cap) {
    case "article":
      return <FileText className={`${cls} text-blue-500`} />;
    case "prompt":
      return <Sparkles className={`${cls} text-amber-500`} />;
    case "image":
      return <ImageIcon className={`${cls} text-emerald-500`} />;
    case "video":
      return <Video className={`${cls} text-purple-500`} />;
    default:
      return undefined;
  }
}

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

  // Auto mode state
  const [autoMode, setAutoMode] = useState(false);

  // Config state
  const [topic, setTopic] = useState("");
  const [useCustomArticle, setUseCustomArticle] = useState(false);
  const [customArticleText, setCustomArticleText] = useState("");
  const [articleGenSkill, setArticleGenSkill] = useState(() => loadSavedValue("smartspec_aiDraft_articleGenSkill"));
  const [articleGenParams, setArticleGenParams] = useState<Record<string, any>>({});
  const [articleGenAdvancedOpen, setArticleGenAdvancedOpen] = useState(false);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [hideTextOnSlides, setHideTextOnSlides] = useState(false);
  const [numSlides, setNumSlides] = useState(5);
  const [language, setLanguage] = useState<"auto" | "en" | "th">("auto");
  const [textModel, setTextModel] = useState("");
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
  const [mediaSkillParams, setMediaSkillParams] = useState<Record<string, any>>({});
  const [mediaSkillOptionsOpen, setMediaSkillOptionsOpen] = useState(false);

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

  // Available LLM models for text model override
  const llmModelsQuery = trpc.llmProviders.availableModels.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: isOpen,
  });
  const llmModelItems = useMemo(() => {
    const items: Array<{ value: string; label: string }> = [
      { value: "", label: "Auto (recommended)" },
    ];
    if (llmModelsQuery.data?.models) {
      for (const m of llmModelsQuery.data.models) {
        items.push({
          value: m.id,
          label: `${m.name || m.id}${m.providerDisplayName ? ` (${m.providerDisplayName})` : ""}`,
        });
      }
    }
    return items;
  }, [llmModelsQuery.data?.models]);

  const watermarkLibraryListQuery = trpc.library.listDocuments.useQuery(
    {
      scope: "all",
      sort: "updated_desc",
      limit: 50,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen && debouncedWatermarkSearchQuery.length === 0,
    },
  );
  const watermarkLibrarySearchQuery = trpc.library.search.useQuery(
    {
      query: debouncedWatermarkSearchQuery || undefined,
      scope: "all",
      limit: 50,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen && debouncedWatermarkSearchQuery.length > 0,
    },
  );
  const referenceLibraryListQuery = trpc.library.listDocuments.useQuery(
    {
      scope: "all",
      sort: "updated_desc",
      limit: 30,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen && debouncedReferenceLibrarySearchQuery.length === 0,
    },
  );
  const referenceLibrarySemanticQuery = trpc.library.search.useQuery(
    {
      query: debouncedReferenceLibrarySearchQuery || undefined,
      scope: "all",
      limit: 30,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen && debouncedReferenceLibrarySearchQuery.length > 0,
    },
  );

  // Fetch skill input schema for article generate skill (inside "Use Your Own Article")
  const articleGenSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: articleGenSkill },
    { enabled: articleGenSkill !== "" && useCustomArticle, staleTime: 300_000 },
  );
  const articleGenSchema = articleGenSchemaQuery.data?.hasSchema
    ? (articleGenSchemaQuery.data.schema as SkillInputSchema)
    : null;

  // Article generate skill items — reuse draftSkillItems (article-capable skills)
  const articleGenSkillItems = useMemo(
    () =>
      skills
        .filter((skill) => isSupportedDraftSkill(skill))
        .map((s) => ({
          value: s.slug,
          label: s.name,
          description: `${getDraftSkillModeLabel(s)}${s.description ? ` - ${s.description}` : ""}`,
          icon: getSkillCategoryIcon(s),
        })),
    [skills],
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

  // Fetch media skill schema for dynamic skill options
  const mediaSkillSlug = effectiveMediaSkillRecord?.slug ?? "";
  const mediaSkillSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: mediaSkillSlug },
    { enabled: mediaSkillSlug !== "", staleTime: 300_000 },
  );
  const mediaSkillSchema = mediaSkillSchemaQuery.data?.hasSchema
    ? (mediaSkillSchemaQuery.data.schema as SkillInputSchema)
    : null;
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
    // Reference images are cleared on each modal open (see isOpen reset effect)
    // No localStorage restore — users add images fresh per-task
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
          icon: getSkillCategoryIcon(s),
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
          icon: getSkillCategoryIcon(s),
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
    () => normalizeWatermarkLibraryOptions(
      debouncedWatermarkSearchQuery.length > 0
        ? (watermarkLibrarySearchQuery.data?.results ?? []).map((item: any) => ({
            ...item,
            id: item.id ?? item.item_id,
          }))
        : watermarkLibraryListQuery.data?.results,
    ),
    [
      debouncedWatermarkSearchQuery.length,
      watermarkLibraryListQuery.data?.results,
      watermarkLibrarySearchQuery.data?.results,
    ],
  );
  const watermarkLibraryLoading = watermarkLibraryListQuery.isLoading || watermarkLibrarySearchQuery.isLoading;
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
    const results = (
      debouncedReferenceLibrarySearchQuery.length > 0
        ? (referenceLibrarySemanticQuery.data?.results ?? [])
        : (referenceLibraryListQuery.data?.results ?? [])
    ) as Array<{
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
  }, [
    debouncedReferenceLibrarySearchQuery.length,
    referenceLibraryListQuery.data?.results,
    referenceLibrarySemanticQuery.data?.results,
  ]);
  const referenceLibraryLoading = referenceLibraryListQuery.isLoading || referenceLibrarySemanticQuery.isLoading;

  const handleWatermarkSourceChange = useCallback((sourceUrl: string) => {
    setWatermarkSourceUrl(sourceUrl);
    const selected = watermarkOptions.find((option) => option.sourceUrl === sourceUrl) || null;
    if (selected) {
      setWatermarkSelectionCache(selected);
    }
  }, [watermarkOptions]);

  // Mutations
  const generateDraft = trpc.presentation.ai.generateDraft.useMutation();
  const resolveAutoDraftMutation = trpc.presentation.ai.resolveAutoDraft.useMutation();
  const cancelDraft = trpc.presentation.ai.cancelDraft.useMutation();
  const uploadReferenceMutation = trpc.ai.upload.useMutation();
  const executeSkillMutation = trpc.chat.executeSkill.useMutation();

  // Content automation feature flag + agency integration
  const { data: contentAutomationData } = trpc.infrastructure.getContentAutomationEnabled.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );
  const contentAutomationEnabled = contentAutomationData?.contentAutomation ?? false;

  // Handler: generate article content using the selected skill
  const handleGenerateArticle = useCallback(async () => {
    if (!articleGenSkill || isGeneratingArticle) return;
    setIsGeneratingArticle(true);
    try {
      const result = await executeSkillMutation.mutateAsync({
        skillId: articleGenSkill,
        prompt: topic.trim() || undefined,
        model: textModel || undefined,
        dynamicParams: Object.keys(articleGenParams).length > 0
          ? articleGenParams
          : undefined,
        referenceImageUrls:
          normalizedReferenceImageUrls.length > 0
            ? normalizedReferenceImageUrls
            : undefined,
      });
      if (result.success && result.message) {
        setCustomArticleText(result.message);
        toast.success("Article generated successfully");
      } else {
        toast.error(result.error || "Failed to generate article");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate article");
    } finally {
      setIsGeneratingArticle(false);
    }
  }, [articleGenSkill, isGeneratingArticle, topic, textModel, articleGenParams, normalizedReferenceImageUrls, executeSkillMutation]);

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
  const progressUpdatedAtMs = useMemo(() => {
    if (!progress?.updatedAt) {
      return null;
    }
    const parsed = Date.parse(progress.updatedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [progress?.updatedAt]);
  const progressStepStartedAtMs = useMemo(() => {
    if (!progress?.diagnostics?.startedAt) {
      return null;
    }
    const parsed = Date.parse(progress.diagnostics.startedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [progress?.diagnostics?.startedAt]);
  const progressStepDeadlineAtMs = useMemo(() => {
    if (!progress?.diagnostics?.deadlineAt) {
      return null;
    }
    const parsed = Date.parse(progress.diagnostics.deadlineAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [progress?.diagnostics?.deadlineAt]);
  const lastBackendUpdateLabel = useMemo(() => {
    if (!progressUpdatedAtMs) {
      return null;
    }
    return new Date(progressUpdatedAtMs).toLocaleTimeString();
  }, [progressUpdatedAtMs]);
  const stepElapsedSeconds = useMemo(() => {
    if (!progressStepStartedAtMs) {
      return null;
    }
    return Math.max(0, Math.floor((Date.now() - progressStepStartedAtMs) / 1000));
  }, [progressStepStartedAtMs, stalledSeconds]);
  const stepBudgetRemainingSeconds = useMemo(() => {
    if (!progressStepDeadlineAtMs) {
      return null;
    }
    return Math.max(0, Math.ceil((progressStepDeadlineAtMs - Date.now()) / 1000));
  }, [progressStepDeadlineAtMs, stalledSeconds]);
  const hasDetachedWorker = Boolean(
    taskId
    && progress
    && !progress.completed
    && progress.workerActive === false,
  );
  const stalledMessage = useMemo(() => {
    if (!progress) {
      return "";
    }
    if (hasDetachedWorker) {
      return `No active worker is attached to run ${progress.diagnostics?.taskId ?? taskId}. The last backend update was ${stalledSeconds}s ago${lastBackendUpdateLabel ? ` at ${lastBackendUpdateLabel}` : ""}, so this draft likely stalled. Clear it and retry.`;
    }
    if (progress.phase <= 2) {
      return `No progress update for ${stalledSeconds}s while waiting for AI planning${progress.diagnostics?.model ? ` on ${progress.diagnostics.model}` : ""}${lastBackendUpdateLabel ? ` (last backend update ${lastBackendUpdateLabel})` : ""}. You can wait, or click Cancel and retry.`;
    }
    if (progress.phase <= 5) {
      return `No progress update for ${stalledSeconds}s while waiting for media generation${lastBackendUpdateLabel ? ` (last backend update ${lastBackendUpdateLabel})` : ""}. You can wait, or click Cancel and retry.`;
    }
    return `No progress update for ${stalledSeconds}s${lastBackendUpdateLabel ? ` (last backend update ${lastBackendUpdateLabel})` : ""}. The draft may be delayed or stuck. You can wait, or click Cancel and retry.`;
  }, [hasDetachedWorker, lastBackendUpdateLabel, progress, stalledSeconds, taskId]);

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
      ? `${progress.phase}|${progress.phaseLabel}|${progress.phaseDetail ?? ""}|${progress.slidesCompleted}|${progress.totalSlides}|${progress.completed ? 1 : 0}|${progress.error?.code ?? ""}|${progress.updatedAt ?? ""}|${progress.workerActive ? 1 : 0}|${progress.diagnostics?.operation ?? ""}|${progress.diagnostics?.model ?? ""}|${progress.diagnostics?.attempt ?? ""}|${progress.diagnostics?.startedAt ?? ""}|${progress.diagnostics?.deadlineAt ?? ""}`
      : "pending";

    if (marker !== lastProgressMarkerRef.current) {
      lastProgressMarkerRef.current = marker;
      lastProgressAtRef.current = progressUpdatedAtMs ?? Date.now();
      setStalledSeconds(0);
    }
  }, [
    isOpen,
    taskId,
    progress?.phase,
    progress?.phaseLabel,
    progress?.phaseDetail,
    progress?.slidesCompleted,
    progress?.totalSlides,
    progress?.completed,
    progress?.error?.code,
    progress?.updatedAt,
    progress?.workerActive,
    progress?.diagnostics?.operation,
    progress?.diagnostics?.model,
    progress?.diagnostics?.attempt,
    progress?.diagnostics?.startedAt,
    progress?.diagnostics?.deadlineAt,
    progressUpdatedAtMs,
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
    // Clear reference images on each fresh open — users add images per-task
    setReferenceImages([]);
    localStorage.removeItem("smartspec_aiDraft_referenceImages");
    setSelectedReferenceLibraryUrl("");
    setReferenceLibrarySearchQuery("");
    setDebouncedReferenceLibrarySearchQuery("");
    setReferenceUrlInput("");
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

  const effectiveHeaderEnabled = hideTextOnSlides ? false : headerEnabled;
  const effectiveShowDeckTitle = hideTextOnSlides ? false : showDeckTitle;
  const effectiveFooterEnabled = hideTextOnSlides ? false : footerEnabled;
  const effectiveShowPageNumber = hideTextOnSlides ? false : showPageNumber;

  const handleAutoModeChange = useCallback((enabled: boolean) => {
    setAutoMode(enabled);
  }, []);

  const handleAutoGenerate = useCallback(async () => {
    if (!topic.trim() || topic.trim().length < 3) {
      toast.error("Please enter a topic (at least 3 characters)");
      return;
    }

    // Step 1: Resolve ALL parameters automatically from the topic
    let resolution: Awaited<ReturnType<typeof resolveAutoDraftMutation.mutateAsync>> | undefined;
    try {
      resolution = await resolveAutoDraftMutation.mutateAsync({
        topic: topic.trim(),
      });
    } catch (err) {
      console.warn("[AIDraftModal] Auto-resolve failed, using defaults:", err);
    }

    const overrides = {
      headerEnabled: effectiveHeaderEnabled,
      showDeckTitle: effectiveShowDeckTitle,
      footerEnabled: effectiveFooterEnabled,
      showPageNumber: effectiveShowPageNumber,
    };

    generateDraft.mutate(
      {
        deckId,
        expectedVersion,
        prompt: topic.trim(),
        numSlides,
        language: (resolution?.language ?? language) as "auto" | "en" | "th",
        textModel: resolution?.textModel,
        canvasWidth: selectedCanvasWidth,
        canvasHeight: selectedCanvasHeight,
        draftSkillId: resolution?.draftSkillId ?? "general-article-writer",
        stylePresetId: resolution?.stylePresetId ?? "dark-professional",
        imageSkillId: resolution?.imageSkillId ?? undefined,
        imageModel: resolution?.imageModel ?? undefined,
        useCustomArticle: false,
        hideTextOnSlides: false,
        generateAudio: false,
        headerCustomText: headerTitleText.trim() || undefined,
        footerCustomText: footerText || undefined,
        styleOverrides: overrides,
      },
      {
        onSuccess: (data) => {
          setTaskId(data.taskId);
          setCompleted(false);
        },
        onError: (err) => {
          toast.error(err.message || "Failed to start auto generation");
        },
      },
    );
  }, [
    topic,
    resolveAutoDraftMutation,
    generateDraft,
    deckId,
    expectedVersion,
    numSlides,
    language,
    selectedCanvasWidth,
    selectedCanvasHeight,
    effectiveHeaderEnabled,
    effectiveShowDeckTitle,
    effectiveFooterEnabled,
    effectiveShowPageNumber,
    headerTitleText,
    footerText,
  ]);

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
        textModel: textModel || undefined,
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
        mediaSkillParams:
          Object.keys(mediaSkillParams).length > 0
            ? mediaSkillParams
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
    textModel,
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
    mediaSkillParams,
  ]);

  const handleCancel = useCallback(() => {
    if (taskId) {
      cancelDraft.mutate(
        { taskId },
        {
          onSuccess: (result) => {
            if (result?.success) {
              toast.info("Cancellation requested");
              void progressQuery.refetch();
            } else {
              toast.error("Unable to cancel this generation");
            }
          },
          onError: (err) => {
            toast.error(err.message || "Failed to cancel generation");
          },
        },
      );
    }
  }, [cancelDraft, progressQuery, taskId]);

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
    && (
      stalledSeconds >= 120
      || (hasDetachedWorker && stalledSeconds >= 15)
    ),
  );

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
    <div className="space-y-5">
      {/* ── Section: Content ─────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="flex w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <Type className="h-3.5 w-3.5 text-teal-500" />
          Content
        </legend>

      {/* Auto mode toggle */}
      {contentAutomationEnabled && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-blue-900">Auto mode</p>
            <p className="text-xs text-blue-600">
              AI will automatically select the best skill, model, and style
            </p>
          </div>
          <Switch
            checked={autoMode}
            onCheckedChange={handleAutoModeChange}
            aria-label="Auto mode"
          />
        </div>
      )}

      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-topic">Topic</Label>
        <textarea
          id="ai-topic"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          placeholder={useCustomArticle
            ? "Topic is optional when you provide your own article, or enter a topic to generate one with a skill."
            : "Describe what your presentation should be about..."}
          maxLength={1000}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      {/* Reference images — placed early so they feed into article gen, image gen, and video gen */}
      <div className="space-y-2">
        <Label>Reference Images (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Attach up to {MAX_MEDIA_REFERENCES} images as shared references. These are used across all phases: article generation (content aligned with images), image generation (style/character consistency), and video generation (start frame, or start + end frames).
        </p>
        {/* Add image actions row */}
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
            Upload
          </Button>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={referenceImages.length >= MAX_MEDIA_REFERENCES}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                From Library
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-md border bg-background p-2">
                <Input
                  placeholder="Search library images..."
                  value={referenceLibrarySearchQuery}
                  onChange={(e) => setReferenceLibrarySearchQuery(e.target.value)}
                  className="mb-2 h-8 text-xs"
                />
                <div className="grid max-h-[200px] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-5">
                  {referenceLibraryLoading ? (
                    <div className="col-span-full flex items-center justify-center py-4 text-xs text-muted-foreground">
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </div>
                  ) : referenceLibraryItems.length === 0 ? (
                    <p className="col-span-full py-4 text-center text-xs text-muted-foreground">No images found.</p>
                  ) : (
                    ((
                      debouncedReferenceLibrarySearchQuery.length > 0
                        ? (referenceLibrarySemanticQuery.data?.results ?? [])
                        : (referenceLibraryListQuery.data?.results ?? [])
                    ) as Array<{
                      source_url?: string | null;
                      title?: string | null;
                    }>).map((item) => {
                      const url = String(item.source_url || "").trim();
                      if (!url) return null;
                      const alreadyAdded = referenceImages.some((r) => r.url === url);
                      return (
                        <button
                          key={url}
                          type="button"
                          disabled={alreadyAdded || referenceImages.length >= MAX_MEDIA_REFERENCES}
                          className={cn(
                            "group relative aspect-square overflow-hidden rounded-md border transition-all",
                            alreadyAdded
                              ? "cursor-not-allowed border-teal-500 opacity-60"
                              : "cursor-pointer border-transparent hover:border-teal-400 hover:ring-1 hover:ring-teal-400",
                          )}
                          onClick={() => {
                            if (!alreadyAdded) {
                              handleAddReferenceFromLibrary(url);
                            }
                          }}
                        >
                          <img
                            src={url}
                            alt={String(item.title || "Library image")}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          {alreadyAdded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Check className="h-4 w-4 text-white" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                            <p className="truncate text-[9px] leading-tight text-white">
                              {String(item.title || url.split("/").pop() || "Image")}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <Input
              placeholder="https://... or /uploads/..."
              value={referenceUrlInput}
              onChange={(e) => setReferenceUrlInput(e.target.value)}
              className="h-8 text-xs"
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
              URL
            </Button>
          </div>
        </div>

        {referenceImages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {referenceImages.map((item, index) => (
              <div key={item.url} className="group relative w-20">
                <div className="aspect-square overflow-hidden rounded-md border bg-muted">
                  <img
                    src={item.url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  onClick={() => handleRemoveReferenceImage(item.url)}
                >
                  <X className="h-3 w-3" />
                </Button>
                <p className="mt-0.5 truncate text-center text-[10px] text-muted-foreground">
                  {index === 0 && referenceImages.length > 1 ? "1st ref" : index === 1 && referenceImages.length > 1 ? "2nd ref" : item.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!autoMode && (<>
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
          <div className="space-y-3">
            {/* Article Generate with Skill */}
            <div className="space-y-2 rounded-md border border-dashed border-teal-300/50 bg-teal-50/30 p-3 dark:bg-teal-950/10">
              <Label className="text-sm font-medium">Article Generate (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Select a skill to generate an article or prompt. The output will fill the Article Content field below.
              </p>
              <SearchableCombobox
                items={[{ value: "", label: "None — paste manually" }, ...articleGenSkillItems]}
                value={articleGenSkill || ""}
                onValueChange={(v) => {
                  setArticleGenSkill(v);
                  setArticleGenParams({});
                  setArticleGenAdvancedOpen(false);
                  localStorage.setItem("smartspec_aiDraft_articleGenSkill", v);
                }}
                placeholder="Select a skill to generate article..."
                searchPlaceholder="Search skills..."
                emptyMessage="No skills found."
              />

              {/* Dynamic skill advanced options */}
              {articleGenSkill && articleGenSchema && (
                <Collapsible open={articleGenAdvancedOpen} onOpenChange={setArticleGenAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
                      <Settings2 className="h-3.5 w-3.5" />
                      Advanced Options
                      <ChevronDown className={cn("h-3 w-3 transition-transform", articleGenAdvancedOpen && "rotate-180")} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md border border-muted bg-background p-3">
                      <DynamicSkillForm
                        schema={articleGenSchema}
                        language={language === "th" ? "th" : "en"}
                        values={articleGenParams}
                        onChange={setArticleGenParams}
                        excludeFields={["topic", "prompt", "subject", "reference_images"]}
                        className="space-y-3"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Generate button */}
              {articleGenSkill && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950/30"
                  disabled={isGeneratingArticle || (!topic.trim() && Object.keys(articleGenParams).length === 0)}
                  onClick={handleGenerateArticle}
                >
                  {isGeneratingArticle ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate Article
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Article Content textarea */}
            <div className="space-y-1.5">
              <Label htmlFor="ai-custom-article">Article Content</Label>
              <textarea
                id="ai-custom-article"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[180px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                placeholder="Paste your article here, or use a skill above to generate one..."
                maxLength={20000}
                value={customArticleText}
                onChange={(e) => setCustomArticleText(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <p>
                  The system will reuse your article, split it into slide-sized sections, and continue the normal draft flow.
                </p>
                <span className="shrink-0 pl-3 tabular-nums">
                  {(() => {
                    const text = customArticleText.trim();
                    const chars = text.length;
                    const words = text ? text.split(/\s+/).length : 0;
                    return `${words.toLocaleString()} words / ${chars.toLocaleString()} chars`;
                  })()}
                </span>
              </div>
            </div>
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

      {/* LLM Model override */}
      <div className="space-y-1.5">
        <Label>LLM Model</Label>
        <p className="text-xs text-muted-foreground">
          Override the LLM used for article generation and slide structuring. "Auto" lets the system choose the best model automatically.
        </p>
        <SearchableCombobox
          items={llmModelItems}
          value={textModel}
          onValueChange={setTextModel}
          placeholder="Auto (recommended)"
          searchPlaceholder="Search models..."
          emptyMessage="No models found."
          disabled={llmModelsQuery.isLoading}
        />
      </div>
      </>)}
      </fieldset>

      {/* ── Section: Skills & AI ─────────────────────── */}
      {!autoMode && (
      <fieldset className="space-y-3 pt-1">
        <legend className="flex w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <Sparkles className="h-3.5 w-3.5 text-teal-500" />
          Skills &amp; AI
        </legend>

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
              // Reset media skill params when draft skill changes (effective media skill may derive from it)
              setMediaSkillParams({});
              setMediaSkillOptionsOpen(false);
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
            excludeFields={["topic", "prompt", "subject", "reference_images"]}
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
            setMediaSkillParams({});
            setMediaSkillOptionsOpen(false);
            localStorage.setItem("smartspec_aiDraft_imageSkill", v);
          }}
            placeholder="None"
            searchPlaceholder="Search media skills..."
            emptyMessage="No compatible media skills found."
          />
      </div>

      {/* Dynamic media skill options (from ui.schema.json) */}
      {mediaSkillSchema && effectiveMediaSkillRecord && (
        <Collapsible open={mediaSkillOptionsOpen} onOpenChange={setMediaSkillOptionsOpen}>
          <div className="rounded-md border border-muted bg-muted/20 p-3">
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-sm font-medium transition-colors hover:text-foreground">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Skill Options ({effectiveMediaSkillRecord.name || effectiveMediaSkillRecord.slug})</span>
              <Badge variant="outline" className="ml-1 text-[10px]">
                {Object.keys(mediaSkillParams).length > 0 ? "Custom" : "Default"}
              </Badge>
              <ChevronDown
                className={cn(
                  "ml-auto h-3.5 w-3.5 transition-transform",
                  mediaSkillOptionsOpen && "rotate-180",
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 border-t border-muted pt-3">
                <DynamicSkillForm
                  schema={mediaSkillSchema}
                  language={language === "th" ? "th" : "en"}
                  values={mediaSkillParams}
                  onChange={setMediaSkillParams}
                  excludeFields={["description", "prompt", "topic", "subject", "reference_images"]}
                  className="space-y-3"
                />
              </div>
            </CollapsibleContent>
            {!mediaSkillOptionsOpen && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Using default settings. Expand to customize.
              </p>
            )}
          </div>
        </Collapsible>
      )}
      </fieldset>
      )}

      {/* ── Section: Media & Output ──────────────────── */}
      {!autoMode && (
      <fieldset className="space-y-3 pt-1">
        <legend className="flex w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <Film className="h-3.5 w-3.5 text-teal-500" />
          Media &amp; Output
        </legend>

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
      </fieldset>
      )}

      {/* ── Section: Visual & References ─────────────── */}
      <fieldset className="space-y-3 pt-1">
        <legend className="flex w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <Palette className="h-3.5 w-3.5 text-teal-500" />
          Visual &amp; References
        </legend>

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
      </fieldset>

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
                      disabled={watermarkOptions.length === 0 || watermarkLibraryLoading}
                      placeholder={watermarkOptions.length === 0
                        ? "No PNG/JPG image found in library"
                        : "Select watermark image"}
                      searchPlaceholder="Search watermark from Library..."
                      emptyMessage={watermarkLibraryLoading
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

      {/* ── Section: Slide Audio ─────────────────────── */}
      <fieldset className="space-y-3 pt-1">
        <legend className="flex w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <Volume2 className="h-3.5 w-3.5 text-teal-500" />
          Slide Audio
        </legend>

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
      </fieldset>

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
          {progress.phaseDetail ? (
            <p className="text-xs text-muted-foreground">{progress.phaseDetail}</p>
          ) : null}
          {progress.diagnostics ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground sm:grid-cols-3">
              <div>Run: <span className="font-mono text-foreground">{progress.diagnostics.taskId.slice(0, 8)}</span></div>
              {progress.diagnostics.operation ? (
                <div>Step: <span className="font-mono text-foreground">{progress.diagnostics.operation}</span></div>
              ) : null}
              {progress.diagnostics.model ? (
                <div>Model: <span className="font-mono text-foreground">{progress.diagnostics.model}</span></div>
              ) : null}
              {typeof progress.diagnostics.attempt === "number" && typeof progress.diagnostics.maxAttempts === "number" ? (
                <div>Attempt: <span className="font-mono text-foreground">{progress.diagnostics.attempt}/{progress.diagnostics.maxAttempts}</span></div>
              ) : null}
              {progress.diagnostics.recipeId ? (
                <div>Recipe: <span className="font-mono text-foreground">{progress.diagnostics.recipeId}</span></div>
              ) : null}
              {progress.diagnostics.compactionLevel ? (
                <div>Level: <span className="font-mono text-foreground">{progress.diagnostics.compactionLevel}</span></div>
              ) : null}
              {lastBackendUpdateLabel ? (
                <div>Backend: <span className="font-mono text-foreground">{lastBackendUpdateLabel}</span></div>
              ) : null}
              {typeof stepElapsedSeconds === "number" ? (
                <div>Elapsed: <span className="font-mono text-foreground">{stepElapsedSeconds}s</span></div>
              ) : null}
              {typeof stepBudgetRemainingSeconds === "number" ? (
                <div>Budget left: <span className="font-mono text-foreground">{stepBudgetRemainingSeconds}s</span></div>
              ) : null}
            </div>
          ) : null}
          <Progress value={progressPercent} />
          {showStalledWarning && (
            <Alert className="border-amber-500">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                {stalledMessage}
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
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-[calc(100%-2rem)] sm:max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Draft with AI
          </DialogTitle>
          <DialogDescription>
            Generate presentation slides from a topic with AI, or structure your own article into slides.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
          {taskId ? progressView : configView}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 pt-4 pb-6">
          {!taskId && !autoMode && (
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

          {!taskId && autoMode && (
            <Button
              onClick={handleAutoGenerate}
              disabled={resolveAutoDraftMutation.isPending || generateDraft.isPending || topic.trim().length < 3}
              aria-label="Auto Generate"
            >
              {(resolveAutoDraftMutation.isPending || generateDraft.isPending) ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1 h-3.5 w-3.5" />
              )}
              Auto Generate
            </Button>
          )}

          {taskId && !completed && (
            hasDetachedWorker && showStalledWarning ? (
              <Button
                variant="outline"
                onClick={() => {
                  setTaskId(null);
                  setCompleted(false);
                  setStalledSeconds(0);
                }}
              >
                Clear Stalled Run
              </Button>
            ) : null
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
