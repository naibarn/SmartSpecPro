import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Copy,
  Download,
  CheckCircle2,
  FileJson,
  FileText,
  Images,
  Languages,
  LayoutTemplate,
  Loader2,
  Palette,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AgencyPickerModal } from "@/components/agency/AgencyPickerModal";
import { ModelInputFieldsPanel } from "@/components/media/ModelInputFieldsPanel";
import { ImageModelCombobox } from "@/components/presentation/ImageModelCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  applyModelSyncTargets,
  buildDefaultExtraParamsForModel,
  getMissingRequiredModelFields,
  mergeExtraParams,
  parseModelInputFields,
  pickExtraParamsForModel,
  type MediaModelOption,
} from "@/lib/mediaModelInputs";
import { trpc } from "@/lib/trpc";
import { PRESENTATION_CANVAS_PRESETS } from "@/presentation-canvas/constants";

type ExecutionSource = "skill" | "agency";
type ArticleLanguage = "th" | "en";
type SlideCanvasRatio = "16:9" | "9:16" | "4:5" | "5:4";
type SlideOutputFormat = "json" | "md" | "pptx" | "pdf";

type SkillOption = {
  id: string;
  name: string;
  category?: string | null;
  executionMode?: string | null;
};

type RawSkillOption = {
  id: string | number;
  slug?: string | null;
  name: string;
  category?: string | null;
  executionMode?: string | null;
};

type PreparedImagePrompt = {
  id: string;
  pageNumber: number;
  imageIndex: number;
  placementRole: "hero" | "supporting" | "detail";
  shortLabel: string;
  prompt: string;
};

type PreparedSlideBundle = {
  maxPages: number;
  plannedImageCount: number;
  slideSkillLabel: string;
  imagePrompts: PreparedImagePrompt[];
  slidePayloadJson: string;
  modelId?: string;
};

type GeneratedImageAsset = PreparedImagePrompt & {
  url: string;
};

type SlideArtifact = {
  format: SlideOutputFormat | "unknown";
  url: string;
  key: string;
  mimeType: string;
  isPrimary: boolean;
};

type GeneratedSlideDraft = {
  slideJson: string;
  slidePayloadJson: string;
  modelId?: string;
  artifactJobId?: string | null;
  artifacts?: SlideArtifact[];
  downloadUrl?: string | null;
};

export type PresentationGeneratedSlideDraft = GeneratedSlideDraft;

type WizardStepStatus = "idle" | "ready" | "running" | "done";

const SUPPORTED_SLIDE_RATIOS: SlideCanvasRatio[] = ["16:9", "9:16", "4:5", "5:4"];
const SUPPORTED_OUTPUT_FORMATS: SlideOutputFormat[] = ["json", "md", "pptx", "pdf"];
const ARTICLE_BUILDER_DRAFT_STORAGE_KEY_PREFIX = "presentation-article-builder-draft";

function isArticleFriendlySkill(skill: SkillOption): boolean {
  const category = String(skill.category ?? "").toLowerCase();
  const mode = String(skill.executionMode ?? "").toLowerCase();
  const searchable = `${skill.id} ${skill.name}`.toLowerCase();
  return (
    category === "article_generation"
    || category === "prompt_enhancement"
    || category === "chat_assistant"
    || mode === "enhance-prompt"
    || /\b(article|writer|copywriter|blog|content|research|brief|story)\b/i.test(searchable)
  );
}

function isSlideGenerationSkill(skill: SkillOption): boolean {
  return String(skill.category ?? "").trim().toLowerCase() === "slide_generation";
}

function supportsGeneratedSlideArtifacts(skill: SkillOption | null | undefined): boolean {
  return String(skill?.executionMode ?? "").trim().toLowerCase() === "sandbox-command";
}

function requiresGeneratedSlideArtifact(format: SlideOutputFormat): boolean {
  return format === "pptx" || format === "pdf";
}

function clampImageCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }
  return Math.max(5, Math.min(20, Math.round(value)));
}

function detectArticleLanguage(text: string): ArticleLanguage {
  const thaiMatches = text.match(/[\u0E00-\u0E7F]/g) ?? [];
  const latinMatches = text.match(/[A-Za-z]/g) ?? [];
  if (thaiMatches.length > latinMatches.length) {
    return "th";
  }
  return "en";
}

function normalizeCanvasRatio(value?: string | null): SlideCanvasRatio {
  return SUPPORTED_SLIDE_RATIOS.includes(value as SlideCanvasRatio)
    ? value as SlideCanvasRatio
    : "16:9";
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

function normalizeSlideArtifact(raw: unknown): SlideArtifact | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim() : "application/octet-stream";
  if (!url || !key) {
    return null;
  }
  const normalizedFormat = String(record.format ?? "").trim().toLowerCase();
  const format: SlideOutputFormat | "unknown" = normalizedFormat === "json"
    || normalizedFormat === "md"
    || normalizedFormat === "pptx"
    || normalizedFormat === "pdf"
    ? normalizedFormat
    : key.toLowerCase().endsWith(".pptx")
      ? "pptx"
      : key.toLowerCase().endsWith(".pdf")
        ? "pdf"
        : key.toLowerCase().endsWith(".md")
          ? "md"
          : key.toLowerCase().endsWith(".json")
            ? "json"
            : "unknown";
  return {
    format,
    url,
    key,
    mimeType,
    isPrimary: Boolean(record.isPrimary),
  };
}

function pickPreferredSlideArtifact(
  artifacts: SlideArtifact[],
  preferredFormat: SlideOutputFormat,
): SlideArtifact | null {
  if (artifacts.length === 0) {
    return null;
  }
  return (
    artifacts.find((artifact) => artifact.format === preferredFormat)
    ?? (preferredFormat === "pptx" ? artifacts.find((artifact) => artifact.format === "pdf") : null)
    ?? artifacts.find((artifact) => artifact.isPrimary)
    ?? artifacts[0]
    ?? null
  );
}

function hasImportableSlidesJson(raw: string): boolean {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as { slides?: unknown[] };
    return Array.isArray(parsed?.slides) && parsed.slides.length > 0;
  } catch {
    return false;
  }
}

type PersistedArticleBuilderDraft = {
  topic: string;
  article: string;
  executionSource: ExecutionSource;
  skillId: string;
  agencyId: string;
  agencyName: string;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  targetImageCount: number;
  imageModel: string;
  canvasRatio: SlideCanvasRatio;
  advancedMediaOptionsEnabled: boolean;
  mediaModelExtraParams: Record<string, unknown>;
  imagePromptContext: string;
  slideSkillId: string;
  slideOutputFormat: SlideOutputFormat;
  preparedBundle: PreparedSlideBundle | null;
  generatedImages: GeneratedImageAsset[];
  generatedSlideDraft: GeneratedSlideDraft | null;
};

