import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  HardDrive,
  History,
  Image as ImageIcon,
  Library,
  Upload,
} from "lucide-react";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";

import { trpc } from "@/lib/trpc";
import { safeStorageGet, safeStorageSet } from "@/lib/safeLocalStorage";
import {
  type VideoStudioTimelineAsset,
  writeVideoStudioAssetDragData,
} from "./VideoStudioAssetPicker";
import {
  pickCopy,
  videoStudioCopy,
  type VideoStudioLang,
} from "./videoStudioCopy";

type DockTab = "library" | "history" | "computer";
type AssetDockMode = "dock" | "broll";

const BROLL_IMAGE_MODEL_PREFERENCE_KEY = "video-studio:broll:image-model";
const BROLL_VIDEO_MODEL_PREFERENCE_KEY = "video-studio:broll:video-model";

export interface VideoStudioAssetDockProps {
  lang: VideoStudioLang;
  projectId: number;
  document: import("@shared/videoIntelligence/projectSchemas").VideoProjectDocument;
  onLocalFile?: (file: File) => void;
  onInsertAsset?: (asset: VideoStudioTimelineAsset) => void;
  onInsertAssetAt?: (
    asset: VideoStudioTimelineAsset,
    startMs: number,
    durationMs: number
  ) => void;
  onAssetSelect?: (asset: VideoStudioTimelineAsset) => void;
  selectedAsset?: VideoStudioTimelineAsset | null;
  className?: string;
  mode?: AssetDockMode;
  initialSceneId?: string;
  initialSourceImageUrl?: string | null;
  hideAssetSources?: boolean;
  onImageModelChange?: (modelId: string) => void;
}

type HistoryTask = {
  id?: string | number;
  taskId?: string | number;
  mediaType?: string;
  status?: string;
  resultUrl?: string;
  result_url?: string;
  resultData?: unknown;
  result_data?: unknown;
  prompt?: string;
  model?: string;
};

export function findUrl(
  value: unknown,
  seen = new Set<unknown>()
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^(https?:\/\/|\/uploads\/|\/api\/storage\/)/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return findUrl(JSON.parse(trimmed), seen);
      } catch {
        // Some providers return a non-JSON string in resultJson. Continue
        // without treating it as a media URL.
      }
    }
    return null;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findUrl(item, seen);
      if (url) return url;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "url",
    "sourceUrl",
    "source_url",
    "resultUrl",
    "result_url",
    "resultData",
    "result_data",
    "imageUrl",
    "image_url",
    "videoUrl",
    "video_url",
    "audioUrl",
    "audio_url",
    "outputUrl",
    "output_url",
    "outputUrls",
    "output_urls",
    "output",
    "result",
    "data",
    "response",
    "resultJson",
  ]) {
    const url = findUrl(record[key], seen);
    if (url) return url;
  }
  // Keep the same fallback traversal as Media Studio for provider-specific
  // wrappers such as taskResult or files.
  for (const nested of Object.values(record)) {
    const url = findUrl(nested, seen);
    if (url) return url;
  }
  return null;
}

type MediaDimensions = { width: number; height: number };

function readMediaDimensions(
  value: unknown,
  seen = new Set<unknown>()
): MediaDimensions | null {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const dimensions = readMediaDimensions(item, seen);
      if (dimensions) return dimensions;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const width = [record.width, record.videoWidth, record.actual_width].find(
    item => typeof item === "number" && item > 0
  );
  const height = [record.height, record.videoHeight, record.actual_height].find(
    item => typeof item === "number" && item > 0
  );
  if (typeof width === "number" && typeof height === "number") {
    return { width, height };
  }

  for (const key of ["resolution", "actual_resolution", "dimensions"]) {
    const raw = record[key];
    if (typeof raw !== "string") continue;
    const match = raw.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
    if (match) {
      return { width: Number(match[1]), height: Number(match[2]) };
    }
  }

  for (const nested of Object.values(record)) {
    const dimensions = readMediaDimensions(nested, seen);
    if (dimensions) return dimensions;
  }
  return null;
}

