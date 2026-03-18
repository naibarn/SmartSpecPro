import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactElement } from "react";
import { useLocation, useRoute } from "wouter";
import DOMPurify from "dompurify";
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
  LayoutTemplate,
  Menu,
  Minus,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  MousePointer2,
  MoreHorizontal,
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
  BlocksPanel,
  CANVAS_LIBRARY_ASSET_DRAG_MIME,
  ComponentCanvasOverlay,
  CanvasShell,
  CanvasStage,
  ComponentInspector,
  GraphicsPanel,
  MobileBottomSheet,
  MobileDrawerPanel,
  MobileQuickActions,
  PropertyPanel,
  SlideElementPreview,
  TransformHandles,
  type AssetLibraryTab,
  type CanvasLibraryAsset,
  type CanvasStageDropAssetPayload,
  type MobileBottomSheetTab,
  type PresentationBlockPresetId,
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
import { HelpButton } from "@/components/help";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { buildPresentationBlockPreset, PRESENTATION_BLOCK_PRESETS } from "@/lib/presentationBlockPresets";
import {
  clonePresentationCustomBlock,
  loadLegacyPresentationCustomBlocks,
  type PresentationCustomBlockDefinition,
} from "@/lib/presentationCustomBlocks";
import { buildWrongEditorOpenGuard } from "@/lib/presentationRouting";
import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";
import {
  buildBuiltInPresentationComponentInstance,
  buildBuiltInPresentationComponentInstanceFromNarrative,
  buildBuiltInPresentationComponentInstanceFromSlotBindings,
  getBuiltInPresentationComponentDefinition,
  getPresentationComponentCanvasSlotAreas,
  rebuildBuiltInPresentationComponentInstance,
} from "@/lib/presentationComponentCatalog";
import { toast } from "sonner";
import {
  addComponent,
  addElement as insertElement,
  createElement,
  deleteComponents,
  deleteElements,
  duplicateComponentById,
  duplicateElements,
  ensureSlideContent,
  fitComponentFallbackElementsToCanvas,
  getRenderableSlideElements,
  groupRenderablesIntoComponent,
  isPresentationGroupComponent,
  PRESENTATION_GROUP_COMPONENT_ID,
  resizeCanvas,
  resizeComponentSlotFallbackElements,
  translateComponentFallbackElements,
  translateElements,
  updateComponentById,
  type ArrangeDirection,
  type PresentationComponentInstance,
  type PresentationElement,
  type PresentationElementType,
  type PresentationSlideContent,
} from "@/lib/presentationEditorState";
import {
  fitSlidesToProjectAudioDuration,
  resolveProjectAudioPlayableDurationMs,
  type FitSlidesToProjectAudioDurationFailure,
} from "@/lib/presentationTiming";
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
  addComponentCommand,
  addElementCommand,
  addElementsCommand,
  arrangeComponentCommand,
  arrangeSelectionCommand,
  createCanvasCommandState,
  deleteComponentCommand,
  deleteSelectionCommand,
  detachComponentCommand,
  duplicateComponentCommand,
  duplicateSelectionCommand,
  groupSelectionCommand,
  moveComponentCommand,
  moveSelectionCommand,
  patchElementByIdCommand,
  patchSelectedElementCommand,
  resizeComponentCommand,
  resizeSelectionCommand,
  rotateComponentCommand,
  rotateSelectionCommand,
  selectElementsCommand,
  setCanvasSizeCommand,
  setSlideBackgroundCommand,
  updateComponentCommand,
  type CanvasCommandState,
} from "@/presentation-canvas/commands/commands";
import {
  trackAIModeLockToggled,
  trackAIModeOverrideSet,
  trackAIRecipeOverrideApplied,
  trackAutosaveResult,
  trackPresentationCustomBlockSaved,
} from "@/lib/analytics/presentationEvents";
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
import {
  BUILT_IN_PRESENTATION_COMPONENT_IDS,
  PRESENTATION_COMPONENT_AI_GUIDANCE,
  PRESENTATION_COMPONENT_LAYOUT_FAMILIES,
  PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES,
  presentationMediaSlotSupportsType,
  type BuiltInPresentationComponentId,
} from "@shared/presentation/componentRecipes";
import {
  PRESENTATION_AI_LAYOUT_MODES,
  type PresentationAILayoutMode,
} from "@shared/presentation/contentProfile";
import { type PresentationCustomBlockPreviewSource, type PresentationCustomBlockVisibility } from "@shared/presentation/customBlocks";
import {
  computeMediaMotionTimelineFrame,
  hasActiveMediaMotion,
} from "@shared/presentation/mediaMotion";
import { buildPresentationMediaShapeStyleForElement } from "@shared/presentation/mediaShape";
import type {
  PresentationExportWarning,
  PresentationMediaMotion,
  PresentationSlideAIDesign,
  PresentationSlideBackground,
  PresentationTransition,
} from "@shared/presentation/contracts";
import { presentationRenderOrderIdForComponent, presentationRenderOrderIdForElement } from "@shared/presentation/contracts";

function parseDocId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type SaveState = "idle" | "pending" | "saved" | "conflict" | "error";
type PlaybackState = "idle" | "playing";
type SaveMode = "manual" | "autosave";
type LibraryMediaKind = "image" | "video";
type MobilePropertiesSection = "element" | "slide" | "canvas";
const MIN_DESKTOP_ZOOM = 0.5;
const MAX_DESKTOP_ZOOM = 2;
const DESKTOP_ZOOM_STEP = 0.1;
const MIN_SLIDE_DURATION_MS = 250;
const MAX_SLIDE_DURATION_MS = 120_000;
const SLIDESHOW_PREVIEW_TRANSITION_DURATION_MS = 700;
const MOBILE_SHEET_TAB_STORAGE_KEY = "presentation-editor-mobile-sheet-tab";
const MOBILE_SHEET_EXPANDED_STORAGE_KEY = "presentation-editor-mobile-sheet-expanded";
const MOBILE_SHEET_TABS = new Set<MobileBottomSheetTab>(["Add", "Layers", "Properties", "Pages", "Versions", "Audio"]);
const PRESENTATION_TRANSITION_OPTIONS: Array<{ value: PresentationTransition; label: string }> = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "blur", label: "Blur" },
];

const PRESENTATION_AI_LAYOUT_MODE_LABELS: Record<PresentationAILayoutMode, string> = {
  structured_block: "Structured Block",
  long_form_block: "Long-Form Block",
  llm_layout_dsl: "LLM Layout DSL",
  full_slide_media: "Full-Slide Media",
};

const PRESENTATION_AI_LAYOUT_BLOCKED_BY_LABELS: Record<string, string> = {
  feature_flag: "Feature flag",
  provider_capability: "Provider capability",
  cost: "Cost guardrail",
  safety: "Safety guardrail",
  lock_conflict: "Mode lock conflict",
};

function resolvePresentationModeForRecipe(
  recipeId: BuiltInPresentationComponentId,
): PresentationAILayoutMode {
  return PRESENTATION_COMPONENT_LAYOUT_FAMILIES[recipeId] === "long_form"
    ? "long_form_block"
    : "structured_block";
}

function formatAILayoutUserText(value: string): string {
  return value
    .replace(/\brecipes\b/gi, "block layouts")
    .replace(/\brecipe\b/gi, "block layout");
}

function readStoredMobileSheetTab(): MobileBottomSheetTab | null {
  try {
    const stored = window.sessionStorage.getItem(MOBILE_SHEET_TAB_STORAGE_KEY);
    return stored && MOBILE_SHEET_TABS.has(stored as MobileBottomSheetTab)
      ? stored as MobileBottomSheetTab
      : null;
  } catch {
    return null;
  }
}

function readStoredMobileSheetExpanded(defaultValue: boolean): boolean {
  try {
    const stored = window.sessionStorage.getItem(MOBILE_SHEET_EXPANDED_STORAGE_KEY);
    if (stored === "true") {
      return true;
    }
    if (stored === "false") {
      return false;
    }
  } catch {
    return defaultValue;
  }
  return defaultValue;
}

function getSlideshowPreviewTransitionStyle(
  transition: PresentationTransition,
  entering: boolean,
): CSSProperties {
  if (!entering || transition === "cut") {
    return {
      opacity: 1,
      transform: "none",
    };
  }

  switch (transition) {
    case "slide-left":
      return {
        opacity: 0,
        transform: "translate3d(56px, 0, 0) scale(1)",
      };
    case "slide-right":
      return {
        opacity: 0,
        transform: "translate3d(-56px, 0, 0) scale(1)",
      };
    case "zoom-in":
      return {
        opacity: 0,
        transform: "translate3d(0, 0, 0) scale(1.08)",
      };
    case "zoom-out":
      return {
        opacity: 0,
        transform: "translate3d(0, 0, 0) scale(0.92)",
      };
    case "blur":
      return {
        opacity: 0,
        transform: "translate3d(0, 0, 0) scale(1)",
        filter: "blur(10px)",
      };
    case "fade":
    default:
      return {
        opacity: 0,
        transform: "none",
      };
  }
}

type AutoLayoutScope = "current" | "all";
type AutoLayoutTemplateChoice =
  | "auto"
  | `block:${BuiltInPresentationComponentId}`;
type AutoLayoutStyleChoice = "auto" | (typeof AI_STYLE_PRESET_IDS)[number];
type AutoLayoutCropShapeChoice = (typeof AI_GEOMETRIC_CROP_SHAPES)[number];
type AutoLayoutAccentShapeChoice = (typeof AI_GEOMETRIC_ACCENT_SHAPES)[number];
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

function resolveAutoLayoutTemplateSelection(choice: AutoLayoutTemplateChoice): {
  templateId?: (typeof AI_LAYOUT_TEMPLATE_IDS)[number];
  componentRecipeId?: BuiltInPresentationComponentId;
} {
  if (choice === "auto") {
    return {};
  }
  return {
    componentRecipeId: choice.slice("block:".length) as BuiltInPresentationComponentId,
  };
}
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

function ResponsiveSvgPreview({
  svg,
  className,
  testId,
}: {
  svg: string;
  className?: string;
  testId?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const svgNode = container.querySelector("svg");
    if (!(svgNode instanceof SVGSVGElement)) {
      return;
    }
    svgNode.style.display = "block";
    svgNode.style.width = "100%";
    svgNode.style.maxWidth = "100%";
    svgNode.style.height = "auto";
    svgNode.setAttribute("preserveAspectRatio", svgNode.getAttribute("preserveAspectRatio") || "xMidYMid meet");
  }, [svg]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid={testId}
      style={{ overflow: "hidden" }}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
    />
  );
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

interface SlideDraftState {
  content: PresentationSlideContent;
  notes: string | null;
}

interface DialogDragPosition {
  x: number;
  y: number;
}

interface DialogDragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function useDraggableDialog(isOpen: boolean) {
  const [position, setPosition] = useState<DialogDragPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DialogDragState | null>(null);

  useEffect(() => {
    if (!isOpen) {
      dragStateRef.current = null;
      setIsDragging(false);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      setPosition({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      });
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleDragStart = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
      };
      setIsDragging(true);
      event.preventDefault();
    },
    [position.x, position.y],
  );

  const dialogStyle = useMemo<CSSProperties | undefined>(() => {
    if (position.x === 0 && position.y === 0) {
      return undefined;
    }
    return {
      transform: `translate(${position.x}px, ${position.y}px)`,
    };
  }, [position.x, position.y]);

  return {
    dialogStyle,
    handleDragStart,
    isDragging,
  };
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
    notes?: string | null;
  };
}

