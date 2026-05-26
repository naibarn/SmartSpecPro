import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
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
import type { ProductionFlowNode, ProductionNodeOutputRef, ProductionSpace } from "@shared/mediaProduction";
import { shotToDraft, type ProductionLocale, type ProductionShotDraft, type VideoShotWorkspaceCallbacks } from "./types";

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
  onGenerateShotReferencePrompt?: (shotId: string, skillId: string) => void;
  onGenerateShotReferenceImage?: (shotId: string, skillId: string, prompt?: StoryboardPromptItem) => void;
  onGenerateShotFrameImage?: (shotId: string, phase: "start" | "stop", skillId: string, prompt?: StoryboardPromptItem) => void;
  onGenerateShotVideo?: (shotId: string, skillId: string, prompt?: StoryboardPromptItem) => void;
}

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
  buildMode?: string;
};

type ProductionShotGenerationAction = "referencePrompt" | "referenceImage" | "startFrame" | "stopFrame" | "video";

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
  onGenerateShotReferenceImage,
  onGenerateShotFrameImage,
  onGenerateShotVideo,
}: VideoShotWorkspaceProps) {
  const isThai = locale === "th";
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
    const visualAssets = space.contextAssets.filter((asset) => (
      asset.url
      && ["reference_image", "product_image", "marketplace_product", "character_asset", "generated_media", "source_video"].includes(asset.kind)
    ));
    for (const shot of shots) {
      const shotProductIds = new Set(shot.productAssetIds ?? []);
      const productAssets = space.contextAssets.filter((asset) => {
        if (shotProductIds.has(asset.id)) return true;
        const productId = String((asset.provenance as any)?.productTruth?.productId ?? (asset.provenance as any)?.marketplaceProduct?.productId ?? "");
        return productId && shotProductIds.has(productId);
      });
      result[shot.id] = [...productAssets, ...visualAssets.filter((asset) => !productAssets.some((product) => product.id === asset.id))].slice(0, 12);
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
  const updateStoryboardPromptDraft = (shotId: string, patch: Partial<StoryboardPromptItem>) => {
    setStoryboardPromptDrafts((current) => ({
      ...current,
      [shotId]: { ...(current[shotId] ?? {}), shotId, ...patch },
    }));
  };
  const selectedStoryboardPromptDraft = draft ? storyboardPromptDrafts[draft.id] ?? selectedStoryboardPrompt : null;
  const isDraftStale = Boolean(draft && selectedShot?.version !== undefined && draft.version !== undefined && draft.version < selectedShot.version);
  const referenceSkillOptions = storyboardReferenceSkillOptions?.length
    ? storyboardReferenceSkillOptions
    : [
      { id: "furniture-reference-storyboard", label: "Furniture Reference Storyboard" },
      { id: "cosmatic-reference-storyboard", label: "Cosmatic Reference Storyboard" },
    ];
  const selectedReferenceSkillId = storyboardReferenceSkillId || referenceSkillOptions[0]?.id || "furniture-reference-storyboard";

  const handleOpenShot = (shotId: string) => {
    onOpenShot?.(shotId);
    onSelectShot?.(shotId);
  };

  const handleConfigureShot = (shotId: string) => {
    onConfigureShot?.(shotId);
    onSelectShot?.(shotId);
  };

  const handleSavePromptDraft = (shotId: string, promptDraft: StoryboardPromptItem) => {
    onUpdateStoryboardPrompt?.(shotId, promptDraft);
  };

  const mediaPreview = (
    label: string,
    url: string | undefined,
    kind: "image" | "video",
    emptyLabel: string,
    testId: string,
  ) => (
    <div className="overflow-hidden rounded-md border bg-slate-50" data-testid={testId}>
      <div className="flex aspect-[9/12] items-center justify-center">
        {url ? (
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
            <Button type="button" variant="outline" onClick={() => selectedShot && handleOpenShot(selectedShot.id)} disabled={!selectedShot}>
              <Maximize2 className="mr-2 h-4 w-4" />
              {isThai ? "เปิดช็อตที่เลือก" : "Open selected shot"}
            </Button>
          </div>
          <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] md:items-center">
            <div className="grid gap-1">
              <Label htmlFor="video-shot-reference-storyboard-skill">
                {isThai ? "Skill สำหรับ prompt ภาพ start/stop" : "Start/stop frame prompt skill"}
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
                ? "ระบบจะส่ง Storyboard guide ของแต่ละวิดีโอเข้า skill นี้ เพื่อสร้าง prompt ภาพที่สอดคล้องกับช็อต แล้วใช้ภาพ stop frame เป็น start frame ของช็อตถัดไป"
                : "Each shot sends its Storyboard guide into this skill. The generated stop frame can chain into the next shot as its start frame."}
            </p>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {shots.map((shot) => {
              const promptDraft = getStoryboardPromptDraft(shot);
              const mediaSummary = shotMediaById[shot.id] ?? { imageNodes: [], videoNodes: [] };
              const referenceImageOutput = mediaSummary.referenceImageOutput ?? shotOutputFromPrompt(promptDraft, "reference");
              const startFrameOutput = mediaSummary.startFrameOutput ?? shotOutputFromPrompt(promptDraft, "start");
              const stopFrameOutput = mediaSummary.stopFrameOutput ?? shotOutputFromPrompt(promptDraft, "stop");
              const videoOutput = mediaSummary.videoOutput ?? shotOutputFromPrompt(promptDraft, "video");
              const referenceImageUrl = outputUrl(referenceImageOutput);
              const startFrameUrl = outputUrl(startFrameOutput);
              const stopFrameUrl = outputUrl(stopFrameOutput);
              const videoUrl = outputUrl(videoOutput);
              const shotReferences = shotReferenceAssetsById[shot.id] ?? [];
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
                          handleSavePromptDraft(shot.id, promptDraft);
                          onGenerateShotReferencePrompt?.(shot.id, selectedReferenceSkillId);
                        }}
                      >
                        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy.referencePrompt ? "animate-spin" : ""}`} />
                        {busy.referencePrompt ? (isThai ? "กำลังสร้าง prompt" : "Prompting") : (isThai ? "สร้าง prompt จาก skill" : "Skill prompt")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy.referenceImage) || !onGenerateShotReferenceImage}
                        onClick={() => {
                          handleSavePromptDraft(shot.id, promptDraft);
                          onGenerateShotReferenceImage?.(shot.id, selectedReferenceSkillId, promptDraft);
                        }}
                      >
                        <ImageIcon className={`mr-1 h-3.5 w-3.5 ${busy.referenceImage ? "animate-pulse" : ""}`} />
                        {busy.referenceImage ? (isThai ? "กำลังสร้าง reference" : "Reference image") : (isThai ? "สร้างภาพ reference" : "Reference image")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy.startFrame) || !onGenerateShotFrameImage}
                        onClick={() => {
                          handleSavePromptDraft(shot.id, promptDraft);
                          onGenerateShotFrameImage?.(shot.id, "start", selectedReferenceSkillId, promptDraft);
                        }}
                      >
                        <ImageIcon className={`mr-1 h-3.5 w-3.5 ${busy.startFrame ? "animate-pulse" : ""}`} />
                        {busy.startFrame ? (isThai ? "กำลังสร้าง Start" : "Start frame") : (isThai ? "สร้าง Start" : "Start frame")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy.stopFrame) || !onGenerateShotFrameImage}
                        onClick={() => {
                          handleSavePromptDraft(shot.id, promptDraft);
                          onGenerateShotFrameImage?.(shot.id, "stop", selectedReferenceSkillId, promptDraft);
                        }}
                      >
                        <ImageIcon className={`mr-1 h-3.5 w-3.5 ${busy.stopFrame ? "animate-pulse" : ""}`} />
                        {busy.stopFrame ? (isThai ? "กำลังสร้าง Stop" : "Stop frame") : (isThai ? "สร้าง Stop" : "Stop frame")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy.video) || !onGenerateShotVideo}
                        onClick={() => {
                          handleSavePromptDraft(shot.id, promptDraft);
                          onGenerateShotVideo?.(shot.id, selectedReferenceSkillId, promptDraft);
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
                        {mediaPreview(isThai ? "ภาพ reference" : "Reference image", referenceImageUrl, "image", isThai ? "ยังไม่มี reference" : "No reference yet", `story-card-${shot.id}-reference-image`)}
                        {mediaPreview(isThai ? "Start frame" : "Start frame", startFrameUrl, "image", isThai ? "ยังไม่มี start frame" : "No start frame", `story-card-${shot.id}-start-frame`)}
                        {mediaPreview(isThai ? "Stop frame" : "Stop frame", stopFrameUrl, "image", isThai ? "ยังไม่มี stop frame" : "No stop frame", `story-card-${shot.id}-stop-frame`)}
                        {mediaPreview(isThai ? "วิดีโอช็อต" : "Shot video", videoUrl, "video", isThai ? "ยังไม่มีวิดีโอ" : "No video yet", `story-card-${shot.id}-video`)}
                      </div>
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
                      <div className="grid gap-1.5">
                        <Label htmlFor={`story-card-reference-prompt-${shot.id}`}>{isThai ? "Prompt จาก reference skill" : "Reference skill prompt"}</Label>
                        <Textarea
                          id={`story-card-reference-prompt-${shot.id}`}
                          value={promptDraft.referenceStoryboardPrompt ?? ""}
                          disabled={shot.locked}
                          onChange={(event) => updateStoryboardPromptDraft(shot.id, { referenceStoryboardPrompt: event.target.value })}
                          className="min-h-[96px] bg-white"
                          placeholder={isThai ? "กดสร้าง prompt จาก skill เพื่อเติมตรงนี้" : "Generate a skill prompt to fill this field"}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label htmlFor={`story-card-start-frame-${shot.id}`}>{isThai ? "Start frame prompt" : "Start frame prompt"}</Label>
                          <Textarea
                            id={`story-card-start-frame-${shot.id}`}
                            value={promptDraft.startFramePrompt ?? ""}
                            disabled={shot.locked}
                            onChange={(event) => updateStoryboardPromptDraft(shot.id, { startFramePrompt: event.target.value })}
                            className="min-h-[84px] bg-white"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor={`story-card-stop-frame-${shot.id}`}>{isThai ? "Stop frame prompt" : "Stop frame prompt"}</Label>
                          <Textarea
                            id={`story-card-stop-frame-${shot.id}`}
                            value={promptDraft.stopFramePrompt ?? ""}
                            disabled={shot.locked}
                            onChange={(event) => updateStoryboardPromptDraft(shot.id, { stopFramePrompt: event.target.value })}
                            className="min-h-[84px] bg-white"
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
                          onClick={() => onUpdateStoryboardPrompt?.(shot.id, promptDraft)}
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
                  className={`rounded border p-3 ${isSelected ? "border-sky-300 bg-sky-50" : "bg-slate-50"}`}
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
                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenShot(shot.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "เปิด" : "Open"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleConfigureShot(shot.id)}>
                      <Settings2 className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "กำหนดค่า" : "Configure"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={shot.locked}
                      onClick={() => onDeleteShot?.(shot.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ลบ" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onReorderShot || shotIndex === 0}
                      onClick={() => onReorderShot?.(shot.id, "up")}
                    >
                      <ChevronUp className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ย้ายขึ้น" : "Move up"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onReorderShot || shotIndex === shots.length - 1}
                      onClick={() => onReorderShot?.(shot.id, "down")}
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
                        onClick={() => {
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

        <div className="space-y-4 rounded-lg border bg-white p-4">
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
                  <Input id="shot-title" value={draft.title} disabled={draft.locked} onChange={(event) => updateDraft({ title: event.target.value })} />
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
                      disabled={Boolean(shotGenerationState?.[draft.id]?.referenceImage) || !selectedStoryboardPromptDraft || !onGenerateShotReferenceImage}
                      onClick={() => selectedStoryboardPromptDraft && onGenerateShotReferenceImage?.(draft.id, selectedReferenceSkillId, selectedStoryboardPromptDraft)}
                    >
                      <ImageIcon className={`mr-1 h-3.5 w-3.5 ${shotGenerationState?.[draft.id]?.referenceImage ? "animate-pulse" : ""}`} />
                      {shotGenerationState?.[draft.id]?.referenceImage ? (isThai ? "กำลังสร้าง reference" : "Reference image") : (isThai ? "สร้างภาพ reference" : "Reference image")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(shotGenerationState?.[draft.id]?.startFrame) || !selectedStoryboardPromptDraft || !onGenerateShotFrameImage}
                      onClick={() => selectedStoryboardPromptDraft && onGenerateShotFrameImage?.(draft.id, "start", selectedReferenceSkillId, selectedStoryboardPromptDraft)}
                    >
                      <ImageIcon className={`mr-1 h-3.5 w-3.5 ${shotGenerationState?.[draft.id]?.startFrame ? "animate-pulse" : ""}`} />
                      {shotGenerationState?.[draft.id]?.startFrame ? (isThai ? "กำลังสร้าง Start" : "Start frame") : (isThai ? "สร้าง Start" : "Start frame")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(shotGenerationState?.[draft.id]?.stopFrame) || !selectedStoryboardPromptDraft || !onGenerateShotFrameImage}
                      onClick={() => selectedStoryboardPromptDraft && onGenerateShotFrameImage?.(draft.id, "stop", selectedReferenceSkillId, selectedStoryboardPromptDraft)}
                    >
                      <ImageIcon className={`mr-1 h-3.5 w-3.5 ${shotGenerationState?.[draft.id]?.stopFrame ? "animate-pulse" : ""}`} />
                      {shotGenerationState?.[draft.id]?.stopFrame ? (isThai ? "กำลังสร้าง Stop" : "Stop frame") : (isThai ? "สร้าง Stop" : "Stop frame")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(shotGenerationState?.[draft.id]?.video) || !selectedStoryboardPromptDraft || !onGenerateShotVideo}
                      onClick={() => selectedStoryboardPromptDraft && onGenerateShotVideo?.(draft.id, selectedReferenceSkillId, selectedStoryboardPromptDraft)}
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
