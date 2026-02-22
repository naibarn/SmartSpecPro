import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useLocation, useRoute } from "wouter";
import {
  Copy,
  Crop,
  ChevronLeft,
  Clapperboard,
  ImageIcon,
  Minus,
  Pause,
  MousePointer2,
  SkipBack,
  SkipForward,
  RectangleHorizontal,
  Redo2,
  RotateCw,
  Play,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  AssetLibraryPanel,
  CANVAS_LIBRARY_ASSET_DRAG_MIME,
  CanvasShell,
  CanvasStage,
  MobileBottomSheet,
  MobileQuickActions,
  PropertyPanel,
  TransformHandles,
  type AssetLibraryTab,
  type CanvasLibraryAsset,
  type CanvasStageDropAssetPayload,
  type MobileBottomSheetTab,
} from "@/presentation-canvas";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { buildWrongEditorOpenGuard } from "@/lib/presentationRouting";
import {
  createElement,
  ensureSlideContent,
  type ArrangeDirection,
  type PresentationElementType,
  type PresentationSlideContent,
} from "@/lib/presentationEditorState";
import { SelectionEngine } from "@/presentation-canvas/selection/SelectionEngine";
import { CommandBus } from "@/presentation-canvas/commands/CommandBus";
import { useMobileGestures } from "@/presentation-canvas/mobile/useMobileGestures";
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
  PRESENTATION_CONFLICT_SCHEMA_VERSION,
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ITEM_TYPE,
} from "@shared/presentation/constants";
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

interface LibraryResultItemLike {
  id?: number;
  title?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  poster_url?: string | null;
}

function getItemType(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }
  const value = (item as any).itemType ?? (item as any).item_type ?? "";
  return String(value);
}

function isNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || "");
  return message.includes(PRESENTATION_ERROR_CODE.NOT_FOUND);
}

