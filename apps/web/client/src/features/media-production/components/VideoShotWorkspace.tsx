import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Merge,
  Lock,
  Maximize2,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
  Save,
  Split,
  Unlock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionFlowNode, ProductionNodeOutputRef, ProductionReferenceInput, ProductionSpace } from "@shared/mediaProduction";
import { shotToDraft, type ProductionLocale, type ProductionShotDraft, type VideoShotWorkspaceCallbacks } from "./types";

type AssignedShotMedia = {
  url: string;
  mediaType?: "image" | "video" | "unknown";
  name?: string;
  source?: string;
  taskId?: string;
};

export interface VideoShotWorkspaceProps extends VideoShotWorkspaceCallbacks {
  space?: ProductionSpace | null;
  selectedShotId?: string | null;
  onBackToProduction: () => void;
  locale?: ProductionLocale;
  onUpdateStoryboardPrompt?: (shotId: string, patch: Partial<StoryboardPromptItem>) => void;
  shotGenerationState?: Record<string, Partial<Record<ProductionShotGenerationAction, boolean>>>;
  storyboardReferenceSkillId?: string;
  storyboardReferenceSkillOptions?: Array<{ id: string; label: string }>;
  onStoryboardReferenceSkillChange?: (skillId: string) => void;
  onGenerateShotReferencePrompt?: (shotId: string, skillId: string, prompt?: StoryboardPromptItem) => void;
  onGenerateShotFrameImage?: (shotId: string, phase: "start" | "stop", skillId: string, prompt?: StoryboardPromptItem) => void;
  onGenerateAllShotFrameImages?: (skillId: string, prompts?: Record<string, StoryboardPromptItem>) => void;
  isGeneratingAllShotFrameImages?: boolean;
  shotFrameBatchStatus?: string | null;
  onOpenShotStoryboardGridSplit?: (shotId: string, imageUrl: string, prompt?: StoryboardPromptItem) => void;
  onAssignShotMediaSlot?: (
    shotId: string,
    slot: "reference" | "start" | "stop" | "video",
    media: AssignedShotMedia,
  ) => void;
  onUploadShotMediaFile?: (
    file: File,
    shotId: string,
    slot: "reference" | "start" | "stop" | "video",
  ) => Promise<AssignedShotMedia | null>;
  onCompoundShotVideos?: () => Promise<void> | void;
  isCompoundingShotVideos?: boolean;
  shotVideoCompoundStatus?: string | null;
  onGenerateShotVideo?: (shotId: string, skillId: string, prompt?: StoryboardPromptItem) => void;
}

type StoryboardGridFrame = {
  index: number;
  row?: number;
  col?: number;
  url: string;
  name?: string;
  sourceGridUrl?: string;
  productionRunId?: string;
  productionStoryConceptId?: string;
  productionStoryConceptTitle?: string;
  sourceShotId?: string;
  productionContext?: Record<string, unknown>;
};

type StoryboardPromptItem = {
  shotId?: string;
  order?: number;
  title?: string;
  timeRange?: string;
  durationSeconds?: number;
  script?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  referenceStoryboardPrompt?: string;
  referenceStoryboardSkillId?: string;
  storyboardGridPrompt?: string;
  storyboardGridImageUrl?: string;
  storyboardGridImageTaskId?: string;
  storyboardGridImageResolution?: string;
  storyboardGridFrames?: StoryboardGridFrame[];
  referenceImageUrl?: string;
  referenceImageTaskId?: string;
  startFramePrompt?: string;
  stopFramePrompt?: string;
  startFrameUrl?: string;
  startFrameTaskId?: string;
  stopFrameUrl?: string;
  stopFrameTaskId?: string;
  videoUrl?: string;
  videoTaskId?: string;
  videoGenerationMode?: string;
  videoReadinessStatus?: "ready" | "warning" | "blocked" | string;
  videoReadinessNotes?: string[];
  videoReadinessCheckedAt?: string;
  promptSpeechMode?: "none" | "th" | "en" | "other" | string;
  promptSpeechLanguage?: string;
  promptIncludeSound?: boolean;
  promptTone?: "sales" | "premium" | "demo" | "ugc" | "cinematic" | string;
  buildMode?: string;
};

type ProductionShotGenerationAction = "referencePrompt" | "storyboardGridImage" | "referenceImage" | "startFrame" | "stopFrame" | "video";

type ShotMediaSummary = {
  imageNodes: ProductionFlowNode[];
  videoNodes: ProductionFlowNode[];
  imageOutput?: ProductionNodeOutputRef;
  referenceImageOutput?: ProductionNodeOutputRef;
  startFrameOutput?: ProductionNodeOutputRef;
  stopFrameOutput?: ProductionNodeOutputRef;
  videoOutput?: ProductionNodeOutputRef;
};

function nodeStatusTone(status: string) {
  if (status === "blocked" || status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning" || status === "disabled") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ready" || status === "approved" || status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function summarizeUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(summarizeUnknown).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return "";
}

function booleanUnknown(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function storyboardGridFramesFromUnknown(value: unknown): StoryboardGridFrame[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const frames: StoryboardGridFrame[] = [];
  value.forEach((item, fallbackIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const record = item as Record<string, unknown>;
    const url = summarizeUnknown(record.url) || summarizeUnknown(record.imageUrl);
    if (!url) return;
    const indexValue = Number(record.index);
    frames.push({
      index: Number.isFinite(indexValue) ? indexValue : fallbackIndex,
      row: Number.isFinite(Number(record.row)) ? Number(record.row) : undefined,
      col: Number.isFinite(Number(record.col)) ? Number(record.col) : undefined,
      url,
      name: summarizeUnknown(record.name) || undefined,
      sourceGridUrl: summarizeUnknown(record.sourceGridUrl) || undefined,
      productionRunId: summarizeUnknown(record.productionRunId) || undefined,
      productionStoryConceptId: summarizeUnknown(record.productionStoryConceptId) || undefined,
      productionStoryConceptTitle: summarizeUnknown(record.productionStoryConceptTitle) || undefined,
      sourceShotId: summarizeUnknown(record.sourceShotId) || undefined,
      productionContext: record.productionContext && typeof record.productionContext === "object" && !Array.isArray(record.productionContext)
        ? record.productionContext as Record<string, unknown>
        : undefined,
    });
  });
  frames.sort((a, b) => a.index - b.index);
  return frames.length > 0 ? frames : undefined;
}

function productEvidenceReferenceInputs(space: ProductionSpace): ProductionReferenceInput[] {
  return (space.productEvidenceManifest?.products ?? [])
    .filter((product) => typeof product.imageUrl === "string" && product.imageUrl.trim().length > 0)
    .map((product, index) => {
      const url = product.imageUrl?.trim() ?? "";
      return {
        id: `product-evidence-${product.id || index + 1}`,
        kind: "product_image",
        title: product.title || `Product reference ${index + 1}`,
        url,
        thumbnailUrl: url,
        source: "product-evidence-manifest",
        provenance: {
          manifestId: space.productEvidenceManifest?.manifestId,
          productId: product.productId,
          productAssetId: product.id,
          productTruth: product.productTruth,
          sourceProvenance: product.provenance,
        },
        zone: "products",
        role: product.role || "hero",
        locked: product.requiredVisualAccuracy === "strict",
        warnings: product.reviewNotes,
        approvalState: product.approvalState,
        sku: product.sku,
        variantId: product.variantId,
      } satisfies ProductionReferenceInput;
    });
}

function referenceAssetIdentity(asset: ProductionReferenceInput): string {
  const mediaUrl = (asset.url || asset.thumbnailUrl || "").trim();
  if (mediaUrl) return `url:${mediaUrl}`;
  return `id:${asset.id}`;
}

function dedupeReferenceAssets(assets: ProductionReferenceInput[]): ProductionReferenceInput[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const identity = referenceAssetIdentity(asset);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function storyboardPromptItemsFromSpace(space?: ProductionSpace | null): StoryboardPromptItem[] {
  const node = space?.flowNodes.find((item) => item.id === "storyboard-card" || item.kind === "storyboard_planning");
  const latest = node?.outputRefs?.at(-1)?.metadata;
  const candidates = [
    latest?.storyboardPrompts,
    node?.configSnapshot?.config?.storyboardPrompts,
    node?.metadata?.storyboardPrompts,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        shotId: summarizeUnknown(item.shotId) || undefined,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : undefined,
        title: summarizeUnknown(item.title) || undefined,
        timeRange: summarizeUnknown(item.timeRange) || undefined,
        durationSeconds: Number.isFinite(Number(item.durationSeconds)) ? Number(item.durationSeconds) : undefined,
        script: summarizeUnknown(item.script) || undefined,
        imagePrompt: summarizeUnknown(item.imagePrompt) || undefined,
        videoPrompt: summarizeUnknown(item.videoPrompt) || undefined,
        referenceStoryboardPrompt: summarizeUnknown(item.referenceStoryboardPrompt) || undefined,
        referenceStoryboardSkillId: summarizeUnknown(item.referenceStoryboardSkillId) || undefined,
        storyboardGridPrompt: summarizeUnknown(item.storyboardGridPrompt) || undefined,
        storyboardGridImageUrl: summarizeUnknown(item.storyboardGridImageUrl) || undefined,
        storyboardGridImageTaskId: summarizeUnknown(item.storyboardGridImageTaskId) || undefined,
        storyboardGridImageResolution: summarizeUnknown(item.storyboardGridImageResolution) || undefined,
        storyboardGridFrames: storyboardGridFramesFromUnknown(item.storyboardGridFrames),
        referenceImageUrl: summarizeUnknown(item.referenceImageUrl) || undefined,
        referenceImageTaskId: summarizeUnknown(item.referenceImageTaskId) || undefined,
        startFramePrompt: summarizeUnknown(item.startFramePrompt) || undefined,
        stopFramePrompt: summarizeUnknown(item.stopFramePrompt) || undefined,
        startFrameUrl: summarizeUnknown(item.startFrameUrl) || undefined,
        startFrameTaskId: summarizeUnknown(item.startFrameTaskId) || undefined,
        stopFrameUrl: summarizeUnknown(item.stopFrameUrl) || undefined,
        stopFrameTaskId: summarizeUnknown(item.stopFrameTaskId) || undefined,
        videoUrl: summarizeUnknown(item.videoUrl) || undefined,
        videoTaskId: summarizeUnknown(item.videoTaskId) || undefined,
        videoGenerationMode: summarizeUnknown(item.videoGenerationMode) || undefined,
        promptSpeechMode: summarizeUnknown(item.promptSpeechMode) || undefined,
        promptSpeechLanguage: summarizeUnknown(item.promptSpeechLanguage) || undefined,
        promptIncludeSound: booleanUnknown(item.promptIncludeSound),
        promptTone: summarizeUnknown(item.promptTone) || undefined,
        buildMode: summarizeUnknown(item.buildMode) || undefined,
      }));
  }
  return [];
}