function sanitizePersistedGeneratedSlideDraft(
  draft: GeneratedSlideDraft | null | undefined,
): GeneratedSlideDraft | null {
  if (!draft) {
    return null;
  }
  return {
    slideJson: typeof draft.slideJson === "string" ? draft.slideJson : "",
    slidePayloadJson: typeof draft.slidePayloadJson === "string" ? draft.slidePayloadJson : "",
    modelId: typeof draft.modelId === "string" && draft.modelId.trim() ? draft.modelId.trim() : undefined,
    artifactJobId: null,
    artifacts: [],
    downloadUrl: null,
  };
}

function getArticleBuilderDraftStorageKey(deckId: number): string {
  return `${ARTICLE_BUILDER_DRAFT_STORAGE_KEY_PREFIX}:${deckId}`;
}

function loadPersistedArticleBuilderDraft(deckId: number): PersistedArticleBuilderDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getArticleBuilderDraftStorageKey(deckId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedArticleBuilderDraft;
    return {
      ...parsed,
      generatedSlideDraft: sanitizePersistedGeneratedSlideDraft(parsed.generatedSlideDraft),
    };
  } catch {
    return null;
  }
}

function savePersistedArticleBuilderDraft(
  deckId: number,
  draft: PersistedArticleBuilderDraft,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getArticleBuilderDraftStorageKey(deckId), JSON.stringify({
      ...draft,
      generatedSlideDraft: sanitizePersistedGeneratedSlideDraft(draft.generatedSlideDraft),
    }));
  } catch {
    // Ignore storage quota or serialization failures and keep the dialog usable.
  }
}

function extractTaskId(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const record = task as { id?: unknown; taskId?: unknown };
  if (typeof record.id === "string" && record.id.trim()) {
    return record.id.trim();
  }
  if (typeof record.taskId === "string" && record.taskId.trim()) {
    return record.taskId.trim();
  }
  return null;
}

function extractTaskResultUrl(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const record = task as Record<string, unknown>;
  const direct = typeof record.resultUrl === "string" ? record.resultUrl.trim() : "";
  if (direct) {
    return direct;
  }
  const outputUrl = typeof record.outputUrl === "string" ? record.outputUrl.trim() : "";
  if (outputUrl) {
    return outputUrl;
  }
  const result = record.result;
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>;
    const nestedUrl = typeof nested.url === "string" ? nested.url.trim() : "";
    if (nestedUrl) {
      return nestedUrl;
    }
  }
  return null;
}

function renderWizardStatusBadge(status: WizardStepStatus): {
  labelKey: string;
  className: string;
} {
  switch (status) {
    case "done":
      return {
        labelKey: "dialog.articleBuilder.workflowStatusDone",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "running":
      return {
        labelKey: "dialog.articleBuilder.workflowStatusRunning",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "ready":
      return {
        labelKey: "dialog.articleBuilder.workflowStatusReady",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    default:
      return {
        labelKey: "dialog.articleBuilder.workflowStatusWaiting",
        className: "border-slate-200 bg-slate-50 text-slate-600",
      };
  }
}

async function pollTaskUntilTerminal(
  taskId: string,
  fetchTask: (taskId: string) => Promise<unknown>,
): Promise<unknown> {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await fetchTask(taskId);
    const status = String((current as { status?: unknown })?.status ?? "").trim().toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "ready") {
      return current;
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(`Media task failed (${status || "unknown"})`);
    }
    await sleepMs(1500);
  }
  throw new Error("Timed out while waiting for generated images");
}

async function copyText(value: string, successMessage: string, errorMessage: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    toast.error(errorMessage);
    return;
  }
  await navigator.clipboard.writeText(trimmed);
  toast.success(successMessage);
}

function formatPromptPlan(prompts: PreparedImagePrompt[]): string {
  if (prompts.length === 0) {
    return "";
  }
  return prompts
    .map((prompt) => (
      `Page ${prompt.pageNumber} · ${prompt.shortLabel}\n${prompt.prompt}`
    ))
    .join("\n\n");
}

function formatGeneratedImages(assets: GeneratedImageAsset[]): string {
  if (assets.length === 0) {
    return "";
  }
  return assets
    .map((asset) => (
      `Page ${asset.pageNumber} · ${asset.shortLabel}\n${asset.url}`
    ))
    .join("\n\n");
}

export interface PresentationArticleGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  deckId: number;
  initialTopic?: string;
  initialArticle?: string;
  initialCanvasRatio?: string;
  onUseArticle: (article: string) => Promise<void> | void;
  onInsertSlides: (
    draft: GeneratedSlideDraft,
    options?: { closeDialog?: boolean; showSuccessToast?: boolean },
  ) => Promise<boolean> | boolean;
}

