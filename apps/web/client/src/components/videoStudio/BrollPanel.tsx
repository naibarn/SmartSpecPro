import { useCallback, useState, type DragEvent } from "react";

import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

import { probeMediaDurationMs } from "./mediaDurationProbe";
import { addLayer } from "./timelineEdits";
import { VideoStudioAssetDock } from "./VideoStudioAssetDock";
import {
  readVideoStudioAssetDragData,
  type VideoStudioTimelineAsset,
} from "./VideoStudioAssetPicker";
import {
  pickCopy,
  videoStudioCopy,
  type VideoStudioLang,
} from "./videoStudioCopy";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import {
  classifyMediaType,
  resolveEditorFileMimeType,
  uploadMedia,
} from "@/components/editor/uploadMedia";

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getBrollFileKind(file: File): "image" | "video" | null {
  const byMime = classifyMediaType(resolveEditorFileMimeType(file));
  if (byMime === "image" || byMime === "video") return byMime;

  // Some browsers expose dropped local files as application/octet-stream (or
  // an empty MIME). The upload pipeline accepts these extensions, so the slot
  // must use the same fallback instead of silently ignoring the drop.
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"].includes(extension)
  ) {
    return "image";
  }
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(extension)) {
    return "video";
  }
  return null;
}

export function toBrollLayerSourceUrl(sourceUrl: string): string {
  // The browser can render relative storage URLs, but RemotionLayerSchema
  // requires a valid absolute URL. Keep protocol URLs untouched and resolve
  // internal storage/proxy paths against the current app origin.
  if (/^[a-z][a-z\d+.-]*:/i.test(sourceUrl)) return sourceUrl;
  if (typeof window === "undefined") return sourceUrl;
  try {
    return new URL(sourceUrl, window.location.origin).toString();
  } catch {
    return sourceUrl;
  }
}

function BrollMediaSlot({
  lang,
  kind,
  asset,
  selectedAsset,
  onAssetDrop,
  onSelectedAssetPlace,
  onFileDrop,
}: {
  lang: VideoStudioLang;
  kind: "image" | "video";
  asset: VideoStudioTimelineAsset | null;
  selectedAsset?: VideoStudioTimelineAsset | null;
  onAssetDrop: (asset: VideoStudioTimelineAsset) => void;
  onSelectedAssetPlace?: (asset: VideoStudioTimelineAsset) => void;
  onFileDrop: (file: File) => Promise<void> | void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const title = pickCopy(
    lang,
    kind === "image"
      ? videoStudioCopy.brollSlotImage
      : videoStudioCopy.brollSlotVideo
  );
  const canTapPlace = selectedAsset?.kind === kind;

  async function handleFileDrop(file: File) {
    setDropError(null);
    setIsUploading(true);
    try {
      await onFileDrop(file);
    } catch (error) {
      setDropError(
        error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ"
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragOver(false);
    setDropError(null);
    const draggedAsset = readVideoStudioAssetDragData(event.dataTransfer);
    if (draggedAsset?.kind === kind) {
      onAssetDrop(draggedAsset);
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      const fileKind = getBrollFileKind(file);
      if (fileKind === kind) {
        void handleFileDrop(file);
      } else {
        setDropError(
          kind === "image"
            ? "กรุณาวางไฟล์ภาพในช่องภาพ"
            : "กรุณาวางไฟล์วิดีโอในช่องวิดีโอ"
        );
      }
    }
  }

  return (
    <button
      type="button"
      className={`relative flex min-h-28 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-2 text-left transition-colors ${
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-border/70 bg-muted/20"
      }`}
      aria-busy={isUploading}
      onDragOver={event => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (canTapPlace && selectedAsset) onSelectedAssetPlace?.(selectedAsset);
      }}
      aria-label={title}
      data-testid={`video-studio-broll-${kind}-slot`}
    >
      {asset?.kind === "image" ? (
        <img
          src={asset.thumbnailUrl ?? asset.storageUrl}
          alt=""
          className="h-full max-h-28 w-full object-cover"
        />
      ) : asset?.kind === "video" ? (
        <video
          src={asset.storageUrl}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          className="h-full max-h-28 w-full object-cover"
          aria-label={title}
        />
      ) : (
        <VStack gap={1} align="center">
          <Text type="label" weight="medium">
            {title}
          </Text>
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.brollSlotEmpty)}
          </Text>
        </VStack>
      )}
      {canTapPlace && !asset ? (
        <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded bg-primary/90 px-2 py-1 text-center text-[11px] font-medium text-primary-foreground">
          แตะเพื่อวางสื่อที่เลือก
        </span>
      ) : null}
      {isUploading ? (
        <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded bg-background/90 px-2 py-1 text-center text-[11px] font-medium">
          กำลังอัปโหลดไฟล์…
        </span>
      ) : null}
      {dropError ? (
        <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded bg-destructive/90 px-2 py-1 text-center text-[11px] font-medium text-destructive-foreground">
          {dropError}
        </span>
      ) : null}
    </button>
  );
}

