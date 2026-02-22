import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft } from "lucide-react";

import {
  CanvasShell,
  CanvasStage,
  MobileBottomSheet,
  MobileQuickActions,
  PropertyPanel,
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
  type CanvasCommandState,
} from "@/presentation-canvas/commands/commands";
import { trackAutosaveResult } from "@/lib/analytics/presentationEvents";
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
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportWarnings, setExportWarnings] = useState<PresentationExportWarning[]>([]);
  const [lastExportId, setLastExportId] = useState<string | null>(null);
  const [autoDeckInitAttempted, setAutoDeckInitAttempted] = useState(false);
  const [autoDeckInitPending, setAutoDeckInitPending] = useState(false);
  const [autoDeckInitError, setAutoDeckInitError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => window.innerWidth < 768);
  const [mobileSheetTab, setMobileSheetTab] = useState<MobileBottomSheetTab>("Properties");
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

  function syncCommandState(next: CanvasCommandState) {
    setCommandState(next);
    setSaveState("idle");
  }

  function executeCommand(command: Parameters<CommandBus<CanvasCommandState>["execute"]>[0]) {
    syncCommandState(commandBusRef.current.execute(command));
  }

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
    await addSlideMutation.mutateAsync({
      deckId: deck.id,
      expectedVersion: deck.version,
      title: `Slide ${(deck.slideCount || slides.length) + 1}`,
      slideContent: { elements: [] },
    });
    await refreshDeck();
  }

  async function handleDuplicateSlide() {
    if (!deck || !selectedSlide) return;
    await duplicateSlideMutation.mutateAsync({
      deckId: deck.id,
      expectedVersion: deck.version,
      slideId: selectedSlide.id,
      targetIndex: selectedSlide.orderIndex + 1,
    });
    await refreshDeck();
  }

  async function handleDeleteSlide() {
    if (!deck || !selectedSlide) return;
    await deleteSlideMutation.mutateAsync({
      deckId: deck.id,
      slideId: selectedSlide.id,
      expectedVersion: deck.version,
    });
    await refreshDeck();
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

    await reorderSlidesMutation.mutateAsync({
      deckId: deck.id,
      movedSlideId: selectedSlide.id,
      targetIndex,
      expectedVersion: deck.version,
    });
    await refreshDeck();
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

  function handlePlaySlideshow() {
    const slideCount = Array.isArray(slideshowQuery.data?.slides)
      ? slideshowQuery.data.slides.length
      : slides.length;
    if (!slideCount) {
      setPlaybackState("idle");
      setExportMessage("No slides available for playback.");
      return;
    }
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
  }, [isMobileViewport, selectedElementIds, handleDeleteSelection, handleDuplicateSelection, handleMoveSelection, handleRedo, handleUndo]);

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
  const playbackStatusLabel = playbackState === "playing" ? "Playing preview" : "Ready";
  const exportStatusLabel =
    exportStatusQuery.data?.status
    || (triggerExportMutation.isPending ? "queued" : "idle");
  const slidesPanel = (
    <>
      <div className="space-y-2">
        {slides.map((slide) => (
          <button
            key={slide.id}
            type="button"
            className={`w-full rounded border px-2 py-1 text-left text-sm ${
              selectedSlideId === slide.id ? "border-primary bg-primary/10" : ""
            }`}
            onClick={() => setSelectedSlideId(slide.id)}
            aria-label={`Select slide ${slide.orderIndex + 1}`}
          >
            {slide.orderIndex + 1}. {slide.title}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void handleAddSlide()} aria-label="Add Slide">
          Add Slide
        </Button>
        <Button onClick={() => void handleDuplicateSlide()} aria-label="Duplicate Slide" variant="secondary">
          Duplicate Slide
        </Button>
        <Button onClick={() => void handleMoveSlide("up")} aria-label="Move Slide Up" variant="outline">
          Move Up
        </Button>
        <Button onClick={() => void handleMoveSlide("down")} aria-label="Move Slide Down" variant="outline">
          Move Down
        </Button>
        <Button
          onClick={() => void handleDeleteSlide()}
          aria-label="Delete Slide"
          variant="destructive"
          className="col-span-2"
        >
          Delete Slide
        </Button>
      </div>
    </>
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
        <Button onClick={handleApplyMobilePanGesture} variant="outline" className="col-span-2">
          Simulate Pinch + Pan
        </Button>
      </div>
    </div>
  ) : (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => handleAddElement("text")}
          aria-label="Add Text Element"
          variant="secondary"
        >
          Add Text Element
        </Button>
        <Button onClick={() => handleAddElement("image")} aria-label="Add Image Element" variant="secondary">
          Add Image Element
        </Button>
        <Button onClick={() => handleAddElement("rect")} aria-label="Add Rectangle Element" variant="secondary">
          Add Rectangle
        </Button>
        <Button onClick={() => handleAddElement("line")} aria-label="Add Line Element" variant="secondary">
          Add Line
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleUndo} aria-label="Undo Edit" variant="outline">
          Undo
        </Button>
        <Button onClick={handleRedo} aria-label="Redo Edit" variant="outline">
          Redo
        </Button>
        <Button onClick={handleDuplicateSelection} aria-label="Duplicate Selection" variant="outline">
          Duplicate Selection
        </Button>
        <Button onClick={handleDeleteSelection} aria-label="Delete Selection" variant="outline">
          Delete Selection
        </Button>
      </div>
    </div>
  );
  const canvasFooter = (
    <>
      <Button onClick={() => void handleSaveSlide()} aria-label="Save Slide">
        Save Slide
      </Button>
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button onClick={handlePlaySlideshow} aria-label="Play Slideshow" variant="outline">
          Play Slideshow
        </Button>
        <Button onClick={() => void handleExport("png")} aria-label="Export PNG" variant="secondary">
          Export PNG
        </Button>
        <Button onClick={() => void handleExport("mp4")} aria-label="Export MP4" variant="secondary">
          Export MP4
        </Button>
      </div>
    </>
  );
  const basePropertiesPanel = (
    <PropertyPanel
      selectedElement={selectedElement}
      onPatchSelected={handlePatchSelectedElement}
    />
  );

  const mobileBottomSheetBody =
    mobileSheetTab === "Properties"
      ? basePropertiesPanel
      : mobileSheetTab === "Add"
        ? (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => handleAddElement("text")} variant="secondary">Text</Button>
            <Button onClick={() => handleAddElement("image")} variant="secondary">Image</Button>
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

  return (
    <div className="min-h-screen p-6 space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleBackToDocumentManagement}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to Document Management
          </Button>
          <h1 className="text-2xl font-semibold">Presentation Editor</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Presentation #{docId} loaded. Item type: <code>{itemType || PRESENTATION_ITEM_TYPE}</code>
        </p>
        <p className="text-sm text-muted-foreground">Save status: {saveStatusLabel}</p>
        {saveState === "conflict" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReloadLatestSlide()}
            aria-label="Reload Latest Slide"
          >
            Reload Latest
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">Playback status: {playbackStatusLabel}</p>
        <p className="text-sm text-muted-foreground">Export status: {exportStatusLabel}</p>
        {exportMessage ? (
          <p className="text-sm text-muted-foreground" role="status">{exportMessage}</p>
        ) : null}
        {exportWarnings.length ? (
          <p className="text-sm text-amber-700" data-testid="presentation-export-warnings">
            Export warnings: {exportWarnings.map((warning) => `${warning.code} (slide ${warning.slideId})`).join(", ")}
          </p>
        ) : null}
      </header>

      <CanvasShell
        slidesPanel={slidesPanel}
        canvasToolbar={canvasToolbar}
        canvasStage={(
          <CanvasStage
            elements={draftContent.elements}
            selectedElementIds={selectedElementIds}
            snapGuides={commandState.snapGuides}
            suppressTransformHandles={isMobilePanMode}
            viewport={isMobileViewport ? mobileGestures.state.viewport : undefined}
            onSelectElement={handleSelectElement}
            onMoveSelection={handleMoveSelection}
            onResizeSelection={handleResizeSelection}
            onRotateSelection={handleRotateSelection}
            onArrangeSelection={handleArrangeSelection}
          />
        )}
        canvasFooter={canvasFooter}
        propertiesPanel={propertiesPanel}
      />
    </div>
  );
}