export function PresentationArticleGeneratorDialog({
  open,
  onClose,
  deckId,
  initialTopic,
  initialArticle,
  initialCanvasRatio,
  onUseArticle,
  onInsertSlides,
}: PresentationArticleGeneratorDialogProps) {
  const { t } = useScopedTranslation("presentation");
  const { user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const wasOpenRef = useRef(false);

  const [topic, setTopic] = useState(initialTopic ?? "");
  const [article, setArticle] = useState(initialArticle ?? "");
  const [executionSource, setExecutionSource] = useState<ExecutionSource>("skill");
  const [skillId, setSkillId] = useState<string>("");
  const [agencyId, setAgencyId] = useState<string>("");
  const [agencyName, setAgencyName] = useState<string>("");
  const [requiresWebSearch, setRequiresWebSearch] = useState(false);
  const [requiresThinking, setRequiresThinking] = useState(false);
  const [targetImageCount, setTargetImageCount] = useState(8);
  const [isAgencyModalOpen, setIsAgencyModalOpen] = useState(false);
  const [imageModel, setImageModel] = useState("");
  const [canvasRatio, setCanvasRatio] = useState<SlideCanvasRatio>(normalizeCanvasRatio(initialCanvasRatio));
  const [advancedMediaOptionsEnabled, setAdvancedMediaOptionsEnabled] = useState(false);
  const [mediaModelExtraParams, setMediaModelExtraParams] = useState<Record<string, unknown>>({});
  const [imagePromptContext, setImagePromptContext] = useState("");
  const [slideSkillId, setSlideSkillId] = useState("");
  const [slideOutputFormat, setSlideOutputFormat] = useState<SlideOutputFormat>("json");
  const [preparedBundle, setPreparedBundle] = useState<PreparedSlideBundle | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageAsset[]>([]);
  const [generatedSlideDraft, setGeneratedSlideDraft] = useState<GeneratedSlideDraft | null>(null);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageGenerationProgress, setImageGenerationProgress] = useState<string>("");

  const skillsQuery = trpc.skills.listFromDb.useQuery({ enabledOnly: true, limit: 100 }, { enabled: open });
  const mediaModelsQuery = trpc.media.getModels.useQuery({ type: "image" }, { enabled: open, staleTime: 300_000 });
  const generateArticleMutation = trpc.presentation.ai.generateArticle.useMutation();
  const prepareSlideBundleMutation = trpc.presentation.ai.prepareSlideBundle.useMutation();
  const generateSlideDraftMutation = trpc.presentation.ai.generateSlideDraft.useMutation();
  const generateImageAsyncMutation = trpc.media.generateImageAsync.useMutation();
  const sandboxJobStatusQuery = trpc.sandbox.getJobStatus.useQuery(
    { jobId: generatedSlideDraft?.artifactJobId ?? "" },
    {
      enabled: open && Boolean(generatedSlideDraft?.artifactJobId) && !generatedSlideDraft?.downloadUrl,
      refetchInterval: 1500,
    },
  );

  const allSkillOptions = useMemo<SkillOption[]>(
    () => ((skillsQuery.data ?? []) as RawSkillOption[])
      .map((skill) => ({
        id: String(skill.slug ?? skill.id),
        name: String(skill.name ?? skill.slug ?? skill.id),
        category: skill.category ?? null,
        executionMode: skill.executionMode ?? null,
      })),
    [skillsQuery.data],
  );
  const articleSkillOptions = useMemo(
    () => allSkillOptions.filter(isArticleFriendlySkill),
    [allSkillOptions],
  );
  const slideSkillOptions = useMemo(
    () => allSkillOptions.filter(isSlideGenerationSkill),
    [allSkillOptions],
  );
  const imageModels = useMemo(
    () => ((mediaModelsQuery.data?.models ?? []) as MediaModelOption[]),
    [mediaModelsQuery.data?.models],
  );
  const defaultImageModelId = useMemo(
    () => String(mediaModelsQuery.data?.defaults?.image ?? imageModels[0]?.id ?? ""),
    [imageModels, mediaModelsQuery.data?.defaults?.image],
  );
  const selectedImageModelId = imageModel.trim() || defaultImageModelId;
  const selectedImageModelConfig = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId),
    [imageModels, selectedImageModelId],
  );
  const selectedMediaModelFields = useMemo(
    () => parseModelInputFields(selectedImageModelConfig),
    [selectedImageModelConfig],
  );
  const detectedLanguage = useMemo<ArticleLanguage>(() => detectArticleLanguage(topic), [topic]);
  const detectedLanguageLabel = detectedLanguage === "th"
    ? t("dialog.articleBuilder.languageThai")
    : t("dialog.articleBuilder.languageEnglish");
  const selectedArticleSkill = useMemo(
    () => articleSkillOptions.find((skill) => skill.id === skillId) ?? null,
    [articleSkillOptions, skillId],
  );
  const selectedSlideSkill = useMemo(
    () => slideSkillOptions.find((skill) => skill.id === slideSkillId) ?? null,
    [slideSkillId, slideSkillOptions],
  );
  const artifactCapableSlideSkillOptions = useMemo(
    () => slideSkillOptions.filter((skill) => supportsGeneratedSlideArtifacts(skill)),
    [slideSkillOptions],
  );
  const selectedSlideSkillSupportsArtifacts = supportsGeneratedSlideArtifacts(selectedSlideSkill);
  const artifactRequiredForSelectedOutput = requiresGeneratedSlideArtifact(slideOutputFormat);
  const supportedCanvasOptions = useMemo(
    () => PRESENTATION_CANVAS_PRESETS.filter((preset) => SUPPORTED_SLIDE_RATIOS.includes(preset.id as SlideCanvasRatio)),
    [],
  );
  const slideOutputFormats = useMemo(
    () => Array.from(new Set<SlideOutputFormat>(["json", slideOutputFormat])),
    [slideOutputFormat],
  );
  const articleStepStatus = useMemo<WizardStepStatus>(() => {
    if (generateArticleMutation.isPending) {
      return "running";
    }
    if (article.trim()) {
      return "done";
    }
    return topic.trim() ? "ready" : "idle";
  }, [article, generateArticleMutation.isPending, topic]);
  const bundleStepStatus = useMemo<WizardStepStatus>(() => {
    if (prepareSlideBundleMutation.isPending) {
      return "running";
    }
    if (preparedBundle) {
      return "done";
    }
    return article.trim() ? "ready" : "idle";
  }, [article, prepareSlideBundleMutation.isPending, preparedBundle]);
  const imageStepStatus = useMemo<WizardStepStatus>(() => {
    if (isGeneratingImages || generateImageAsyncMutation.isPending) {
      return "running";
    }
    if (generatedImages.length > 0) {
      return "done";
    }
    return preparedBundle ? "ready" : "idle";
  }, [generateImageAsyncMutation.isPending, generatedImages.length, isGeneratingImages, preparedBundle]);
  const availableSlideArtifacts = useMemo(
    () => (generatedSlideDraft?.artifacts ?? []).map(normalizeSlideArtifact).filter((artifact): artifact is SlideArtifact => Boolean(artifact)),
    [generatedSlideDraft?.artifacts],
  );
  const hasImportableSlides = useMemo(
    () => hasImportableSlidesJson(generatedSlideDraft?.slideJson ?? "")
      || availableSlideArtifacts.some((artifact) => artifact.format === "json"),
    [availableSlideArtifacts, generatedSlideDraft?.slideJson],
  );
  const slideStepStatus = useMemo<WizardStepStatus>(() => {
    if (generateSlideDraftMutation.isPending) {
      return "running";
    }
    if (hasImportableSlides) {
      return "done";
    }
    return generatedImages.length > 0 ? "ready" : "idle";
  }, [generateSlideDraftMutation.isPending, generatedImages.length, hasImportableSlides]);
  const downloadableSlideArtifact = useMemo(
    () => {
      if (generatedSlideDraft?.downloadUrl) {
        return {
          format: slideOutputFormat,
          url: generatedSlideDraft.downloadUrl,
          key: generatedSlideDraft.downloadUrl,
          mimeType: "application/octet-stream",
          isPrimary: true,
        } satisfies SlideArtifact;
      }
      return pickPreferredSlideArtifact(availableSlideArtifacts, slideOutputFormat);
    },
    [availableSlideArtifacts, generatedSlideDraft?.downloadUrl, slideOutputFormat],
  );
  const syncedMediaModelExtraParams = useMemo(
    () => applyModelSyncTargets(
      selectedImageModelConfig,
      mergeExtraParams(
        buildDefaultExtraParamsForModel(selectedImageModelConfig),
        pickExtraParamsForModel(selectedImageModelConfig, mediaModelExtraParams),
      ),
      {
        prompt: "__auto_prompt__",
        aspectRatio: canvasRatio,
      },
    ) ?? {},
    [canvasRatio, mediaModelExtraParams, selectedImageModelConfig],
  );

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) {
      return;
    }
    const persistedDraft = loadPersistedArticleBuilderDraft(deckId);
    if (persistedDraft) {
      setTopic(persistedDraft.topic);
      setArticle(persistedDraft.article);
      setExecutionSource(persistedDraft.executionSource);
      setSkillId(persistedDraft.skillId);
      setAgencyId(persistedDraft.agencyId);
      setAgencyName(persistedDraft.agencyName);
      setRequiresWebSearch(Boolean(persistedDraft.requiresWebSearch));
      setRequiresThinking(Boolean(persistedDraft.requiresThinking));
      setTargetImageCount(clampImageCount(persistedDraft.targetImageCount));
      setImageModel(persistedDraft.imageModel);
      setCanvasRatio(normalizeCanvasRatio(persistedDraft.canvasRatio));
      setAdvancedMediaOptionsEnabled(Boolean(persistedDraft.advancedMediaOptionsEnabled));
      setMediaModelExtraParams(persistedDraft.mediaModelExtraParams ?? {});
      setImagePromptContext(persistedDraft.imagePromptContext);
      setSlideSkillId(persistedDraft.slideSkillId);
      setSlideOutputFormat(persistedDraft.slideOutputFormat);
      setPreparedBundle(persistedDraft.preparedBundle);
      setGeneratedImages(persistedDraft.generatedImages ?? []);
      setGeneratedSlideDraft(persistedDraft.generatedSlideDraft);
      setImageGenerationProgress("");
      return;
    }
    setTopic(initialTopic ?? "");
    setArticle(initialArticle ?? "");
    setExecutionSource("skill");
    setSkillId("");
    setAgencyId("");
    setAgencyName("");
    setRequiresWebSearch(false);
    setRequiresThinking(false);
    setTargetImageCount(8);
    setImageModel("");
    setCanvasRatio(normalizeCanvasRatio(initialCanvasRatio));
    setAdvancedMediaOptionsEnabled(false);
    setMediaModelExtraParams({});
    setImagePromptContext("");
    setSlideSkillId("");
    setSlideOutputFormat("json");
    setPreparedBundle(null);
    setGeneratedImages([]);
    setGeneratedSlideDraft(null);
    setImageGenerationProgress("");
  }, [deckId, initialArticle, initialCanvasRatio, initialTopic, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    savePersistedArticleBuilderDraft(deckId, {
      topic,
      article,
      executionSource,
      skillId,
      agencyId,
      agencyName,
      requiresWebSearch,
      requiresThinking,
      targetImageCount: clampImageCount(targetImageCount),
      imageModel,
      canvasRatio,
      advancedMediaOptionsEnabled,
      mediaModelExtraParams,
      imagePromptContext,
      slideSkillId,
      slideOutputFormat,
      preparedBundle,
      generatedImages,
      generatedSlideDraft,
    });
  }, [
    advancedMediaOptionsEnabled,
    agencyId,
    agencyName,
    article,
    canvasRatio,
    deckId,
    executionSource,
    generatedImages,
    generatedSlideDraft,
    imageModel,
    imagePromptContext,
    mediaModelExtraParams,
    open,
    preparedBundle,
    requiresThinking,
    requiresWebSearch,
    skillId,
    slideOutputFormat,
    slideSkillId,
    targetImageCount,
    topic,
  ]);

  useEffect(() => {
    if (!open || executionSource !== "skill" || skillId || articleSkillOptions.length === 0) {
      return;
    }
    setSkillId(articleSkillOptions[0]!.id);
  }, [articleSkillOptions, executionSource, open, skillId]);

  useEffect(() => {
    if (!open || slideSkillId || slideSkillOptions.length === 0) {
      return;
    }
    const preferredSkill = artifactRequiredForSelectedOutput
      ? artifactCapableSlideSkillOptions[0] ?? slideSkillOptions[0]
      : slideSkillOptions[0];
    if (preferredSkill) {
      setSlideSkillId(preferredSkill.id);
    }
  }, [artifactCapableSlideSkillOptions, artifactRequiredForSelectedOutput, open, slideSkillId, slideSkillOptions]);

  useEffect(() => {
    if (!open || !artifactRequiredForSelectedOutput || selectedSlideSkillSupportsArtifacts) {
      return;
    }
    const fallbackSkill = artifactCapableSlideSkillOptions[0];
    if (fallbackSkill && fallbackSkill.id !== slideSkillId) {
      setSlideSkillId(fallbackSkill.id);
    }
  }, [
    artifactCapableSlideSkillOptions,
    artifactRequiredForSelectedOutput,
    open,
    selectedSlideSkillSupportsArtifacts,
    slideSkillId,
  ]);

  useEffect(() => {
    const artifacts = (sandboxJobStatusQuery.data?.artifacts ?? [])
      .map(normalizeSlideArtifact)
      .filter((artifact): artifact is SlideArtifact => Boolean(artifact));
    if (!generatedSlideDraft?.artifactJobId || artifacts.length === 0) {
      return;
    }
    const nextDownloadUrl = pickPreferredSlideArtifact(artifacts, slideOutputFormat)?.url ?? null;
    setGeneratedSlideDraft((previous) => {
      if (!previous || previous.artifactJobId !== generatedSlideDraft.artifactJobId) {
        return previous;
      }
      return {
        ...previous,
        artifacts,
        downloadUrl: previous.downloadUrl ?? nextDownloadUrl,
      };
    });
  }, [generatedSlideDraft?.artifactJobId, sandboxJobStatusQuery.data?.artifacts, slideOutputFormat]);

  useEffect(() => {
    const activeArtifactJobId = generatedSlideDraft?.artifactJobId?.trim();
    if (!activeArtifactJobId) {
      return;
    }
    const status = String(sandboxJobStatusQuery.data?.status ?? "").trim().toLowerCase();
    const queriedArtifacts = Array.isArray(sandboxJobStatusQuery.data?.artifacts)
      ? sandboxJobStatusQuery.data.artifacts
      : [];
    const shouldClearPendingArtifactState = Boolean(sandboxJobStatusQuery.error)
      || status === "failed"
      || status === "error"
      || status === "cancelled"
      || (status === "completed" && queriedArtifacts.length === 0 && !generatedSlideDraft?.downloadUrl);
    if (!shouldClearPendingArtifactState) {
      return;
    }
    setGeneratedSlideDraft((previous) => {
      if (!previous || previous.artifactJobId !== activeArtifactJobId) {
        return previous;
      }
      return {
        ...previous,
        artifactJobId: null,
        artifacts: previous.artifacts ?? [],
        downloadUrl: previous.downloadUrl ?? null,
      };
    });
  }, [
    generatedSlideDraft?.artifactJobId,
    generatedSlideDraft?.downloadUrl,
    sandboxJobStatusQuery.data?.artifacts,
    sandboxJobStatusQuery.data?.status,
    sandboxJobStatusQuery.error,
  ]);

  const applyNextImageModel = (nextModelId: string) => {
    setImageModel(nextModelId);
    const resolvedModelId = nextModelId.trim() || defaultImageModelId;
    const nextModel = imageModels.find((model) => model.id === resolvedModelId);
    setMediaModelExtraParams(
      mergeExtraParams(
        buildDefaultExtraParamsForModel(nextModel),
        pickExtraParamsForModel(nextModel, mediaModelExtraParams),
      ) ?? {},
    );
  };

  const resolveRequestedSlideGenerationPlan = (): {
    slideSkillId: string;
    outputFormats: SlideOutputFormat[];
  } | null => {
    if (!slideSkillId) {
      toast.error(t("dialog.articleBuilder.slideSkillRequired"));
      return null;
    }
    if (!artifactRequiredForSelectedOutput) {
      return {
        slideSkillId,
        outputFormats: slideOutputFormats,
      };
    }
    if (selectedSlideSkillSupportsArtifacts) {
      return {
        slideSkillId,
        outputFormats: slideOutputFormats,
      };
    }
    const fallbackSkill = artifactCapableSlideSkillOptions[0];
    if (fallbackSkill) {
      if (fallbackSkill.id !== slideSkillId) {
        setSlideSkillId(fallbackSkill.id);
      }
      return {
        slideSkillId: fallbackSkill.id,
        outputFormats: slideOutputFormats,
      };
    }
    setSlideOutputFormat("json");
    toast.info(t("dialog.articleBuilder.slideOutputFormatDowngraded", {
      format: slideOutputFormat.toUpperCase(),
    }));
    return {
      slideSkillId,
      outputFormats: ["json"],
    };
  };

  const handlePrepareSlideBundle = async (options?: {
    articleOverride?: string;
    topicOverride?: string;
    successMessage?: string;
  }): Promise<PreparedSlideBundle | null> => {
    const trimmedTopic = (options?.topicOverride ?? topic).trim();
    const trimmedArticle = (options?.articleOverride ?? article).trim();
    if (!trimmedTopic) {
      toast.error(t("dialog.articleBuilder.topicRequired"));
      return null;
    }
    if (!trimmedArticle) {
      toast.error(t("dialog.articleBuilder.articleRequired"));
      return null;
    }
    const generationPlan = resolveRequestedSlideGenerationPlan();
    if (!generationPlan) {
      return null;
    }

    try {
      const result = await prepareSlideBundleMutation.mutateAsync({
        deckId,
        topic: trimmedTopic,
        article: trimmedArticle,
        preferredLanguage: detectedLanguage,
        slideSkillId: generationPlan.slideSkillId,
        requiresThinking,
        targetImageCount: clampImageCount(targetImageCount),
        canvasRatio,
        outputFormats: generationPlan.outputFormats,
        imagePromptContext: imagePromptContext.trim() || null,
      });
      setPreparedBundle(result);
      setGeneratedImages([]);
      setGeneratedSlideDraft(null);
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.prepareBundleError")));
      return null;
    }
  };

  const handleGenerateSlideDraft = async (options?: {
    imageAssetsOverride?: GeneratedImageAsset[];
    successMessage?: string;
  }): Promise<GeneratedSlideDraft | null> => {
    const trimmedTopic = topic.trim();
    const trimmedArticle = article.trim();
    const imageAssets = options?.imageAssetsOverride ?? generatedImages;
    const activeMaxPages = preparedBundle?.maxPages ?? null;
    if (!trimmedTopic) {
      toast.error(t("dialog.articleBuilder.topicRequired"));
      return null;
    }
    if (!trimmedArticle) {
      toast.error(t("dialog.articleBuilder.articleRequired"));
      return null;
    }
    const generationPlan = resolveRequestedSlideGenerationPlan();
    if (!generationPlan) {
      return null;
    }
    if (!activeMaxPages) {
      toast.error(t("dialog.articleBuilder.prepareBundleFirst"));
      return null;
    }
    if (imageAssets.length === 0) {
      toast.error(t("dialog.articleBuilder.imagesRequired"));
      return null;
    }

    try {
      const result = await generateSlideDraftMutation.mutateAsync({
        deckId,
        topic: trimmedTopic,
        article: trimmedArticle,
        preferredLanguage: detectedLanguage,
        slideSkillId: generationPlan.slideSkillId,
        requiresThinking,
        targetImageCount: clampImageCount(targetImageCount),
        canvasRatio,
        outputFormats: generationPlan.outputFormats,
        maxPages: activeMaxPages,
        imagePromptContext: imagePromptContext.trim() || null,
        imageAssets,
      });
      const nextDraft = {
        slideJson: result.slideJson,
        slidePayloadJson: result.slidePayloadJson,
        modelId: result.modelId,
        artifactJobId: result.artifactJobId ?? null,
        artifacts: (result.artifacts ?? []).map(normalizeSlideArtifact).filter((artifact): artifact is SlideArtifact => Boolean(artifact)),
        downloadUrl: result.downloadUrl ?? null,
      };
      setGeneratedSlideDraft(nextDraft);
      const insertSucceeded = await onInsertSlides(nextDraft, {
        closeDialog: false,
        showSuccessToast: false,
      });
      const hasDownloadableArtifact = Boolean(
        nextDraft.downloadUrl
        || pickPreferredSlideArtifact(nextDraft.artifacts ?? [], slideOutputFormat),
      );
      if (options?.successMessage && (insertSucceeded !== false || hasDownloadableArtifact)) {
        toast.success(options.successMessage);
      }
      if (typeof result.artifactFailureMessage === "string" && result.artifactFailureMessage.trim()) {
        if (insertSucceeded !== false) {
          toast.info(`PPTX export failed, but slide JSON is ready and the slides were still imported. ${result.artifactFailureMessage.trim()}`);
        } else {
          toast.error(result.artifactFailureMessage.trim());
        }
      }
      return nextDraft;
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateSlideJsonError")));
      return null;
    }
  };

  const handleGenerate = async () => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      toast.error(t("dialog.articleBuilder.topicRequired"));
      return;
    }
    if (executionSource === "skill" && !skillId) {
      toast.error(t("dialog.articleBuilder.skillRequired"));
      return;
    }
    if (executionSource === "agency" && !agencyId) {
      toast.error(t("dialog.articleBuilder.agencyRequired"));
      return;
    }

    try {
      const result = await generateArticleMutation.mutateAsync({
        deckId,
        topic: trimmedTopic,
        preferredLanguage: detectedLanguage,
        executionSource,
        skillId: executionSource === "skill" ? skillId : null,
        agencyId: executionSource === "agency" ? agencyId : null,
        requiresWebSearch,
        requiresThinking,
        targetImageCount: clampImageCount(targetImageCount),
      });
      setArticle(result.article);
      toast.success(t("dialog.articleBuilder.generateSuccess"));
      void handlePrepareSlideBundle({
        articleOverride: result.article,
        topicOverride: trimmedTopic,
        successMessage: t("dialog.articleBuilder.prepareBundleSuccess"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateError")));
    }
  };

  const handleGenerateImages = async () => {
    const bundle = preparedBundle ?? await handlePrepareSlideBundle();
    if (!bundle) {
      return;
    }
    const missingRequiredFields = getMissingRequiredModelFields(
      selectedMediaModelFields,
      {
        extraParams: syncedMediaModelExtraParams,
        prompt: "__auto_prompt__",
        aspectRatio: canvasRatio,
      },
      {
        treatPromptSyncAsAuto: true,
      },
    );
    if (missingRequiredFields.length > 0) {
      toast.error(`${t("dialog.articleBuilder.mediaFieldsRequired")}: ${missingRequiredFields.join(", ")}`);
      return;
    }

    setIsGeneratingImages(true);
    setGeneratedImages([]);
    setGeneratedSlideDraft(null);
    try {
      const nextAssets: GeneratedImageAsset[] = [];
      for (let index = 0; index < bundle.imagePrompts.length; index += 1) {
        const promptPlan = bundle.imagePrompts[index]!;
        setImageGenerationProgress(`${index + 1}/${bundle.imagePrompts.length}`);
        const extraParams = applyModelSyncTargets(
          selectedImageModelConfig,
          syncedMediaModelExtraParams,
          {
            prompt: promptPlan.prompt,
            aspectRatio: canvasRatio,
          },
        );
        const taskResult = await generateImageAsyncMutation.mutateAsync({
          prompt: promptPlan.prompt,
          model: imageModel.trim() || undefined,
          aspectRatio: canvasRatio,
          numImages: 1,
          ...(extraParams ? { extraParams } : {}),
        });
        let resultUrl = extractTaskResultUrl(taskResult);
        if (!resultUrl) {
          const taskId = extractTaskId(taskResult);
          if (!taskId) {
            throw new Error("Image generation started but task ID was not returned.");
          }
          const terminalTask = await pollTaskUntilTerminal(
            taskId,
            async (id) => trpcUtils.media.getTask.fetch({ taskId: id }),
          );
          resultUrl = extractTaskResultUrl(terminalTask);
        }
        if (!resultUrl) {
          throw new Error("Image provider returned no URL");
        }
        const nextAsset: GeneratedImageAsset = {
          ...promptPlan,
          url: resultUrl,
        };
        nextAssets.push(nextAsset);
        setGeneratedImages([...nextAssets]);
      }
      setImageGenerationProgress("");
      toast.success(t("dialog.articleBuilder.generateImagesSuccess"));
      await handleGenerateSlideDraft({
        imageAssetsOverride: nextAssets,
        successMessage: t("dialog.articleBuilder.generateSlideJsonSuccess"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateImagesError")));
    } finally {
      setIsGeneratingImages(false);
      setImageGenerationProgress("");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[96vw]">
          <div className="flex h-full flex-col">
            <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t("dialog.articleBuilder.title")}
              </DialogTitle>
              <DialogDescription>
                {t("dialog.articleBuilder.description")}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:overflow-hidden">
              <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
                <section className="min-h-0 lg:flex lg:h-[calc(92vh-13rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-background/60 lg:p-3">
                  <div className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                  <div className="space-y-2">
                    <Label htmlFor="presentation-article-topic">{t("dialog.articleBuilder.topicLabel")}</Label>
                    <Textarea
                      id="presentation-article-topic"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder={t("dialog.articleBuilder.topicPlaceholder")}
                      rows={5}
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Languages className="h-3.5 w-3.5" />
                      <span>{t("dialog.articleBuilder.detectedLanguage")}</span>
                      <Badge variant="outline">{detectedLanguageLabel}</Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("dialog.articleBuilder.sourceLabel")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={executionSource === "skill" ? "default" : "outline"}
                        className="justify-start gap-2"
                        onClick={() => setExecutionSource("skill")}
                      >
                        <Sparkles className="h-4 w-4" />
                        {t("dialog.articleBuilder.sourceSkill")}
                      </Button>
                      <Button
                        type="button"
                        variant={executionSource === "agency" ? "default" : "outline"}
                        className="justify-start gap-2"
                        onClick={() => setExecutionSource("agency")}
                      >
                        <Bot className="h-4 w-4" />
                        {t("dialog.articleBuilder.sourceAgency")}
                      </Button>
                    </div>
                  </div>

                  {executionSource === "skill" ? (
                    <div className="space-y-2">
                      <Label>{t("dialog.articleBuilder.skillLabel")}</Label>
                      <Select
                        value={skillId}
                        onValueChange={setSkillId}
                        disabled={skillsQuery.isLoading || articleSkillOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dialog.articleBuilder.skillPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {articleSkillOptions.map((skill) => (
                            <SelectItem key={skill.id} value={skill.id}>
                              {skill.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedArticleSkill?.category ? (
                        <Badge variant="outline">{selectedArticleSkill.category}</Badge>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{t("dialog.articleBuilder.agencyLabel")}</div>
                          <div className="text-xs text-muted-foreground">
                            {agencyId ? (agencyName || agencyId) : t("dialog.articleBuilder.agencyPlaceholder")}
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsAgencyModalOpen(true)}>
                          <Bot className="mr-2 h-4 w-4" />
                          {agencyId
                            ? t("dialog.articleBuilder.changeAgency")
                            : t("dialog.articleBuilder.pickAgency")}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 rounded-xl border p-4">
                    <div>
                      <div className="text-sm font-medium">{t("dialog.articleBuilder.futureImageLabel")}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.futureImageHint")}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="presentation-article-image-count">{t("dialog.articleBuilder.imageCountLabel")}</Label>
                      <Input
                        id="presentation-article-image-count"
                        type="number"
                        min={5}
                        max={20}
                        value={targetImageCount}
                        onChange={(event) => setTargetImageCount(clampImageCount(Number(event.target.value)))}
                      />
                    </div>
                  </div>

                  <fieldset className="space-y-3 rounded-xl border p-4">
                    <legend className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Images className="h-3.5 w-3.5 text-teal-500" />
                      {t("dialog.articleBuilder.mediaOutputLegend")}
                    </legend>

                    <div className="space-y-1.5">
                      <Label>{t("dialog.articleBuilder.mediaModelLabel")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.mediaModelHint")}
                      </p>
                      <ImageModelCombobox
                        value={imageModel}
                        mediaType="image"
                        onValueChange={applyNextImageModel}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="presentation-article-aspect-ratio">{t("dialog.articleBuilder.aspectRatioLabel")}</Label>
                      <select
                        id="presentation-article-aspect-ratio"
                        aria-label={t("dialog.articleBuilder.aspectRatioLabel")}
                        className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        value={canvasRatio}
                        onChange={(event) => setCanvasRatio(normalizeCanvasRatio(event.target.value))}
                      >
                        {supportedCanvasOptions.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.aspectRatioHint")}
                      </p>
                    </div>

                    <div className="space-y-2 rounded-md border border-muted bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label className="text-sm">{t("dialog.articleBuilder.advancedMediaLabel")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {t("dialog.articleBuilder.advancedMediaHint")}
                          </p>
                        </div>
                        <Switch
                          aria-label={t("dialog.articleBuilder.advancedMediaLabel")}
                          checked={advancedMediaOptionsEnabled}
                          onCheckedChange={setAdvancedMediaOptionsEnabled}
                        />
                      </div>
                      {advancedMediaOptionsEnabled ? (
                        <ModelInputFieldsPanel
                          enabled
                          model={selectedImageModelConfig}
                          fields={selectedMediaModelFields}
                          extraParams={mediaModelExtraParams}
                          onChange={(key, value) => {
                            setMediaModelExtraParams((prev) => ({ ...prev, [key]: value }));
                          }}
                          promptPreview="Auto from slide image prompts"
                          aspectRatioPreview={canvasRatio}
                          panelTestId="article-builder-advanced-media-model-inputs"
                          emptyTestId="article-builder-advanced-media-model-inputs-empty"
                        />
                      ) : null}
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3 rounded-xl border p-4">
                    <legend className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Palette className="h-3.5 w-3.5 text-teal-500" />
                      {t("dialog.articleBuilder.visualReferencesLegend")}
                    </legend>
                    <div className="space-y-1.5">
                      <Label htmlFor="presentation-image-prompt-context">{t("dialog.articleBuilder.imagePromptContextLabel")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.imagePromptContextHint")}
                      </p>
                      <Textarea
                        id="presentation-image-prompt-context"
                        value={imagePromptContext}
                        onChange={(event) => setImagePromptContext(event.target.value)}
                        placeholder={t("dialog.articleBuilder.imagePromptContextPlaceholder")}
                        rows={4}
                      />
                    </div>
                  </fieldset>

                  <div className="space-y-3 rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LayoutTemplate className="h-4 w-4" />
                      {t("dialog.articleBuilder.slideSkillSectionTitle")}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("dialog.articleBuilder.slideSkillLabel")}</Label>
                      <Select
                        value={slideSkillId}
                        onValueChange={setSlideSkillId}
                        disabled={skillsQuery.isLoading || slideSkillOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dialog.articleBuilder.slideSkillPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {slideSkillOptions.map((skill) => (
                            <SelectItem key={skill.id} value={skill.id}>
                              {skill.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedSlideSkill?.category ? (
                        <Badge variant="outline">{selectedSlideSkill.category}</Badge>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("dialog.articleBuilder.slideOutputFormatLabel")}</Label>
                      <Select
                        value={slideOutputFormat}
                        onValueChange={(value) => setSlideOutputFormat(value as SlideOutputFormat)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dialog.articleBuilder.slideOutputFormatPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_OUTPUT_FORMATS.map((format) => (
                            <SelectItem key={format} value={format}>
                              {format.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.slideOutputFormatHint")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="presentation-article-web-search">{t("dialog.articleBuilder.webSearchLabel")}</Label>
                      <Switch
                        id="presentation-article-web-search"
                        checked={requiresWebSearch}
                        onCheckedChange={setRequiresWebSearch}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="presentation-article-thinking">{t("dialog.articleBuilder.thinkingLabel")}</Label>
                      <Switch
                        id="presentation-article-thinking"
                        checked={requiresThinking}
                        onCheckedChange={setRequiresThinking}
                      />
                    </div>
                  </div>
                  </div>
                </section>

                <section className="min-h-0 lg:flex lg:h-[calc(92vh-13rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-background/60 lg:p-3">
                  <div className="flex min-h-0 flex-col space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                    <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                        <div className="text-sm font-semibold">{t("dialog.articleBuilder.workflowTitle")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("dialog.articleBuilder.workflowDescription")}
                        </div>
                        </div>
                      <Badge variant="outline">{slideOutputFormats.join(", ").toUpperCase()}</Badge>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      {[
                        {
                          step: 1,
                          title: t("dialog.articleBuilder.workflowStep1Title"),
                          description: t("dialog.articleBuilder.workflowStep1Description"),
                          status: articleStepStatus,
                          action: (
                            <Button type="button" className="w-full" onClick={() => void handleGenerate()} disabled={generateArticleMutation.isPending}>
                              {generateArticleMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t("dialog.articleBuilder.generating")}
                                </>
                              ) : (
                                <>
                                  <WandSparkles className="mr-2 h-4 w-4" />
                                  {article.trim()
                                    ? t("dialog.articleBuilder.regenerate")
                                    : t("dialog.articleBuilder.generate")}
                                </>
                              )}
                            </Button>
                          ),
                        },
                        {
                          step: 2,
                          title: t("dialog.articleBuilder.workflowStep2Title"),
                          description: t("dialog.articleBuilder.workflowStep2Description"),
                          status: bundleStepStatus,
                          action: (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => void handlePrepareSlideBundle({ successMessage: t("dialog.articleBuilder.prepareBundleSuccess") })}
                              disabled={!article.trim() || prepareSlideBundleMutation.isPending}
                            >
                              {prepareSlideBundleMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <LayoutTemplate className="mr-2 h-4 w-4" />
                              )}
                              {t("dialog.articleBuilder.prepareBundle")}
                            </Button>
                          ),
                        },
                        {
                          step: 3,
                          title: t("dialog.articleBuilder.workflowStep3Title"),
                          description: t("dialog.articleBuilder.workflowStep3Description"),
                          status: imageStepStatus,
                          action: (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => void handleGenerateImages()}
                              disabled={!article.trim() || isGeneratingImages || generateImageAsyncMutation.isPending}
                            >
                              {isGeneratingImages ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Images className="mr-2 h-4 w-4" />
                              )}
                              {t("dialog.articleBuilder.generateImages")}
                              {imageGenerationProgress ? ` ${imageGenerationProgress}` : ""}
                            </Button>
                          ),
                        },
                        {
                          step: 4,
                          title: t("dialog.articleBuilder.workflowStep4Title"),
                          description: t("dialog.articleBuilder.workflowStep4Description"),
                          status: slideStepStatus,
                          action: (
                            <div className="flex flex-col gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => void handleGenerateSlideDraft({ successMessage: t("dialog.articleBuilder.generateSlideJsonSuccess") })}
                                disabled={!article.trim() || generatedImages.length === 0 || generateSlideDraftMutation.isPending}
                              >
                                {generateSlideDraftMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <FileJson className="mr-2 h-4 w-4" />
                                )}
                                {t("dialog.articleBuilder.generateSlideJson")}
                              </Button>
                              {downloadableSlideArtifact ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => window.open(downloadableSlideArtifact.url, "_blank", "noopener,noreferrer")}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  {t("dialog.articleBuilder.downloadFormat", {
                                    format: downloadableSlideArtifact.format.toUpperCase(),
                                  })}
                                </Button>
                              ) : generatedSlideDraft?.artifactJobId ? (
                                <Button type="button" variant="outline" className="w-full" disabled>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t("dialog.articleBuilder.preparingFormat", {
                                    format: slideOutputFormat.toUpperCase(),
                                  })}
                                </Button>
                              ) : null}
                            </div>
                          ),
                        },
                      ].map((stepCard) => {
                        const statusBadge = renderWizardStatusBadge(stepCard.status);
                        return (
                          <div
                            key={stepCard.step}
                            className="rounded-2xl border bg-background p-4 shadow-sm"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                                  stepCard.status === "done"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : stepCard.status === "running"
                                      ? "border-sky-200 bg-sky-50 text-sky-700"
                                      : stepCard.status === "ready"
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                }`}
                                >
                                  {stepCard.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : stepCard.step}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold">{stepCard.title}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {t("dialog.articleBuilder.workflowStepLabel", { step: stepCard.step })}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className={statusBadge.className}>
                                {t(statusBadge.labelKey)}
                              </Badge>
                            </div>
                            <p className="mb-4 text-xs leading-5 text-muted-foreground">
                              {stepCard.description}
                            </p>
                            {stepCard.action}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Textarea
                    value={article}
                    onChange={(event) => setArticle(event.target.value)}
                    placeholder={t("dialog.articleBuilder.articlePlaceholder")}
                    rows={18}
                    className="h-[42vh] min-h-[320px] resize-none overflow-y-auto font-medium"
                  />

                  <div className="grid min-h-0 gap-4 xl:grid-cols-2">
                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.bundleSummaryLabel")}</div>
                        {preparedBundle?.modelId ? <Badge variant="secondary">{preparedBundle.modelId}</Badge> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.maxPagesLabel")}</div>
                          <div className="text-lg font-semibold">{preparedBundle?.maxPages ?? "-"}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.plannedImagesLabel")}</div>
                          <div className="text-lg font-semibold">{preparedBundle?.plannedImageCount ?? "-"}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.slideSkillLabel")}</div>
                          <div className="font-medium">{preparedBundle?.slideSkillLabel ?? selectedSlideSkill?.name ?? "-"}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.slideOutputFormatLabel")}</div>
                          <div className="font-medium">{slideOutputFormats.join(", ").toUpperCase()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.promptPlanLabel")}</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void copyText(
                            formatPromptPlan(preparedBundle?.imagePrompts ?? []),
                            t("dialog.articleBuilder.copyPromptPlanSuccess"),
                            t("dialog.articleBuilder.copyPromptPlanEmpty"),
                          )}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {t("dialog.articleBuilder.copyPromptPlan")}
                        </Button>
                      </div>
                      <Textarea
                        readOnly
                        value={formatPromptPlan(preparedBundle?.imagePrompts ?? [])}
                        placeholder={t("dialog.articleBuilder.promptPlanPlaceholder")}
                        rows={10}
                        className="min-h-[220px] resize-none"
                      />
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.generatedImagesLabel")}</div>
                        <Badge variant="outline">{generatedImages.length}</Badge>
                      </div>
                      <Textarea
                        readOnly
                        value={formatGeneratedImages(generatedImages)}
                        placeholder={t("dialog.articleBuilder.generatedImagesPlaceholder")}
                        rows={10}
                        className="min-h-[220px] resize-none"
                      />
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.slideJsonLabel")}</div>
                        {generatedSlideDraft?.modelId ? <Badge variant="secondary">{generatedSlideDraft.modelId}</Badge> : null}
                      </div>
                      <Textarea
                        readOnly
                        value={generatedSlideDraft?.slideJson ?? preparedBundle?.slidePayloadJson ?? ""}
                        placeholder={t("dialog.articleBuilder.slideJsonPlaceholder")}
                        rows={10}
                        className="min-h-[220px] resize-none font-mono text-xs"
                      />
                    </div>
                  </div>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyText(
                  article,
                  t("dialog.articleBuilder.copySuccess"),
                  t("dialog.articleBuilder.copyEmpty"),
                )}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("dialog.articleBuilder.copy")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("dialog.articleBuilder.close")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => generatedSlideDraft ? void onInsertSlides(generatedSlideDraft) : undefined}
                disabled={!generatedSlideDraft?.slideJson.trim() || generateSlideDraftMutation.isPending}
              >
                <LayoutTemplate className="mr-2 h-4 w-4" />
                {t("dialog.articleBuilder.insertSlides")}
              </Button>
              <Button
                type="button"
                onClick={() => void onUseArticle(article)}
                disabled={!article.trim() || generateArticleMutation.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                {t("dialog.articleBuilder.useAsPresentationNote")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AgencyPickerModal
        open={isAgencyModalOpen}
        onClose={() => setIsAgencyModalOpen(false)}
        currentUserId={user?.id ?? null}
        requireRunnable
        onSelect={(agency) => {
          setAgencyId(agency.id);
          setAgencyName(agency.name);
          setIsAgencyModalOpen(false);
        }}
      />
    </>
  );
}