export interface BrollPanelProps {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onChange: (document: VideoProjectDocument) => void;
  /** Persist an inserted B-roll layer so leaving this stage cannot discard it. */
  onSaveDocument?: (document: VideoProjectDocument) => Promise<void>;
  selectedAsset?: VideoStudioTimelineAsset | null;
  onConsumeSelectedAsset?: () => void;
}

export function getBrollSlotAsset(
  scene: VideoProjectDocument["scenes"][number],
  kind: "image" | "video"
): VideoStudioTimelineAsset | null {
  for (let index = scene.layers.length - 1; index >= 0; index -= 1) {
    const layer = scene.layers[index];
    if (!layer?.name?.startsWith("B-roll")) continue;
    if (kind === "image" && layer.type === "image") {
      return {
        assetId: `layer-${layer.id}`,
        storageUrl: layer.src,
        sha256: "",
        kind: "image",
        thumbnailUrl: layer.src,
      };
    }
    if (kind === "video" && layer.type === "video") {
      return {
        assetId: `layer-${layer.id}`,
        storageUrl: layer.src,
        sha256: "",
        kind: "video",
        thumbnailUrl: undefined,
      };
    }
  }
  return null;
}

/**
 * B-roll is a workflow stage, not an incidental asset-dock action. Each scene
 * gets its own composer so prompt drafts and generated results cannot silently
 * drift to another scene. The generated asset is inserted at scene.startMs
 * and is bounded by scene.endMs, keeping the authored timeline truthful.
 */