function isConflictError(error: unknown): boolean {
  const cause = (error as any)?.cause || (error as any)?.data?.cause;
  if (cause?.conflictSchemaVersion === PRESENTATION_CONFLICT_SCHEMA_VERSION) {
    return true;
  }

  const message = String((error as any)?.message || "");
  return message.includes(PRESENTATION_ERROR_CODE.VERSION_CONFLICT);
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

function buildDraftSignature(
  slideId: number | null,
  content: PresentationSlideContent,
): string | null {
  if (!slideId) {
    return null;
  }

  return `${slideId}:${JSON.stringify(content)}`;
}

function normalizeLibraryMediaItems(
  rows: unknown,
  kind: LibraryMediaKind,
): CanvasLibraryAsset[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => row as LibraryResultItemLike)
    .filter((row) => typeof row.id === "number" && Number.isFinite(row.id))
    .map((row) => {
      const sourceUrl = String(row.source_url || "").trim();
      if (!sourceUrl) {
        return null;
      }

      const title = String(row.title || `${kind} #${row.id}`).trim() || `${kind} #${row.id}`;
      const thumbnailRaw = String(
        row.thumbnail_url
        || row.preview_url
        || row.poster_url
        || "",
      ).trim();
      return {
        id: row.id as number,
        kind,
        title,
        sourceUrl,
        thumbnailUrl: thumbnailRaw || (kind === "image" ? sourceUrl : null),
      } satisfies CanvasLibraryAsset;
    })
    .filter((value): value is CanvasLibraryAsset => Boolean(value));
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

function renderReadonlySlideElement(
  element: PresentationSlideContent["elements"][number],
  index: number,
  canvasWidth: number,
  canvasHeight: number,
): JSX.Element {
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
    return (
      <div key={element.id || `play-${index}`} className="absolute overflow-hidden" style={commonStyle}>
        <p
          className="h-full w-full whitespace-pre-wrap break-words p-2"
          style={{
            color: element.color || "#111827",
            backgroundColor: element.backgroundColor || "transparent",
            fontSize,
            fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
            fontWeight: element.fontWeight || "600",
            fontStyle: element.fontStyle || "normal",
            textDecoration: element.textDecoration || "none",
            textAlign: element.textAlign || "left",
            lineHeight,
            letterSpacing: `${letterSpacing}px`,
          }}
        >
          {element.text || "Text"}
        </p>
      </div>
    );
  }

  if (element.type === "image") {
    return (
      <div key={element.id || `play-${index}`} className="absolute overflow-hidden bg-slate-100" style={commonStyle}>
        {element.src ? (
          <img src={element.src} alt={element.alt || "Image"} className="h-full w-full object-contain" />
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

export default function PresentationEditor() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
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
  const addSlideMutation = trpc.presentation.addSlide.useMutation();
  const duplicateSlideMutation = trpc.presentation.duplicateSlide.useMutation();
  const deleteSlideMutation = trpc.presentation.deleteSlide.useMutation();
  const reorderSlidesMutation = trpc.presentation.reorderSlides.useMutation();
  const updateSlideMutation = trpc.presentation.updateSlide.useMutation();
  const triggerExportMutation = trpc.presentation.triggerExport.useMutation();

  const deckData = deckQuery.data as any;
  const deck = deckData?.deck;
  const slides = useMemo(() => {
    const raw = Array.isArray(deckData?.slides) ? deckData.slides : [];
    return [...raw].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [deckData?.slides]);

  const [selectedSlideId, setSelectedSlideId] = useState<number | null>(null);
  const [commandState, setCommandState] = useState<CanvasCommandState>(() =>
    createCanvasCommandState({ elements: [] }),
  );
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
  const [lastExportId, setLastExportId] = useState<string | null>(null);
  const [autoDeckInitAttempted, setAutoDeckInitAttempted] = useState(false);
  const [autoDeckInitPending, setAutoDeckInitPending] = useState(false);
  const [autoDeckInitError, setAutoDeckInitError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => window.innerWidth < 768);
  const [mobileSheetTab, setMobileSheetTab] = useState<MobileBottomSheetTab>("Properties");
  const [libraryTab, setLibraryTab] = useState<AssetLibraryTab>("slides");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [desktopViewport, setDesktopViewport] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const mobileGestures = useMobileGestures();

  const slideshowQuery = trpc.presentation.getSlideshow.useQuery(
    { deckId: deck?.id || 0 },
    {
      enabled: Boolean(deck?.id),
    },
  );
  const exportStatusQuery = trpc.presentation.getExportStatus.useQuery(
    { exportId: lastExportId || "" },
    {
      enabled: Boolean(lastExportId),
      refetchInterval: 5000,
    },
  );

  const imageLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: librarySearchQuery.trim() || undefined,
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
        && libraryTab === "photos",
      ),
    },
  );

  const videoLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: librarySearchQuery.trim() || undefined,
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
        && libraryTab === "videos",
      ),
    },
  );

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) || null,
    [slides, selectedSlideId],
  );
  const draftContent = commandState.content;
  const selectedElementIds = commandState.selectedElementIds;
  const selectedElementId = selectedElementIds[0] ?? null;
  const draftSignature = useMemo(
    () => buildDraftSignature(selectedSlide?.id ?? null, draftContent),
    [draftContent, selectedSlide?.id],
  );
  const isMobilePanMode = isMobileViewport && mobileGestures.state.mode === "pan_mode";
  const selectedElement = useMemo(
    () => draftContent.elements.find((element) => element.id === selectedElementId) || null,
    [draftContent.elements, selectedElementId],
  );
  const imageLibraryAssets = useMemo(
    () => normalizeLibraryMediaItems(imageLibraryQuery.data?.results, "image"),
    [imageLibraryQuery.data?.results],
  );
  const videoLibraryAssets = useMemo(
    () => normalizeLibraryMediaItems(videoLibraryQuery.data?.results, "video"),
    [videoLibraryQuery.data?.results],
  );
  const currentLibraryAssets = libraryTab === "videos" ? videoLibraryAssets : imageLibraryAssets;
  const libraryLoading = libraryTab === "videos"
    ? videoLibraryQuery.isLoading
    : imageLibraryQuery.isLoading;
  const activeCanvasSize = useMemo(
    () => normalizeCanvasSize(draftContent.canvas),
    [draftContent.canvas],
  );
  const playbackSlides = useMemo(() => {
    return slides.map((slide) => {
      const content = selectedSlideId === slide.id
        ? draftContent
        : ensureSlideContent(slide.slideContent);
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
      setIsMobileViewport(window.innerWidth < 768);
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
    if (!selectedSlide) {
      const empty = createCanvasCommandState({ elements: [] });
      commandBusRef.current.reset(empty);
      setCommandState(empty);
      setSaveState("idle");
      setExpectedSlideVersion(null);
      setConflictPolicy(releaseStaleBlock());
      return;
    }

    const next = ensureSlideContent(selectedSlide.slideContent);
    const nextSelected = next.elements[0]?.id ? [next.elements[0].id] : [];
    const nextState = createCanvasCommandState(next, nextSelected);
    commandBusRef.current.reset(nextState);
    setCommandState(nextState);
    setSaveState("idle");
    setExpectedSlideVersion(selectedSlide.version);
    setConflictPolicy(releaseStaleBlock());
  }, [selectedSlide?.id, selectedSlide?.version]);

  async function refreshDeck() {
    if (typeof deckQuery.refetch === "function") {
      await deckQuery.refetch();
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
        setSelectedSlideId(createdSlideId);
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
      setSelectedSlideId(duplicatedSlideId);
    }
  }

  async function handleDeleteSlide() {
    if (!deck || !selectedSlide) return;
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

  function handleSelectElement(elementId: string, options?: { additive?: boolean }) {
    if (options?.additive) {
      const toggled = SelectionEngine.toggle(
        { selectedIds: selectedElementIds, activeId: selectedElementId },
        elementId,
      );
      executeCommand(selectElementsCommand(toggled.selectedIds));
      return;
    }

    executeCommand(selectElementsCommand([elementId]));
  }

  function handlePatchSelectedElement(patch: Parameters<typeof patchSelectedElementCommand>[0]) {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    executeCommand(patchSelectedElementCommand(patch));
  }

  function handleMoveSelection(deltaX: number, deltaY: number) {
    if (!isTouchActionAllowed(40)) {
      return;
    }

    executeCommand(moveSelectionCommand(deltaX, deltaY));
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

    try {
      const nextSlide = await updateSlideMutation.mutateAsync({
        deckId: deck.id,
        slideId: selectedSlide.id,
        expectedVersion: version,
        saveMode,
        title: selectedSlide.title,
        slideContent: draftContent,
      });

      const returnedVersion = Number((nextSlide as any)?.version);
      setExpectedSlideVersion(
        Number.isFinite(returnedVersion)
          ? returnedVersion
          : version + 1,
      );
      setConflictPolicy(registerSaveSuccess());
      setSaveState("saved");

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
      if (isConflictError(error)) {
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

  async function handleSaveSlide() {
    const result = await performSave("manual");
    if (result === "saved") {
      autosaveController.markPersisted(draftSignature);
      await refreshDeck();
    }
  }

  function handleStopSlideshow() {
    setPlaybackState("idle");
    setPlaybackPaused(false);
    setPlaybackSlideIndex(0);
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
    setPlaybackState("playing");
    setExportMessage(`Playing slideshow preview with ${slideCount} slides.`);
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

      if (isPrimaryModifier && (key === "=" || key === "+")) {
        event.preventDefault();
        updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP);
        return;
      }

      if (isPrimaryModifier && key === "-") {
        event.preventDefault();
        updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP);
        return;
      }

      if (isPrimaryModifier && key === "0") {
        event.preventDefault();
        updateDesktopZoom(1);
        return;
      }

      if (isPrimaryModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (isPrimaryModifier && key === "y") {
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
  }, [desktopViewport.scale, isMobileViewport, playbackState, selectedElementIds, handleDeleteSelection, handleDuplicateSelection, handleMoveSelection, handleRedo, handleUndo]);

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

  const documentManagementHref = docId
    ? `/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=${docId}`
    : "/document-management";

  function handleBackToDocumentManagement() {
    setLocation(documentManagementHref);
  }

  async function handleReloadLatestSlide() {
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
        <Button variant="outline" size="sm" onClick={handleBackToDocumentManagement}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Document Management
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
    <>
      <div className="space-y-2">
        {slides.map((slide) => {
          const preview = summarizeSlidePreview(
            selectedSlideId === slide.id ? draftContent : slide.slideContent,
          );
          return (
            <button
              key={slide.id}
              type="button"
              className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${
                selectedSlideId === slide.id
                  ? "border-sky-400 bg-sky-500/10 text-sky-800"
                  : "border-slate-300 bg-white hover:border-slate-400"
              }`}
              onClick={() => setSelectedSlideId(slide.id)}
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
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void handleAddSlide()} aria-label="Add Slide" disabled={deckMutationBusy}>
          Add Slide
        </Button>
        <Button onClick={() => void handleDuplicateSlide()} aria-label="Duplicate Slide" variant="secondary" disabled={deckMutationBusy}>
          Duplicate Slide
        </Button>
        <Button onClick={() => void handleMoveSlide("up")} aria-label="Move Slide Up" variant="outline" disabled={deckMutationBusy}>
          Move Up
        </Button>
        <Button onClick={() => void handleMoveSlide("down")} aria-label="Move Slide Down" variant="outline" disabled={deckMutationBusy}>
          Move Down
        </Button>
        <Button
          onClick={() => void handleDeleteSlide()}
          aria-label="Delete Slide"
          variant="destructive"
          className="col-span-2"
          disabled={deckMutationBusy}
        >
          Delete Slide
        </Button>
      </div>
    </>
  );
  const editorToolRail = (
    <div className="flex h-full flex-col items-center gap-2 pt-2">
      <Button
        type="button"
        size="icon"
        variant={libraryTab === "slides" ? "secondary" : "ghost"}
        className={`h-10 w-10 ${
          libraryTab === "slides"
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
        className={`h-10 w-10 ${
          libraryTab === "photos"
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
        className={`h-10 w-10 ${
          libraryTab === "videos"
            ? "bg-sky-600 text-white hover:bg-sky-500"
            : "text-slate-300 hover:bg-slate-800"
        }`}
        onClick={() => setLibraryTab("videos")}
        aria-label="Open Videos Library"
      >
        <Clapperboard className="h-4 w-4" />
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
      onInsertAsset={(asset) => insertLibraryAsset(asset)}
      onDragAssetStart={handleDragAssetStart}
    />
  );
  const canvasToolbar = isMobileViewport ? (
    <div className="space-y-2">
      <MobileQuickActions
        mode={mobileGestures.state.mode}
        onToggleMode={handleToggleMobileMode}
        onNudgeSelection={handleMoveSelection}
        onDeleteSelection={handleDeleteSelection}
        disabled={!selectedElementId}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => handleAddElement("text")} variant="secondary">
          Add Text
        </Button>
        <Button onClick={() => handleAddElement("image")} variant="secondary">
          Add Image
        </Button>
        <Button onClick={() => handleAddElement("video")} variant="secondary">
          Add Video
        </Button>
        <Button onClick={handleApplyMobilePanGesture} variant="outline" className="col-span-2">
          Simulate Pinch + Pan
        </Button>
      </div>
    </div>
  ) : (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => handleAddElement("text")}
          aria-label="Add Text Element"
          variant="secondary"
          className="gap-1"
        >
          <Type className="h-4 w-4" />
          Add Text Element
        </Button>
        <Button
          onClick={() => handleAddElement("image")}
          aria-label="Add Image Element"
          variant="secondary"
          className="gap-1"
        >
          <ImageIcon className="h-4 w-4" />
          Add Image Element
        </Button>
        <Button
          onClick={() => handleAddElement("video")}
          aria-label="Add Video Element"
          variant="secondary"
          className="gap-1"
        >
          <Clapperboard className="h-4 w-4" />
          Add Video Element
        </Button>
        <Button
          onClick={() => handleAddElement("rect")}
          aria-label="Add Rectangle Element"
          variant="secondary"
          className="gap-1"
        >
          <RectangleHorizontal className="h-4 w-4" />
          Add Rectangle
        </Button>
        <Button
          onClick={() => handleAddElement("line")}
          aria-label="Add Line Element"
          variant="secondary"
          className="gap-1"
        >
          <Minus className="h-4 w-4" />
          Add Line
        </Button>
        <label className="ml-auto flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
          <Crop className="h-3.5 w-3.5" />
          <span>Canvas</span>
          <select
            aria-label="Canvas Aspect Ratio"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none"
            value={activeCanvasSize.preset}
            onChange={(event) => handleChangeCanvasPreset(event.target.value)}
          >
            {PRESENTATION_CANVAS_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-1 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-slate-200 hover:bg-slate-800"
            aria-label="Zoom Out"
            onClick={() => updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP)}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            className="min-w-[54px] rounded px-1 text-center text-xs text-slate-300"
            aria-label="Canvas Zoom Percentage"
            onClick={() => updateDesktopZoom(1)}
          >
            {Math.round(desktopViewport.scale * 100)}%
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-slate-200 hover:bg-slate-800"
            aria-label="Zoom In"
            onClick={() => updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP)}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-2">
        <Button onClick={handleUndo} aria-label="Undo Edit" variant="outline" className="gap-1">
          <Undo2 className="h-4 w-4" />
          Undo
        </Button>
        <Button onClick={handleRedo} aria-label="Redo Edit" variant="outline" className="gap-1">
          <Redo2 className="h-4 w-4" />
          Redo
        </Button>
        <Button onClick={handleDuplicateSelection} aria-label="Duplicate Selection" variant="outline" className="gap-1">
          <Copy className="h-4 w-4" />
          Duplicate Selection
        </Button>
        <Button onClick={handleDeleteSelection} aria-label="Delete Selection" variant="outline" className="gap-1">
          <Trash2 className="h-4 w-4" />
          Delete Selection
        </Button>
        <Button onClick={() => handleRotateSelection(15)} aria-label="Rotate Selection" variant="outline" className="gap-1">
          <RotateCw className="h-4 w-4" />
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
  const basePropertiesPanel = (
    <div className="space-y-3">
      {!isMobileViewport ? (
        <label className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
          <span className="font-medium">Canvas Size</span>
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
        </label>
      ) : null}
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
        onPatchSelected={handlePatchSelectedElement}
      />
    </div>
  );

  const mobileBottomSheetBody =
    mobileSheetTab === "Properties"
      ? basePropertiesPanel
      : mobileSheetTab === "Add"
        ? (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => handleAddElement("text")} variant="secondary">Text</Button>
            <Button onClick={() => handleAddElement("image")} variant="secondary">Image</Button>
            <Button onClick={() => handleAddElement("video")} variant="secondary">Video</Button>
            <Button onClick={() => handleAddElement("rect")} variant="secondary">Shape</Button>
            <Button onClick={() => handleAddElement("line")} variant="secondary">Line</Button>
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
          : slidesPanel;

  const propertiesPanel = isMobileViewport ? (
    <MobileBottomSheet
      activeTab={mobileSheetTab}
      onTabChange={setMobileSheetTab}
      body={mobileBottomSheetBody}
    />
  ) : basePropertiesPanel;
  const activePlaybackSlide = playbackState === "playing"
    ? (playbackSlides[playbackSlideIndex] || null)
    : null;
  const playbackCanvasSize = normalizeCanvasSize(activePlaybackSlide?.content.canvas);
  const playbackViewport = (() => {
    const maxWidth = Math.max(320, window.innerWidth * 0.92);
    const maxHeight = Math.max(240, window.innerHeight * 0.8);
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

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6 space-y-3">
      <header className="rounded-xl border border-slate-300 bg-slate-950 px-4 py-2 text-slate-100 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleBackToDocumentManagement}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to Document Management
            </Button>
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">Presentation Editor</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void handleSaveSlide()} aria-label="Save Slide" className="gap-1">
              Save
            </Button>
            <Button onClick={handlePlaySlideshow} aria-label="Play Slideshow" variant="secondary" className="gap-1">
              <Play className="h-4 w-4" />
              Play
            </Button>
            <Button onClick={() => void handleExport("png")} aria-label="Export PNG" variant="secondary">
              PNG
            </Button>
            <Button onClick={() => void handleExport("mp4")} aria-label="Export MP4" variant="secondary">
              MP4
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-300">
          Presentation #{docId} loaded. Item type: <code>{itemType || PRESENTATION_ITEM_TYPE}</code>
        </p>
      </header>

      <CanvasShell
        slidesPanel={slidesPanel}
        toolRail={isMobileViewport ? undefined : editorToolRail}
        assetPanel={isMobileViewport ? undefined : assetPanel}
        canvasToolbar={canvasToolbar}
        canvasStage={(
          <CanvasStage
            elements={draftContent.elements}
            canvasSize={activeCanvasSize}
            selectedElementIds={selectedElementIds}
            snapGuides={commandState.snapGuides}
            suppressTransformHandles={isMobilePanMode}
            showTransformDock={isMobileViewport}
            viewport={activeViewport}
            onViewportChange={isMobileViewport ? undefined : handleDesktopViewportChange}
            onSelectElement={handleSelectElement}
            onMoveSelection={handleMoveSelection}
            onResizeSelection={handleResizeSelection}
            onRotateSelection={handleRotateSelection}
            onArrangeSelection={handleArrangeSelection}
            onDropAsset={handleCanvasDropAsset}
          />
        )}
        canvasFooter={canvasFooter}
        propertiesPanel={propertiesPanel}
      />
      {activePlaybackSlide ? (
        <div
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
          <div className="grid flex-1 place-items-center">
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
                ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