function storyboardPromptForShot(shot: ProductionSpace["shots"][number], prompts: StoryboardPromptItem[]): StoryboardPromptItem {
  return prompts.find((item) => item.shotId === shot.id)
    ?? prompts.find((item) => item.order === shot.order)
    ?? {
      shotId: shot.id,
      order: shot.order,
      title: shot.title,
      durationSeconds: shot.durationSeconds,
      script: shot.script || shot.storyBeat,
      imagePrompt: shot.visualIntent || shot.storyBeat,
      videoPrompt: shot.visualIntent || shot.storyBeat,
    };
}

function outputTimestamp(output?: ProductionNodeOutputRef): number {
  if (!output?.generatedAt) return 0;
  const timestamp = Date.parse(output.generatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function nodeSurface(node: ProductionFlowNode): "image" | "video" | "audio" | "production" {
  const surface = node.configSnapshot?.toolSurface;
  if (surface === "image" || surface === "video" || surface === "audio") return surface;
  if (node.kind.includes("image")) return "image";
  if (node.kind.includes("video")) return "video";
  if (node.kind.includes("audio") || node.kind.includes("voice") || node.kind.includes("tts")) return "audio";
  return "production";
}

function outputUrl(output?: ProductionNodeOutputRef): string | undefined {
  return output?.url || output?.thumbnailUrl || undefined;
}

function shotOutputFromPrompt(prompt: StoryboardPromptItem, role: "reference" | "start" | "stop" | "video"): ProductionNodeOutputRef | undefined {
  const url = role === "reference" ? prompt.referenceImageUrl : role === "start" ? prompt.startFrameUrl : role === "stop" ? prompt.stopFrameUrl : prompt.videoUrl;
  const taskId = role === "reference" ? prompt.referenceImageTaskId : role === "start" ? prompt.startFrameTaskId : role === "stop" ? prompt.stopFrameTaskId : prompt.videoTaskId;
  if (!url && !taskId) return undefined;
  return {
    outputRefId: `story-card-${prompt.shotId ?? prompt.order ?? role}-${role}`,
    nodeId: `${prompt.shotId ?? "shot"}-${role}`,
    kind: role === "video" ? "video" : "image",
    url,
    thumbnailUrl: role === "video" ? undefined : url,
    mediaTaskId: taskId,
    providerTaskId: taskId,
    metadata: { frameRole: role },
  };
}

function classifyShotImageOutput(output: ProductionNodeOutputRef | undefined, node: ProductionFlowNode): "reference" | "start" | "stop" | "generic" {
  const rawRole = String(output?.metadata?.frameRole ?? output?.metadata?.framePhase ?? node.metadata?.frameRole ?? node.metadata?.framePhase ?? "").toLowerCase();
  const nodeId = node.id.toLowerCase();
  if (rawRole.includes("reference") || nodeId.includes("reference-image")) return "reference";
  if (rawRole.includes("start") || nodeId.includes("start-frame")) return "start";
  if (rawRole.includes("stop") || rawRole.includes("end") || nodeId.includes("stop-frame")) return "stop";
  return "generic";
}

function collectShotMedia(space: ProductionSpace | null | undefined, shots: ProductionSpace["shots"]): Record<string, ShotMediaSummary> {
  const result: Record<string, ShotMediaSummary> = Object.fromEntries(shots.map((shot) => [
    shot.id,
    { imageNodes: [], videoNodes: [] },
  ]));
  if (!space) return result;
  const nodeShotIds = new Map<string, string[]>();
  for (const shot of shots) {
    for (const nodeId of shot.nodeIds) {
      nodeShotIds.set(nodeId, [...(nodeShotIds.get(nodeId) ?? []), shot.id]);
    }
  }
  for (const node of space.flowNodes) {
    const targetShotIds = node.shotId ? [node.shotId] : nodeShotIds.get(node.id) ?? [];
    if (targetShotIds.length === 0) continue;
    const surface = nodeSurface(node);
    if (surface !== "image" && surface !== "video") continue;
    const outputs = [...(node.outputRefs ?? [])]
      .filter((output) => output.kind === surface || output.url || output.thumbnailUrl || output.mediaTaskId || output.providerTaskId)
      .sort((a, b) => outputTimestamp(b) - outputTimestamp(a));
    for (const shotId of targetShotIds) {
      if (!result[shotId]) continue;
      if (surface === "image") {
        result[shotId].imageNodes.push(node);
        for (const output of outputs) {
          const role = classifyShotImageOutput(output, node);
          if (role === "reference") result[shotId].referenceImageOutput ??= output;
          else if (role === "start") result[shotId].startFrameOutput ??= output;
          else if (role === "stop") result[shotId].stopFrameOutput ??= output;
        }
        result[shotId].imageOutput ??= outputs[0];
      } else {
        result[shotId].videoNodes.push(node);
        result[shotId].videoOutput ??= outputs[0];
      }
    }
  }
  return result;
}

export function VideoShotWorkspace({
  space,
  selectedShotId,
  onBackToProduction,
  locale,
  onSelectShot,
  onSaveShot,
  onDuplicateShot,
  onSplitShot,
  onToggleShotLock,
  onDeleteShot,
  onReorderShot,
  onMergeShot,
  onConfigureShot,
  onOpenShot,
  onUpdateStoryboardPrompt,
  shotGenerationState,
  storyboardReferenceSkillId,
  storyboardReferenceSkillOptions,
  onStoryboardReferenceSkillChange,
  onGenerateShotReferencePrompt,
  onGenerateShotFrameImage,
  onGenerateAllShotFrameImages,
  isGeneratingAllShotFrameImages = false,
  shotFrameBatchStatus,
  onOpenShotStoryboardGridSplit,
  onAssignShotMediaSlot,
  onUploadShotMediaFile,
  onCompoundShotVideos,
  isCompoundingShotVideos = false,
  shotVideoCompoundStatus,
  onGenerateShotVideo,
}: VideoShotWorkspaceProps) {
  const isThai = locale === "th";
  const [uploadingSlotKey, setUploadingSlotKey] = useState<string | null>(null);
  const shots = useMemo(() => [...(space?.shots ?? [])].sort((a, b) => a.order - b.order), [space?.shots]);
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots[0] ?? null;
  const storyboardPrompts = useMemo(() => storyboardPromptItemsFromSpace(space), [space]);
  const shotMediaById = useMemo(() => collectShotMedia(space, shots), [shots, space]);
  const selectedStoryboardPrompt = useMemo(() => {
    if (!selectedShot) return null;
    return storyboardPrompts.find((item) => item.shotId === selectedShot.id)
      ?? storyboardPrompts.find((item) => item.order === selectedShot.order)
      ?? null;
  }, [selectedShot, storyboardPrompts]);
  const shotReferenceAssetsById = useMemo(() => {
    const result: Record<string, ProductionSpace["contextAssets"]> = {};
    if (!space) return result;
    const productEvidenceAssets = productEvidenceReferenceInputs(space);
    const contextAssets = dedupeReferenceAssets([...productEvidenceAssets, ...space.contextAssets]);
    const visualAssets = contextAssets.filter((asset) => (
      asset.url
      && ["reference_image", "product_image", "marketplace_product", "character_asset", "generated_media", "source_video"].includes(asset.kind)
    ));
    for (const shot of shots) {
      const shotProductIds = new Set(shot.productAssetIds ?? []);
      const productAssets = contextAssets.filter((asset) => {
        if (shotProductIds.has(asset.id)) return true;
        const productId = String((asset.provenance as any)?.productTruth?.productId ?? (asset.provenance as any)?.marketplaceProduct?.productId ?? "");
        return productId && shotProductIds.has(productId);
      });
      const productAssetIdentities = new Set(productAssets.map(referenceAssetIdentity));
      result[shot.id] = [
        ...productAssets,
        ...visualAssets.filter((asset) => !productAssetIdentities.has(referenceAssetIdentity(asset))),
      ].slice(0, 12);
    }
    return result;
  }, [shots, space]);
  const shotReferenceAssets = selectedShot ? shotReferenceAssetsById[selectedShot.id] ?? [] : [];
  const childNodes = useMemo<ProductionFlowNode[]>(
    () =>
      selectedShot && space
        ? selectedShot.nodeIds
            .map((nodeId) => space.flowNodes.find((node) => node.id === nodeId))
            .filter((node): node is ProductionFlowNode => Boolean(node))
        : [],
    [selectedShot, space],
  );
  const initialDraft = useMemo(() => (selectedShot ? shotToDraft(selectedShot) : null), [selectedShot]);
  const [draft, setDraft] = useState<ProductionShotDraft | null>(initialDraft);
  const [storyboardPromptDrafts, setStoryboardPromptDrafts] = useState<Record<string, StoryboardPromptItem>>({});
  const [videoPromptSpeechMode, setVideoPromptSpeechMode] = useState<"none" | "th" | "en" | "other">("none");
  const [videoPromptOtherSpeechLanguage, setVideoPromptOtherSpeechLanguage] = useState("");
  const [videoPromptIncludeSound, setVideoPromptIncludeSound] = useState(false);
  const [videoPromptTone, setVideoPromptTone] = useState<"sales" | "premium" | "demo" | "ugc" | "cinematic">("sales");

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    setStoryboardPromptDrafts(Object.fromEntries(shots.map((shot) => [
      shot.id,
      storyboardPromptForShot(shot, storyboardPrompts),
    ])));
  }, [shots, storyboardPrompts]);

  const updateDraft = (patch: Partial<ProductionShotDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };
  const getStoryboardPromptDraft = (shot: ProductionSpace["shots"][number]): StoryboardPromptItem =>
    storyboardPromptDrafts[shot.id] ?? storyboardPromptForShot(shot, storyboardPrompts);
  const getVideoPromptSpeechLanguage = () => {
    if (videoPromptSpeechMode === "th") return "Thai";
    if (videoPromptSpeechMode === "en") return "English";
    if (videoPromptSpeechMode === "other") return videoPromptOtherSpeechLanguage.trim();
    return "";
  };
  const withVideoPromptPlannerOptions = (promptDraft: StoryboardPromptItem): StoryboardPromptItem => ({
    ...promptDraft,
    promptSpeechMode: videoPromptSpeechMode,
    promptSpeechLanguage: getVideoPromptSpeechLanguage(),
    promptIncludeSound: videoPromptIncludeSound,
    promptTone: videoPromptTone,
  });
  const frameReadyCounts = shots.reduce(
    (counts, shot) => {
      const promptDraft = getStoryboardPromptDraft(shot);
      const mediaSummary = shotMediaById[shot.id] ?? { imageNodes: [], videoNodes: [] };
      const startFrameUrl = outputUrl(shotOutputFromPrompt(promptDraft, "start")) || outputUrl(mediaSummary.startFrameOutput);
      const stopFrameUrl = outputUrl(shotOutputFromPrompt(promptDraft, "stop")) || outputUrl(mediaSummary.stopFrameOutput);
      if (String(promptDraft.startFramePrompt ?? "").trim()) counts.startPrompts += 1;
      if (String(promptDraft.stopFramePrompt ?? "").trim()) counts.stopPrompts += 1;
      if (startFrameUrl) counts.startFrames += 1;
      if (stopFrameUrl) counts.stopFrames += 1;
      if (videoPromptSpeechMode === "none" || String(promptDraft.script ?? "").trim()) counts.audioReady += 1;
      return counts;
    },
    { startPrompts: 0, stopPrompts: 0, startFrames: 0, stopFrames: 0, audioReady: 0 },
  );
  const readyShotVideoCount = shots.filter((shot) => {
    const promptDraft = getStoryboardPromptDraft(shot);
    const mediaSummary = shotMediaById[shot.id] ?? { imageNodes: [], videoNodes: [] };
    const promptVideoOutput = shotOutputFromPrompt(promptDraft, "video");
    const videoOutput = outputUrl(promptVideoOutput) ? promptVideoOutput : mediaSummary.videoOutput;
    return Boolean(outputUrl(videoOutput));
  }).length;
  const updateStoryboardPromptDraft = (shotId: string, patch: Partial<StoryboardPromptItem>) => {
    setStoryboardPromptDrafts((current) => ({
      ...current,
      [shotId]: { ...(current[shotId] ?? {}), shotId, ...patch },
    }));
  };
  const selectedStoryboardPromptDraft = draft ? storyboardPromptDrafts[draft.id] ?? selectedStoryboardPrompt : null;
  const selectedShotMediaSummary = draft ? shotMediaById[draft.id] ?? ({ imageNodes: [], videoNodes: [] } as ShotMediaSummary) : null;
  const selectedStartFrameUrl = selectedStoryboardPromptDraft
    ? outputUrl(shotOutputFromPrompt(selectedStoryboardPromptDraft, "start")) || outputUrl(selectedShotMediaSummary?.startFrameOutput)
    : undefined;
  const selectedStopFrameUrl = selectedStoryboardPromptDraft
    ? outputUrl(shotOutputFromPrompt(selectedStoryboardPromptDraft, "stop")) || outputUrl(selectedShotMediaSummary?.stopFrameOutput)
    : undefined;
  const selectedHasStartStopFrames = Boolean(selectedStartFrameUrl && selectedStopFrameUrl);
  const isDraftStale = Boolean(draft && selectedShot?.version !== undefined && draft.version !== undefined && draft.version < selectedShot.version);
  const fullShotEditorRef = useRef<HTMLDivElement | null>(null);
  const shotTitleInputRef = useRef<HTMLInputElement | null>(null);
  const referenceSkillOptions = storyboardReferenceSkillOptions?.length
    ? storyboardReferenceSkillOptions
    : [
      { id: "furniture-reference-storyboard", label: "Furniture Reference Storyboard" },
      { id: "cosmatic-reference-storyboard", label: "Cosmatic Reference Storyboard" },
    ];
  const selectedReferenceSkillId = storyboardReferenceSkillId || referenceSkillOptions[0]?.id || "furniture-reference-storyboard";

  const handleSelectShot = (shotId: string) => {
    onSelectShot?.(shotId);
  };

  const handleOpenShot = (shotId: string) => {
    onOpenShot?.(shotId);
    onSelectShot?.(shotId);
    window.setTimeout(() => {
      fullShotEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      shotTitleInputRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const handleConfigureShot = (shotId: string) => {
    onConfigureShot?.(shotId);
    onSelectShot?.(shotId);
  };

  const handleSavePromptDraft = (shotId: string, promptDraft: StoryboardPromptItem) => {
    onUpdateStoryboardPrompt?.(shotId, promptDraft);
  };
  const handleGenerateAllShotFrameImages = () => {
    const prompts = Object.fromEntries(shots.map((shot) => [
      shot.id,
      withVideoPromptPlannerOptions(getStoryboardPromptDraft(shot)),
    ]));
    for (const [shotId, promptDraft] of Object.entries(prompts)) {
      onUpdateStoryboardPrompt?.(shotId, promptDraft);
    }
    onGenerateAllShotFrameImages?.(selectedReferenceSkillId, prompts);
  };

  const inferDroppedMediaType = (url: string, explicit?: string): "image" | "video" | "unknown" => {
    const normalizedExplicit = String(explicit ?? "").trim().toLowerCase();
    if (normalizedExplicit === "image" || normalizedExplicit === "video") return normalizedExplicit;
    if (normalizedExplicit.includes("video")) return "video";
    if (
      normalizedExplicit.includes("image") ||
      normalizedExplicit === "marketplace_product" ||
      normalizedExplicit === "product_image" ||
      normalizedExplicit === "reference_image" ||
      normalizedExplicit === "character_asset"
    ) return "image";
    const normalizedUrl = url.split("?")[0]?.toLowerCase() ?? "";
    if (/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(normalizedUrl)) return "video";
    if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(normalizedUrl) || url.startsWith("data:image/")) return "image";
    return "unknown";
  };

  const getDroppedMediaTypeHint = (dataTransfer: DataTransfer): string => (
    dataTransfer.getData("application/x-smartspec-media-type") ||
    dataTransfer.getData("text/x-smartspec-media-type")
  );

  const pickDroppedFileForSlot = (
    files: FileList | undefined,
    slot: "reference" | "start" | "stop" | "video",
  ) => {
    if (!files || files.length === 0) return null;
    return Array.from(files).find((file) => {
      const name = file.name.toLowerCase();
      if (slot === "video") return file.type === "video/mp4" || name.endsWith(".mp4");
      return file.type.startsWith("image/");
    }) ?? null;
  };

  const readDroppedMedia = (event: DragEvent<HTMLElement>) => {
    const dataTransfer = event.dataTransfer;
    const splitFramePayload = dataTransfer.getData("application/x-production-shot-split-frame");
    if (splitFramePayload) {
      try {
        const parsed = JSON.parse(splitFramePayload) as Record<string, unknown>;
        const url = summarizeUnknown(parsed.url);
        if (url) {
          return {
            url,
            mediaType: "image" as const,
            name: summarizeUnknown(parsed.name) || summarizeUnknown(parsed.index) || undefined,
            source: "storyboard_grid_frame",
            taskId: summarizeUnknown(parsed.taskId) || undefined,
          };
        }
      } catch {
        // Fall through to generic URL formats.
      }
    }
    const assetPayload = dataTransfer.getData("application/x-production-asset-json");
    if (assetPayload) {
      try {
        const parsed = JSON.parse(assetPayload) as Record<string, unknown>;
        const url = summarizeUnknown(parsed.url) || summarizeUnknown(parsed.thumbnailUrl);
        if (url) {
          const explicitType = getDroppedMediaTypeHint(dataTransfer) || summarizeUnknown(parsed.mediaType) || summarizeUnknown(parsed.kind);
          return {
            url,
            mediaType: inferDroppedMediaType(url, explicitType),
            name: summarizeUnknown(parsed.title) || summarizeUnknown(parsed.name) || undefined,
            source: "production_asset",
            taskId: summarizeUnknown(parsed.taskId) || summarizeUnknown(parsed.id) || undefined,
          };
        }
      } catch {
        // Fall through to generic URL formats.
      }
    }
    const url = dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain");
    if (!url) return null;
    const explicitType = getDroppedMediaTypeHint(dataTransfer);
    return {
      url,
      mediaType: inferDroppedMediaType(url, explicitType),
      name: undefined,
      source: "drag_drop",
    };
  };

  const handleSplitFrameDragStart = (
    event: DragEvent<HTMLDivElement>,
    shotId: string,
    frame: StoryboardGridFrame,
  ) => {
    const payload = {
      shotId,
      index: frame.index,
      row: frame.row,
      col: frame.col,
      url: frame.url,
      name: frame.name || `Frame ${frame.index + 1}`,
      sourceGridUrl: frame.sourceGridUrl,
      productionRunId: frame.productionRunId,
      productionStoryConceptId: frame.productionStoryConceptId,
      productionStoryConceptTitle: frame.productionStoryConceptTitle,
      sourceShotId: frame.sourceShotId,
      productionContext: frame.productionContext,
    };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-production-shot-split-frame", JSON.stringify(payload));
    event.dataTransfer.setData("application/x-smartspec-media-type", "image");
    event.dataTransfer.setData("text/uri-list", frame.url);
    event.dataTransfer.setData("text/plain", frame.url);
  };

  const mediaPreview = (
    shotId: string,
    slot: "reference" | "start" | "stop" | "video",
    label: string,
    url: string | undefined,
    kind: "image" | "video",
    emptyLabel: string,
    testId: string,
  ) => {
    const slotKey = `${shotId}:${slot}`;
    const isUploadingSlot = uploadingSlotKey === slotKey;
    return (
    <div
      className="overflow-hidden rounded-md border bg-slate-50 transition-colors hover:border-sky-300"
      data-testid={testId}
      onDragOver={(event) => {
        if (!onAssignShotMediaSlot && !onUploadShotMediaFile) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={async (event) => {
        if (!onAssignShotMediaSlot) return;
        event.preventDefault();
        const droppedFile = pickDroppedFileForSlot(event.dataTransfer.files, slot);
        if (droppedFile) {
          if (!onUploadShotMediaFile) return;
          setUploadingSlotKey(slotKey);
          try {
            const uploadedMedia = await onUploadShotMediaFile(droppedFile, shotId, slot);
            if (uploadedMedia?.url) {
              onAssignShotMediaSlot(shotId, slot, uploadedMedia);
            }
          } finally {
            setUploadingSlotKey(null);
          }
          return;
        }
        const media = readDroppedMedia(event);
        if (!media?.url) return;
        onAssignShotMediaSlot(shotId, slot, media);
      }}
    >
      <div className="flex aspect-[9/12] items-center justify-center">
        {isUploadingSlot ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-sky-700">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>{isThai ? "กำลังอัปโหลด" : "Uploading"}</span>
          </div>
        ) : url ? (
          kind === "video" ? (
            <video src={url} className="h-full w-full object-contain" controls playsInline />
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="h-full w-full" aria-label={`${label} full size`}>
              <img src={url} alt="" className="h-full w-full object-contain" />
            </a>
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground">
            {kind === "video" ? <Play className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            <span className="break-words">{emptyLabel}</span>
          </div>
        )}
      </div>
      <div className="border-t bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
        {label}
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="video-shot-workspace">
      {!space ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground" data-testid="video-shot-no-project">
          {isThai ? "ยังไม่มี Production Space ให้แก้ไขช็อต" : "No production space is available for shot editing."}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-sky-50 text-sky-700">
              Video Shot
            </Badge>
            <Badge variant="outline">{selectedShot?.status ?? "no-shot"}</Badge>
            {selectedShot?.locked ? <Badge variant="outline">locked</Badge> : null}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{selectedShot?.title ?? (isThai ? "ยังไม่ได้เลือกช็อต" : "No shot selected")}</h2>
          <p className="text-sm text-muted-foreground">
            {isThai ? "แก้ story, cast/product intent, audio และ child node ของแต่ละช็อต" : "Edit shot story, product use, audio intent, and child nodes."}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onBackToProduction}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isThai ? "กลับ Production" : "Back to Production"}
        </Button>
      </div>

      {space && shots.length > 0 ? (
        <section className="rounded-lg border bg-white p-4 shadow-sm" data-testid="video-shot-storyboard-cards">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-950">
                  {isThai ? "Storyboard prompt cards ทั้งหมด" : "Full storyboard prompt cards"}
                </h3>
                <Badge variant="outline" className="bg-sky-50 text-sky-700">{shots.length} cards</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {isThai
                  ? "ดูภาพรวมทุกช็อต แก้ prompt และสั่งสร้างภาพหรือวิดีโอได้จาก card โดยไม่ต้องซูมใน canvas"
                  : "Review every shot, edit prompts, and generate images or videos without zooming into the canvas."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateAllShotFrameImages}
                disabled={!onGenerateAllShotFrameImages || isGeneratingAllShotFrameImages || shots.length === 0}
                title={isThai ? "สร้าง Start frame แล้วรอเสร็จ ก่อนสร้าง Stop frame ของแต่ละ shot เพื่อคุม continuity" : "Generate each shot's start frame first, wait for completion, then generate its stop frame for continuity."}
              >
                {isGeneratingAllShotFrameImages ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                {isGeneratingAllShotFrameImages
                  ? (isThai ? "กำลังสร้างเฟรมทุกช็อต" : "Generating all frames")
                  : (isThai ? "สร้างภาพ Start/Stop ทุก Shot" : "Generate all start/stop frames")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onCompoundShotVideos?.()}
                disabled={!onCompoundShotVideos || isCompoundingShotVideos || readyShotVideoCount === 0}
              >
                {isCompoundingShotVideos ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Merge className="mr-2 h-4 w-4" />
                )}
                {isThai ? `รวมวิดีโอ (${readyShotVideoCount})` : `Combine videos (${readyShotVideoCount})`}
              </Button>
              <Button type="button" variant="outline" onClick={() => selectedShot && handleOpenShot(selectedShot.id)} disabled={!selectedShot}>
                <Maximize2 className="mr-2 h-4 w-4" />
                {isThai ? "เปิดช็อตที่เลือก" : "Open selected shot"}
              </Button>
            </div>
          </div>
          {shotVideoCompoundStatus ? (
            <div className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
              {shotVideoCompoundStatus}
            </div>
          ) : null}
          {shotFrameBatchStatus ? (
            <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              {shotFrameBatchStatus}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] md:items-center">
		            <div className="grid gap-1">
		              <Label htmlFor="video-shot-reference-storyboard-skill">
		                {isThai ? "Skill สำหรับ prompt Start/Stop frame" : "Start/stop frame prompt skill"}
		              </Label>
              <select
                id="video-shot-reference-storyboard-skill"
                value={selectedReferenceSkillId}
                onChange={(event) => onStoryboardReferenceSkillChange?.(event.target.value)}
                className="h-10 rounded-md border bg-white px-3 text-sm"
              >
                {referenceSkillOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
		            <p className="text-xs leading-5 text-muted-foreground">
		              {isThai
		                ? "ระบบจะสร้าง prompt ภาพ Start และ Stop แบบแยกช็อต เพื่อ generate ภาพเต็ม resolution ก่อนส่งต่อสร้างวิดีโอ ส่วนภาพจาก 3x3 ใน Tab Image ยังลากมาวางในช่องได้"
		                : "Each shot gets separate full-resolution start and stop frame prompts before video generation. Frames from the Image tab 3x3 flow can still be dragged into slots."}
		            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-white text-slate-700">
              {isThai ? `Prompt Start ${frameReadyCounts.startPrompts}/${shots.length}` : `Start prompts ${frameReadyCounts.startPrompts}/${shots.length}`}
            </Badge>
            <Badge variant="outline" className="bg-white text-slate-700">
              {isThai ? `Prompt Stop ${frameReadyCounts.stopPrompts}/${shots.length}` : `Stop prompts ${frameReadyCounts.stopPrompts}/${shots.length}`}
            </Badge>
            <Badge variant="outline" className={frameReadyCounts.startFrames === shots.length && shots.length ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white text-slate-700"}>
              {isThai ? `Start frame ${frameReadyCounts.startFrames}/${shots.length}` : `Start frames ${frameReadyCounts.startFrames}/${shots.length}`}
            </Badge>
            <Badge variant="outline" className={frameReadyCounts.stopFrames === shots.length && shots.length ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white text-slate-700"}>
              {isThai ? `Stop frame ${frameReadyCounts.stopFrames}/${shots.length}` : `Stop frames ${frameReadyCounts.stopFrames}/${shots.length}`}
            </Badge>
            <Badge variant="outline" className={videoPromptSpeechMode === "none" || frameReadyCounts.audioReady === shots.length ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              {videoPromptSpeechMode === "none"
                ? (isThai ? "เสียง: ไม่ใส่บทพูด" : "Audio: no speech")
                : (isThai ? `บทพูดพร้อม ${frameReadyCounts.audioReady}/${shots.length}` : `Speech ready ${frameReadyCounts.audioReady}/${shots.length}`)}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3">
            <select
              value={videoPromptSpeechMode}
              onChange={(event) => setVideoPromptSpeechMode(event.target.value as typeof videoPromptSpeechMode)}
              className="h-9 rounded-md border bg-white px-3 text-sm"
              aria-label={isThai ? "โหมดบทพูดสำหรับ prompt วิดีโอ" : "Video prompt speech mode"}
            >
              <option value="none">{isThai ? "ไม่ใส่บทพูด" : "No speech"}</option>
              <option value="th">{isThai ? "บทพูดภาษาไทย" : "Thai speech"}</option>
              <option value="en">{isThai ? "บทพูดภาษาอังกฤษ" : "English speech"}</option>
              <option value="other">{isThai ? "ภาษาอื่น ๆ" : "Other language"}</option>
            </select>
            {videoPromptSpeechMode === "other" ? (
              <Input
                value={videoPromptOtherSpeechLanguage}
                onChange={(event) => setVideoPromptOtherSpeechLanguage(event.target.value)}
                placeholder={isThai ? "ระบุภาษา" : "Language"}
                className="h-9 w-32"
              />
            ) : null}
            <label className="flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm">
              <input
                type="checkbox"
                checked={videoPromptIncludeSound}
                onChange={(event) => setVideoPromptIncludeSound(event.target.checked)}
                className="h-4 w-4"
              />
              {isThai ? "เสียงประกอบ" : "Sound"}
            </label>
            <select
              value={videoPromptTone}
              onChange={(event) => setVideoPromptTone(event.target.value as typeof videoPromptTone)}
              className="h-9 rounded-md border bg-white px-3 text-sm"
              aria-label={isThai ? "โทน prompt วิดีโอ" : "Video prompt tone"}
            >
              <option value="sales">{isThai ? "ขายชัด" : "Sales"}</option>
              <option value="premium">{isThai ? "พรีเมียม" : "Premium"}</option>
              <option value="demo">{isThai ? "สาธิตสินค้า" : "Demo"}</option>
              <option value="ugc">{isThai ? "UGC" : "UGC"}</option>
              <option value="cinematic">{isThai ? "ซีนีมาติก" : "Cinematic"}</option>
            </select>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {shots.map((shot) => {
              const promptDraft = getStoryboardPromptDraft(shot);
              const mediaSummary = shotMediaById[shot.id] ?? { imageNodes: [], videoNodes: [] };
              const promptReferenceOutput = shotOutputFromPrompt(promptDraft, "reference");
              const promptStartOutput = shotOutputFromPrompt(promptDraft, "start");
              const promptStopOutput = shotOutputFromPrompt(promptDraft, "stop");
              const promptVideoOutput = shotOutputFromPrompt(promptDraft, "video");
              const referenceImageOutput = outputUrl(promptReferenceOutput) ? promptReferenceOutput : mediaSummary.referenceImageOutput;
              const startFrameOutput = outputUrl(promptStartOutput) ? promptStartOutput : mediaSummary.startFrameOutput;
              const stopFrameOutput = outputUrl(promptStopOutput) ? promptStopOutput : mediaSummary.stopFrameOutput;
              const videoOutput = outputUrl(promptVideoOutput) ? promptVideoOutput : mediaSummary.videoOutput;
              const referenceImageUrl = outputUrl(referenceImageOutput);
	              const startFrameUrl = outputUrl(startFrameOutput);
	              const stopFrameUrl = outputUrl(stopFrameOutput);
	              const videoUrl = outputUrl(videoOutput);
	              const hasStartStopFrames = Boolean(startFrameUrl && stopFrameUrl);
	              const storyboardGridImageUrl = promptDraft.storyboardGridImageUrl;
	              const storyboardGridFrames = promptDraft.storyboardGridFrames ?? [];
	              const shotReferences = shotReferenceAssetsById[shot.id] ?? [];
              const readinessStatus = String(promptDraft.videoReadinessStatus ?? "").trim();
              const readinessTone = readinessStatus === "blocked"
                ? "border-red-200 bg-red-50 text-red-700"
                : readinessStatus === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : readinessStatus === "ready"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : hasStartStopFrames
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600";
              const needsSpeechLine = videoPromptSpeechMode !== "none";
              const hasSpeechLine = Boolean(String(promptDraft.script ?? "").trim());
              const isSelected = selectedShot?.id === shot.id;
              const busy = shotGenerationState?.[shot.id] ?? {};
              return (
                <article
                  key={shot.id}
                  className={`rounded-lg border p-3 transition-colors ${isSelected ? "border-sky-300 bg-sky-50/70" : "border-slate-200 bg-white"}`}
                  data-testid={`video-shot-storyboard-card-${shot.id}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-white text-sky-700">
                          {promptDraft.timeRange ?? `${shot.durationSeconds ?? 0}s`}
                        </Badge>
                        <h4 className="min-w-0 break-words text-base font-semibold text-slate-950">
                          {shot.order}. {promptDraft.title ?? shot.title}
                        </h4>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                        {shot.storyBeat || promptDraft.script || promptDraft.videoPrompt || promptDraft.imagePrompt}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        <Badge variant="outline" className={promptDraft.startFramePrompt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                          {promptDraft.startFramePrompt ? <CheckCircle className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                          {isThai ? "Start prompt" : "Start prompt"}
                        </Badge>
                        <Badge variant="outline" className={startFrameUrl ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}>
                          {isThai ? "Start image" : "Start image"}
                        </Badge>
                        <Badge variant="outline" className={stopFrameUrl ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}>
                          {isThai ? "Stop image" : "Stop image"}
                        </Badge>
                        <Badge variant="outline" className={needsSpeechLine && !hasSpeechLine ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                          {needsSpeechLine && !hasSpeechLine
                            ? (isThai ? "ขาดบทพูด" : "Missing speech")
                            : (isThai ? "เสียงพร้อม" : "Audio ready")}
                        </Badge>
                        <Badge variant="outline" className={readinessTone} title={(promptDraft.videoReadinessNotes ?? []).join("\n") || undefined}>
                          {readinessStatus === "blocked"
                            ? (isThai ? "วิดีโอติดเงื่อนไข" : "Video blocked")
                            : readinessStatus === "warning"
                              ? (isThai ? "วิดีโอมีจุดเสี่ยง" : "Video warning")
                              : readinessStatus === "ready" || hasStartStopFrames
                                ? (isThai ? "พร้อมสร้างวิดีโอ" : "Video ready")
                                : (isThai ? "รอเฟรม" : "Waiting frames")}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenShot(shot.id)}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {isThai ? "แก้เต็ม" : "Edit"}
                      </Button>
	                      <Button
	                        type="button"
	                        variant="outline"
	                        size="sm"
	                        disabled={Boolean(busy.referencePrompt) || !onGenerateShotReferencePrompt}
                        onClick={() => {
                          const nextPromptDraft = withVideoPromptPlannerOptions(promptDraft);
                          handleSavePromptDraft(shot.id, nextPromptDraft);
                          onGenerateShotReferencePrompt?.(shot.id, selectedReferenceSkillId, nextPromptDraft);
                        }}
	                      >
	                        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy.referencePrompt ? "animate-spin" : ""}`} />
	                        {busy.referencePrompt ? (isThai ? "กำลังสร้าง prompt" : "Prompting") : (isThai ? "สร้าง Prompt Start/Stop" : "Start/stop prompts")}
	                      </Button>
	                      <Button
	                        type="button"
	                        variant="outline"
	                        size="sm"
	                        disabled={Boolean(busy.startFrame) || !onGenerateShotFrameImage}
	                        onClick={() => {
	                          const nextPromptDraft = withVideoPromptPlannerOptions(promptDraft);
	                          handleSavePromptDraft(shot.id, nextPromptDraft);
	                          onGenerateShotFrameImage?.(shot.id, "start", selectedReferenceSkillId, nextPromptDraft);
	                        }}
	                      >
	                        <ImageIcon className={`mr-1 h-3.5 w-3.5 ${busy.startFrame ? "animate-pulse" : ""}`} />
	                        {busy.startFrame ? (isThai ? "กำลังสร้าง Start" : "Generating start") : (isThai ? "สร้าง Start frame" : "Generate start")}
	                      </Button>
	                      <Button
	                        type="button"
	                        variant="outline"
	                        size="sm"
	                        disabled={Boolean(busy.stopFrame) || !onGenerateShotFrameImage}
	                        onClick={() => {
	                          const nextPromptDraft = withVideoPromptPlannerOptions(promptDraft);
	                          handleSavePromptDraft(shot.id, nextPromptDraft);
	                          onGenerateShotFrameImage?.(shot.id, "stop", selectedReferenceSkillId, nextPromptDraft);
	                        }}
	                      >
	                        <ImageIcon className={`mr-1 h-3.5 w-3.5 ${busy.stopFrame ? "animate-pulse" : ""}`} />
	                        {busy.stopFrame ? (isThai ? "กำลังสร้าง Stop" : "Generating stop") : (isThai ? "สร้าง Stop frame" : "Generate stop")}
	                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy.video) || !onGenerateShotVideo || !hasStartStopFrames}
                        title={!hasStartStopFrames ? (isThai ? "ต้องมี Start frame และ Stop frame ก่อนสร้างวิดีโอ" : "Start and stop frames are required before video generation.") : undefined}
                        onClick={() => {
                          const nextPromptDraft = withVideoPromptPlannerOptions(promptDraft);
                          handleSavePromptDraft(shot.id, nextPromptDraft);
                          onGenerateShotVideo?.(shot.id, selectedReferenceSkillId, nextPromptDraft);
                        }}
                      >
                        {busy.video ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                        {busy.video ? (isThai ? "กำลังสร้างวิดีโอ" : "Generating video") : (isThai ? "สร้างวิดีโอ" : "Generate video")}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
	                    <div className="grid gap-2">
	                      <div className="grid grid-cols-2 gap-2">
	                        {mediaPreview(shot.id, "reference", isThai ? "ภาพ reference" : "Reference image", referenceImageUrl, "image", isThai ? "ลากเฟรมมาวาง reference" : "Drop a frame here", `story-card-${shot.id}-reference-image`)}
	                        {mediaPreview(shot.id, "start", isThai ? "Start frame" : "Start frame", startFrameUrl, "image", isThai ? "ลากเฟรมมาวาง start" : "Drop start frame", `story-card-${shot.id}-start-frame`)}
	                        {mediaPreview(shot.id, "stop", isThai ? "Stop frame" : "Stop frame", stopFrameUrl, "image", isThai ? "ลากเฟรมมาวาง stop" : "Drop stop frame", `story-card-${shot.id}-stop-frame`)}
	                        {mediaPreview(shot.id, "video", isThai ? "วิดีโอช็อต" : "Shot video", videoUrl, "video", isThai ? "ลากวิดีโอมาวาง" : "Drop a video here", `story-card-${shot.id}-video`)}
	                      </div>
	                      {(storyboardGridImageUrl || storyboardGridFrames.length > 0) ? (
	                        <div className="grid gap-2 rounded-md border border-sky-200 bg-white p-2" data-testid={`story-card-${shot.id}-storyboard-grid`}>
	                          <div className="flex flex-wrap items-center justify-between gap-2">
	                            <div className="text-xs font-medium text-slate-700">
	                              {isThai ? "ภาพ Storyboard 3x3 สำหรับเลือกเฟรม" : "3x3 storyboard source"}
	                            </div>
	                            <div className="flex flex-wrap items-center gap-1">
	                              {promptDraft.storyboardGridImageResolution ? (
	                                <Badge variant="outline" className="bg-sky-50 text-[10px] text-sky-700">
	                                  {promptDraft.storyboardGridImageResolution}
	                                </Badge>
	                              ) : null}
	                              {storyboardGridImageUrl ? (
	                                <Button
	                                  type="button"
	                                  variant="outline"
	                                  size="sm"
	                                  className="h-7 px-2 text-[11px]"
	                                  onClick={() => onOpenShotStoryboardGridSplit?.(shot.id, storyboardGridImageUrl, promptDraft)}
	                                  disabled={!onOpenShotStoryboardGridSplit}
	                                >
	                                  <Split className="mr-1 h-3 w-3" />
	                                  {isThai ? "เปิดตัดภาพ" : "Open split"}
	                                </Button>
	                              ) : null}
	                            </div>
	                          </div>
	                          {storyboardGridImageUrl ? (
	                            <div className="overflow-hidden rounded border bg-slate-50">
	                              <img src={storyboardGridImageUrl} alt="" className="h-28 w-full object-contain" />
	                            </div>
	                          ) : null}
	                          {storyboardGridFrames.length > 0 ? (
	                            <div className="grid grid-cols-9 gap-1" data-testid={`story-card-${shot.id}-split-frames`}>
	                              {storyboardGridFrames.map((frame) => (
	                                <div
	                                  key={`${shot.id}-grid-frame-${frame.index}-${frame.url}`}
	                                  draggable
	                                  onDragStart={(event) => handleSplitFrameDragStart(event, shot.id, frame)}
	                                  className="relative aspect-[9/16] cursor-grab overflow-hidden rounded border bg-slate-50 active:cursor-grabbing"
	                                  title={isThai ? `ลากเฟรม ${frame.index + 1}` : `Drag frame ${frame.index + 1}`}
	                                >
	                                  <img src={frame.url} alt="" className="h-full w-full object-cover" />
	                                  <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[10px] font-semibold text-white">
	                                    {frame.index + 1}
	                                  </span>
	                                </div>
	                              ))}
	                            </div>
	                          ) : (
	                            <p className="text-[11px] leading-4 text-muted-foreground">
	                              {isThai ? "หลังสร้างภาพเสร็จ ให้กดตัด 9 เฟรม แล้วลากเฟรมที่ต้องการไปวางในช่องด้านบน" : "Generate the grid, split it into 9 frames, then drag the chosen frames into the slots above."}
	                            </p>
	                          )}
	                        </div>
	                      ) : null}
	                      <div className="grid gap-2 rounded-md border border-dashed bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-700">{isThai ? "ไฟล์อ้างอิง" : "References"}</span>
                          <Badge variant="outline" className="bg-white text-[10px]">{shotReferences.length}</Badge>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {shotReferences.slice(0, 6).map((asset) => (
                            <div key={`${shot.id}-${asset.id}`} className="h-16 w-16 shrink-0 overflow-hidden rounded border bg-white">
                              {asset.url ? (
                                asset.kind === "source_video"
                                  ? <video src={asset.url} className="h-full w-full object-contain" muted playsInline />
                                  : <img src={asset.thumbnailUrl || asset.url} alt="" className="h-full w-full object-contain" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-slate-400" />
                                </div>
                              )}
                            </div>
                          ))}
                          {shotReferences.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{isThai ? "ยังไม่มี reference" : "No references"}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`story-card-script-${shot.id}`}>{isThai ? "บท / เสียง" : "Script"}</Label>
                        <Textarea
                          id={`story-card-script-${shot.id}`}
                          value={promptDraft.script ?? ""}
                          disabled={shot.locked}
                          onChange={(event) => updateStoryboardPromptDraft(shot.id, { script: event.target.value })}
                          className="min-h-[84px] bg-white"
                        />
	                      </div>
		                      <div className="grid gap-2 sm:grid-cols-2">
		                        <div className="grid gap-1.5">
		                          <Label htmlFor={`story-card-start-prompt-${shot.id}`}>{isThai ? "Prompt Start frame" : "Start-frame prompt"}</Label>
		                          <Textarea
		                            id={`story-card-start-prompt-${shot.id}`}
		                            value={promptDraft.startFramePrompt ?? ""}
		                            disabled={shot.locked}
		                            onChange={(event) => updateStoryboardPromptDraft(shot.id, { startFramePrompt: event.target.value })}
		                            className="min-h-[120px] bg-white"
		                            placeholder={isThai ? "เฟรมเปิดของช็อตนี้ สร้างจาก Storyboard Guide + บทพูด" : "Opening frame for this shot, based on the guide and script."}
		                          />
		                        </div>
		                        <div className="grid gap-1.5">
		                          <Label htmlFor={`story-card-stop-prompt-${shot.id}`}>{isThai ? "Prompt Stop frame" : "Stop-frame prompt"}</Label>
		                          <Textarea
		                            id={`story-card-stop-prompt-${shot.id}`}
		                            value={promptDraft.stopFramePrompt ?? ""}
		                            disabled={shot.locked}
		                            onChange={(event) => updateStoryboardPromptDraft(shot.id, { stopFramePrompt: event.target.value })}
		                            className="min-h-[120px] bg-white"
		                            placeholder={isThai ? "เฟรมจบของช็อตนี้ เพื่อส่งต่อการสร้างวิดีโอ" : "Ending frame for this shot before video generation."}
		                          />
		                        </div>
		                      </div>
	                      <div className="grid gap-1.5">
                        <Label htmlFor={`story-card-video-${shot.id}`}>{isThai ? "Prompt วิดีโอ" : "Video prompt"}</Label>
                        <Textarea
                          id={`story-card-video-${shot.id}`}
                          value={promptDraft.videoPrompt ?? ""}
                          disabled={shot.locked}
                          onChange={(event) => updateStoryboardPromptDraft(shot.id, { videoPrompt: event.target.value })}
                          className="min-h-[96px] bg-white"
                        />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                            disabled={shot.locked || !onUpdateStoryboardPrompt}
                            onClick={() => onUpdateStoryboardPrompt?.(shot.id, withVideoPromptPlannerOptions(promptDraft))}
                        >
                          <Save className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "บันทึก card นี้" : "Save this card"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{isThai ? "Shot List" : "Shot List"}</div>
            <Badge variant="outline">{shots.length}</Badge>
          </div>
          {shots.length === 0 ? (
            <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">{isThai ? "ยังไม่มีช็อต" : "No shots yet."}</div>
          ) : (
            shots.map((shot) => {
              const isSelected = selectedShot?.id === shot.id;
              const shotIndex = shots.findIndex((item) => item.id === shot.id);
              return (
                <div
                  key={shot.id}
                  className={`rounded border p-3 text-left transition-colors ${isSelected ? "border-sky-300 bg-sky-50" : "bg-slate-50 hover:border-sky-200 hover:bg-sky-50/40"}`}
                  role="button"
                  tabIndex={0}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => handleSelectShot(shot.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectShot(shot.id);
                    }
                  }}
                  data-testid={`video-shot-list-item-${shot.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {shot.order}. {shot.title}
                    </span>
                    {shot.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {storyboardPrompts.find((item) => item.shotId === shot.id || item.order === shot.order)?.timeRange ?? `${shot.durationSeconds ?? 0}s`} · {shot.nodeIds.length} nodes
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={(event) => {
                      event.stopPropagation();
                      handleOpenShot(shot.id);
                    }}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "เปิด" : "Open"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={(event) => {
                      event.stopPropagation();
                      handleConfigureShot(shot.id);
                    }}>
                      <Settings2 className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "กำหนดค่า" : "Configure"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={shot.locked}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteShot?.(shot.id);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ลบ" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onReorderShot || shotIndex === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onReorderShot?.(shot.id, "up");
                      }}
                    >
                      <ChevronUp className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ย้ายขึ้น" : "Move up"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onReorderShot || shotIndex === shots.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onReorderShot?.(shot.id, "down");
                      }}
                    >
                      <ChevronDown className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ย้ายลง" : "Move down"}
                    </Button>
                    {onMergeShot ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={shotIndex === shots.length - 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          const targetShotId = shots[shotIndex + 1]?.id;
                          if (targetShotId) {
                            onMergeShot(shot.id, targetShotId);
                          }
                        }}
                      >
                        <Merge className="mr-1 h-3.5 w-3.5" />
                        {isThai ? "Merge ต่อ" : "Merge next"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div ref={fullShotEditorRef} className="space-y-4 rounded-lg border bg-white p-4" data-testid="video-shot-full-editor">
          {draft ? (
            <>
              {isDraftStale ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="video-shot-stale-warning">
                  {isThai ? "ช็อตนี้มีเวอร์ชันใหม่กว่า กรุณาโหลดล่าสุดก่อนบันทึก" : "This shot has a newer version. Reload before saving."}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_120px]">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-title">{isThai ? "ชื่อช็อต" : "Shot title"}</Label>
                  <Input ref={shotTitleInputRef} id="shot-title" value={draft.title} disabled={draft.locked} onChange={(event) => updateDraft({ title: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-duration">{isThai ? "วินาที" : "Seconds"}</Label>
                  <Input
                    id="shot-duration"
                    type="number"
                    min={0}
                    value={draft.durationSeconds ?? 0}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ durationSeconds: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-status">{isThai ? "สถานะ" : "Status"}</Label>
                  <select
                    id="shot-status"
                    value={draft.status ?? "draft"}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ status: event.target.value as ProductionShotDraft["status"] })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {["draft", "ready", "blocked", "approved", "completed"].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-type">{isThai ? "ประเภทช็อต" : "Shot type"}</Label>
                  <select
                    id="shot-type"
                    value={draft.shotType ?? "custom"}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ shotType: event.target.value as ProductionShotDraft["shotType"] })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {["hook", "problem", "proof", "demo", "transition", "cta", "broll", "interview", "custom"].map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-journey">{isThai ? "Journey stage" : "Journey stage"}</Label>
                  <Input
                    id="shot-journey"
                    value={draft.customerJourneyStage ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ customerJourneyStage: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-source-mode">{isThai ? "Source video mode" : "Source video mode"}</Label>
                  <select
                    id="shot-source-mode"
                    value={draft.sourceVideoControl?.mode ?? "reference_only"}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ sourceVideoControl: { ...(draft.sourceVideoControl ?? {}), mode: event.target.value as NonNullable<ProductionShotDraft["sourceVideoControl"]>["mode"] } })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {["reference_only", "first_frame", "last_frame", "clip_segment", "video_to_video"].map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-story-beat">{isThai ? "Story beat" : "Story beat"}</Label>
                  <Textarea
                    id="shot-story-beat"
                    value={draft.storyBeat ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ storyBeat: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-camera-intent">{isThai ? "Camera intent" : "Camera intent"}</Label>
                  <Textarea
                    id="shot-camera-intent"
                    value={draft.cameraIntent ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ cameraIntent: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-visual-intent">{isThai ? "Visual intent" : "Visual intent"}</Label>
                  <Textarea
                    id="shot-visual-intent"
                    value={draft.visualIntent ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ visualIntent: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-audio-intent">{isThai ? "Audio intent" : "Audio intent"}</Label>
                  <Textarea
                    id="shot-audio-intent"
                    value={draft.audioIntent ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ audioIntent: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="shot-script">{isThai ? "Script" : "Script"}</Label>
                <Textarea
                  id="shot-script"
                  value={draft.script ?? ""}
                  disabled={draft.locked}
                  onChange={(event) => updateDraft({ script: event.target.value })}
                  className="min-h-[120px]"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-must-show">{isThai ? "Must show" : "Must show"}</Label>
                  <Textarea
                    id="shot-must-show"
                    value={draft.mustShow.join("\n")}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ mustShow: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}
                    className="min-h-[92px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-must-avoid">{isThai ? "Must avoid" : "Must avoid"}</Label>
                  <Textarea
                    id="shot-must-avoid"
                    value={draft.mustAvoid.join("\n")}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ mustAvoid: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}
                    className="min-h-[92px]"
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <Button type="button" onClick={() => onSaveShot?.(draft)} disabled={draft.locked || isDraftStale}>
                  <Save className="mr-2 h-4 w-4" />
                  {isThai ? "Save Shot" : "Save Shot"}
                </Button>
                <Button type="button" variant="outline" onClick={() => onDuplicateShot?.(draft.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {isThai ? "Duplicate" : "Duplicate"}
                </Button>
                <Button type="button" variant="outline" onClick={() => onSplitShot?.(draft.id)} disabled={draft.locked}>
                  <Split className="mr-2 h-4 w-4" />
                  {isThai ? "Split" : "Split"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const nextLocked = !draft.locked;
                    updateDraft({ locked: nextLocked });
                    onToggleShotLock?.(draft.id, nextLocked);
                  }}
                >
                  {draft.locked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                  {draft.locked ? (isThai ? "Unlock" : "Unlock") : isThai ? "Lock" : "Lock"}
                </Button>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-white text-sky-700">
                        {selectedStoryboardPrompt?.timeRange ?? `${draft.durationSeconds ?? 0}s`}
                      </Badge>
                      <div className="text-sm font-semibold text-slate-950">{isThai ? "Storyboard prompt card ของช็อตนี้" : "Storyboard prompt card for this shot"}</div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isThai ? "ข้อมูลนี้มาจาก Storyboard prompt card หลัก และเป็นข้อมูลตั้งต้นของการสร้างภาพ/วิดีโอของช็อตนี้" : "This mirrors the main Storyboard prompt card and feeds this shot's image/video generation."}
                    </p>
	                  </div>
	                  <div className="flex flex-wrap gap-2">
	                    <Button
	                      type="button"
	                      variant="outline"
	                      size="sm"
	                      disabled={Boolean(shotGenerationState?.[draft.id]?.startFrame) || !selectedStoryboardPromptDraft || !onGenerateShotFrameImage}
	                      onClick={() => selectedStoryboardPromptDraft && onGenerateShotFrameImage?.(draft.id, "start", selectedReferenceSkillId, withVideoPromptPlannerOptions(selectedStoryboardPromptDraft))}
	                    >
	                      <ImageIcon className={`mr-1 h-3.5 w-3.5 ${shotGenerationState?.[draft.id]?.startFrame ? "animate-pulse" : ""}`} />
	                      {shotGenerationState?.[draft.id]?.startFrame ? (isThai ? "กำลังสร้าง Start" : "Generating start") : (isThai ? "สร้าง Start frame" : "Generate start")}
	                    </Button>
	                    <Button
	                      type="button"
	                      variant="outline"
	                      size="sm"
	                      disabled={Boolean(shotGenerationState?.[draft.id]?.stopFrame) || !selectedStoryboardPromptDraft || !onGenerateShotFrameImage}
	                      onClick={() => selectedStoryboardPromptDraft && onGenerateShotFrameImage?.(draft.id, "stop", selectedReferenceSkillId, withVideoPromptPlannerOptions(selectedStoryboardPromptDraft))}
	                    >
	                      <ImageIcon className={`mr-1 h-3.5 w-3.5 ${shotGenerationState?.[draft.id]?.stopFrame ? "animate-pulse" : ""}`} />
	                      {shotGenerationState?.[draft.id]?.stopFrame ? (isThai ? "กำลังสร้าง Stop" : "Generating stop") : (isThai ? "สร้าง Stop frame" : "Generate stop")}
	                    </Button>
	                    <Button
                      type="button"
                      variant="outline"
                        size="sm"
                        disabled={Boolean(shotGenerationState?.[draft.id]?.video) || !selectedStoryboardPromptDraft || !onGenerateShotVideo || !selectedHasStartStopFrames}
                        title={!selectedHasStartStopFrames ? (isThai ? "ต้องมี Start frame และ Stop frame ก่อนสร้างวิดีโอ" : "Start and stop frames are required before video generation.") : undefined}
                        onClick={() => selectedStoryboardPromptDraft && onGenerateShotVideo?.(draft.id, selectedReferenceSkillId, withVideoPromptPlannerOptions(selectedStoryboardPromptDraft))}
                    >
                      {shotGenerationState?.[draft.id]?.video ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      {shotGenerationState?.[draft.id]?.video ? (isThai ? "กำลังสร้างวิดีโอ" : "Generating video") : (isThai ? "สร้างวิดีโอ" : "Generate video")}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="storyboard-shot-script">{isThai ? "บท / เสียงใน card" : "Card script"}</Label>
                    <Textarea
                      id="storyboard-shot-script"
                      value={selectedStoryboardPromptDraft?.script ?? ""}
                      disabled={draft.locked}
                      onChange={(event) => updateStoryboardPromptDraft(draft.id, { script: event.target.value })}
                      className="min-h-[140px] bg-white"
                    />
                  </div>
	                  <div className="grid gap-1.5">
	                    <Label htmlFor="storyboard-start-frame-prompt">{isThai ? "Prompt Start frame" : "Start-frame prompt"}</Label>
	                    <Textarea
	                      id="storyboard-start-frame-prompt"
	                      value={selectedStoryboardPromptDraft?.startFramePrompt ?? ""}
	                      disabled={draft.locked}
	                      onChange={(event) => updateStoryboardPromptDraft(draft.id, { startFramePrompt: event.target.value })}
	                      className="min-h-[140px] bg-white"
	                      placeholder={isThai ? "ภาพเปิดของช็อตนี้แบบเต็ม resolution ไม่ใช่ 3x3" : "Full-resolution opening frame for this shot, not a 3x3 grid."}
	                    />
	                  </div>
	                  <div className="grid gap-1.5">
	                    <Label htmlFor="storyboard-stop-frame-prompt">{isThai ? "Prompt Stop frame" : "Stop-frame prompt"}</Label>
	                    <Textarea
	                      id="storyboard-stop-frame-prompt"
	                      value={selectedStoryboardPromptDraft?.stopFramePrompt ?? ""}
	                      disabled={draft.locked}
	                      onChange={(event) => updateStoryboardPromptDraft(draft.id, { stopFramePrompt: event.target.value })}
	                      className="min-h-[140px] bg-white"
	                      placeholder={isThai ? "ภาพจบของช็อตนี้แบบเต็ม resolution เพื่อใช้ส่งต่อสร้างวิดีโอ" : "Full-resolution ending frame for this shot before video generation."}
	                    />
	                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="storyboard-video-prompt">{isThai ? "Prompt วิดีโอ" : "Video prompt"}</Label>
                    <Textarea
                      id="storyboard-video-prompt"
                      value={selectedStoryboardPromptDraft?.videoPrompt ?? ""}
                      disabled={draft.locked}
                      onChange={(event) => updateStoryboardPromptDraft(draft.id, { videoPrompt: event.target.value })}
                      className="min-h-[140px] bg-white"
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {isThai ? "แก้แล้วกดบันทึก เพื่อให้ card หลักและ Video Shot ใช้ข้อมูลชุดเดียวกัน" : "Save changes so the main card and Video Shot stay aligned."}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={draft.locked || !selectedStoryboardPromptDraft || !onUpdateStoryboardPrompt}
                    onClick={() => selectedStoryboardPromptDraft && onUpdateStoryboardPrompt?.(draft.id, selectedStoryboardPromptDraft)}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" />
                    {isThai ? "บันทึก prompt card" : "Save card prompt"}
                  </Button>
                </div>
              </div>
              <div className="rounded border border-dashed bg-slate-50 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-medium">{isThai ? "ภาพ/ไฟล์อ้างอิงที่แนบกับช็อตนี้" : "Shot references"}</div>
                  <Badge variant="outline" className="bg-white text-xs">{shotReferenceAssets.length}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {shotReferenceAssets.length ? (
                    shotReferenceAssets.map((asset) => (
                      <div key={asset.id} className="min-w-0 rounded-md border bg-white p-2">
                        <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-slate-50">
                          {asset.url ? (
                            asset.kind === "source_video"
                              ? <video src={asset.url} className="h-full w-full object-contain" muted playsInline />
                              : <img src={asset.thumbnailUrl || asset.url} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="mt-2 truncate text-xs font-medium text-slate-800">{asset.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{asset.kind.replace(/_/g, " ")}</div>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {isThai ? "ยังไม่มีไฟล์อ้างอิงสำหรับช็อตนี้" : "No references are attached to this shot yet."}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">{isThai ? "เลือกช็อตเพื่อแก้ไข" : "Select a shot to edit."}</div>
          )}

          <div className="grid gap-2">
            <div className="text-sm font-semibold">{isThai ? "Child Nodes" : "Child Nodes"}</div>
            {childNodes.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">{isThai ? "ยังไม่มี child nodes" : "No child nodes for this shot."}</div>
            ) : (
              childNodes.map((node) => (
                <div key={node.id} className="rounded border bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{node.title}</span>
                    <Badge variant="outline" className={nodeStatusTone(node.status)}>
                      {node.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{node.kind}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