function historyAssetFromTask(raw: unknown): VideoStudioTimelineAsset | null {
  const task = raw as HistoryTask;
  if (
    task.status !== "completed" ||
    (task.mediaType !== "image" && task.mediaType !== "video")
  ) {
    return null;
  }
  const url =
    findUrl(task.resultUrl) ??
    findUrl(task.result_url) ??
    findUrl(task.resultData) ??
    findUrl(task.result_data);
  if (!url) return null;
  const dimensions = readMediaDimensions(task.resultData ?? task.result_data);
  return {
    assetId: `history-${task.id ?? task.taskId ?? url}`,
    storageUrl: url,
    sha256: "",
    kind: task.mediaType,
    thumbnailUrl: task.mediaType === "image" ? url : undefined,
    ...dimensions,
  } satisfies VideoStudioTimelineAsset;
}

function historyAssets(tasks: unknown): VideoStudioTimelineAsset[] {
  if (!Array.isArray(tasks)) return [];
  const seen = new Set<string>();
  return tasks.flatMap(raw => {
    const asset = historyAssetFromTask(raw);
    if (!asset || seen.has(asset.storageUrl)) return [];
    seen.add(asset.storageUrl);
    return [asset];
  });
}

function findHistoryAssetForTask(
  tasks: unknown,
  taskId: string,
  kind: "image" | "video"
): VideoStudioTimelineAsset | null {
  if (!Array.isArray(tasks)) return null;
  const normalizedTaskId = String(taskId);
  for (const raw of tasks) {
    const task = raw as HistoryTask;
    if (
      task.mediaType !== kind ||
      ![task.id, task.taskId]
        .filter(value => value !== undefined && value !== null)
        .some(value => String(value) === normalizedTaskId)
    ) {
      continue;
    }
    const asset = historyAssetFromTask(task);
    if (asset) return asset;
  }
  return null;
}

function HistoryAssetCard({
  asset,
  onDragStart,
  onSelect,
  onInsert,
  insertLabel,
}: {
  asset: VideoStudioTimelineAsset;
  onDragStart: (
    asset: VideoStudioTimelineAsset,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  onSelect?: (asset: VideoStudioTimelineAsset) => void;
  onInsert?: (asset: VideoStudioTimelineAsset) => void;
  insertLabel?: string;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(() =>
    asset.width && asset.height ? asset.width / asset.height : null
  );

  useEffect(() => {
    setVideoFailed(false);
    setAspectRatio(
      asset.width && asset.height ? asset.width / asset.height : null
    );
  }, [asset.assetId, asset.height, asset.width]);

  function updateAspectRatio(width: number, height: number) {
    if (width > 0 && height > 0) setAspectRatio(width / height);
  }

  return (
    <Card padding={1} className="self-start">
      <button
        type="button"
        draggable
        className="group relative block w-full overflow-hidden rounded-md border border-border/60 bg-muted/30 text-left transition hover:border-primary/60 hover:ring-2 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ aspectRatio: aspectRatio ?? 16 / 9 }}
        onDragStart={event => onDragStart(asset, event)}
        onClick={() => onSelect?.(asset)}
        data-testid="video-studio-history-asset"
        aria-label={asset.kind === "image" ? "สื่อภาพ" : "สื่อวิดีโอ"}
      >
        {asset.kind === "image" ? (
          <img
            src={asset.thumbnailUrl ?? asset.storageUrl}
            alt=""
            className="h-full w-full object-contain"
            onLoad={event =>
              updateAspectRatio(
                event.currentTarget.naturalWidth,
                event.currentTarget.naturalHeight
              )
            }
          />
        ) : videoFailed ? (
          <span className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            วิดีโอ
          </span>
        ) : (
          <video
            src={asset.storageUrl}
            poster={asset.thumbnailUrl}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            className="h-full w-full bg-muted object-contain"
            aria-label="วิดีโอ"
            onError={() => setVideoFailed(true)}
            onLoadedMetadata={event =>
              updateAspectRatio(
                event.currentTarget.videoWidth,
                event.currentTarget.videoHeight
              )
            }
          />
        )}
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {asset.kind === "image" ? "ภาพ" : "วิดีโอ"}
        </span>
      </button>
      {onInsert ? (
        <Button
          variant="ghost"
          size="sm"
          label={insertLabel ?? "ใส่ B-roll"}
          onClick={() => onInsert(asset)}
          className="mt-1 w-full"
        />
      ) : null}
    </Card>
  );
}

function LibraryAssetCard({
  asset,
  onDragStart,
  onSelect,
}: {
  asset: VideoStudioTimelineAsset;
  onDragStart: (
    asset: VideoStudioTimelineAsset,
    event: DragEvent<HTMLButtonElement>
  ) => void;
  onSelect?: (asset: VideoStudioTimelineAsset) => void;
}) {
  return (
    <HistoryAssetCard
      asset={asset}
      onDragStart={onDragStart}
      onSelect={onSelect}
    />
  );
}

function readTaskString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim())
      return record[key].trim();
    if (typeof record[key] === "number") return String(record[key]);
  }
  return null;
}

