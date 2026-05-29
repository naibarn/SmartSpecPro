import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Copy, Download, ExternalLink, ImagePlus, Loader2, Maximize2, Mic2, Minus, Music2, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Upload, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import ImageSourcePicker from "@/components/media/ImageSourcePicker";
import type { StoryboardCompanionAudioCandidate, StoryboardRenderAspectRatioMode } from "@/lib/storyboardVideoProject";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";

const STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS = [4, 6, 8, 10, 12, 15] as const;

export interface StoryboardReviewTask {
  id: string;
  index: number;
  prompt: string;
  url?: string | null;
  model?: string;
  durationSeconds?: number;
  generationModelId?: string;
  referenceUrls?: string[];
  generationAspectRatio?: string;
  generationExtraParams?: Record<string, unknown>;
  referenceFrameRoles?: Array<"start" | "stop" | "reference">;
  marketplaceProduct?: {
    productId?: string | null;
    platform?: "shopee" | "tiktok_shop" | null;
    productName?: string | null;
    shopName?: string | null;
    shopId?: string | null;
    itemId?: string | null;
    sourceUrl?: string | null;
  } | null;
  canRegenerate?: boolean;
  isImported?: boolean;
  status: "queued" | "generating" | "completed" | "error";
  error?: string;
}

export interface StoryboardPromptPlannerOptions {
  includeVoiceover: boolean;
  speechMode: "none" | "en" | "th" | "other";
  speechLanguage?: string;
  includeSound: boolean;
  tone: "sales" | "premium" | "demo" | "ugc" | "cinematic";
  language: "auto" | "th" | "en";
}