interface DeckNoteConflictState {
  latestVersion: number | null;
  latestNotes: string;
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
  draftNotes: string | null,
): boolean {
  if (!conflict.latestSlide || conflict.latestSlide.slideContent == null) {
    return false;
  }

  try {
    const latestNormalized = ensureSlideContent(conflict.latestSlide.slideContent as PresentationSlideContent);
    const draftNormalized = ensureSlideContent(draftContent);
    return (
      buildSlideContentSignature(latestNormalized) === buildSlideContentSignature(draftNormalized)
      && (conflict.latestSlide.notes ?? "") === (draftNotes ?? "")
    );
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

function nextComponentId(componentId: string): string {
  return `component-${componentId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toComponentSelectionId(componentId: string): string {
  return `component:${componentId}`;
}

function fromComponentSelectionId(selectionId: string): string | null {
  return selectionId.startsWith("component:")
    ? selectionId.slice("component:".length)
    : null;
}

function isBuiltInPresentationComponentId(value: string | undefined): value is BuiltInPresentationComponentId {
  return typeof value === "string"
    && (BUILT_IN_PRESENTATION_COMPONENT_IDS as readonly string[]).includes(value);
}

function getComponentBounds(component: PresentationComponentInstance): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!component.fallbackElements.length) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of component.fallbackElements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + Math.max(2, element.height));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function parseSlideNarrativeSectionsFromNotes(notes: string | null | undefined): Array<{ heading: string; details: string[] }> {
  const normalized = String(notes ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return [];
  }

  const sections: Array<{ heading: string; details: string[] }> = [];
  let active: { heading: string; details: string[] } | null = null;
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const headingMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headingMatch) {
      active = {
        heading: headingMatch[1].trim().slice(0, 180),
        details: [],
      };
      sections.push(active);
      continue;
    }
    const normalizedDetail = line.replace(/^[-*]\s+/, "").trim();
    if (!normalizedDetail) {
      continue;
    }
    if (!active) {
      active = {
        heading: "Highlights",
        details: [],
      };
      sections.push(active);
    }
    if (active.details.length < 4) {
      active.details.push(normalizedDetail.slice(0, 260));
    }
  }

  return sections.filter((section) => section.heading && section.details.length > 0).slice(0, 6);
}

function collectSlideBodyLinesForAIOverride(
  slideTitle: string,
  content: PresentationSlideContent,
): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  const titleKey = slideTitle.trim().toLowerCase();
  const renderableText = getRenderableSlideElements(content)
    .filter((element): element is Extract<PresentationElement, { type: "text" }> => element.type === "text")
    .sort((left, right) => (left.y - right.y) || (left.x - right.x));

  for (const element of renderableText) {
    const chunks = String(element.text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const chunk of chunks) {
      const key = chunk.toLowerCase();
      if (!key || key === titleKey || seen.has(key)) {
        continue;
      }
      seen.add(key);
      lines.push(chunk);
      if (lines.length >= 8) {
        return lines;
      }
    }
  }

  return lines;
}

function inferAIOverrideBackground(
  content: PresentationSlideContent,
  canvas: { width: number; height: number },
): PresentationSlideBackground | undefined {
  if (content.background) {
    return content.background;
  }
  const backgroundImage = content.elements.find((element) => (
    element.type === "image"
    && element.x === 0
    && element.y === 0
    && element.width === canvas.width
    && element.height === canvas.height
    && element.src?.trim()
  ));
  if (backgroundImage?.type === "image" && backgroundImage.src?.trim()) {
    return { type: "image", url: backgroundImage.src.trim() };
  }
  const backgroundRect = content.elements.find((element) => (
    element.type === "rect"
    && element.x === 0
    && element.y === 0
    && element.width === canvas.width
    && element.height === canvas.height
    && (!element.strokeWidth || element.strokeWidth === 0)
  ));
  if (!backgroundRect || backgroundRect.type !== "rect") {
    return undefined;
  }
  return {
    type: "color",
    value: backgroundRect.fill,
  };
}

/**
 * Returns full-canvas rect elements that act as overlay tints (e.g. dark semi-transparent overlays).
 * These are preserved when applying AI Layout so the visual style of the slide is retained.
 */
function getOverlayLayerElements(
  content: PresentationSlideContent,
  canvas: { width: number; height: number },
  background: PresentationSlideBackground | undefined,
): PresentationElement[] {
  return content.elements.filter((element) => (
    element.type === "rect"
    && element.x === 0
    && element.y === 0
    && element.width === canvas.width
    && element.height === canvas.height
    // Exclude rects with stroke (they are borders, not overlays)
    && (!element.strokeWidth || element.strokeWidth === 0)
    // Exclude the rect that was already promoted to content.background as a solid color
    && !(background?.type === "color" && element.fill === background.value && !element.opacity)
  ));
}

function inferAIOverrideMediaUrl(
  content: PresentationSlideContent,
  recipeId: BuiltInPresentationComponentId,
): string | undefined {
  const renderableElements = getRenderableSlideElements(content);
  const preferredMediaTypes = Object.values(PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES[recipeId] ?? {});
  const prefersImage = preferredMediaTypes.some((slotType) => presentationMediaSlotSupportsType(slotType, "image"));
  const prefersVideo = preferredMediaTypes.some((slotType) => presentationMediaSlotSupportsType(slotType, "video"));
  if (prefersImage) {
    const image = renderableElements.find((element) => element.type === "image" && !element.svgContent);
    if (image?.src?.trim()) {
      return image.src.trim();
    }
  }
  if (prefersVideo) {
    const video = renderableElements.find((element) => element.type === "video");
    if (video?.src?.trim()) {
      return video.src.trim();
    }
  }
  return undefined;
}

function truncateAIOverrideText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const sliced = normalized.slice(0, maxChars + 1);
  const lastBoundary = Math.max(
    sliced.lastIndexOf(" "),
    sliced.lastIndexOf("،"),
    sliced.lastIndexOf("，"),
    sliced.lastIndexOf("。"),
    sliced.lastIndexOf(","),
    sliced.lastIndexOf("."),
    sliced.lastIndexOf(":"),
    sliced.lastIndexOf(";"),
  );
  return (lastBoundary >= Math.floor(maxChars * 0.55) ? sliced.slice(0, lastBoundary) : sliced.slice(0, maxChars)).trim();
}

function splitAIOverrideSentenceChunks(value: string, maxChars: number, maxItems: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const initialParts = normalized
    .split(/(?<=[.!?。！？])\s+|\s+[•▪◦·-]\s+|\n+/)
    .map((part) => truncateAIOverrideText(part, maxChars))
    .filter(Boolean);
  if (initialParts.length > 0) {
    return initialParts.slice(0, maxItems);
  }
  const chunks: string[] = [];
  let cursor = normalized;
  while (cursor.length > 0 && chunks.length < maxItems) {
    const nextChunk = truncateAIOverrideText(cursor, maxChars);
    if (!nextChunk) {
      break;
    }
    chunks.push(nextChunk);
    cursor = cursor.slice(nextChunk.length).trim();
  }
  return chunks;
}

function recipeSupportsAvailableMedia(
  recipeId: BuiltInPresentationComponentId,
  options: { hasImage: boolean; hasVideo: boolean },
): boolean {
  const slotTypes = Object.values(PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES[recipeId] ?? {});
  if (slotTypes.length === 0) {
    return true;
  }
  return slotTypes.every((slotType) => (
    (presentationMediaSlotSupportsType(slotType, "image") && options.hasImage)
    || (presentationMediaSlotSupportsType(slotType, "video") && options.hasVideo)
  ));
}

function inferAIOverrideRecipeId(options: {
  title: string;
  body: string[];
  sections: Array<{ heading: string; details: string[] }>;
  hasImage: boolean;
  hasVideo: boolean;
  slideIndex?: number;
}): BuiltInPresentationComponentId {
  const bodyCount = options.body.filter(Boolean).length;
  const sectionCount = options.sections.length;
  const totalTextLength = options.body.join("").length + options.title.length;
  const longBodyLineCount = options.body.filter((line) => line.length > 120).length;
  const joinedText = `${options.title}\n${options.body.join("\n")}`.toLowerCase();
  const looksNumeric = /\b\d+(?:[%.,]\d+)?\b/.test(joinedText);
  const isLongContent = totalTextLength > 300 || longBodyLineCount > 0 || bodyCount >= 5;

  // Build a list of suitable candidates, then pick based on slideIndex for variety
  const candidates: BuiltInPresentationComponentId[] = [];

  if (options.hasVideo) {
    return "video-spotlight";
  }

  // Long content with sections → document-style blocks
  if (sectionCount >= 2 && isLongContent) {
    candidates.push("sectioned-explainer", "article-focus", "two-column-article");
    if (options.hasImage) {
      candidates.push("image-top-article", "image-left-article");
    }
  }
  // Sections without long content → process/structured blocks
  else if (sectionCount >= 2 && sectionCount <= 3) {
    candidates.push("process-steps", "timeline-flow", "feature-highlights");
  }
  else if (sectionCount >= 4) {
    candidates.push(
      options.hasImage ? "framed-image-story" : "infographic-grid",
      "faq-stack",
    );
  }

  // Numeric content → data blocks
  if (looksNumeric && bodyCount <= 4) {
    candidates.push("stat-cards");
  }

  // Image + long text → article/image blocks
  if (options.hasImage && isLongContent && candidates.length === 0) {
    candidates.push(
      "image-top-article", "image-bottom-article",
      "image-left-article", "image-right-article",
      "framed-image-story",
    );
  }
  // Image + medium text → spotlight blocks
  else if (options.hasImage && bodyCount >= 2) {
    if (candidates.length === 0) {
      candidates.push("poster-spotlight", "framed-image-story");
      if (isLongContent) {
        candidates.push("image-top-article", "image-right-article");
      }
    }
  }

  // Short content → compact blocks
  if (candidates.length === 0) {
    if (bodyCount <= 2) {
      candidates.push("quote-callout", "poster-spotlight");
    } else if (bodyCount <= 4) {
      candidates.push("feature-highlights", "process-steps");
    } else {
      candidates.push(
        options.hasImage ? "framed-image-story" : "infographic-grid",
        "article-focus",
      );
    }
  }

  // Pick from candidates using slideIndex for variety across slides
  const idx = options.slideIndex ?? 0;
  return candidates[idx % candidates.length] ?? candidates[0];
}

function adaptAIOverrideNarrativeForRecipe(
  recipeId: BuiltInPresentationComponentId,
  narrative: {
    title: string;
    body: string[];
    notes?: string;
    sections?: Array<{ heading: string; details: string[] }>;
    graphicCategory?: string;
  },
): {
  title: string;
  body: string[];
  notes?: string;
  sections?: Array<{ heading: string; details: string[] }>;
  graphicCategory?: string;
} {
  const cleanTitle = truncateAIOverrideText(narrative.title || "Key Insight", 96) || "Key Insight";
  const cleanBody = narrative.body
    .map((line) => truncateAIOverrideText(line, 180))
    .filter(Boolean);
  const cleanSections = (narrative.sections ?? [])
    .map((section) => ({
      heading: truncateAIOverrideText(section.heading, 72),
      details: section.details
        .map((detail) => truncateAIOverrideText(detail, 140))
        .filter(Boolean),
    }))
    .filter((section) => section.heading && section.details.length > 0);

  const deriveSectionsFromBody = (maxSections: number, detailChars: number) => {
    const sectionLines = cleanSections.flatMap((section) => (
      section.details.length > 0
        ? [{
          heading: truncateAIOverrideText(section.heading, 56),
          details: section.details.slice(0, 2).map((detail) => truncateAIOverrideText(detail, detailChars)),
        }]
        : []
    ));
    if (sectionLines.length > 0) {
      return sectionLines.slice(0, maxSections);
    }
    return cleanBody.slice(0, maxSections).map((line, index) => {
      const chunks = splitAIOverrideSentenceChunks(line, detailChars, 2);
      const heading = truncateAIOverrideText(chunks[0] ?? line, 56);
      const details = (chunks.length > 1 ? chunks.slice(1) : [truncateAIOverrideText(line, detailChars)])
        .filter(Boolean)
        .slice(0, 2);
      return {
        heading: heading || `Point ${index + 1}`,
        details,
      };
    });
  };

  switch (recipeId) {
    case "process-steps":
      return {
        title: truncateAIOverrideText(cleanTitle, 72),
        body: cleanBody.slice(0, 1).map((line) => truncateAIOverrideText(line, 120)),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        sections: deriveSectionsFromBody(3, 120).slice(0, 3),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "timeline-flow":
      return {
        title: truncateAIOverrideText(cleanTitle, 72),
        body: cleanBody.slice(0, 1).map((line) => truncateAIOverrideText(line, 120)),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        sections: deriveSectionsFromBody(4, 110).slice(0, 4),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "feature-highlights":
      return {
        title: truncateAIOverrideText(cleanTitle, 76),
        body: cleanBody.slice(0, 1).map((line) => truncateAIOverrideText(line, 110)),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        sections: deriveSectionsFromBody(3, 96).slice(0, 3),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "infographic-grid":
      return {
        title: truncateAIOverrideText(cleanTitle, 76),
        body: cleanBody.slice(0, 2).map((line) => truncateAIOverrideText(line, 104)),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        sections: deriveSectionsFromBody(4, 96).slice(0, 4),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "poster-spotlight":
    case "video-spotlight":
      return {
        title: truncateAIOverrideText(cleanTitle, 68),
        body: cleanBody
          .flatMap((line) => splitAIOverrideSentenceChunks(line, 110, 2))
          .slice(0, 3),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "framed-image-story":
      return {
        title: truncateAIOverrideText(cleanTitle, 74),
        body: cleanBody
          .flatMap((line) => splitAIOverrideSentenceChunks(line, 118, 2))
          .slice(0, 4),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(cleanSections.length > 0 ? { sections: cleanSections.slice(0, 2) } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "photo-collage":
      return {
        title: truncateAIOverrideText(cleanTitle, 64),
        body: cleanBody
          .flatMap((line) => splitAIOverrideSentenceChunks(line, 90, 2))
          .slice(0, 2),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(cleanSections.length > 0 ? { sections: cleanSections.slice(0, 1) } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "quote-callout":
      return {
        title: truncateAIOverrideText(cleanTitle, 62),
        body: cleanBody
          .flatMap((line) => splitAIOverrideSentenceChunks(line, 120, 2))
          .slice(0, 2),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "stat-cards":
      return {
        title: truncateAIOverrideText(cleanTitle, 68),
        body: cleanBody.slice(0, 4).map((line) => truncateAIOverrideText(line, 84)),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(cleanSections.length > 0 ? { sections: cleanSections.slice(0, 3) } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "sectioned-explainer":
      return {
        title: truncateAIOverrideText(cleanTitle, 96),
        body: cleanBody
          .flatMap((line) => splitAIOverrideSentenceChunks(line, 180, 2))
          .slice(0, 6),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(cleanSections.length > 0 ? {
          sections: cleanSections.slice(0, 3).map((section) => ({
            heading: truncateAIOverrideText(section.heading, 96),
            details: section.details
              .flatMap((detail) => splitAIOverrideSentenceChunks(detail, 220, 2))
              .slice(0, 2),
          })),
        } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    case "profile-summary":
      return {
        title: truncateAIOverrideText(cleanTitle, 68),
        body: cleanBody
          .flatMap((line) => splitAIOverrideSentenceChunks(line, 92, 2))
          .slice(0, 4),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
    default:
      return {
        title: cleanTitle,
        body: cleanBody.slice(0, 6),
        ...(narrative.notes ? { notes: narrative.notes } : {}),
        ...(cleanSections.length > 0 ? { sections: cleanSections.slice(0, 4) } : {}),
        ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
      };
  }
}

function createUniqueCustomBlockLabel(
  baseLabel: string,
  existingBlocks: PresentationCustomBlockDefinition[],
): string {
  const normalizedBase = baseLabel.trim() || "Saved Block";
  const lowerCaseLabels = new Set(existingBlocks.map((block) => block.label.trim().toLowerCase()));
  if (!lowerCaseLabels.has(normalizedBase.toLowerCase())) {
    return normalizedBase;
  }
  let suffix = 2;
  while (lowerCaseLabels.has(`${normalizedBase} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${normalizedBase} ${suffix}`;
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
  notes?: string | null,
): string | null {
  if (!slideId) {
    return null;
  }

  return `${slideId}:${buildSlideContentSignature(content)}:${notes ?? ""}`;
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

async function copyTextToClipboard(value: string, successMessage: string): Promise<void> {
  const text = value.trim();
  if (!text) {
    toast.error("Nothing to copy.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Copy failed.");
  }
}

export function mergeResolvedPendingMediaIntoCachedDraft(
  cachedContent: PresentationSlideContent,
  persistedContent: PresentationSlideContent,
): PresentationSlideContent {
  const cached = ensureSlideContent(cachedContent);
  const persisted = ensureSlideContent(persistedContent);
  const cachedJobs = Array.isArray(cached.pendingMediaJobs) ? cached.pendingMediaJobs : [];
  if (cachedJobs.length === 0) {
    return cached;
  }

  const persistedJobs = Array.isArray(persisted.pendingMediaJobs) ? persisted.pendingMediaJobs : [];
  const persistedJobsById = new Map(persistedJobs.map((job) => [job.id, job]));
  const resolvedJobs = cachedJobs.filter((job) => !persistedJobsById.has(job.id));
  if (resolvedJobs.length === 0) {
    return cached;
  }

  let nextElements = [...cached.elements];
  for (const job of resolvedJobs) {
    // Find the real URL from persisted content for this job
    const resolvedElement = persisted.elements.find((element) => {
      if (element.type !== "image" && element.type !== "video") return false;
      if (!("src" in element) || !element.src || !element.src.startsWith("http")) return false;
      if (job.targetElementId) return element.id === job.targetElementId;
      return element.x === job.targetX && element.y === job.targetY;
    });
    const resolvedSrc = resolvedElement && "src" in resolvedElement ? resolvedElement.src : null;
    if (!resolvedSrc) continue;

    // Find mockup in cached elements and just swap src
    const isMockup = (el: any) =>
      (el.type === "image" || el.type === "video")
      && "src" in el
      && (!el.src || el.src === "" || el.src.startsWith("data:image/svg+xml") || el.src === "__PLACEHOLDER__");

    let targetIndex = nextElements.findIndex(isMockup);
    if (targetIndex < 0 && job.targetElementId) {
      targetIndex = nextElements.findIndex((el) => el.id === job.targetElementId && isMockup(el));
    }

    if (targetIndex >= 0) {
      // Just update src — keep position, size, opacity, everything else
      nextElements[targetIndex] = { ...nextElements[targetIndex]!, src: resolvedSrc };
    }
  }

  const remainingJobs = cachedJobs
    .filter((job) => persistedJobsById.has(job.id))
    .map((job) => persistedJobsById.get(job.id) ?? job);

  const { pendingMediaJobs: _cachedPendingMediaJobs, ...cachedWithoutPending } = cached;
  const merged: PresentationSlideContent = {
    ...cachedWithoutPending,
    elements: nextElements,
    ...(remainingJobs.length > 0 ? { pendingMediaJobs: remainingJobs } : {}),
  };

  return buildSlideContentSignature(merged) === buildSlideContentSignature(cached)
    ? cached
    : merged;
}

function normalizeLibraryMediaItems(
  rows: unknown,
  kind: LibraryMediaKind,
  currentUserId: number | null,
): CanvasLibraryAsset[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalized: CanvasLibraryAsset[] = [];
  for (const rawRow of rows) {
    const row = rawRow as LibraryResultItemLike;
    const id = Number(row.id ?? row.item_id);
    if (!Number.isFinite(id)) {
      continue;
    }

    const rowKind = String(row.item_type || "").toLowerCase();
    if ((rowKind === "image" || rowKind === "video") && rowKind !== kind) {
      continue;
    }

    const sourceUrl = String(row.source_url || "").trim();
    if (!sourceUrl) {
      continue;
    }
    const normalizedSourceUrl = normalizeMediaSourceUrl(sourceUrl);
    if (!normalizedSourceUrl) {
      continue;
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

    normalized.push({
      id,
      kind,
      title,
      sourceUrl: normalizedSourceUrl,
      thumbnailUrl: normalizeMediaSourceUrl(
        thumbnailRaw || (kind === "image" ? normalizedSourceUrl : null),
      ) || null,
      sourceType: isSharedByAccessSource || isSharedByOwner ? "shared" : "library",
    });
  }

  return normalized;
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
  const normalized: CanvasLibraryAsset[] = [];
  for (const rawRow of rows) {
    const row = rawRow as MediaHistoryTaskLike;
    if (String(row.status || "").toLowerCase() !== "completed") {
      continue;
    }
    if (String(row.mediaType || "").toLowerCase() !== kind) {
      continue;
    }

    const sourceUrl = extractMediaHistoryResultUrl(row);
    if (!sourceUrl) {
      continue;
    }

    const title = buildMediaHistoryTitle(row, kind);
    const searchable = `${title} ${row.model || ""} ${row.prompt || ""} ${row.id || ""} ${row.taskId || ""}`.toLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) {
      continue;
    }

    const thumbnailUrl = kind === "image"
      ? sourceUrl
      : extractMediaHistoryThumbnailUrl(row);
    const normalizedSourceUrl = normalizeMediaSourceUrl(sourceUrl);
    if (!normalizedSourceUrl) {
      continue;
    }

    normalized.push({
      id: stableTaskNumericId(row, kind),
      kind,
      title,
      sourceUrl: normalizedSourceUrl,
      thumbnailUrl: normalizeMediaSourceUrl(thumbnailUrl),
      sourceType: "history",
    });
  }

  return normalized;
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
  inlineSvgContent: string | null;
  inlineSvgColor: string | null;
} {
  const normalized = ensureSlideContent(slideContent as PresentationSlideContent);
  const renderableElements = getRenderableSlideElements(normalized);
  const mediaElement = renderableElements.find((element) => {
    if (element.type !== "image" && element.type !== "video") {
      return false;
    }
    const source = String((element as any).src || "").trim();
    return source.length > 0;
  }) as ({ type: "image" | "video"; src: string; poster?: string } | undefined);
  const textElement = renderableElements.find((element) => {
    if (element.type !== "text") {
      return false;
    }
    const value = String((element as any).text || "").trim();
    return value.length > 0;
  }) as ({ text: string } | undefined);
  const inlineSvgElement = renderableElements.find((element) => {
    if (element.type !== "image") {
      return false;
    }
    const svgContent = typeof element.svgContent === "string" ? element.svgContent.trim() : "";
    return svgContent.length > 0 && isLikelySvgMarkup(svgContent);
  }) as ({ svgContent: string; svgColor?: string } | undefined);

  return {
    mediaSrc: mediaElement?.src || null,
    mediaPosterSrc:
      mediaElement?.type === "video"
        ? String(mediaElement.poster || "").trim() || null
        : null,
    mediaKind: mediaElement?.type || null,
    textSnippet: textElement?.text ? textElement.text.slice(0, 56) : null,
    elementCount: renderableElements.length,
    inlineSvgContent: inlineSvgElement?.svgContent ?? null,
    inlineSvgColor: inlineSvgElement?.svgColor ?? null,
  };
}

function slideContentHasActiveMediaMotion(content: PresentationSlideContent): boolean {
  return getRenderableSlideElements(content).some((element) => (
    (element.type === "image" || element.type === "video")
    && hasActiveMediaMotion((element as any).mediaMotion)
  ));
}

const MIN_PREVIEW_LINE_HEIGHT = 2;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
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

function resolveVideoDisplayConfig(element: PresentationSlideContent["elements"][number]): {
  fit: "contain" | "cover" | "fill";
  positionX: number;
  positionY: number;
  zoom: number;
} {
  if (element.type !== "video") {
    return { fit: "cover", positionX: 50, positionY: 50, zoom: 1 };
  }
  const fit = (element.videoFit === "contain" || element.videoFit === "fill")
    ? element.videoFit
    : "cover";
  const positionX = clampNumber(Number(element.videoPositionX ?? 50), 0, 100);
  const positionY = clampNumber(Number(element.videoPositionY ?? 50), 0, 100);
  const zoom = clampNumber(Number(element.videoZoom ?? 1), 0.5, 3);
  return { fit, positionX, positionY, zoom };
}

function isLikelySvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("<svg") && normalized.includes("</svg>");
}

function buildReadonlyMediaTransformStyle(
  baseZoom: number,
  positionX: number,
  positionY: number,
  mediaMotion: PresentationMediaMotion | undefined,
  playbackElapsedMs: number,
  slideDurationMs: number,
): CSSProperties {
  const motionFrame = computeMediaMotionTimelineFrame(mediaMotion, playbackElapsedMs, slideDurationMs);
  return {
    transform: `translate(${motionFrame.translateXPercent}%, ${motionFrame.translateYPercent}%) scale(${baseZoom * motionFrame.scaleMultiplier})`,
    transformOrigin: `${positionX}% ${positionY}%`,
  };
}

function renderReadonlySlideElement(
  element: PresentationSlideContent["elements"][number],
  index: number,
  canvasWidth: number,
  canvasHeight: number,
  renderScale: number,
  playbackElapsedMs: number,
  slideDurationMs: number,
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
    const fontSize = typeof element.fontSize === "number" && Number.isFinite(element.fontSize)
      ? element.fontSize
      : 48;
    const lineHeight = Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
    const letterSpacing = typeof element.letterSpacing === "number" && Number.isFinite(element.letterSpacing)
      ? element.letterSpacing
      : 0;
    const hasThaiText = /[\u0e00-\u0e7f]/.test(String(element.text ?? ""));
    const scaledFontSize = Math.max(8, fontSize * Math.max(0.0001, renderScale));
    const scaledPaddingPx = Math.max(1, Math.round(8 * Math.max(0.0001, renderScale)));
    const scaledLetterSpacing = letterSpacing * Math.max(0.0001, renderScale);
    return (
      <div
        key={element.id || `play-${index}`}
        className="absolute overflow-visible"
        style={{
          ...commonStyle,
          backgroundColor: element.backgroundColor || "transparent",
          padding: `${scaledPaddingPx}px`,
          boxSizing: "border-box",
        }}
      >
        <p
          className="w-full whitespace-pre-wrap break-words"
          style={{
            display: "block",
            minHeight: "100%",
            boxSizing: "border-box",
            paddingBottom: hasThaiText ? "0.48em" : "0.14em",
            color: element.color || "#111827",
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
    const normalizedSource = normalizeMediaSourceUrl(element.src);
    const hasSource = Boolean(normalizedSource);
    const inlineSvg = typeof element.svgContent === "string" ? element.svgContent.trim() : "";
    const hasInlineSvg = inlineSvg.length > 0;
    const hasValidInlineSvg = hasInlineSvg && isLikelySvgMarkup(inlineSvg);
    const svgColor = element.svgColor || "#ffffff";
    const coloredSvg = hasValidInlineSvg
      ? inlineSvg.replace(/currentColor/g, svgColor)
      : "";
    const mediaShapeStyle = buildPresentationMediaShapeStyleForElement(element);
    return (
      <div
        key={element.id || `play-${index}`}
        className={`absolute overflow-hidden ${!hasSource && !hasInlineSvg ? "bg-slate-100" : ""}`}
        style={{ ...commonStyle, ...mediaShapeStyle }}
      >
        {hasValidInlineSvg ? (
          <div
            className="h-full w-full"
            data-testid={`readonly-svg-image-${element.id || index}`}
            style={{
              color: svgColor,
              ...buildReadonlyMediaTransformStyle(
                imageConfig.zoom,
                imageConfig.positionX,
                imageConfig.positionY,
                element.mediaMotion,
                playbackElapsedMs,
                slideDurationMs,
              ),
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(coloredSvg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
          />
        ) : hasInlineSvg ? (
          <div
            className="grid h-full w-full place-items-center bg-slate-200/80 text-center text-[11px] font-medium text-slate-600"
            data-testid={`readonly-svg-placeholder-${element.id || index}`}
          >
            SVG unavailable
          </div>
        ) : hasSource ? (
          <img
            src={normalizedSource}
            alt={element.alt || "Image"}
            className="h-full w-full"
            style={{
              objectFit: imageConfig.fit,
              objectPosition: `${imageConfig.positionX}% ${imageConfig.positionY}%`,
              ...buildReadonlyMediaTransformStyle(
                imageConfig.zoom,
                imageConfig.positionX,
                imageConfig.positionY,
                element.mediaMotion,
                playbackElapsedMs,
                slideDurationMs,
              ),
            }}
          />
        ) : null}
      </div>
    );
  }

  if (element.type === "video") {
    const normalizedSource = normalizeMediaSourceUrl(element.src);
    const normalizedPoster = normalizeMediaSourceUrl(element.poster);
    const videoConfig = resolveVideoDisplayConfig(element);
    const mediaShapeStyle = buildPresentationMediaShapeStyleForElement(element);
    return (
      <div key={element.id || `play-${index}`} className="absolute overflow-hidden bg-black" style={{ ...commonStyle, ...mediaShapeStyle }}>
        <video
          data-testid={`readonly-video-${element.id || index}`}
          src={normalizedSource}
          poster={normalizedPoster || undefined}
          className="h-full w-full"
          style={{
            objectFit: videoConfig.fit,
            objectPosition: `${videoConfig.positionX}% ${videoConfig.positionY}%`,
            ...buildReadonlyMediaTransformStyle(
              videoConfig.zoom,
              videoConfig.positionX,
              videoConfig.positionY,
              element.mediaMotion,
              playbackElapsedMs,
              slideDurationMs,
            ),
          }}
          preload="auto"
          autoPlay
          muted={element.muted ?? true}
          loop={element.loop ?? true}
          playsInline
          onPlay={(event) => {
            // Browsers block unmuted autoplay. Start muted then unmute
            // after playback begins if the element has audio enabled.
            if (element.muted === false) {
              const videoNode = event.currentTarget;
              requestAnimationFrame(() => {
                videoNode.muted = false;
              });
            }
          }}
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

function formatDurationSecondsLabel(seconds: number): string {
  return `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
}

function formatDurationMsLabel(milliseconds: number): string {
  return formatDurationSecondsLabel(milliseconds / 1000);
}

async function probeMediaDurationSeconds(
  sourceUrl: string,
  kind: "audio" | "video",
  timeoutMs = 12_000,
): Promise<number | null> {
  if (!sourceUrl.trim()) {
    return null;
  }

  return new Promise((resolve) => {
    const media: HTMLMediaElement = kind === "video"
      ? document.createElement("video")
      : new Audio();
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finalize(null);
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      media.removeEventListener("loadedmetadata", onLoadedMetadata);
      media.removeEventListener("error", onError);
      media.src = "";
      if (typeof media.load === "function") {
        media.load();
      }
    };

    const finalize = (value: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const onLoadedMetadata = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        finalize(media.duration);
        return;
      }
      finalize(null);
    };

    const onError = () => {
      finalize(null);
    };

    media.preload = "metadata";
    media.addEventListener("loadedmetadata", onLoadedMetadata);
    media.addEventListener("error", onError);
    media.src = sourceUrl;
  });
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

  const [customBlockLibraryState, setCustomBlockLibraryState] = useState<{
    search: string;
    scope: "All" | "Built-in" | "Mine" | "Team";
    activityFilter: "All" | "Governed" | "Featured" | "Transferred";
    sortOrder: "Featured" | "Newest" | "A-Z" | "Most Used" | "Recent Activity";
  }>({
    search: "",
    scope: "All",
    activityFilter: "All",
    sortOrder: "Featured",
  });
  const createDeckMutation = trpc.presentation.createDeck.useMutation();
  const updateDeckMutation = trpc.presentation.updateDeck.useMutation();
  const saveAsTemplateMutation = trpc.presentation.saveAsTemplate.useMutation();
  const addSlideMutation = trpc.presentation.addSlide.useMutation();
  const duplicateSlideMutation = trpc.presentation.duplicateSlide.useMutation();
  const deleteSlideMutation = trpc.presentation.deleteSlide.useMutation();
  const reorderSlidesMutation = trpc.presentation.reorderSlides.useMutation();
  const updateSlideMutation = trpc.presentation.updateSlide.useMutation();
  const uploadAndAttachAssetMutation = trpc.presentation.uploadAndAttachAsset.useMutation();
  const restoreVersionMutation = trpc.presentation.restoreVersion.useMutation();
  const triggerExportMutation = trpc.presentation.triggerExport.useMutation();
  const customBlocksQuery = trpc.presentation.listCustomBlocks.useQuery({
    scope: customBlockLibraryState.scope === "Mine"
      ? "mine"
      : customBlockLibraryState.scope === "Team"
        ? "team"
        : "all",
    search: customBlockLibraryState.search.trim() || undefined,
    sort: customBlockLibraryState.sortOrder === "Newest"
      ? "newest"
      : customBlockLibraryState.sortOrder === "Most Used"
        ? "most_used"
      : customBlockLibraryState.sortOrder === "Recent Activity"
        ? "recent_activity"
      : customBlockLibraryState.sortOrder === "A-Z"
        ? "a_z"
        : "featured",
    limit: 100,
  }, {
    enabled: isAuthenticated,
  });
  const saveCustomBlockMutation = trpc.presentation.saveCustomBlock.useMutation();
  const deleteCustomBlockMutation = trpc.presentation.deleteCustomBlock.useMutation();
  const updateCustomBlockMutation = trpc.presentation.updateCustomBlock.useMutation();
  const trackCustomBlockUseMutation = trpc.presentation.trackCustomBlockUse.useMutation();
  const relayoutSlideMutation = trpc.presentation.ai.relayoutSlide.useMutation();
  const repairSlideFromNoteMutation = trpc.presentation.ai.repairSlideFromNote.useMutation();
  const generateLayoutFromNoteMutation = trpc.presentation.ai.generateLayoutFromNote.useMutation();
  const generateLayoutFromDeckNoteMutation = trpc.presentation.ai.generateLayoutFromDeckNote.useMutation();
  const resolvePendingMediaMutation = trpc.presentation.ai.resolvePendingMedia.useMutation();
  const updateItemMutation = trpc.library.updateItem.useMutation();
  // Skills for slide note AI content generator
  const noteGenSkillsQuery = trpc.skills.list.useQuery(undefined, { staleTime: 300_000 });
  const noteGenExecuteMutation = trpc.chat.executeSkill.useMutation();
  const noteGenSkillItems = useMemo(() => {
    const skills = noteGenSkillsQuery.data ?? [];
    return skills
      .filter((s: any) => {
        const cat = String(s.category ?? "").toLowerCase();
        const mode = String(s.executionMode ?? "").toLowerCase();
        // Only text-generating skills (article, prompt_enhancement, chat_assistant)
        return (
          cat === "article_generation"
          || cat === "prompt_enhancement"
          || cat === "chat_assistant"
          || mode === "enhance-prompt"
          || /\b(article|writer|copywriter|blog|content)/i.test(String(s.slug ?? "") + " " + String(s.name ?? ""))
        );
      })
      .map((s: any) => ({ value: s.slug as string, label: s.name as string }));
  }, [noteGenSkillsQuery.data]);

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

  // Auto-poll pending media every 5s when there are pending jobs
  const autoResolvePendingMediaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoResolveInFlightRef = useRef(false);
  useEffect(() => {
    if (pendingMediaJobCount > 0 && deck) {
      if (autoResolvePendingMediaRef.current) return;
      autoResolvePendingMediaRef.current = setInterval(async () => {
        if (autoResolveInFlightRef.current) return;
        autoResolveInFlightRef.current = true;
        try {
          const result = await resolvePendingMediaMutation.mutateAsync({
            deckId: deck.id,
            maxJobs: 60,
          });
          if (result.jobsResolved > 0) {
            await refreshDeck();
          } else if (result.jobsRemaining <= 0 && pendingMediaJobCount > 0) {
            // Server already resolved all jobs (e.g., via background scheduler),
            // but frontend still has stale pending state — force refresh.
            await refreshDeck();
          }
          if (result.jobsRemaining <= 0) {
            if (autoResolvePendingMediaRef.current) {
              clearInterval(autoResolvePendingMediaRef.current);
              autoResolvePendingMediaRef.current = null;
            }
          }
        } catch {
          // Silently retry on next interval
        } finally {
          autoResolveInFlightRef.current = false;
        }
      }, 5000);
    } else if (pendingMediaJobCount <= 0 && autoResolvePendingMediaRef.current) {
      clearInterval(autoResolvePendingMediaRef.current);
      autoResolvePendingMediaRef.current = null;
    }
    return () => {
      if (autoResolvePendingMediaRef.current) {
        clearInterval(autoResolvePendingMediaRef.current);
        autoResolvePendingMediaRef.current = null;
      }
    };
  }, [pendingMediaJobCount, deck?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const projectTitle = String(itemQuery.data?.title || deck?.title || (docId ? `Presentation ${docId}` : "Presentation"));
  const currentUserId = useMemo(() => {
    const parsed = Number(user?.id);
    return Number.isFinite(parsed) ? parsed : null;
  }, [user?.id]);

  const [selectedSlideId, setSelectedSlideId] = useState<number | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedComponentSelectionIds, setSelectedComponentSelectionIds] = useState<string[]>([]);
  const [selectedComponentSlotId, setSelectedComponentSlotId] = useState<string | null>(null);
  const [cropModeElementId, setCropModeElementId] = useState<string | null>(null);
  const [cropModeTarget, setCropModeTarget] = useState<"content" | "frame">("content");
  const [customBlocks, setCustomBlocks] = useState<PresentationCustomBlockDefinition[]>([]);
  const [commandState, setCommandState] = useState<CanvasCommandState>(() =>
    createCanvasCommandState({ elements: [] }),
  );
  const slideDraftCacheRef = useRef<Map<number, SlideDraftState>>(new Map());
  const elementClipboardRef = useRef<PresentationElement[]>([]);
  const clipboardPasteCountRef = useRef(0);
  const commandBusRef = useRef(
    new CommandBus<CanvasCommandState>(createCanvasCommandState({ elements: [] })),
  );
  // Stores pre/post states so the useEffect reset after refreshDeck() can restore undo history.
  const pendingAutoLayoutUndoRef = useRef<{
    preLayoutState: CanvasCommandState;
    postLayoutState: CanvasCommandState;
  } | null>(null);
  const restoredAutoLayoutHistoryRef = useRef<{
    slideId: number;
    slideVersion: number | null;
  } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [expectedSlideVersion, setExpectedSlideVersion] = useState<number | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState(() => createConflictPolicyState());
  const conflictPolicyRef = useRef(conflictPolicy);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackSlideIndex, setPlaybackSlideIndex] = useState(0);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [playbackSlideTransitionEntering, setPlaybackSlideTransitionEntering] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportWarnings, setExportWarnings] = useState<PresentationExportWarning[]>([]);
  const [lastExportId, setLastExportId] = useState<number | null>(null);
  const playbackOverlayRef = useRef<HTMLDivElement | null>(null);
  const playbackStageHostRef = useRef<HTMLDivElement | null>(null);
  const previewAudioPlayerRef = useRef<AudioTrackPlayer | null>(null);
  const previewAudioSlideIndexRef = useRef<number | null>(null);
  const previewAudioDeckSignatureRef = useRef<string | null>(null);
  const playbackTransitionSlideRef = useRef<number | null>(null);
  const playbackTransitionFrameRef = useRef<number | null>(null);
  const playbackProgressFrameRef = useRef<number | null>(null);
  const playbackSlideStartedAtRef = useRef<number | null>(null);
  const playbackSlideElapsedRef = useRef(0);
  const [playbackSlideElapsedMs, setPlaybackSlideElapsedMs] = useState(0);
  const [playbackStageHostSize, setPlaybackStageHostSize] = useState({ width: 0, height: 0 });
  const [isPlaybackFullscreen, setIsPlaybackFullscreen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [deckNoteDraft, setDeckNoteDraft] = useState("");
  const [slideNoteDraft, setSlideNoteDraft] = useState("");
  const [slideNoteRepairStatusIndex, setSlideNoteRepairStatusIndex] = useState(0);
  // AI Layout from Note state
  const [layoutGenPresetId, setLayoutGenPresetId] = useState<(typeof AI_STYLE_PRESET_IDS)[number]>("dark-professional");
  const [layoutGenPresetOpen, setLayoutGenPresetOpen] = useState(false);
  const [deckLayoutGenPresetId, setDeckLayoutGenPresetId] = useState<(typeof AI_STYLE_PRESET_IDS)[number]>("dark-professional");
  const [deckLayoutGenOpen, setDeckLayoutGenOpen] = useState(false);
  const [deckLayoutGenSlideCount, setDeckLayoutGenSlideCount] = useState("");
  const layoutGenBusy = generateLayoutFromNoteMutation.isPending;
  const deckLayoutGenBusy = generateLayoutFromDeckNoteMutation.isPending;
  // AI Layout block filter state
  const [aiBlockCategoryFilter, setAiBlockCategoryFilter] = useState<string>("All");
  const filteredBlockPresets = useMemo(() => {
    const canvas = commandState.content.canvas;
    const cw = canvas?.width ?? 720;
    const ch = canvas?.height ?? 1280;
    const canvasIsPortrait = ch > cw;
    const canvasIsLandscape = cw > ch;
    return PRESENTATION_BLOCK_PRESETS.filter((p) => {
      // Orientation filter: hide blocks that won't fit the canvas orientation
      if (canvasIsPortrait && p.canvasIntent === "landscape-16:9") return false;
      if (canvasIsLandscape && p.canvasIntent === "portrait-document") return false;
      if (!canvasIsPortrait && !canvasIsLandscape && p.canvasIntent !== "adaptive") return false;
      // Category filter
      if (aiBlockCategoryFilter === "All") return true;
      return p.category === aiBlockCategoryFilter || (p.tags ?? []).includes(aiBlockCategoryFilter);
    });
  }, [aiBlockCategoryFilter, commandState.content.canvas]);
  // Slide note AI content generator state
  const [noteGenSkill, setNoteGenSkill] = useState("");
  const [noteGenWordLimit, setNoteGenWordLimit] = useState("");
  const [isGeneratingNoteContent, setIsGeneratingNoteContent] = useState(false);
  const [noteGenOpen, setNoteGenOpen] = useState(false);
  const [isProjectTitleEditing, setIsProjectTitleEditing] = useState(false);
  const [isProjectTitleSaving, setIsProjectTitleSaving] = useState(false);
  const [isDeckNoteDialogOpen, setIsDeckNoteDialogOpen] = useState(false);
  const [isSlideNoteDialogOpen, setIsSlideNoteDialogOpen] = useState(false);
  const [isAILayoutPreviewDialogOpen, setIsAILayoutPreviewDialogOpen] = useState(false);
  const [isDeckNoteSaving, setIsDeckNoteSaving] = useState(false);
  const [deckNoteConflict, setDeckNoteConflict] = useState<DeckNoteConflictState | null>(null);
  const [autoDeckInitAttempted, setAutoDeckInitAttempted] = useState(false);
  const [autoDeckInitPending, setAutoDeckInitPending] = useState(false);
  const [autoDeckInitError, setAutoDeckInitError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => window.innerWidth < 1024);
  const [isTabletViewport, setIsTabletViewport] = useState<boolean>(() => window.innerWidth >= 768 && window.innerWidth < 1024);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobileHeaderMenuOpen, setIsMobileHeaderMenuOpen] = useState(false);
  const [mobileSheetTab, setMobileSheetTab] = useState<MobileBottomSheetTab>(() => readStoredMobileSheetTab() ?? "Properties");
  const [isMobileSheetExpanded, setIsMobileSheetExpanded] = useState<boolean>(() => readStoredMobileSheetExpanded(window.innerWidth >= 768 && window.innerWidth < 1024));
  const [mobilePropertiesSection, setMobilePropertiesSection] = useState<MobilePropertiesSection>("canvas");
  const [desktopInspectorTab, setDesktopInspectorTab] = useState<"properties" | "versions" | "audio">("properties");
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isAIDraftModalOpen, setIsAIDraftModalOpen] = useState(false);
  const [isAutoLayoutDialogOpen, setIsAutoLayoutDialogOpen] = useState(false);
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const deckNoteDialogDrag = useDraggableDialog(isDeckNoteDialogOpen);
  const slideNoteDialogDrag = useDraggableDialog(isSlideNoteDialogOpen);
  const aiLayoutPreviewDialogDrag = useDraggableDialog(isAILayoutPreviewDialogOpen);
  const [aiPreviewZoom, setAiPreviewZoom] = useState(1);
  const aiPreviewContainerRef = useRef<HTMLDivElement>(null);
  const [aiPreviewPan, setAiPreviewPan] = useState({ x: 0, y: 0 });
  const aiPreviewPanRef = useRef<{ dragging: boolean; startX: number; startY: number; panX: number; panY: number }>({ dragging: false, startX: 0, startY: 0, panX: 0, panY: 0 });
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
  const [autoLayoutSupplementalMediaClarityPercent, setAutoLayoutSupplementalMediaClarityPercent] = useState(16);
  const [autoLayoutWatermarkSearchQuery, setAutoLayoutWatermarkSearchQuery] = useState("");
  const [debouncedAutoLayoutWatermarkSearchQuery, setDebouncedAutoLayoutWatermarkSearchQuery] = useState("");
  const [autoLayoutWatermarkSelectionCache, setAutoLayoutWatermarkSelectionCache] = useState<LibraryWatermarkOption | null>(null);
  const [autoLayoutProgress, setAutoLayoutProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiRecipeOverrideChoice, setAiRecipeOverrideChoice] = useState<BuiltInPresentationComponentId | "">("");
  // Tracks the slide ID on which the user has manually applied a recipe override via "Rebuild AI Layout".
  // While set, the auto-init effect won't reset the choice (prevents server-data refetch from undoing the rebuild).
  const aiRecipeManuallyAppliedSlideIdRef = useRef<number | null>(null);
  // Tracks which slide ID the current draftContent belongs to.
  // Used by autosave to skip saving if draftContent hasn't been loaded for the current slide yet.
  const draftContentSlideIdRef = useRef<number | null>(null);
  /** True while a slide switch is in progress — blocks autosave until content-loading completes */
  const switchingSlideRef = useRef(false);
  const [timingDurationSecInput, setTimingDurationSecInput] = useState<string>("3");
  const [timingApplyAllPending, setTimingApplyAllPending] = useState(false);
  const [transitionApplyAllPending, setTransitionApplyAllPending] = useState(false);
  const [timingFitProjectAudioPending, setTimingFitProjectAudioPending] = useState(false);
  const [draggingSlideId, setDraggingSlideId] = useState<number | null>(null);
  const [slideDropTargetId, setSlideDropTargetId] = useState<number | null>(null);
  const [canvasApplyAllPending, setCanvasApplyAllPending] = useState(false);
  const [libraryTab, setLibraryTab] = useState<AssetLibraryTab>("slides");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [localUploadKind, setLocalUploadKind] = useState<LibraryMediaKind | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const videoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const mobileHeaderMenuRef = useRef<HTMLDivElement | null>(null);
  const deckNoteDraftRef = useRef(deckNoteDraft);
  const deckLayoutGenPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deckLayoutGenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (deckLayoutGenPollRef.current) {
        clearInterval(deckLayoutGenPollRef.current);
      }
      if (deckLayoutGenTimeoutRef.current) {
        clearTimeout(deckLayoutGenTimeoutRef.current);
      }
    };
  }, []);
  const deckNoteLastSyncedRef = useRef("");
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
    if (draggingSlideId == null) {
      return;
    }
    const stillExists = slides.some((slide) => slide.id === draggingSlideId);
    if (!stillExists) {
      setDraggingSlideId(null);
      setSlideDropTargetId(null);
    }
  }, [slides, draggingSlideId]);

  useEffect(() => {
    if (isProjectTitleEditing) {
      return;
    }
    setProjectTitleDraft(projectTitle);
  }, [projectTitle, isProjectTitleEditing]);

  useEffect(() => {
    deckNoteDraftRef.current = deckNoteDraft;
  }, [deckNoteDraft]);

  useEffect(() => {
    const latestNotes = typeof deck?.notes === "string" ? deck.notes : "";
    const currentDraft = deckNoteDraftRef.current;
    const draftMatchesLastSynced = currentDraft === deckNoteLastSyncedRef.current;
    const draftMatchesLatest = currentDraft === latestNotes;
    deckNoteLastSyncedRef.current = latestNotes;
    if (deckNoteConflict != null || (!draftMatchesLastSynced && !draftMatchesLatest)) {
      return;
    }
    setDeckNoteDraft(latestNotes);
  }, [deck?.id, deck?.version, deck?.notes, deckNoteConflict]);

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

  const autoLayoutWatermarkListQuery = trpc.library.listDocuments.useQuery(
    {
      query: undefined,
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
        && autoLayoutWatermarkEnabled
        && debouncedAutoLayoutWatermarkSearchQuery.length === 0,
      ),
    },
  );

  const autoLayoutWatermarkSearchResultQuery = trpc.library.search.useQuery(
    {
      query: debouncedAutoLayoutWatermarkSearchQuery || undefined,
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
        && autoLayoutWatermarkEnabled
        && debouncedAutoLayoutWatermarkSearchQuery.length > 0,
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
  const deckProjectAudioTrack = (deck as any)?.projectAudioTrack ?? null;
  const selectedSlideAudioItemQuery = trpc.library.getItem.useQuery(
    { id: selectedSlideAudioTrack?.libraryItemId ?? 0 },
    { enabled: Boolean(selectedSlideAudioTrack?.libraryItemId) },
  );
  const deckProjectAudioItemQuery = trpc.library.getItem.useQuery(
    { id: deckProjectAudioTrack?.libraryItemId ?? 0 },
    { enabled: Boolean(deckProjectAudioTrack?.libraryItemId) },
  );
  const draftContent = commandState.content;
  const selectedSlideVisualOnly = draftContent.visualOnly === true;
  const visualOnlySlideCount = useMemo(
    () => slides.filter((slide) => ensureSlideContent(slide.slideContent).visualOnly === true).length,
    [slides],
  );
  const staticExportMotionWarningSlideCount = useMemo(() => {
    let count = 0;
    for (const slide of slides) {
      const content = slide.id === selectedSlideId
        ? draftContent
        : ensureSlideContent(slide.slideContent);
      if (slideContentHasActiveMediaMotion(content)) {
        count += 1;
      }
    }
    return count;
  }, [draftContent, selectedSlideId, slides]);
  const selectedElementIds = commandState.selectedElementIds;
  const selectedElementId = selectedElementIds[0] ?? null;
  const previousMobileSelectedElementIdRef = useRef<string | null | undefined>(undefined);
  const draftSignature = useMemo(
    () => buildDraftSignature(selectedSlide?.id ?? null, draftContent, slideNoteDraft),
    [draftContent, selectedSlide?.id, slideNoteDraft],
  );
  const persistedSlideSignature = useMemo(
    () => (selectedSlide
      ? buildDraftSignature(
          selectedSlide.id,
          ensureSlideContent(selectedSlide.slideContent),
          selectedSlide.notes,
        )
      : null),
    [selectedSlide?.id, selectedSlide?.version, selectedSlide?.slideContent, selectedSlide?.notes],
  );
  const hasUnsavedSelectedSlideChanges = useMemo(() => (
    Boolean(
      draftSignature
      && persistedSlideSignature
      && draftSignature !== persistedSlideSignature,
    )
  ), [draftSignature, persistedSlideSignature]);
  const slideNoteDirty = (selectedSlide?.notes ?? "") !== slideNoteDraft;
  const hasSavedSlideNote = Boolean((selectedSlide?.notes ?? "").trim()) && !slideNoteDirty;
  const slideNoteRepairBusy = repairSlideFromNoteMutation.isPending;
  const slideNoteRepairStatuses = [
    "Analyzing slide note...",
    "Structuring title and content...",
    "Generating image...",
    "Composing slide layout...",
  ] as const;
  const slideNoteRepairStatusLabel = slideNoteRepairStatuses[
    Math.min(slideNoteRepairStatusIndex, slideNoteRepairStatuses.length - 1)
  ] ?? slideNoteRepairStatuses[0];

  useEffect(() => {
    if (!slideNoteRepairBusy) {
      setSlideNoteRepairStatusIndex(0);
      return;
    }

    setSlideNoteRepairStatusIndex(0);
    const intervalId = window.setInterval(() => {
      setSlideNoteRepairStatusIndex((current) => (
        current >= slideNoteRepairStatuses.length - 1 ? current : current + 1
      ));
    }, 1600);

    return () => window.clearInterval(intervalId);
  }, [slideNoteRepairBusy]);
  const deckNoteDirty = (deck?.notes ?? "") !== deckNoteDraft;
  const unsavedCachedSlideIds = (() => {
    const result: number[] = [];
    for (const [slideId, cachedDraft] of slideDraftCacheRef.current.entries()) {
      if (slideId === selectedSlideId) {
        continue;
      }
      const persistedSlide = slides.find((slide) => slide.id === slideId);
      if (!persistedSlide) {
        continue;
      }
      const persistedContent = ensureSlideContent(persistedSlide.slideContent);
      const persistedNotes = persistedSlide.notes ?? null;
      if (
        buildSlideContentSignature(persistedContent) !== buildSlideContentSignature(cachedDraft.content)
        || (persistedNotes ?? "") !== (cachedDraft.notes ?? "")
      ) {
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
  const draftComponents = draftContent.components ?? [];
  const slideAIDesign = draftContent.aiDesign as PresentationSlideAIDesign | undefined;
  const effectiveAILayoutMode = useMemo<PresentationAILayoutMode | null>(
    () => slideAIDesign?.userOverrideMode ?? slideAIDesign?.mode ?? null,
    [slideAIDesign?.mode, slideAIDesign?.userOverrideMode],
  );
  const aiLayoutCandidateModes = useMemo(
    () => [...(slideAIDesign?.candidateModes ?? [])].sort((a, b) => b.score - a.score),
    [slideAIDesign?.candidateModes],
  );
  const aiLayoutCurrentModeCandidate = useMemo(
    () => (
      effectiveAILayoutMode
        ? aiLayoutCandidateModes.find((candidate) => candidate.mode === effectiveAILayoutMode) ?? null
        : null
    ),
    [aiLayoutCandidateModes, effectiveAILayoutMode],
  );
  const aiLayoutSourceTraceSummary = useMemo(
    () => (slideAIDesign?.sourceTrace ?? []).reduce<Record<string, number>>((summary, entry) => {
      summary[entry.disposition] = (summary[entry.disposition] ?? 0) + 1;
      return summary;
    }, {}),
    [slideAIDesign?.sourceTrace],
  );
  const aiLayoutFallbackPreview = useMemo(
    () => [...(slideAIDesign?.fallbackHistory ?? [])].slice(-3).reverse(),
    [slideAIDesign?.fallbackHistory],
  );
  const currentComponentRecipeId = useMemo(() => {
    const firstComponentId = draftComponents[0]?.componentId;
    return isBuiltInPresentationComponentId(firstComponentId) ? firstComponentId : undefined;
  }, [draftComponents]);
  const renderableDraftMedia = useMemo(
    () => getRenderableSlideElements(draftContent).filter((element) => element.type === "image" || element.type === "video"),
    [draftContent],
  );
  const draftHasImage = renderableDraftMedia.some((element) => element.type === "image" && !element.svgContent);
  const draftHasVideo = renderableDraftMedia.some((element) => element.type === "video");
  const renderableDraftElements = useMemo(
    () => getRenderableSlideElements(draftContent),
    [draftContent],
  );
  const selectedElement = useMemo(
    () => renderableDraftElements.find((element) => element.id === selectedElementId) || null,
    [renderableDraftElements, selectedElementId],
  );
  const selectedMediaElement = selectedElement && (selectedElement.type === "image" || selectedElement.type === "video")
    ? selectedElement
    : null;
  const aiRecipePreviewDefinition = useMemo(
    () => (aiRecipeOverrideChoice
      ? getBuiltInPresentationComponentDefinition(aiRecipeOverrideChoice)
      : null),
    [aiRecipeOverrideChoice],
  );
  const parsedAIOverrideSections = useMemo(
    () => parseSlideNarrativeSectionsFromNotes(slideNoteDraft || selectedSlide?.notes),
    [selectedSlide?.notes, slideNoteDraft],
  );
  const aiOverrideBodyLines = useMemo(
    () => selectedSlide ? collectSlideBodyLinesForAIOverride(selectedSlide.title, draftContent) : [],
    [draftContent, selectedSlide],
  );
  const inferredAILayoutRecipeId = useMemo(
    () => inferAIOverrideRecipeId({
      title: selectedSlide?.title ?? "Key Insight",
      body: aiOverrideBodyLines,
      sections: parsedAIOverrideSections,
      hasImage: draftHasImage,
      hasVideo: draftHasVideo,
      slideIndex: selectedSlide?.orderIndex ?? 0,
    }),
    [aiOverrideBodyLines, draftHasImage, draftHasVideo, parsedAIOverrideSections, selectedSlide?.orderIndex, selectedSlide?.title],
  );
  useEffect(() => {
    // Don't override a recipe the user just manually applied via "Rebuild AI Layout" on this slide.
    // The ref is cleared when they navigate to a different slide.
    if (
      selectedSlide?.id != null
      && aiRecipeManuallyAppliedSlideIdRef.current === selectedSlide.id
    ) {
      return;
    }
    const candidates = [
      slideAIDesign?.componentRecipeId,
      currentComponentRecipeId,
      inferredAILayoutRecipeId,
    ];
    const nextChoice = candidates.find((candidate): candidate is BuiltInPresentationComponentId => (
      isBuiltInPresentationComponentId(candidate)
      && recipeSupportsAvailableMedia(candidate, { hasImage: draftHasImage, hasVideo: draftHasVideo })
    ));
    setAiRecipeOverrideChoice(nextChoice ?? inferredAILayoutRecipeId);
  }, [
    currentComponentRecipeId,
    draftHasImage,
    draftHasVideo,
    inferredAILayoutRecipeId,
    selectedSlide?.id,
    slideAIDesign?.componentRecipeId,
  ]);
  useEffect(() => {
    if (Array.isArray(customBlocksQuery.data)) {
      setCustomBlocks(customBlocksQuery.data.map(clonePresentationCustomBlock));
      return;
    }
    if (customBlocksQuery.isError) {
      setCustomBlocks(loadLegacyPresentationCustomBlocks());
    }
  }, [customBlocksQuery.data, customBlocksQuery.isError]);
  useEffect(() => {
    if (!selectedMediaElement || selectedComponentSelectionIds.length > 0) {
      setCropModeElementId(null);
      setCropModeTarget("content");
      return;
    }
    if (cropModeElementId && cropModeElementId !== selectedMediaElement.id) {
      setCropModeElementId(null);
      setCropModeTarget("content");
    }
  }, [cropModeElementId, selectedComponentSelectionIds.length, selectedMediaElement]);
  const selectedComponent = useMemo(
    () => draftComponents.find((component) => component.id === selectedComponentId) || null,
    [draftComponents, selectedComponentId],
  );
  const reusableBuiltInComponent = useMemo(() => {
    const source = selectedComponent ?? draftComponents[0] ?? null;
    if (!source || !isBuiltInPresentationComponentId(source.componentId)) {
      return null;
    }
    return source;
  }, [draftComponents, selectedComponent]);
  const currentAILayoutRecipeId = useMemo(
    () => {
      const aiRecipeId = slideAIDesign?.componentRecipeId;
      if (
        isBuiltInPresentationComponentId(aiRecipeId)
        && recipeSupportsAvailableMedia(aiRecipeId, { hasImage: draftHasImage, hasVideo: draftHasVideo })
      ) {
        return aiRecipeId;
      }
      return currentComponentRecipeId ?? inferredAILayoutRecipeId ?? null;
    },
    [currentComponentRecipeId, draftHasImage, draftHasVideo, inferredAILayoutRecipeId, slideAIDesign?.componentRecipeId],
  );
  const showAILayoutPanel = Boolean(selectedSlide);
  const selectedComponentBounds = useMemo(
    () => selectedComponent ? getComponentBounds(selectedComponent) : null,
    [selectedComponent],
  );
  const selectedComponentDefinition = useMemo(
    () => selectedComponent ? getBuiltInPresentationComponentDefinition(selectedComponent.componentId) : null,
    [selectedComponent],
  );
  const selectedComponentIsGroup = useMemo(
    () => isPresentationGroupComponent(selectedComponent),
    [selectedComponent],
  );
  const selectedComponentCanvasSlots = useMemo(
    () => selectedComponent ? getPresentationComponentCanvasSlotAreas(selectedComponent) : [],
    [selectedComponent],
  );
  const activeCanvasElementIds = useMemo(
    () => {
      const activeIds = new Set(selectedElementIds);
      for (const componentId of selectedComponentSelectionIds) {
        const component = draftComponents.find((entry) => entry.id === componentId);
        if (!component) {
          continue;
        }
        for (const element of component.fallbackElements) {
          activeIds.add(element.id);
        }
      }
      return Array.from(activeIds);
    },
    [draftComponents, selectedComponentSelectionIds, selectedElementIds],
  );
  const hasMultiComponentSelection = selectedComponentSelectionIds.length > 1;
  const hasMixedRenderableSelection = selectedElementIds.length > 0 && selectedComponentSelectionIds.length > 0;
  const totalRenderableSelectionCount = selectedElementIds.length + selectedComponentSelectionIds.length;
  const selectedElements = useMemo(
    () => renderableDraftElements.filter((element) => selectedElementIds.includes(element.id)),
    [renderableDraftElements, selectedElementIds],
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
    () => normalizeWatermarkLibraryOptions(
      debouncedAutoLayoutWatermarkSearchQuery.length > 0
        ? autoLayoutWatermarkSearchResultQuery.data?.results
        : autoLayoutWatermarkListQuery.data?.results,
    ),
    [
      autoLayoutWatermarkListQuery.data?.results,
      autoLayoutWatermarkSearchResultQuery.data?.results,
      debouncedAutoLayoutWatermarkSearchQuery,
    ],
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
  useEffect(() => {
    if (!selectedComponentId) {
      if (selectedComponentSlotId) {
        setSelectedComponentSlotId(null);
      }
      return;
    }
    if (draftComponents.some((component) => component.id === selectedComponentId)) {
      return;
    }
    setSelectedComponentSelectionIds([]);
    setSelectedComponentId(null);
    setSelectedComponentSlotId(null);
  }, [draftComponents, selectedComponentId, selectedComponentSlotId]);
  useEffect(() => {
    if (!selectedComponentSelectionIds.length) {
      return;
    }
    const availableIds = new Set(draftComponents.map((component) => component.id));
    const nextSelectedIds = selectedComponentSelectionIds.filter((componentId) => availableIds.has(componentId));
    if (nextSelectedIds.length === selectedComponentSelectionIds.length) {
      return;
    }
    setComponentSelection(nextSelectedIds);
  }, [draftComponents, selectedComponentSelectionIds]);
  useEffect(() => {
    if (!selectedComponent || !selectedComponentSlotId) {
      return;
    }
    if (selectedComponent.slotBindings.some((slot) => slot.slotId === selectedComponentSlotId)) {
      return;
    }
    setSelectedComponentSlotId(null);
  }, [selectedComponent, selectedComponentSlotId]);
  useEffect(() => {
    if (!isMobileViewport) {
      previousMobileSelectedElementIdRef.current = selectedElementId;
      return;
    }
    const previousSelectedElementId = previousMobileSelectedElementIdRef.current;
    if (previousSelectedElementId === undefined) {
      previousMobileSelectedElementIdRef.current = selectedElementId;
      return;
    }
    if (selectedElementId && selectedElementId !== previousSelectedElementId) {
      setMobilePropertiesSection("element");
    } else if (!selectedElementId && previousSelectedElementId && mobilePropertiesSection === "element") {
      setMobilePropertiesSection("slide");
    }
    previousMobileSelectedElementIdRef.current = selectedElementId;
  }, [isMobileViewport, mobilePropertiesSection, selectedElementId]);
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
  const aiOverridePreviewNarrative = useMemo(() => {
    if (!selectedSlide || !aiRecipeOverrideChoice) {
      return null;
    }
    const persistedNarrative = slideAIDesign?.narrative;
    const fallbackBody = aiOverrideBodyLines.length > 0
      ? aiOverrideBodyLines
      : parsedAIOverrideSections.flatMap((section) => section.details).slice(0, 8);
    return adaptAIOverrideNarrativeForRecipe(aiRecipeOverrideChoice, {
      title: persistedNarrative?.title || selectedSlide.title,
      body: persistedNarrative?.body?.length ? [...persistedNarrative.body] : (fallbackBody.length > 0 ? fallbackBody : [selectedSlide.title]),
      notes: persistedNarrative?.notes ?? (slideNoteDraft.trim() || undefined),
      sections: persistedNarrative?.sections?.length ? persistedNarrative.sections : parsedAIOverrideSections,
      graphicCategory: persistedNarrative?.graphicCategory,
    });
  }, [
    aiOverrideBodyLines,
    aiRecipeOverrideChoice,
    parsedAIOverrideSections,
    selectedSlide,
    slideAIDesign?.narrative,
    slideNoteDraft,
  ]);
  const aiRecipePreviewElements = useMemo(() => {
    if (!aiRecipeOverrideChoice) {
      return null;
    }

    if (
      reusableBuiltInComponent
      && reusableBuiltInComponent.componentId === aiRecipeOverrideChoice
      && selectedComponentId === reusableBuiltInComponent.id
    ) {
      return reusableBuiltInComponent.fallbackElements;
    }

    if (aiOverridePreviewNarrative) {
      return buildBuiltInPresentationComponentInstanceFromNarrative(aiRecipeOverrideChoice, {
        canvas: activeCanvasSize,
        instanceId: `preview-${aiRecipeOverrideChoice}`,
        narrative: {
          title: aiOverridePreviewNarrative.title,
          body: [...aiOverridePreviewNarrative.body],
          notes: aiOverridePreviewNarrative.notes,
          sections: aiOverridePreviewNarrative.sections,
          graphicCategory: aiOverridePreviewNarrative.graphicCategory,
          mediaUrl: inferAIOverrideMediaUrl(draftContent, aiRecipeOverrideChoice),
        },
      }).fallbackElements;
    }

    return buildBuiltInPresentationComponentInstance(aiRecipeOverrideChoice, {
      canvas: activeCanvasSize,
      instanceId: `preview-${aiRecipeOverrideChoice}`,
    }).fallbackElements;
  }, [
    activeCanvasSize,
    aiOverridePreviewNarrative,
    aiRecipeOverrideChoice,
    draftContent,
    reusableBuiltInComponent,
    selectedComponentId,
  ]);
  const aiRecipePreviewSource = useMemo((): PresentationCustomBlockPreviewSource | null => {
    if (!aiRecipePreviewElements) return null;
    const previewBackground = inferAIOverrideBackground(draftContent, activeCanvasSize);
    const previewOverlays = getOverlayLayerElements(draftContent, activeCanvasSize, previewBackground);
    const truncateText = <T extends PresentationElement>(el: T): T =>
      el.type === "text" ? { ...el, text: el.text.slice(0, 120) } : el;
    return {
      canvas: activeCanvasSize,
      fallbackElements: [...previewOverlays, ...aiRecipePreviewElements].map(truncateText),
      background: previewBackground,
    };
  }, [activeCanvasSize, aiRecipePreviewElements, draftContent]);
  const aiRecipeCanonicalPreviewQuery = trpc.presentation.renderCustomBlockPreview.useQuery(
    aiRecipePreviewSource
      ? { previewSource: aiRecipePreviewSource }
      : undefined,
    {
      enabled: Boolean(aiRecipePreviewSource),
      staleTime: 30_000,
    },
  );
  const aiLayoutPanelPreviewWidth = activeCanvasSize.height > activeCanvasSize.width ? 220 : 272;
  const aiLayoutDialogPreviewWidth = activeCanvasSize.height > activeCanvasSize.width ? 560 : 820;

  function renderAILayoutPreview(size: "panel" | "dialog") {
    if (!aiRecipePreviewDefinition) {
      return null;
    }

    const previewTestId = size === "dialog" ? "ai-layout-preview-dialog" : "ai-layout-preview";
    const previewWidth = size === "dialog" ? aiLayoutDialogPreviewWidth : aiLayoutPanelPreviewWidth;
    const previewClassName = size === "dialog"
      ? "rounded-md border border-slate-200 bg-white p-2"
      : "mt-2";

    if (aiRecipeCanonicalPreviewQuery.data?.svg) {
      return (
        <div style={{ maxWidth: previewWidth, width: "100%" }}>
          <ResponsiveSvgPreview
            svg={aiRecipeCanonicalPreviewQuery.data.svg}
            className={previewClassName}
            testId={previewTestId}
          />
        </div>
      );
    }

    if (aiRecipePreviewElements) {
      const fallbackBackground = inferAIOverrideBackground(draftContent, activeCanvasSize);
      const fallbackOverlays = getOverlayLayerElements(draftContent, activeCanvasSize, fallbackBackground);
      return (
        <SlideElementPreview
          elements={[...fallbackOverlays, ...aiRecipePreviewElements]}
          canvasSize={activeCanvasSize}
          background={fallbackBackground}
          targetWidth={previewWidth}
          testId={previewTestId}
          className={previewClassName}
        />
      );
    }

    return (
      <div style={{ maxWidth: previewWidth, width: "100%" }}>
        <ResponsiveSvgPreview
          svg={aiRecipePreviewDefinition.previewSvg}
          className={previewClassName}
          testId={previewTestId}
        />
      </div>
    );
  }
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
    const activeNotes = selectedSlideId === selectedSavedVersionSlide.id
      ? slideNoteDraft
      : selectedSavedVersionSlide.notes;
    return {
      title: selectedSavedVersionSlide.title,
      notes: activeNotes,
      content: activeContent,
    };
  }, [draftContent, selectedSavedVersionSlide, selectedSlideId, slideNoteDraft]);
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
      const cachedDraft = getCachedSlideDraft(slide.id);
      const content = selectedSlideId === slide.id
        ? draftContent
        : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
      return {
        slideId: slide.id,
        title: slide.title,
        orderIndex: slide.orderIndex,
        content,
        durationMs: resolveSlideDurationMs(content),
      };
    });
  }, [draftContent, selectedSlideId, slides]);
  // Keep a stable ref so the auto-advance timer isn't reset by memo recomputation.
  const playbackSlidesRef = useRef(playbackSlides);
  playbackSlidesRef.current = playbackSlides;
  const activeViewport = isMobileViewport
    ? mobileGestures.state.viewport
    : desktopViewport;
  const deckVersionRef = useRef<number | null>(null);
  const [deckMutationBusy, setDeckMutationBusy] = useState(false);
  const componentClipboardRef = useRef<PresentationComponentInstance | null>(null);

  function syncCommandState(next: CanvasCommandState) {
    setCommandState(next);
    setSaveState("idle");
  }

  function executeCommand(command: Parameters<CommandBus<CanvasCommandState>["execute"]>[0]) {
    syncCommandState(commandBusRef.current.execute(command));
  }

  /** Apply selection-only changes without creating undo entries. */
  function applySelectionOnly(command: Parameters<CommandBus<CanvasCommandState>["applyWithoutUndo"]>[0]) {
    syncCommandState(commandBusRef.current.applyWithoutUndo(command));
  }

  function cacheSlideDraft(
    slideId: number | null,
    content: PresentationSlideContent,
    notes: string | null,
  ) {
    if (!slideId) return;
    slideDraftCacheRef.current.set(slideId, {
      content: ensureSlideContent(content),
      notes: notes?.trim() ? notes : null,
    });
  }

  function clearCachedSlideDraft(slideId: number | null) {
    if (!slideId) return;
    slideDraftCacheRef.current.delete(slideId);
  }

  function getCachedSlideDraft(slideId: number | null): SlideDraftState | null {
    if (!slideId) {
      return null;
    }
    return slideDraftCacheRef.current.get(slideId) ?? null;
  }

  function switchToSlide(nextSlideId: number) {
    if (selectedSlideId === nextSlideId) {
      return;
    }
    // Block autosave during the transition period — draftContent still belongs
    // to the previous slide until the content-loading effect completes.
    switchingSlideRef.current = true;
    // Clear any pending autosave BEFORE switching — prevents race condition where
    // the old slide's draftContent could be saved under the new slide's ID.
    autosaveController.clear();
    cacheSlideDraft(selectedSlideId, draftContent, slideNoteDraft);
    // Clear ALL slide-specific refs when navigating away so the new slide initializes correctly.
    aiRecipeManuallyAppliedSlideIdRef.current = null;
    pendingAutoLayoutUndoRef.current = null;
    restoredAutoLayoutHistoryRef.current = null;
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
      setIsTabletViewport(window.innerWidth >= 768 && window.innerWidth < 1024);
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMobileHeaderMenuOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(MOBILE_SHEET_TAB_STORAGE_KEY, mobileSheetTab);
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [mobileSheetTab]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(MOBILE_SHEET_EXPANDED_STORAGE_KEY, String(isMobileSheetExpanded));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [isMobileSheetExpanded]);

  useEffect(() => {
    if (isTabletViewport) {
      setIsMobileSheetExpanded(true);
    }
  }, [isTabletViewport]);

  useEffect(() => {
    if (!isMobileHeaderMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!mobileHeaderMenuRef.current) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && !mobileHeaderMenuRef.current.contains(target)) {
        setIsMobileHeaderMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isMobileHeaderMenuOpen]);

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
    for (const [slideId, cachedDraft] of slideDraftCacheRef.current.entries()) {
      const persistedSlide = slidesById.get(slideId);
      if (!persistedSlide) {
        slideDraftCacheRef.current.delete(slideId);
        continue;
      }
      const persistedContent = ensureSlideContent(persistedSlide.slideContent);
      const mergedContent = mergeResolvedPendingMediaIntoCachedDraft(cachedDraft.content, persistedContent);
      if (buildSlideContentSignature(mergedContent) !== buildSlideContentSignature(cachedDraft.content)) {
        slideDraftCacheRef.current.set(slideId, {
          ...cachedDraft,
          content: mergedContent,
        });
      }
      if (
        buildSlideContentSignature(persistedContent) === buildSlideContentSignature(mergedContent)
        && (persistedSlide.notes ?? "") === (cachedDraft.notes ?? "")
      ) {
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
      clearComponentSelection();
      setSlideNoteDraft("");
      setSaveState("idle");
      setExpectedSlideVersion(null);
      setConflictPolicy(releaseStaleBlock());
      return;
    }

    const cachedDraft = getCachedSlideDraft(selectedSlide.id);
    const next = cachedDraft
      ? ensureSlideContent(cachedDraft.content)
      : ensureSlideContent(selectedSlide.slideContent);
    const nextSelected = next.elements[0]?.id ? [next.elements[0].id] : [];
    const nextState = createCanvasCommandState(next, nextSelected);
    selectSingleComponent(nextSelected.length === 0 ? (next.components?.[0]?.id ?? null) : null);

    const restoredAutoLayoutHistory = restoredAutoLayoutHistoryRef.current;
    if (
      restoredAutoLayoutHistory
      && restoredAutoLayoutHistory.slideId === selectedSlide.id
      && (
        restoredAutoLayoutHistory.slideVersion === null
        || restoredAutoLayoutHistory.slideVersion === selectedSlide.version
      )
    ) {
      restoredAutoLayoutHistoryRef.current = null;
      setCommandState(commandBusRef.current.getState());
      setSaveState("idle");
      setExpectedSlideVersion(selectedSlide.version);
      setSlideNoteDraft(cachedDraft?.notes ?? selectedSlide.notes ?? "");
      return;
    }

    // If auto layout just ran, restore undo history so the user can Ctrl+Z back to pre-layout state.
    const pendingUndo = pendingAutoLayoutUndoRef.current;
    if (pendingUndo) {
      pendingAutoLayoutUndoRef.current = null;
      commandBusRef.current.reset(pendingUndo.preLayoutState);
      const restored = commandBusRef.current.execute({
        id: "restore-post-auto-layout",
        apply: () => pendingUndo.postLayoutState,
      });
      setCommandState(restored);
    } else if (aiRecipeManuallyAppliedSlideIdRef.current === selectedSlide.id) {
      // User manually applied a recipe override on this slide — don't reset content
      // from server on subsequent version changes (e.g., autosave bumping the version).
      // The current draftContent already has the rebuilt layout.
    } else {
      commandBusRef.current.reset(nextState);
      setCommandState(nextState);
    }
    setSaveState("idle");
    setExpectedSlideVersion(selectedSlide.version);
    setSlideNoteDraft(cachedDraft?.notes ?? selectedSlide.notes ?? "");
    // NOTE: do NOT set draftContentSlideIdRef or switchingSlideRef here!
    // setCommandState is batched — draftContent won't update until the NEXT render.
    // Setting refs here creates a window where refs say "slide 2" but draftContent
    // is still slide 1's content, causing autosave to save the wrong content.
    // These refs are updated in a separate effect below that depends on commandState.
  }, [selectedSlide?.id, selectedSlide?.version, selectedSlide?.notes]);

  // Mark draftContent ownership ONLY after commandState has actually propagated.
  // This effect runs on the render AFTER setCommandState() takes effect,
  // ensuring draftContent and draftContentSlideIdRef are always in sync.
  // Without this separation, autosave could save slide A's content to slide B.
  useEffect(() => {
    if (selectedSlide && commandState) {
      draftContentSlideIdRef.current = selectedSlide.id;
      switchingSlideRef.current = false;
    }
  }, [commandState, selectedSlide?.id]);

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

  async function readLatestDeckDetail(): Promise<any | null> {
    if (typeof deckQuery.refetch !== "function") {
      return deckData ?? null;
    }
    const result = await deckQuery.refetch();
    return ((result.data as any) ?? deckData ?? null);
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
        slideContent: {
          elements: [],
          canvas: activeCanvasSize,
        },
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

  async function handleReorderSlideToIndex(movedSlideId: number, targetIndex: number) {
    if (!deck) {
      return;
    }
    await runDeckMutation(async (expectedVersion) => {
      await reorderSlidesMutation.mutateAsync({
        deckId: deck.id,
        movedSlideId,
        targetIndex,
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

    await handleReorderSlideToIndex(selectedSlide.id, targetIndex);
  }

  function resetSlideDragState() {
    setDraggingSlideId(null);
    setSlideDropTargetId(null);
  }

  function handleSlideDragStart(slideId: number, event: DragEvent<HTMLButtonElement>) {
    if (deckMutationBusy) {
      event.preventDefault();
      return;
    }
    setDraggingSlideId(slideId);
    setSlideDropTargetId(slideId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(slideId));
  }

  function handleSlideDragOver(targetSlideId: number, event: DragEvent<HTMLButtonElement>) {
    if (draggingSlideId == null || draggingSlideId === targetSlideId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (slideDropTargetId !== targetSlideId) {
      setSlideDropTargetId(targetSlideId);
    }
  }

  function handleSlideDragEnd() {
    resetSlideDragState();
  }

  async function handleSlideDrop(targetSlideId: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const movedSlideIdFromEvent = Number(event.dataTransfer.getData("text/plain"));
    const movedSlideId = draggingSlideId ?? movedSlideIdFromEvent;
    resetSlideDragState();

    if (!Number.isFinite(movedSlideId) || movedSlideId <= 0 || movedSlideId === targetSlideId) {
      return;
    }

    const targetIndex = slides.findIndex((slide) => slide.id === targetSlideId);
    if (targetIndex < 0) {
      return;
    }

    await handleReorderSlideToIndex(movedSlideId, targetIndex);
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
    if (isMobileViewport) {
      if (isMobilePanMode) {
        mobileGestures.setMode("edit_mode");
      }
    } else if (!isTouchActionAllowed(40)) {
      return;
    }

    if (type === "image") {
      imageUploadInputRef.current?.click();
      return;
    }
    if (type === "video") {
      videoUploadInputRef.current?.click();
      return;
    }

    const element = createElement(type, nextElementId(type));
    if (type === "text" && draftContent.visualOnly === true) {
      executeCommand({
        id: "add-text-exit-visual-only",
        apply: (state) => ({
          ...state,
          content: insertElement(
            {
              ...state.content,
              visualOnly: undefined,
            },
            element,
          ),
          selectedElementIds: [element.id],
          snapGuides: [],
        }),
      });
      toast.info("Visual-only mode was turned off for this slide because you added text.");
    } else {
      executeCommand(addElementCommand(element));
    }
    focusMobileProperties("element");
  }

  async function handleLocalMediaUpload(kind: LibraryMediaKind, file: File) {
    if (!deck || !selectedSlide) {
      toast.error("No active slide selected.");
      return;
    }

    setLocalUploadKind(kind);
    try {
      const fileBase64 = await readFileAsDataUrl(file);
      const uploaded = await runDeckMutation(async (expectedVersion) => (
        uploadAndAttachAssetMutation.mutateAsync({
          deckId: deck.id,
          expectedVersion,
          slideId: selectedSlide.id,
          fileName: file.name,
          fileType: file.type || (kind === "image" ? "image/*" : "video/*"),
          fileBase64,
        })
      ));

      if (!uploaded) {
        return;
      }

      const item = (uploaded as any)?.item;
      if (item?.sourceUrl) {
        insertLibraryAsset({
          id: Number(item.id) || Date.now(),
          kind,
          title: String(item.title || file.name || (kind === "image" ? "Uploaded image" : "Uploaded video")),
          sourceUrl: normalizeMediaSourceUrl(String(item.sourceUrl)),
          thumbnailUrl: normalizeMediaSourceUrl(
            item.thumbnailUrl
            || (kind === "image" ? item.sourceUrl : null),
          ) || null,
          sourceType: "library",
        });
      }

      const creditsCharged = Number((uploaded as any)?.billing?.creditsCharged ?? 0);
      if (creditsCharged > 0) {
        toast.success(`Upload complete. Charged ${creditsCharged} credits.`);
      } else {
        toast.success("Upload complete.");
      }

      setLibraryTab("slides");
      await trpcUtils.library.listDocuments.invalidate();
    } catch (error) {
      const message = String((error as Error)?.message || error);
      if (message.toLowerCase().includes("insufficient credits")) {
        toast.error(message);
      } else {
        toast.error(`Upload failed: ${message}`);
      }
    } finally {
      setLocalUploadKind(null);
    }
  }

  function handleLocalUploadInputChange(kind: LibraryMediaKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    void handleLocalMediaUpload(kind, file);
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
          src: normalizeMediaSourceUrl(asset.sourceUrl),
          poster: normalizeMediaSourceUrl(asset.thumbnailUrl),
          title: asset.title,
          x: nextX,
          y: nextY,
        }
        : {
          ...created,
          src: normalizeMediaSourceUrl(asset.sourceUrl),
          alt: asset.title,
          x: nextX,
          y: nextY,
        };
    executeCommand(addElementCommand(nextElement));
    focusMobileProperties("element");
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
    focusMobileProperties("element");
  }

  function handleInsertBlockPreset(presetId: PresentationBlockPresetId) {
    const elements = buildPresentationBlockPreset(presetId, {
      canvas: activeCanvasSize,
      makeId: nextElementId,
    });
    executeCommand(addElementsCommand(elements));
    clearComponentSelection();
    setLibraryTab("slides");
    focusMobileProperties("element");
  }

  function handleInsertBuiltInComponent(componentId: BuiltInPresentationComponentId) {
    const nextInstance = buildBuiltInPresentationComponentInstance(componentId, {
      canvas: activeCanvasSize,
      instanceId: nextComponentId(componentId),
    });
    const definition = getBuiltInPresentationComponentDefinition(componentId);
    const fittedInstance = definition?.category === "Document"
      ? fitComponentFallbackElementsToCanvas(
        {
          elements: [],
          canvas: activeCanvasSize,
          components: [nextInstance],
        },
        nextInstance.id,
        "canvas",
      ).components?.[0] ?? nextInstance
      : nextInstance;

    executeCommand(addComponentCommand(fittedInstance));
    selectSingleComponent(fittedInstance.id);
    setLibraryTab("slides");
    focusMobileProperties("element");
  }

  function upsertCustomBlockInState(nextBlock: PresentationCustomBlockDefinition) {
    setCustomBlocks((current) => ([
      clonePresentationCustomBlock(nextBlock),
      ...current.filter((block) => block.id !== nextBlock.id),
    ].slice(0, 128)));
  }

  async function handleInsertCustomBlock(blockId: string) {
    const block = customBlocks.find((entry) => entry.id === blockId);
    if (!block) {
      toast.error("Saved block not found.");
      return;
    }

    const nextInstance = buildBuiltInPresentationComponentInstanceFromSlotBindings(block.componentId, {
      canvas: activeCanvasSize,
      instanceId: nextComponentId(block.componentId),
      slotBindings: block.slotBindings,
    });
    const definition = getBuiltInPresentationComponentDefinition(block.componentId);
    const fittedInstance = definition?.category === "Document"
      ? fitComponentFallbackElementsToCanvas(
        {
          elements: [],
          canvas: activeCanvasSize,
          components: [nextInstance],
        },
        nextInstance.id,
        "canvas",
      ).components?.[0] ?? nextInstance
      : nextInstance;
    executeCommand(addComponentCommand(fittedInstance));
    selectSingleComponent(fittedInstance.id);
    setLibraryTab("slides");
    focusMobileProperties("element");
    try {
      const trackedBlock = await trackCustomBlockUseMutation.mutateAsync({ blockId });
      upsertCustomBlockInState(trackedBlock);
      await trpcUtils.presentation.listCustomBlocks.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to track custom block usage.");
    }
  }

  async function handleDeleteCustomBlock(blockId: string) {
    try {
      await deleteCustomBlockMutation.mutateAsync({ blockId });
      setCustomBlocks((current) => current.filter((block) => block.id !== blockId));
      await trpcUtils.presentation.listCustomBlocks.invalidate();
      toast.success("Custom block deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete custom block.");
    }
  }

  async function handleToggleFavoriteCustomBlock(blockId: string, nextFavorite: boolean) {
    try {
      const updatedBlock = await updateCustomBlockMutation.mutateAsync({
        blockId,
        favorite: nextFavorite,
      });
      upsertCustomBlockInState(updatedBlock);
      await trpcUtils.presentation.listCustomBlocks.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update block favorite state.");
    }
  }

  async function handleTogglePinCustomBlock(blockId: string, nextPinned: boolean) {
    try {
      const updatedBlock = await updateCustomBlockMutation.mutateAsync({
        blockId,
        isPinned: nextPinned,
      });
      upsertCustomBlockInState(updatedBlock);
      await trpcUtils.presentation.listCustomBlocks.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update block pin state.");
    }
  }

  async function handleToggleTeamFeaturedCustomBlock(blockId: string, nextFeatured: boolean) {
    try {
      const updatedBlock = await updateCustomBlockMutation.mutateAsync({
        blockId,
        isTeamFeatured: nextFeatured,
      });
      upsertCustomBlockInState(updatedBlock);
      await trpcUtils.presentation.listCustomBlocks.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update team featured state.");
    }
  }

  async function handleTransferCustomBlockOwner(blockId: string, nextOwnerUserId: number) {
    try {
      const updatedBlock = await updateCustomBlockMutation.mutateAsync({
        blockId,
        transferToUserId: nextOwnerUserId,
      });
      upsertCustomBlockInState(updatedBlock);
      await trpcUtils.presentation.listCustomBlocks.invalidate();
      toast.success(`Transferred block ownership to user ${nextOwnerUserId}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to transfer block ownership.");
    }
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

  function handleMobileViewportChange(nextViewport: { scale: number; offsetX: number; offsetY: number }) {
    mobileGestures.setViewport(nextViewport);
  }

  function handleResetMobileViewport() {
    mobileGestures.setViewport({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  }

  function handleFitMobileViewport() {
    mobileGestures.setViewport({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  }

  function handleCenterMobileViewport() {
    const scale = mobileGestures.state.viewport.scale;
    if (scale <= 1) {
      return;
    }
    mobileGestures.setViewport({
      scale,
      offsetX: 0,
      offsetY: 0,
    });
  }

  function focusMobileInspector(tab: MobileBottomSheetTab = "Properties") {
    if (!isMobileViewport) {
      return;
    }
    setMobileSheetTab(tab);
    setIsMobileSheetExpanded(true);
  }

  function focusMobileProperties(section: MobilePropertiesSection) {
    if (!isMobileViewport) {
      return;
    }
    setMobilePropertiesSection(section);
    setMobileSheetTab("Properties");
    setIsMobileSheetExpanded(true);
  }

  function setComponentSelection(
    componentIds: string[],
    options?: { activeComponentId?: string | null },
  ) {
    const normalized = Array.from(new Set(componentIds));
    const activeComponentId = options?.activeComponentId === undefined
      ? (normalized.length === 1 ? normalized[0] ?? null : null)
      : options.activeComponentId;
    setSelectedComponentSelectionIds(normalized);
    setSelectedComponentId(activeComponentId && normalized.includes(activeComponentId) ? activeComponentId : null);
    if (!activeComponentId || normalized.length !== 1) {
      setSelectedComponentSlotId(null);
    }
  }

  function clearComponentSelection() {
    setComponentSelection([], { activeComponentId: null });
  }

  function selectSingleComponent(componentId: string | null) {
    setComponentSelection(componentId ? [componentId] : [], { activeComponentId: componentId });
  }

  function findParentComponentIdForElement(elementId: string): string | null {
    for (const component of draftComponents) {
      if (component.fallbackElements.some((element) => element.id === elementId)) {
        return component.id;
      }
    }
    return null;
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
        const cachedDraft = getCachedSlideDraft(slide.id);
        const baseContent = slide.id === selectedSlide?.id
          ? draftContent
          : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
        await updateSlideMutation.mutateAsync({
          deckId: deck.id,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "manual",
          title: slide.title,
          notes: slide.id === selectedSlide?.id
            ? (slideNoteDraft.trim() ? slideNoteDraft : null)
            : cachedDraft?.notes ?? slide.notes ?? null,
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

  function applyComponentContentUpdate(nextContent: PresentationSlideContent, nextComponentId: string | null) {
    // Use executeCommand (not syncCommandState) so the CommandBus internal state
    // is updated. Without this, the next executeCommand (e.g., element selection)
    // would read stale content from the CommandBus and reset the layout.
    executeCommand({
      id: "apply-component-content",
      apply: (state) => ({
        ...state,
        content: nextContent,
        selectedElementIds: [],
        snapGuides: [],
      }),
    });
    setCropModeElementId(null);
    setCropModeTarget("content");
    selectSingleComponent(nextComponentId);
    focusMobileProperties("element");
  }

  function handleSelectComponent(componentId: string, options?: { additive?: boolean }) {
    setCropModeElementId(null);
    setCropModeTarget("content");
    if (options?.additive) {
      const toggled = SelectionEngine.toggle(
        {
          selectedIds: selectedComponentSelectionIds,
          activeId: selectedComponentId,
        },
        componentId,
      );
      setComponentSelection(toggled.selectedIds, {
        activeComponentId: selectedElementIds.length === 0 && toggled.selectedIds.length === 1
          ? toggled.selectedIds[0] ?? null
          : null,
      });
      focusMobileProperties("element");
      return;
    }

    applyComponentContentUpdate(draftContent, componentId);
  }

  function handleSelectComponentSlot(componentId: string, slotId: string) {
    selectSingleComponent(componentId);
    setSelectedComponentSlotId(slotId);
    syncCommandState({
      ...commandState,
      content: draftContent,
      selectedElementIds: [],
      snapGuides: [],
    });
    focusMobileProperties("element");
  }

  function rebuildAndSaveComponent(
    component: PresentationComponentInstance,
    slotBindings: PresentationComponentInstance["slotBindings"],
  ) {
    const rebuilt = rebuildBuiltInPresentationComponentInstance({
      ...component,
      slotBindings,
    }, activeCanvasSize);
    executeCommand(updateComponentCommand(component.id, rebuilt));
    selectSingleComponent(component.id);
    focusMobileProperties("element");
  }

  function handleUpdateComponentTextSlot(componentId: string, slotId: string, text: string) {
    const component = draftComponents.find((item) => item.id === componentId);
    if (!component) {
      return;
    }

    const nextBindings = component.slotBindings.map((slot) => (
      slot.slotId === slotId && slot.type === "text"
        ? { ...slot, text }
        : slot
    ));
    rebuildAndSaveComponent(component, nextBindings);
  }

  function handleUpdateComponentImageSlot(componentId: string, slotId: string, src: string, alt: string) {
    const component = draftComponents.find((item) => item.id === componentId);
    if (!component) {
      return;
    }

    const nextBindings = [
      ...component.slotBindings.filter((slot) => !(slot.slotId === slotId && (slot.type === "image" || slot.type === "video"))),
      { slotId, type: "image" as const, src, alt },
    ];
    rebuildAndSaveComponent(component, nextBindings);
  }

  function handleUpdateComponentVideoSlot(
    componentId: string,
    slotId: string,
    src: string,
    poster: string,
    title: string,
  ) {
    const component = draftComponents.find((item) => item.id === componentId);
    if (!component) {
      return;
    }

    const nextBindings = [
      ...component.slotBindings.filter((slot) => !(slot.slotId === slotId && (slot.type === "image" || slot.type === "video"))),
      { slotId, type: "video" as const, src, poster: poster || undefined, title: title || undefined },
    ];
    rebuildAndSaveComponent(component, nextBindings);
  }

  function handleUpdateComponentListSlot(componentId: string, slotId: string, items: string[]) {
    const component = draftComponents.find((item) => item.id === componentId);
    if (!component) {
      return;
    }

    const nextBindings = component.slotBindings.map((slot) => (
      slot.slotId === slotId && slot.type === "list"
        ? { ...slot, items }
        : slot
    ));
    rebuildAndSaveComponent(component, nextBindings);
  }

  function updateSelectedSlideAIDesign(
    updater: (current: PresentationSlideAIDesign) => PresentationSlideAIDesign,
  ) {
    const baseAIDesign: PresentationSlideAIDesign = slideAIDesign
      ? {
        ...slideAIDesign,
        candidateModes: slideAIDesign.candidateModes?.map((candidate) => ({ ...candidate })),
        candidateRecipes: slideAIDesign.candidateRecipes?.map((candidate) => ({ ...candidate })),
        narrative: slideAIDesign.narrative
          ? {
            ...slideAIDesign.narrative,
            body: [...slideAIDesign.narrative.body],
            sections: slideAIDesign.narrative.sections?.map((section) => ({
              heading: section.heading,
              details: [...section.details],
            })),
            mediaPlan: slideAIDesign.narrative.mediaPlan?.map((plan) => ({ ...plan })),
          }
          : undefined,
        overrideHistory: slideAIDesign.overrideHistory?.map((entry) => ({ ...entry })),
        sourceTrace: slideAIDesign.sourceTrace?.map((entry) => ({ ...entry })),
        fallbackHistory: slideAIDesign.fallbackHistory?.map((entry) => ({ ...entry })),
        mediaModeMetadata: slideAIDesign.mediaModeMetadata
          ? { ...slideAIDesign.mediaModeMetadata }
          : undefined,
      }
      : {
        source: "draft-with-ai",
        schemaVersion: "presentation_ai_layout_v1",
        selectionMode: "none",
        generatedAt: new Date().toISOString(),
      };

    const nextAIDesign = updater({
      ...baseAIDesign,
      schemaVersion: "presentation_ai_layout_v1",
    });
    syncCommandState({
      ...commandState,
      content: {
        ...draftContent,
        aiDesign: nextAIDesign,
      },
    });
  }

  function handleSetAILayoutModeOverride(nextMode: PresentationAILayoutMode | null) {
    if (!selectedSlide || !deck) {
      return;
    }
    const previousMode = slideAIDesign?.userOverrideMode ?? null;
    updateSelectedSlideAIDesign((current) => ({
      ...current,
      userOverrideMode: nextMode,
      ...(nextMode && !current.modeLocked ? { mode: nextMode } : {}),
      ...(nextMode === null && !current.modeLocked ? { mode: current.mode } : {}),
    }));
    trackAIModeOverrideSet({
      deckId: deck.id,
      slideId: selectedSlide.id,
      previousMode,
      nextMode,
      source: "editor",
    });
  }

  function handleToggleAILayoutModeLock(locked: boolean) {
    if (!selectedSlide || !deck) {
      return;
    }
    const mode = effectiveAILayoutMode;
    updateSelectedSlideAIDesign((current) => ({
      ...current,
      modeLocked: locked,
      ...(locked && mode && !current.userOverrideMode ? { userOverrideMode: mode } : {}),
    }));
    trackAIModeLockToggled({
      deckId: deck.id,
      slideId: selectedSlide.id,
      mode,
      locked,
      source: "editor",
    });
  }

  function handleApplyAIRecipeOverride(recipeId: BuiltInPresentationComponentId) {
    setAiPreviewZoom(1);
    setAiPreviewPan({ x: 0, y: 0 });
    if (!selectedSlide) {
      return;
    }

    const baseNarrative = aiOverridePreviewNarrative
      ? {
        ...aiOverridePreviewNarrative,
        body: [...aiOverridePreviewNarrative.body],
        sections: aiOverridePreviewNarrative.sections?.map((section) => ({
          heading: section.heading,
          details: [...section.details],
        })),
      }
      : adaptAIOverrideNarrativeForRecipe(recipeId, {
        title: selectedSlide.title,
        body: aiOverrideBodyLines.length > 0 ? aiOverrideBodyLines : [selectedSlide.title],
        notes: slideNoteDraft.trim() || undefined,
        sections: parsedAIOverrideSections,
      });
    const narrative = {
      title: baseNarrative.title,
      body: [...baseNarrative.body],
      notes: baseNarrative.notes,
      sections: baseNarrative.sections,
      graphicCategory: baseNarrative.graphicCategory,
      mediaUrl: inferAIOverrideMediaUrl(draftContent, recipeId),
    };
    const recipeMode = resolvePresentationModeForRecipe(recipeId);
    const nextComponent = buildBuiltInPresentationComponentInstanceFromNarrative(recipeId, {
      canvas: activeCanvasSize,
      instanceId: nextComponentId(recipeId),
      narrative,
    });

    const previousRecipeId = slideAIDesign?.componentRecipeId ?? null;
    const appliedAt = new Date().toISOString();
    const preLayoutState = commandBusRef.current.getState();
    const inferredBackground = inferAIOverrideBackground(draftContent, activeCanvasSize);
    const overlayElements = getOverlayLayerElements(draftContent, activeCanvasSize, inferredBackground);
    const nextContent: PresentationSlideContent = {
      ...draftContent,
      background: inferredBackground,
      elements: overlayElements,
      components: [nextComponent],
      renderOrder: [
        ...overlayElements.map((el) => presentationRenderOrderIdForElement(el.id)),
        presentationRenderOrderIdForComponent(nextComponent.id),
      ],
      pendingMediaJobs: undefined,
      aiDesign: {
        source: "draft-with-ai",
        taskId: slideAIDesign?.taskId,
        schemaVersion: "presentation_ai_layout_v1",
        mode: recipeMode,
        ...(slideAIDesign?.candidateModes?.length ? { candidateModes: slideAIDesign.candidateModes } : {}),
        ...(slideAIDesign?.modeLocked !== undefined ? { modeLocked: slideAIDesign.modeLocked } : {}),
        userOverrideMode: recipeMode,
        ...(slideAIDesign?.fitScore ? { fitScore: slideAIDesign.fitScore } : {}),
        ...(slideAIDesign?.compactionLevel ? { compactionLevel: slideAIDesign.compactionLevel } : {}),
        componentRecipeId: recipeId,
        selectionMode: "manual-override",
        selectionReason: `Manual override applied in Presentation Edit: ${PRESENTATION_COMPONENT_AI_GUIDANCE[recipeId]?.label ?? recipeId}.`,
        candidateRecipes: slideAIDesign?.candidateRecipes,
        sourceTrace: slideAIDesign?.sourceTrace,
        fallbackHistory: slideAIDesign?.fallbackHistory,
        mediaModeMetadata: slideAIDesign?.mediaModeMetadata,
        narrative: {
          title: narrative.title,
          body: [...narrative.body],
          ...(narrative.notes ? { notes: narrative.notes } : {}),
          ...(narrative.sections
            ? {
              sections: narrative.sections.map((section) => ({
                heading: section.heading,
                details: [...section.details],
              })),
            }
            : {}),
          ...(narrative.graphicCategory ? { graphicCategory: narrative.graphicCategory } : {}),
        },
        overrideHistory: [
          ...(slideAIDesign?.overrideHistory ?? []),
          {
            recipeId,
            ...(previousRecipeId ? { previousRecipeId } : {}),
            appliedAt,
            source: "editor",
          },
        ].slice(-16),
        generatedAt: slideAIDesign?.generatedAt ?? new Date().toISOString(),
      },
    };
    applyComponentContentUpdate(nextContent, nextComponent.id);
    draftContentSlideIdRef.current = selectedSlide.id;
    // Cache the draft so version-change useEffect doesn't reset to stale server content
    if (selectedSlide) {
      cacheSlideDraft(selectedSlide.id, nextContent, slideNoteDraft);
    }
    // Preserve undo history across version-change useEffect (same pattern as handleAutoRelayoutSlide)
    pendingAutoLayoutUndoRef.current = {
      preLayoutState,
      postLayoutState: commandBusRef.current.getState(),
    };
    setAiRecipeOverrideChoice(recipeId);
    // Prevent the auto-init effect from resetting this choice due to server-data refetches.
    aiRecipeManuallyAppliedSlideIdRef.current = selectedSlide.id;
    if (deck && selectedSlide) {
      trackAIRecipeOverrideApplied({
        deckId: deck.id,
        slideId: selectedSlide.id,
        previousRecipeId,
        nextRecipeId: recipeId,
        source: "editor",
      });
    }
    toast.success(`Applied AI layout: ${PRESENTATION_COMPONENT_AI_GUIDANCE[recipeId]?.label ?? recipeId}.`);
    // Auto-fit viewport after rebuild so the new layout fills the canvas area
    setDesktopViewport({ scale: 1, offsetX: 0, offsetY: 0 });
  }

  function handleUpdateSelectedCanvasSlotText(slotId: string, text: string) {
    if (!selectedComponent) {
      return;
    }
    handleUpdateComponentTextSlot(selectedComponent.id, slotId, text);
  }

  function handleUpdateSelectedCanvasSlotImage(slotId: string, src: string, alt: string) {
    if (!selectedComponent) {
      return;
    }
    handleUpdateComponentImageSlot(selectedComponent.id, slotId, src, alt);
  }

  function handleUpdateSelectedCanvasSlotVideo(slotId: string, src: string, poster: string, title: string) {
    if (!selectedComponent) {
      return;
    }
    handleUpdateComponentVideoSlot(selectedComponent.id, slotId, src, poster, title);
  }

  function handlePickSelectedCanvasImageAsset(slotId: string, asset: CanvasLibraryAsset) {
    if (!selectedComponent) {
      return;
    }
    handleUpdateComponentImageSlot(
      selectedComponent.id,
      slotId,
      normalizeMediaSourceUrl(asset.sourceUrl),
      asset.title,
    );
  }

  function handlePickSelectedCanvasVideoAsset(slotId: string, asset: CanvasLibraryAsset) {
    if (!selectedComponent) {
      return;
    }
    handleUpdateComponentVideoSlot(
      selectedComponent.id,
      slotId,
      normalizeMediaSourceUrl(asset.sourceUrl),
      normalizeMediaSourceUrl(asset.thumbnailUrl),
      asset.title,
    );
  }

  function handleUpdateSelectedCanvasSlotList(slotId: string, items: string[]) {
    if (!selectedComponent) {
      return;
    }
    handleUpdateComponentListSlot(selectedComponent.id, slotId, items);
  }

  function handleDeleteComponent(componentId: string) {
    syncCommandState(commandBusRef.current.execute(deleteComponentCommand(componentId)));
    const nextComponentIds = selectedComponentSelectionIds.filter((id) => id !== componentId);
    setComponentSelection(nextComponentIds, {
      activeComponentId: nextComponentIds.length === 1 && selectedElementIds.length === 0
        ? nextComponentIds[0] ?? null
        : null,
    });
    focusMobileProperties("element");
  }

  function handleDetachComponent(componentId: string) {
    const component = draftComponents.find((item) => item.id === componentId);
    if (!component) {
      return;
    }

    syncCommandState(commandBusRef.current.execute(detachComponentCommand(componentId)));
    clearComponentSelection();
    focusMobileProperties("element");
  }

  function handleGroupSelection() {
    if (totalRenderableSelectionCount < 2) {
      return;
    }

    let nextId = "";
    if (!selectedComponentSelectionIds.length) {
      syncCommandState(commandBusRef.current.execute(groupSelectionCommand(
        () => {
          nextId = nextComponentId(PRESENTATION_GROUP_COMPONENT_ID);
          return nextId;
        },
      )));
    } else {
      executeCommand({
        id: "group-renderable-selection",
        apply: (state) => {
          nextId = nextComponentId(PRESENTATION_GROUP_COMPONENT_ID);
          return {
            ...state,
            content: groupRenderablesIntoComponent(state.content, {
              elementIds: state.selectedElementIds,
              componentIds: selectedComponentSelectionIds,
            }, {
              id: nextId,
              componentId: PRESENTATION_GROUP_COMPONENT_ID,
              componentType: PRESENTATION_GROUP_COMPONENT_ID,
              definitionRevision: 1,
              slotBindings: [],
              fallbackElements: [],
            }),
            selectedElementIds: [],
            snapGuides: [],
          };
        },
      });
    }
    if (!nextId) {
      return;
    }
    setCropModeElementId(null);
    setCropModeTarget("content");
    selectSingleComponent(nextId);
    focusMobileProperties("element");
  }

  function handleSelectElement(elementId: string, options?: { additive?: boolean; preferElement?: boolean }) {
    setCropModeElementId(null);
    setCropModeTarget("content");
    const parentComponentId = findParentComponentIdForElement(elementId);

    // If element belongs to a group component, select the group instead
    // (unless preferElement is set, which allows individual element selection)
    if (parentComponentId && !options?.preferElement && !options?.additive) {
      const parentComponent = draftComponents.find((c) => c.id === parentComponentId);
      if (parentComponent && isPresentationGroupComponent(parentComponent)) {
        clearComponentSelection();
        applySelectionOnly(selectElementsCommand([]));
        selectSingleComponent(parentComponentId);
        focusMobileProperties("element");
        return;
      }
    }

    // Allow individual element selection within built-in components
    // so users can click, resize, and reposition individual elements.
    if (!options?.additive) {
      clearComponentSelection();
    } else if (selectedComponentSelectionIds.length > 0) {
      setComponentSelection(selectedComponentSelectionIds, { activeComponentId: null });
      setSelectedComponentSlotId(null);
    }
    if (options?.additive) {
      const toggled = SelectionEngine.toggle(
        { selectedIds: selectedElementIds, activeId: selectedElementId },
        elementId,
      );
      const nextSelectedIds = toggled.selectedIds.includes(elementId)
        ? [elementId, ...toggled.selectedIds.filter((id) => id !== elementId)]
        : toggled.selectedIds;
      applySelectionOnly(selectElementsCommand(nextSelectedIds));
      if (nextSelectedIds.length > 0) {
        focusMobileProperties("element");
      }
      return;
    }

    applySelectionOnly(selectElementsCommand([elementId]));
    focusMobileProperties("element");
  }

  function handleFocusElement(elementId: string) {
    clearComponentSelection();
    focusMobileProperties("element");
  }

  function handleMarqueeSelect(
    bounds: { x: number; y: number; width: number; height: number },
    options?: { additive?: boolean },
  ) {
    const candidates = [
      ...draftContent.elements.map((element) => ({
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: Math.max(2, element.height),
      })),
      ...draftComponents.flatMap((component) => {
        const boundsForComponent = getComponentBounds(component);
        if (!boundsForComponent) {
          return [];
        }
        return [{
          id: toComponentSelectionId(component.id),
          x: boundsForComponent.x,
          y: boundsForComponent.y,
          width: boundsForComponent.width,
          height: boundsForComponent.height,
        }];
      }),
    ];
    const next = SelectionEngine.marquee(
      {
        selectedIds: [
          ...selectedElementIds,
          ...selectedComponentSelectionIds.map(toComponentSelectionId),
        ],
        activeId: selectedComponentId ? toComponentSelectionId(selectedComponentId) : selectedElementId,
      },
      bounds,
      candidates,
      { additive: options?.additive },
    );
    const ordered = next.activeId && next.selectedIds.includes(next.activeId)
      ? [next.activeId, ...next.selectedIds.filter((id) => id !== next.activeId)]
      : next.selectedIds;
    const orderedElementIds = ordered.filter((id) => !id.startsWith("component:"));
    const orderedComponentIds = ordered
      .map(fromComponentSelectionId)
      .filter((id): id is string => Boolean(id));
    applySelectionOnly(selectElementsCommand(orderedElementIds));
    setComponentSelection(orderedComponentIds, {
      activeComponentId: orderedElementIds.length === 0 && orderedComponentIds.length === 1
        ? orderedComponentIds[0] ?? null
        : null,
    });
    if (orderedElementIds.length > 0 || orderedComponentIds.length > 0) {
      focusMobileProperties("element");
    }
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

  function handleAdjustMediaCropById(
    elementId: string,
    patch: Parameters<typeof patchSelectedElementCommand>[0],
  ) {
    executeCommand(patchElementByIdCommand(elementId, patch));
  }

  function handleToggleCropMode(elementId: string | null) {
    setCropModeElementId(elementId);
    setCropModeTarget("content");
  }

  async function handleSaveCurrentAIBlockAsCustom(
    visibility: PresentationCustomBlockVisibility,
  ) {
    if (!reusableBuiltInComponent || !selectedSlide) {
      toast.error("No editable AI block is available to save.");
      return;
    }

    const componentDefinition = getBuiltInPresentationComponentDefinition(reusableBuiltInComponent.componentId);
    const nextLabel = createUniqueCustomBlockLabel(
      `${selectedSlide.title?.trim() || componentDefinition?.label || "Saved"} Block`,
      customBlocks,
    );
    try {
      const savedBlock = await saveCustomBlockMutation.mutateAsync({
        label: nextLabel,
        description: slideAIDesign?.selectionReason
          ? `Saved from AI Layout: ${slideAIDesign.selectionReason}`
          : `Saved reusable block based on ${componentDefinition?.label ?? reusableBuiltInComponent.componentId}.`,
        componentId: reusableBuiltInComponent.componentId as BuiltInPresentationComponentId,
        slotBindings: reusableBuiltInComponent.slotBindings,
        visibility,
        previewSource: {
          canvas: activeCanvasSize,
          fallbackElements: reusableBuiltInComponent.fallbackElements,
          background: inferAIOverrideBackground(draftContent, activeCanvasSize),
        },
      });
      upsertCustomBlockInState(savedBlock);
      await trpcUtils.presentation.listCustomBlocks.invalidate();
      trackPresentationCustomBlockSaved({
        componentId: reusableBuiltInComponent.componentId,
        visibility,
        source: "ai-layout",
      });
      toast.success(`Saved custom block: ${savedBlock.label}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save custom block.");
    }
  }

  function handleMoveSelection(deltaX: number, deltaY: number) {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    if (selectedComponentSelectionIds.length > 0) {
      executeCommand({
        id: "move-renderable-selection",
        apply: (state) => {
          let nextContent = state.selectedElementIds.length
            ? translateElements(state.content, state.selectedElementIds, deltaX, deltaY)
            : state.content;
          for (const componentId of selectedComponentSelectionIds) {
            nextContent = translateComponentFallbackElements(nextContent, componentId, deltaX, deltaY);
          }
          return {
            ...state,
            content: nextContent,
            snapGuides: [],
          };
        },
      });
      return;
    }

    if (!selectedElementIds.length && selectedComponent) {
      syncCommandState(commandBusRef.current.execute(moveComponentCommand(selectedComponent.id, deltaX, deltaY)));
      selectSingleComponent(selectedComponent.id);
      return;
    }

    executeCommand(moveSelectionCommand(deltaX, deltaY, snapLockEnabled));
  }

  function handleResizeSelection(width: number, height: number) {
    if (isMobileViewport) {
      mobileGestures.canUseTouchTarget(24);
      return;
    }

    if (!selectedElementIds.length && selectedComponent) {
      syncCommandState(commandBusRef.current.execute(resizeComponentCommand(selectedComponent.id, width, height)));
      selectSingleComponent(selectedComponent.id);
      return;
    }

    executeCommand(resizeSelectionCommand(width, height));
  }

  function handleRotateSelection(deltaDegrees: number) {
    if (isMobileViewport) {
      mobileGestures.canUseTouchTarget(24);
      return;
    }

    if (!selectedElementIds.length && selectedComponent) {
      syncCommandState(commandBusRef.current.execute(rotateComponentCommand(selectedComponent.id, deltaDegrees)));
      selectSingleComponent(selectedComponent.id);
      return;
    }

    executeCommand(rotateSelectionCommand(deltaDegrees));
  }

  // --- Drag (continuous) variants — merge into a single undo entry per gesture ---

  function handleDragMove(deltaX: number, deltaY: number) {
    if (!isTouchActionAllowed(40)) return;

    if (selectedComponentSelectionIds.length > 0) {
      syncCommandState(commandBusRef.current.executeAndMerge({
        id: "move-renderable-selection",
        apply: (state) => {
          let nextContent = state.selectedElementIds.length
            ? translateElements(state.content, state.selectedElementIds, deltaX, deltaY)
            : state.content;
          for (const componentId of selectedComponentSelectionIds) {
            nextContent = translateComponentFallbackElements(nextContent, componentId, deltaX, deltaY);
          }
          return {
            ...state,
            content: nextContent,
            snapGuides: [],
          };
        },
      }));
      return;
    }

    if (!selectedElementIds.length && selectedComponent) {
      syncCommandState(
        commandBusRef.current.executeAndMerge(moveComponentCommand(selectedComponent.id, deltaX, deltaY)),
      );
      selectSingleComponent(selectedComponent.id);
      return;
    }

    syncCommandState(
      commandBusRef.current.executeAndMerge(moveSelectionCommand(deltaX, deltaY, snapLockEnabled)),
    );
  }

  function handleDragResize(width: number, height: number) {
    if (isMobileViewport) return;
    if (!selectedElementIds.length && selectedComponent) {
      syncCommandState(
        commandBusRef.current.executeAndMerge(resizeComponentCommand(selectedComponent.id, width, height)),
      );
      selectSingleComponent(selectedComponent.id);
      return;
    }
    syncCommandState(commandBusRef.current.executeAndMerge(resizeSelectionCommand(width, height)));
  }

  function handleDragResizeComponentSlot(slotId: string, width: number, height: number) {
    if (isMobileViewport || !selectedComponent) {
      return;
    }
    const slotArea = selectedComponentCanvasSlots.find((slot) => slot.slotId === slotId);
    if (!slotArea?.targetElementIds.length) {
      return;
    }
    syncCommandState(commandBusRef.current.executeAndMerge({
      id: "resize-component-slot",
      apply: (state) => ({
        ...state,
        content: resizeComponentSlotFallbackElements(
          state.content,
          selectedComponent.id,
          slotArea.targetElementIds,
          width,
          height,
        ),
        snapGuides: [],
      }),
    }));
    selectSingleComponent(selectedComponent.id);
    setSelectedComponentSlotId(slotId);
  }

  function handleSelectRawComponentSlotElement(slotId: string) {
    if (!selectedComponent) {
      return;
    }
    const slotArea = selectedComponentCanvasSlots.find((slot) => slot.slotId === slotId);
    const targetElementId = slotArea?.targetElementIds.find((elementId) => {
      const element = selectedComponent.fallbackElements.find((candidate) => candidate.id === elementId);
      return element?.type === "image" || element?.type === "video";
    }) ?? slotArea?.targetElementIds[0];
    if (!targetElementId) {
      return;
    }
    setSelectedComponentSlotId(null);
    handleSelectElement(targetElementId, { preferElement: true });
  }

  function handleAutoFitSelection() {
    if (isMobileViewport || !selectedComponent || !selectedComponentDefinition) {
      return;
    }
    const mode = selectedComponentDefinition.category === "Document" ? "canvas" : "width";
    syncCommandState(commandBusRef.current.execute({
      id: `fit-component-${mode}`,
      apply: (state) => ({
        ...state,
        content: fitComponentFallbackElementsToCanvas(
          state.content,
          selectedComponent.id,
          mode,
        ),
        snapGuides: [],
      }),
    }));
    selectSingleComponent(selectedComponent.id);
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

    if (!selectedElementIds.length && selectedComponent) {
      syncCommandState(commandBusRef.current.execute(arrangeComponentCommand(selectedComponent.id, direction)));
      selectSingleComponent(selectedComponent.id);
      return;
    }

    executeCommand(arrangeSelectionCommand(direction));
  }

  function handleSetSlideBackground(background: PresentationSlideBackground | undefined) {
    executeCommand(setSlideBackgroundCommand(background));
  }

  function handleUndo() {
    syncCommandState(commandBusRef.current.undo());
  }

  function handleRedo() {
    syncCommandState(commandBusRef.current.redo());
  }

  function handleDuplicateSelection() {
    if (selectedComponentSelectionIds.length > 0) {
      const nextComponentIds: string[] = [];
      let duplicatedElementIds: string[] = [];
      executeCommand({
        id: "duplicate-renderable-selection",
        apply: (state) => {
          const originalElementIds = new Set(state.content.elements.map((element) => element.id));
          let nextContent = state.selectedElementIds.length
            ? duplicateElements(
              state.content,
              state.selectedElementIds,
              (source) => nextElementId(source.type as PresentationElementType),
            )
            : state.content;
          for (const componentId of selectedComponentSelectionIds) {
            nextContent = duplicateComponentById(nextContent, componentId, (source) => {
              const nextId = nextComponentId(source.componentId);
              nextComponentIds.push(nextId);
              return nextId;
            });
          }
          duplicatedElementIds = nextContent.elements
            .filter((element) => !originalElementIds.has(element.id))
            .map((element) => element.id);
          return {
            ...state,
            content: nextContent,
            selectedElementIds: duplicatedElementIds,
            snapGuides: [],
          };
        },
      });
      setComponentSelection(nextComponentIds, {
        activeComponentId: duplicatedElementIds.length === 0 && nextComponentIds.length === 1
          ? nextComponentIds[0] ?? null
          : null,
      });
      focusMobileProperties("element");
      return;
    }

    if (!selectedElementIds.length && selectedComponent) {
      let nextId = "";
      syncCommandState(commandBusRef.current.execute(duplicateComponentCommand(
        selectedComponent.id,
        (source) => {
          nextId = nextComponentId(source.componentId);
          return nextId;
        },
      )));
      selectSingleComponent(nextId || selectedComponent.id);
      setSelectedComponentSlotId(null);
      focusMobileProperties("element");
      return;
    }
    executeCommand(
      duplicateSelectionCommand((source) => nextElementId(source.type as PresentationElementType)),
    );
  }

  function cloneElementsForClipboard(elements: PresentationElement[]): PresentationElement[] {
    return elements.map((element) => JSON.parse(JSON.stringify(element)) as PresentationElement);
  }

  function handleCopySelection() {
    if (!selectedElementIds.length && selectedComponent) {
      componentClipboardRef.current = JSON.parse(JSON.stringify(selectedComponent)) as PresentationComponentInstance;
      elementClipboardRef.current = [];
      clipboardPasteCountRef.current = 0;
      return;
    }

    if (!selectedElementIds.length) {
      return;
    }
    const selectedIdSet = new Set(selectedElementIds);
    const ordered = renderableDraftElements.filter((element) => selectedIdSet.has(element.id));
    if (!ordered.length) {
      return;
    }
    componentClipboardRef.current = null;
    elementClipboardRef.current = cloneElementsForClipboard(ordered);
    clipboardPasteCountRef.current = 0;
  }

  function handleCutSelection() {
    if (!selectedElementIds.length && selectedComponent) {
      handleCopySelection();
      handleDeleteSelection();
      return;
    }

    if (!selectedElementIds.length) {
      return;
    }
    handleCopySelection();
    handleDeleteSelection();
  }

  function handlePasteSelection() {
    const clipboardComponent = componentClipboardRef.current;
    if (clipboardComponent) {
      const offset = 16 * (clipboardPasteCountRef.current + 1);
      let nextId = "";
      executeCommand({
        id: "paste-component",
        apply: (state) => {
          nextId = nextComponentId(clipboardComponent.componentId);
          const pasted: PresentationComponentInstance = {
            ...JSON.parse(JSON.stringify(clipboardComponent)) as PresentationComponentInstance,
            id: nextId,
            fallbackElements: clipboardComponent.fallbackElements.map((element) => {
              const delimiter = element.id.indexOf("::");
              const suffix = delimiter >= 0 ? element.id.slice(delimiter + 2) : element.id;
              return {
                ...element,
                id: `${nextId}::${suffix}`,
                x: element.x + offset,
                y: element.y + offset,
              };
            }),
          };
          return {
            ...state,
            content: addComponent(state.content, pasted),
            selectedElementIds: [],
            snapGuides: [],
          };
        },
      });
      selectSingleComponent(nextId || selectedComponentId);
      setSelectedComponentSlotId(null);
      clipboardPasteCountRef.current += 1;
      return;
    }

    const clipboardElements = elementClipboardRef.current;
    if (!clipboardElements.length) {
      return;
    }
    const offset = 16 * (clipboardPasteCountRef.current + 1);
    const includesTextElement = clipboardElements.some((element) => element.type === "text");
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
            ...(includesTextElement && state.content.visualOnly === true
              ? { visualOnly: undefined }
              : {}),
            elements: [...state.content.elements, ...pasted],
          },
          selectedElementIds: pasted.map((element) => element.id),
          snapGuides: [],
        };
      },
    });
    if (includesTextElement && draftContent.visualOnly === true) {
      toast.info("Visual-only mode was turned off for this slide because you pasted text.");
    }
    clipboardPasteCountRef.current += 1;
  }

  function handleDeleteSelection() {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    if (selectedComponentSelectionIds.length > 0) {
      executeCommand({
        id: "delete-renderable-selection",
        apply: (state) => ({
          ...state,
          content: deleteComponents(
            deleteElements(state.content, state.selectedElementIds),
            selectedComponentSelectionIds,
          ),
          selectedElementIds: [],
          snapGuides: [],
        }),
      });
      clearComponentSelection();
      return;
    }

    if (!selectedElementIds.length && selectedComponent) {
      handleDeleteComponent(selectedComponent.id);
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

  function normalizeTransitionChoice(value: string): PresentationTransition {
    const matched = PRESENTATION_TRANSITION_OPTIONS.find((option) => option.value === value);
    return matched?.value ?? "fade";
  }

  function applyTransitionToSelectedDraft(transition: PresentationTransition) {
    if (!selectedSlide) return;
    syncCommandState({
      ...commandState,
      content: {
        ...draftContent,
        transition,
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
        const cachedDraft = getCachedSlideDraft(slide.id);
        const baseContent = slide.id === selectedSlide?.id
          ? draftContent
          : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
        await updateSlideMutation.mutateAsync({
          deckId: deck.id,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "manual",
          title: slide.title,
          notes: slide.id === selectedSlide?.id
            ? (slideNoteDraft.trim() ? slideNoteDraft : null)
            : cachedDraft?.notes ?? slide.notes ?? null,
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

  async function handleApplyTransitionAllSlides(transition: PresentationTransition) {
    if (!deck || !slides.length || transitionApplyAllPending) {
      return;
    }

    setTransitionApplyAllPending(true);
    try {
      for (const slide of slides) {
        const cachedDraft = getCachedSlideDraft(slide.id);
        const persistedContent = ensureSlideContent(slide.slideContent);
        if ((persistedContent.transition ?? "fade") === transition) {
          continue;
        }
        const baseContent = slide.id === selectedSlide?.id
          ? draftContent
          : cachedDraft?.content ?? persistedContent;
        await updateSlideMutation.mutateAsync({
          deckId: deck.id,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "manual",
          title: slide.title,
          notes: slide.id === selectedSlide?.id
            ? (slideNoteDraft.trim() ? slideNoteDraft : null)
            : cachedDraft?.notes ?? slide.notes ?? null,
          slideContent: {
            ...baseContent,
            transition,
          },
        });
      }
      toast.success(`Applied ${transition} transition to all slides.`);
    } catch (error) {
      toast.error(`Failed to apply transition to all slides: ${String((error as Error)?.message || error)}`);
    } finally {
      setTransitionApplyAllPending(false);
      await refreshDeck();
    }
  }

  async function handleFitProjectAudioDurationAllSlides() {
    if (!deck || !slides.length || timingFitProjectAudioPending) {
      return;
    }
    if (!deckProjectAudioTrack) {
      toast.error("No project audio configured.");
      return;
    }

    const slideNumberById = new Map(slides.map((slide) => [slide.id, slide.orderIndex + 1]));
    const formatSlideNumbers = (slideIds: number[] | undefined): string => {
      if (!slideIds || !slideIds.length) {
        return "";
      }
      const numbers = slideIds
        .map((slideId) => slideNumberById.get(slideId))
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b);
      if (!numbers.length) {
        return "";
      }
      return numbers.join(", ");
    };
    const buildFitFailureMessage = (failure: FitSlidesToProjectAudioDurationFailure): string => {
      switch (failure.code) {
        case "video_duration_unknown": {
          const slideNumbers = formatSlideNumbers(failure.slideIds);
          if (!slideNumbers) {
            return "Unable to read video duration for one or more slides.";
          }
          return `Unable to read video duration for slide(s): ${slideNumbers}.`;
        }
        case "video_duration_exceeds_max": {
          const slideNumbers = formatSlideNumbers(failure.slideIds);
          if (!slideNumbers) {
            return "At least one video slide is longer than supported max duration.";
          }
          return `Video on slide(s) ${slideNumbers} exceeds the ${formatDurationMsLabel(MAX_SLIDE_DURATION_MS)} per-slide limit.`;
        }
        case "target_shorter_than_locked_slides":
          return `Project audio (${formatDurationMsLabel(failure.targetDurationMs ?? 0)}) is shorter than locked video slides (${formatDurationMsLabel(failure.lockedDurationMs ?? 0)}).`;
        case "target_outside_adjustable_range": {
          const minTotal = (failure.lockedDurationMs ?? 0) + (failure.minAdjustableDurationMs ?? 0);
          const maxTotal = (failure.lockedDurationMs ?? 0) + (failure.maxAdjustableDurationMs ?? 0);
          return `Project audio length is outside adjustable range (${formatDurationMsLabel(minTotal)} - ${formatDurationMsLabel(maxTotal)}).`;
        }
        case "no_adjustable_slides":
          return "All slides are video-locked and cannot be adjusted to match this project audio length.";
        case "no_slides":
          return "No slides available to adjust.";
        case "invalid_target_duration":
        default:
          return "Unable to determine project audio duration from current trim settings.";
      }
    };

    setTimingFitProjectAudioPending(true);
    try {
      const metadataDurationSec = extractMetadataDurationSeconds(deckProjectAudioItemQuery.data?.metadata);
      const projectAudioSourceUrl = normalizeMediaSourceUrl((deckProjectAudioItemQuery.data as any)?.sourceUrl);
      let sourceDurationMs = metadataDurationSec != null
        ? Math.round(metadataDurationSec * 1000)
        : null;
      if (sourceDurationMs == null && projectAudioSourceUrl) {
        const probedDurationSec = await probeMediaDurationSeconds(projectAudioSourceUrl, "audio");
        if (probedDurationSec != null) {
          sourceDurationMs = Math.round(probedDurationSec * 1000);
        }
      }

      const targetAudioDurationMs = resolveProjectAudioPlayableDurationMs(
        deckProjectAudioTrack,
        sourceDurationMs,
      );
      if (targetAudioDurationMs == null || targetAudioDurationMs < MIN_SLIDE_DURATION_MS) {
        toast.error("Unable to determine project audio duration from current trim settings.");
        return;
      }

      const videoDurationProbeCache = new Map<string, Promise<number | null>>();
      const slideTimingInputs = await Promise.all(slides.map(async (slide) => {
        const cachedDraft = getCachedSlideDraft(slide.id);
        const content = slide.id === selectedSlide?.id
          ? draftContent
          : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
        const currentDurationMs = resolveSlideDurationMs(content);
        const videoSourceUrls = [...new Set(content.elements
          .filter((element) => element.type === "video")
          .map((element) => normalizeMediaSourceUrl(element.src))
          .filter((sourceUrl): sourceUrl is string => Boolean(sourceUrl.trim())))];
        if (!videoSourceUrls.length) {
          return {
            slideId: slide.id,
            currentDurationMs,
            hasVideo: false,
            videoDurationMs: null,
          };
        }

        const videoDurationsSec = await Promise.all(videoSourceUrls.map((sourceUrl) => {
          const cached = videoDurationProbeCache.get(sourceUrl);
          if (cached) {
            return cached;
          }
          const pending = probeMediaDurationSeconds(sourceUrl, "video");
          videoDurationProbeCache.set(sourceUrl, pending);
          return pending;
        }));
        const knownDurationsSec = videoDurationsSec.filter((value): value is number => (
          value != null && Number.isFinite(value) && value > 0
        ));
        const videoDurationMs = knownDurationsSec.length === videoDurationsSec.length
          ? Math.round(Math.max(...knownDurationsSec) * 1000)
          : null;
        return {
          slideId: slide.id,
          currentDurationMs,
          hasVideo: true,
          videoDurationMs,
        };
      }));

      const fitResult = fitSlidesToProjectAudioDuration({
        targetAudioDurationMs,
        slides: slideTimingInputs,
        minSlideDurationMs: MIN_SLIDE_DURATION_MS,
        maxSlideDurationMs: MAX_SLIDE_DURATION_MS,
      });
      if (!fitResult.ok) {
        toast.error(buildFitFailureMessage(fitResult));
        return;
      }

      let updatedSlideCount = 0;
      for (const slide of slides) {
        const nextDurationMs = fitResult.durationBySlideId.get(slide.id);
        if (nextDurationMs == null) {
          continue;
        }
        const cachedDraft = getCachedSlideDraft(slide.id);
        const baseContent = slide.id === selectedSlide?.id
          ? draftContent
          : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
        if (resolveSlideDurationMs(baseContent) === nextDurationMs) {
          continue;
        }
        await updateSlideMutation.mutateAsync({
          deckId: deck.id,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "manual",
          title: slide.title,
          notes: slide.id === selectedSlide?.id
            ? (slideNoteDraft.trim() ? slideNoteDraft : null)
            : cachedDraft?.notes ?? slide.notes ?? null,
          slideContent: {
            ...baseContent,
            durationMs: nextDurationMs,
          },
        });
        updatedSlideCount += 1;
      }

      await refreshDeck();

      const targetLabel = formatDurationMsLabel(fitResult.targetDurationMs);
      if (updatedSlideCount > 0) {
        toast.success(`Adjusted ${updatedSlideCount} slide(s) to match project audio (${targetLabel}).`);
      } else {
        toast.success(`Slide timings already match project audio (${targetLabel}).`);
      }
      if (fitResult.lockedVideoSlideIds.length > 0) {
        toast.info(
          `Locked ${fitResult.lockedVideoSlideIds.length} video slide(s) to avoid cutting video playback.`,
        );
      }
    } catch (error) {
      toast.error(`Failed to fit slides to project audio: ${String((error as Error)?.message || error)}`);
    } finally {
      setTimingFitProjectAudioPending(false);
    }
  }

  const performSave = useCallback(async (saveMode: SaveMode): Promise<"saved" | "skipped"> => {
    if (!deck || !selectedSlide) {
      return "skipped";
    }

    // Safety guard: during slide transitions, selectedSlide updates before draftContent
    // (content-loading useEffect runs after render). Skip autosave if the content-loading
    // effect hasn't run yet for this slide — draftContent still belongs to the previous slide.
    if (saveMode === "autosave" && draftContentSlideIdRef.current !== selectedSlide.id) {
      return "skipped";
    }

    // Additional guard: detect if draftContent is stale (belongs to a previous slide).
    // After slide switch, the ref may update before the state. If the draft signature
    // matches the PREVIOUS slide's persisted signature, skip to avoid cross-slide saves.
    if (saveMode === "autosave" && switchingSlideRef.current) {
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
        notes: slideNoteDraft.trim() ? slideNoteDraft : null,
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
            && isConflictSlideContentEqualDraft(conflict, draftContent, slideNoteDraft)
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
        const nextPolicy = saveMode === "autosave"
          ? registerConflict(conflictPolicyRef.current, Date.now())
          : conflictPolicyRef.current;
        if (saveMode === "autosave") {
          setConflictPolicy(nextPolicy);
        }
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
  }, [deck, draftContent, expectedSlideVersion, selectedSlide, slideNoteDraft, updateSlideMutation]);

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
        selectedSlide.notes,
      ),
    );
  }, [autosaveController, selectedSlide?.id, selectedSlide?.version, selectedSlide?.notes]);

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
    supplementalMediaClarityPercent?: number;
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
    const supplementalMediaClarityPercent = options?.supplementalMediaClarityPercent ?? autoLayoutSupplementalMediaClarityPercent;
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
      const dirtyCachedSlides: Array<{
        id: number;
        orderIndex: number;
        title: string;
        content: PresentationSlideContent;
        notes: string | null;
      }> = [];
      for (const [slideId, cachedDraft] of slideDraftCacheRef.current.entries()) {
        if (slideId === selectedId) {
          continue;
        }
        const slide = slides.find((item) => item.id === slideId);
        if (!slide) {
          continue;
        }
        const persisted = ensureSlideContent(slide.slideContent);
        const cached = ensureSlideContent(cachedDraft.content);
        if (
          buildSlideContentSignature(persisted) === buildSlideContentSignature(cached)
          && (slide.notes ?? "") === (cachedDraft.notes ?? "")
        ) {
          clearCachedSlideDraft(slideId);
          continue;
        }
        dirtyCachedSlides.push({
          id: slide.id,
          orderIndex: slide.orderIndex,
          title: slide.title,
          content: cached,
          notes: cachedDraft.notes ?? null,
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
              notes: draftSlide.notes,
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
    // Capture state before layout so undo can return to it after refreshDeck() resets command bus.
    const preLayoutState = commandBusRef.current.getState();
    const templateSelection = resolveAutoLayoutTemplateSelection(templateChoice);

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
            ...(templateSelection.templateId ? { templateId: templateSelection.templateId } : {}),
            ...(templateSelection.componentRecipeId ? { componentRecipeId: templateSelection.componentRecipeId } : {}),
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
            supplementalMediaClarityPercent,
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
            // Schedule undo-stack restoration: refreshDeck() below triggers a version-change
            // useEffect that resets the command bus, wiping the undo stack. We save pre/post
            // states here so the useEffect can rebuild them afterwards.
            pendingAutoLayoutUndoRef.current = {
              preLayoutState,
              postLayoutState: commandBusRef.current.getState(),
            };
            autosaveController.markPersisted(
              buildDraftSignature(selectedId, nextContent, slideNoteDraft),
            );
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
        const pendingUndo = pendingAutoLayoutUndoRef.current;
        if (pendingUndo) {
          pendingAutoLayoutUndoRef.current = null;
          commandBusRef.current.reset(pendingUndo.preLayoutState);
          const restored = commandBusRef.current.execute({
            id: "restore-post-auto-layout-after-refresh",
            apply: () => pendingUndo.postLayoutState,
          });
          restoredAutoLayoutHistoryRef.current = {
            slideId: selectedId,
            slideVersion: slideVersionById.get(selectedId) ?? null,
          };
          setCommandState(restored);
        }
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

  async function handleRepairSlideFromNote() {
    if (!deck || !selectedSlide) {
      toast.error("No active slide to repair.");
      return;
    }

    const selectedId = selectedSlide.id;
    const currentDraftNote = slideNoteDraft.trim();
    const savedNote = String(selectedSlide.notes ?? "").trim();
    if (!currentDraftNote && !savedNote) {
      toast.error("Add and save a slide note first.");
      return;
    }

    if (slideNoteDirty) {
      const saved = await handleSaveSlide({ silent: true });
      if (!saved) {
        toast.error("Save the slide note first.");
        return;
      }
    }

    let expectedVersion = Number.isFinite(Number(selectedSlide.version))
      ? Number(selectedSlide.version)
      : 0;
    if (typeof deckQuery.refetch === "function") {
      const latest = await deckQuery.refetch();
      const latestSlides = Array.isArray((latest.data as any)?.slides)
        ? (latest.data as any).slides
        : [];
      const latestSlide = latestSlides.find((slide: any) => Number(slide?.id) === selectedId);
      const nextVersion = Number(latestSlide?.version);
      if (Number.isFinite(nextVersion) && nextVersion >= 0) {
        expectedVersion = nextVersion;
      }
    }

    const preLayoutState = commandBusRef.current.getState();

    try {
      const result = await repairSlideFromNoteMutation.mutateAsync({
        deckId: deck.id,
        slideId: selectedId,
        expectedVersion,
      });
      const updatedSlide = (result as any)?.slide;
      const nextVersion = Number(updatedSlide?.version);
      const nextContent = ensureSlideContent((updatedSlide?.slideContent ?? selectedSlide.slideContent) as PresentationSlideContent);
      const nextSelected = nextContent.elements[0]?.id ? [nextContent.elements[0].id] : [];
      executeCommand({
        id: "apply-slide-note-repair",
        apply: (state) => ({
          ...state,
          content: nextContent,
          selectedElementIds: nextSelected,
          snapGuides: [],
        }),
      });
      pendingAutoLayoutUndoRef.current = {
        preLayoutState,
        postLayoutState: commandBusRef.current.getState(),
      };
      clearCachedSlideDraft(selectedId);
      if (Number.isFinite(nextVersion)) {
        setExpectedSlideVersion(nextVersion);
      }
      autosaveController.markPersisted(
        buildDraftSignature(
          selectedId,
          nextContent,
          String(updatedSlide?.notes ?? selectedSlide.notes ?? slideNoteDraft),
        ),
      );
      setSaveState("saved");
      await Promise.all([
        refreshDeck(),
        trpcUtils.presentation.listVersions.invalidate(),
      ]);
      const pendingUndo = pendingAutoLayoutUndoRef.current;
      if (pendingUndo) {
        pendingAutoLayoutUndoRef.current = null;
        commandBusRef.current.reset(pendingUndo.preLayoutState);
        const restored = commandBusRef.current.execute({
          id: "restore-post-slide-repair-after-refresh",
          apply: () => pendingUndo.postLayoutState,
        });
        restoredAutoLayoutHistoryRef.current = {
          slideId: selectedId,
          slideVersion: Number.isFinite(nextVersion) ? nextVersion : null,
        };
        setCommandState(restored);
      }
      toast.success("Slide regenerated from saved note.");
      const resultWarnings = Array.isArray((result as any)?.warnings)
        ? (result as any).warnings.filter((warning: unknown) => typeof warning === "string")
        : [];
      if (resultWarnings.length > 0) {
        toast.info(resultWarnings[0] as string);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Slide regeneration failed.");
    }
  }

  async function handleGenerateLayoutFromNote() {
    if (!deck || !selectedSlide) {
      toast.error("No active slide.");
      return;
    }

    const selectedId = selectedSlide.id;
    const currentDraftNote = slideNoteDraft.trim();
    const savedNote = String(selectedSlide.notes ?? "").trim();
    if (!currentDraftNote && !savedNote) {
      toast.error("Add and save a slide note first.");
      return;
    }

    if (slideNoteDirty) {
      const saved = await handleSaveSlide({ silent: true });
      if (!saved) {
        toast.error("Save the slide note first.");
        return;
      }
    }

    let expectedVersion = Number.isFinite(Number(selectedSlide.version))
      ? Number(selectedSlide.version)
      : 0;
    if (typeof deckQuery.refetch === "function") {
      const latest = await deckQuery.refetch();
      const latestSlides = Array.isArray((latest.data as any)?.slides)
        ? (latest.data as any).slides
        : [];
      const latestSlide = latestSlides.find((slide: any) => Number(slide?.id) === selectedId);
      const nextVersion = Number(latestSlide?.version);
      if (Number.isFinite(nextVersion) && nextVersion >= 0) {
        expectedVersion = nextVersion;
      }
    }

    const preLayoutState = commandBusRef.current.getState();

    try {
      const result = await generateLayoutFromNoteMutation.mutateAsync({
        deckId: deck.id,
        slideId: selectedId,
        expectedVersion,
        stylePresetId: layoutGenPresetId,
      });
      // Guard: if user switched to a different slide during the LLM call (30-60s),
      // do NOT apply the result to the wrong slide — just discard silently.
      if (selectedSlideId !== selectedId) {
        toast.info("Slide เปลี่ยนระหว่างรอ AI — ผลลัพธ์ถูกยกเลิก กรุณากดจัดหน้าใหม่");
        return;
      }
      const updatedSlide = (result as any)?.slide;
      const nextVersion = Number(updatedSlide?.version);
      const nextContent = ensureSlideContent((updatedSlide?.slideContent ?? selectedSlide.slideContent) as PresentationSlideContent);
      const nextSelected = nextContent.elements[0]?.id ? [nextContent.elements[0].id] : [];
      executeCommand({
        id: "apply-layout-from-note",
        apply: (state) => ({
          ...state,
          content: nextContent,
          selectedElementIds: nextSelected,
          snapGuides: [],
        }),
      });
      pendingAutoLayoutUndoRef.current = {
        preLayoutState,
        postLayoutState: commandBusRef.current.getState(),
      };
      clearCachedSlideDraft(selectedId);
      if (Number.isFinite(nextVersion)) {
        setExpectedSlideVersion(nextVersion);
      }
      autosaveController.markPersisted(
        buildDraftSignature(
          selectedId,
          nextContent,
          String(updatedSlide?.notes ?? selectedSlide.notes ?? slideNoteDraft),
        ),
      );
      setSaveState("saved");
      await Promise.all([
        refreshDeck(),
        trpcUtils.presentation.listVersions.invalidate(),
      ]);
      const pendingUndo = pendingAutoLayoutUndoRef.current;
      if (pendingUndo) {
        pendingAutoLayoutUndoRef.current = null;
        commandBusRef.current.reset(pendingUndo.preLayoutState);
        const restored = commandBusRef.current.execute({
          id: "restore-post-layout-gen-after-refresh",
          apply: () => pendingUndo.postLayoutState,
        });
        restoredAutoLayoutHistoryRef.current = {
          slideId: selectedId,
          slideVersion: Number.isFinite(nextVersion) ? nextVersion : null,
        };
        setCommandState(restored);
      }
      setLayoutGenPresetOpen(false);
      toast.success("จัดหน้า slide ด้วย AI สำเร็จ");
      const resultWarnings = Array.isArray((result as any)?.warnings)
        ? (result as any).warnings.filter((warning: unknown) => typeof warning === "string")
        : [];
      if (resultWarnings.length > 0) {
        toast.info(resultWarnings[0] as string);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "การจัดหน้า slide ล้มเหลว");
    }
  }

  async function handleGenerateLayoutFromDeckNote() {
    if (!deck) {
      toast.error("No active deck.");
      return;
    }
    const deckNotes = deckNoteDraft.trim();
    if (!deckNotes) {
      toast.error("Add deck notes first.");
      return;
    }
    // Save deck note first if dirty
    if (deckNoteDirty) {
      const saved = await handleSaveDeckNote();
      if (!saved) {
        toast.error("บันทึก deck note ก่อนสร้าง slides");
        return;
      }
    }
    try {
      const rawNum = deckLayoutGenSlideCount ? parseInt(deckLayoutGenSlideCount, 10) : NaN;
      const numSlides = Number.isFinite(rawNum) ? Math.min(30, Math.max(1, rawNum)) : undefined;
      const result = await generateLayoutFromDeckNoteMutation.mutateAsync({
        deckId: deck.id,
        expectedVersion: deck.version,
        stylePresetId: deckLayoutGenPresetId,
        ...(numSlides && numSlides > 0 ? { numSlides } : {}),
      });
      const taskId = (result as any)?.taskId;
      if (taskId) {
        setDeckLayoutGenOpen(false);
        setIsDeckNoteDialogOpen(false);
        toast.success("เริ่มสร้าง slides จาก notes แล้ว กรุณารอสักครู่...");
        // Poll for completion using existing getDraftProgress
        const pollId = setInterval(async () => {
          try {
            const progress = await trpcUtils.presentation.ai.getDraftProgress.fetch({ taskId });
            if ((progress as any)?.completed) {
              clearInterval(pollId);
              if (deckLayoutGenPollRef.current === pollId) {
                deckLayoutGenPollRef.current = null;
              }
              await deckQuery.refetch();
              if ((progress as any)?.error) {
                toast.error((progress as any).error.message || "การสร้าง layout ล้มเหลว");
              } else {
                const addedCount = (progress as any)?.result?.slidesAdded ?? 0;
                toast.success(`สร้าง ${addedCount} slides จาก deck notes สำเร็จ`);
              }
            }
          } catch {
            clearInterval(pollId);
            if (deckLayoutGenPollRef.current === pollId) {
              deckLayoutGenPollRef.current = null;
            }
          }
        }, 2000);
        // Track for cleanup on unmount
        if (deckLayoutGenPollRef.current) {
          clearInterval(deckLayoutGenPollRef.current);
        }
        deckLayoutGenPollRef.current = pollId;
        // Safety timeout: stop polling after 5 minutes
        deckLayoutGenTimeoutRef.current = setTimeout(() => {
          clearInterval(pollId);
          if (deckLayoutGenPollRef.current === pollId) {
            deckLayoutGenPollRef.current = null;
          }
          deckLayoutGenTimeoutRef.current = null;
        }, 300_000);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "การสร้าง slides จาก notes ล้มเหลว");
    }
  }

  // Generate slide note content using a skill
  async function handleGenerateNoteContent() {
    if (!noteGenSkill || isGeneratingNoteContent) return;
    setIsGeneratingNoteContent(true);
    try {
      const currentNote = slideNoteDraft.trim();
      // Build prompt: use current slide note as context, add word limit instruction if set
      const wordLimitNum = noteGenWordLimit ? parseInt(noteGenWordLimit, 10) : 0;
      const wordLimitInstruction = wordLimitNum > 0
        ? `\n\nIMPORTANT: Limit the output to approximately ${wordLimitNum} words.`
        : "";
      const prompt = currentNote
        ? `${currentNote}${wordLimitInstruction}`
        : `Write content for this slide.${wordLimitInstruction}`;

      const result = await noteGenExecuteMutation.mutateAsync({
        skillId: noteGenSkill,
        prompt,
      });
      if (result.success && result.message) {
        setSlideNoteDraft(result.message);
        toast.success("Content generated — review and save the note.");
      } else {
        toast.error((result as any).error || "Failed to generate content.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate content.");
    } finally {
      setIsGeneratingNoteContent(false);
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

  async function persistDeckNote(
    expectedVersion: number,
    nextNotes: string | null,
  ): Promise<void> {
    await updateDeckMutation.mutateAsync({
      deckId: deck!.id,
      expectedVersion,
      notes: nextNotes,
    });
    deckVersionRef.current = expectedVersion + 1;
    deckNoteLastSyncedRef.current = nextNotes ?? "";
    setDeckNoteConflict(null);
    await refreshDeck();
  }

  function handleReloadDeckNoteConflict() {
    if (!deckNoteConflict) {
      return;
    }
    setDeckNoteDraft(deckNoteConflict.latestNotes);
    deckNoteLastSyncedRef.current = deckNoteConflict.latestNotes;
    setDeckNoteConflict(null);
    toast.info("Loaded the latest presentation note.");
  }

  async function handleSaveDeckNote(options?: { forceOverwrite?: boolean }): Promise<boolean> {
    if (!deck) {
      return false;
    }
    const nextNotes = deckNoteDraft.trim() ? deckNoteDraft : null;
    if ((deck.notes ?? null) === nextNotes) {
      setDeckNoteConflict(null);
      setIsDeckNoteDialogOpen(false);
      return true;
    }

    setIsDeckNoteSaving(true);
    try {
      const initialExpectedVersion = (
        options?.forceOverwrite
          ? deckNoteConflict?.latestVersion
          : getExpectedDeckVersion()
      ) ?? getExpectedDeckVersion();
      try {
        await persistDeckNote(initialExpectedVersion, nextNotes);
      } catch (error) {
        if (!isConflictError(error)) {
          throw error;
        }

        const latestDetail = await readLatestDeckDetail();
        const latestVersion = Number((latestDetail as any)?.deck?.version);
        const latestNotes = typeof (latestDetail as any)?.deck?.notes === "string"
          ? String((latestDetail as any).deck.notes)
          : "";
        if (Number.isFinite(latestVersion) && latestVersion >= 0) {
          deckVersionRef.current = latestVersion;
        }

        if ((nextNotes ?? "") === latestNotes) {
          deckNoteLastSyncedRef.current = latestNotes;
          setDeckNoteConflict(null);
          setDeckNoteDraft(latestNotes);
        } else if (options?.forceOverwrite && Number.isFinite(latestVersion) && latestVersion >= 0) {
          try {
            await persistDeckNote(latestVersion, nextNotes);
          } catch (retryError) {
            if (!isConflictError(retryError)) {
              throw retryError;
            }
            const newestDetail = await readLatestDeckDetail();
            const newestVersion = Number((newestDetail as any)?.deck?.version);
            const newestNotes = typeof (newestDetail as any)?.deck?.notes === "string"
              ? String((newestDetail as any).deck.notes)
              : "";
            if (Number.isFinite(newestVersion) && newestVersion >= 0) {
              deckVersionRef.current = newestVersion;
            }
            setDeckNoteConflict({
              latestVersion: Number.isFinite(newestVersion) && newestVersion >= 0 ? newestVersion : null,
              latestNotes: newestNotes,
            });
            toast.error("Presentation note changed again before overwrite completed.");
            return false;
          }
        } else {
          setDeckNoteConflict({
            latestVersion: Number.isFinite(latestVersion) && latestVersion >= 0 ? latestVersion : null,
            latestNotes,
          });
          toast.error("Presentation note changed in another session. Review latest note or overwrite.");
          return false;
        }
      }
      setIsDeckNoteDialogOpen(false);
      toast.success("Presentation note saved.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save presentation note.");
      return false;
    } finally {
      setIsDeckNoteSaving(false);
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
    if (playbackTransitionFrameRef.current != null) {
      window.cancelAnimationFrame(playbackTransitionFrameRef.current);
      playbackTransitionFrameRef.current = null;
    }
    playbackTransitionSlideRef.current = null;
    setPlaybackSlideTransitionEntering(false);
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
    // Always start from the beginning so the entire deck plays through.
    const startIndex = 0;
    if (playbackTransitionFrameRef.current != null) {
      window.cancelAnimationFrame(playbackTransitionFrameRef.current);
      playbackTransitionFrameRef.current = null;
    }
    playbackTransitionSlideRef.current = null;
    setPlaybackSlideTransitionEntering(false);
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

      const hasSelection = selectedElementIds.length > 0 || selectedComponentSelectionIds.length > 0;
      const isPrimaryModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const code = event.code;
      const isCopyShortcut = isPrimaryModifier && (key === "c" || code === "KeyC");
      const isCutShortcut = isPrimaryModifier && (key === "x" || code === "KeyX");
      const isPasteShortcut = isPrimaryModifier && (key === "v" || code === "KeyV");
      const isUndoShortcut = isPrimaryModifier
        && !event.shiftKey
        && (key === "z" || code === "KeyZ");
      const isGroupShortcut = isPrimaryModifier
        && !event.shiftKey
        && (key === "g" || code === "KeyG");
      const isUngroupShortcut = isPrimaryModifier
        && event.shiftKey
        && (key === "g" || code === "KeyG");
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

      if (isGroupShortcut && totalRenderableSelectionCount > 1) {
        event.preventDefault();
        handleGroupSelection();
        return;
      }

      if (isUngroupShortcut && selectedComponentSelectionIds.length === 1 && selectedComponent && selectedComponentIsGroup) {
        event.preventDefault();
        handleDetachComponent(selectedComponent.id);
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
    selectedComponent,
    selectedComponentId,
    selectedComponentSelectionIds,
    selectedComponentIsGroup,
    selectedElementIds,
    totalRenderableSelectionCount,
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelection,
    handleDetachComponent,
    handleDuplicateSelection,
    handleGroupSelection,
    handleMoveSelection,
    handlePasteSelection,
    handleRedo,
    handleUndo,
  ]);

  useEffect(() => {
    if (playbackState !== "playing" || playbackPaused) {
      return;
    }

    // Read from the stable ref so memo recomputation of playbackSlides
    // (caused by draftContent / selectedSlideId changes) does NOT reset
    // the auto-advance timer.  The ref is always up-to-date because it is
    // assigned synchronously after the useMemo.
    const slides_ = playbackSlidesRef.current;
    const activeSlide = slides_[playbackSlideIndex];
    if (!activeSlide) {
      return;
    }

    const remainingMs = Math.max(0, activeSlide.durationMs - playbackSlideElapsedRef.current);
    const timeoutId = window.setTimeout(() => {
      const latestSlides = playbackSlidesRef.current;
      const isLastSlide = playbackSlideIndex >= latestSlides.length - 1;
      if (isLastSlide) {
        handleStopSlideshow();
        setExportMessage("Slideshow preview completed.");
        return;
      }
      // Reset elapsed BEFORE advancing so the next render's timer effect
      // reads 0 instead of the stale elapsed value from the finished slide.
      // Without this, remainingMs computes as 0 and every subsequent slide
      // fires immediately, cascading to handleStopSlideshow().
      playbackSlideElapsedRef.current = 0;
      setPlaybackSlideIndex((current) => Math.min(latestSlides.length - 1, current + 1));
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // playbackSlides intentionally excluded — we use playbackSlidesRef to avoid
    // timer resets when the memo recomputes during playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackPaused, playbackSlideIndex, playbackState]);

  useEffect(() => {
    if (playbackState !== "playing") {
      if (playbackProgressFrameRef.current != null) {
        window.cancelAnimationFrame(playbackProgressFrameRef.current);
        playbackProgressFrameRef.current = null;
      }
      playbackSlideStartedAtRef.current = null;
      playbackSlideElapsedRef.current = 0;
      setPlaybackSlideElapsedMs(0);
      return;
    }

    playbackSlideStartedAtRef.current = null;
    playbackSlideElapsedRef.current = 0;
    setPlaybackSlideElapsedMs(0);
  }, [playbackSlideIndex, playbackState]);

  useEffect(() => {
    if (playbackState !== "playing") {
      return;
    }

    const activeSlide = playbackSlidesRef.current[playbackSlideIndex];
    if (!activeSlide) {
      return;
    }

    if (playbackProgressFrameRef.current != null) {
      window.cancelAnimationFrame(playbackProgressFrameRef.current);
      playbackProgressFrameRef.current = null;
    }

    if (playbackPaused) {
      if (playbackSlideStartedAtRef.current != null) {
        const elapsed = clampNumber(
          window.performance.now() - playbackSlideStartedAtRef.current,
          0,
          activeSlide.durationMs,
        );
        playbackSlideElapsedRef.current = elapsed;
        setPlaybackSlideElapsedMs(elapsed);
      }
      playbackSlideStartedAtRef.current = null;
      return;
    }

    playbackSlideStartedAtRef.current = window.performance.now() - playbackSlideElapsedRef.current;

    const tick = (now: number) => {
      if (playbackSlideStartedAtRef.current == null) {
        return;
      }
      const elapsed = clampNumber(
        now - playbackSlideStartedAtRef.current,
        0,
        activeSlide.durationMs,
      );
      playbackSlideElapsedRef.current = elapsed;
      setPlaybackSlideElapsedMs(elapsed);
      if (elapsed >= activeSlide.durationMs) {
        playbackProgressFrameRef.current = null;
        return;
      }
      playbackProgressFrameRef.current = window.requestAnimationFrame(tick);
    };

    playbackProgressFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (playbackProgressFrameRef.current != null) {
        window.cancelAnimationFrame(playbackProgressFrameRef.current);
        playbackProgressFrameRef.current = null;
      }
    };
  }, [playbackPaused, playbackSlideIndex, playbackState]);

  useEffect(() => {
    if (playbackState !== "playing") {
      if (playbackTransitionFrameRef.current != null) {
        window.cancelAnimationFrame(playbackTransitionFrameRef.current);
        playbackTransitionFrameRef.current = null;
      }
      playbackTransitionSlideRef.current = null;
      setPlaybackSlideTransitionEntering(false);
      return;
    }

    const activeSlideId = playbackSlidesRef.current[playbackSlideIndex]?.slideId ?? null;
    if (activeSlideId == null) {
      return;
    }

    if (playbackTransitionSlideRef.current == null) {
      playbackTransitionSlideRef.current = activeSlideId;
      setPlaybackSlideTransitionEntering(false);
      return;
    }

    if (playbackTransitionSlideRef.current === activeSlideId) {
      return;
    }

    playbackTransitionSlideRef.current = activeSlideId;
    if (playbackTransitionFrameRef.current != null) {
      window.cancelAnimationFrame(playbackTransitionFrameRef.current);
      playbackTransitionFrameRef.current = null;
    }
    setPlaybackSlideTransitionEntering(true);
    playbackTransitionFrameRef.current = window.requestAnimationFrame(() => {
      setPlaybackSlideTransitionEntering(false);
      playbackTransitionFrameRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSlideIndex, playbackState]);

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
      if (playbackTransitionFrameRef.current != null) {
        window.cancelAnimationFrame(playbackTransitionFrameRef.current);
        playbackTransitionFrameRef.current = null;
      }
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
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <button
        type="button"
        className="mb-2 rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-left text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-200"
        onClick={() => setIsReorderDialogOpen(true)}
        aria-label="Open Reorder Slides Overview"
      >
        Browse all slides and drag cards to reorder quickly.
      </button>
      <div
        className="h-0 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
        data-testid="slides-panel-scroll-area"
      >
        {slides.map((slide) => {
          const cachedDraft = getCachedSlideDraft(slide.id);
          const slideContentForPreview = selectedSlideId === slide.id
            ? draftContent
            : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
          const isDraggingSlide = draggingSlideId === slide.id;
          const isDropTargetSlide =
            draggingSlideId !== null
            && slideDropTargetId === slide.id
            && draggingSlideId !== slide.id;
          const preview = summarizeSlidePreview(slideContentForPreview);
          const isVisualOnlySlide = slideContentForPreview.visualOnly === true;
          const slideBg = slideContentForPreview.background;
          const thumbnailBgStyle: React.CSSProperties = slideBg?.type === "color"
            ? { backgroundColor: slideBg.value }
            : slideBg?.type === "image"
              ? {
                  backgroundImage: `url(${slideBg.url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {};
          return (
            <button
              key={slide.id}
              type="button"
              className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${selectedSlideId === slide.id
                ? "border-sky-400 bg-sky-500/10 text-sky-800"
                : "border-slate-300 bg-white hover:border-slate-400"
                } ${isDraggingSlide ? "cursor-grabbing opacity-70 ring-2 ring-sky-300" : "cursor-grab"} ${isDropTargetSlide ? "border-sky-500 bg-sky-50" : ""}`}
              onClick={() => switchToSlide(slide.id)}
              draggable={!deckMutationBusy}
              onDragStart={(event) => handleSlideDragStart(slide.id, event)}
              onDragOver={(event) => handleSlideDragOver(slide.id, event)}
              onDrop={(event) => void handleSlideDrop(slide.id, event)}
              onDragEnd={handleSlideDragEnd}
              aria-label={`Select slide ${slide.orderIndex + 1}`}
              data-testid={`slide-preview-${slide.orderIndex + 1}`}
            >
              <div
                className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-slate-300 bg-slate-100"
                style={thumbnailBgStyle}
              >
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
                ) : preview.inlineSvgContent ? (
                  <div
                    className="h-full w-full"
                    data-testid={`slide-preview-inline-svg-${slide.orderIndex + 1}`}
                    style={{ color: preview.inlineSvgColor || "#ffffff" }}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(preview.inlineSvgContent.replace(/currentColor/g, preview.inlineSvgColor || "#ffffff"), { USE_PROFILES: { svg: true, svgFilters: true } }),
                    }}
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
                <div className="absolute left-1 top-1 flex flex-col items-start gap-1">
                  {(slide as any)?.audioTrack != null ? (
                    <span
                      className="flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                      title="Slide has audio"
                    >
                      <Music className="h-2.5 w-2.5" />
                    </span>
                  ) : null}
                  {isVisualOnlySlide ? (
                    <span
                      className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-950"
                      title="This slide is visual-only and does not show on-slide text"
                    >
                      NO TEXT
                    </span>
                  ) : null}
                </div>
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
                  {isVisualOnlySlide ? (
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      Visual-only slide
                    </p>
                  ) : null}
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
          variant="outline"
          className="col-span-2 gap-1"
          onClick={() => setIsReorderDialogOpen(true)}
          aria-label="Open Reorder Slides Overview"
          disabled={!slides.length || deckMutationBusy}
        >
          Reorder All
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
      <Button
        type="button"
        size="icon"
        variant={libraryTab === "blocks" ? "secondary" : "ghost"}
        className={`h-10 w-10 ${libraryTab === "blocks"
          ? "bg-sky-600 text-white hover:bg-sky-500"
          : "text-slate-300 hover:bg-slate-800"
          }`}
        onClick={() => setLibraryTab("blocks")}
        aria-label="Open Blocks Library"
      >
        <LayoutTemplate className="h-4 w-4" />
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
      blocksPanel={(
        <BlocksPanel
          onInsertPreset={handleInsertBlockPreset}
          onInsertComponent={handleInsertBuiltInComponent}
          customBlocks={customBlocks}
          onInsertCustomBlock={handleInsertCustomBlock}
          onDeleteCustomBlock={handleDeleteCustomBlock}
          onToggleFavoriteCustomBlock={handleToggleFavoriteCustomBlock}
          onTogglePinCustomBlock={handleTogglePinCustomBlock}
          onToggleTeamFeaturedCustomBlock={handleToggleTeamFeaturedCustomBlock}
          onTransferCustomBlockOwner={handleTransferCustomBlockOwner}
          onLibraryStateChange={setCustomBlockLibraryState}
        />
      )}
      onInsertAsset={(asset) => insertLibraryAsset(asset)}
      onDragAssetStart={handleDragAssetStart}
    />
  );
  const canvasToolbar = isMobileViewport ? (
    <MobileQuickActions
      mode={mobileGestures.state.mode}
      viewportScale={mobileGestures.state.viewport.scale}
      onToggleMode={handleToggleMobileMode}
      onFitViewport={handleFitMobileViewport}
      onCenterViewport={handleCenterMobileViewport}
      onResetViewport={handleResetMobileViewport}
      onNudgeSelection={handleMoveSelection}
      onDeleteSelection={handleDeleteSelection}
      hasSelection={selectedElementIds.length > 0 || selectedComponentSelectionIds.length > 0}
      canCenterViewport={mobileGestures.state.viewport.scale > 1}
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
          aria-label="Upload Image Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
          disabled={localUploadKind !== null}
        >
          {localUploadKind === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Upload Image
        </Button>
        <Button
          onClick={() => handleAddElement("video")}
          aria-label="Upload Video Element"
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
          disabled={localUploadKind !== null}
        >
          {localUploadKind === "video" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
          Upload Video
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
        {aiRecipePreviewDefinition && (
          <Button
            onClick={() => setIsAILayoutPreviewDialogOpen(true)}
            aria-label="AI Layout Preview"
            variant={isAILayoutPreviewDialogOpen ? "secondary" : "outline"}
            size="sm"
            className="gap-1 text-xs"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            AI Layout
          </Button>
        )}
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
        <Button
          onClick={handleGroupSelection}
          aria-label="Group Selection"
          title="Group selected items (Ctrl/Cmd+G)"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={totalRenderableSelectionCount < 2}
        >
          Group
        </Button>
        {selectedComponent && selectedComponentIsGroup ? (
          <Button
            onClick={() => handleDetachComponent(selectedComponent.id)}
            aria-label="Ungroup Selection"
            title="Ungroup selected group (Ctrl/Cmd+Shift+G)"
            variant="outline"
            size="sm"
            className="text-xs"
          >
            Ungroup
          </Button>
        ) : null}
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
      {selectedSlideVisualOnly ? (
        <span
          className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
          title="This slide is configured to hide on-slide text"
        >
          Slide mode: Visual-only
        </span>
      ) : null}
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
  const selectedSlideTransition: PresentationTransition = normalizeTransitionChoice(
    String(draftContent.transition ?? "fade"),
  );
  const canvasPropertiesPanel = (
    <label className={`rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 ${isMobileViewport ? "block space-y-2" : "flex items-center justify-between gap-2"}`}>
      <span className="font-medium">Canvas Size</span>
      <div className={`flex items-center gap-1.5 ${isMobileViewport ? "pt-1" : ""}`}>
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
  );
  const slidePropertiesPanel = (
    <div className="space-y-3">
      {selectedSlideVisualOnly ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Visual-only slide</p>
          <p className="mt-1 text-[11px] text-amber-700">
            This slide intentionally hides on-slide text and keeps image or video full-canvas.
          </p>
        </div>
      ) : null}
      {isMobileViewport ? (
        <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Slide Controls</p>
          <p className="mt-1 text-[11px] text-slate-500">Timing, transitions, and background for the current slide.</p>
        </div>
      ) : null}
      {showAILayoutPanel ? (
        <div className="rounded-md border border-sky-200 bg-sky-50/70 p-3" data-testid="ai-layout-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">AI Layout</p>
              {effectiveAILayoutMode ? (
                <p className="mt-1 text-[11px] text-sky-700" data-testid="ai-layout-mode-summary">
                  Current mode: {PRESENTATION_AI_LAYOUT_MODE_LABELS[effectiveAILayoutMode]}
                  {slideAIDesign?.modeLocked ? " · Locked" : ""}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-sky-700">
                Current block layout: {currentAILayoutRecipeId
                  ? (PRESENTATION_COMPONENT_AI_GUIDANCE[currentAILayoutRecipeId]?.label ?? currentAILayoutRecipeId)
                  : "Automatic fallback"}
              </p>
              {slideAIDesign?.selectionMode ? (
                <p className="mt-1 text-[11px] text-sky-700">
                  Selection mode: {slideAIDesign.selectionMode}
                </p>
              ) : null}
              {slideAIDesign?.selectionReason ? (
                <p className="mt-1 text-[11px] text-sky-700">
                  {formatAILayoutUserText(slideAIDesign.selectionReason)}
                </p>
              ) : null}
            </div>
            {slideAIDesign?.generatedAt ? (
              <span className="shrink-0 rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] text-sky-700">
                {new Date(slideAIDesign.generatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            ) : null}
          </div>
          {slideAIDesign?.fitScore ? (
            <div className="mt-3 rounded-md border border-sky-200 bg-white p-2" data-testid="ai-layout-fit-summary">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-sky-800">
                  {slideAIDesign.fitScore.status}
                </span>
                <span className="text-[11px] text-sky-800">
                  Fit {(slideAIDesign.fitScore.overall * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] text-sky-700">
                  Overflow {(slideAIDesign.fitScore.overflowRisk * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] text-sky-700">
                  Readability {(slideAIDesign.fitScore.readability * 100).toFixed(0)}%
                </span>
              </div>
              {aiLayoutCurrentModeCandidate?.reason ? (
                <p className="mt-2 text-[11px] text-sky-700">{aiLayoutCurrentModeCandidate.reason}</p>
              ) : null}
            </div>
          ) : null}
          {aiLayoutCandidateModes.length ? (
            <div className="mt-3 space-y-1" data-testid="ai-layout-candidate-modes">
              <p className="text-[11px] font-medium text-sky-800">Candidate modes</p>
              <div className="space-y-1">
                {aiLayoutCandidateModes.slice(0, 4).map((candidate) => (
                  <div
                    key={candidate.mode}
                    className="rounded-md border border-sky-200 bg-white px-2 py-1.5 text-[11px] text-sky-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {PRESENTATION_AI_LAYOUT_MODE_LABELS[candidate.mode]}
                      </span>
                      <span className="rounded-full border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
                        {candidate.fitStatus}
                      </span>
                      <span className="text-[10px] text-sky-600">
                        {candidate.score.toFixed(0)}
                      </span>
                      {candidate.blockedBy ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                          {PRESENTATION_AI_LAYOUT_BLOCKED_BY_LABELS[candidate.blockedBy] ?? candidate.blockedBy}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[10px] text-sky-700">{candidate.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {slideAIDesign?.candidateRecipes?.length ? (
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-medium text-sky-800">Candidate block layouts</p>
              <div className="flex flex-wrap gap-1.5">
                {slideAIDesign.candidateRecipes.slice(0, 4).map((candidate) => (
                  <span
                    key={candidate.recipeId}
                    className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] text-sky-700"
                  >
                    {PRESENTATION_COMPONENT_AI_GUIDANCE[candidate.recipeId as BuiltInPresentationComponentId]?.label ?? candidate.recipeId}
                    {" "}
                    {candidate.score.toFixed(0)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {aiRecipePreviewDefinition ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-sky-200 bg-white px-2 py-1.5">
              <span className="truncate text-[11px] font-medium text-sky-800">{aiRecipePreviewDefinition.label}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 border-sky-200 bg-white px-2 text-[11px] text-sky-800 hover:bg-sky-100"
                onClick={() => setIsAILayoutPreviewDialogOpen(true)}
              >
                <Maximize2 className="mr-1 h-3.5 w-3.5" />
                Preview Block
              </Button>
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label>
              <span className="text-[11px] font-medium text-sky-800">Preferred mode</span>
              <select
                aria-label="AI Layout Mode Override"
                className="mt-1 h-9 w-full rounded border border-sky-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                value={slideAIDesign?.userOverrideMode ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  handleSetAILayoutModeOverride(
                    nextValue
                      ? nextValue as PresentationAILayoutMode
                      : null,
                  );
                }}
              >
                <option value="">Auto</option>
                {PRESENTATION_AI_LAYOUT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {PRESENTATION_AI_LAYOUT_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-sky-700">
                Stored in slide metadata and reused by the next AI relayout pass.
              </p>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-[11px] text-sky-800">
              <input
                aria-label="Lock AI Layout Mode"
                type="checkbox"
                className="h-4 w-4 rounded border-sky-300"
                checked={Boolean(slideAIDesign?.modeLocked)}
                onChange={(event) => handleToggleAILayoutModeLock(event.target.checked)}
                disabled={!effectiveAILayoutMode}
              />
              <span>Lock current mode</span>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {["All", "Process", "Document", "Marketing", "Data", "Profile", "Storytelling"].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${aiBlockCategoryFilter === cat ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-700 hover:bg-sky-200"}`}
                onClick={() => setAiBlockCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="text-[11px] font-medium text-sky-800">Override block layout</span>
              <select
                aria-label="AI Layout Block Override"
                className="mt-1 h-9 w-full rounded border border-sky-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                value={aiRecipeOverrideChoice}
                onChange={(event) => setAiRecipeOverrideChoice(event.target.value as BuiltInPresentationComponentId)}
              >
                {filteredBlockPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              className="h-9"
              disabled={!aiRecipeOverrideChoice}
              onClick={() => {
                if (!aiRecipeOverrideChoice) {
                  return;
                }
                handleApplyAIRecipeOverride(aiRecipeOverrideChoice);
              }}
            >
              Rebuild AI Layout
            </Button>
          </div>
          {(aiLayoutFallbackPreview.length > 0 || Object.keys(aiLayoutSourceTraceSummary).length > 0 || slideAIDesign?.mediaModeMetadata) ? (
            <div className="mt-3 space-y-2">
              {aiLayoutFallbackPreview.length > 0 ? (
                <div className="rounded-md border border-sky-200 bg-white p-2" data-testid="ai-layout-fallback-history">
                  <p className="text-[11px] font-medium text-sky-800">Fallback history</p>
                  <div className="mt-1 space-y-1">
                    {aiLayoutFallbackPreview.map((entry, index) => (
                      <p key={`${entry.step}-${entry.timestamp}-${index}`} className="text-[10px] text-sky-700">
                        {entry.step}: {entry.reason}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {Object.keys(aiLayoutSourceTraceSummary).length > 0 ? (
                <div className="rounded-md border border-sky-200 bg-white p-2" data-testid="ai-layout-source-trace-summary">
                  <p className="text-[11px] font-medium text-sky-800">Source trace</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(aiLayoutSourceTraceSummary).map(([disposition, count]) => (
                      <span
                        key={disposition}
                        className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-700"
                      >
                        {disposition} {count}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {slideAIDesign?.mediaModeMetadata ? (
                <div className="rounded-md border border-sky-200 bg-white p-2" data-testid="ai-layout-media-mode-metadata">
                  <p className="text-[11px] font-medium text-sky-800">Media mode</p>
                  <p className="mt-1 text-[10px] text-sky-700">
                    Visual intent: {slideAIDesign.mediaModeMetadata.visualIntent ?? "n/a"}
                    {" · "}
                    Thai text risk: {slideAIDesign.mediaModeMetadata.thaiTextRisk ?? "n/a"}
                    {" · "}
                    Editable source retained: {slideAIDesign.mediaModeMetadata.editableSourceRetained ? "yes" : "no"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {reusableBuiltInComponent ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-sky-200 bg-white text-sky-800 hover:bg-sky-100"
                onClick={() => void handleSaveCurrentAIBlockAsCustom("private")}
                disabled={saveCustomBlockMutation.isPending}
              >
                Save as My Block
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200"
                onClick={() => void handleSaveCurrentAIBlockAsCustom("team")}
                disabled={saveCustomBlockMutation.isPending}
              >
                Save as Team Preset
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-md border border-slate-300 bg-white p-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Slide Timing</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Set seconds per slide, apply to current slide/all slides, or auto-fit to media/project audio.
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
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void handleFitProjectAudioDurationAllSlides()}
            disabled={!slides.length || !deckProjectAudioTrack || timingFitProjectAudioPending}
          >
            {timingFitProjectAudioPending ? "Fitting..." : "Auto: Fit Project Audio"}
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
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="slide-transition-picker" className="text-xs font-medium text-slate-700">
              Slide Transition
            </Label>
            <span className="text-[11px] text-slate-500">{selectedSlideTransition}</span>
          </div>
          <select
            id="slide-transition-picker"
            aria-label="Slide Transition"
            className="h-8 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none"
            value={selectedSlideTransition}
            onChange={(event) => applyTransitionToSelectedDraft(normalizeTransitionChoice(event.target.value))}
            disabled={!selectedSlide}
          >
            {PRESENTATION_TRANSITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void handleApplyTransitionAllSlides(selectedSlideTransition)}
            disabled={!slides.length || transitionApplyAllPending}
          >
            {transitionApplyAllPending ? "Applying..." : "Apply Transition All Slides"}
          </Button>
        </div>
      </div>
      {isMobileViewport ? (
        <PropertyPanel
          selectedElement={null}
          selectedElementCount={0}
          selectionHasMixedTypes={false}
          onPatchSelected={handlePatchSelectedElement}
          onPatchElementById={handlePatchElementById}
          slideBackground={draftContent.background}
          onSetSlideBackground={handleSetSlideBackground}
        />
      ) : null}
    </div>
  );
  const componentInspectorPanel = (
    <ComponentInspector
      components={draftComponents}
      selectedComponentId={selectedComponentId}
      onSelectComponent={handleSelectComponent}
      onUpdateTextSlot={handleUpdateComponentTextSlot}
      onUpdateImageSlot={handleUpdateComponentImageSlot}
      onUpdateVideoSlot={handleUpdateComponentVideoSlot}
      onUpdateListSlot={handleUpdateComponentListSlot}
      onDetachComponent={handleDetachComponent}
      onDeleteComponent={handleDeleteComponent}
    />
  );
  const componentCanvasOverlay = selectedComponent && selectedComponentBounds && (selectedComponentDefinition || selectedComponentIsGroup)
    ? ({ interactionScale }: { interactionScale: number }) => (
      <ComponentCanvasOverlay
        component={selectedComponent}
        componentLabel={selectedComponentDefinition?.label ?? "Group"}
        interactionScale={interactionScale}
        componentBounds={selectedComponentBounds}
        slotAreas={selectedComponentCanvasSlots}
        activeSlotId={selectedComponentSlotId}
        onSelectSlot={(slotId) => handleSelectComponentSlot(selectedComponent.id, slotId)}
        onClearSlot={() => setSelectedComponentSlotId(null)}
        onMoveComponent={handleMoveSelection}
        onResizeComponent={handleDragResize}
        onResizeSlot={handleDragResizeComponentSlot}
        onEndComponentDrag={handleDragEnd}
        onUpdateTextSlot={handleUpdateSelectedCanvasSlotText}
        onUpdateImageSlot={handleUpdateSelectedCanvasSlotImage}
        onUpdateVideoSlot={handleUpdateSelectedCanvasSlotVideo}
        onUpdateListSlot={handleUpdateSelectedCanvasSlotList}
        onSelectRawSlotElement={handleSelectRawComponentSlotElement}
        imageAssets={mergedImageLibraryAssets}
        videoAssets={mergedVideoLibraryAssets}
        onPickImageAsset={handlePickSelectedCanvasImageAsset}
        onPickVideoAsset={handlePickSelectedCanvasVideoAsset}
      />
    )
    : null;
  const elementPropertiesPanel = selectedElement ? (
    <div className="space-y-3">
      {componentInspectorPanel}
      <PropertyPanel
        selectedElement={selectedElement}
        selectedElementCount={selectedElementIds.length}
        selectionHasMixedTypes={selectionHasMixedTypes}
        onPatchSelected={handlePatchSelectedElement}
        onPatchElementById={handlePatchElementById}
        slideBackground={draftContent.background}
        onSetSlideBackground={handleSetSlideBackground}
        cropModeElementId={cropModeElementId}
        cropModeTarget={cropModeTarget}
        onToggleCropMode={handleToggleCropMode}
        onSetCropModeTarget={setCropModeTarget}
      />
    </div>
  ) : selectedComponent ? (
    componentInspectorPanel
  ) : (
    <div className="space-y-3">
      {componentInspectorPanel}
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
        Select an element or component to edit its content, style, and slots.
      </div>
    </div>
  );
  const mobilePropertiesSectionSwitcher = isMobileViewport ? (
    <div
      className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-100/90 p-1"
      role="tablist"
      aria-label="Mobile Property Sections"
    >
      {[
        { id: "element", label: "Element", disabled: !selectedElement && !selectedComponent },
        { id: "slide", label: "Slide", disabled: false },
        { id: "canvas", label: "Canvas", disabled: false },
      ].map((section) => {
        const isActive = mobilePropertiesSection === section.id;
        return (
          <Button
            key={section.id}
            type="button"
            size="sm"
            variant={isActive ? "default" : "ghost"}
            className="h-8 text-xs"
            role="tab"
            aria-selected={isActive}
            aria-label={`Mobile Properties Section ${section.label}`}
            disabled={section.disabled}
            onClick={() => setMobilePropertiesSection(section.id as MobilePropertiesSection)}
          >
            {section.label}
          </Button>
        );
      })}
    </div>
  ) : null;
  const propertyEditorPanel = (
    <div className="space-y-3">
      {mobilePropertiesSectionSwitcher}
      {isMobileViewport
        ? mobilePropertiesSection === "canvas"
          ? canvasPropertiesPanel
          : mobilePropertiesSection === "slide"
            ? slidePropertiesPanel
            : elementPropertiesPanel
        : canvasPropertiesPanel}
      {!isMobileViewport ? slidePropertiesPanel : null}
      {!isMobileViewport ? (
        <div
          className="rounded-md border border-slate-300 bg-slate-200/70 p-2"
          data-testid="canvas-stage-layer-interaction-overlay"
        >
          <TransformHandles
            compact
            disabled={!selectedElement && !selectedComponent}
            onMove={handleMoveSelection}
            onResize={handleResizeSelection}
            onAutoFit={selectedComponent ? handleAutoFitSelection : undefined}
            autoFitLabel={selectedComponentDefinition?.category === "Document" ? "Fit Canvas" : "Fit Width"}
            onRotate={handleRotateSelection}
            onArrange={handleArrangeSelection}
            currentWidth={selectedElement?.width ?? selectedComponentBounds?.width ?? 0}
            currentHeight={selectedElement?.height ?? selectedComponentBounds?.height ?? 0}
          />
        </div>
      ) : null}
      {!isMobileViewport ? elementPropertiesPanel : null}
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
      slideTitle={selectedSlide?.title ?? null}
      slideNote={selectedSlide?.notes ?? null}
      slideNoteDirty={slideNoteDirty}
      onSaveSlideNote={() => handleSaveSlide({ silent: true })}
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
      defaultExpanded={isTabletViewport}
      expanded={isMobileSheetExpanded}
      onExpandedChange={setIsMobileSheetExpanded}
    />
  ) : desktopInspectorPanel;
  const activePlaybackSlide = playbackState === "playing"
    ? (playbackSlides[playbackSlideIndex] || null)
    : null;
  const activePlaybackRenderableElements = activePlaybackSlide
    ? getRenderableSlideElements(activePlaybackSlide.content)
    : [];
  const activePlaybackTransition: PresentationTransition = normalizeTransitionChoice(
    String(activePlaybackSlide?.content.transition ?? "fade"),
  );
  const activePlaybackElapsedMs = activePlaybackSlide ? playbackSlideElapsedMs : 0;
  const activePlaybackSlideDurationMs = activePlaybackSlide?.durationMs ?? 3000;

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
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleLocalUploadInputChange("image", event)}
      />
      <input
        ref={videoUploadInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => handleLocalUploadInputChange("video", event)}
      />
      <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-100 scrollbar-none" style={{ scrollbarWidth: "none" }}>
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
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <div className="h-4 w-px shrink-0 bg-slate-700" />
        {isProjectTitleEditing ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Input
              value={projectTitleDraft}
              onChange={(event) => setProjectTitleDraft(event.target.value)}
              aria-label="Project Name"
              className="h-7 w-40 border-slate-700 bg-slate-900 text-sm text-slate-100 sm:w-52"
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
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="truncate text-sm font-semibold">{projectTitle}</h1>
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
            onClick={() => setIsDeckNoteDialogOpen(true)}
            aria-label="Open Presentation Note"
            variant="secondary"
            size="sm"
            className={`${isMobileViewport ? "h-8 w-8 px-0" : "gap-1"} bg-slate-800 text-slate-100 hover:bg-slate-700`}
            disabled={!deck || isDeckNoteSaving}
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Presentation Note</span>
          </Button>
          <Button
            onClick={() => setIsSlideNoteDialogOpen(true)}
            aria-label="Open Slide Note"
            variant="secondary"
            size="sm"
            className={`${isMobileViewport ? "h-8 w-8 px-0" : "gap-1"} bg-slate-800 text-slate-100 hover:bg-slate-700`}
            disabled={!selectedSlide}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Slide Note</span>
          </Button>
          <Button
            onClick={() => void handleSaveSlide()}
            aria-label="Save Slide"
            size="sm"
            className={`${isMobileViewport ? "h-8 w-8 px-0" : "gap-1"} bg-sky-600 text-white hover:bg-sky-500`}
            disabled={!deck || !selectedSlide || saveState === "pending"}
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button
            onClick={handlePlaySlideshow}
            aria-label="Play Slideshow"
            variant="secondary"
            size="sm"
            className={`${isMobileViewport ? "h-8 w-8 px-0" : "gap-1"} bg-slate-800 text-slate-100 hover:bg-slate-700`}
          >
            <Play className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Play</span>
          </Button>
          {isMobileViewport ? (
            <div className="relative" ref={mobileHeaderMenuRef}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                aria-label="More Actions"
                aria-haspopup="menu"
                aria-expanded={isMobileHeaderMenuOpen}
                onClick={() => setIsMobileHeaderMenuOpen((prev) => !prev)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {isMobileHeaderMenuOpen ? (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-xl"
                  role="menu"
                  aria-label="More Actions Menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setIsMobileHeaderMenuOpen(false);
                      void handleSaveToTemplate();
                    }}
                    disabled={!deck || saveAsTemplateMutation.isPending || isProjectTitleSaving}
                  >
                    <BookMarked className="mr-2 h-4 w-4" />
                    <span>Save to Template</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800"
                    onClick={() => {
                      setIsMobileHeaderMenuOpen(false);
                      setIsImportDialogOpen(true);
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    <span>Import</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setIsMobileHeaderMenuOpen(false);
                      setIsAutoLayoutDialogOpen(true);
                    }}
                    disabled={!deck || !selectedSlide || autoLayoutBusy}
                  >
                    {autoLayoutBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <WandSparkles className="mr-2 h-4 w-4" />
                    )}
                    <span>
                      {autoLayoutProgress
                        ? `Auto Layout ${autoLayoutProgress.done}/${autoLayoutProgress.total}`
                        : "Auto Layout"}
                    </span>
                  </button>
                  {isAIGenerationEnabled ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        setIsMobileHeaderMenuOpen(false);
                        setIsAIDraftModalOpen(true);
                      }}
                      disabled={!deck}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      <span>Draft with AI</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setIsMobileHeaderMenuOpen(false);
                      void handleResolvePendingMedia();
                    }}
                    disabled={!deck || pendingMediaJobCount <= 0 || resolvePendingMediaMutation.isPending}
                  >
                    {resolvePendingMediaMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="mr-2 h-4 w-4" />
                    )}
                    <span>Fetch Pending ({pendingMediaJobCount})</span>
                  </button>
                  <div className="my-1 h-px bg-slate-700" aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setIsMobileHeaderMenuOpen(false);
                      setIsExportDialogOpen(true);
                    }}
                    disabled={!isExportsEnabled || !deck}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    <span>Export</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setIsMobileHeaderMenuOpen(false);
                      handleOpenPlayMode();
                    }}
                    disabled={!deck}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    <span>Play Mode</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
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
            </>
          )}
          <HelpButton page="/presentation" variant="ghost" size="sm" className="shrink-0 text-slate-300 hover:bg-slate-800 hover:text-slate-100" />
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
              elements={renderableDraftElements}
              canvasSize={activeCanvasSize}
              selectedElementIds={selectedElementIds}
              activeElementIds={activeCanvasElementIds}
              snapGuides={commandState.snapGuides}
              showElementFrames={showElementFrames}
              suppressTransformHandles={isMobilePanMode || hasMixedRenderableSelection}
              showTransformDock={false}
              slideBackground={draftContent.background}
              viewport={activeViewport}
              onViewportChange={isMobileViewport ? handleMobileViewportChange : handleDesktopViewportChange}
              showViewportControls={!isMobileViewport}
              onSelectElement={handleSelectElement}
              onFocusElement={handleFocusElement}
              onMoveSelection={handleDragMove}
              onResizeSelection={handleDragResize}
              onRotateSelection={handleDragRotate}
              onDragEnd={handleDragEnd}
              onArrangeSelection={handleArrangeSelection}
              onDropAsset={handleCanvasDropAsset}
              onMarqueeSelect={handleMarqueeSelect}
              cropModeElementId={cropModeElementId}
              cropModeTarget={cropModeTarget}
              onAdjustMediaCrop={handleAdjustMediaCropById}
              onToggleCropMode={handleToggleCropMode}
              onSetCropModeTarget={setCropModeTarget}
              contentOverlay={componentCanvasOverlay}
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
              data-testid="slideshow-preview-transition-layer"
              className="relative overflow-hidden rounded-xl border border-slate-700 shadow-2xl transition-[opacity,transform,filter] ease-in-out"
              style={{
                ...getSlideshowPreviewTransitionStyle(activePlaybackTransition, playbackSlideTransitionEntering),
                transitionDuration: `${activePlaybackTransition === "cut" ? 0 : SLIDESHOW_PREVIEW_TRANSITION_DURATION_MS}ms`,
                width: `${playbackViewport.width}px`,
                height: `${playbackViewport.height}px`,
                backgroundColor: activePlaybackSlide.content.background?.type === "color"
                  ? activePlaybackSlide.content.background.value
                  : activePlaybackSlide.content.background?.type === "image"
                    ? "transparent"
                    : "#ffffff",
              }}
            >
              {activePlaybackSlide.content.background?.type === "image" && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `url(${activePlaybackSlide.content.background.url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                />
              )}
              {activePlaybackRenderableElements.map((element, index) =>
                renderReadonlySlideElement(
                  element,
                  index,
                  playbackCanvasSize.width,
                  playbackCanvasSize.height,
                  playbackRenderScale,
                  activePlaybackElapsedMs,
                  activePlaybackSlideDurationMs,
                ))}
            </div>
          </div>
        </div>
      ) : null}
      <Dialog open={isAILayoutPreviewDialogOpen} onOpenChange={setIsAILayoutPreviewDialogOpen}>
        <DialogContent
          className="flex max-h-[94vh] w-[min(96vw,1600px)] max-w-[min(96vw,1600px)] flex-col overflow-hidden"
          style={aiLayoutPreviewDialogDrag.dialogStyle}
        >
          <DialogHeader
            className={aiLayoutPreviewDialogDrag.isDragging ? "cursor-grabbing select-none" : "cursor-move select-none"}
            onMouseDown={aiLayoutPreviewDialogDrag.handleDragStart}
          >
            <DialogTitle>AI Layout Preview</DialogTitle>
            <DialogDescription>
              Review the rebuilt block layout in a larger canvas and apply block layout overrides without the narrow sidebar preview.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-sky-900">{aiRecipePreviewDefinition?.label ?? "Select a block layout"}</p>
                  {aiRecipeCanonicalPreviewQuery.data ? (
                    <p className="text-xs text-sky-700">
                      Canonical {aiRecipeCanonicalPreviewQuery.data.rendererVersion}
                      {" · "}
                      {aiRecipeCanonicalPreviewQuery.data.previewHash.slice(0, 8)}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-w-[260px] flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-1">
                    {["All", "Process", "Document", "Marketing", "Data", "Profile", "Storytelling"].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${aiBlockCategoryFilter === cat ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-700 hover:bg-sky-200"}`}
                        onClick={() => setAiBlockCategoryFilter(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-row items-end gap-2">
                  <label className="flex-1 sm:max-w-xs">
                    <span className="text-[11px] font-medium text-sky-800">Override block layout</span>
                    <select
                      aria-label="AI Layout Block Override Dialog"
                      className="mt-1 h-9 w-full rounded border border-sky-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                      value={aiRecipeOverrideChoice}
                      onChange={(event) => setAiRecipeOverrideChoice(event.target.value as BuiltInPresentationComponentId)}
                    >
                      {filteredBlockPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    className="h-9"
                    disabled={!aiRecipeOverrideChoice}
                    onClick={() => {
                      if (!aiRecipeOverrideChoice) {
                        return;
                      }
                      handleApplyAIRecipeOverride(aiRecipeOverrideChoice);
                    }}
                  >
                    Rebuild AI Layout
                  </Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-1">
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  disabled={aiPreviewZoom <= 0.25}
                  onClick={() => {
                    const next = Math.max(0.25, +(aiPreviewZoom - 0.25).toFixed(2));
                    setAiPreviewZoom(next);
                  }}
                  aria-label="Zoom out preview"
                >
                  -
                </button>
                <span className="min-w-[3.5rem] text-center text-xs text-slate-600">{Math.round(aiPreviewZoom * 100)}%</span>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  disabled={aiPreviewZoom >= 3}
                  onClick={() => { setAiPreviewZoom((z) => Math.min(3, +(z + 0.25).toFixed(2))); }}
                  aria-label="Zoom in preview"
                >
                  +
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                  onClick={() => { setAiPreviewZoom(1); setAiPreviewPan({ x: 0, y: 0 }); }}
                  aria-label="Reset preview zoom"
                >
                  Reset
                </button>
                <span className="ml-auto text-[10px] text-slate-400">Scroll to zoom, drag to pan</span>
              </div>
              <div
                ref={aiPreviewContainerRef}
                className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-slate-50"
                onWheel={(e) => {
                  if (!e.ctrlKey && !e.metaKey) return;
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  const nextZoom = Math.min(3, Math.max(0.25, +(aiPreviewZoom + delta).toFixed(2)));
                  setAiPreviewZoom(nextZoom);
                }}
              >
                {aiRecipePreviewDefinition ? (
                <div
                  className="flex min-h-full w-full items-center justify-center p-4"
                >
                  <div style={{ zoom: aiPreviewZoom, flexShrink: 0 }}>
                    {renderAILayoutPreview("dialog")}
                  </div>
                </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
                    Select a block layout above and click Rebuild AI Layout to preview.
                  </div>
                )}
              </div>
            </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isReorderDialogOpen}
        onOpenChange={(open) => {
          setIsReorderDialogOpen(open);
          if (!open) {
            resetSlideDragState();
          }
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Reorder Slides Overview</DialogTitle>
            <DialogDescription>
              Compact view for large decks. Drag any slide tile to set its new position.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
            {slides.length} slide(s) total
          </div>
          <div className="max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
              {slides.map((slide) => {
                const isDraggingSlide = draggingSlideId === slide.id;
                const isDropTargetSlide =
                  draggingSlideId !== null
                  && slideDropTargetId === slide.id
                  && draggingSlideId !== slide.id;
                const cachedDraft = getCachedSlideDraft(slide.id);
                const reorderContent = selectedSlideId === slide.id
                  ? draftContent
                  : cachedDraft?.content ?? ensureSlideContent(slide.slideContent);
                const reorderPreview = summarizeSlidePreview(reorderContent);
                const reorderBg = reorderContent.background;
                const reorderBgStyle: React.CSSProperties = reorderBg?.type === "color"
                  ? { backgroundColor: reorderBg.value }
                  : reorderBg?.type === "image"
                    ? {
                        backgroundImage: `url(${reorderBg.url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : {};
                return (
                  <button
                    key={`reorder-overview-${slide.id}`}
                    type="button"
                    draggable={!deckMutationBusy}
                    onDragStart={(event) => handleSlideDragStart(slide.id, event)}
                    onDragOver={(event) => handleSlideDragOver(slide.id, event)}
                    onDrop={(event) => void handleSlideDrop(slide.id, event)}
                    onDragEnd={handleSlideDragEnd}
                    onClick={() => switchToSlide(slide.id)}
                    className={`rounded border px-2 py-1.5 text-left transition ${selectedSlideId === slide.id
                      ? "border-sky-400 bg-sky-50 text-sky-800"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      } ${isDraggingSlide ? "cursor-grabbing opacity-70 ring-2 ring-sky-300" : "cursor-grab"} ${isDropTargetSlide ? "border-sky-500 bg-sky-100" : ""}`}
                    aria-label={`Reorder slide ${slide.orderIndex + 1}`}
                    data-testid={`reorder-slide-tile-${slide.orderIndex + 1}`}
                  >
                    <div
                      className="relative mb-1.5 aspect-[16/9] overflow-hidden rounded border border-slate-200 bg-slate-100"
                      style={reorderBgStyle}
                    >
                      {reorderPreview.mediaSrc && reorderPreview.mediaKind === "video" ? (
                        reorderPreview.mediaPosterSrc ? (
                          <img
                            src={reorderPreview.mediaPosterSrc}
                            alt={slide.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <video
                            src={reorderPreview.mediaSrc}
                            className="h-full w-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                          />
                        )
                      ) : reorderPreview.mediaSrc ? (
                        <img
                          src={reorderPreview.mediaSrc}
                          alt={slide.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : reorderPreview.inlineSvgContent ? (
                        <div
                          className="h-full w-full"
                          style={{ color: reorderPreview.inlineSvgColor || "#ffffff" }}
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(reorderPreview.inlineSvgContent.replace(/currentColor/g, reorderPreview.inlineSvgColor || "#ffffff"), { USE_PROFILES: { svg: true, svgFilters: true } }),
                          }}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[9px] text-slate-400">
                          No preview
                        </div>
                      )}
                      {reorderPreview.mediaKind === "video" ? (
                        <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 py-0.5 text-[8px] text-white">
                          VIDEO
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        #{slide.orderIndex + 1}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        v{slide.version}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{slide.title}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsReorderDialogOpen(false);
                resetSlideDragState();
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                <Label>Block layout</Label>
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
                    {PRESENTATION_BLOCK_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={`block:${preset.id}`}>
                        {preset.label}
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
              <div className="space-y-1.5">
                <Label>Support media clarity: {autoLayoutSupplementalMediaClarityPercent}%</Label>
                <Slider
                  min={5}
                  max={100}
                  step={1}
                  value={[autoLayoutSupplementalMediaClarityPercent]}
                  onValueChange={(value) => setAutoLayoutSupplementalMediaClarityPercent(value[0] ?? 16)}
                  disabled={autoLayoutBusy}
                />
                <p className="text-[11px] text-slate-500">
                  Controls opacity for supplemental background media when Auto Layout uses text-first block layouts.
                </p>
              </div>
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
                      emptyMessage={(
                        debouncedAutoLayoutWatermarkSearchQuery.length > 0
                          ? autoLayoutWatermarkSearchResultQuery.isLoading
                          : autoLayoutWatermarkListQuery.isLoading
                      )
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
            {(
              (autoLayoutScope === "current" && selectedSlideVisualOnly)
              || (autoLayoutScope === "all" && visualOnlySlideCount > 0)
            ) ? (
              <p className="text-xs text-amber-700">
                Visual-only slides keep text hidden during Auto Layout. Geometric crop and accent overlays are skipped for those slides.
              </p>
            ) : null}
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
                supplementalMediaClarityPercent: autoLayoutSupplementalMediaClarityPercent,
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
          staticMotionWarningSlideCount={staticExportMotionWarningSlideCount}
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
      <Dialog open={isDeckNoteDialogOpen} onOpenChange={setIsDeckNoteDialogOpen}>
        <DialogContent
          className="max-w-2xl"
          style={deckNoteDialogDrag.dialogStyle}
        >
          <DialogHeader
            className={deckNoteDialogDrag.isDragging ? "cursor-grabbing select-none" : "cursor-move select-none"}
            onMouseDown={deckNoteDialogDrag.handleDragStart}
          >
            <DialogTitle>Presentation Note</DialogTitle>
            <DialogDescription>
              Internal note for this presentation only. It is hidden from play mode and exports.
            </DialogDescription>
          </DialogHeader>
          {/* AI Layout from Deck Note */}
          <div className="rounded-md border border-dashed border-violet-300/50 bg-violet-50/30 dark:bg-violet-950/10">
            <button
              type="button"
              aria-expanded={deckLayoutGenOpen}
              aria-controls="deck-layout-gen-panel"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-violet-700 hover:bg-violet-50/50 dark:text-violet-400"
              onClick={() => setDeckLayoutGenOpen(!deckLayoutGenOpen)}
            >
              <span className="flex items-center gap-1.5">
                <WandSparkles className="h-3.5 w-3.5" />
                สร้าง Slides จาก Notes ด้วย AI
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${deckLayoutGenOpen ? "rotate-180" : ""}`} />
            </button>
            {deckLayoutGenOpen && (
              <div id="deck-layout-gen-panel" className="space-y-2.5 border-t border-violet-200/40 px-3 pb-3 pt-2">
                <p className="text-[11px] text-muted-foreground">
                  AI จะแยก notes เป็นหลาย slides พร้อมจัดหน้าสวยงามตาม preset ที่เลือก (ใช้เครดิตประมาณ 10 + 5/slide)
                </p>
                <div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">ธีมสไตล์</span>
                  <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {BUILT_IN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] transition-colors ${
                          deckLayoutGenPresetId === preset.id
                            ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/30"
                            : "border-slate-200 hover:border-violet-300 dark:border-slate-700"
                        }`}
                        aria-pressed={deckLayoutGenPresetId === preset.id}
                        aria-label={`เลือกธีม ${preset.nameLocalized?.th ?? preset.name}`}
                        onClick={() => setDeckLayoutGenPresetId(preset.id)}
                      >
                        <div className="flex gap-0.5">
                          <div className="h-3 w-3 rounded-sm" style={{ background: preset.colors.background, border: "1px solid #ddd" }} />
                          <div className="h-3 w-3 rounded-sm" style={{ background: preset.colors.primary }} />
                          <div className="h-3 w-3 rounded-sm" style={{ background: preset.colors.secondary }} />
                        </div>
                        <span className="truncate">{preset.nameLocalized?.th ?? preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="text-[11px] text-muted-foreground">จำนวน slides (ว่างไว้ = อัตโนมัติ)</span>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      placeholder="Auto"
                      className="mt-0.5 h-8 text-xs"
                      value={deckLayoutGenSlideCount}
                      onChange={(e) => setDeckLayoutGenSlideCount(e.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
                    disabled={!deckNoteDraft.trim() || deckLayoutGenBusy}
                    onClick={() => void handleGenerateLayoutFromDeckNote()}
                  >
                    {deckLayoutGenBusy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        กำลังสร้าง...
                      </>
                    ) : (
                      <>
                        <WandSparkles className="h-3.5 w-3.5" />
                        สร้าง Slides
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {deckNoteConflict
                  ? "Conflict detected"
                  : deckNoteDirty
                    ? "Unsaved changes"
                    : "Saved"}
              </span>
              <span>{deckNoteDraft.trim().length} chars</span>
            </div>
            {deckNoteConflict ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">A newer presentation note was saved elsewhere.</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-amber-800">
                  {deckNoteConflict.latestNotes || "Latest note is empty."}
                </p>
              </div>
            ) : null}
            <Textarea
              value={deckNoteDraft}
              onChange={(event) => setDeckNoteDraft(event.target.value)}
              placeholder="Write presentation-level notes here..."
              rows={14}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyTextToClipboard(deckNoteDraft, "Presentation note copied.")}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeckNoteDialogOpen(false)}
              disabled={isDeckNoteSaving}
            >
              Close
            </Button>
            {deckNoteConflict ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleReloadDeckNoteConflict}
                disabled={isDeckNoteSaving}
              >
                Reload Latest
              </Button>
            ) : null}
            {deckNoteConflict ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSaveDeckNote({ forceOverwrite: true })}
                disabled={!deck || isDeckNoteSaving}
              >
                Overwrite Note
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void handleSaveDeckNote()}
              disabled={!deck || isDeckNoteSaving}
            >
              {isDeckNoteSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isSlideNoteDialogOpen} onOpenChange={setIsSlideNoteDialogOpen}>
        <DialogContent
          className="max-w-2xl"
          style={slideNoteDialogDrag.dialogStyle}
        >
          <DialogHeader
            className={slideNoteDialogDrag.isDragging ? "cursor-grabbing select-none" : "cursor-move select-none"}
            onMouseDown={slideNoteDialogDrag.handleDragStart}
          >
            <DialogTitle>Slide Note</DialogTitle>
            <DialogDescription>
              Internal note for slide {selectedSlide ? selectedSlide.orderIndex + 1 : "-"}. It is hidden from play mode and exports.
            </DialogDescription>
          </DialogHeader>

          {/* AI Content Generator for slide note */}
          <div className="rounded-md border border-dashed border-teal-300/50 bg-teal-50/30 dark:bg-teal-950/10">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-teal-700 hover:bg-teal-50/50 dark:text-teal-400"
              onClick={() => setNoteGenOpen(!noteGenOpen)}
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI Content Generator
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${noteGenOpen ? "rotate-180" : ""}`} />
            </button>
            {noteGenOpen && (
              <div className="space-y-2.5 border-t border-teal-200/40 px-3 pb-3 pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Select a skill to generate or rewrite content for this slide. The output will replace the note below.
                </p>
                <select
                  className="h-8 w-full rounded border border-teal-200 bg-white px-2 text-xs text-slate-700 outline-none dark:bg-slate-900 dark:text-slate-200"
                  value={noteGenSkill}
                  onChange={(e) => setNoteGenSkill(e.target.value)}
                >
                  <option value="">Select a skill...</option>
                  {noteGenSkillItems.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="text-[11px] text-muted-foreground">Word limit (optional)</span>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      placeholder="e.g. 300"
                      className="mt-0.5 h-8 text-xs"
                      value={noteGenWordLimit}
                      onChange={(e) => setNoteGenWordLimit(e.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400"
                    disabled={!noteGenSkill || isGeneratingNoteContent}
                    onClick={() => void handleGenerateNoteContent()}
                  >
                    {isGeneratingNoteContent ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Generate Content
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* AI Layout Generator — preset selector */}
          <div className="rounded-md border border-dashed border-violet-300/50 bg-violet-50/30 dark:bg-violet-950/10">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-violet-700 hover:bg-violet-50/50 dark:text-violet-400"
              aria-expanded={layoutGenPresetOpen}
              aria-controls="slide-layout-gen-panel"
              onClick={() => setLayoutGenPresetOpen(!layoutGenPresetOpen)}
            >
              <span className="flex items-center gap-1.5">
                <WandSparkles className="h-3.5 w-3.5" />
                จัดหน้า Slide ด้วย AI
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${layoutGenPresetOpen ? "rotate-180" : ""}`} />
            </button>
            {layoutGenPresetOpen && (
              <div id="slide-layout-gen-panel" className="space-y-2.5 border-t border-violet-200/40 px-3 pb-3 pt-2">
                <p className="text-[11px] text-muted-foreground">
                  แปลง note ของ slide นี้ให้เป็น layout สวยงามตาม preset ที่เลือก (ใช้เครดิตประมาณ 50)
                </p>
                <div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">ธีมสไตล์</span>
                  <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {BUILT_IN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] transition-colors ${
                          layoutGenPresetId === preset.id
                            ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/30"
                            : "border-slate-200 hover:border-violet-300 dark:border-slate-700"
                        }`}
                        aria-pressed={layoutGenPresetId === preset.id}
                        aria-label={`เลือกธีม ${preset.nameLocalized?.th ?? preset.name}`}
                        onClick={() => setLayoutGenPresetId(preset.id)}
                      >
                        <div className="flex gap-0.5">
                          <div className="h-3 w-3 rounded-sm" style={{ background: preset.colors.background, border: "1px solid #ddd" }} />
                          <div className="h-3 w-3 rounded-sm" style={{ background: preset.colors.primary }} />
                          <div className="h-3 w-3 rounded-sm" style={{ background: preset.colors.secondary }} />
                        </div>
                        <span className="truncate">{preset.nameLocalized?.th ?? preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="w-full gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
                  disabled={!selectedSlide || layoutGenBusy || (!slideNoteDraft.trim() && !(selectedSlide?.notes ?? "").trim())}
                  onClick={() => void handleGenerateLayoutFromNote()}
                >
                  {layoutGenBusy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      กำลังจัดหน้า...
                    </>
                  ) : (
                    <>
                      <WandSparkles className="h-3.5 w-3.5" />
                      จัดหน้า Slide ด้วย AI
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{slideNoteDirty ? "Unsaved changes" : "Saved"}</span>
              <span>{slideNoteDraft.trim().length} chars</span>
            </div>
            <Textarea
              value={slideNoteDraft}
              onChange={(event) => setSlideNoteDraft(event.target.value)}
              placeholder="Write slide-level notes here, or use AI Content Generator above..."
              rows={14}
              disabled={!selectedSlide}
            />
            {slideNoteRepairBusy || layoutGenBusy ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{layoutGenBusy ? "กำลังจัดหน้า slide ด้วย AI..." : slideNoteRepairStatusLabel}</span>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyTextToClipboard(slideNoteDraft, "Slide note copied.")}
              disabled={!selectedSlide}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSlideNoteDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleRepairSlideFromNote()}
              disabled={!selectedSlide || slideNoteRepairBusy || layoutGenBusy || (!slideNoteDraft.trim() && !(selectedSlide?.notes ?? "").trim())}
            >
              {slideNoteRepairBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {slideNoteDirty ? "Save + Generate" : "Generate Slide"}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveSlide()}
              disabled={!selectedSlide || saveState === "pending"}
            >
              {saveState === "pending" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          onComplete={async ({ close }) => {
            await deckQuery.refetch();
            close();
          }}
        />
      )}
      {isMobileViewport && (
        <MobileDrawerPanel
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
          slidesPanel={slidesPanel}
          onAddElement={handleAddElement}
          onInsertBlockPreset={handleInsertBlockPreset}
          onInsertComponent={handleInsertBuiltInComponent}
          customBlocks={customBlocks}
          onInsertCustomBlock={handleInsertCustomBlock}
          snapLockEnabled={snapLockEnabled}
          onToggleSnapLock={() => setSnapLockEnabled((p) => !p)}
        />
      )}
    </div>
  );
}