export function VideoStudioAssetDock({
  lang,
  projectId,
  document,
  onLocalFile,
  onInsertAsset,
  onInsertAssetAt,
  onAssetSelect,
  selectedAsset,
  className,
  mode = "dock",
  initialSceneId,
  initialSourceImageUrl,
  hideAssetSources = false,
  onImageModelChange,
}: VideoStudioAssetDockProps) {
  const isBrollMode = mode === "broll";
  const [tab, setTab] = useState<DockTab>("library");
  const inputRef = useRef<HTMLInputElement>(null);
  const libraryQuery = trpc.library.listDocuments.useQuery({
    scope: "my_library",
    sort: "updated_desc",
    limit: 50,
    offset: 0,
    filters: { status: "ready" },
  });
  const historyQuery = trpc.media.listTasks.useQuery({
    limit: 50,
    status: "completed",
    daysAgo: 30,
  });
  const imageModelQuery =
    trpc.mediaModels.listRecommendedImageModels.useQuery();
  const videoModelQuery =
    trpc.mediaModels.listRecommendedVideoModels.useQuery();
  const imageModels = imageModelQuery.data?.models ?? [];
  const videoModels = videoModelQuery.data?.models ?? [];
  const defaultImageModel = useMemo(
    () =>
      imageModels.find(model => model.isDefault)?.modelId ??
      imageModels[0]?.modelId ??
      "",
    [imageModels]
  );
  const defaultVideoModel = useMemo(
    () =>
      videoModels.find(model => model.isDefault)?.modelId ??
      videoModels[0]?.modelId ??
      "",
    [videoModels]
  );
  const [selectedImageModel, setSelectedImageModel] = useState(
    () => safeStorageGet(BROLL_IMAGE_MODEL_PREFERENCE_KEY) ?? ""
  );
  const [selectedVideoModel, setSelectedVideoModel] = useState(
    () => safeStorageGet(BROLL_VIDEO_MODEL_PREFERENCE_KEY) ?? ""
  );
  const [brollKind, setBrollKind] = useState<"image" | "video">("image");
  const [sceneId, setSceneId] = useState(
    initialSceneId ?? document.scenes[0]?.sceneId ?? ""
  );
  useEffect(() => {
    if (initialSceneId) setSceneId(initialSceneId);
  }, [initialSceneId]);
  const [brollInstructions, setBrollInstructions] = useState("");
  const [promptDraft, setPromptDraft] = useState<{
    kind: "image" | "video";
    sceneId: string;
    prompt: string;
    negativePrompt: string;
    shotSummary: string;
    motionDirection: string;
    suggestedDurationSeconds: number;
  } | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(
    initialSourceImageUrl ?? null
  );
  useEffect(() => {
    if (initialSourceImageUrl) setSourceImageUrl(initialSourceImageUrl);
  }, [initialSourceImageUrl]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskKind, setActiveTaskKind] = useState<
    "image" | "video" | null
  >(null);
  const [activeTaskError, setActiveTaskError] = useState<string | null>(null);
  const [lastGeneratedAsset, setLastGeneratedAsset] =
    useState<VideoStudioTimelineAsset | null>(null);
  const [lastGeneratedAssetInserted, setLastGeneratedAssetInserted] =
    useState(false);
  const effectiveImageModel = imageModels.some(
    model => model.modelId === selectedImageModel
  )
    ? selectedImageModel
    : defaultImageModel;
  const effectiveVideoModel = videoModels.some(
    model => model.modelId === selectedVideoModel
  )
    ? selectedVideoModel
    : defaultVideoModel;
  const selectedScene = document.scenes.find(
    scene => scene.sceneId === sceneId
  );
  const promptDraftMutation =
    trpc.videoProjects.createBrollPromptDraft.useMutation({
      onSuccess: result => setPromptDraft(result.draft),
    });
  const generateImageMutation = trpc.media.generateImageAsync.useMutation({
    onSuccess: task => {
      const taskId = readTaskString(task, ["taskId", "task_id", "id"]);
      setActiveTaskKind("image");
      setActiveTaskId(taskId);
      setActiveTaskError(
        taskId ? null : "ระบบไม่พบรหัสงานสร้างภาพ กรุณาลองใหม่"
      );
      setLastGeneratedAsset(null);
      setLastGeneratedAssetInserted(false);
    },
  });
  const generateVideoMutation = trpc.media.generateVideoAsync.useMutation({
    onSuccess: task => {
      const taskId = readTaskString(task, ["taskId", "task_id", "id"]);
      setActiveTaskKind("video");
      setActiveTaskId(taskId);
      setActiveTaskError(
        taskId ? null : "ระบบไม่พบรหัสงานสร้างวิดีโอ กรุณาลองใหม่"
      );
      setLastGeneratedAsset(null);
      setLastGeneratedAssetInserted(false);
    },
  });
  const taskQuery = trpc.media.getTask.useQuery(
    { taskId: activeTaskId ?? "" },
    {
      enabled: Boolean(activeTaskId),
      refetchInterval: activeTaskId ? 3000 : false,
    }
  );
  const recentAssets = useMemo(
    () => historyAssets(historyQuery.data?.tasks),
    [historyQuery.data?.tasks]
  );
  const libraryAssets = useMemo<VideoStudioTimelineAsset[]>(() => {
    const results = libraryQuery.data?.results ?? [];
    return results.flatMap(item => {
      const kind =
        item.item_type === "image" || item.item_type === "video"
          ? item.item_type
          : null;
      const url = item.source_url ?? "";
      if (!kind || !url) return [];
      const dimensions = readMediaDimensions(item.metadata);
      return [
        {
          assetId: item.id,
          storageUrl: url,
          sha256: "",
          kind,
          thumbnailUrl:
            typeof item.thumbnail_url === "string"
              ? item.thumbnail_url
              : kind === "image"
                ? url
                : undefined,
          ...dimensions,
        } satisfies VideoStudioTimelineAsset,
      ];
    });
  }, [libraryQuery.data?.results]);

  function selectModel(modelId: string) {
    setSelectedImageModel(modelId);
    safeStorageSet(BROLL_IMAGE_MODEL_PREFERENCE_KEY, modelId);
    onImageModelChange?.(modelId);
  }

  function selectVideoModel(modelId: string) {
    setSelectedVideoModel(modelId);
    safeStorageSet(BROLL_VIDEO_MODEL_PREFERENCE_KEY, modelId);
  }

  useEffect(() => {
    let cancelled = false;

    async function resolveCompletedTask() {
      const status = readTaskString(taskQuery.data, ["status"]);
      if (!activeTaskId || !activeTaskKind) return;
      if (status === "failed" || status === "cancelled") {
        setActiveTaskError(
          readTaskString(taskQuery.data, [
            "errorMessage",
            "error",
            "message",
          ]) ?? "การสร้างสื่อไม่สำเร็จ กรุณาลองใหม่"
        );
        setActiveTaskId(null);
        setActiveTaskKind(null);
        return;
      }
      if (status !== "completed") return;

      let asset: VideoStudioTimelineAsset | null = null;
      const url = findUrl(taskQuery.data);
      if (url) {
        asset = {
          assetId: `generated-${activeTaskId}`,
          storageUrl: url,
          sha256: "",
          kind: activeTaskKind,
          thumbnailUrl: activeTaskKind === "image" ? url : undefined,
        };
      } else {
        // Some task transports expose completed status before the direct task
        // response contains resultUrl. History derives the URL from resultData,
        // so use the same completed task as a safe fallback instead of clearing
        // the poller and silently losing the generated asset.
        const historyResult = await historyQuery.refetch();
        if (cancelled) return;
        asset = findHistoryAssetForTask(
          historyResult.data?.tasks,
          activeTaskId,
          activeTaskKind
        );
      }

      // Keep polling if completion is visible but the output URL is not yet
      // available from either source. This is the exact state that previously
      // made Media History show an image while the B-roll slot stayed empty.
      if (!asset) return;

      setLastGeneratedAsset(asset);
      if (activeTaskKind === "image") setSourceImageUrl(asset.storageUrl);
      if (isBrollMode && onInsertAssetAt && selectedScene) {
        const durationMs = Math.min(
          selectedScene.endMs - selectedScene.startMs,
          Math.max(1000, (promptDraft?.suggestedDurationSeconds ?? 3) * 1000)
        );
        onInsertAssetAt(asset, selectedScene.startMs, durationMs);
        setLastGeneratedAssetInserted(true);
      }
      setActiveTaskId(null);
      setActiveTaskKind(null);
      void historyQuery.refetch();
      if (!isBrollMode) setTab("history");
    }

    void resolveCompletedTask();
    return () => {
      cancelled = true;
    };
  }, [
    activeTaskId,
    activeTaskKind,
    historyQuery.refetch,
    isBrollMode,
    onInsertAssetAt,
    promptDraft?.suggestedDurationSeconds,
    selectedScene,
    taskQuery.data,
    taskQuery.dataUpdatedAt,
  ]);

  function requestPromptDraft() {
    if (!sceneId) return;
    promptDraftMutation.mutate({
      projectId,
      sceneId,
      kind: brollKind,
      referenceImageUrl:
        brollKind === "video" ? (sourceImageUrl ?? undefined) : undefined,
      userInstructions: brollInstructions.trim() || undefined,
    });
  }

  function generateApprovedBroll() {
    if (!promptDraft) return;
    if (promptDraft.kind === "image") {
      generateImageMutation.mutate({
        prompt: promptDraft.prompt,
        negativePrompt: promptDraft.negativePrompt || undefined,
        model: effectiveImageModel,
        originSurface: "media_studio",
      });
      return;
    }
    if (!sourceImageUrl) return;
    generateVideoMutation.mutate({
      prompt: promptDraft.prompt,
      model: effectiveVideoModel,
      duration: promptDraft.suggestedDurationSeconds,
      referenceImageUrls: [sourceImageUrl],
      originSurface: "media_studio",
    });
  }

  function handleLibraryDrag(
    asset: VideoStudioTimelineAsset,
    event: DragEvent<HTMLButtonElement>
  ) {
    writeVideoStudioAssetDragData(event.dataTransfer, asset);
  }

  function handleHistoryDrag(
    asset: VideoStudioTimelineAsset,
    event: DragEvent<HTMLButtonElement>
  ) {
    writeVideoStudioAssetDragData(event.dataTransfer, asset);
  }

  function handleComputerDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onLocalFile?.(file);
  }

  return (
    <aside
      className={`flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background p-3 ${className ?? ""}`}
      data-testid="video-studio-asset-dock"
    >
      <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <VStack gap={3}>
          {!isBrollMode ? (
            <HStack gap={1} wrap="wrap">
              <Button
                variant={tab === "library" ? "secondary" : "ghost"}
                size="sm"
                label={pickCopy(lang, videoStudioCopy.assetDockLibrary)}
                icon={<Library className="h-4 w-4" />}
                onClick={() => setTab("library")}
              />
              <Button
                variant={tab === "history" ? "secondary" : "ghost"}
                size="sm"
                label={pickCopy(lang, videoStudioCopy.assetDockHistory)}
                icon={<History className="h-4 w-4" />}
                onClick={() => setTab("history")}
              />
              {onLocalFile ? (
                <Button
                  variant={tab === "computer" ? "secondary" : "ghost"}
                  size="sm"
                  label={pickCopy(lang, videoStudioCopy.assetDockComputer)}
                  icon={<HardDrive className="h-4 w-4" />}
                  onClick={() => setTab("computer")}
                />
              ) : null}
            </HStack>
          ) : null}

          {isBrollMode ? (
            <Card padding={2}>
              <VStack gap={2}>
                <Text type="body" weight="medium">
                  {pickCopy(lang, videoStudioCopy.brollSectionTitle)}
                </Text>
                <select
                  value={brollKind}
                  onChange={event => {
                    setBrollKind(event.target.value as "image" | "video");
                    setPromptDraft(null);
                  }}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  data-testid="video-studio-broll-kind"
                >
                  <option value="image">
                    {pickCopy(lang, videoStudioCopy.brollKindImage)}
                  </option>
                  <option value="video">
                    {pickCopy(lang, videoStudioCopy.brollKindVideo)}
                  </option>
                </select>
                {!initialSceneId ? (
                  <select
                    value={sceneId}
                    onChange={event => {
                      setSceneId(event.target.value);
                      setPromptDraft(null);
                    }}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    data-testid="video-studio-broll-scene"
                  >
                    {document.scenes.map(scene => (
                      <option key={scene.sceneId} value={scene.sceneId}>
                        {scene.sceneId} ·{" "}
                        {(
                          scene.narration ??
                          scene.captionCues[0]?.text ??
                          ""
                        ).slice(0, 70)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <TextArea
                  label={pickCopy(lang, videoStudioCopy.brollInstructionsLabel)}
                  value={brollInstructions}
                  onChange={setBrollInstructions}
                  placeholder={pickCopy(
                    lang,
                    videoStudioCopy.brollInstructionsPlaceholder
                  )}
                  rows={2}
                  maxLength={2000}
                />
                {brollKind === "video" ? (
                  <Text type="supporting" color="secondary">
                    {sourceImageUrl
                      ? "ใช้ภาพอ้างอิงที่เลือกไว้สำหรับ image-to-video"
                      : pickCopy(lang, videoStudioCopy.brollNeedImage)}
                  </Text>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  label={pickCopy(lang, videoStudioCopy.brollDraftPrompt)}
                  isLoading={promptDraftMutation.isPending}
                  isDisabled={
                    !sceneId ||
                    promptDraftMutation.isPending ||
                    (brollKind === "video" && !sourceImageUrl)
                  }
                  onClick={requestPromptDraft}
                  data-testid="video-studio-broll-draft"
                />
                {promptDraft ? (
                  <VStack gap={2}>
                    <Text type="supporting" weight="medium">
                      {pickCopy(lang, videoStudioCopy.brollReviewTitle)}
                    </Text>
                    {promptDraft.kind === "image" ? (
                      <select
                        value={effectiveImageModel}
                        onChange={event => selectModel(event.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                        data-testid="video-studio-image-model"
                      >
                        {imageModels.length === 0 ? (
                          <option value="">
                            {pickCopy(lang, videoStudioCopy.noImageModel)}
                          </option>
                        ) : null}
                        {imageModels.map(model => (
                          <option key={model.modelId} value={model.modelId}>
                            {model.name} · {model.provider}
                            {model.isDefault
                              ? ` (${pickCopy(lang, videoStudioCopy.defaultModel)})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={effectiveVideoModel}
                        onChange={event => selectVideoModel(event.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                        data-testid="video-studio-video-model"
                      >
                        {videoModels.length === 0 ? (
                          <option value="">
                            {pickCopy(lang, videoStudioCopy.noVideoModel)}
                          </option>
                        ) : null}
                        {videoModels.map(model => (
                          <option key={model.modelId} value={model.modelId}>
                            {model.name} · {model.provider}
                            {model.isDefault
                              ? ` (${pickCopy(lang, videoStudioCopy.defaultModel)})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <TextArea
                      label={pickCopy(lang, videoStudioCopy.brollPromptLabel)}
                      value={promptDraft.prompt}
                      onChange={value =>
                        setPromptDraft(current =>
                          current ? { ...current, prompt: value } : current
                        )
                      }
                      rows={5}
                      maxLength={4000}
                      data-testid="video-studio-broll-prompt"
                    />
                    <TextArea
                      label={pickCopy(
                        lang,
                        videoStudioCopy.brollNegativePromptLabel
                      )}
                      value={promptDraft.negativePrompt}
                      onChange={value =>
                        setPromptDraft(current =>
                          current
                            ? { ...current, negativePrompt: value }
                            : current
                        )
                      }
                      rows={2}
                      maxLength={1000}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      label={
                        promptDraft.kind === "image"
                          ? pickCopy(lang, videoStudioCopy.brollGenerateImage)
                          : pickCopy(lang, videoStudioCopy.brollGenerateVideo)
                      }
                      isLoading={
                        generateImageMutation.isPending ||
                        generateVideoMutation.isPending
                      }
                      isDisabled={
                        (promptDraft.kind === "image"
                          ? !effectiveImageModel
                          : !effectiveVideoModel || !sourceImageUrl) ||
                        generateImageMutation.isPending ||
                        generateVideoMutation.isPending
                      }
                      onClick={generateApprovedBroll}
                      data-testid="video-studio-broll-generate"
                    />
                  </VStack>
                ) : null}
                {promptDraftMutation.isError ? (
                  <Banner
                    status="error"
                    title={promptDraftMutation.error.message}
                  />
                ) : null}
                {generateImageMutation.isError ? (
                  <Banner
                    status="error"
                    title={generateImageMutation.error.message}
                  />
                ) : null}
                {generateVideoMutation.isError ? (
                  <Banner
                    status="error"
                    title={generateVideoMutation.error.message}
                  />
                ) : null}
                {activeTaskError ? (
                  <Banner status="error" title={activeTaskError} />
                ) : null}
                {activeTaskId ? (
                  <Text type="supporting" color="secondary">
                    {pickCopy(lang, videoStudioCopy.brollWaiting)}
                  </Text>
                ) : null}
                {lastGeneratedAsset ? (
                  <HistoryAssetCard
                    asset={lastGeneratedAsset}
                    onDragStart={handleHistoryDrag}
                    onInsert={
                      lastGeneratedAssetInserted
                        ? undefined
                        : onInsertAssetAt
                          ? asset => {
                              const scene = selectedScene;
                              if (!scene) return;
                              onInsertAssetAt(
                                asset,
                                scene.startMs,
                                Math.min(
                                  scene.endMs - scene.startMs,
                                  Math.max(
                                    1000,
                                    (promptDraft?.suggestedDurationSeconds ??
                                      3) * 1000
                                  )
                                )
                              );
                            }
                          : onInsertAsset
                    }
                    insertLabel={pickCopy(
                      lang,
                      videoStudioCopy.brollInsertScene
                    )}
                    onSelect={asset =>
                      asset.kind === "image" &&
                      setSourceImageUrl(asset.storageUrl)
                    }
                  />
                ) : null}
              </VStack>
            </Card>
          ) : null}

          {isBrollMode && !hideAssetSources ? (
            <VStack gap={2}>
              <Text type="supporting" weight="medium">
                {pickCopy(lang, videoStudioCopy.assetDockHistory)} /{" "}
                {pickCopy(lang, videoStudioCopy.assetDockLibrary)}
              </Text>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {[...recentAssets, ...libraryAssets]
                  .filter(
                    (asset, index, all) =>
                      asset.kind === "image" &&
                      all.findIndex(
                        item => item.storageUrl === asset.storageUrl
                      ) === index
                  )
                  .slice(0, 12)
                  .map(asset => (
                    <HistoryAssetCard
                      key={String(asset.assetId)}
                      asset={asset}
                      onDragStart={handleHistoryDrag}
                      onSelect={selected => {
                        setSourceImageUrl(selected.storageUrl);
                        onAssetSelect?.(selected);
                      }}
                    />
                  ))}
              </div>
              {sourceImageUrl ? (
                <Text type="supporting" color="secondary">
                  เลือกภาพอ้างอิงแล้ว — พร้อมสร้าง image-to-video ในฉากนี้
                </Text>
              ) : null}
            </VStack>
          ) : !isBrollMode && tab === "library" ? (
            libraryAssets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {libraryAssets.map(asset => (
                  <LibraryAssetCard
                    key={String(asset.assetId)}
                    asset={asset}
                    onDragStart={handleLibraryDrag}
                    onSelect={onAssetSelect}
                  />
                ))}
              </div>
            ) : libraryQuery.isError ? (
              <Banner
                status="error"
                title={pickCopy(lang, videoStudioCopy.assetPickerLoadError)}
              />
            ) : (
              <VStack gap={2} align="center">
                <Library
                  className="h-7 w-7 text-muted-foreground/60"
                  aria-hidden="true"
                />
                <Text type="supporting" color="secondary">
                  {pickCopy(lang, videoStudioCopy.assetPickerEmptyTitle)}
                </Text>
              </VStack>
            )
          ) : !isBrollMode && tab === "history" ? (
            recentAssets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {recentAssets.map(asset => (
                  <HistoryAssetCard
                    key={String(asset.assetId)}
                    asset={asset}
                    onDragStart={handleHistoryDrag}
                    onSelect={selected => {
                      if (selected.kind === "image")
                        setSourceImageUrl(selected.storageUrl);
                      onAssetSelect?.(selected);
                    }}
                  />
                ))}
              </div>
            ) : historyQuery.isError ? (
              <Banner
                status="error"
                title={pickCopy(lang, videoStudioCopy.assetDockHistoryError)}
              />
            ) : (
              <VStack gap={2} align="center">
                <ImageIcon
                  className="h-7 w-7 text-muted-foreground/60"
                  aria-hidden="true"
                />
                <Text type="supporting" color="secondary">
                  {pickCopy(lang, videoStudioCopy.assetDockEmpty)}
                </Text>
              </VStack>
            )
          ) : !isBrollMode && onLocalFile ? (
            <VStack gap={2}>
              <div
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-4 text-center"
                onDragOver={event => event.preventDefault()}
                onDrop={handleComputerDrop}
                onClick={() => inputRef.current?.click()}
                data-testid="video-studio-computer-drop"
              >
                <Upload
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <Text type="supporting">
                  {pickCopy(lang, videoStudioCopy.assetDockComputerHint)}
                </Text>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) onLocalFile?.(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </VStack>
          ) : null}
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.assetDockDragHint)}
          </Text>
          {selectedAsset ? (
            <Text type="supporting" color="secondary">
              เลือก{selectedAsset.kind === "image" ? "ภาพ" : "วิดีโอ"}แล้ว —
              แตะช่องที่ต้องการวาง
            </Text>
          ) : null}
        </VStack>
      </section>
    </aside>
  );
}
