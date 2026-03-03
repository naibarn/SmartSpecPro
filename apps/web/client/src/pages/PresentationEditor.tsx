import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactElement } from "react";
import { useLocation, useRoute } from "wouter";
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  ChevronLeft,
  Clapperboard,
  Download,
  ImageIcon,
  Sparkles,
  Loader2,
  Menu,
  Minus,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  MousePointer2,
  Plus,
  Save,
  Shapes,
  SkipBack,
  SkipForward,
  RectangleHorizontal,
  Redo2,
  RotateCw,
  Pencil,
  Play,
  Trash2,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  AssetLibraryPanel,
  CANVAS_LIBRARY_ASSET_DRAG_MIME,
  CanvasShell,
  CanvasStage,
  GraphicsPanel,
  MobileBottomSheet,
  MobileDrawerPanel,
  MobileQuickActions,
  PropertyPanel,
  TransformHandles,
  type AssetLibraryTab,
  type CanvasLibraryAsset,
  type CanvasStageDropAssetPayload,
  type MobileBottomSheetTab,
  type SvgGraphic,
} from "@/presentation-canvas";
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
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { buildWrongEditorOpenGuard } from "@/lib/presentationRouting";
import { toast } from "sonner";
import {
  createElement,
  ensureSlideContent,
  resizeCanvas,
  type ArrangeDirection,
  type PresentationElement,
  type PresentationElementType,
  type PresentationSlideContent,
} from "@/lib/presentationEditorState";
import { SelectionEngine } from "@/presentation-canvas/selection/SelectionEngine";
import { CommandBus } from "@/presentation-canvas/commands/CommandBus";
import { useMobileGestures } from "@/presentation-canvas/mobile/useMobileGestures";
import { AudioTrackPlayer } from "@/presentation-canvas/play/AudioTrackPlayer";
import { ExportDialog } from "@/components/presentation/ExportDialog";
import { ImportPresentationDialog } from "@/components/presentation/ImportPresentationDialog";
import { AIDraftModal } from "@/components/presentation/AIDraftModal";
import { SearchableCombobox } from "@/components/presentation/SearchableCombobox";
import { SlideAudioPanel } from "@/components/presentation/SlideAudioPanel";
import { useAutosaveController } from "@/presentation-canvas/save/useAutosaveController";
import {
  createConflictPolicyState,
  normalizeConflictPolicy,
  registerConflict,
  registerSaveSuccess,
  releaseStaleBlock,
  shouldBlockSaveAttempt,
} from "@/presentation-canvas/save/conflictPolicy";
import {
  addElementCommand,
  arrangeSelectionCommand,
  createCanvasCommandState,
  deleteSelectionCommand,
  duplicateSelectionCommand,
  moveSelectionCommand,
  patchElementByIdCommand,
  patchSelectedElementCommand,
  resizeSelectionCommand,
  rotateSelectionCommand,
  selectElementsCommand,
  setCanvasSizeCommand,
  type CanvasCommandState,
} from "@/presentation-canvas/commands/commands";
import { trackAutosaveResult } from "@/lib/analytics/presentationEvents";
import {
  PRESENTATION_CANVAS_PRESETS,
  getCanvasPresetById,
  normalizeCanvasSize,
} from "@/presentation-canvas/constants";
import {
  inferWatermarkFormatFromSourceUrl,
  normalizeWatermarkLibraryOptions,
  type LibraryWatermarkOption,
} from "@/lib/presentationWatermark";
import {
  PRESENTATION_CONFLICT_SCHEMA_VERSION,
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ITEM_TYPE,
} from "@shared/presentation/constants";
import {
  AI_GEOMETRIC_ACCENT_SHAPES,
  AI_GEOMETRIC_CROP_SHAPES,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_STYLE_PRESET_IDS,
} from "@shared/presentation/aiTypes";
import { BUILT_IN_PRESETS } from "@shared/presentation/aiStylePresets";
import type { PresentationExportWarning } from "@shared/presentation/contracts";

function parseDocId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type SaveState = "idle" | "pending" | "saved" | "conflict" | "error";
type PlaybackState = "idle" | "playing";
type SaveMode = "manual" | "autosave";
type LibraryMediaKind = "image" | "video";
const MIN_DESKTOP_ZOOM = 0.5;
const MAX_DESKTOP_ZOOM = 2;
const DESKTOP_ZOOM_STEP = 0.1;
const MIN_SLIDE_DURATION_MS = 250;
type AutoLayoutScope = "current" | "all";
type AutoLayoutTemplateChoice = "auto" | (typeof AI_LAYOUT_TEMPLATE_IDS)[number];
type AutoLayoutStyleChoice = "auto" | (typeof AI_STYLE_PRESET_IDS)[number];
type AutoLayoutCropShapeChoice = (typeof AI_GEOMETRIC_CROP_SHAPES)[number];
type AutoLayoutAccentShapeChoice = (typeof AI_GEOMETRIC_ACCENT_SHAPES)[number];
const AUTO_LAYOUT_TEMPLATE_LABELS: Record<(typeof AI_LAYOUT_TEMPLATE_IDS)[number], string> = {
  hero_center: "Hero Center",
  split_left_image: "Split Left Image",
  split_right_image: "Split Right Image",
  top_image_text_bottom: "Image Top / Text Bottom",
  bottom_image_text_top: "Text Top / Image Bottom",
  feature_boxes_right: "Feature Boxes Right",
};
const AUTO_LAYOUT_CROP_SHAPE_LABELS: Record<AutoLayoutCropShapeChoice, string> = {
  auto: "Auto choose",
  rect: "Rectangle",
  circle: "Circle",
  triangle: "Triangle",
};
const AUTO_LAYOUT_ACCENT_SHAPE_LABELS: Record<AutoLayoutAccentShapeChoice, string> = {
  auto: "Auto choose",
  rect: "Rectangle",
  circle: "Circle",
  triangle: "Triangle",
};
const UNSAVED_PRESENTATION_WARNING =
  "คุณมีการแก้ไขสไลด์ที่ยังไม่ได้บันทึก หากออกตอนนี้ข้อมูลที่แก้ไขจะหายไป ต้องการออกจากโปรเจกต์หรือไม่?";

interface LibraryResultItemLike {
  id?: number;
  item_id?: number;
  item_type?: string | null;
  title?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  poster_url?: string | null;
  owner_user_id?: number | null;
  access_source?: string | null;
}

interface MediaHistoryTaskLike {
  id?: string;
  taskId?: string;
  mediaType?: string;
  status?: string;
  model?: string | null;
  prompt?: string | null;
  resultUrl?: string | null;
  resultData?: Record<string, unknown> | null;
}

interface PresentationSavedVersionLike {
  id: number;
  versionNumber?: number;
  createdAt?: string | Date;
  changeDescription?: string | null;
  snapshot?: {
    slideId?: number;
    slideTitle?: string;
    savedAt?: string;
    slideContent?: unknown;
    notes?: string | null;
  } | null;
}

interface PresentationVersionGroup {
  key: string;
  slideId: number | null;
  label: string;
  sortOrder: number;
  items: PresentationSavedVersionLike[];
}

interface SlideComparisonState {
  title: string;
  notes: string | null;
  content: PresentationSlideContent;
}

interface SlideDiffSummary {
  isIdentical: boolean;
  titleChanged: boolean;
  notesChanged: boolean;
  canvasChanged: boolean;
  currentElementCount: number;
  versionElementCount: number;
  changedElementCount: number;
  addedElementCount: number;
  removedElementCount: number;
}

function getItemType(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }
  const value = (item as any).itemType ?? (item as any).item_type ?? "";
  return String(value);
}

function formatVersionDate(value: string | Date | undefined): string {
  if (!value) {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function normalizeSlideId(value: unknown): number | null {
  const slideId = Number(value);
  if (Number.isFinite(slideId) && slideId > 0) {
    return slideId;
  }
  return null;
}

function normalizeVersionSlideContent(version: PresentationSavedVersionLike): PresentationSlideContent | null {
  const snapshot = version.snapshot;
  if (!snapshot || snapshot.slideContent == null) {
    return null;
  }
  try {
    return ensureSlideContent(snapshot.slideContent as PresentationSlideContent);
  } catch {
    return null;
  }
}

function countSlideElementDiff(
  currentElements: PresentationSlideContent["elements"],
  versionElements: PresentationSlideContent["elements"],
): { changed: number; added: number; removed: number } {
  const serializeElement = (element: PresentationSlideContent["elements"][number]): string => {
    try {
      return JSON.stringify(element);
    } catch {
      return "";
    }
  };

  const currentMap = new Map(
    currentElements.map((element) => [element.id, serializeElement(element)]),
  );
  const versionMap = new Map(
    versionElements.map((element) => [element.id, serializeElement(element)]),
  );
  const allIds = new Set<string>([
    ...currentMap.keys(),
    ...versionMap.keys(),
  ]);

  let changed = 0;
  let added = 0;
  let removed = 0;

  for (const elementId of allIds) {
    const currentSerialized = currentMap.get(elementId);
    const versionSerialized = versionMap.get(elementId);
    if (currentSerialized == null && versionSerialized != null) {
      changed += 1;
      added += 1;
      continue;
    }
    if (currentSerialized != null && versionSerialized == null) {
      changed += 1;
      removed += 1;
      continue;
    }
    if (currentSerialized !== versionSerialized) {
      changed += 1;
    }
  }

  return { changed, added, removed };
}

function buildSlideDiffSummary(
  current: SlideComparisonState | null,
  version: SlideComparisonState,
): SlideDiffSummary {
  if (!current) {
    return {
      isIdentical: false,
      titleChanged: true,
      notesChanged: true,
      canvasChanged: true,
      currentElementCount: 0,
      versionElementCount: version.content.elements.length,
      changedElementCount: version.content.elements.length,
      addedElementCount: version.content.elements.length,
      removedElementCount: 0,
    };
  }

  const elementDiff = countSlideElementDiff(
    current.content.elements,
    version.content.elements,
  );
  const titleChanged = current.title.trim() !== version.title.trim();
  const notesChanged = (current.notes || "") !== (version.notes || "");
  const canvasChanged = JSON.stringify(normalizeCanvasSize(current.content.canvas))
    !== JSON.stringify(normalizeCanvasSize(version.content.canvas));
  const currentElementCount = current.content.elements.length;
  const versionElementCount = version.content.elements.length;
  const isIdentical = !titleChanged
    && !notesChanged
    && !canvasChanged
    && elementDiff.changed === 0;

  return {
    isIdentical,
    titleChanged,
    notesChanged,
    canvasChanged,
    currentElementCount,
    versionElementCount,
    changedElementCount: elementDiff.changed,
    addedElementCount: elementDiff.added,
    removedElementCount: elementDiff.removed,
  };
}

function isNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || "");
  return message.includes(PRESENTATION_ERROR_CODE.NOT_FOUND);
}

interface PresentationConflictLike {
  conflictSchemaVersion?: string;
  latestSlideVersion?: number;
  latestSlide?: {
    version?: number;
    slideContent?: unknown;
  };
}

function extractPresentationConflict(error: unknown): PresentationConflictLike | null {
  const cause = (error as any)?.cause || (error as any)?.data?.cause;
  if (cause?.conflictSchemaVersion === PRESENTATION_CONFLICT_SCHEMA_VERSION) {
    return cause as PresentationConflictLike;
  }
  return null;
}

function isConflictError(error: unknown): boolean {
  if (extractPresentationConflict(error)) {
    return true;
  }

  const message = String((error as any)?.message || "");
  return message.includes(PRESENTATION_ERROR_CODE.VERSION_CONFLICT);
}

function resolveLatestConflictSlideVersion(conflict: PresentationConflictLike): number | null {
  const direct = Number(conflict.latestSlideVersion);
  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }

  const nested = Number(conflict.latestSlide?.version);
  if (Number.isFinite(nested) && nested >= 0) {
    return nested;
  }

  return null;
}

function isConflictSlideContentEqualDraft(
  conflict: PresentationConflictLike,
  draftContent: PresentationSlideContent,
): boolean {
  if (!conflict.latestSlide || conflict.latestSlide.slideContent == null) {
    return false;
  }

  try {
    const latestNormalized = ensureSlideContent(conflict.latestSlide.slideContent as PresentationSlideContent);
    const draftNormalized = ensureSlideContent(draftContent);
    return JSON.stringify(latestNormalized) === JSON.stringify(draftNormalized);
  } catch {
    return false;
  }
}

function getDeckLoadErrorMessage(error: unknown): string {
  const raw = String((error as any)?.message || "Failed to load deck.");
  if (raw.includes("PRESENTATION_LEGACY_PAYLOAD_BLOCKED")) {
    return "Open read-only and convert this deck before editing.";
  }
  return raw;
}

function nextElementId(type: PresentationElementType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

type FullscreenCapableDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

function getCurrentFullscreenElement(doc: FullscreenCapableDocument): Element | null {
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
}

async function requestFullscreenForElement(element: FullscreenCapableElement): Promise<void> {
  if (typeof element.requestFullscreen === "function") {
    await element.requestFullscreen();
    return;
  }
  if (typeof element.webkitRequestFullscreen === "function") {
    await Promise.resolve(element.webkitRequestFullscreen());
    return;
  }
  if (typeof element.msRequestFullscreen === "function") {
    await Promise.resolve(element.msRequestFullscreen());
    return;
  }
  throw new Error("Fullscreen API unavailable");
}

async function exitAnyFullscreen(doc: FullscreenCapableDocument): Promise<void> {
  if (typeof doc.exitFullscreen === "function") {
    await doc.exitFullscreen();
    return;
  }
  if (typeof doc.webkitExitFullscreen === "function") {
    await Promise.resolve(doc.webkitExitFullscreen());
    return;
  }
  if (typeof doc.msExitFullscreen === "function") {
    await Promise.resolve(doc.msExitFullscreen());
  }
}

function buildDraftSignature(
  slideId: number | null,
  content: PresentationSlideContent,
): string | null {
  if (!slideId) {
    return null;
  }

  return `${slideId}:${buildSlideContentSignature(content)}`;
}

function sortValueForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValueForStableJson(item));
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(objectValue).sort()) {
      normalized[key] = sortValueForStableJson(objectValue[key]);
    }
    return normalized;
  }
  return value;
}

function buildSlideContentSignature(content: PresentationSlideContent): string {
  const normalized = ensureSlideContent(content);
  return JSON.stringify(sortValueForStableJson(normalized));
}

function normalizeLibraryMediaItems(
  rows: unknown,
  kind: LibraryMediaKind,
  currentUserId: number | null,
): CanvasLibraryAsset[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => row as LibraryResultItemLike)
    .filter((row) => {
      const id = Number(row.id ?? row.item_id);
      if (!Number.isFinite(id)) {
        return false;
      }
      const rowKind = String(row.item_type || "").toLowerCase();
      if (rowKind === "image" || rowKind === "video") {
        return rowKind === kind;
      }
      return true;
    })
    .map((row) => {
      const id = Number(row.id ?? row.item_id);
      const sourceUrl = String(row.source_url || "").trim();
      if (!sourceUrl) {
        return null;
      }

      const title = String(row.title || `${kind} #${id}`).trim() || `${kind} #${id}`;
      const thumbnailRaw = String(
        row.thumbnail_url
        || row.preview_url
        || row.poster_url
        || "",
      ).trim();
      const ownerUserId = Number(row.owner_user_id);
      const accessSource = String(row.access_source || "").toLowerCase();
      const isSharedByAccessSource = accessSource === "shared_group" || accessSource === "shared_direct";
      const isSharedByOwner = Number.isFinite(ownerUserId)
        && currentUserId !== null
        && ownerUserId !== currentUserId;
      return {
        id,
        kind,
        title,
        sourceUrl,
        thumbnailUrl: thumbnailRaw || (kind === "image" ? sourceUrl : null),
        sourceType: isSharedByAccessSource || isSharedByOwner ? "shared" : "library",
      } satisfies CanvasLibraryAsset;
    })
    .filter((value): value is CanvasLibraryAsset => Boolean(value));
}

function readFirstHttpUrl(value: unknown, visited = new WeakSet<object>()): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstHttpUrl(item, visited);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (visited.has(record)) {
    return null;
  }
  visited.add(record);

  const prioritizedKeys = [
    "url",
    "video_url",
    "image_url",
    "audio_url",
    "videoUrl",
    "imageUrl",
    "audioUrl",
    "result_url",
    "resultUrl",
    "signed_url",
    "signedUrl",
    "src",
  ];
  for (const key of prioritizedKeys) {
    const found = readFirstHttpUrl(record[key], visited);
    if (found) {
      return found;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const found = readFirstHttpUrl(nestedValue, visited);
    if (found) {
      return found;
    }
  }
  return null;
}

function extractMediaHistoryResultUrl(task: MediaHistoryTaskLike): string | null {
  const directUrl = String(task.resultUrl || "").trim();
  if (directUrl && /^https?:\/\//i.test(directUrl)) {
    return directUrl;
  }

  const resultData = task.resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }

  const parsedResultJson = typeof resultData.resultJson === "string"
    ? (() => {
      try {
        const parsed = JSON.parse(resultData.resultJson);
        return parsed;
      } catch {
        return null;
      }
    })()
    : null;

  return (
    readFirstHttpUrl(resultData.output)
    || readFirstHttpUrl(resultData.result)
    || readFirstHttpUrl(resultData.data)
    || readFirstHttpUrl(resultData.response)
    || readFirstHttpUrl(parsedResultJson)
    || readFirstHttpUrl(resultData)
  );
}

function extractMediaHistoryThumbnailUrl(task: MediaHistoryTaskLike): string | null {
  const resultData = task.resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }

  const parsedResultJson = typeof resultData.resultJson === "string"
    ? (() => {
      try {
        const parsed = JSON.parse(resultData.resultJson);
        return parsed;
      } catch {
        return null;
      }
    })()
    : null;

  return (
    readFirstHttpUrl(resultData.poster)
    || readFirstHttpUrl(resultData.poster_url)
    || readFirstHttpUrl(resultData.posterUrl)
    || readFirstHttpUrl(resultData.thumbnail)
    || readFirstHttpUrl(resultData.thumbnail_url)
    || readFirstHttpUrl(resultData.thumbnailUrl)
    || readFirstHttpUrl(parsedResultJson?.poster)
    || readFirstHttpUrl(parsedResultJson?.thumbnail)
    || null
  );
}

function buildMediaHistoryTitle(task: MediaHistoryTaskLike, kind: LibraryMediaKind): string {
  const prompt = String(task.prompt || "").trim();
  const model = String(task.model || "").trim();
  if (prompt) {
    return prompt.length > 72 ? `${prompt.slice(0, 69)}...` : prompt;
  }
  if (model) {
    return `${kind.toUpperCase()} - ${model}`;
  }
  const taskId = String(task.taskId || task.id || "").trim();
  return taskId ? `${kind.toUpperCase()} - ${taskId}` : `${kind.toUpperCase()} from history`;
}

