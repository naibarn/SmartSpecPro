import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { buildWrongEditorOpenGuard } from "@/lib/presentationRouting";
import {
  addElement,
  createElement,
  ensureSlideContent,
  updateElementById,
  type PresentationElement,
  type PresentationElementType,
  type PresentationSlideContent,
} from "@/lib/presentationEditorState";
import {
  PRESENTATION_CONFLICT_SCHEMA_VERSION,
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ITEM_TYPE,
} from "@shared/presentation/constants";

function parseDocId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type SaveState = "idle" | "pending" | "saved" | "conflict" | "error";

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

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nextElementId(type: PresentationElementType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

  const deckData = deckQuery.data as any;
  const deck = deckData?.deck;
  const slides = useMemo(() => {
    const raw = Array.isArray(deckData?.slides) ? deckData.slides : [];
    return [...raw].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [deckData?.slides]);

  const [selectedSlideId, setSelectedSlideId] = useState<number | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<PresentationSlideContent>({ elements: [] });
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) || null,
    [slides, selectedSlideId],
  );
  const selectedElement = useMemo(
    () => draftContent.elements.find((element) => element.id === selectedElementId) || null,
    [draftContent.elements, selectedElementId],
  );

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
      setDraftContent({ elements: [] });
      setSelectedElementId(null);
      setSaveState("idle");
      return;
    }

    const next = ensureSlideContent(selectedSlide.slideContent);
    setDraftContent(next);
    setSelectedElementId(next.elements[0]?.id ?? null);
    setSaveState("idle");
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

  function handleAddElement(type: PresentationElementType) {
    const element = createElement(type, nextElementId(type));
    setDraftContent((current) => addElement(current, element));
    setSelectedElementId(element.id);
    setSaveState("idle");
  }

  function handleUpdateSelectedElement(patch: Partial<PresentationElement>) {
    if (!selectedElementId) return;
    setDraftContent((current) => updateElementById(current, selectedElementId, patch));
    setSaveState("idle");
  }

  async function handleSaveSlide() {
    if (!deck || !selectedSlide) return;
    setSaveState("pending");
    try {
      await updateSlideMutation.mutateAsync({
        deckId: deck.id,
        slideId: selectedSlide.id,
        expectedVersion: selectedSlide.version,
        saveMode: "manual",
        title: selectedSlide.title,
        slideContent: draftContent,
      });
      setSaveState("saved");
      await refreshDeck();
    } catch (error) {
      setSaveState(isConflictError(error) ? "conflict" : "error");
    }
  }

  const deckNotFound = Boolean(deckQuery.error && isNotFoundError(deckQuery.error));

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

  if (guardQuery.data && !guardQuery.data.allowed) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-xl font-semibold">Wrong editor route</h1>
        <p className="text-sm text-muted-foreground">{guardQuery.data.message}</p>
        <Button onClick={() => setLocation(guardQuery.data.recoveryCta.href)}>
          {guardQuery.data.recoveryCta.label}
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
        <h1 className="text-2xl font-semibold">Presentation Editor</h1>
        <p className="text-sm text-muted-foreground">
          This presentation does not have an editable deck yet.
        </p>
        <Button onClick={() => void handleCreateDeck()}>Initialize Presentation Deck</Button>
      </div>
    );
  }

  if (deckQuery.error && !deckQuery.data) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Presentation Editor</h1>
        <p className="text-sm text-red-600">{String((deckQuery.error as any)?.message || "Failed to load deck.")}</p>
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

  return (
    <div className="min-h-screen p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Presentation Editor</h1>
        <p className="text-sm text-muted-foreground">
          Presentation #{docId} loaded. Item type: <code>{itemType || PRESENTATION_ITEM_TYPE}</code>
        </p>
        <p className="text-sm text-muted-foreground">Save status: {saveStatusLabel}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        <aside className="rounded border bg-card p-3 space-y-3">
          <h2 className="font-medium">Slides</h2>
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
        </aside>

        <section className="rounded border bg-card p-3 space-y-3">
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
          <div className="rounded border bg-background p-3 min-h-[320px]">
            <h3 className="text-sm font-medium mb-2">Canvas Elements</h3>
            <ul className="space-y-2">
              {draftContent.elements.length ? (
                draftContent.elements.map((element, index) => (
                  <li key={element.id}>
                    <button
                      type="button"
                      className={`w-full rounded border px-2 py-1 text-left text-sm ${
                        selectedElementId === element.id ? "border-primary bg-primary/10" : ""
                      }`}
                      onClick={() => setSelectedElementId(element.id)}
                    >
                      {index + 1}. {element.type} ({element.id})
                    </button>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">No elements on this slide yet.</li>
              )}
            </ul>
          </div>
          <Button onClick={() => void handleSaveSlide()} aria-label="Save Slide">
            Save Slide
          </Button>
        </section>

        <aside className="rounded border bg-card p-3 space-y-3">
          <h2 className="font-medium">Properties</h2>
          {!selectedElement ? (
            <p className="text-sm text-muted-foreground">Select an element to edit properties.</p>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-muted-foreground">X</span>
                <Input
                  aria-label="Element X"
                  type="number"
                  value={selectedElement.x}
                  onChange={(event) =>
                    handleUpdateSelectedElement({
                      x: parseNumberInput(event.target.value, selectedElement.x),
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Y</span>
                <Input
                  aria-label="Element Y"
                  type="number"
                  value={selectedElement.y}
                  onChange={(event) =>
                    handleUpdateSelectedElement({
                      y: parseNumberInput(event.target.value, selectedElement.y),
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Width</span>
                <Input
                  aria-label="Element Width"
                  type="number"
                  value={selectedElement.width}
                  onChange={(event) =>
                    handleUpdateSelectedElement({
                      width: parseNumberInput(event.target.value, selectedElement.width),
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Height</span>
                <Input
                  aria-label="Element Height"
                  type="number"
                  value={selectedElement.height}
                  onChange={(event) =>
                    handleUpdateSelectedElement({
                      height: parseNumberInput(event.target.value, selectedElement.height),
                    })
                  }
                />
              </label>
              {selectedElement.type === "text" && (
                <>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">Text</span>
                    <Textarea
                      aria-label="Text Content"
                      value={selectedElement.text}
                      onChange={(event) => handleUpdateSelectedElement({ text: event.target.value } as any)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">Color</span>
                    <Input
                      aria-label="Text Color"
                      value={selectedElement.color}
                      onChange={(event) => handleUpdateSelectedElement({ color: event.target.value } as any)}
                    />
                  </label>
                </>
              )}
              {selectedElement.type === "image" && (
                <>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">Image URL</span>
                    <Input
                      aria-label="Image URL"
                      value={selectedElement.src}
                      onChange={(event) => handleUpdateSelectedElement({ src: event.target.value } as any)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">Alt Text</span>
                    <Input
                      aria-label="Image Alt Text"
                      value={selectedElement.alt}
                      onChange={(event) => handleUpdateSelectedElement({ alt: event.target.value } as any)}
                    />
                  </label>
                </>
              )}
              {selectedElement.type === "rect" && (
                <label className="block text-sm">
                  <span className="text-muted-foreground">Fill Color</span>
                  <Input
                    aria-label="Rectangle Fill"
                    value={selectedElement.fill}
                    onChange={(event) => handleUpdateSelectedElement({ fill: event.target.value } as any)}
                  />
                </label>
              )}
              {selectedElement.type === "line" && (
                <>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">Stroke</span>
                    <Input
                      aria-label="Line Stroke"
                      value={selectedElement.stroke}
                      onChange={(event) => handleUpdateSelectedElement({ stroke: event.target.value } as any)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">Stroke Width</span>
                    <Input
                      aria-label="Line Stroke Width"
                      type="number"
                      value={selectedElement.strokeWidth}
                      onChange={(event) =>
                        handleUpdateSelectedElement({
                          strokeWidth: parseNumberInput(event.target.value, selectedElement.strokeWidth),
                        } as any)
                      }
                    />
                  </label>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