export function BrollPanel({
  lang,
  projectId,
  document,
  onChange,
  onSaveDocument,
  selectedAsset,
  onConsumeSelectedAsset,
}: BrollPanelProps) {
  const insertAssetIntoScene = useCallback(
    async (
      asset: VideoStudioTimelineAsset,
      sceneId: string,
      requestedDurationMs: number
    ) => {
      const scene = document.scenes.find(item => item.sceneId === sceneId);
      if (!scene || (asset.kind !== "image" && asset.kind !== "video")) return;

      const sourceDurationMs =
        asset.kind === "video"
          ? await probeMediaDurationMs(asset.storageUrl, "video")
          : null;
      const durationMs = Math.max(
        1,
        Math.min(
          scene.endMs - scene.startMs,
          asset.kind === "image"
            ? scene.endMs - scene.startMs
            : (sourceDurationMs ?? requestedDurationMs)
        )
      );

      const result = addLayer(document, {
        layer:
          asset.kind === "video"
            ? { type: "video", src: toBrollLayerSourceUrl(asset.storageUrl) }
            : {
                type: "image",
                src: toBrollLayerSourceUrl(asset.storageUrl),
                fit: "contain",
              },
        absoluteStartMs: scene.startMs,
        durationMs,
        band: asset.kind === "video" ? "background" : "overlay",
        name: `B-roll · ${scene.sceneId}`,
      });
      onChange(result.document);
      try {
        await onSaveDocument?.(result.document);
      } catch {
        // The document remains in the local draft and the workspace exposes
        // the save/conflict state. A transient save failure must not erase the
        // newly inserted media from the slot UI.
      }
    },
    [document, onChange, onSaveDocument]
  );

  const importLocalFile = useCallback(
    async (file: File, sceneId: string) => {
      const kind = getBrollFileKind(file);
      if (!kind) return;
      const uploaded = await uploadMedia(file, {
        metadata: { videoStudioBroll: true },
      });
      await insertAssetIntoScene(
        {
          assetId: uploaded.assetId,
          storageUrl: uploaded.url,
          sha256: "",
          kind,
          thumbnailUrl: uploaded.thumbnailUrl ?? undefined,
        },
        sceneId,
        3000
      );
    },
    [insertAssetIntoScene]
  );

  const placeInSlot = useCallback(
    async (asset: VideoStudioTimelineAsset, sceneId: string) => {
      await insertAssetIntoScene(asset, sceneId, 3000);
    },
    [insertAssetIntoScene]
  );

  const uploadIntoSlot = useCallback(
    async (file: File, sceneId: string) => {
      const kind = getBrollFileKind(file);
      if (!kind) return;
      const uploaded = await uploadMedia(file, {
        metadata: { videoStudioBroll: true },
      });
      await placeInSlot(
        {
          assetId: uploaded.assetId,
          storageUrl: uploaded.url,
          sha256: "",
          kind,
          thumbnailUrl: uploaded.thumbnailUrl ?? undefined,
        },
        sceneId
      );
    },
    [placeInSlot]
  );

  return (
    <VStack gap={4} data-testid="video-studio-broll-panel">
      <Card padding={4}>
        <VStack gap={2}>
          <Text type="display-3" weight="medium">
            {pickCopy(lang, videoStudioCopy.brollStageTitle)}
          </Text>
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.brollStageDescription)}
          </Text>
        </VStack>
      </Card>

      {document.scenes.map((scene, index) => {
        const sceneDurationMs = Math.max(1, scene.endMs - scene.startMs);
        const narration =
          scene.narration?.trim() ||
          scene.captionCues[0]?.text ||
          "ยังไม่มีบทพากย์ของฉากนี้";
        return (
          <Card
            key={scene.sceneId}
            padding={4}
            data-testid="video-studio-broll-scene-card"
          >
            <VStack gap={3}>
              <HStack gap={2} align="center" justify="between" wrap="wrap">
                <Text type="body" weight="medium">
                  {index + 1}. {scene.sceneId}
                </Text>
                <Badge
                  variant="neutral"
                  label={`${pickCopy(lang, videoStudioCopy.brollSceneRange)}: ${formatClock(scene.startMs)} – ${formatClock(scene.endMs)}`}
                />
              </HStack>
              <VStack gap={1}>
                <Text type="supporting" weight="medium">
                  {pickCopy(lang, videoStudioCopy.brollSceneNarration)}
                </Text>
                <Text
                  type="supporting"
                  color="secondary"
                  className="line-clamp-3"
                >
                  {narration}
                </Text>
                <Text type="supporting" color="secondary">
                  {formatClock(sceneDurationMs)}
                </Text>
              </VStack>
              <HStack gap={2} align="stretch">
                <BrollMediaSlot
                  lang={lang}
                  kind="image"
                  asset={getBrollSlotAsset(scene, "image")}
                  selectedAsset={selectedAsset}
                  onAssetDrop={asset => void placeInSlot(asset, scene.sceneId)}
                  onSelectedAssetPlace={async asset => {
                    await placeInSlot(asset, scene.sceneId);
                    onConsumeSelectedAsset?.();
                  }}
                  onFileDrop={file => void uploadIntoSlot(file, scene.sceneId)}
                />
                <BrollMediaSlot
                  lang={lang}
                  kind="video"
                  asset={getBrollSlotAsset(scene, "video")}
                  selectedAsset={selectedAsset}
                  onAssetDrop={asset => void placeInSlot(asset, scene.sceneId)}
                  onSelectedAssetPlace={async asset => {
                    await placeInSlot(asset, scene.sceneId);
                    onConsumeSelectedAsset?.();
                  }}
                  onFileDrop={file => void uploadIntoSlot(file, scene.sceneId)}
                />
              </HStack>
              <VideoStudioAssetDock
                lang={lang}
                projectId={projectId}
                document={document}
                mode="broll"
                initialSceneId={scene.sceneId}
                initialSourceImageUrl={
                  getBrollSlotAsset(scene, "image")?.storageUrl ?? null
                }
                hideAssetSources
                onLocalFile={file => {
                  void importLocalFile(file, scene.sceneId);
                }}
                onInsertAssetAt={(asset, _startMs, durationMs) => {
                  void insertAssetIntoScene(asset, scene.sceneId, durationMs);
                }}
              />
            </VStack>
          </Card>
        );
      })}
    </VStack>
  );
}