function stableTaskNumericId(task: MediaHistoryTaskLike, kind: LibraryMediaKind): number {
  const seed = `${kind}:${task.id || task.taskId || ""}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash * 31) + seed.charCodeAt(index)) | 0;
  }
  const positive = Math.abs(hash);
  return positive > 0 ? -positive : -(Date.now() % 1_000_000);
}

function normalizeMediaHistoryItems(
  rows: unknown,
  kind: LibraryMediaKind,
  query: string,
): CanvasLibraryAsset[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  return rows
    .map((row) => row as MediaHistoryTaskLike)
    .filter((row) => String(row.status || "").toLowerCase() === "completed")
    .filter((row) => String(row.mediaType || "").toLowerCase() === kind)
    .map((row) => {
      const sourceUrl = extractMediaHistoryResultUrl(row);
      if (!sourceUrl) {
        return null;
      }
      const title = buildMediaHistoryTitle(row, kind);
      const searchable = `${title} ${row.model || ""} ${row.prompt || ""} ${row.id || ""} ${row.taskId || ""}`.toLowerCase();
      if (normalizedQuery && !searchable.includes(normalizedQuery)) {
        return null;
      }
      const thumbnailUrl = kind === "image"
        ? sourceUrl
        : extractMediaHistoryThumbnailUrl(row);
      return {
        id: stableTaskNumericId(row, kind),
        kind,
        title,
        sourceUrl,
        thumbnailUrl,
        sourceType: "history",
      } satisfies CanvasLibraryAsset;
    })
    .filter((value): value is CanvasLibraryAsset => Boolean(value));
}

function mergeLibraryAssets(
  first: CanvasLibraryAsset[],
  second: CanvasLibraryAsset[],
): CanvasLibraryAsset[] {
  const merged: CanvasLibraryAsset[] = [];
  const seen = new Set<string>();
  for (const asset of [...first, ...second]) {
    const key = `${asset.kind}:${asset.sourceUrl.trim().toLowerCase()}`;
    if (!asset.sourceUrl.trim() || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(asset);
  }
  return merged;
}

function summarizeSlidePreview(slideContent: unknown): {
  mediaSrc: string | null;
  mediaPosterSrc: string | null;
  mediaKind: "image" | "video" | null;
  textSnippet: string | null;
  elementCount: number;
} {
  const normalized = ensureSlideContent(slideContent as PresentationSlideContent);
  const mediaElement = normalized.elements.find((element) => {
    if (element.type !== "image" && element.type !== "video") {
      return false;
    }
    const source = String((element as any).src || "").trim();
    return source.length > 0;
  }) as ({ type: "image" | "video"; src: string; poster?: string } | undefined);
  const textElement = normalized.elements.find((element) => {
    if (element.type !== "text") {
      return false;
    }
    const value = String((element as any).text || "").trim();
    return value.length > 0;
  }) as ({ text: string } | undefined);

  return {
    mediaSrc: mediaElement?.src || null,
    mediaPosterSrc:
      mediaElement?.type === "video"
        ? String(mediaElement.poster || "").trim() || null
        : null,
    mediaKind: mediaElement?.type || null,
    textSnippet: textElement?.text ? textElement.text.slice(0, 56) : null,
    elementCount: normalized.elements.length,
  };
}

const MIN_PREVIEW_LINE_HEIGHT = 2;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveImageDisplayConfig(element: PresentationSlideContent["elements"][number]): {
  fit: "contain" | "cover" | "fill";
  positionX: number;
  positionY: number;
  zoom: number;
} {
  if (element.type !== "image") {
    return { fit: "contain", positionX: 50, positionY: 50, zoom: 1 };
  }
  const fit = (element.imageFit === "cover" || element.imageFit === "fill")
    ? element.imageFit
    : "contain";
  const positionX = clampNumber(Number(element.imagePositionX ?? 50), 0, 100);
  const positionY = clampNumber(Number(element.imagePositionY ?? 50), 0, 100);
  const zoom = clampNumber(Number(element.imageZoom ?? 1), 0.5, 3);
  return { fit, positionX, positionY, zoom };
}

function renderReadonlySlideElement(
  element: PresentationSlideContent["elements"][number],
  index: number,
  canvasWidth: number,
  canvasHeight: number,
  renderScale: number,
): ReactElement {
  const commonStyle = {
    left: `${(element.x / canvasWidth) * 100}%`,
    top: `${(element.y / canvasHeight) * 100}%`,
    width: `${(element.width / canvasWidth) * 100}%`,
    height:
      element.type === "line"
        ? `${Math.max((element.height / canvasHeight) * 100, (MIN_PREVIEW_LINE_HEIGHT / canvasHeight) * 100)}%`
        : `${(element.height / canvasHeight) * 100}%`,
    opacity: element.opacity ?? 1,
    transform: `rotate(${element.rotation ?? 0}deg)`,
    transformOrigin: "center center",
  } satisfies CSSProperties;

  if (element.type === "text") {
    const fontSize = Number.isFinite(element.fontSize) ? element.fontSize : 48;
    const lineHeight = Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
    const letterSpacing = Number.isFinite(element.letterSpacing) ? element.letterSpacing : 0;
    const scaledFontSize = Math.max(8, fontSize * Math.max(0.0001, renderScale));
    const scaledPaddingPx = Math.max(1, Math.round(8 * Math.max(0.0001, renderScale)));
    const scaledLetterSpacing = letterSpacing * Math.max(0.0001, renderScale);
    return (
      <div key={element.id || `play-${index}`} className="absolute overflow-hidden" style={commonStyle}>
        <p
          className="w-full whitespace-pre-wrap break-words"
          style={{
            display: "block",
            minHeight: "100%",
            padding: `${scaledPaddingPx}px`,
            paddingBottom: "0.14em",
            color: element.color || "#111827",
            backgroundColor: element.backgroundColor || "transparent",
            fontSize: scaledFontSize,
            fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
            fontWeight: element.fontWeight || "600",
            fontStyle: element.fontStyle || "normal",
            textDecoration: element.textDecoration || "none",
            textAlign: element.textAlign || "left",
            lineHeight,
            letterSpacing: `${scaledLetterSpacing}px`,
            ...(element.textShadow ? { textShadow: element.textShadow } : {}),
            ...(element.textStroke ? { WebkitTextStroke: element.textStroke } : {}),
          }}
        >
          {element.text || "Text"}
        </p>
      </div>
    );
  }

  if (element.type === "image") {
    const imageConfig = resolveImageDisplayConfig(element);
    return (
      <div key={element.id || `play-${index}`} className="absolute overflow-hidden bg-slate-100" style={commonStyle}>
        {element.src ? (
          <img
            src={element.src}
            alt={element.alt || "Image"}
            className="h-full w-full"
            style={{
              objectFit: imageConfig.fit,
              objectPosition: `${imageConfig.positionX}% ${imageConfig.positionY}%`,
              transform: `scale(${imageConfig.zoom})`,
              transformOrigin: `${imageConfig.positionX}% ${imageConfig.positionY}%`,
            }}
          />
        ) : null}
      </div>
    );
  }

  if (element.type === "video") {
    return (
      <div key={element.id || `play-${index}`} className="absolute overflow-hidden bg-black" style={commonStyle}>
        <video
          src={element.src}
          poster={element.poster || undefined}
          className="h-full w-full object-contain"
          preload="metadata"
          autoPlay
          muted={element.muted ?? true}
          loop={element.loop ?? true}
          playsInline
        />
      </div>
    );
  }

  if (element.type === "rect") {
    return (
      <div
        key={element.id || `play-${index}`}
        className="absolute"
        style={{
          ...commonStyle,
          backgroundColor: element.fill || "#93c5fd",
          border: `${Math.max(0, element.strokeWidth ?? 0)}px solid ${element.stroke || "transparent"}`,
        }}
      />
    );
  }

  return (
    <div
      key={element.id || `play-${index}`}
      className="absolute"
      style={{
        ...commonStyle,
        backgroundColor: element.fill || "transparent",
      }}
    >
      <div
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
        style={{
          borderTop: `${Math.max(1, element.strokeWidth || 1)}px solid ${element.stroke || "#1f2937"}`,
        }}
      />
    </div>
  );
}

function resolveSlideDurationMs(content: PresentationSlideContent): number {
  const duration = Number(content.durationMs);
  if (!Number.isFinite(duration) || duration < 300) {
    return 3000;
  }
  return Math.round(duration);
}

function extractMetadataDurationSeconds(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const source = metadata as Record<string, unknown>;
  const durationMs = source.durationMs;
  if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs / 1000;
  }
  const durationSec = source.durationSeconds ?? source.durationSec ?? source.duration;
  if (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0) {
    return durationSec;
  }
  return null;
}

export default function PresentationEditor() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const trpcUtils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute(`${PRESENTATION_EDITOR_ROUTE_BASE}/:docId`);
  const docId = parseDocId(routeParams?.docId);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const itemQuery = trpc.library.getItem.useQuery(
    { id: docId || 0 },
    { enabled: Boolean(docId && isAuthenticated) },
  );

  const itemType = getItemType(itemQuery.data);

  const guardQuery = trpc.presentation.guardEditorOpen.useQuery(
    { itemId: docId || 0, itemType: itemType || PRESENTATION_ITEM_TYPE },
    { enabled: Boolean(docId && itemType) },
  );

  const deckQuery = trpc.presentation.getDeckByLibraryItem.useQuery(
    { libraryItemId: docId || 0 },
    {
      enabled: Boolean(
        docId
        && itemType === PRESENTATION_ITEM_TYPE
        && guardQuery.data?.allowed !== false,
      ),
      retry: false,
    },
  );

  const createDeckMutation = trpc.presentation.createDeck.useMutation();
  const updateDeckMutation = trpc.presentation.updateDeck.useMutation();
  const saveAsTemplateMutation = trpc.presentation.saveAsTemplate.useMutation();
  const addSlideMutation = trpc.presentation.addSlide.useMutation();
  const duplicateSlideMutation = trpc.presentation.duplicateSlide.useMutation();
  const deleteSlideMutation = trpc.presentation.deleteSlide.useMutation();
  const reorderSlidesMutation = trpc.presentation.reorderSlides.useMutation();
  const updateSlideMutation = trpc.presentation.updateSlide.useMutation();
  const restoreVersionMutation = trpc.presentation.restoreVersion.useMutation();
  const triggerExportMutation = trpc.presentation.triggerExport.useMutation();
  const relayoutSlideMutation = trpc.presentation.ai.relayoutSlide.useMutation();
  const resolvePendingMediaMutation = trpc.presentation.ai.resolvePendingMedia.useMutation();
  const updateItemMutation = trpc.library.updateItem.useMutation();

  const deckData = deckQuery.data as any;
  const deck = deckData?.deck;
  const slides = useMemo(() => {
    const raw = Array.isArray(deckData?.slides) ? deckData.slides : [];
    return [...raw].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [deckData?.slides]);
  const pendingMediaJobCount = useMemo(() => (
    slides.reduce((count, slide) => {
      try {
        const normalized = ensureSlideContent(slide.slideContent);
        return count + (normalized.pendingMediaJobs?.length ?? 0);
      } catch {
        return count;
      }
    }, 0)
  ), [slides]);
  const projectTitle = String(itemQuery.data?.title || deck?.title || (docId ? `Presentation ${docId}` : "Presentation"));
  const currentUserId = useMemo(() => {
    const parsed = Number(user?.id);
    return Number.isFinite(parsed) ? parsed : null;
  }, [user?.id]);

  const [selectedSlideId, setSelectedSlideId] = useState<number | null>(null);
  const [commandState, setCommandState] = useState<CanvasCommandState>(() =>
    createCanvasCommandState({ elements: [] }),
  );
  const slideDraftCacheRef = useRef<Map<number, PresentationSlideContent>>(new Map());
  const elementClipboardRef = useRef<PresentationElement[]>([]);
  const clipboardPasteCountRef = useRef(0);
  const commandBusRef = useRef(
    new CommandBus<CanvasCommandState>(createCanvasCommandState({ elements: [] })),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [expectedSlideVersion, setExpectedSlideVersion] = useState<number | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState(() => createConflictPolicyState());
  const conflictPolicyRef = useRef(conflictPolicy);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackSlideIndex, setPlaybackSlideIndex] = useState(0);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportWarnings, setExportWarnings] = useState<PresentationExportWarning[]>([]);
  const [lastExportId, setLastExportId] = useState<number | null>(null);
  const playbackOverlayRef = useRef<HTMLDivElement | null>(null);
  const playbackStageHostRef = useRef<HTMLDivElement | null>(null);
  const previewAudioPlayerRef = useRef<AudioTrackPlayer | null>(null);
  const previewAudioSlideIndexRef = useRef<number | null>(null);
  const previewAudioDeckSignatureRef = useRef<string | null>(null);
  const [playbackStageHostSize, setPlaybackStageHostSize] = useState({ width: 0, height: 0 });
  const [isPlaybackFullscreen, setIsPlaybackFullscreen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [isProjectTitleEditing, setIsProjectTitleEditing] = useState(false);
  const [isProjectTitleSaving, setIsProjectTitleSaving] = useState(false);
  const [autoDeckInitAttempted, setAutoDeckInitAttempted] = useState(false);
  const [autoDeckInitPending, setAutoDeckInitPending] = useState(false);
  const [autoDeckInitError, setAutoDeckInitError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => window.innerWidth < 1024);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [mobileSheetTab, setMobileSheetTab] = useState<MobileBottomSheetTab>("Properties");
  const [desktopInspectorTab, setDesktopInspectorTab] = useState<"properties" | "versions" | "audio">("properties");
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isAIDraftModalOpen, setIsAIDraftModalOpen] = useState(false);
  const [isAutoLayoutDialogOpen, setIsAutoLayoutDialogOpen] = useState(false);
  const [autoLayoutScope, setAutoLayoutScope] = useState<AutoLayoutScope>("current");
  const [autoLayoutTemplateChoice, setAutoLayoutTemplateChoice] = useState<AutoLayoutTemplateChoice>("auto");
  const [autoLayoutStyleChoice, setAutoLayoutStyleChoice] = useState<AutoLayoutStyleChoice>("auto");
  const [autoLayoutIncludeSvg, setAutoLayoutIncludeSvg] = useState(true);
  const [autoLayoutIncludeGeometricCrop, setAutoLayoutIncludeGeometricCrop] = useState(false);
  const [autoLayoutCropShapeChoice, setAutoLayoutCropShapeChoice] = useState<AutoLayoutCropShapeChoice>("auto");
  const [autoLayoutIncludeGeometricAccents, setAutoLayoutIncludeGeometricAccents] = useState(false);
  const [autoLayoutAccentShapeChoice, setAutoLayoutAccentShapeChoice] = useState<AutoLayoutAccentShapeChoice>("auto");
  const [autoLayoutWatermarkEnabled, setAutoLayoutWatermarkEnabled] = useState(false);
  const [autoLayoutWatermarkSourceUrl, setAutoLayoutWatermarkSourceUrl] = useState("");
  const [autoLayoutWatermarkClarityPercent, setAutoLayoutWatermarkClarityPercent] = useState(20);
  const [autoLayoutWatermarkSearchQuery, setAutoLayoutWatermarkSearchQuery] = useState("");
  const [debouncedAutoLayoutWatermarkSearchQuery, setDebouncedAutoLayoutWatermarkSearchQuery] = useState("");
  const [autoLayoutWatermarkSelectionCache, setAutoLayoutWatermarkSelectionCache] = useState<LibraryWatermarkOption | null>(null);
  const [autoLayoutProgress, setAutoLayoutProgress] = useState<{ done: number; total: number } | null>(null);
  const [timingDurationSecInput, setTimingDurationSecInput] = useState<string>("3");
  const [timingApplyAllPending, setTimingApplyAllPending] = useState(false);
  const [canvasApplyAllPending, setCanvasApplyAllPending] = useState(false);
  const [libraryTab, setLibraryTab] = useState<AssetLibraryTab>("slides");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [selectedSavedVersionId, setSelectedSavedVersionId] = useState<number | null>(null);
  const [restoreDialogVersionId, setRestoreDialogVersionId] = useState<number | null>(null);
  const [desktopViewport, setDesktopViewport] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [snapLockEnabled, setSnapLockEnabled] = useState(true);
  const [showElementFrames, setShowElementFrames] = useState(false);
  const mobileGestures = useMobileGestures();
  const isExportsEnabled = import.meta.env.VITE_PRESENTATION_EXPORTS_ENABLED !== "false";
  const availabilityQuery = trpc.presentation.availability.useQuery();
  const isAIGenerationEnabled = availabilityQuery.data?.aiGenerationEnabled === true;

  useEffect(() => {
    if (isProjectTitleEditing) {
      return;
    }
    setProjectTitleDraft(projectTitle);
  }, [projectTitle, isProjectTitleEditing]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAutoLayoutWatermarkSearchQuery(autoLayoutWatermarkSearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [autoLayoutWatermarkSearchQuery]);

  const slideshowQuery = trpc.presentation.getSlideshow.useQuery(
    { deckId: deck?.id || 0 },
    {
      enabled: Boolean(deck?.id),
    },
  );
  const versionHistoryQuery = trpc.presentation.listVersions.useQuery(
    {
      deckId: deck?.id || 0,
      limit: 20,
      offset: 0,
    },
    {
      enabled: Boolean(deck?.id),
    },
  );
  const savedVersions = useMemo(() => {
    return Array.isArray(versionHistoryQuery.data)
      ? (versionHistoryQuery.data as PresentationSavedVersionLike[])
      : [];
  }, [versionHistoryQuery.data]);
  const exportStatusQuery = trpc.presentation.getExportStatus.useQuery(
    { exportId: lastExportId ?? 0 },
    {
      enabled: Boolean(lastExportId),
      refetchInterval: 5000,
    },
  );
  const playDeckPreviewQuery = trpc.presentation.getPlayDeck.useQuery(
    { itemId: docId || 0 },
    {
      enabled: Boolean(docId),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  );
  const trimmedLibrarySearchQuery = librarySearchQuery.trim();

  const imageLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 40,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && (isAutoLayoutDialogOpen || (libraryTab === "photos" && trimmedLibrarySearchQuery.length === 0)),
      ),
    },
  );

  const imageLibrarySearchQuery = trpc.library.search.useQuery(
    {
      query: trimmedLibrarySearchQuery || undefined,
      limit: 40,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && libraryTab === "photos"
        && trimmedLibrarySearchQuery.length > 0,
      ),
    },
  );

  const autoLayoutWatermarkQuery = trpc.library.listDocuments.useQuery(
    {
      query: debouncedAutoLayoutWatermarkSearchQuery || undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 50,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && isAutoLayoutDialogOpen
        && autoLayoutWatermarkEnabled,
      ),
    },
  );

  const videoLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 40,
      offset: 0,
      filters: {
        itemType: "video",
      },
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && libraryTab === "videos"
        && trimmedLibrarySearchQuery.length === 0,
      ),
    },
  );

  const videoLibrarySearchQuery = trpc.library.search.useQuery(
    {
      query: trimmedLibrarySearchQuery || undefined,
      limit: 40,
      offset: 0,
      filters: {
        itemType: "video",
      },
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && libraryTab === "videos"
        && trimmedLibrarySearchQuery.length > 0,
      ),
    },
  );

  const imageHistoryQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: 80,
      offset: 0,
      daysAgo: 365,
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && libraryTab === "photos",
      ),
      refetchOnWindowFocus: false,
      staleTime: 20_000,
    },
  );

  const videoHistoryQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: "video",
      status: "completed",
      limit: 80,
      offset: 0,
      daysAgo: 365,
    },
    {
      enabled: Boolean(
        isAuthenticated
        && !authLoading
        && libraryTab === "videos",
      ),
      refetchOnWindowFocus: false,
      staleTime: 20_000,
    },
  );

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) || null,
    [slides, selectedSlideId],
  );
  const selectedSlideAudioTrack = (selectedSlide as any)?.audioTrack ?? null;
  const selectedSlideAudioItemQuery = trpc.library.getItem.useQuery(
    { id: selectedSlideAudioTrack?.libraryItemId ?? 0 },
    { enabled: Boolean(selectedSlideAudioTrack?.libraryItemId) },
  );
  const draftContent = commandState.content;
  const selectedElementIds = commandState.selectedElementIds;
  const selectedElementId = selectedElementIds[0] ?? null;
  const draftSignature = useMemo(
    () => buildDraftSignature(selectedSlide?.id ?? null, draftContent),
    [draftContent, selectedSlide?.id],
  );
  const persistedSlideSignature = useMemo(
    () => (selectedSlide
      ? buildDraftSignature(selectedSlide.id, ensureSlideContent(selectedSlide.slideContent))
      : null),
    [selectedSlide?.id, selectedSlide?.version, selectedSlide?.slideContent],
  );
  const hasUnsavedSelectedSlideChanges = useMemo(() => (
    Boolean(
      draftSignature
      && persistedSlideSignature
      && draftSignature !== persistedSlideSignature,
    )
  ), [draftSignature, persistedSlideSignature]);
  const unsavedCachedSlideIds = (() => {
    const result: number[] = [];
    for (const [slideId, cachedContent] of slideDraftCacheRef.current.entries()) {
      if (slideId === selectedSlideId) {
        continue;
      }
      const persistedSlide = slides.find((slide) => slide.id === slideId);
      if (!persistedSlide) {
        continue;
      }
      const persistedContent = ensureSlideContent(persistedSlide.slideContent);
      if (buildSlideContentSignature(persistedContent) !== buildSlideContentSignature(cachedContent)) {
        result.push(slideId);
      }
    }
    return result;
  })();
  const hasUnsavedSlideChanges = hasUnsavedSelectedSlideChanges || unsavedCachedSlideIds.length > 0;
  const autoLayoutBusy = autoLayoutProgress !== null || relayoutSlideMutation.isPending;
  const autoLayoutTargetCount = autoLayoutScope === "all"
    ? slides.length
    : (selectedSlide ? 1 : 0);
  const autoLayoutStyleOptions = useMemo(
    () => BUILT_IN_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.nameLocalized?.en?.trim() || preset.name,
      colors: [
        preset.colors.background,
        preset.colors.primary,
        preset.colors.secondary,
      ],
    })),
    [],
  );
  const selectedAutoLayoutStyleOption = autoLayoutStyleOptions.find(
    (option) => option.id === autoLayoutStyleChoice,
  );
  const isMobilePanMode = isMobileViewport && mobileGestures.state.mode === "pan_mode";
  const selectedElement = useMemo(
    () => draftContent.elements.find((element) => element.id === selectedElementId) || null,
    [draftContent.elements, selectedElementId],
  );
  const selectedElements = useMemo(
    () => draftContent.elements.filter((element) => selectedElementIds.includes(element.id)),
    [draftContent.elements, selectedElementIds],
  );
  const selectionHasMixedTypes = useMemo(() => {
    if (selectedElements.length <= 1) {
      return false;
    }
    return new Set(selectedElements.map((element) => element.type)).size > 1;
  }, [selectedElements]);
  const firstVideoSourceUrl = useMemo(() => {
    const firstVideo = draftContent.elements.find((element) => element.type === "video");
    if (!firstVideo || firstVideo.type !== "video") {
      return null;
    }
    return (firstVideo.src || "").trim() || null;
  }, [draftContent.elements]);
  const [selectedSlideAudioDurationSec, setSelectedSlideAudioDurationSec] = useState<number | null>(null);
  const [selectedSlideVideoDurationSec, setSelectedSlideVideoDurationSec] = useState<number | null>(null);
  const imageLibraryAssets = useMemo(
    () => normalizeLibraryMediaItems(
      trimmedLibrarySearchQuery.length > 0
        ? imageLibrarySearchQuery.data?.results
        : imageLibraryQuery.data?.results,
      "image",
      currentUserId,
    ),
    [
      currentUserId,
      imageLibraryQuery.data?.results,
      imageLibrarySearchQuery.data?.results,
      trimmedLibrarySearchQuery,
    ],
  );
  const autoLayoutWatermarkOptions = useMemo(
    () => normalizeWatermarkLibraryOptions(autoLayoutWatermarkQuery.data?.results),
    [autoLayoutWatermarkQuery.data?.results],
  );
  const autoLayoutWatermarkComboboxItems = useMemo(
    () => autoLayoutWatermarkOptions.map((option) => ({
      value: option.sourceUrl,
      label: option.label,
      description: `.${option.format}`,
    })),
    [autoLayoutWatermarkOptions],
  );
  const resolveAutoLayoutWatermarkOption = useCallback((sourceUrl: string): LibraryWatermarkOption | null => {
    const normalizedSourceUrl = sourceUrl.trim();
    if (!normalizedSourceUrl) {
      return null;
    }
    const fromCurrentQuery = autoLayoutWatermarkOptions.find((option) => option.sourceUrl === normalizedSourceUrl);
    if (fromCurrentQuery) {
      return fromCurrentQuery;
    }
    if (autoLayoutWatermarkSelectionCache?.sourceUrl === normalizedSourceUrl) {
      return autoLayoutWatermarkSelectionCache;
    }
    const inferredFormat = inferWatermarkFormatFromSourceUrl(normalizedSourceUrl);
    if (!inferredFormat) {
      return null;
    }
    return {
      id: -1,
      label: normalizedSourceUrl.split("/").pop() || "Selected watermark",
      sourceUrl: normalizedSourceUrl,
      thumbnailUrl: normalizedSourceUrl,
      format: inferredFormat,
    };
  }, [autoLayoutWatermarkOptions, autoLayoutWatermarkSelectionCache]);
  const selectedAutoLayoutWatermarkOption = useMemo(
    () => resolveAutoLayoutWatermarkOption(autoLayoutWatermarkSourceUrl),
    [resolveAutoLayoutWatermarkOption, autoLayoutWatermarkSourceUrl],
  );
  const handleAutoLayoutWatermarkSourceChange = useCallback((sourceUrl: string) => {
    setAutoLayoutWatermarkSourceUrl(sourceUrl);
    const selected = autoLayoutWatermarkOptions.find((option) => option.sourceUrl === sourceUrl) || null;
    if (selected) {
      setAutoLayoutWatermarkSelectionCache(selected);
    }
  }, [autoLayoutWatermarkOptions]);
  const autoLayoutCanApplyWatermark = !autoLayoutWatermarkEnabled || selectedAutoLayoutWatermarkOption !== null;
  const autoLayoutApplyDisabled = !deck
    || !selectedSlide
    || autoLayoutBusy
    || autoLayoutTargetCount <= 0
    || !autoLayoutCanApplyWatermark;
  const videoLibraryAssets = useMemo(
    () => normalizeLibraryMediaItems(
      trimmedLibrarySearchQuery.length > 0
        ? videoLibrarySearchQuery.data?.results
        : videoLibraryQuery.data?.results,
      "video",
      currentUserId,
    ),
    [
      currentUserId,
      trimmedLibrarySearchQuery,
      videoLibraryQuery.data?.results,
      videoLibrarySearchQuery.data?.results,
    ],
  );
  const imageHistoryAssets = useMemo(
    () => normalizeMediaHistoryItems(imageHistoryQuery.data?.tasks, "image", trimmedLibrarySearchQuery),
    [imageHistoryQuery.data?.tasks, trimmedLibrarySearchQuery],
  );
  const videoHistoryAssets = useMemo(
    () => normalizeMediaHistoryItems(videoHistoryQuery.data?.tasks, "video", trimmedLibrarySearchQuery),
    [trimmedLibrarySearchQuery, videoHistoryQuery.data?.tasks],
  );
  const mergedImageLibraryAssets = useMemo(
    () => mergeLibraryAssets(imageHistoryAssets, imageLibraryAssets),
    [imageHistoryAssets, imageLibraryAssets],
  );
  const mergedVideoLibraryAssets = useMemo(
    () => mergeLibraryAssets(videoHistoryAssets, videoLibraryAssets),
    [videoHistoryAssets, videoLibraryAssets],
  );
  const currentLibraryAssets = libraryTab === "videos" ? mergedVideoLibraryAssets : mergedImageLibraryAssets;
  const imageLibraryLoading = (trimmedLibrarySearchQuery.length > 0
    ? imageLibrarySearchQuery.isLoading
    : imageLibraryQuery.isLoading)
    || imageHistoryQuery.isLoading;
  const videoLibraryLoading = (trimmedLibrarySearchQuery.length > 0
    ? videoLibrarySearchQuery.isLoading
    : videoLibraryQuery.isLoading)
    || videoHistoryQuery.isLoading;
  const libraryLoading = libraryTab === "videos" ? videoLibraryLoading : imageLibraryLoading;
  useEffect(() => {
    if (!autoLayoutWatermarkEnabled || autoLayoutWatermarkSourceUrl) {
      return;
    }
    const first = autoLayoutWatermarkOptions[0];
    if (!first) {
      return;
    }
    setAutoLayoutWatermarkSourceUrl(first.sourceUrl);
    setAutoLayoutWatermarkSelectionCache(first);
  }, [autoLayoutWatermarkEnabled, autoLayoutWatermarkSourceUrl, autoLayoutWatermarkOptions]);
  useEffect(() => {
    if (isAutoLayoutDialogOpen) {
      return;
    }
    setAutoLayoutWatermarkSearchQuery("");
    setDebouncedAutoLayoutWatermarkSearchQuery("");
  }, [isAutoLayoutDialogOpen]);
  const activeCanvasSize = useMemo(
    () => normalizeCanvasSize(draftContent.canvas),
    [draftContent.canvas],
  );
  const slidesById = useMemo(() => {
    const map = new Map<number, (typeof slides)[number]>();
    for (const slide of slides) {
      map.set(slide.id, slide);
    }
    return map;
  }, [slides]);
  const groupedSavedVersions = useMemo<PresentationVersionGroup[]>(() => {
    const grouped = new Map<string, PresentationVersionGroup>();

    for (const version of savedVersions) {
      const slideId = normalizeSlideId(version.snapshot?.slideId);
      const key = slideId ? `slide-${slideId}` : "slide-unknown";
      const linkedSlide = slideId ? slidesById.get(slideId) : null;
      const groupLabel = linkedSlide
        ? `Slide ${linkedSlide.orderIndex + 1}: ${linkedSlide.title}`
        : version.snapshot?.slideTitle
          ? `Slide: ${version.snapshot.slideTitle}`
          : slideId
            ? `Slide #${slideId}`
            : "Unknown slide";
      const sortOrder = linkedSlide ? linkedSlide.orderIndex : Number.MAX_SAFE_INTEGER;
      const existing = grouped.get(key);
      if (existing) {
        existing.items.push(version);
        continue;
      }
      grouped.set(key, {
        key,
        slideId,
        label: groupLabel,
        sortOrder,
        items: [version],
      });
    }

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => {
          const aTs = new Date(a.snapshot?.savedAt || a.createdAt || 0).getTime();
          const bTs = new Date(b.snapshot?.savedAt || b.createdAt || 0).getTime();
          return bTs - aTs;
        }),
      }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.label.localeCompare(b.label);
      });
  }, [savedVersions, slidesById]);
  const selectedSavedVersion = useMemo(
    () => savedVersions.find((version) => version.id === selectedSavedVersionId) || null,
    [savedVersions, selectedSavedVersionId],
  );
  const selectedSavedVersionSlideId = normalizeSlideId(selectedSavedVersion?.snapshot?.slideId);
  const selectedSavedVersionSlide = selectedSavedVersionSlideId
    ? slidesById.get(selectedSavedVersionSlideId) || null
    : null;
  const selectedSavedVersionContent = useMemo(
    () => (selectedSavedVersion ? normalizeVersionSlideContent(selectedSavedVersion) : null),
    [selectedSavedVersion],
  );
  const selectedSavedVersionCurrentState = useMemo<SlideComparisonState | null>(() => {
    if (!selectedSavedVersionSlide) {
      return null;
    }
    const activeContent = selectedSlideId === selectedSavedVersionSlide.id
      ? draftContent
      : ensureSlideContent(selectedSavedVersionSlide.slideContent);
    return {
      title: selectedSavedVersionSlide.title,
      notes: selectedSavedVersionSlide.notes,
      content: activeContent,
    };
  }, [draftContent, selectedSavedVersionSlide, selectedSlideId]);
  const selectedSavedVersionSnapshotState = useMemo<SlideComparisonState | null>(() => {
    if (!selectedSavedVersion || !selectedSavedVersionContent) {
      return null;
    }
    return {
      title: selectedSavedVersion.snapshot?.slideTitle || "Slide",
      notes: selectedSavedVersion.snapshot?.notes ?? null,
      content: selectedSavedVersionContent,
    };
  }, [selectedSavedVersion, selectedSavedVersionContent]);
  const selectedSavedVersionDiffSummary = useMemo(() => {
    if (!selectedSavedVersionSnapshotState) {
      return null;
    }
    return buildSlideDiffSummary(
      selectedSavedVersionCurrentState,
      selectedSavedVersionSnapshotState,
    );
  }, [selectedSavedVersionCurrentState, selectedSavedVersionSnapshotState]);
  const currentVersionPreview = useMemo(() => {
    if (!selectedSavedVersionCurrentState) {
      return null;
    }
    return summarizeSlidePreview(selectedSavedVersionCurrentState.content);
  }, [selectedSavedVersionCurrentState]);
  const selectedVersionPreview = useMemo(() => {
    if (!selectedSavedVersionSnapshotState) {
      return null;
    }
    return summarizeSlidePreview(selectedSavedVersionSnapshotState.content);
  }, [selectedSavedVersionSnapshotState]);
  const restoreDialogVersion = useMemo(
    () => savedVersions.find((version) => version.id === restoreDialogVersionId) || null,
    [restoreDialogVersionId, savedVersions],
  );
  const playbackSlides = useMemo(() => {
    return slides.map((slide) => {
      const cachedContent = slideDraftCacheRef.current.get(slide.id);
      const content = selectedSlideId === slide.id
        ? draftContent
        : cachedContent ?? ensureSlideContent(slide.slideContent);
      return {
        slideId: slide.id,
        title: slide.title,
        orderIndex: slide.orderIndex,
        content,
        durationMs: resolveSlideDurationMs(content),
      };
    });
  }, [draftContent, selectedSlideId, slides]);
  const activeViewport = isMobileViewport
    ? mobileGestures.state.viewport
    : desktopViewport;
  const deckVersionRef = useRef<number | null>(null);
  const [deckMutationBusy, setDeckMutationBusy] = useState(false);

  function syncCommandState(next: CanvasCommandState) {
    setCommandState(next);
    setSaveState("idle");
  }

  function executeCommand(command: Parameters<CommandBus<CanvasCommandState>["execute"]>[0]) {
    syncCommandState(commandBusRef.current.execute(command));
  }

  function cacheSlideDraft(slideId: number | null, content: PresentationSlideContent) {
    if (!slideId) return;
    slideDraftCacheRef.current.set(slideId, ensureSlideContent(content));
  }

  function clearCachedSlideDraft(slideId: number | null) {
    if (!slideId) return;
    slideDraftCacheRef.current.delete(slideId);
  }

  function switchToSlide(nextSlideId: number) {
    if (selectedSlideId === nextSlideId) {
      return;
    }
    cacheSlideDraft(selectedSlideId, draftContent);
    setSelectedSlideId(nextSlideId);
  }

  useEffect(() => {
    deckVersionRef.current =
      deck && Number.isFinite(Number(deck.version))
        ? Number(deck.version)
        : null;
  }, [deck?.id, deck?.version]);

  useEffect(() => {
    conflictPolicyRef.current = conflictPolicy;
  }, [conflictPolicy]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth < 1024);
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!slides.length) {
      setSelectedSlideId(null);
      return;
    }

    if (selectedSlideId && slides.some((slide) => slide.id === selectedSlideId)) {
      return;
    }

    setSelectedSlideId(slides[0].id);
  }, [selectedSlideId, slides]);

  useEffect(() => {
    if (!slides.length) {
      slideDraftCacheRef.current.clear();
      return;
    }
    const slidesById = new Map<number, (typeof slides)[number]>();
    for (const slide of slides) {
      slidesById.set(slide.id, slide);
    }
    for (const [slideId, cached] of slideDraftCacheRef.current.entries()) {
      const persistedSlide = slidesById.get(slideId);
      if (!persistedSlide) {
        slideDraftCacheRef.current.delete(slideId);
        continue;
      }
      const persistedContent = ensureSlideContent(persistedSlide.slideContent);
      if (buildSlideContentSignature(persistedContent) === buildSlideContentSignature(cached)) {
        slideDraftCacheRef.current.delete(slideId);
      }
    }
  }, [slides]);

  useEffect(() => {
    if (!hasUnsavedSlideChanges || typeof window === "undefined") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, window.location.href);
      const sameRoute = nextUrl.origin === currentUrl.origin
        && nextUrl.pathname === currentUrl.pathname
        && nextUrl.search === currentUrl.search;
      if (sameRoute) {
        return;
      }

      const confirmed = window.confirm(UNSAVED_PRESENTATION_WARNING);
      if (confirmed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedSlideChanges]);

  useEffect(() => {
    const currentSeconds = resolveSlideDurationMs(draftContent) / 1000;
    setTimingDurationSecInput(currentSeconds.toFixed(1).replace(/\.0$/, ""));
  }, [draftContent.durationMs, selectedSlide?.id]);

  useEffect(() => {
    const metadataSeconds = extractMetadataDurationSeconds(selectedSlideAudioItemQuery.data?.metadata);
    if (metadataSeconds != null) {
      setSelectedSlideAudioDurationSec(metadataSeconds);
      return;
    }
    const sourceUrl = selectedSlideAudioItemQuery.data?.sourceUrl;
    if (!sourceUrl) {
      setSelectedSlideAudioDurationSec(null);
      return;
    }
    let cancelled = false;
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = sourceUrl;
    const onLoaded = () => {
      if (cancelled) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setSelectedSlideAudioDurationSec(audio.duration);
      } else {
        setSelectedSlideAudioDurationSec(null);
      }
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.src = "";
    };
  }, [selectedSlideAudioItemQuery.data?.metadata, selectedSlideAudioItemQuery.data?.sourceUrl]);

  useEffect(() => {
    if (!firstVideoSourceUrl) {
      setSelectedSlideVideoDurationSec(null);
      return;
    }
    let cancelled = false;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = firstVideoSourceUrl;
    const onLoaded = () => {
      if (cancelled) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setSelectedSlideVideoDurationSec(video.duration);
      } else {
        setSelectedSlideVideoDurationSec(null);
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoaded);
      video.src = "";
    };
  }, [firstVideoSourceUrl]);

  useEffect(() => {
    if (!savedVersions.length) {
      setSelectedSavedVersionId(null);
      return;
    }

    if (selectedSavedVersionId && savedVersions.some((version) => version.id === selectedSavedVersionId)) {
      return;
    }

    setSelectedSavedVersionId(savedVersions[0].id);
  }, [savedVersions, selectedSavedVersionId]);

  useEffect(() => {
    if (!selectedSlide) {
      const empty = createCanvasCommandState({ elements: [] });
      commandBusRef.current.reset(empty);
      setCommandState(empty);
      setSaveState("idle");
      setExpectedSlideVersion(null);
      setConflictPolicy(releaseStaleBlock());
      return;
    }

    const cachedDraft = slideDraftCacheRef.current.get(selectedSlide.id);
    const next = cachedDraft
      ? ensureSlideContent(cachedDraft)
      : ensureSlideContent(selectedSlide.slideContent);
    const nextSelected = next.elements[0]?.id ? [next.elements[0].id] : [];
    const nextState = createCanvasCommandState(next, nextSelected);
    commandBusRef.current.reset(nextState);
    setCommandState(nextState);
    setSaveState("idle");
    setExpectedSlideVersion(selectedSlide.version);
    setConflictPolicy(releaseStaleBlock());
  }, [selectedSlide?.id, selectedSlide?.version]);

  async function refreshDeck() {
    const tasks: Array<Promise<unknown>> = [];
    if (typeof deckQuery.refetch === "function") {
      tasks.push(deckQuery.refetch());
    }
    if (typeof playDeckPreviewQuery.refetch === "function") {
      tasks.push(playDeckPreviewQuery.refetch());
    }
    if (tasks.length) {
      await Promise.all(tasks);
    }
  }

  async function readLatestDeckVersion(): Promise<number | null> {
    if (typeof deckQuery.refetch !== "function") {
      return deckVersionRef.current;
    }
    const result = await deckQuery.refetch();
    const latest = Number((result.data as any)?.deck?.version);
    if (Number.isFinite(latest) && latest >= 0) {
      deckVersionRef.current = latest;
      return latest;
    }
    return deckVersionRef.current;
  }

  function getExpectedDeckVersion(): number {
    const candidate = deckVersionRef.current ?? Number(deck?.version);
    if (Number.isFinite(candidate) && candidate >= 0) {
      return Number(candidate);
    }
    return 0;
  }

  async function runDeckMutation<T>(
    runner: (expectedVersion: number) => Promise<T>,
  ): Promise<T | null> {
    if (!deck || deckMutationBusy) {
      return null;
    }

    setDeckMutationBusy(true);
    try {
      let expectedVersion = getExpectedDeckVersion();
      let result: T | null = null;
      try {
        result = await runner(expectedVersion);
      } catch (error) {
        if (!isConflictError(error)) {
          throw error;
        }
        const latestVersion = await readLatestDeckVersion();
        if (latestVersion == null || latestVersion === expectedVersion) {
          throw error;
        }
        expectedVersion = latestVersion;
        result = await runner(expectedVersion);
      }

      deckVersionRef.current = expectedVersion + 1;
      await refreshDeck();
      return result;
    } finally {
      setDeckMutationBusy(false);
    }
  }

  async function handleCreateDeck() {
    if (!docId) return;
    await createDeckMutation.mutateAsync({
      libraryItemId: docId,
      title: String((itemQuery.data as any)?.title || `Presentation ${docId}`),
    });
    await refreshDeck();
  }

  async function handleAddSlide() {
    if (!deck) return;
    const created = await runDeckMutation(async (expectedVersion) => (
      addSlideMutation.mutateAsync({
        deckId: deck.id,
        expectedVersion,
        title: `Slide ${(slides.length || 0) + 1}`,
        slideContent: { elements: [] },
      })
    ));
    if (created) {
      const createdSlideId = Number((created as any).id);
      if (Number.isFinite(createdSlideId) && createdSlideId > 0) {
        switchToSlide(createdSlideId);
      }
      setLibraryTab("slides");
    }
  }

  async function handleDuplicateSlide() {
    if (!deck || !selectedSlide) return;
    const duplicated = await runDeckMutation(async (expectedVersion) => (
      duplicateSlideMutation.mutateAsync({
        deckId: deck.id,
        expectedVersion,
        slideId: selectedSlide.id,
        targetIndex: selectedSlide.orderIndex + 1,
      })
    ));
    const duplicatedSlideId = Number((duplicated as any)?.id);
    if (Number.isFinite(duplicatedSlideId) && duplicatedSlideId > 0) {
      switchToSlide(duplicatedSlideId);
    }
  }

  async function handleDeleteSlide() {
    if (!deck || !selectedSlide) return;
    clearCachedSlideDraft(selectedSlide.id);
    await runDeckMutation(async (expectedVersion) => {
      await deleteSlideMutation.mutateAsync({
        deckId: deck.id,
        slideId: selectedSlide.id,
        expectedVersion,
      });
    });
  }

  async function handleMoveSlide(direction: "up" | "down") {
    if (!deck || !selectedSlide) return;
    const targetIndex =
      direction === "up"
        ? Math.max(0, selectedSlide.orderIndex - 1)
        : Math.min(Math.max(0, slides.length - 1), selectedSlide.orderIndex + 1);
    if (targetIndex === selectedSlide.orderIndex) {
      return;
    }

    await runDeckMutation(async (expectedVersion) => {
      await reorderSlidesMutation.mutateAsync({
        deckId: deck.id,
        movedSlideId: selectedSlide.id,
        targetIndex,
        expectedVersion,
      });
    });
  }

  function isTouchActionAllowed(minTouchTargetPx: number): boolean {
    if (!isMobileViewport) {
      return true;
    }

    if (isMobilePanMode) {
      mobileGestures.canUseTouchTarget(0);
      return false;
    }

    return mobileGestures.canUseTouchTarget(minTouchTargetPx);
  }

  function handleAddElement(type: PresentationElementType) {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    const element = createElement(type, nextElementId(type));
    executeCommand(addElementCommand(element));
  }

  function insertLibraryAsset(
    asset: CanvasLibraryAsset,
    position?: { x: number; y: number },
  ) {
    const type: PresentationElementType = asset.kind === "video" ? "video" : "image";
    const created = createElement(type, nextElementId(type));
    const defaultX = Math.max(0, Math.round((activeCanvasSize.width - created.width) / 2));
    const defaultY = Math.max(0, Math.round((activeCanvasSize.height - created.height) / 2));
    const nextX = Math.max(
      0,
      Math.min(Math.max(0, activeCanvasSize.width - created.width), position?.x ?? defaultX),
    );
    const nextY = Math.max(
      0,
      Math.min(Math.max(0, activeCanvasSize.height - created.height), position?.y ?? defaultY),
    );
    const nextElement =
      type === "video"
        ? {
          ...created,
          src: asset.sourceUrl,
          poster: asset.thumbnailUrl || "",
          title: asset.title,
          x: nextX,
          y: nextY,
        }
        : {
          ...created,
          src: asset.sourceUrl,
          alt: asset.title,
          x: nextX,
          y: nextY,
        };
    executeCommand(addElementCommand(nextElement));
  }

  function handleInsertGraphic(graphic: SvgGraphic) {
    const type: PresentationElementType = "image";
    const id = nextElementId(type);
    const size = Math.min(activeCanvasSize.width, activeCanvasSize.height) * 0.2;
    const defaultX = Math.max(0, Math.round((activeCanvasSize.width - size) / 2));
    const defaultY = Math.max(0, Math.round((activeCanvasSize.height - size) / 2));
    // Store raw SVG (with currentColor placeholder) so color can be changed later
    const nextElement = {
      ...createElement(type, id),
      src: "",
      alt: graphic.label,
      svgContent: graphic.svg,
      svgColor: "#ffffff",
      width: Math.round(size),
      height: Math.round(size),
      x: defaultX,
      y: defaultY,
    };
    executeCommand(addElementCommand(nextElement as any));
    setLibraryTab("slides");
  }

  function handleDragAssetStart(event: DragEvent<HTMLElement>, asset: CanvasLibraryAsset) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      CANVAS_LIBRARY_ASSET_DRAG_MIME,
      JSON.stringify({
        kind: asset.kind,
        title: asset.title,
        sourceUrl: asset.sourceUrl,
        thumbnailUrl: asset.thumbnailUrl,
      }),
    );
  }

  function handleCanvasDropAsset(payload: CanvasStageDropAssetPayload) {
    insertLibraryAsset(
      {
        id: Date.now(),
        kind: payload.kind,
        title: payload.title,
        sourceUrl: payload.sourceUrl,
        thumbnailUrl: payload.thumbnailUrl || null,
      },
      { x: payload.x, y: payload.y },
    );
  }

  function updateDesktopZoom(nextScale: number) {
    const normalizedScale = Math.min(MAX_DESKTOP_ZOOM, Math.max(MIN_DESKTOP_ZOOM, Number(nextScale.toFixed(2))));
    setDesktopViewport((previous) => ({
      scale: normalizedScale,
      offsetX: normalizedScale <= 1 ? 0 : previous.offsetX,
      offsetY: normalizedScale <= 1 ? 0 : previous.offsetY,
    }));
  }

  function handleDesktopViewportChange(nextViewport: { scale: number; offsetX: number; offsetY: number }) {
    setDesktopViewport(nextViewport);
  }

  function handleChangeCanvasPreset(presetId: string) {
    const preset = getCanvasPresetById(presetId);
    if (!preset) {
      return;
    }

    executeCommand(
      setCanvasSizeCommand({
        preset: preset.id,
        width: preset.width,
        height: preset.height,
      }),
    );
  }

  async function handleApplyCanvasPresetAllSlides(presetId: string) {
    if (!deck || !slides.length || canvasApplyAllPending) {
      return;
    }
    const preset = getCanvasPresetById(presetId);
    if (!preset) {
      toast.error("Invalid canvas preset.");
      return;
    }

    setCanvasApplyAllPending(true);
    try {
      for (const slide of slides) {
        const baseContent = slide.id === selectedSlide?.id
          ? draftContent
          : ensureSlideContent(slide.slideContent);
        await updateSlideMutation.mutateAsync({
          deckId: deck.id,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "manual",
          title: slide.title,
          slideContent: resizeCanvas(baseContent, {
            preset: preset.id,
            width: preset.width,
            height: preset.height,
          }),
        });
      }
      await refreshDeck();
      toast.success(`Applied canvas ${preset.label} to all slides.`);
    } catch (error) {
      toast.error(`Failed to apply canvas size to all slides: ${String((error as Error)?.message || error)}`);
    } finally {
      setCanvasApplyAllPending(false);
    }
  }

  function handleSelectElement(elementId: string, options?: { additive?: boolean }) {
    if (options?.additive) {
      const toggled = SelectionEngine.toggle(
        { selectedIds: selectedElementIds, activeId: selectedElementId },
        elementId,
      );
      const nextSelectedIds = toggled.selectedIds.includes(elementId)
        ? [elementId, ...toggled.selectedIds.filter((id) => id !== elementId)]
        : toggled.selectedIds;
      executeCommand(selectElementsCommand(nextSelectedIds));
      return;
    }

    executeCommand(selectElementsCommand([elementId]));
  }

  function handleMarqueeSelect(
    bounds: { x: number; y: number; width: number; height: number },
    options?: { additive?: boolean },
  ) {
    const candidates = draftContent.elements.map((element) => ({
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: Math.max(2, element.height),
    }));
    const next = SelectionEngine.marquee(
      { selectedIds: selectedElementIds, activeId: selectedElementId },
      bounds,
      candidates,
      { additive: options?.additive },
    );
    const ordered = next.activeId && next.selectedIds.includes(next.activeId)
      ? [next.activeId, ...next.selectedIds.filter((id) => id !== next.activeId)]
      : next.selectedIds;
    executeCommand(selectElementsCommand(ordered));
  }

  function handlePatchSelectedElement(patch: Parameters<typeof patchSelectedElementCommand>[0]) {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    executeCommand(patchSelectedElementCommand(patch));
  }

  function handlePatchElementById(
    elementId: string,
    patch: Parameters<typeof patchSelectedElementCommand>[0],
  ) {
    executeCommand(patchElementByIdCommand(elementId, patch));
  }

  function handleMoveSelection(deltaX: number, deltaY: number) {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    executeCommand(moveSelectionCommand(deltaX, deltaY, snapLockEnabled));
  }

  function handleResizeSelection(width: number, height: number) {
    if (isMobileViewport) {
      mobileGestures.canUseTouchTarget(24);
      return;
    }

    executeCommand(resizeSelectionCommand(width, height));
  }

  function handleRotateSelection(deltaDegrees: number) {
    if (isMobileViewport) {
      mobileGestures.canUseTouchTarget(24);
      return;
    }

    executeCommand(rotateSelectionCommand(deltaDegrees));
  }

  // --- Drag (continuous) variants — merge into a single undo entry per gesture ---

  function handleDragMove(deltaX: number, deltaY: number) {
    if (!isTouchActionAllowed(40)) return;
    syncCommandState(
      commandBusRef.current.executeAndMerge(moveSelectionCommand(deltaX, deltaY, snapLockEnabled)),
    );
  }

  function handleDragResize(width: number, height: number) {
    if (isMobileViewport) return;
    syncCommandState(commandBusRef.current.executeAndMerge(resizeSelectionCommand(width, height)));
  }

  function handleDragRotate(deltaDegrees: number) {
    if (isMobileViewport) return;
    syncCommandState(commandBusRef.current.executeAndMerge(rotateSelectionCommand(deltaDegrees)));
  }

  function handleDragEnd() {
    commandBusRef.current.breakMerge();
  }

  function handleArrangeSelection(direction: ArrangeDirection) {
    if (isMobileViewport) {
      mobileGestures.canUseTouchTarget(24);
      return;
    }

    executeCommand(arrangeSelectionCommand(direction));
  }

  function handleUndo() {
    syncCommandState(commandBusRef.current.undo());
  }

  function handleRedo() {
    syncCommandState(commandBusRef.current.redo());
  }

  function handleDuplicateSelection() {
    executeCommand(
      duplicateSelectionCommand((source) => nextElementId(source.type as PresentationElementType)),
    );
  }

  function cloneElementsForClipboard(elements: PresentationElement[]): PresentationElement[] {
    return elements.map((element) => JSON.parse(JSON.stringify(element)) as PresentationElement);
  }

  function handleCopySelection() {
    if (!selectedElementIds.length) {
      return;
    }
    const selectedIdSet = new Set(selectedElementIds);
    const ordered = draftContent.elements.filter((element) => selectedIdSet.has(element.id));
    if (!ordered.length) {
      return;
    }
    elementClipboardRef.current = cloneElementsForClipboard(ordered);
    clipboardPasteCountRef.current = 0;
  }

  function handleCutSelection() {
    if (!selectedElementIds.length) {
      return;
    }
    handleCopySelection();
    handleDeleteSelection();
  }

  function handlePasteSelection() {
    const clipboardElements = elementClipboardRef.current;
    if (!clipboardElements.length) {
      return;
    }
    const offset = 16 * (clipboardPasteCountRef.current + 1);
    executeCommand({
      id: "paste-selection",
      apply: (state) => {
        const pasted = clipboardElements.map((source) => ({
          ...source,
          id: nextElementId(source.type as PresentationElementType),
          x: source.x + offset,
          y: source.y + offset,
        }));
        return {
          ...state,
          content: {
            ...state.content,
            elements: [...state.content.elements, ...pasted],
          },
          selectedElementIds: pasted.map((element) => element.id),
          snapGuides: [],
        };
      },
    });
    clipboardPasteCountRef.current += 1;
  }

  function handleDeleteSelection() {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    executeCommand(deleteSelectionCommand());
  }

  function handleToggleMobileMode() {
    mobileGestures.setMode(
      mobileGestures.state.mode === "pan_mode" ? "edit_mode" : "pan_mode",
    );
  }

  function handleApplyMobilePanGesture() {
    mobileGestures.applyGesture({
      startDistance: 100,
      currentDistance: 120,
      deltaX: 12,
      deltaY: 8,
    });
  }

  function parseTimingDurationMsFromInput(): number | null {
    const numericSeconds = Number.parseFloat(timingDurationSecInput);
    if (!Number.isFinite(numericSeconds) || numericSeconds <= 0) {
      return null;
    }
    return Math.max(MIN_SLIDE_DURATION_MS, Math.round(numericSeconds * 1000));
  }

  function applyDurationToSelectedDraft(durationMs: number) {
    if (!selectedSlide) return;
    syncCommandState({
      ...commandState,
      content: {
        ...draftContent,
        durationMs,
      },
    });
  }

  function handleApplySelectedSlideDuration() {
    const durationMs = parseTimingDurationMsFromInput();
    if (!durationMs) {
      toast.error("Please enter a valid slide duration in seconds.");
      return;
    }
    applyDurationToSelectedDraft(durationMs);
  }

  async function handleApplyDurationAllSlides() {
    if (!deck || !slides.length || timingApplyAllPending) {
      return;
    }
    const durationMs = parseTimingDurationMsFromInput();
    if (!durationMs) {
      toast.error("Please enter a valid slide duration in seconds.");
      return;
    }

    setTimingApplyAllPending(true);
    try {
      for (const slide of slides) {
        const baseContent = slide.id === selectedSlide?.id
          ? draftContent
          : ensureSlideContent(slide.slideContent);
        await updateSlideMutation.mutateAsync({
          deckId: deck.id,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "manual",
          title: slide.title,
          slideContent: {
            ...baseContent,
            durationMs,
          },
        });
      }
      await refreshDeck();
      toast.success(`Applied ${(durationMs / 1000).toFixed(1).replace(/\.0$/, "")}s to all slides.`);
    } catch (error) {
      toast.error(`Failed to apply duration to all slides: ${String((error as Error)?.message || error)}`);
    } finally {
      setTimingApplyAllPending(false);
    }
  }

  const performSave = useCallback(async (saveMode: SaveMode): Promise<"saved" | "skipped"> => {
    if (!deck || !selectedSlide) {
      return "skipped";
    }

    const normalizedPolicy = normalizeConflictPolicy(conflictPolicyRef.current, Date.now());
    if (normalizedPolicy !== conflictPolicyRef.current) {
      setConflictPolicy(normalizedPolicy);
      conflictPolicyRef.current = normalizedPolicy;
    }

    const blockedReason = shouldBlockSaveAttempt(normalizedPolicy, saveMode, Date.now());
    if (blockedReason) {
      if (blockedReason === "stale_blocked") {
        setSaveState("conflict");
      }

      if (saveMode === "autosave") {
        trackAutosaveResult({
          result: blockedReason,
          deckId: deck.id,
          slideId: selectedSlide.id,
          mode: "autosave",
        });
      }
      return "skipped";
    }

    const version = expectedSlideVersion ?? selectedSlide.version;
    setSaveState("pending");

    const finalizeSaveSuccess = (nextSlide: unknown, fallbackVersion: number) => {
      const returnedVersion = Number((nextSlide as any)?.version);
      setExpectedSlideVersion(
        Number.isFinite(returnedVersion)
          ? returnedVersion
          : fallbackVersion + 1,
      );
      clearCachedSlideDraft(selectedSlide.id);
      setConflictPolicy(registerSaveSuccess());
      setSaveState("saved");
    };

    const saveWithVersion = async (saveVersion: number) => {
      return updateSlideMutation.mutateAsync({
        deckId: deck.id,
        slideId: selectedSlide.id,
        expectedVersion: saveVersion,
        saveMode,
        title: selectedSlide.title,
        slideContent: draftContent,
      });
    };

    try {
      const nextSlide = await saveWithVersion(version);
      finalizeSaveSuccess(nextSlide, version);

      if (saveMode === "autosave") {
        trackAutosaveResult({
          result: "saved",
          deckId: deck.id,
          slideId: selectedSlide.id,
          mode: "autosave",
        });
      }

      return "saved";
    } catch (error) {
      let finalError = error;

      if (saveMode === "manual") {
        const conflict = extractPresentationConflict(error);
        if (conflict) {
          const latestConflictVersion = resolveLatestConflictSlideVersion(conflict);
          if (
            latestConflictVersion !== null
            && isConflictSlideContentEqualDraft(conflict, draftContent)
          ) {
            setExpectedSlideVersion(latestConflictVersion);
            clearCachedSlideDraft(selectedSlide.id);
            setConflictPolicy(registerSaveSuccess());
            setSaveState("saved");
            return "saved";
          }

          if (latestConflictVersion !== null && latestConflictVersion > version) {
            try {
              const recoveredSlide = await saveWithVersion(latestConflictVersion);
              finalizeSaveSuccess(recoveredSlide, latestConflictVersion);
              return "saved";
            } catch (retryError) {
              finalError = retryError;
            }
          }
        }
      }

      if (isConflictError(finalError)) {
        const nextPolicy = registerConflict(conflictPolicyRef.current, Date.now());
        setConflictPolicy(nextPolicy);
        setSaveState("conflict");
        if (saveMode === "autosave") {
          trackAutosaveResult({
            result: nextPolicy.phase === "stale_blocked" ? "stale_blocked" : "conflict",
            deckId: deck.id,
            slideId: selectedSlide.id,
            mode: "autosave",
          });
        }
        return "skipped";
      }

      setSaveState("error");
      if (saveMode === "autosave") {
        trackAutosaveResult({
          result: "error",
          deckId: deck.id,
          slideId: selectedSlide.id,
          mode: "autosave",
        });
      }
      return "skipped";
    }
  }, [deck, draftContent, expectedSlideVersion, selectedSlide, updateSlideMutation]);

  const autosaveController = useAutosaveController({
    enabled: Boolean(deck && selectedSlide && draftSignature),
    draftSignature,
    onAutosave: () => performSave("autosave"),
  });

  useEffect(() => {
    if (!selectedSlide) {
      autosaveController.clear();
      return;
    }

    autosaveController.markPersisted(
      buildDraftSignature(
        selectedSlide.id,
        ensureSlideContent(selectedSlide.slideContent),
      ),
    );
  }, [autosaveController, selectedSlide?.id, selectedSlide?.version]);

  async function handleSaveSlide(options?: { silent?: boolean }): Promise<boolean> {
    if (!deck || !selectedSlide) {
      if (!options?.silent) {
        toast.error("No active slide to save.");
      }
      return false;
    }

    const result = await performSave("manual");
    if (result === "saved") {
      autosaveController.markPersisted(draftSignature);
      await Promise.all([
        refreshDeck(),
        trpcUtils.presentation.listVersions.invalidate(),
      ]);
      if (!options?.silent) {
        toast.success("Presentation saved.");
      }
      return true;
    }

    if (!options?.silent) {
      const blockedReason = shouldBlockSaveAttempt(
        normalizeConflictPolicy(conflictPolicyRef.current, Date.now()),
        "manual",
        Date.now(),
      );
      if (blockedReason === "stale_blocked") {
        toast.error("Save blocked by version conflict. Reload latest and retry.");
      } else {
        toast.error("Save failed. Please retry.");
      }
    }
    return false;
  }

  async function handleAutoRelayoutSlide(options?: {
    scope?: AutoLayoutScope;
    templateChoice?: AutoLayoutTemplateChoice;
    styleChoice?: AutoLayoutStyleChoice;
    includeSvg?: boolean;
    includeGeometricCrop?: boolean;
    cropShapeChoice?: AutoLayoutCropShapeChoice;
    includeGeometricAccents?: boolean;
    accentShapeChoice?: AutoLayoutAccentShapeChoice;
    watermarkEnabled?: boolean;
    watermarkSourceUrl?: string;
    watermarkClarityPercent?: number;
  }) {
    if (!deck || !selectedSlide) {
      toast.error("No active slide for auto layout.");
      return;
    }

    const scope = options?.scope ?? autoLayoutScope;
    const includeSvg = options?.includeSvg ?? autoLayoutIncludeSvg;
    const includeGeometricCrop = options?.includeGeometricCrop ?? autoLayoutIncludeGeometricCrop;
    const cropShapeChoice = options?.cropShapeChoice ?? autoLayoutCropShapeChoice;
    const includeGeometricAccents = options?.includeGeometricAccents ?? autoLayoutIncludeGeometricAccents;
    const accentShapeChoice = options?.accentShapeChoice ?? autoLayoutAccentShapeChoice;
    const templateChoice = options?.templateChoice ?? autoLayoutTemplateChoice;
    const styleChoice = options?.styleChoice ?? autoLayoutStyleChoice;
    const watermarkEnabled = options?.watermarkEnabled ?? autoLayoutWatermarkEnabled;
    const watermarkSourceUrl = (options?.watermarkSourceUrl ?? autoLayoutWatermarkSourceUrl).trim();
    const watermarkClarityPercent = options?.watermarkClarityPercent ?? autoLayoutWatermarkClarityPercent;
    const selectedWatermarkOption = watermarkEnabled
      ? resolveAutoLayoutWatermarkOption(watermarkSourceUrl)
      : null;
    const targetSlides = scope === "all" ? slides : [selectedSlide];
    const selectedId = selectedSlide.id;
    if (targetSlides.length === 0) {
      toast.error("No slides available for auto layout.");
      return;
    }
    if (watermarkEnabled && !selectedWatermarkOption) {
      toast.error("Please select a PNG/JPG watermark image from library.");
      return;
    }

    if (hasUnsavedSelectedSlideChanges) {
      const saved = await handleSaveSlide({ silent: true });
      if (!saved) {
        toast.error("Please resolve save conflicts before running auto layout.");
        return;
      }
    }

    const slideVersionById = new Map<number, number>(
      slides.map((slide) => [slide.id, Number.isFinite(Number(slide.version)) ? Number(slide.version) : 0]),
    );
    if (typeof deckQuery.refetch === "function") {
      const latest = await deckQuery.refetch();
      const latestSlides = Array.isArray((latest.data as any)?.slides)
        ? (latest.data as any).slides
        : [];
      for (const slide of latestSlides) {
        const slideId = Number((slide as any)?.id);
        const slideVersion = Number((slide as any)?.version);
        if (Number.isFinite(slideId) && slideId > 0 && Number.isFinite(slideVersion) && slideVersion >= 0) {
          slideVersionById.set(slideId, slideVersion);
        }
      }
    }

    if (scope === "all") {
      const dirtyCachedSlides: Array<{ id: number; orderIndex: number; title: string; content: PresentationSlideContent }> = [];
      for (const [slideId, cachedContent] of slideDraftCacheRef.current.entries()) {
        if (slideId === selectedId) {
          continue;
        }
        const slide = slides.find((item) => item.id === slideId);
        if (!slide) {
          continue;
        }
        const persisted = ensureSlideContent(slide.slideContent);
        const cached = ensureSlideContent(cachedContent);
        if (buildSlideContentSignature(persisted) === buildSlideContentSignature(cached)) {
          clearCachedSlideDraft(slideId);
          continue;
        }
        dirtyCachedSlides.push({
          id: slide.id,
          orderIndex: slide.orderIndex,
          title: slide.title,
          content: cached,
        });
      }

      if (dirtyCachedSlides.length > 0) {
        let savedDraftCount = 0;
        const failedDraftSaves: string[] = [];
        for (const draftSlide of dirtyCachedSlides) {
          const expectedVersion = slideVersionById.get(draftSlide.id) ?? 0;
          try {
            const savedSlide = await updateSlideMutation.mutateAsync({
              deckId: deck.id,
              slideId: draftSlide.id,
              expectedVersion,
              saveMode: "manual",
              title: draftSlide.title,
              slideContent: draftSlide.content,
            });
            const savedVersion = Number((savedSlide as any)?.version);
            slideVersionById.set(
              draftSlide.id,
              Number.isFinite(savedVersion) ? savedVersion : (expectedVersion + 1),
            );
            clearCachedSlideDraft(draftSlide.id);
            savedDraftCount += 1;
          } catch {
            const orderNumber = Number(draftSlide.orderIndex) + 1;
            failedDraftSaves.push(`#${Number.isFinite(orderNumber) ? orderNumber : draftSlide.id}`);
          }
        }

        if (failedDraftSaves.length > 0) {
          toast.error(`Failed to save pending edits for slides: ${failedDraftSaves.join(", ")}`);
          return;
        }
        if (savedDraftCount > 0) {
          toast.info(`Saved pending edits on ${savedDraftCount} slide(s) before auto layout.`);
        }
      }
    }

    setAutoLayoutProgress({ done: 0, total: targetSlides.length });
    const warnings = new Set<string>();
    const failedSlides: string[] = [];
    let appliedCount = 0;

    try {
      for (const [index, slide] of targetSlides.entries()) {
        const expectedVersion = slideVersionById.get(slide.id)
          ?? (Number.isFinite(Number(slide.version)) ? Number(slide.version) : 0);
        try {
          const result = await relayoutSlideMutation.mutateAsync({
            deckId: deck.id,
            slideId: slide.id,
            expectedVersion,
            ...(styleChoice !== "auto" ? { stylePresetId: styleChoice } : {}),
            ...(templateChoice !== "auto" ? { templateId: templateChoice } : {}),
            includeSvg,
            includeGeometricCrop,
            ...(includeGeometricCrop ? { geometricCropShape: cropShapeChoice } : {}),
            includeGeometricAccents,
            ...(includeGeometricAccents ? { geometricAccentShape: accentShapeChoice } : {}),
            ...(selectedWatermarkOption
              ? {
                watermark: {
                  sourceUrl: selectedWatermarkOption.sourceUrl,
                  format: selectedWatermarkOption.format,
                  clarityPercent: watermarkClarityPercent,
                },
              }
              : {}),
            layoutSeed: Date.now() + index,
          });
          appliedCount += 1;
          const updatedSlide = (result as any)?.slide;
          const nextVersion = Number(updatedSlide?.version);
          if (Number.isFinite(nextVersion)) {
            slideVersionById.set(slide.id, nextVersion);
          } else {
            slideVersionById.set(slide.id, expectedVersion + 1);
          }
          clearCachedSlideDraft(slide.id);

          if (slide.id === selectedId && Number.isFinite(nextVersion)) {
            setExpectedSlideVersion(nextVersion);
          }
          if (slide.id === selectedId && updatedSlide?.slideContent) {
            const nextContent = ensureSlideContent(updatedSlide.slideContent as PresentationSlideContent);
            const nextSelected = nextContent.elements[0]?.id ? [nextContent.elements[0].id] : [];
            executeCommand({
              id: "apply-auto-layout",
              apply: (state) => ({
                ...state,
                content: nextContent,
                selectedElementIds: nextSelected,
                snapGuides: [],
              }),
            });
            autosaveController.markPersisted(buildDraftSignature(selectedId, nextContent));
          }
          const resultWarnings = Array.isArray((result as any)?.warnings)
            ? (result as any).warnings.filter((warning: unknown) => typeof warning === "string")
            : [];
          for (const warning of resultWarnings) {
            warnings.add(warning as string);
          }
        } catch (error) {
          const orderNumber = Number(slide.orderIndex) + 1;
          failedSlides.push(`#${Number.isFinite(orderNumber) ? orderNumber : slide.id}`);
          if (failedSlides.length === 1 && error instanceof Error) {
            warnings.add(error.message);
          }
        } finally {
          setAutoLayoutProgress({ done: index + 1, total: targetSlides.length });
        }
      }

      if (appliedCount > 0) {
        setSaveState("saved");
        await Promise.all([
          refreshDeck(),
          trpcUtils.presentation.listVersions.invalidate(),
        ]);
      }

      if (appliedCount > 0) {
        toast.success(
          scope === "all"
            ? `Auto layout applied to ${appliedCount}/${targetSlides.length} slides.`
            : "Auto layout applied to current slide.",
        );
      }
      if (failedSlides.length > 0) {
        toast.error(`Auto layout failed for slides: ${failedSlides.join(", ")}`);
      }
      if (warnings.size > 0) {
        const [firstWarning] = Array.from(warnings);
        if (firstWarning) {
          toast.info(firstWarning);
        }
      }
      if (appliedCount > 0 && failedSlides.length === 0) {
        setIsAutoLayoutDialogOpen(false);
      }
    } finally {
      setAutoLayoutProgress(null);
    }
  }

  async function handleSaveProjectTitle() {
    if (!docId) {
      return;
    }

    const title = projectTitleDraft.trim();
    if (!title) {
      toast.error("Project name cannot be empty.");
      return;
    }
    if (title === projectTitle) {
      setIsProjectTitleEditing(false);
      return;
    }

    setIsProjectTitleSaving(true);
    try {
      await updateItemMutation.mutateAsync({ id: docId, title });
      if (deck?.id) {
        await runDeckMutation(async (expectedVersion) => (
          updateDeckMutation.mutateAsync({
            deckId: deck.id,
            expectedVersion,
            title,
          })
        ));
      }
      await Promise.all([
        trpcUtils.library.getItem.invalidate({ id: docId }),
        trpcUtils.library.listDocuments.invalidate(),
      ]);
      setIsProjectTitleEditing(false);
      toast.success("Project name updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update project name.");
    } finally {
      setIsProjectTitleSaving(false);
    }
  }

  async function handleSaveToTemplate() {
    if (!docId) {
      return;
    }

    const blockedReason = shouldBlockSaveAttempt(
      normalizeConflictPolicy(conflictPolicyRef.current, Date.now()),
      "manual",
      Date.now(),
    );
    if (blockedReason === "stale_blocked") {
      toast.error("Save blocked by version conflict. Reload latest and retry before saving to template.");
      return;
    }

    await handleSaveSlide({ silent: true });
    const baseTitle = (projectTitle || `Presentation ${docId}`).trim();
    const templateTitle = /template$/i.test(baseTitle) ? baseTitle : `${baseTitle} Template`;

    try {
      const result = await saveAsTemplateMutation.mutateAsync({
        sourceLibraryItemId: docId,
        templateTitle,
      });
      await trpcUtils.library.listDocuments.invalidate();
      toast.success(`Template saved: ${String((result as any)?.item?.title || templateTitle)}`);
      setLocation("/presentations");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save template.");
    }
  }

  async function handleResolvePendingMedia() {
    if (!deck) {
      return;
    }
    try {
      const result = await resolvePendingMediaMutation.mutateAsync({
        deckId: deck.id,
        maxJobs: 60,
      });
      await refreshDeck();

      if (result.jobsResolved > 0) {
        toast.success(
          `Resolved ${result.jobsResolved} pending media item(s). ${result.jobsRemaining} remaining.`,
        );
      } else if (result.jobsChecked > 0) {
        toast.info(`Checked ${result.jobsChecked} pending media item(s). ${result.jobsRemaining} still pending.`);
      } else {
        toast.info("No pending media jobs found.");
      }

      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        toast.warning(result.warnings[0]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch pending media.");
    }
  }

  async function handleRestoreSavedVersion(versionId: number) {
    if (!deck) {
      return;
    }

    setSaveState("pending");
    try {
      const restored = await restoreVersionMutation.mutateAsync({
        deckId: deck.id,
        versionId,
      });
      await Promise.all([
        refreshDeck(),
        trpcUtils.presentation.listVersions.invalidate(),
      ]);
      setRestoreDialogVersionId(null);
      const restoredSlideId = Number((restored as any)?.restoredSlideId);
      if (Number.isFinite(restoredSlideId) && restoredSlideId > 0) {
        switchToSlide(restoredSlideId);
      }
      setConflictPolicy(releaseStaleBlock());
      setSaveState("saved");
      toast.success("Version restored.");
    } catch (error) {
      setSaveState("error");
      toast.error(error instanceof Error ? error.message : "Failed to restore version.");
    }
  }

  function handleStopSlideshow() {
    setPlaybackState("idle");
    setPlaybackPaused(false);
    setPlaybackSlideIndex(0);
    previewAudioDeckSignatureRef.current = null;
    if (typeof document !== "undefined") {
      const fullscreenDoc = document as FullscreenCapableDocument;
      if (getCurrentFullscreenElement(fullscreenDoc)) {
        void exitAnyFullscreen(fullscreenDoc).catch(() => undefined);
      }
    }
  }

  async function handleTogglePlaybackFullscreen() {
    if (typeof document === "undefined") {
      return;
    }
    const fullscreenDoc = document as FullscreenCapableDocument;
    const overlay = playbackOverlayRef.current;
    if (!overlay) {
      return;
    }

    try {
      if (getCurrentFullscreenElement(fullscreenDoc)) {
        await exitAnyFullscreen(fullscreenDoc);
        return;
      }
      await requestFullscreenForElement(overlay as FullscreenCapableElement);
    } catch {
      setExportMessage("Fullscreen is not available in this browser context.");
    }
  }

  function goToNextPlaybackSlide() {
    setPlaybackSlideIndex((current) => {
      if (!playbackSlides.length) {
        return 0;
      }
      return Math.min(playbackSlides.length - 1, current + 1);
    });
  }

  function goToPreviousPlaybackSlide() {
    setPlaybackSlideIndex((current) => Math.max(0, current - 1));
  }

  function handlePlaySlideshow() {
    const slideCount = Array.isArray(slideshowQuery.data?.slides)
      ? slideshowQuery.data.slides.length
      : slides.length;
    if (!slideCount) {
      setPlaybackState("idle");
      setExportMessage("No slides available for playback.");
      return;
    }
    const startIndex = Math.max(
      0,
      slides.findIndex((slide) => slide.id === selectedSlideId),
    );
    setPlaybackSlideIndex(startIndex);
    setPlaybackPaused(false);
    previewAudioDeckSignatureRef.current = null;
    void playDeckPreviewQuery.refetch();
    setPlaybackState("playing");
    setExportMessage(`Playing slideshow preview with ${slideCount} slides.`);
  }

  function handleOpenPlayMode() {
    if (!deck) {
      return;
    }
    if (hasUnsavedSlideChanges && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Play Mode shows only saved content. Unsaved edits will not appear. Continue?",
      );
      if (!confirmed) {
        return;
      }
    }
    setLocation(`/presentation/${deck.libraryItemId}/play`);
  }

  async function handleExport(format: "png" | "mp4") {
    if (!deck) return;
    setExportWarnings([]);
    setExportMessage(`Submitting ${format.toUpperCase()} export...`);
    try {
      const result = await triggerExportMutation.mutateAsync({
        deckId: deck.id,
        format,
        idempotencyKey: `${deck.id}-${format}-${Date.now()}`,
      });
      setLastExportId(result.exportId);
      setExportWarnings(Array.isArray((result as any).warnings) ? (result as any).warnings : []);
      const queuedMessage = result.message || `${format.toUpperCase()} export queued`;
      setExportMessage(queuedMessage);
    } catch (error) {
      const raw = String((error as any)?.message || "Export failed");
      const trimmed = raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : raw;
      setExportWarnings([]);
      setExportMessage(trimmed || "Export failed");
    }
  }

  useEffect(() => {
    const statusWarnings = exportStatusQuery.data?.warnings;
    if (Array.isArray(statusWarnings)) {
      setExportWarnings(statusWarnings);
    }
  }, [exportStatusQuery.data?.warnings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isMobileViewport) {
        return;
      }
      if (playbackState === "playing") {
        return;
      }

      const target = event.target;
      const isElementTarget = target instanceof HTMLElement;
      const isEditable =
        isElementTarget
        && (Boolean(target.closest("input, textarea, select")) || target.isContentEditable === true);
      if (isEditable) {
        return;
      }

      const hasSelection = selectedElementIds.length > 0;
      const isPrimaryModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const code = event.code;
      const isCopyShortcut = isPrimaryModifier && (key === "c" || code === "KeyC");
      const isCutShortcut = isPrimaryModifier && (key === "x" || code === "KeyX");
      const isPasteShortcut = isPrimaryModifier && (key === "v" || code === "KeyV");
      const isUndoShortcut = isPrimaryModifier
        && !event.shiftKey
        && (key === "z" || code === "KeyZ");
      const isRedoShortcut = isPrimaryModifier
        && (
          ((key === "z" || code === "KeyZ") && event.shiftKey)
          || key === "y"
          || code === "KeyY"
        );

      if (isCopyShortcut && hasSelection) {
        event.preventDefault();
        handleCopySelection();
        return;
      }

      if (isCutShortcut && hasSelection) {
        event.preventDefault();
        handleCutSelection();
        return;
      }

      if (isPasteShortcut) {
        event.preventDefault();
        handlePasteSelection();
        return;
      }

      if (isPrimaryModifier && (key === "=" || key === "+" || code === "Equal" || code === "NumpadAdd")) {
        event.preventDefault();
        updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP);
        return;
      }

      if (isPrimaryModifier && (key === "-" || code === "Minus" || code === "NumpadSubtract")) {
        event.preventDefault();
        updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP);
        return;
      }

      if (isPrimaryModifier && (key === "0" || code === "Digit0" || code === "Numpad0")) {
        event.preventDefault();
        updateDesktopZoom(1);
        return;
      }

      if (isUndoShortcut) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (isRedoShortcut) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (isPrimaryModifier && key === "d" && hasSelection) {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && hasSelection) {
        event.preventDefault();
        handleDeleteSelection();
        return;
      }

      if (!hasSelection) {
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleMoveSelection(-step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleMoveSelection(step, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        handleMoveSelection(0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleMoveSelection(0, step);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    desktopViewport.scale,
    isMobileViewport,
    playbackState,
    selectedElementIds,
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleMoveSelection,
    handlePasteSelection,
    handleRedo,
    handleUndo,
  ]);

  useEffect(() => {
    if (playbackState !== "playing" || playbackPaused) {
      return;
    }

    const activeSlide = playbackSlides[playbackSlideIndex];
    if (!activeSlide) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const isLastSlide = playbackSlideIndex >= playbackSlides.length - 1;
      if (isLastSlide) {
        handleStopSlideshow();
        setExportMessage("Slideshow preview completed.");
        return;
      }
      setPlaybackSlideIndex((current) => Math.min(playbackSlides.length - 1, current + 1));
    }, activeSlide.durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [playbackPaused, playbackSlideIndex, playbackSlides, playbackState]);

  useEffect(() => {
    if (playbackState !== "playing") {
      return;
    }

    const onPlaybackKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleStopSlideshow();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextPlaybackSlide();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousPlaybackSlide();
        return;
      }

      if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPlaybackPaused((previous) => !previous);
      }
    };

    window.addEventListener("keydown", onPlaybackKeyDown);
    return () => {
      window.removeEventListener("keydown", onPlaybackKeyDown);
    };
  }, [playbackState, playbackSlides.length]);

  useEffect(() => {
    if (playbackState !== "playing") {
      previewAudioPlayerRef.current?.destroy();
      previewAudioPlayerRef.current = null;
      previewAudioSlideIndexRef.current = null;
      previewAudioDeckSignatureRef.current = null;
      return;
    }

    const playDeck = playDeckPreviewQuery.data;
    if (!playDeck) {
      return;
    }

    const nextAudioSignature = JSON.stringify({
      projectAudioTrack: playDeck.projectAudioTrack ?? null,
      slideAudioTracks: playDeck.slides.map((slide) => slide.audioTrack ?? null),
    });
    const shouldRecreatePlayer =
      !previewAudioPlayerRef.current
      || previewAudioDeckSignatureRef.current !== nextAudioSignature;
    if (shouldRecreatePlayer) {
      previewAudioPlayerRef.current?.destroy();
      previewAudioPlayerRef.current = new AudioTrackPlayer(playDeck.projectAudioTrack ?? null);
      previewAudioDeckSignatureRef.current = nextAudioSignature;
      previewAudioSlideIndexRef.current = null;
    }

    const player = previewAudioPlayerRef.current;
    if (!player) {
      return;
    }

    if (previewAudioSlideIndexRef.current !== playbackSlideIndex) {
      const audioTrack = (playDeck.slides[playbackSlideIndex] as any)?.audioTrack ?? null;
      player.onSlideEnter(audioTrack);
      previewAudioSlideIndexRef.current = playbackSlideIndex;
    }

    if (playbackPaused) {
      player.pause();
    } else {
      player.resume();
    }
  }, [playDeckPreviewQuery.data, playbackPaused, playbackSlideIndex, playbackState]);

  useEffect(() => {
    return () => {
      previewAudioPlayerRef.current?.destroy();
      previewAudioPlayerRef.current = null;
      previewAudioSlideIndexRef.current = null;
      previewAudioDeckSignatureRef.current = null;
    };
  }, []);

  const deckNotFound = Boolean(deckQuery.error && isNotFoundError(deckQuery.error));

  useEffect(() => {
    setAutoDeckInitAttempted(false);
    setAutoDeckInitPending(false);
    setAutoDeckInitError(null);
  }, [docId]);

  useEffect(() => {
    if (!deckNotFound || autoDeckInitAttempted || autoDeckInitPending) {
      return;
    }
    setAutoDeckInitAttempted(true);
    setAutoDeckInitPending(true);
    setAutoDeckInitError(null);
    void handleCreateDeck()
      .catch((error) => {
        const message = String((error as any)?.message || "Failed to initialize presentation deck.");
        setAutoDeckInitError(message);
      })
      .finally(() => {
        setAutoDeckInitPending(false);
      });
  }, [deckNotFound, autoDeckInitAttempted, autoDeckInitPending]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const currentFullscreenElement = typeof document !== "undefined"
        ? getCurrentFullscreenElement(document as FullscreenCapableDocument)
        : null;
      setIsPlaybackFullscreen(Boolean(currentFullscreenElement && playbackOverlayRef.current
        && (currentFullscreenElement === playbackOverlayRef.current
          || playbackOverlayRef.current.contains(currentFullscreenElement))));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    document.addEventListener("MSFullscreenChange", onFullscreenChange as EventListener);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
      document.removeEventListener("MSFullscreenChange", onFullscreenChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (playbackState !== "playing") {
      setPlaybackStageHostSize({ width: 0, height: 0 });
      return;
    }

    const updateHostSize = () => {
      const host = playbackStageHostRef.current;
      if (!host) {
        return;
      }
      const nextWidth = host.clientWidth;
      const nextHeight = host.clientHeight;
      if (nextWidth > 0 && nextHeight > 0) {
        setPlaybackStageHostSize({ width: nextWidth, height: nextHeight });
      }
    };

    updateHostSize();
    const host = playbackStageHostRef.current;
    const observer = typeof ResizeObserver !== "undefined" && host
      ? new ResizeObserver(() => updateHostSize())
      : null;
    if (observer && host) {
      observer.observe(host);
    }
    window.addEventListener("resize", updateHostSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHostSize);
    };
  }, [playbackState, isPlaybackFullscreen]);

  function handleBackToPresentationLibrary() {
    if (hasUnsavedSlideChanges && typeof window !== "undefined") {
      const confirmed = window.confirm(UNSAVED_PRESENTATION_WARNING);
      if (!confirmed) {
        return;
      }
    }
    setLocation("/presentations");
  }

  async function handleReloadLatestSlide() {
    clearCachedSlideDraft(selectedSlideId);
    await refreshDeck();
    setConflictPolicy(releaseStaleBlock());
    setSaveState("idle");
  }

  if (!docId) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-sm text-red-600">Invalid presentation route.</p>
      </div>
    );
  }

  if (itemQuery.isLoading || guardQuery.isLoading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-sm text-muted-foreground">Loading presentation editor...</p>
      </div>
    );
  }

  if (itemQuery.error || !itemQuery.data) {
    const fallback = buildWrongEditorOpenGuard(docId, "unknown");
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-xl font-semibold">Presentation unavailable</h1>
        <p className="text-sm text-muted-foreground">{itemQuery.error?.message || "Library item not found."}</p>
        <Button onClick={() => setLocation(fallback.recoveryCta.href)}>{fallback.recoveryCta.label}</Button>
      </div>
    );
  }

  const blockedGuard = guardQuery.data && guardQuery.data.allowed === false
    ? guardQuery.data
    : null;

  if (blockedGuard) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-xl font-semibold">Wrong editor route</h1>
        <p className="text-sm text-muted-foreground">{blockedGuard.message}</p>
        <Button onClick={() => setLocation(blockedGuard.recoveryCta.href)}>
          {blockedGuard.recoveryCta.label}
        </Button>
      </div>
    );
  }

  if (deckQuery.isLoading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-sm text-muted-foreground">Loading presentation deck...</p>
      </div>
    );
  }

  if (deckNotFound) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <Button variant="outline" size="sm" onClick={handleBackToPresentationLibrary}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Presentation Library
        </Button>
        <h1 className="text-2xl font-semibold">Presentation Editor</h1>
        <p className="text-sm text-muted-foreground">
          {autoDeckInitPending
            ? "Preparing editable deck..."
            : "This presentation does not have an editable deck yet."}
        </p>
        {autoDeckInitError ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{autoDeckInitError}</p>
            <Button
              onClick={() => {
                setAutoDeckInitAttempted(false);
                setAutoDeckInitError(null);
              }}
            >
              Retry Deck Initialization
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (deckQuery.error && !deckQuery.data) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Presentation Editor</h1>
        <p className="text-sm text-red-600">{getDeckLoadErrorMessage(deckQuery.error)}</p>
      </div>
    );
  }

  const saveStatusLabel =
    saveState === "pending"
      ? "Saving..."
      : saveState === "saved"
        ? "Saved"
        : saveState === "conflict"
          ? "Conflict detected. Reload latest and retry."
          : saveState === "error"
            ? "Save failed. Retry."
            : "Ready";
  const playbackStatusLabel = playbackState === "playing"
    ? (playbackPaused ? "Paused preview" : "Playing preview")
    : "Ready";
  const exportStatusLabel =
    exportStatusQuery.data?.status
    || (triggerExportMutation.isPending ? "queued" : "idle");
  const slidesPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {slides.map((slide) => {
          const cachedContent = slideDraftCacheRef.current.get(slide.id);
          const preview = summarizeSlidePreview(
            selectedSlideId === slide.id
              ? draftContent
              : cachedContent ?? ensureSlideContent(slide.slideContent),
          );
          return (
            <button
              key={slide.id}
              type="button"
              className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${selectedSlideId === slide.id
                ? "border-sky-400 bg-sky-500/10 text-sky-800"
                : "border-slate-300 bg-white hover:border-slate-400"
                }`}
              onClick={() => switchToSlide(slide.id)}
              aria-label={`Select slide ${slide.orderIndex + 1}`}
              data-testid={`slide-preview-${slide.orderIndex + 1}`}
            >
              <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-slate-300 bg-slate-100">
                {preview.mediaSrc && preview.mediaKind === "video" ? (
                  preview.mediaPosterSrc ? (
                    <img
                      src={preview.mediaPosterSrc}
                      alt={slide.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      draggable={false}
                      data-testid={`slide-preview-media-video-poster-${slide.orderIndex + 1}`}
                    />
                  ) : (
                    <video
                      src={preview.mediaSrc}
                      className="h-full w-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                      data-testid={`slide-preview-media-video-${slide.orderIndex + 1}`}
                    />
                  )
                ) : preview.mediaSrc ? (
                  <img
                    src={preview.mediaSrc}
                    alt={slide.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    draggable={false}
                    data-testid={`slide-preview-media-image-${slide.orderIndex + 1}`}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[11px] text-slate-500">
                    Slide preview
                  </div>
                )}
                {preview.mediaKind === "video" ? (
                  <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    VIDEO
                  </span>
                ) : null}
                {(slide as any)?.audioTrack != null ? (
                  <span
                    className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                    title="Slide has audio"
                  >
                    <Music className="h-2.5 w-2.5" />
                  </span>
                ) : null}
                {preview.textSnippet ? (
                  <p className="absolute inset-x-1 bottom-1 truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                    {preview.textSnippet}
                  </p>
                ) : null}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Slide {slide.orderIndex + 1}</p>
                  <p className="truncate font-medium">{slide.title}</p>
                </div>
                <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {preview.elementCount}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="shrink-0 grid grid-cols-2 gap-1.5 border-t border-slate-700 pt-2">
        <Button size="sm" onClick={() => void handleAddSlide()} aria-label="Add Slide" disabled={deckMutationBusy} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Slide
        </Button>
        <Button size="sm" onClick={() => void handleDuplicateSlide()} aria-label="Duplicate Slide" variant="secondary" disabled={deckMutationBusy} className="gap-1">
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </Button>
        <Button size="sm" onClick={() => void handleMoveSlide("up")} aria-label="Move Slide Up" variant="outline" disabled={deckMutationBusy} className="gap-1">
          <ChevronUp className="h-3.5 w-3.5" />
          Move Up
        </Button>
        <Button size="sm" onClick={() => void handleMoveSlide("down")} aria-label="Move Slide Down" variant="outline" disabled={deckMutationBusy} className="gap-1">
          <ChevronDown className="h-3.5 w-3.5" />
          Move Down
        </Button>
        <Button
          size="sm"
          onClick={() => void handleDeleteSlide()}
          aria-label="Delete Slide"
          variant="destructive"
          className="col-span-2 gap-1"
          disabled={deckMutationBusy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Slide
        </Button>
      </div>
    </div>
  );
  const versionHistoryPanel = (
    <div className="rounded-lg border border-slate-300 bg-white p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Saved Versions</p>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
          {savedVersions.length}
        </span>
      </div>
      {versionHistoryQuery.isLoading ? (
        <p className="text-xs text-slate-500">Loading version history...</p>
      ) : savedVersions.length ? (
        <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          <div className="max-h-44 space-y-2 overflow-auto sm:max-h-52">
            {groupedSavedVersions.map((group) => (
              <div
                key={group.key}
                className="rounded border border-slate-200 bg-slate-50 p-1.5"
                data-testid={`presentation-version-group-${group.key}`}
              >
                <div className="mb-1 flex items-center justify-between rounded bg-slate-100 px-2 py-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {group.label}
                  </p>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                    {group.items.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {group.items.map((version) => {
                    const isSelected = selectedSavedVersionId === version.id;
                    return (
                      <button
                        key={version.id}
                        type="button"
                        className={`w-full rounded border px-2 py-1.5 text-left ${isSelected
                          ? "border-sky-300 bg-sky-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        onClick={() => setSelectedSavedVersionId(version.id)}
                        aria-label={`Select Version ${version.versionNumber ?? version.id}`}
                        data-testid={`presentation-version-item-${version.id}`}
                      >
                        <p className="truncate text-[11px] font-medium text-slate-700">
                          V{version.versionNumber ?? version.id} - {version.snapshot?.slideTitle || "Slide"}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {formatVersionDate(version.snapshot?.savedAt || version.createdAt)}
                        </p>
                        {version.changeDescription ? (
                          <p className="truncate text-[10px] text-slate-500">{version.changeDescription}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {selectedSavedVersion ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-2" data-testid="presentation-version-preview">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Preview: Version {selectedSavedVersion.versionNumber ?? selectedSavedVersion.id}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {formatVersionDate(selectedSavedVersion.snapshot?.savedAt || selectedSavedVersion.createdAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={() => setRestoreDialogVersionId(selectedSavedVersion.id)}
                  disabled={restoreVersionMutation.isPending}
                  aria-label={`Restore Selected Version ${selectedSavedVersion.versionNumber ?? selectedSavedVersion.id}`}
                >
                  {restoreVersionMutation.isPending && restoreDialogVersionId === selectedSavedVersion.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Restore Selected
                </Button>
              </div>
              {selectedSavedVersionDiffSummary ? (
                <>
                  <div
                    className="mb-2 flex flex-wrap gap-1 text-[10px] text-slate-600"
                    data-testid="presentation-version-diff-summary"
                  >
                    <span className="rounded bg-white px-1.5 py-0.5">
                      Elements: {selectedSavedVersionDiffSummary.currentElementCount} {"->"} {selectedSavedVersionDiffSummary.versionElementCount}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5">
                      Changed: {selectedSavedVersionDiffSummary.changedElementCount}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5">
                      Added: {selectedSavedVersionDiffSummary.addedElementCount}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5">
                      Removed: {selectedSavedVersionDiffSummary.removedElementCount}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5">
                      Canvas: {selectedSavedVersionDiffSummary.canvasChanged ? "changed" : "same"}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5">
                      Title: {selectedSavedVersionDiffSummary.titleChanged ? "changed" : "same"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded border border-slate-200 bg-white p-1.5" data-testid="presentation-version-preview-current">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Current Slide</p>
                      <div className="relative aspect-[4/3] overflow-hidden rounded border border-slate-200 bg-slate-100">
                        {currentVersionPreview?.mediaSrc ? (
                          <img
                            src={currentVersionPreview.mediaPosterSrc || currentVersionPreview.mediaSrc}
                            alt={selectedSavedVersionSlide?.title || "Current slide"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center px-1 text-center text-[10px] text-slate-500">
                            {selectedSavedVersionCurrentState?.title || "Current slide not found"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="rounded border border-slate-200 bg-white p-1.5" data-testid="presentation-version-preview-selected">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Saved Version</p>
                      <div className="relative aspect-[4/3] overflow-hidden rounded border border-slate-200 bg-slate-100">
                        {selectedVersionPreview?.mediaSrc ? (
                          <img
                            src={selectedVersionPreview.mediaPosterSrc || selectedVersionPreview.mediaSrc}
                            alt={selectedSavedVersion.snapshot?.slideTitle || "Version slide"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center px-1 text-center text-[10px] text-slate-500">
                            {selectedSavedVersion.snapshot?.slideTitle || "Version slide"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-600">
                    {selectedSavedVersionDiffSummary.isIdentical
                      ? "No content differences detected."
                      : "Review the diff summary and previews before restoring this version."}
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-slate-500">
                  This version payload cannot be previewed, but you can still restore it.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No saved versions yet. Use Save to create history.</p>
      )}
    </div>
  );
  const editorToolRail = (
    <div className="flex h-full flex-col items-center gap-2 pt-2">
      <Button
        type="button"
        size="icon"
        variant={libraryTab === "slides" ? "secondary" : "ghost"}
        className={`h-10 w-10 ${libraryTab === "slides"
          ? "bg-sky-600 text-white hover:bg-sky-500"
          : "text-slate-300 hover:bg-slate-800"
          }`}
        onClick={() => setLibraryTab("slides")}
        aria-label="Open Slides Panel"
      >
        <MousePointer2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={libraryTab === "photos" ? "secondary" : "ghost"}
        className={`h-10 w-10 ${libraryTab === "photos"
          ? "bg-sky-600 text-white hover:bg-sky-500"
          : "text-slate-300 hover:bg-slate-800"
          }`}
        onClick={() => setLibraryTab("photos")}
        aria-label="Open Photos Library"
      >
        <ImageIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={libraryTab === "videos" ? "secondary" : "ghost"}
        className={`h-10 w-10 ${libraryTab === "videos"
          ? "bg-sky-600 text-white hover:bg-sky-500"
          : "text-slate-300 hover:bg-slate-800"
          }`}
        onClick={() => setLibraryTab("videos")}
        aria-label="Open Videos Library"
      >
        <Clapperboard className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={libraryTab === "graphics" ? "secondary" : "ghost"}
        className={`h-10 w-10 ${libraryTab === "graphics"
          ? "bg-sky-600 text-white hover:bg-sky-500"
          : "text-slate-300 hover:bg-slate-800"
          }`}
        onClick={() => setLibraryTab("graphics")}
        aria-label="Open Graphics Library"
      >
        <Shapes className="h-4 w-4" />
      </Button>
      <div className="my-2 h-px w-8 bg-slate-700" />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-10 w-10 text-slate-300 hover:bg-slate-800"
        onClick={() => handleAddElement("text")}
        aria-label="Quick Add Text"
      >
        <Type className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-10 w-10 text-slate-300 hover:bg-slate-800"
        onClick={() => handleAddElement("rect")}
        aria-label="Quick Add Rectangle"
      >
        <RectangleHorizontal className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-10 w-10 text-slate-300 hover:bg-slate-800"
        onClick={() => handleAddElement("line")}
        aria-label="Quick Add Line"
      >
        <Minus className="h-4 w-4" />
      </Button>
    </div>
  );
  const assetPanel = (
    <AssetLibraryPanel
      activeTab={libraryTab}
      onTabChange={setLibraryTab}
      searchQuery={librarySearchQuery}
      onSearchQueryChange={setLibrarySearchQuery}
      assets={currentLibraryAssets}
      isLoading={libraryLoading}
      slidesPanel={slidesPanel}
      graphicsPanel={<GraphicsPanel onInsertGraphic={handleInsertGraphic} />}
      onInsertAsset={(asset) => insertLibraryAsset(asset)}
      onDragAssetStart={handleDragAssetStart}
    />
  );
  const canvasToolbar = isMobileViewport ? (
    <MobileQuickActions
      mode={mobileGestures.state.mode}
      onToggleMode={handleToggleMobileMode}
      onNudgeSelection={handleMoveSelection}
      onDeleteSelection={handleDeleteSelection}
      disabled={!selectedElementId}
    />
  ) : (
    <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-100">
      <div className="flex flex-wrap gap-1.5">
        <Button
          onClick={() => handleAddElement("text")}
          aria-label="Add Text Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
        >
          <Type className="h-3.5 w-3.5" />
          Add Text
        </Button>
        <Button
          onClick={() => handleAddElement("image")}
          aria-label="Add Image Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Add Image
        </Button>
        <Button
          onClick={() => handleAddElement("video")}
          aria-label="Add Video Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
        >
          <Clapperboard className="h-3.5 w-3.5" />
          Add Video
        </Button>
        <Button
          onClick={() => handleAddElement("rect")}
          aria-label="Add Rectangle Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
        >
          <RectangleHorizontal className="h-3.5 w-3.5" />
          Rectangle
        </Button>
        <Button
          onClick={() => handleAddElement("line")}
          aria-label="Add Line Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
        >
          <Minus className="h-3.5 w-3.5" />
          Line
        </Button>
        <Button
          onClick={() => setSnapLockEnabled((previous) => !previous)}
          aria-label={snapLockEnabled ? "Disable Snap Lock" : "Enable Snap Lock"}
          variant={snapLockEnabled ? "secondary" : "outline"}
          size="sm"
          className="gap-1 text-xs"
        >
          Snap Lock: {snapLockEnabled ? "On" : "Off"}
        </Button>
        <Button
          onClick={() => setShowElementFrames((previous) => !previous)}
          aria-label={showElementFrames ? "Hide Element Borders" : "Show Element Borders"}
          variant={showElementFrames ? "secondary" : "outline"}
          size="sm"
          className="gap-1 text-xs"
        >
          Element Borders: {showElementFrames ? "On" : "Off"}
        </Button>
        <div className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">
          <Crop className="h-3 w-3" />
          <span>Canvas</span>
          <select
            aria-label="Canvas Aspect Ratio"
            className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100 outline-none"
            value={activeCanvasSize.preset}
            onChange={(event) => handleChangeCanvasPreset(event.target.value)}
          >
            {PRESENTATION_CANVAS_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100 hover:bg-slate-800"
            onClick={() => void handleApplyCanvasPresetAllSlides(activeCanvasSize.preset)}
            disabled={!slides.length || canvasApplyAllPending}
            aria-label="Apply Canvas Aspect Ratio to All Slides"
          >
            {canvasApplyAllPending ? "Applying..." : "Apply All"}
          </Button>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-slate-200 hover:bg-slate-800"
            aria-label="Zoom Out"
            onClick={() => updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP)}
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <button
            type="button"
            className="min-w-[44px] rounded px-1 text-center text-xs text-slate-300"
            aria-label="Canvas Zoom Percentage"
            onClick={() => updateDesktopZoom(1)}
          >
            {Math.round(desktopViewport.scale * 100)}%
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-slate-200 hover:bg-slate-800"
            aria-label="Zoom In"
            onClick={() => updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP)}
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-1">
        <Button
          onClick={handleUndo}
          aria-label="Undo Edit"
          title="Undo (Ctrl/Cmd+Z)"
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
        <Button
          onClick={handleRedo}
          aria-label="Redo Edit"
          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
        >
          <Redo2 className="h-3.5 w-3.5" />
          Redo
        </Button>
        <Button onClick={handleDuplicateSelection} aria-label="Duplicate Selection" variant="outline" size="sm" className="gap-1 text-xs">
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </Button>
        <Button onClick={handleDeleteSelection} aria-label="Delete Selection" variant="outline" size="sm" className="gap-1 text-xs">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <Button onClick={() => handleRotateSelection(15)} aria-label="Rotate Selection" variant="outline" size="sm" className="gap-1 text-xs">
          <RotateCw className="h-3.5 w-3.5" />
          Rotate +15
        </Button>
      </div>
    </div>
  );
  const canvasFooter = (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm">
      <span className="rounded bg-slate-100 px-2 py-0.5">Save: {saveStatusLabel}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">Playback: {playbackStatusLabel}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">Export: {exportStatusLabel}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">
        Snap: {snapLockEnabled ? "Locked" : "Free"}
      </span>
      <span className="rounded bg-slate-100 px-2 py-0.5">
        Borders: {showElementFrames ? "Visible" : "Hidden"}
      </span>
      {saveState === "conflict" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleReloadLatestSlide()}
          aria-label="Reload Latest Slide"
          className="h-6 px-2 text-[11px]"
        >
          Reload Latest
        </Button>
      ) : null}
      {exportMessage ? (
        <span className="text-slate-600" role="status">{exportMessage}</span>
      ) : null}
      {exportWarnings.length ? (
        <span
          className="text-amber-700"
          data-testid="presentation-export-warnings"
          role="status"
          aria-live="polite"
        >
          Export warnings: {exportWarnings.map((warning) => `${warning.code} (slide ${warning.slideId})`).join(", ")}
        </span>
      ) : null}
    </div>
  );
  const autoDurationFromSlideAudioSec = (() => {
    if (!selectedSlideAudioTrack) {
      return null;
    }
    const startSec = Math.max(0, Number(selectedSlideAudioTrack.startAtMs ?? 0) / 1000);
    if (selectedSlideAudioTrack.endAtMs != null) {
      const endSec = Math.max(startSec, Number(selectedSlideAudioTrack.endAtMs) / 1000);
      return Math.max(0.25, endSec - startSec);
    }
    if (selectedSlideAudioDurationSec != null) {
      return Math.max(0.25, selectedSlideAudioDurationSec - startSec);
    }
    return null;
  })();
  const autoDurationFromVideoSec = selectedSlideVideoDurationSec != null
    ? Math.max(0.25, selectedSlideVideoDurationSec)
    : null;
  const autoDurationFromMediaSec = autoDurationFromSlideAudioSec ?? autoDurationFromVideoSec;
  const propertyEditorPanel = (
    <div className="space-y-3">
      {!isMobileViewport ? (
        <label className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
          <span className="font-medium">Canvas Size</span>
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Canvas Aspect Ratio (Properties)"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none"
              value={activeCanvasSize.preset}
              onChange={(event) => handleChangeCanvasPreset(event.target.value)}
            >
              {PRESENTATION_CANVAS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => void handleApplyCanvasPresetAllSlides(activeCanvasSize.preset)}
              disabled={!slides.length || canvasApplyAllPending}
              aria-label="Apply Canvas Size to All Slides"
            >
              {canvasApplyAllPending ? "Applying..." : "Apply All"}
            </Button>
          </div>
        </label>
      ) : null}
      <div className="rounded-md border border-slate-300 bg-white p-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Slide Timing</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Set seconds per slide, apply to current slide/all slides, or fit to media end.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={0.25}
            step={0.1}
            value={timingDurationSecInput}
            onChange={(event) => setTimingDurationSecInput(event.target.value)}
            aria-label="Slide duration seconds"
            className="h-8 text-xs"
          />
          <span className="text-xs text-slate-500">sec</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={handleApplySelectedSlideDuration}
            disabled={!selectedSlide}
          >
            Apply This Slide
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void handleApplyDurationAllSlides()}
            disabled={!slides.length || timingApplyAllPending}
          >
            {timingApplyAllPending ? "Applying..." : "Apply All Slides"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={autoDurationFromMediaSec == null}
            onClick={() => {
              if (autoDurationFromMediaSec == null) return;
              setTimingDurationSecInput(autoDurationFromMediaSec.toFixed(1).replace(/\.0$/, ""));
              applyDurationToSelectedDraft(Math.round(autoDurationFromMediaSec * 1000));
            }}
          >
            Auto: Play To End
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={autoDurationFromSlideAudioSec == null}
            onClick={() => {
              if (autoDurationFromSlideAudioSec == null) return;
              setTimingDurationSecInput(autoDurationFromSlideAudioSec.toFixed(1).replace(/\.0$/, ""));
              applyDurationToSelectedDraft(Math.round(autoDurationFromSlideAudioSec * 1000));
            }}
          >
            Auto: Fit Audio
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={autoDurationFromVideoSec == null}
            onClick={() => {
              if (autoDurationFromVideoSec == null) return;
              setTimingDurationSecInput(autoDurationFromVideoSec.toFixed(1).replace(/\.0$/, ""));
              applyDurationToSelectedDraft(Math.round(autoDurationFromVideoSec * 1000));
            }}
          >
            Auto: Fit Video
          </Button>
        </div>
      </div>
      {!isMobileViewport ? (
        <div
          className="rounded-md border border-slate-300 bg-slate-200/70 p-2"
          data-testid="canvas-stage-layer-interaction-overlay"
        >
          <TransformHandles
            compact
            disabled={!selectedElement}
            onMove={handleMoveSelection}
            onResize={handleResizeSelection}
            onRotate={handleRotateSelection}
            onArrange={handleArrangeSelection}
            currentWidth={selectedElement?.width ?? 0}
            currentHeight={selectedElement?.height ?? 0}
          />
        </div>
      ) : null}
      <PropertyPanel
        selectedElement={selectedElement}
        selectedElementCount={selectedElementIds.length}
        selectionHasMixedTypes={selectionHasMixedTypes}
        onPatchSelected={handlePatchSelectedElement}
        onPatchElementById={handlePatchElementById}
      />
    </div>
  );
  const hasProjectAudio = Boolean((deck as any)?.projectAudioTrack);
  const hasSlideAudio = slides.some((s: any) => s.audioTrack != null);
  const hasAnyAudio = hasProjectAudio || hasSlideAudio;
  const audioPanel = deck ? (
    <SlideAudioPanel
      slideId={selectedSlide?.id ?? null}
      slideVersion={selectedSlide?.version ?? null}
      slideAudioTrack={(selectedSlide as any)?.audioTrack ?? null}
      deckId={deck.id}
      deckVersion={deck.version}
      deckAudioTrack={(deck as any)?.projectAudioTrack ?? null}
      onAudioChanged={refreshDeck}
    />
  ) : (
    <div className="p-4 text-sm text-muted-foreground">Loading...</div>
  );
  const desktopInspectorPanel = (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-300 bg-white p-1">
        <Button
          variant={desktopInspectorTab === "properties" ? "default" : "ghost"}
          size="sm"
          className="h-8"
          onClick={() => setDesktopInspectorTab("properties")}
          aria-label="Inspector Tab Properties"
        >
          Properties
        </Button>
        <Button
          variant={desktopInspectorTab === "versions" ? "default" : "ghost"}
          size="sm"
          className="h-8"
          onClick={() => setDesktopInspectorTab("versions")}
          aria-label={`Inspector Tab Version History (${savedVersions.length})`}
        >
          Versions ({savedVersions.length})
        </Button>
        <Button
          variant={desktopInspectorTab === "audio" ? "default" : "ghost"}
          size="sm"
          className="h-8 relative"
          onClick={() => setDesktopInspectorTab("audio")}
          aria-label={`Inspector Tab Audio${hasAnyAudio ? " (configured)" : ""}`}
        >
          Audio
          {hasAnyAudio && desktopInspectorTab !== "audio" ? (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-sky-500" />
          ) : null}
        </Button>
      </div>
      {desktopInspectorTab === "properties"
        ? propertyEditorPanel
        : desktopInspectorTab === "versions"
          ? versionHistoryPanel
          : audioPanel}
    </div>
  );

  const mobileBottomSheetBody =
    mobileSheetTab === "Properties"
      ? propertyEditorPanel
      : mobileSheetTab === "Add"
        ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => handleAddElement("text")}
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
              >
                <Type className="h-3.5 w-3.5" />
                Text
              </Button>
              <Button
                onClick={() => handleAddElement("image")}
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Image
              </Button>
              <Button
                onClick={() => handleAddElement("video")}
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
              >
                <Clapperboard className="h-3.5 w-3.5" />
                Video
              </Button>
              <Button
                onClick={() => handleAddElement("rect")}
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
              >
                <RectangleHorizontal className="h-3.5 w-3.5" />
                Rect
              </Button>
              <Button
                onClick={() => handleAddElement("line")}
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
              >
                <Minus className="h-3.5 w-3.5" />
                Line
              </Button>
              <Button
                onClick={() => setSnapLockEnabled((p) => !p)}
                size="sm"
                variant={snapLockEnabled ? "default" : "outline"}
                className="gap-1 text-xs"
              >
                <Crop className="h-3.5 w-3.5" />
                {snapLockEnabled ? "Snap On" : "Snap Off"}
              </Button>
              <Button
                onClick={() => setShowElementFrames((p) => !p)}
                size="sm"
                variant={showElementFrames ? "default" : "outline"}
                className="gap-1 text-xs"
              >
                <RectangleHorizontal className="h-3.5 w-3.5" />
                {showElementFrames ? "Borders On" : "Borders Off"}
              </Button>
            </div>
          </div>
        )
        : mobileSheetTab === "Layers"
          ? (
            <div className="text-sm text-muted-foreground space-y-1">
              {draftContent.elements.map((element, index) => (
                <p key={element.id}>
                  {index + 1}. {element.type}
                </p>
              ))}
            </div>
          )
          : mobileSheetTab === "Pages"
            ? <div className="h-[45vh]">{slidesPanel}</div>
            : mobileSheetTab === "Versions"
              ? versionHistoryPanel
              : mobileSheetTab === "Audio"
                ? audioPanel
                : null;

  const propertiesPanel = isMobileViewport ? (
    <MobileBottomSheet
      activeTab={mobileSheetTab}
      onTabChange={setMobileSheetTab}
      body={mobileBottomSheetBody}
    />
  ) : desktopInspectorPanel;
  const activePlaybackSlide = playbackState === "playing"
    ? (playbackSlides[playbackSlideIndex] || null)
    : null;

  const playbackCanvasSize = normalizeCanvasSize(activePlaybackSlide?.content.canvas);
  const playbackViewport = (() => {
    const availableWidth = playbackStageHostSize.width > 0
      ? playbackStageHostSize.width
      : window.innerWidth * 0.92;
    const availableHeight = playbackStageHostSize.height > 0
      ? playbackStageHostSize.height
      : window.innerHeight * 0.8;
    const maxWidth = Math.max(320, availableWidth - 16);
    const maxHeight = Math.max(240, availableHeight - 16);
    const scale = Math.max(
      0.05,
      Math.min(
        maxWidth / playbackCanvasSize.width,
        maxHeight / playbackCanvasSize.height,
      ),
    );
    return {
      width: Math.round(playbackCanvasSize.width * scale),
      height: Math.round(playbackCanvasSize.height * scale),
    };
  })();
  const playbackRenderScale = Math.max(
    0.0001,
    Math.min(
      playbackViewport.width / Math.max(1, playbackCanvasSize.width),
      playbackViewport.height / Math.max(1, playbackCanvasSize.height),
    ),
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-100">
        {isMobileViewport ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-slate-300 hover:bg-slate-800"
            onClick={() => setIsMobileDrawerOpen(true)}
            aria-label="Open Tools Panel"
          >
            <Menu className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToPresentationLibrary}
          className="shrink-0 gap-1 px-2 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-4 w-px shrink-0 bg-slate-700" />
        {isProjectTitleEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={projectTitleDraft}
              onChange={(event) => setProjectTitleDraft(event.target.value)}
              aria-label="Project Name"
              className="h-7 w-52 border-slate-700 bg-slate-900 text-sm text-slate-100"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSaveProjectTitle();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setProjectTitleDraft(projectTitle);
                  setIsProjectTitleEditing(false);
                }
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleSaveProjectTitle()}
              disabled={isProjectTitleSaving}
              aria-label="Save Project Name"
              className="h-7 px-2"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProjectTitleDraft(projectTitle);
                setIsProjectTitleEditing(false);
              }}
              disabled={isProjectTitleSaving}
              aria-label="Cancel Project Name Edit"
              className="h-7 px-2"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <h1 className="text-sm font-semibold">{projectTitle}</h1>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              onClick={() => setIsProjectTitleEditing(true)}
              aria-label="Edit Project Name"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <span className="hidden text-xs text-slate-500 md:inline">· Presentation Editor</span>
        {hasProjectAudio ? (
          <span
            className="hidden md:flex items-center gap-1 text-xs text-sky-400"
            title="Project-wide background audio configured"
          >
            <Music className="h-3 w-3" />
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            onClick={() => void handleSaveSlide()}
            aria-label="Save Slide"
            size="sm"
            className="gap-1 bg-sky-600 text-white hover:bg-sky-500"
            disabled={!deck || !selectedSlide || saveState === "pending"}
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button
            onClick={() => void handleSaveToTemplate()}
            aria-label="Save to Template"
            variant="outline"
            size="sm"
            className="gap-1 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800"
            disabled={!deck || saveAsTemplateMutation.isPending || isProjectTitleSaving}
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Template</span>
          </Button>
          <Button
            onClick={handlePlaySlideshow}
            aria-label="Play Slideshow"
            variant="secondary"
            size="sm"
            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            <Play className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Play</span>
          </Button>
          <Button
            onClick={() => setIsImportDialogOpen(true)}
            aria-label="Import"
            title="Import a file to create a new presentation"
            variant="secondary"
            size="sm"
            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button
            onClick={() => setIsAutoLayoutDialogOpen(true)}
            aria-label="Auto Layout Slide"
            title="Re-layout current slide using existing image"
            variant="secondary"
            size="sm"
            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
            disabled={!deck || !selectedSlide || autoLayoutBusy}
          >
            {autoLayoutBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <WandSparkles className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {autoLayoutProgress
                ? `Auto Layout ${autoLayoutProgress.done}/${autoLayoutProgress.total}`
                : "Auto Layout"}
            </span>
          </Button>
          {isAIGenerationEnabled && (
            <Button
              onClick={() => setIsAIDraftModalOpen(true)}
              aria-label="Draft with AI"
              variant="secondary"
              size="sm"
              className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
              disabled={!deck}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Draft with AI</span>
            </Button>
          )}
          <Button
            onClick={() => void handleResolvePendingMedia()}
            aria-label="Fetch Pending Media"
            variant="secondary"
            size="sm"
            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
            disabled={!deck || pendingMediaJobCount <= 0 || resolvePendingMediaMutation.isPending}
            title={pendingMediaJobCount > 0
              ? `Fetch ${pendingMediaJobCount} pending media tasks`
              : "No pending media tasks"}
          >
            {resolvePendingMediaMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Fetch Pending ({pendingMediaJobCount})</span>
          </Button>
          <Button
            onClick={() => setIsExportDialogOpen(true)}
            aria-label="Export"
            variant="secondary"
            size="sm"
            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
            disabled={!isExportsEnabled || !deck}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            onClick={handleOpenPlayMode}
            aria-label="Play Mode"
            variant="secondary"
            size="sm"
            className="gap-1 bg-slate-800 text-slate-100 hover:bg-slate-700"
            disabled={!deck}
          >
            <Play className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Play Mode</span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <CanvasShell
          slidesPanel={isMobileViewport ? null : slidesPanel}
          toolRail={isMobileViewport ? undefined : editorToolRail}
          assetPanel={isMobileViewport ? undefined : assetPanel}
          canvasToolbar={canvasToolbar}
          canvasStage={(
            <CanvasStage
              elements={draftContent.elements}
              canvasSize={activeCanvasSize}
              selectedElementIds={selectedElementIds}
              snapGuides={commandState.snapGuides}
              showElementFrames={showElementFrames}
              suppressTransformHandles={isMobilePanMode}
              showTransformDock={false}
              viewport={activeViewport}
              onViewportChange={isMobileViewport ? undefined : handleDesktopViewportChange}
              onSelectElement={handleSelectElement}
              onMoveSelection={handleDragMove}
              onResizeSelection={handleDragResize}
              onRotateSelection={handleDragRotate}
              onDragEnd={handleDragEnd}
              onArrangeSelection={handleArrangeSelection}
              onDropAsset={handleCanvasDropAsset}
              onMarqueeSelect={handleMarqueeSelect}
            />
          )}
          canvasFooter={canvasFooter}
          propertiesPanel={propertiesPanel}
        />
      </div>
      {activePlaybackSlide ? (
        <div
          ref={playbackOverlayRef}
          className="fixed inset-0 z-[80] flex flex-col bg-black/90 p-3 md:p-6"
          role="dialog"
          aria-label="Slideshow Preview Player"
          data-testid="slideshow-preview-overlay"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <div>
              <p className="text-sm font-semibold">
                Slide {activePlaybackSlide.orderIndex + 1} / {playbackSlides.length}
              </p>
              <p className="text-xs text-slate-300">{activePlaybackSlide.title}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800"
                onClick={goToPreviousPlaybackSlide}
                disabled={playbackSlideIndex <= 0}
                aria-label="Previous Slide"
              >
                <SkipBack className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800"
                onClick={() => setPlaybackPaused((previous) => !previous)}
                aria-label={playbackPaused ? "Resume Slideshow" : "Pause Slideshow"}
              >
                {playbackPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {playbackPaused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800"
                onClick={() => void handleTogglePlaybackFullscreen()}
                aria-label={isPlaybackFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isPlaybackFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {isPlaybackFullscreen ? "Windowed" : "Fullscreen"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800"
                onClick={goToNextPlaybackSlide}
                disabled={playbackSlideIndex >= playbackSlides.length - 1}
                aria-label="Next Slide"
              >
                Next
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={handleStopSlideshow}
                aria-label="Close Slideshow Preview"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </div>
          <div ref={playbackStageHostRef} className="grid flex-1 place-items-center min-h-0">
            <div
              className="relative overflow-hidden rounded-xl border border-slate-700 bg-white shadow-2xl"
              style={{
                width: `${playbackViewport.width}px`,
                height: `${playbackViewport.height}px`,
              }}
            >
              {activePlaybackSlide.content.elements.map((element, index) =>
                renderReadonlySlideElement(
                  element,
                  index,
                  playbackCanvasSize.width,
                  playbackCanvasSize.height,
                  playbackRenderScale,
                ))}
            </div>
          </div>
        </div>
      ) : null}
      <Dialog
        open={isAutoLayoutDialogOpen}
        onOpenChange={(open) => {
          if (autoLayoutBusy) {
            return;
          }
          setIsAutoLayoutDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Auto Layout</DialogTitle>
            <DialogDescription>
              Rearrange text blocks and composition without generating a new image.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select
                  value={autoLayoutScope}
                  onValueChange={(value) => setAutoLayoutScope(value as AutoLayoutScope)}
                  disabled={autoLayoutBusy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current slide</SelectItem>
                    <SelectItem value="all">All slides</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select
                  value={autoLayoutTemplateChoice}
                  onValueChange={(value) => setAutoLayoutTemplateChoice(value as AutoLayoutTemplateChoice)}
                  disabled={autoLayoutBusy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto choose</SelectItem>
                    {AI_LAYOUT_TEMPLATE_IDS.map((templateId) => (
                      <SelectItem key={templateId} value={templateId}>
                        {AUTO_LAYOUT_TEMPLATE_LABELS[templateId]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Style preset</Label>
                <Select
                  value={autoLayoutStyleChoice}
                  onValueChange={(value) => setAutoLayoutStyleChoice(value as AutoLayoutStyleChoice)}
                  disabled={autoLayoutBusy}
                >
                  <SelectTrigger>
                    {autoLayoutStyleChoice === "auto" ? (
                      <SelectValue />
                    ) : (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-left">
                          {selectedAutoLayoutStyleOption?.label ?? autoLayoutStyleChoice}
                        </span>
                        <span className="flex items-center gap-1">
                          {(selectedAutoLayoutStyleOption?.colors ?? []).map((color, index) => (
                            <span
                              key={`${selectedAutoLayoutStyleOption?.id ?? "preset"}-${index}`}
                              className="h-3 w-3 rounded-full border border-slate-300"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                      </div>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto infer from current slide</SelectItem>
                    {autoLayoutStyleOptions.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        <div className="flex w-full items-center justify-between gap-2">
                          <span>{preset.label}</span>
                          <span className="flex items-center gap-1">
                            {preset.colors.map((color, index) => (
                              <span
                                key={`${preset.id}-color-${index}`}
                                className="h-3 w-3 rounded-full border border-slate-300"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">Include decorative SVG</p>
                <p className="text-xs text-slate-500">Adds supporting vector graphic accents when suitable.</p>
              </div>
              <Switch
                checked={autoLayoutIncludeSvg}
                onCheckedChange={setAutoLayoutIncludeSvg}
                disabled={autoLayoutBusy}
              />
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Geometric image crop</p>
                  <p className="text-xs text-slate-500">Crop the main image with a shape mask (rect, circle, triangle).</p>
                </div>
                <Switch
                  checked={autoLayoutIncludeGeometricCrop}
                  onCheckedChange={setAutoLayoutIncludeGeometricCrop}
                  disabled={autoLayoutBusy}
                />
              </div>
              {autoLayoutIncludeGeometricCrop ? (
                <div className="space-y-1.5">
                  <Label>Crop shape</Label>
                  <Select
                    value={autoLayoutCropShapeChoice}
                    onValueChange={(value) => setAutoLayoutCropShapeChoice(value as AutoLayoutCropShapeChoice)}
                    disabled={autoLayoutBusy}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_GEOMETRIC_CROP_SHAPES.map((shape) => (
                        <SelectItem key={shape} value={shape}>
                          {AUTO_LAYOUT_CROP_SHAPE_LABELS[shape]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Geometric accents</p>
                  <p className="text-xs text-slate-500">Add decorative shape overlays without cropping image content.</p>
                </div>
                <Switch
                  checked={autoLayoutIncludeGeometricAccents}
                  onCheckedChange={setAutoLayoutIncludeGeometricAccents}
                  disabled={autoLayoutBusy}
                />
              </div>
              {autoLayoutIncludeGeometricAccents ? (
                <div className="space-y-1.5">
                  <Label>Accent shape</Label>
                  <Select
                    value={autoLayoutAccentShapeChoice}
                    onValueChange={(value) => setAutoLayoutAccentShapeChoice(value as AutoLayoutAccentShapeChoice)}
                    disabled={autoLayoutBusy}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_GEOMETRIC_ACCENT_SHAPES.map((shape) => (
                        <SelectItem key={shape} value={shape}>
                          {AUTO_LAYOUT_ACCENT_SHAPE_LABELS[shape]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Watermark</p>
                  <p className="text-xs text-slate-500">Use PNG/JPG image from library and set visibility percentage.</p>
                </div>
                <Switch
                  checked={autoLayoutWatermarkEnabled}
                  onCheckedChange={setAutoLayoutWatermarkEnabled}
                  disabled={autoLayoutBusy}
                />
              </div>
              {autoLayoutWatermarkEnabled ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Watermark image</Label>
                    <SearchableCombobox
                      items={autoLayoutWatermarkComboboxItems}
                      value={autoLayoutWatermarkSourceUrl}
                      onValueChange={handleAutoLayoutWatermarkSourceChange}
                      disabled={autoLayoutBusy || autoLayoutWatermarkOptions.length === 0}
                      placeholder={autoLayoutWatermarkOptions.length === 0
                        ? "No PNG/JPG image found in library"
                        : "Select watermark image"}
                      searchPlaceholder="Search watermark from Library..."
                      emptyMessage={autoLayoutWatermarkQuery.isLoading
                        ? "Loading watermark images..."
                        : "No matching PNG/JPG watermark found."}
                      searchValue={autoLayoutWatermarkSearchQuery}
                      onSearchValueChange={setAutoLayoutWatermarkSearchQuery}
                    />
                    <p className="text-[11px] text-slate-500">Search in Library (RAG) by image title or keyword.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Clarity: {autoLayoutWatermarkClarityPercent}%</Label>
                    <Slider
                      min={5}
                      max={100}
                      step={5}
                      value={[autoLayoutWatermarkClarityPercent]}
                      onValueChange={(value) => setAutoLayoutWatermarkClarityPercent(value[0] ?? 20)}
                      disabled={autoLayoutBusy}
                    />
                  </div>
                  {selectedAutoLayoutWatermarkOption ? (
                    <div className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2">
                      <img
                        src={selectedAutoLayoutWatermarkOption.thumbnailUrl || selectedAutoLayoutWatermarkOption.sourceUrl}
                        alt={selectedAutoLayoutWatermarkOption.label}
                        className="h-10 w-16 rounded border border-slate-200 object-contain"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700">{selectedAutoLayoutWatermarkOption.label}</p>
                        <p className="text-[11px] text-slate-500">{selectedAutoLayoutWatermarkOption.format.toUpperCase()}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              Target slides: {autoLayoutTargetCount}
            </p>
            {autoLayoutScope === "all" && unsavedCachedSlideIds.length > 0 ? (
              <p className="text-xs text-sky-600">
                Pending edits on other slides will be saved automatically before Auto Layout runs.
              </p>
            ) : null}
            {autoLayoutProgress ? (
              <p className="text-xs text-slate-600">
                Processing {autoLayoutProgress.done}/{autoLayoutProgress.total} slides...
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAutoLayoutDialogOpen(false)}
              disabled={autoLayoutBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1 bg-sky-600 text-white hover:bg-sky-500"
              onClick={() => void handleAutoRelayoutSlide({
                scope: autoLayoutScope,
                templateChoice: autoLayoutTemplateChoice,
                styleChoice: autoLayoutStyleChoice,
                includeSvg: autoLayoutIncludeSvg,
                includeGeometricCrop: autoLayoutIncludeGeometricCrop,
                cropShapeChoice: autoLayoutCropShapeChoice,
                includeGeometricAccents: autoLayoutIncludeGeometricAccents,
                accentShapeChoice: autoLayoutAccentShapeChoice,
                watermarkEnabled: autoLayoutWatermarkEnabled,
                watermarkSourceUrl: autoLayoutWatermarkSourceUrl,
                watermarkClarityPercent: autoLayoutWatermarkClarityPercent,
              })}
              disabled={autoLayoutApplyDisabled}
            >
              {autoLayoutBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
              Apply Auto Layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(restoreDialogVersion)}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreDialogVersionId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore version {restoreDialogVersion?.versionNumber ?? restoreDialogVersion?.id}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the target slide with the selected snapshot. The restore action
              will also create a new history version so you can undo by restoring again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!restoreDialogVersion) {
                  return;
                }
                void handleRestoreSavedVersion(restoreDialogVersion.id);
              }}
              disabled={restoreVersionMutation.isPending}
            >
              {restoreVersionMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Confirm Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {deck && (
        <ExportDialog
          open={isExportDialogOpen}
          onClose={() => setIsExportDialogOpen(false)}
          deckId={deck.id}
          onBeforeExport={async () => {
            if (!hasUnsavedSelectedSlideChanges) {
              return true;
            }

            const saved = await handleSaveSlide({ silent: true });
            if (!saved) {
              const blockedReason = shouldBlockSaveAttempt(
                normalizeConflictPolicy(conflictPolicyRef.current, Date.now()),
                "manual",
                Date.now(),
              );
              toast.error(
                blockedReason === "stale_blocked"
                  ? "Export blocked by version conflict. Reload latest and retry."
                  : "Unable to save latest slide changes before export.",
              );
            }
            return saved;
          }}
        />
      )}
      {isImportDialogOpen && (
        <ImportPresentationDialog onClose={() => setIsImportDialogOpen(false)} />
      )}
      {isAIDraftModalOpen && deck && (
        <AIDraftModal
          isOpen={isAIDraftModalOpen}
          onClose={() => setIsAIDraftModalOpen(false)}
          deckId={deck.id}
          expectedVersion={deck.version}
          currentSlideCount={slides.length}
          canvasWidth={activeCanvasSize.width}
          canvasHeight={activeCanvasSize.height}
        />
      )}
      {isMobileViewport && (
        <MobileDrawerPanel
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
          slidesPanel={slidesPanel}
          onAddElement={handleAddElement}
          snapLockEnabled={snapLockEnabled}
          onToggleSnapLock={() => setSnapLockEnabled((p) => !p)}
        />
      )}
    </div>
  );
}