interface StoryboardBatchReviewDialogProps {
  open: boolean;
  tasks: StoryboardReviewTask[];
  selectedTaskIds: string[];
  onOpenChange: (open: boolean) => void;
  onToggleTask: (taskId: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onRegenerateTask: (taskId: string, prompt: string) => boolean | void | Promise<boolean | void>;
  onUpdateTaskPrompt?: (taskId: string, prompt: string) => void | Promise<void>;
  onUpdateTaskDuration?: (taskId: string, durationSeconds: number) => void | Promise<void>;
  conceptDetails?: string | null;
  onConceptDetailsChange?: (value: string) => void | Promise<void>;
  storyboardGuide?: string | null;
  onStoryboardGuideChange?: (value: string) => void | Promise<void>;
  voiceoverFullScript?: string | null;
  onVoiceoverFullScriptChange?: (value: string) => void | Promise<void>;
  useVoiceoverScriptAsConcept?: boolean;
  onUseVoiceoverScriptAsConceptChange?: (value: boolean) => void | Promise<void>;
  onPlanScenePrompts?: (options: StoryboardPromptPlannerOptions, taskId?: string) => void | Promise<void>;
  isPlanningScenePrompts?: boolean;
  onStartGenerationBatch?: () => void;
  onCancelGeneration?: () => void | Promise<void>;
  onReplaceReferenceFrame?: (taskId: string, frameIndex: 0 | 1, imageUrl: string) => void | Promise<void>;
  onUpdateReferenceFrameRole?: (taskId: string, frameIndex: 0 | 1, role: "start" | "stop" | "reference") => void | Promise<void>;
  onUploadReferenceFrame?: (taskId: string, frameIndex: 0 | 1, files: FileList | File[]) => Promise<string[]>;
  replacingReferenceFrameKey?: string | null;
  onUploadVideoSlot?: (taskId: string, mode: "replace" | "insert-after", files?: FileList | File[]) => void | Promise<void>;
  uploadingVideoSlotKey?: string | null;
  onMoveTask?: (taskId: string, direction: "up" | "down") => void;
  onRemoveTask?: (taskId: string) => void;
  onAutoCompound: () => void;
  onCreateProject: () => void;
  isCompounding: boolean;
  isCreatingProject: boolean;
  isCancellingGeneration?: boolean;
  regeneratingTaskId?: string | null;
  compoundStatus?: string | null;
  projectLink?: string | null;
  companionAudio?: StoryboardCompanionAudioCandidate[];
  regeneratingAudioId?: string | null;
  onRegenerateAudio?: (audioId: string) => void;
  onRemoveAudio?: (audioId: string) => void;
  muteVideoPreviewAudio?: boolean;
  renderDurationSeconds?: number | null;
  renderAspectRatioMode?: StoryboardRenderAspectRatioMode;
  onRenderAspectRatioModeChange?: (mode: StoryboardRenderAspectRatioMode) => void;
  renderOutputLabel?: string | null;
  renderAspectRatioSourceLabel?: string | null;
}

export interface StoryboardBatchReviewPanelProps extends Omit<StoryboardBatchReviewDialogProps, "open"> {
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
  showCloseButton?: boolean;
}

type StoryboardConfirmAction = "generate" | "render" | "project";
type StoryboardLightboxMedia = {
  type: "image" | "video";
  url: string;
  title: string;
} | null;

function summarizePrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

function getFirstLastFrameUrls(task: StoryboardReviewTask): [string, string] | null {
  const referenceUrls = (task.referenceUrls ?? [])
    .map((url) => String(url || "").trim())
    .filter((url) => url.length > 0);
  if (referenceUrls.length < 2) return null;
  return [referenceUrls[0]!, referenceUrls[1]!];
}

function getReferenceFrameRole(task: StoryboardReviewTask, frameIndex: 0 | 1): "start" | "stop" | "reference" {
  const role = task.referenceFrameRoles?.[frameIndex] ?? (task.generationExtraParams?.referenceFrameRoles as unknown[] | undefined)?.[frameIndex];
  return role === "reference" || role === "stop" || role === "start"
    ? role
    : frameIndex === 0 ? "start" : "stop";
}

function referenceFrameRoleLabel(role: "start" | "stop" | "reference", locale: string, short = false): string {
  if (role === "reference") return locale === "th" ? (short ? "Ref" : "ภาพ Reference") : (short ? "Ref" : "Reference image");
  if (role === "stop") return locale === "th" ? (short ? "End" : "Stop Frame") : (short ? "End" : "Stop frame");
  return locale === "th" ? (short ? "Start" : "Start Frame") : (short ? "Start" : "Start frame");
}

export function StoryboardBatchReviewPanel({
  tasks,
  selectedTaskIds,
  onOpenChange,
  onToggleTask,
  onSelectAll,
  onSelectNone,
  onRegenerateTask,
  onUpdateTaskPrompt,
  onUpdateTaskDuration,
  conceptDetails,
  onConceptDetailsChange,
  storyboardGuide,
  onStoryboardGuideChange,
  voiceoverFullScript,
  onVoiceoverFullScriptChange,
  useVoiceoverScriptAsConcept = false,
  onUseVoiceoverScriptAsConceptChange,
  onPlanScenePrompts,
  isPlanningScenePrompts = false,
  onStartGenerationBatch,
  onCancelGeneration,
  onReplaceReferenceFrame,
  onUpdateReferenceFrameRole,
  onUploadReferenceFrame,
  replacingReferenceFrameKey,
  onUploadVideoSlot,
  uploadingVideoSlotKey,
  onMoveTask,
  onRemoveTask,
  onAutoCompound,
  onCreateProject,
  isCompounding,
  isCreatingProject,
  isCancellingGeneration = false,
  regeneratingTaskId,
  compoundStatus,
  projectLink,
  companionAudio = [],
  regeneratingAudioId,
  onRegenerateAudio,
  onRemoveAudio,
  muteVideoPreviewAudio = false,
  renderDurationSeconds,
  renderAspectRatioMode = "auto",
  onRenderAspectRatioModeChange,
  renderOutputLabel,
  renderAspectRatioSourceLabel,
  closeLabel = "Close",
  className,
  contentClassName,
  showCloseButton = true,
}: StoryboardBatchReviewPanelProps) {
  const { t, locale } = useScopedTranslation(["media", "common"]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftPrompts, setDraftPrompts] = useState<Record<string, string>>({});
  const [isGeneratingSelected, setIsGeneratingSelected] = useState(false);
  const [isCancellingSelected, setIsCancellingSelected] = useState(false);
  const [expandedMetadataTaskId, setExpandedMetadataTaskId] = useState<string | null>(null);
  const [plannerSpeechMode, setPlannerSpeechMode] = useState<StoryboardPromptPlannerOptions["speechMode"]>("none");
  const [plannerOtherSpeechLanguage, setPlannerOtherSpeechLanguage] = useState("");
  const [plannerIncludeSound, setPlannerIncludeSound] = useState(false);
  const [plannerTone, setPlannerTone] = useState<StoryboardPromptPlannerOptions["tone"]>("sales");
  const [plannerLanguage, setPlannerLanguage] = useState<StoryboardPromptPlannerOptions["language"]>(locale === "th" ? "th" : "auto");
  const [isEditingVoiceoverFullScript, setIsEditingVoiceoverFullScript] = useState(false);
  const [voiceoverFullScriptDraft, setVoiceoverFullScriptDraft] = useState(voiceoverFullScript ?? "");
  const [confirmAction, setConfirmAction] = useState<StoryboardConfirmAction | null>(null);
  const [copiedPromptTaskId, setCopiedPromptTaskId] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<StoryboardLightboxMedia>(null);
  const [draggingVideoTaskId, setDraggingVideoTaskId] = useState<string | null>(null);
  const showGenerationCancel = Boolean(onCancelGeneration) && (Boolean(regeneratingTaskId) || isGeneratingSelected);
  const plannerSpeechLanguage = plannerSpeechMode === "th"
    ? "Thai"
    : plannerSpeechMode === "en"
      ? "English"
      : plannerSpeechMode === "other"
        ? plannerOtherSpeechLanguage.trim()
        : "";

  useEffect(() => {
    if (!isEditingVoiceoverFullScript) {
      setVoiceoverFullScriptDraft(voiceoverFullScript ?? "");
    }
  }, [isEditingVoiceoverFullScript, voiceoverFullScript]);

  useEffect(() => {
    setDraftPrompts((prev) => {
      const next: Record<string, string> = {};
      for (const task of tasks) {
        next[task.id] = task.id === editingTaskId
          ? (prev[task.id] ?? task.prompt)
          : task.prompt;
      }
      return next;
    });
  }, [editingTaskId, tasks]);

  const selectedCount = selectedTaskIds.length;
  const completedSelectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIds.includes(task.id) && task.status === "completed" && task.url),
    [selectedTaskIds, tasks],
  );
  const generatableSelectedTasks = useMemo(
    () => tasks.filter((task) =>
      selectedTaskIds.includes(task.id)
      && task.canRegenerate !== false
      && task.status !== "completed"
      && task.status !== "generating"
    ),
    [selectedTaskIds, tasks],
  );
  const generationCancelRequestedRef = useRef(false);
  const handleCopyTaskPrompt = async (taskId: string, prompt: string) => {
    const text = prompt.trim();
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
    setCopiedPromptTaskId(taskId);
    window.setTimeout(() => {
      setCopiedPromptTaskId((current) => current === taskId ? null : current);
    }, 1400);
  };

  const handleVideoSlotDrop = async (taskId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingVideoTaskId(null);
    if (!onUploadVideoSlot) return;
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("video/"));
    if (!files.length) return;
    await onUploadVideoSlot(taskId, "replace", files);
  };

  const handleGenerateSelectedTasks = async () => {
    if (generatableSelectedTasks.length === 0 || isGeneratingSelected) return;
    generationCancelRequestedRef.current = false;
    setIsGeneratingSelected(true);
    setIsCancellingSelected(false);
    onStartGenerationBatch?.();
    try {
      for (const task of generatableSelectedTasks) {
        if (generationCancelRequestedRef.current) break;
        const shouldContinue = await onRegenerateTask(task.id, draftPrompts[task.id] ?? task.prompt);
        if (shouldContinue === false) break;
      }
    } finally {
      generationCancelRequestedRef.current = false;
      setIsGeneratingSelected(false);
      setIsCancellingSelected(false);
    }
  };
  const renderDurationLabel = useMemo(() => {
    if (typeof renderDurationSeconds !== "number" || !Number.isFinite(renderDurationSeconds) || renderDurationSeconds <= 0) {
      return null;
    }
    const totalSeconds = Math.round(renderDurationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0
      ? t("mediaStudio.storyboardReviewDurationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") })
      : t("mediaStudio.storyboardReviewDurationSeconds", { seconds });
  }, [renderDurationSeconds, t]);
  const renderMarketplaceMetadataPanel = (task: StoryboardReviewTask) => {
    const metadata = task.marketplaceProduct
      ?? (task.generationExtraParams?.marketplaceContext && typeof task.generationExtraParams.marketplaceContext === "object"
        ? task.generationExtraParams.marketplaceContext as NonNullable<StoryboardReviewTask["marketplaceProduct"]>
        : null);
    if (!metadata) return null;
    const productDetailUrl = metadata.productId
      ? `/marketplace-capture/products/${encodeURIComponent(metadata.productId)}`
      : null;
    return (
      <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-xs text-sky-950">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">
              {locale === "th" ? "ข้อมูลสินค้า Marketplace" : "Marketplace Product Metadata"}
            </div>
            {metadata.productName ? (
              <div className="mt-0.5 line-clamp-2 text-sky-900/80">{metadata.productName}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {productDetailUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-sky-200 bg-white/80 text-sky-900 hover:bg-sky-100"
                onClick={() => window.open(productDetailUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {locale === "th" ? "รายละเอียดสินค้า" : "Product detail"}
              </Button>
            ) : null}
            {metadata.sourceUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-sky-200 bg-white/80 text-sky-900 hover:bg-sky-100"
                onClick={() => window.open(metadata.sourceUrl || "", "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {locale === "th" ? "หน้าสินค้า" : "Product URL"}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="text-sky-800/70">platform</span>
            <div className="font-medium">{metadata.platform || "-"}</div>
          </div>
          <div>
            <span className="text-sky-800/70">shop id</span>
            <div className="font-medium">{metadata.shopId || "-"}</div>
          </div>
          <div>
            <span className="text-sky-800/70">item id</span>
            <div className="font-medium">{metadata.itemId || "-"}</div>
          </div>
          <div>
            <span className="text-sky-800/70">shop name</span>
            <div className="font-medium">{metadata.shopName || "-"}</div>
          </div>
          <div className="sm:col-span-2">
            <span className="text-sky-800/70">product page URL</span>
            <div className="truncate font-medium">{metadata.sourceUrl || "-"}</div>
          </div>
        </div>
      </div>
    );
  };
  const confirmCopy = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction === "generate") {
      return {
        title: t("mediaStudio.storyboardReviewConfirmGenerateTitle"),
        description: t("mediaStudio.storyboardReviewConfirmGenerateDesc", { count: generatableSelectedTasks.length }),
        detail: t("mediaStudio.storyboardReviewGenerateSelectedHelp"),
        actionLabel: t("mediaStudio.storyboardReviewConfirmGenerateAction"),
      };
    }
    if (confirmAction === "render") {
      return {
        title: t("mediaStudio.storyboardReviewConfirmRenderTitle"),
        description: t("mediaStudio.storyboardReviewConfirmRenderDesc", {
          count: completedSelectedTasks.length,
          duration: renderDurationLabel ?? t("mediaStudio.storyboardReviewUnknownDuration"),
        }),
        detail: t("mediaStudio.storyboardReviewConfirmRenderDetail", {
          output: renderOutputLabel ?? t("mediaStudio.storyboardReviewUnknownDuration"),
          source: renderAspectRatioSourceLabel ?? "",
        }),
        actionLabel: t("mediaStudio.storyboardReviewConfirmRenderAction"),
      };
    }
    return {
      title: t("mediaStudio.storyboardReviewConfirmProjectTitle"),
      description: t("mediaStudio.storyboardReviewConfirmProjectDesc", { count: completedSelectedTasks.length }),
      detail: t("mediaStudio.storyboardReviewCreateVideoEditProjectHelp"),
      actionLabel: t("mediaStudio.storyboardReviewConfirmProjectAction"),
    };
  }, [completedSelectedTasks.length, confirmAction, generatableSelectedTasks.length, renderAspectRatioSourceLabel, renderDurationLabel, renderOutputLabel, t]);
  const handleConfirmAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "generate") {
      void handleGenerateSelectedTasks();
    } else if (action === "render") {
      onAutoCompound();
    } else if (action === "project") {
      onCreateProject();
    }
  };
  const handleCancelGeneration = async () => {
    generationCancelRequestedRef.current = true;
    setIsCancellingSelected(true);
    await onCancelGeneration?.();
    if (!regeneratingTaskId) {
      setIsCancellingSelected(false);
    }
  };
  const taskStatusLabel = (status: StoryboardReviewTask["status"]) => {
    switch (status) {
      case "completed":
        return t("mediaStudio.storyboardReviewStatusReady");
      case "generating":
        return t("mediaStudio.storyboardReviewStatusGenerating");
      case "queued":
        return t("mediaStudio.storyboardReviewStatusQueued");
      case "error":
        return t("mediaStudio.storyboardReviewStatusError");
      default:
        return status;
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-background", className)}>
        <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-3 text-left sm:px-6 sm:pt-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold leading-none sm:text-lg">
              <Video className="h-5 w-5 text-blue-500" />
              {t("mediaStudio.storyboardReview")}
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {t("mediaStudio.storyboardReviewPanelDescription")}
            </p>
          </div>
        </div>

        <div className="mx-3 shrink-0 rounded-lg border bg-background px-3 py-2 sm:mx-6">
          <div className="grid gap-2 lg:grid-cols-3">
            <div className="min-w-0">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "แนวคิดและรายละเอียด" : "Concept and details"}
              </div>
              <Textarea
                value={conceptDetails ?? ""}
                onChange={(event) => void onConceptDetailsChange?.(event.target.value)}
                readOnly={!onConceptDetailsChange}
                className="min-h-[72px] resize-y text-xs leading-5"
                placeholder={locale === "th"
                  ? "แนวคิดจาก Production Director จะถูกใช้เป็น guideline ตอนสร้าง prompt แต่ละฉาก"
                  : "Production Director concept guidance used when planning per-scene prompts"}
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {locale === "th" ? "Storyboard guide" : "Storyboard guide"}
              </div>
              <Textarea
                value={storyboardGuide ?? ""}
                onChange={(event) => void onStoryboardGuideChange?.(event.target.value)}
                readOnly={!onStoryboardGuideChange}
                className="min-h-[72px] resize-y text-xs leading-5"
                placeholder={locale === "th"
                  ? "ข้อมูลลำดับช็อต คู่ภาพ start/end และแนวทาง continuity สำหรับใช้ตอนสร้าง prompt"
                  : "Shot order, start/end frame guidance, and continuity notes for prompt planning"}
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {locale === "th" ? "บทพูดรวมที่นำไปใช้" : "Combined voiceover script"}
                </span>
                {onVoiceoverFullScriptChange ? (
                  isEditingVoiceoverFullScript ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setVoiceoverFullScriptDraft(voiceoverFullScript ?? "");
                          setIsEditingVoiceoverFullScript(false);
                        }}
                      >
                        {locale === "th" ? "ยกเลิก" : "Cancel"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          const nextScript = voiceoverFullScriptDraft.trim();
                          void Promise.resolve(onVoiceoverFullScriptChange(nextScript)).then(() => {
                            if (nextScript) {
                              void onUseVoiceoverScriptAsConceptChange?.(true);
                            }
                            setIsEditingVoiceoverFullScript(false);
                          });
                        }}
                      >
                        {locale === "th" ? "บันทึก" : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => {
                        setVoiceoverFullScriptDraft(voiceoverFullScript ?? "");
                        setIsEditingVoiceoverFullScript(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {locale === "th" ? "แก้ไข" : "Edit"}
                    </Button>
                  )
                ) : null}
              </div>
              <Textarea
                value={isEditingVoiceoverFullScript ? voiceoverFullScriptDraft : (voiceoverFullScript ?? "")}
                onChange={(event) => setVoiceoverFullScriptDraft(event.target.value)}
                readOnly={!isEditingVoiceoverFullScript}
                className="min-h-[72px] resize-y text-xs leading-5"
                placeholder={locale === "th"
                  ? "ยังไม่มีบทพูดรวม สร้าง prompt พร้อมบทพูดก่อน หรือกดแก้ไขเพื่อใส่เอง"
                  : "No combined script yet. Plan prompts with voiceover first or edit manually."}
              />
              <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={Boolean(useVoiceoverScriptAsConcept)}
                  disabled={!onUseVoiceoverScriptAsConceptChange || !(voiceoverFullScript ?? voiceoverFullScriptDraft).trim()}
                  onCheckedChange={(checked) => {
                    void onUseVoiceoverScriptAsConceptChange?.(Boolean(checked));
                  }}
                />
                <span>
                  {locale === "th"
                    ? "ใช้บทพูดนี้แทนแนวคิดและรายละเอียดเมื่อสร้าง prompt ใหม่"
                    : "Use this script instead of concept/details when planning new prompts"}
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="mx-3 flex shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("mediaStudio.storyboardReviewSelectedCount", { count: selectedCount })}</Badge>
            <span className="text-muted-foreground">
              {t("mediaStudio.storyboardReviewReadyForExport", { count: completedSelectedTasks.length })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onPlanScenePrompts ? (
              <>
                <select
                  value={plannerSpeechMode}
                  onChange={(event) => setPlannerSpeechMode(event.target.value as StoryboardPromptPlannerOptions["speechMode"])}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  aria-label={locale === "th" ? "โหมดบทพูด" : "Speech mode"}
                >
                  <option value="none">{locale === "th" ? "ไม่ใส่บทพูด" : "No speech"}</option>
                  <option value="en">{locale === "th" ? "บทพูดภาษาอังกฤษ" : "English speech"}</option>
                  <option value="th">{locale === "th" ? "บทพูดภาษาไทย" : "Thai speech"}</option>
                  <option value="other">{locale === "th" ? "ภาษาอื่น ๆ" : "Other language"}</option>
                </select>
                {plannerSpeechMode === "other" ? (
                  <input
                    value={plannerOtherSpeechLanguage}
                    onChange={(event) => setPlannerOtherSpeechLanguage(event.target.value)}
                    placeholder={locale === "th" ? "ระบุภาษา" : "Language"}
                    className="h-8 w-32 rounded-md border bg-background px-2 text-xs"
                  />
                ) : null}
                <label className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                  <Checkbox
                    checked={plannerIncludeSound}
                    onCheckedChange={(checked) => setPlannerIncludeSound(Boolean(checked))}
                    className="h-3.5 w-3.5"
                  />
                  {locale === "th" ? "เสียงประกอบ" : "Sound"}
                </label>
                <select
                  value={plannerTone}
                  onChange={(event) => setPlannerTone(event.target.value as StoryboardPromptPlannerOptions["tone"])}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="sales">{locale === "th" ? "ขายชัด" : "Sales"}</option>
                  <option value="premium">{locale === "th" ? "พรีเมียม" : "Premium"}</option>
                  <option value="demo">{locale === "th" ? "สาธิตสินค้า" : "Demo"}</option>
                  <option value="ugc">UGC</option>
                  <option value="cinematic">{locale === "th" ? "ซีนีเมติก" : "Cinematic"}</option>
                </select>
                <select
                  value={plannerLanguage}
                  onChange={(event) => setPlannerLanguage(event.target.value as StoryboardPromptPlannerOptions["language"])}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="auto">Auto</option>
                  <option value="th">TH</option>
                  <option value="en">EN</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onPlanScenePrompts({
                    includeVoiceover: plannerSpeechMode !== "none",
                    speechMode: plannerSpeechMode,
                    speechLanguage: plannerSpeechLanguage,
                    includeSound: plannerIncludeSound,
                    tone: plannerTone,
                    language: plannerLanguage,
                  })}
                  disabled={tasks.length === 0 || isPlanningScenePrompts || Boolean(regeneratingTaskId) || isGeneratingSelected}
                  title={locale === "th" ? "สร้าง prompt พร้อม customer journey สำหรับทุกฉาก" : "Plan scene prompts with customer journey"}
                >
                  {isPlanningScenePrompts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic2 className="mr-2 h-4 w-4" />}
                  {locale === "th" ? "สร้าง Prompt ทุกฉาก" : "Plan prompts"}
                </Button>
              </>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {showGenerationCancel ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCancelGeneration()}
                disabled={isCancellingGeneration || isCancellingSelected}
                className="col-span-2 sm:col-span-1"
              >
                {isCancellingGeneration || isCancellingSelected ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                {t("mediaStudio.storyboardReviewCancelGeneration")}
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setConfirmAction("generate")}
                disabled={generatableSelectedTasks.length === 0 || Boolean(regeneratingTaskId) || isGeneratingSelected}
                className="col-span-2 sm:col-span-1"
                title={t("mediaStudio.storyboardReviewGenerateSelectedHelp")}
              >
                <Video className="mr-2 h-4 w-4" />
                {t("mediaStudio.storyboardReviewGenerateSelected")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onSelectAll}>
              {t("mediaStudio.storyboardReviewSelectAll")}
            </Button>
            <Button variant="outline" size="sm" onClick={onSelectNone}>
              {t("common.clear")}
            </Button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pr-2 sm:px-6 sm:pr-4", contentClassName)}>
          <div className="space-y-4">
            {companionAudio.length > 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-emerald-950">{t("mediaStudio.storyboardReviewSeparateAudioPreview")}</div>
                    <div className="text-xs text-emerald-800">
                      {t("mediaStudio.storyboardReviewSeparateAudioDesc")}
                    </div>
                  </div>
                  <Badge variant="secondary">{t("mediaStudio.storyboardReviewAudioTrackCount", { count: companionAudio.length })}</Badge>
                </div>

                <div className="space-y-2">
                  {companionAudio.map((audio) => {
                    const isVoiceover = audio.kind === "voiceover";
                    const durationLabel = audio.actualDurationSeconds && audio.targetDurationSeconds
                      ? t("mediaStudio.storyboardReviewAudioDurationTarget", {
                        actual: audio.actualDurationSeconds.toFixed(1),
                        target: audio.targetDurationSeconds.toFixed(1),
                      })
                      : audio.targetDurationSeconds
                        ? t("mediaStudio.storyboardReviewAudioTargetDuration", { target: audio.targetDurationSeconds.toFixed(1) })
                        : null;
                    const startTimeLabel = audio.startTimeSeconds && audio.startTimeSeconds > 0
                      ? t("mediaStudio.storyboardReviewAudioStarts", { start: audio.startTimeSeconds.toFixed(1) })
                      : null;
                    return (
                      <div key={audio.id} className="rounded-lg border bg-background p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700">
                              {isVoiceover ? <Mic2 className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{isVoiceover ? t("mediaStudio.storyboardReviewVoiceover") : t("mediaStudio.storyboardReviewMusic")}</Badge>
                                <span className="text-sm font-medium">{audio.title}</span>
                                {audio.model ? <Badge variant="secondary">{audio.model}</Badge> : null}
                                {audio.segmentCount && audio.segmentCount > 1 ? (
                                  <Badge variant="outline">
                                    {t("mediaStudio.storyboardReviewAudioPart", {
                                      index: (audio.segmentIndex ?? 0) + 1,
                                      count: audio.segmentCount,
                                    })}
                                  </Badge>
                                ) : null}
                                {durationLabel ? <Badge variant="outline">{durationLabel}</Badge> : null}
                                {startTimeLabel ? <Badge variant="outline">{startTimeLabel}</Badge> : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {summarizePrompt(audio.prompt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 lg:w-80">
                            <audio src={audio.url} controls className="w-full" />
                            <div className="flex flex-wrap gap-2">
                              {onRegenerateAudio ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={regeneratingAudioId === audio.id}
                                  onClick={() => onRegenerateAudio(audio.id)}
                                >
                                  {regeneratingAudioId === audio.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                  )}
                                  {t("mediaStudio.storyboardReviewRegenerateAudio")}
                                </Button>
                              ) : null}
                              {onRemoveAudio ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onRemoveAudio(audio.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("common.remove")}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
            {tasks.map((task, taskIndex) => {
              const isSelected = selectedTaskIds.includes(task.id);
              const hasVideo = !!task.url && task.status === "completed";
              const firstLastFrameUrls = getFirstLastFrameUrls(task);
              const isEditing = editingTaskId === task.id;
              const draftPrompt = draftPrompts[task.id] ?? task.prompt;
              const canRegenerate = task.canRegenerate !== false;
              const isQueuedForGeneration = task.status === "queued";
              const selectedShotDuration = STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS.includes(task.durationSeconds as typeof STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS[number])
                ? Number(task.durationSeconds)
                : 8;
              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-xl border bg-background p-3 transition-colors",
                    isSelected ? "border-blue-300 ring-1 ring-blue-100" : "border-border",
                    !isSelected && "opacity-70",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleTask(task.id)}
                      className="mt-1"
                    />

                    <div className="w-full shrink-0 space-y-2 sm:w-36">
                      <div className="overflow-hidden rounded-lg border bg-muted/40">
                        <div className="flex h-44 items-center justify-center text-muted-foreground sm:h-24">
                          {firstLastFrameUrls ? (
                            <div className="grid h-full w-full grid-cols-2">
                              {firstLastFrameUrls.map((url, frameIndex) => {
                                const role = getReferenceFrameRole(task, frameIndex as 0 | 1);
                                const label = referenceFrameRoleLabel(role, locale);
                                return (
                                  <button
                                    key={`${task.id}-frame-${frameIndex}`}
                                    type="button"
                                    className="group relative min-w-0 overflow-hidden border-r text-left last:border-r-0"
                                    onClick={() => setLightboxMedia({
                                      type: "image",
                                      url,
                                      title: `${t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 })} · ${label}`,
                                    })}
                                    title={locale === "th" ? "ขยายดูภาพเต็มจอ" : "Open full-size image"}
                                  >
                                    <img
                                      src={url}
                                      alt={label}
                                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                      loading="lazy"
                                    />
                                    <div className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                      {referenceFrameRoleLabel(role, locale, true)}
                                    </div>
                                    <div className="absolute bottom-1 right-1 rounded bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                      <Maximize2 className="h-3 w-3" />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : task.status === "generating" ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : task.status === "error" ? (
                            <AlertCircle className="h-6 w-6 text-destructive" />
                          ) : (
                            <Video className="h-6 w-6" />
                          )}
                        </div>
                      </div>
                      {hasVideo || onUploadVideoSlot ? (
                        <div
                          className={cn(
                            "overflow-hidden rounded-lg border border-dashed bg-muted/20 transition-colors",
                            draggingVideoTaskId === task.id ? "border-blue-400 bg-blue-50" : "border-border",
                          )}
                          onDragEnter={(event) => {
                            if (!onUploadVideoSlot) return;
                            event.preventDefault();
                            setDraggingVideoTaskId(task.id);
                          }}
                          onDragOver={(event) => {
                            if (!onUploadVideoSlot) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                            setDraggingVideoTaskId(task.id);
                          }}
                          onDragLeave={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                            setDraggingVideoTaskId((current) => current === task.id ? null : current);
                          }}
                          onDrop={(event) => void handleVideoSlotDrop(task.id, event)}
                        >
                          {hasVideo ? (
                            <div className="relative bg-black">
                              <video
                                src={task.url || undefined}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-40 w-full bg-black object-contain sm:h-24"
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="absolute bottom-1 right-1 h-7 w-7 bg-white/90"
                                onClick={() => task.url && setLightboxMedia({
                                  type: "video",
                                  url: task.url,
                                  title: t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 }),
                                })}
                                title={locale === "th" ? "ขยายวิดีโอ" : "Expand video"}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex h-20 flex-col items-center justify-center px-2 text-center text-[11px] text-muted-foreground sm:h-16">
                              <Upload className="mb-1 h-4 w-4" />
                              <span>{locale === "th" ? "ลากวิดีโอมาวาง" : "Drop video"}</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{t("mediaStudio.storyboardReviewClipLabel", { index: task.index + 1 })}</Badge>
                        <Badge
                          variant={task.status === "completed" ? "default" : task.status === "error" ? "destructive" : "secondary"}
                        >
                          {taskStatusLabel(task.status)}
                        </Badge>
                        {task.model ? <Badge variant="secondary">{task.model}</Badge> : null}
                        {task.isImported ? <Badge variant="outline">{t("mediaStudio.storyboardReviewImported")}</Badge> : null}
                        <label className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-muted-foreground">
                          <span>{locale === "th" ? "วินาที/shot" : "Sec/shot"}</span>
                          <select
                            value={String(selectedShotDuration)}
                            disabled={task.status === "generating" || !onUpdateTaskDuration}
                            onChange={(event) => void onUpdateTaskDuration?.(task.id, Number(event.target.value))}
                            className="h-5 rounded border-0 bg-transparent p-0 text-xs font-medium text-foreground outline-none"
                            aria-label={locale === "th" ? "ความยาววิดีโอต่อ shot" : "Video duration per shot"}
                          >
                            {STORYBOARD_SHOT_DURATION_OPTIONS_SECONDS.map((seconds) => (
                              <option key={seconds} value={seconds}>{seconds}s</option>
                            ))}
                          </select>
                        </label>
                        {task.marketplaceProduct || task.generationExtraParams?.marketplaceContext ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => setExpandedMetadataTaskId((current) => current === task.id ? null : task.id)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {locale === "th" ? "Metadata" : "Metadata"}
                          </Button>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm font-medium leading-6">
                        {isEditing ? t("mediaStudio.storyboardReviewEditPromptLead") : summarizePrompt(task.prompt)}
                      </p>

                      {expandedMetadataTaskId === task.id ? renderMarketplaceMetadataPanel(task) : null}

                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={draftPrompt}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftPrompts((prev) => ({ ...prev, [task.id]: value }));
                            }}
                            className="min-h-[140px]"
                            placeholder={t("mediaStudio.storyboardReviewEditPromptPlaceholder")}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void onUpdateTaskPrompt?.(task.id, draftPrompt);
                                setEditingTaskId(null);
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewDoneEditing")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDraftPrompts((prev) => ({ ...prev, [task.id]: task.prompt }))}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {t("common.reset")}
                            </Button>
                          </div>
                        </div>
                      ) : task.error ? (
                        <p className="mt-1 text-xs text-destructive">{task.error}</p>
                      ) : null}

                      {firstLastFrameUrls && onReplaceReferenceFrame ? (
                        <div className="mt-3 rounded-lg border bg-muted/20 p-2">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <ImagePlus className="h-3.5 w-3.5" />
                            {t("mediaStudio.storyboardReviewReplaceFrameTitle")}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {firstLastFrameUrls.map((url, frameIndex) => {
                              const typedFrameIndex = frameIndex as 0 | 1;
                              const key = `${task.id}:${typedFrameIndex}`;
                              const frameRole = getReferenceFrameRole(task, typedFrameIndex);
                              const frameLabel = referenceFrameRoleLabel(frameRole, locale);
                              return (
                                <div key={key} className="space-y-2">
                                  <label className="grid gap-1 text-xs">
                                    <span className="font-medium text-muted-foreground">
                                      {locale === "th" ? "บทบาทภาพของคลิปนี้" : "Frame role for this clip"}
                                    </span>
                                    <select
                                      value={frameRole}
                                      disabled={task.status === "generating" || !onUpdateReferenceFrameRole}
                                      onChange={(event) => void onUpdateReferenceFrameRole?.(task.id, typedFrameIndex, event.target.value as "start" | "stop" | "reference")}
                                      className="h-8 rounded-md border bg-background px-2 text-xs"
                                    >
                                      <option value="start">{referenceFrameRoleLabel("start", locale)}</option>
                                      <option value="stop">{referenceFrameRoleLabel("stop", locale)}</option>
                                      <option value="reference">{referenceFrameRoleLabel("reference", locale)}</option>
                                    </select>
                                  </label>
                                  <ImageSourcePicker
                                    value={[url]}
                                    maxImages={1}
                                    selectionMode="replace"
                                    disabled={task.status === "generating" || replacingReferenceFrameKey === key}
                                    isUploading={replacingReferenceFrameKey === key}
                                    onUpload={onUploadReferenceFrame
                                      ? (files) => onUploadReferenceFrame(task.id, typedFrameIndex, files)
                                      : undefined}
                                    onChange={(urls) => {
                                      const nextUrl = urls[0]?.trim();
                                      if (!nextUrl || nextUrl === url) return;
                                      void onReplaceReferenceFrame(task.id, typedFrameIndex, nextUrl);
                                    }}
                                    label={frameLabel}
                                    helpText={t("mediaStudio.storyboardReviewReplaceFrameHelp")}
                                    language={locale === "th" ? "th" : "en"}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (isEditing) {
                              void onUpdateTaskPrompt?.(task.id, draftPrompt);
                              setEditingTaskId(null);
                              return;
                            }
                            setDraftPrompts((prev) => ({ ...prev, [task.id]: task.prompt }));
                            setEditingTaskId(task.id);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {isEditing ? "Stop editing" : "Edit"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!draftPrompt.trim()}
                          onClick={() => void handleCopyTaskPrompt(task.id, draftPrompt)}
                          title={locale === "th" ? "คัดลอก prompt ของคลิปนี้" : "Copy this clip prompt"}
                        >
                          {copiedPromptTaskId === task.id ? (
                            <Check className="mr-2 h-4 w-4" />
                          ) : (
                            <Copy className="mr-2 h-4 w-4" />
                          )}
                          {copiedPromptTaskId === task.id
                            ? (locale === "th" ? "คัดลอกแล้ว" : "Copied")
                            : (locale === "th" ? "Copy Prompt" : "Copy prompt")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={isQueuedForGeneration ? "default" : "outline"}
                          disabled={!canRegenerate || task.status === "generating" || Boolean(regeneratingTaskId)}
                          onClick={() => {
                            onStartGenerationBatch?.();
                            void onRegenerateTask(task.id, draftPrompt);
                          }}
                          title={canRegenerate
                            ? isQueuedForGeneration
                              ? t("mediaStudio.storyboardReviewGenerateVideoTitle")
                              : t("mediaStudio.storyboardReviewRegenerateTitle")
                            : t("mediaStudio.storyboardReviewImportedNoRegenerate")}
                        >
                          {regeneratingTaskId === task.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          {isQueuedForGeneration
                            ? t("mediaStudio.storyboardReviewGenerateVideo")
                            : t("mediaStudio.storyboardReviewRegenerate")}
                        </Button>
                        {onPlanScenePrompts ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPlanningScenePrompts || task.status === "generating" || Boolean(regeneratingTaskId)}
                            onClick={() => void onPlanScenePrompts({
                              includeVoiceover: plannerSpeechMode !== "none",
                              speechMode: plannerSpeechMode,
                              speechLanguage: plannerSpeechLanguage,
                              includeSound: plannerIncludeSound,
                              tone: plannerTone,
                              language: plannerLanguage,
                            }, task.id)}
                            title={locale === "th" ? "สร้าง prompt เฉพาะฉากนี้ พร้อมส่งบทบาทภาพแนบและแนวคิด" : "Plan only this scene with frame roles and concept guidance"}
                          >
                            {isPlanningScenePrompts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic2 className="mr-2 h-4 w-4" />}
                            {locale === "th" ? "สร้าง Prompt ฉากนี้" : "Plan this scene"}
                          </Button>
                        ) : null}
                        {onUploadVideoSlot ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={task.status === "generating" || Boolean(uploadingVideoSlotKey)}
                              onClick={() => void onUploadVideoSlot(task.id, "replace")}
                              title={t("mediaStudio.storyboardReviewReplaceVideoSlotTitle")}
                            >
                              {uploadingVideoSlotKey === `${task.id}:replace` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="mr-2 h-4 w-4" />
                              )}
                              {t("mediaStudio.storyboardReviewReplaceVideoSlot")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={task.status === "generating" || Boolean(uploadingVideoSlotKey)}
                              onClick={() => void onUploadVideoSlot(task.id, "insert-after")}
                              title={t("mediaStudio.storyboardReviewInsertVideoAfterTitle")}
                            >
                              {uploadingVideoSlotKey === `${task.id}:insert-after` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="mr-2 h-4 w-4" />
                              )}
                              {t("mediaStudio.storyboardReviewInsertVideoAfter")}
                            </Button>
                          </>
                        ) : null}
                        {onMoveTask ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={taskIndex === 0}
                              onClick={() => onMoveTask(task.id, "up")}
                            >
                              <ArrowUp className="mr-2 h-4 w-4" />
                              {t("common.up")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={taskIndex === tasks.length - 1}
                              onClick={() => onMoveTask(task.id, "down")}
                            >
                              <ArrowDown className="mr-2 h-4 w-4" />
                              {t("common.down")}
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "secondary" : "ghost"}
                          onClick={() => onToggleTask(task.id)}
                        >
                          {isSelected ? (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewKeep")}
                            </>
                          ) : (
                            <>
                              <Minus className="mr-2 h-4 w-4" />
                              {t("mediaStudio.storyboardReviewExclude")}
                            </>
                          )}
                        </Button>
                        {onRemoveTask ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onRemoveTask(task.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("common.remove")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t bg-background px-3 pb-3 pt-3 sm:px-6 sm:pb-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{t("mediaStudio.storyboardReviewWorkflowHintTitle")}</span>
                <span className="text-sky-800">{t("mediaStudio.storyboardReviewWorkflowHint")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{t("mediaStudio.storyboardReviewRenderEstimate")}</span>
                <span className="text-sky-800">
              {renderDurationLabel
                ? t("mediaStudio.storyboardReviewRenderEstimateReady", {
                  duration: renderDurationLabel,
                  count: completedSelectedTasks.length,
                })
                : t("mediaStudio.storyboardReviewRenderEstimateEmpty")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t("mediaStudio.storyboardReviewFinalVideoSize")}</span>
                <select
                  className="h-8 rounded-md border border-sky-300 bg-white px-2 text-sm text-sky-950"
                  value={renderAspectRatioMode}
                  onChange={(event) => onRenderAspectRatioModeChange?.(event.target.value as StoryboardRenderAspectRatioMode)}
                  disabled={!onRenderAspectRatioModeChange || isCompounding}
                  aria-label={t("mediaStudio.storyboardReviewFinalVideoSize")}
                >
                  <option value="auto">{t("mediaStudio.storyboardReviewAspectAuto")}</option>
                  <option value="9:16">{t("mediaStudio.storyboardReviewAspect916")}</option>
                  <option value="16:9">{t("mediaStudio.storyboardReviewAspect169")}</option>
                </select>
                <span className="text-sky-800">
                  {renderOutputLabel ?? t("mediaStudio.storyboardReviewRenderEstimateEmpty")}
                </span>
                {renderAspectRatioSourceLabel ? (
                  <span className="text-xs text-sky-700">{renderAspectRatioSourceLabel}</span>
                ) : null}
              </div>
            </div>
          </div>

          {compoundStatus ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {compoundStatus}
            </div>
          ) : null}

          {projectLink ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium">{t("mediaStudio.storyboardReviewProjectCreated")}</div>
                  <a className="block break-all underline decoration-emerald-400 underline-offset-2" href={projectLink}>
                    {t("mediaStudio.storyboardReviewOpenProjectInEditor")}
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <a href={projectLink}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("mediaStudio.storyboardReviewOpenProject")}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50">
                    <a href={projectLink} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("mediaStudio.storyboardReviewOpenNewTab")}
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-start">
              <div className="flex w-full flex-col gap-1 sm:w-44 lg:w-48">
                {showGenerationCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void handleCancelGeneration()}
                    disabled={isCancellingGeneration || isCancellingSelected}
                  >
                    {isCancellingGeneration || isCancellingSelected ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                    {t("mediaStudio.storyboardReviewCancelGeneration")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full"
                    onClick={() => setConfirmAction("generate")}
                    disabled={generatableSelectedTasks.length === 0 || Boolean(regeneratingTaskId) || isGeneratingSelected}
                    title={t("mediaStudio.storyboardReviewGenerateSelectedHelp")}
                  >
                    <Video className="mr-2 h-4 w-4" />
                    {t("mediaStudio.storyboardReviewGenerateSelected")}
                  </Button>
                )}
              </div>
              <div className="flex w-full flex-col gap-1 sm:w-44 lg:w-48">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfirmAction("render")}
                  disabled={isCompounding || completedSelectedTasks.length === 0}
                  title={t("mediaStudio.storyboardReviewRenderVideoAudioHelp")}
                >
                  {isCompounding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("mediaStudio.storyboardReviewRenderVideoAudio")}
                </Button>
              </div>
              <div className="flex w-full flex-col gap-1 sm:w-44 lg:w-48">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfirmAction("project")}
                  disabled={isCreatingProject || completedSelectedTasks.length === 0}
                  title={t("mediaStudio.storyboardReviewCreateVideoEditProjectHelp")}
                >
                  {isCreatingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("mediaStudio.storyboardReviewCreateVideoEditProject")}
                </Button>
              </div>
            </div>
            {showCloseButton ? (
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                {closeLabel}
              </Button>
            ) : null}
          </DialogFooter>
          <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">{confirmCopy?.description}</span>
                  <span className="block font-medium text-foreground">{confirmCopy?.detail}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmAction}>
                  {confirmCopy?.actionLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {lightboxMedia ? (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3"
              role="dialog"
              aria-modal="true"
              aria-label={lightboxMedia.title}
              onClick={() => setLightboxMedia(null)}
            >
              <div className="flex max-h-full w-full max-w-6xl flex-col gap-3" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 text-white">
                  <div className="min-w-0 truncate text-sm font-medium">{lightboxMedia.title}</div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button asChild type="button" size="sm" variant="secondary">
                      <a href={lightboxMedia.url} download target="_blank" rel="noreferrer">
                        <Download className="mr-2 h-4 w-4" />
                        {locale === "th" ? "Download" : "Download"}
                      </a>
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setLightboxMedia(null)}>
                      <X className="mr-2 h-4 w-4" />
                      {locale === "th" ? "ปิด" : "Close"}
                    </Button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
                  {lightboxMedia.type === "image" ? (
                    <img
                      src={lightboxMedia.url}
                      alt={lightboxMedia.title}
                      className="max-h-[calc(100dvh-8rem)] max-w-full object-contain"
                    />
                  ) : (
                    <video
                      src={lightboxMedia.url}
                      controls
                      autoPlay
                      className="max-h-[calc(100dvh-8rem)] max-w-full bg-black object-contain"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
    </div>
  );
}

export function StoryboardBatchReviewDialog({
  open,
  ...props
}: StoryboardBatchReviewDialogProps) {
  const { t } = useScopedTranslation(["media", "common"]);

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="!flex !max-w-[min(92vw,72rem)] !p-0 max-h-[calc(100dvh-2rem)] min-h-0 w-[min(92vw,72rem)] flex-col overflow-hidden">
        <DialogTitle className="sr-only">{t("mediaStudio.storyboardReview")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("mediaStudio.storyboardReviewDialogDescription")}
        </DialogDescription>
        <StoryboardBatchReviewPanel {...props} />
      </DialogContent>
    </Dialog>
  );
}
