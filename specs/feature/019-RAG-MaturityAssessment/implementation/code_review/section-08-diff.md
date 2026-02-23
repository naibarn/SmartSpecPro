diff --git a/.claude/settings.local.json b/.claude/settings.local.json
index f815a2a..19bcfbb 100644
--- a/.claude/settings.local.json
+++ b/.claude/settings.local.json
@@ -182,7 +182,14 @@
       "Bash(/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/query_router.py:*)",
       "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-06-review.md:*)",
       "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-06-interview.md:*)",
-      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_rag_executor.py:*)"
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_rag_executor.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-07-review.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/specs/feature/019-RAG-MaturityAssessment/implementation/code_review/section-07-interview.md:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/evaluator.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_evaluator.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_eval_dataset.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_observability.py:*)",
+      "Bash(/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_evaluator_cli.py:*)"
     ],
     "deny": [
       "Bash(rm *)",
diff --git a/apps/web/client/src/lib/presentationEditorState.test.ts b/apps/web/client/src/lib/presentationEditorState.test.ts
index 3f6f2ab..7bf40e9 100644
--- a/apps/web/client/src/lib/presentationEditorState.test.ts
+++ b/apps/web/client/src/lib/presentationEditorState.test.ts
@@ -3,7 +3,12 @@ import { describe, expect, it } from "vitest";
 import {
   addElement,
   createElement,
+  deleteElements,
+  duplicateElements,
   ensureSlideContent,
+  reorderElementById,
+  resizeElementById,
+  translateElements,
   updateElementById,
   type PresentationSlideContent,
 } from "./presentationEditorState";
@@ -45,4 +50,40 @@ describe("presentationEditorState", () => {
     expect(next.elements[0].id).toBe("text-1");
     expect(next.elements[1].id).toBe("rect-1");
   });
+
+  it("applies deterministic translate/resize/reorder operations", () => {
+    const base: PresentationSlideContent = {
+      elements: [
+        { id: "a", type: "text", x: 10, y: 20, width: 120, height: 40, text: "A", color: "#111827" },
+        { id: "b", type: "rect", x: 200, y: 80, width: 80, height: 60, fill: "#93c5fd" },
+      ],
+    };
+
+    const moved = translateElements(base, ["a"], 5, -3);
+    const resized = resizeElementById(moved, "a", { width: 140, height: 50 });
+    const reordered = reorderElementById(resized, "a", "front");
+
+    expect(reordered.elements[1]).toMatchObject({
+      id: "a",
+      x: 15,
+      y: 17,
+      width: 140,
+      height: 50,
+    });
+  });
+
+  it("duplicates and deletes selected elements without mutating unrelated items", () => {
+    const base: PresentationSlideContent = {
+      elements: [
+        { id: "a", type: "text", x: 10, y: 20, width: 120, height: 40, text: "A", color: "#111827" },
+        { id: "b", type: "line", x: 50, y: 60, width: 200, height: 0, stroke: "#111827", strokeWidth: 2 },
+      ],
+    };
+
+    const duplicated = duplicateElements(base, ["a"], () => "a-copy");
+    const deleted = deleteElements(duplicated, ["b"]);
+
+    expect(duplicated.elements.map((element) => element.id)).toEqual(["a", "a-copy", "b"]);
+    expect(deleted.elements.map((element) => element.id)).toEqual(["a", "a-copy"]);
+  });
 });
diff --git a/apps/web/client/src/lib/presentationEditorState.ts b/apps/web/client/src/lib/presentationEditorState.ts
index 33ed77e..ed656d9 100644
--- a/apps/web/client/src/lib/presentationEditorState.ts
+++ b/apps/web/client/src/lib/presentationEditorState.ts
@@ -8,6 +8,7 @@ export type PresentationElementType = SharedPresentationElement["type"];
 export type PresentationElement = SharedPresentationElement;
 export type PresentationElementPatch = Partial<Omit<PresentationElement, "id" | "type">>;
 export type PresentationSlideContent = SharedPresentationSlideContent;
+export type ArrangeDirection = "forward" | "backward" | "front" | "back";
 
 export function ensureSlideContent(input: unknown): PresentationSlideContent {
   const parsed = presentationSlideContentSchema.safeParse(input);
@@ -100,3 +101,135 @@ export function updateElementById(
     }),
   };
 }
+
+export function translateElements(
+  content: PresentationSlideContent,
+  elementIds: string[],
+  deltaX: number,
+  deltaY: number,
+): PresentationSlideContent {
+  if (!elementIds.length || (!deltaX && !deltaY)) {
+    return content;
+  }
+
+  const selected = new Set(elementIds);
+  return {
+    ...content,
+    elements: content.elements.map((element) => {
+      if (!selected.has(element.id)) {
+        return element;
+      }
+
+      return {
+        ...element,
+        x: element.x + deltaX,
+        y: element.y + deltaY,
+      } as PresentationElement;
+    }),
+  };
+}
+
+export function resizeElementById(
+  content: PresentationSlideContent,
+  elementId: string,
+  patch: Partial<Pick<PresentationElement, "x" | "y" | "width" | "height">>,
+): PresentationSlideContent {
+  return {
+    ...content,
+    elements: content.elements.map((element) => {
+      if (element.id !== elementId) {
+        return element;
+      }
+
+      const width = patch.width === undefined ? element.width : Math.max(0, patch.width);
+      const height = patch.height === undefined ? element.height : Math.max(0, patch.height);
+
+      return {
+        ...element,
+        x: patch.x ?? element.x,
+        y: patch.y ?? element.y,
+        width,
+        height,
+      } as PresentationElement;
+    }),
+  };
+}
+
+export function reorderElementById(
+  content: PresentationSlideContent,
+  elementId: string,
+  direction: ArrangeDirection,
+): PresentationSlideContent {
+  const index = content.elements.findIndex((element) => element.id === elementId);
+  if (index < 0) {
+    return content;
+  }
+
+  const next = [...content.elements];
+
+  if (direction === "forward" && index < next.length - 1) {
+    [next[index], next[index + 1]] = [next[index + 1], next[index]];
+  } else if (direction === "backward" && index > 0) {
+    [next[index], next[index - 1]] = [next[index - 1], next[index]];
+  } else if (direction === "front" && index < next.length - 1) {
+    const [item] = next.splice(index, 1);
+    next.push(item);
+  } else if (direction === "back" && index > 0) {
+    const [item] = next.splice(index, 1);
+    next.unshift(item);
+  }
+
+  return {
+    ...content,
+    elements: next,
+  };
+}
+
+export function deleteElements(
+  content: PresentationSlideContent,
+  elementIds: string[],
+): PresentationSlideContent {
+  if (!elementIds.length) {
+    return content;
+  }
+
+  const selected = new Set(elementIds);
+  return {
+    ...content,
+    elements: content.elements.filter((element) => !selected.has(element.id)),
+  };
+}
+
+export function duplicateElements(
+  content: PresentationSlideContent,
+  elementIds: string[],
+  makeId: (source: PresentationElement) => string,
+): PresentationSlideContent {
+  if (!elementIds.length) {
+    return content;
+  }
+
+  const selected = new Set(elementIds);
+  const nextElements: PresentationElement[] = [];
+
+  for (const element of content.elements) {
+    nextElements.push(element);
+
+    if (!selected.has(element.id)) {
+      continue;
+    }
+
+    const duplicate: PresentationElement = {
+      ...element,
+      id: makeId(element),
+      x: element.x + 16,
+      y: element.y + 16,
+    };
+    nextElements.push(duplicate);
+  }
+
+  return {
+    ...content,
+    elements: nextElements,
+  };
+}
diff --git a/apps/web/client/src/pages/PresentationEditor.test.tsx b/apps/web/client/src/pages/PresentationEditor.test.tsx
index 9694ff2..6dd02a9 100644
--- a/apps/web/client/src/pages/PresentationEditor.test.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.test.tsx
@@ -306,4 +306,26 @@ describe("PresentationEditor", () => {
     expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
     expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
   });
+
+  it("supports keyboard movement plus undo/redo for selected elements", async () => {
+    render(<PresentationEditor />);
+
+    expect(screen.getByTestId("canvas-transform-handles")).toBeInTheDocument();
+    expect(screen.getByLabelText("Element X")).toHaveValue(10);
+
+    fireEvent.keyDown(window, { key: "ArrowRight" });
+    await waitFor(() => {
+      expect(screen.getByLabelText("Element X")).toHaveValue(11);
+    });
+
+    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
+    await waitFor(() => {
+      expect(screen.getByLabelText("Element X")).toHaveValue(10);
+    });
+
+    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
+    await waitFor(() => {
+      expect(screen.getByLabelText("Element X")).toHaveValue(11);
+    });
+  });
 });
diff --git a/apps/web/client/src/pages/PresentationEditor.tsx b/apps/web/client/src/pages/PresentationEditor.tsx
index 51f2430..45ea076 100644
--- a/apps/web/client/src/pages/PresentationEditor.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.tsx
@@ -1,24 +1,34 @@
-import { useEffect, useMemo, useState } from "react";
+import { useEffect, useMemo, useRef, useState } from "react";
 import { useLocation, useRoute } from "wouter";
 import { ChevronLeft } from "lucide-react";
 
-import { CanvasShell, CanvasStage } from "@/presentation-canvas";
+import { CanvasShell, CanvasStage, PropertyPanel } from "@/presentation-canvas";
 import { Button } from "@/components/ui/button";
-import { Input } from "@/components/ui/input";
-import { Textarea } from "@/components/ui/textarea";
 import { useAuth } from "@/contexts/AuthContext";
 import { trpc } from "@/lib/trpc";
 import { buildWrongEditorOpenGuard } from "@/lib/presentationRouting";
 import {
-  addElement,
   createElement,
   ensureSlideContent,
-  updateElementById,
-  type PresentationElement,
-  type PresentationElementPatch,
+  type ArrangeDirection,
   type PresentationElementType,
   type PresentationSlideContent,
 } from "@/lib/presentationEditorState";
+import { SelectionEngine } from "@/presentation-canvas/selection/SelectionEngine";
+import { CommandBus } from "@/presentation-canvas/commands/CommandBus";
+import {
+  addElementCommand,
+  arrangeSelectionCommand,
+  createCanvasCommandState,
+  deleteSelectionCommand,
+  duplicateSelectionCommand,
+  moveSelectionCommand,
+  patchSelectedElementCommand,
+  resizeSelectionCommand,
+  rotateSelectionCommand,
+  selectElementsCommand,
+  type CanvasCommandState,
+} from "@/presentation-canvas/commands/commands";
 import {
   PRESENTATION_CONFLICT_SCHEMA_VERSION,
   PRESENTATION_EDITOR_ROUTE_BASE,
@@ -58,11 +68,6 @@ function isConflictError(error: unknown): boolean {
   return message.includes(PRESENTATION_ERROR_CODE.VERSION_CONFLICT);
 }
 
-function parseNumberInput(value: string, fallback: number): number {
-  const parsed = Number.parseFloat(value);
-  return Number.isFinite(parsed) ? parsed : fallback;
-}
-
 function nextElementId(type: PresentationElementType): string {
   return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
 }
@@ -119,8 +124,12 @@ export default function PresentationEditor() {
   }, [deckData?.slides]);
 
   const [selectedSlideId, setSelectedSlideId] = useState<number | null>(null);
-  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
-  const [draftContent, setDraftContent] = useState<PresentationSlideContent>({ elements: [] });
+  const [commandState, setCommandState] = useState<CanvasCommandState>(() =>
+    createCanvasCommandState({ elements: [] }),
+  );
+  const commandBusRef = useRef(
+    new CommandBus<CanvasCommandState>(createCanvasCommandState({ elements: [] })),
+  );
   const [saveState, setSaveState] = useState<SaveState>("idle");
   const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
   const [exportMessage, setExportMessage] = useState<string>("");
@@ -147,11 +156,23 @@ export default function PresentationEditor() {
     () => slides.find((slide) => slide.id === selectedSlideId) || null,
     [slides, selectedSlideId],
   );
+  const draftContent = commandState.content;
+  const selectedElementIds = commandState.selectedElementIds;
+  const selectedElementId = selectedElementIds[0] ?? null;
   const selectedElement = useMemo(
     () => draftContent.elements.find((element) => element.id === selectedElementId) || null,
     [draftContent.elements, selectedElementId],
   );
 
+  function syncCommandState(next: CanvasCommandState) {
+    setCommandState(next);
+    setSaveState("idle");
+  }
+
+  function executeCommand(command: Parameters<CommandBus<CanvasCommandState>["execute"]>[0]) {
+    syncCommandState(commandBusRef.current.execute(command));
+  }
+
   useEffect(() => {
     if (!slides.length) {
       setSelectedSlideId(null);
@@ -167,15 +188,18 @@ export default function PresentationEditor() {
 
   useEffect(() => {
     if (!selectedSlide) {
-      setDraftContent({ elements: [] });
-      setSelectedElementId(null);
+      const empty = createCanvasCommandState({ elements: [] });
+      commandBusRef.current.reset(empty);
+      setCommandState(empty);
       setSaveState("idle");
       return;
     }
 
     const next = ensureSlideContent(selectedSlide.slideContent);
-    setDraftContent(next);
-    setSelectedElementId(next.elements[0]?.id ?? null);
+    const nextSelected = next.elements[0]?.id ? [next.elements[0].id] : [];
+    const nextState = createCanvasCommandState(next, nextSelected);
+    commandBusRef.current.reset(nextState);
+    setCommandState(nextState);
     setSaveState("idle");
   }, [selectedSlide?.id, selectedSlide?.version]);
 
@@ -247,15 +271,58 @@ export default function PresentationEditor() {
 
   function handleAddElement(type: PresentationElementType) {
     const element = createElement(type, nextElementId(type));
-    setDraftContent((current) => addElement(current, element));
-    setSelectedElementId(element.id);
-    setSaveState("idle");
+    executeCommand(addElementCommand(element));
   }
 
-  function handleUpdateSelectedElement(patch: PresentationElementPatch) {
-    if (!selectedElementId) return;
-    setDraftContent((current) => updateElementById(current, selectedElementId, patch));
-    setSaveState("idle");
+  function handleSelectElement(elementId: string, options?: { additive?: boolean }) {
+    if (options?.additive) {
+      const toggled = SelectionEngine.toggle(
+        { selectedIds: selectedElementIds, activeId: selectedElementId },
+        elementId,
+      );
+      executeCommand(selectElementsCommand(toggled.selectedIds));
+      return;
+    }
+
+    executeCommand(selectElementsCommand([elementId]));
+  }
+
+  function handlePatchSelectedElement(patch: Parameters<typeof patchSelectedElementCommand>[0]) {
+    executeCommand(patchSelectedElementCommand(patch));
+  }
+
+  function handleMoveSelection(deltaX: number, deltaY: number) {
+    executeCommand(moveSelectionCommand(deltaX, deltaY));
+  }
+
+  function handleResizeSelection(width: number, height: number) {
+    executeCommand(resizeSelectionCommand(width, height));
+  }
+
+  function handleRotateSelection(deltaDegrees: number) {
+    executeCommand(rotateSelectionCommand(deltaDegrees));
+  }
+
+  function handleArrangeSelection(direction: ArrangeDirection) {
+    executeCommand(arrangeSelectionCommand(direction));
+  }
+
+  function handleUndo() {
+    syncCommandState(commandBusRef.current.undo());
+  }
+
+  function handleRedo() {
+    syncCommandState(commandBusRef.current.redo());
+  }
+
+  function handleDuplicateSelection() {
+    executeCommand(
+      duplicateSelectionCommand((source) => nextElementId(source.type as PresentationElementType)),
+    );
+  }
+
+  function handleDeleteSelection() {
+    executeCommand(deleteSelectionCommand());
   }
 
   async function handleSaveSlide() {
@@ -309,6 +376,74 @@ export default function PresentationEditor() {
     }
   }
 
+  useEffect(() => {
+    const onKeyDown = (event: KeyboardEvent) => {
+      const target = event.target as HTMLElement | null;
+      const isEditable =
+        Boolean(target?.closest("input, textarea, select"))
+        || target?.isContentEditable === true;
+      if (isEditable) {
+        return;
+      }
+
+      const hasSelection = selectedElementIds.length > 0;
+      const isPrimaryModifier = event.metaKey || event.ctrlKey;
+      const key = event.key.toLowerCase();
+
+      if (isPrimaryModifier && key === "z") {
+        event.preventDefault();
+        if (event.shiftKey) {
+          handleRedo();
+        } else {
+          handleUndo();
+        }
+        return;
+      }
+
+      if (isPrimaryModifier && key === "y") {
+        event.preventDefault();
+        handleRedo();
+        return;
+      }
+
+      if (isPrimaryModifier && key === "d" && hasSelection) {
+        event.preventDefault();
+        handleDuplicateSelection();
+        return;
+      }
+
+      if ((event.key === "Backspace" || event.key === "Delete") && hasSelection) {
+        event.preventDefault();
+        handleDeleteSelection();
+        return;
+      }
+
+      if (!hasSelection) {
+        return;
+      }
+
+      const step = event.shiftKey ? 10 : 1;
+      if (event.key === "ArrowLeft") {
+        event.preventDefault();
+        handleMoveSelection(-step, 0);
+      } else if (event.key === "ArrowRight") {
+        event.preventDefault();
+        handleMoveSelection(step, 0);
+      } else if (event.key === "ArrowUp") {
+        event.preventDefault();
+        handleMoveSelection(0, -step);
+      } else if (event.key === "ArrowDown") {
+        event.preventDefault();
+        handleMoveSelection(0, step);
+      }
+    };
+
+    window.addEventListener("keydown", onKeyDown);
+    return () => {
+      window.removeEventListener("keydown", onKeyDown);
+    };
+  }, [selectedElementIds, handleDeleteSelection, handleDuplicateSelection, handleMoveSelection, handleRedo, handleUndo]);
+
   const deckNotFound = Boolean(deckQuery.error && isNotFoundError(deckQuery.error));
 
   useEffect(() => {
@@ -488,23 +623,39 @@ export default function PresentationEditor() {
     </>
   );
   const canvasToolbar = (
-    <div className="flex flex-wrap gap-2">
-      <Button
-        onClick={() => handleAddElement("text")}
-        aria-label="Add Text Element"
-        variant="secondary"
-      >
-        Add Text Element
-      </Button>
-      <Button onClick={() => handleAddElement("image")} aria-label="Add Image Element" variant="secondary">
-        Add Image Element
-      </Button>
-      <Button onClick={() => handleAddElement("rect")} aria-label="Add Rectangle Element" variant="secondary">
-        Add Rectangle
-      </Button>
-      <Button onClick={() => handleAddElement("line")} aria-label="Add Line Element" variant="secondary">
-        Add Line
-      </Button>
+    <div className="space-y-2">
+      <div className="flex flex-wrap gap-2">
+        <Button
+          onClick={() => handleAddElement("text")}
+          aria-label="Add Text Element"
+          variant="secondary"
+        >
+          Add Text Element
+        </Button>
+        <Button onClick={() => handleAddElement("image")} aria-label="Add Image Element" variant="secondary">
+          Add Image Element
+        </Button>
+        <Button onClick={() => handleAddElement("rect")} aria-label="Add Rectangle Element" variant="secondary">
+          Add Rectangle
+        </Button>
+        <Button onClick={() => handleAddElement("line")} aria-label="Add Line Element" variant="secondary">
+          Add Line
+        </Button>
+      </div>
+      <div className="flex flex-wrap gap-2">
+        <Button onClick={handleUndo} aria-label="Undo Edit" variant="outline">
+          Undo
+        </Button>
+        <Button onClick={handleRedo} aria-label="Redo Edit" variant="outline">
+          Redo
+        </Button>
+        <Button onClick={handleDuplicateSelection} aria-label="Duplicate Selection" variant="outline">
+          Duplicate Selection
+        </Button>
+        <Button onClick={handleDeleteSelection} aria-label="Delete Selection" variant="outline">
+          Delete Selection
+        </Button>
+      </div>
     </div>
   );
   const canvasFooter = (
@@ -525,138 +676,11 @@ export default function PresentationEditor() {
       </div>
     </>
   );
-  const propertiesPanel = !selectedElement ? (
-    <p className="text-sm text-muted-foreground">Select an element to edit properties.</p>
-  ) : (
-    <div className="space-y-2">
-      <label className="block text-sm">
-        <span className="text-muted-foreground">X</span>
-        <Input
-          aria-label="Element X"
-          type="number"
-          value={selectedElement.x}
-          onChange={(event) =>
-            handleUpdateSelectedElement({
-              x: parseNumberInput(event.target.value, selectedElement.x),
-            })
-          }
-        />
-      </label>
-      <label className="block text-sm">
-        <span className="text-muted-foreground">Y</span>
-        <Input
-          aria-label="Element Y"
-          type="number"
-          value={selectedElement.y}
-          onChange={(event) =>
-            handleUpdateSelectedElement({
-              y: parseNumberInput(event.target.value, selectedElement.y),
-            })
-          }
-        />
-      </label>
-      <label className="block text-sm">
-        <span className="text-muted-foreground">Width</span>
-        <Input
-          aria-label="Element Width"
-          type="number"
-          value={selectedElement.width}
-          onChange={(event) =>
-            handleUpdateSelectedElement({
-              width: parseNumberInput(event.target.value, selectedElement.width),
-            })
-          }
-        />
-      </label>
-      <label className="block text-sm">
-        <span className="text-muted-foreground">Height</span>
-        <Input
-          aria-label="Element Height"
-          type="number"
-          value={selectedElement.height}
-          onChange={(event) =>
-            handleUpdateSelectedElement({
-              height: parseNumberInput(event.target.value, selectedElement.height),
-            })
-          }
-        />
-      </label>
-      {selectedElement.type === "text" && (
-        <>
-          <label className="block text-sm">
-            <span className="text-muted-foreground">Text</span>
-            <Textarea
-              aria-label="Text Content"
-              value={selectedElement.text}
-              onChange={(event) => handleUpdateSelectedElement({ text: event.target.value } as any)}
-            />
-          </label>
-          <label className="block text-sm">
-            <span className="text-muted-foreground">Color</span>
-            <Input
-              aria-label="Text Color"
-              value={selectedElement.color}
-              onChange={(event) => handleUpdateSelectedElement({ color: event.target.value } as any)}
-            />
-          </label>
-        </>
-      )}
-      {selectedElement.type === "image" && (
-        <>
-          <label className="block text-sm">
-            <span className="text-muted-foreground">Image URL</span>
-            <Input
-              aria-label="Image URL"
-              value={selectedElement.src}
-              onChange={(event) => handleUpdateSelectedElement({ src: event.target.value } as any)}
-            />
-          </label>
-          <label className="block text-sm">
-            <span className="text-muted-foreground">Alt Text</span>
-            <Input
-              aria-label="Image Alt Text"
-              value={selectedElement.alt}
-              onChange={(event) => handleUpdateSelectedElement({ alt: event.target.value } as any)}
-            />
-          </label>
-        </>
-      )}
-      {selectedElement.type === "rect" && (
-        <label className="block text-sm">
-          <span className="text-muted-foreground">Fill Color</span>
-          <Input
-            aria-label="Rectangle Fill"
-            value={selectedElement.fill}
-            onChange={(event) => handleUpdateSelectedElement({ fill: event.target.value } as any)}
-          />
-        </label>
-      )}
-      {selectedElement.type === "line" && (
-        <>
-          <label className="block text-sm">
-            <span className="text-muted-foreground">Stroke</span>
-            <Input
-              aria-label="Line Stroke"
-              value={selectedElement.stroke}
-              onChange={(event) => handleUpdateSelectedElement({ stroke: event.target.value } as any)}
-            />
-          </label>
-          <label className="block text-sm">
-            <span className="text-muted-foreground">Stroke Width</span>
-            <Input
-              aria-label="Line Stroke Width"
-              type="number"
-              value={selectedElement.strokeWidth}
-              onChange={(event) =>
-                handleUpdateSelectedElement({
-                  strokeWidth: parseNumberInput(event.target.value, selectedElement.strokeWidth),
-                } as any)
-              }
-            />
-          </label>
-        </>
-      )}
-    </div>
+  const propertiesPanel = (
+    <PropertyPanel
+      selectedElement={selectedElement}
+      onPatchSelected={handlePatchSelectedElement}
+    />
   );
 
   return (
@@ -686,8 +710,13 @@ export default function PresentationEditor() {
         canvasStage={(
           <CanvasStage
             elements={draftContent.elements}
-            selectedElementId={selectedElementId}
-            onSelectElement={(elementId) => setSelectedElementId(elementId)}
+            selectedElementIds={selectedElementIds}
+            snapGuides={commandState.snapGuides}
+            onSelectElement={handleSelectElement}
+            onMoveSelection={handleMoveSelection}
+            onResizeSelection={handleResizeSelection}
+            onRotateSelection={handleRotateSelection}
+            onArrangeSelection={handleArrangeSelection}
           />
         )}
         canvasFooter={canvasFooter}
diff --git a/apps/web/client/src/presentation-canvas/CanvasObjects.tsx b/apps/web/client/src/presentation-canvas/CanvasObjects.tsx
index ce21e0b..cbfc2b0 100644
--- a/apps/web/client/src/presentation-canvas/CanvasObjects.tsx
+++ b/apps/web/client/src/presentation-canvas/CanvasObjects.tsx
@@ -2,8 +2,8 @@ import type { PresentationElement } from "@/lib/presentationEditorState";
 
 interface CanvasObjectsProps {
   elements: PresentationElement[];
-  selectedElementId: string | null;
-  onSelectElement: (elementId: string) => void;
+  selectedElementIds: string[];
+  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
 }
 
 function getElementDisplayText(element: PresentationElement): string {
@@ -18,7 +18,7 @@ function getElementDisplayText(element: PresentationElement): string {
   return element.type;
 }
 
-export function CanvasObjects({ elements, selectedElementId, onSelectElement }: CanvasObjectsProps) {
+export function CanvasObjects({ elements, selectedElementIds, onSelectElement }: CanvasObjectsProps) {
   if (!elements.length) {
     return (
       <p className="text-sm text-muted-foreground">No elements on this slide yet.</p>
@@ -32,9 +32,9 @@ export function CanvasObjects({ elements, selectedElementId, onSelectElement }:
           <button
             type="button"
             className={`w-full rounded border px-2 py-1 text-left text-sm ${
-              selectedElementId === element.id ? "border-primary bg-primary/10" : ""
+              selectedElementIds.includes(element.id) ? "border-primary bg-primary/10" : ""
             }`}
-            onClick={() => onSelectElement(element.id)}
+            onClick={(event) => onSelectElement(element.id, { additive: event.shiftKey })}
             aria-label={`Select canvas element ${index + 1}`}
           >
             {index + 1}. {getElementDisplayText(element)} ({element.type})
diff --git a/apps/web/client/src/presentation-canvas/CanvasStage.tsx b/apps/web/client/src/presentation-canvas/CanvasStage.tsx
index f3dfe09..18dae83 100644
--- a/apps/web/client/src/presentation-canvas/CanvasStage.tsx
+++ b/apps/web/client/src/presentation-canvas/CanvasStage.tsx
@@ -1,18 +1,31 @@
 import { useEffect } from "react";
 
 import type { PresentationElement } from "@/lib/presentationEditorState";
+import type { SnapGuide } from "./snap/SnapEngine";
 import { CanvasObjects } from "./CanvasObjects";
+import { TransformHandles } from "./components/TransformHandles";
+import type { ArrangeDirection } from "@/lib/presentationEditorState";
 
 interface CanvasStageProps {
   elements: PresentationElement[];
-  selectedElementId: string | null;
-  onSelectElement: (elementId: string) => void;
+  selectedElementIds: string[];
+  snapGuides: SnapGuide[];
+  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
+  onMoveSelection: (deltaX: number, deltaY: number) => void;
+  onResizeSelection: (width: number, height: number) => void;
+  onRotateSelection: (deltaDegrees: number) => void;
+  onArrangeSelection: (direction: ArrangeDirection) => void;
 }
 
 export function CanvasStage({
   elements,
-  selectedElementId,
+  selectedElementIds,
+  snapGuides,
   onSelectElement,
+  onMoveSelection,
+  onResizeSelection,
+  onRotateSelection,
+  onArrangeSelection,
 }: CanvasStageProps) {
   useEffect(() => {
     const onResize = () => {
@@ -25,6 +38,10 @@ export function CanvasStage({
     };
   }, []);
 
+  const primarySelected = selectedElementIds[0]
+    ? elements.find((element) => element.id === selectedElementIds[0]) || null
+    : null;
+
   return (
     <div className="rounded border bg-background p-3 min-h-[320px]" data-testid="canvas-stage">
       <h3 className="text-sm font-medium mb-2">Canvas Stage</h3>
@@ -35,15 +52,33 @@ export function CanvasStage({
         <div data-testid="canvas-stage-layer-content">
           <CanvasObjects
             elements={elements}
-            selectedElementId={selectedElementId}
+            selectedElementIds={selectedElementIds}
             onSelectElement={onSelectElement}
           />
         </div>
-        <div data-testid="canvas-stage-layer-selection-guides" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
-          selection-guides
+        <div data-testid="canvas-stage-layer-selection-guides" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground space-y-1">
+          <p>selection-guides</p>
+          {snapGuides.length ? (
+            <ul className="space-y-1 text-[11px]" aria-label="Snap Guides">
+              {snapGuides.map((guide) => (
+                <li key={`${guide.axis}-${guide.type}-${guide.sourceElementId}`}>
+                  {guide.axis}:{guide.type} {"->"} {guide.sourceElementId}
+                </li>
+              ))}
+            </ul>
+          ) : null}
         </div>
         <div data-testid="canvas-stage-layer-interaction-overlay" className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
-          interaction-overlay
+          <p className="mb-2">interaction-overlay</p>
+          <TransformHandles
+            disabled={!primarySelected}
+            onMove={onMoveSelection}
+            onResize={onResizeSelection}
+            onRotate={onRotateSelection}
+            onArrange={onArrangeSelection}
+            currentWidth={primarySelected?.width ?? 0}
+            currentHeight={primarySelected?.height ?? 0}
+          />
         </div>
       </div>
     </div>
diff --git a/apps/web/client/src/presentation-canvas/index.ts b/apps/web/client/src/presentation-canvas/index.ts
index 61028f3..bb56a0f 100644
--- a/apps/web/client/src/presentation-canvas/index.ts
+++ b/apps/web/client/src/presentation-canvas/index.ts
@@ -1,3 +1,8 @@
 export { CanvasShell } from "./CanvasShell";
 export { CanvasStage } from "./CanvasStage";
 export { CanvasObjects } from "./CanvasObjects";
+export { PropertyPanel } from "./components/PropertyPanel";
+export { TransformHandles } from "./components/TransformHandles";
+export { SelectionEngine } from "./selection/SelectionEngine";
+export { computeSnapPosition } from "./snap/SnapEngine";
+export { CommandBus } from "./commands/CommandBus";
diff --git a/python-backend/app/orchestrator/rag/__init__.py b/python-backend/app/orchestrator/rag/__init__.py
index b97f4be..ea53719 100644
--- a/python-backend/app/orchestrator/rag/__init__.py
+++ b/python-backend/app/orchestrator/rag/__init__.py
@@ -37,6 +37,13 @@ from app.orchestrator.rag.guardrails import (
     QualityAssessment,
 )
 from app.orchestrator.rag.query_router import QueryRouter, QueryIntent, QueryRouteDecision
+from app.orchestrator.rag.evaluator import (
+    RAGEvaluator,
+    EvalDatasetGenerator,
+    EvalMetrics,
+    EvalItem,
+    EvalDataset,
+)
 
 __all__ = [
     "HybridRAGEngine",
@@ -61,4 +68,9 @@ __all__ = [
     "QueryRouter",
     "QueryIntent",
     "QueryRouteDecision",
+    "RAGEvaluator",
+    "EvalDatasetGenerator",
+    "EvalMetrics",
+    "EvalItem",
+    "EvalDataset",
 ]
diff --git a/python-backend/app/orchestrator/rag/evaluator.py b/python-backend/app/orchestrator/rag/evaluator.py
new file mode 100644
index 0000000..27a89b0
--- /dev/null
+++ b/python-backend/app/orchestrator/rag/evaluator.py
@@ -0,0 +1,459 @@
+"""
+SmartSpec Pro - RAG Evaluator
+Phase 5: Evaluation & Observability
+
+Computes retrieval quality metrics (Precision@K, Recall@K, MRR, NDCG@K,
+Faithfulness) against ground-truth evaluation datasets. Includes an
+EvalDatasetGenerator for auto-generating QA pairs from indexed documents.
+"""
+
+from __future__ import annotations
+
+import json
+import math
+import statistics
+from dataclasses import dataclass, field
+from pathlib import Path
+from typing import Any
+
+import structlog
+
+logger = structlog.get_logger()
+
+
+# ---------------------------------------------------------------------------
+# Data Structures
+# ---------------------------------------------------------------------------
+
+@dataclass
+class EvalItem:
+    """A single evaluation example."""
+    query: str
+    expected_answer: str
+    expected_doc_ids: list[str]
+    tags: list[str] = field(default_factory=list)
+
+
+@dataclass
+class EvalDataset:
+    """Collection of evaluation items."""
+    items: list[EvalItem]
+    documents: list[dict[str, Any]] = field(default_factory=list)
+
+    @classmethod
+    def from_json(cls, path: str) -> EvalDataset:
+        """Load dataset from a JSON file."""
+        p = Path(path)
+        if not p.exists():
+            raise FileNotFoundError(f"Dataset file not found: {path}")
+
+        data = json.loads(p.read_text())
+        items = [
+            EvalItem(
+                query=item["query"],
+                expected_answer=item.get("expected_answer", ""),
+                expected_doc_ids=item.get("expected_doc_ids", []),
+                tags=item.get("tags", []),
+            )
+            for item in data.get("items", [])
+        ]
+        documents = data.get("documents", [])
+        return cls(items=items, documents=documents)
+
+    def to_json(self, path: str) -> None:
+        """Save dataset to a JSON file."""
+        data = {
+            "items": [
+                {
+                    "query": item.query,
+                    "expected_answer": item.expected_answer,
+                    "expected_doc_ids": item.expected_doc_ids,
+                    "tags": item.tags,
+                }
+                for item in self.items
+            ],
+            "documents": self.documents,
+        }
+        Path(path).write_text(json.dumps(data, indent=2))
+
+
+@dataclass
+class EvalMetrics:
+    """Aggregated metrics from an evaluation run."""
+    precision_at_k: float
+    recall_at_k: float
+    mrr: float
+    ndcg_at_k: float
+    faithfulness: float | None  # None when LLM not available
+    avg_retrieval_ms: float
+    p95_total_ms: float
+
+
+# ---------------------------------------------------------------------------
+# RAGEvaluator
+# ---------------------------------------------------------------------------
+
+class RAGEvaluator:
+    """Evaluates RAG pipeline quality against ground-truth datasets."""
+
+    def __init__(self, llm_client: Any | None = None):
+        self.llm_client = llm_client
+
+    # --- Metric Helpers ---
+
+    def _precision_at_k(
+        self, retrieved_ids: list[str], relevant_ids: set[str], k: int,
+    ) -> float:
+        """Precision@K = relevant docs in top-K / K."""
+        if k <= 0 or not retrieved_ids:
+            return 0.0
+        top_k = retrieved_ids[:k]
+        hits = sum(1 for doc_id in top_k if doc_id in relevant_ids)
+        return hits / k
+
+    def _recall_at_k(
+        self, retrieved_ids: list[str], relevant_ids: set[str], k: int,
+    ) -> float:
+        """Recall@K = relevant docs in top-K / total relevant."""
+        if not relevant_ids:
+            return 0.0
+        top_k = retrieved_ids[:k]
+        hits = sum(1 for doc_id in top_k if doc_id in relevant_ids)
+        return hits / len(relevant_ids)
+
+    def _reciprocal_rank(
+        self, retrieved_ids: list[str], relevant_ids: set[str],
+    ) -> float:
+        """Reciprocal Rank = 1 / rank_of_first_relevant."""
+        for i, doc_id in enumerate(retrieved_ids, 1):
+            if doc_id in relevant_ids:
+                return 1.0 / i
+        return 0.0
+
+    def _ndcg_at_k(
+        self, retrieved_ids: list[str], relevant_ids: set[str], k: int,
+    ) -> float:
+        """NDCG@K using binary relevance."""
+        if k <= 0 or not relevant_ids:
+            return 0.0
+
+        top_k = retrieved_ids[:k]
+
+        # DCG
+        dcg = 0.0
+        for i, doc_id in enumerate(top_k, 1):
+            if doc_id in relevant_ids:
+                dcg += 1.0 / math.log2(i + 1)
+
+        # IDCG — best possible with min(len(relevant_ids), k) hits at top
+        ideal_hits = min(len(relevant_ids), k)
+        idcg = 0.0
+        for i in range(1, ideal_hits + 1):
+            idcg += 1.0 / math.log2(i + 1)
+
+        if idcg == 0.0:
+            return 0.0
+        return dcg / idcg
+
+    async def _faithfulness(
+        self, answer: str, context: str,
+    ) -> float | None:
+        """Compute faithfulness score using LLM.
+
+        Returns None if self.llm_client is None.
+        """
+        if self.llm_client is None:
+            return None
+
+        # Extract claims and verify against context via LLM
+        try:
+            claims_response = await self.llm_client.extract_claims(answer)
+            if not claims_response:
+                return 1.0  # No claims to verify
+
+            supported = 0
+            for claim in claims_response:
+                is_supported = await self.llm_client.verify_claim(claim, context)
+                if is_supported:
+                    supported += 1
+
+            return supported / len(claims_response)
+        except Exception as e:
+            logger.warning("faithfulness_computation_failed", error=str(e))
+            return None
+
+    # --- Evaluation ---
+
+    async def evaluate_single(
+        self,
+        engine: Any,
+        item: EvalItem,
+        k: int = 5,
+    ) -> dict[str, Any]:
+        """Evaluate a single item and return per-item breakdown."""
+        from app.orchestrator.rag.hybrid_rag import SearchMode
+
+        result = await engine.retrieve(
+            query=item.query,
+            top_k=k,
+            mode=SearchMode.HYBRID,
+        )
+
+        retrieved_ids = [doc.doc_id for doc in result.documents]
+        relevant_ids = set(item.expected_doc_ids)
+
+        precision = self._precision_at_k(retrieved_ids, relevant_ids, k)
+        recall = self._recall_at_k(retrieved_ids, relevant_ids, k)
+        rr = self._reciprocal_rank(retrieved_ids, relevant_ids)
+        ndcg = self._ndcg_at_k(retrieved_ids, relevant_ids, k)
+
+        # Faithfulness
+        faith = None
+        if self.llm_client and item.expected_answer:
+            context_str = result.get_context()
+            faith = await self._faithfulness(item.expected_answer, context_str)
+
+        return {
+            "query": item.query,
+            "retrieved_ids": retrieved_ids,
+            "expected_ids": item.expected_doc_ids,
+            "precision": precision,
+            "recall": recall,
+            "reciprocal_rank": rr,
+            "ndcg": ndcg,
+            "retrieval_ms": result.total_time_ms,
+            "faithfulness": faith,
+        }
+
+    async def evaluate(
+        self,
+        engine: Any,
+        dataset: EvalDataset,
+        k: int = 5,
+    ) -> EvalMetrics:
+        """Run full evaluation across all dataset items."""
+        precisions = []
+        recalls = []
+        rrs = []
+        ndcgs = []
+        faiths = []
+        times_ms = []
+
+        for item in dataset.items:
+            breakdown = await self.evaluate_single(engine, item, k)
+            precisions.append(breakdown["precision"])
+            recalls.append(breakdown["recall"])
+            rrs.append(breakdown["reciprocal_rank"])
+            ndcgs.append(breakdown["ndcg"])
+            times_ms.append(breakdown["retrieval_ms"])
+            if breakdown["faithfulness"] is not None:
+                faiths.append(breakdown["faithfulness"])
+
+        avg_precision = statistics.mean(precisions) if precisions else 0.0
+        avg_recall = statistics.mean(recalls) if recalls else 0.0
+        avg_mrr = statistics.mean(rrs) if rrs else 0.0
+        avg_ndcg = statistics.mean(ndcgs) if ndcgs else 0.0
+        avg_faith = statistics.mean(faiths) if faiths else None
+        avg_time = statistics.mean(times_ms) if times_ms else 0.0
+
+        # P95 latency
+        if times_ms:
+            sorted_times = sorted(times_ms)
+            p95_idx = int(math.ceil(0.95 * len(sorted_times))) - 1
+            p95_time = sorted_times[max(0, p95_idx)]
+        else:
+            p95_time = 0.0
+
+        return EvalMetrics(
+            precision_at_k=avg_precision,
+            recall_at_k=avg_recall,
+            mrr=avg_mrr,
+            ndcg_at_k=avg_ndcg,
+            faithfulness=avg_faith,
+            avg_retrieval_ms=avg_time,
+            p95_total_ms=p95_time,
+        )
+
+    def generate_report(self, metrics: EvalMetrics) -> str:
+        """Generate a human-readable markdown report."""
+        lines = [
+            "# RAG Evaluation Report",
+            "",
+            "## Metrics",
+            "",
+            "| Metric | Value |",
+            "|--------|-------|",
+            f"| Precision@K | {metrics.precision_at_k:.3f} |",
+            f"| Recall@K | {metrics.recall_at_k:.3f} |",
+            f"| MRR | {metrics.mrr:.3f} |",
+            f"| NDCG@K | {metrics.ndcg_at_k:.3f} |",
+        ]
+
+        if metrics.faithfulness is not None:
+            lines.append(f"| Faithfulness | {metrics.faithfulness:.3f} |")
+        else:
+            lines.append("| Faithfulness | N/A (no LLM) |")
+
+        lines.extend([
+            f"| Avg Retrieval (ms) | {metrics.avg_retrieval_ms:.1f} |",
+            f"| P95 Latency (ms) | {metrics.p95_total_ms:.1f} |",
+            "",
+            "## Quality Gates",
+            "",
+            "| Gate | Threshold | Value | Status |",
+            "|------|-----------|-------|--------|",
+        ])
+
+        # Quality gates
+        recall_pass = metrics.recall_at_k > 0.9
+        lines.append(
+            f"| Context Recall | > 90% | {metrics.recall_at_k:.1%} | "
+            f"{'PASS' if recall_pass else 'FAIL'} |"
+        )
+
+        if metrics.faithfulness is not None:
+            faith_pass = metrics.faithfulness > 0.8
+            lines.append(
+                f"| Faithfulness | > 80% | {metrics.faithfulness:.1%} | "
+                f"{'PASS' if faith_pass else 'FAIL'} |"
+            )
+        else:
+            lines.append("| Faithfulness | > 80% | N/A | SKIP |")
+
+        mrr_pass = metrics.mrr > 0.6
+        lines.append(
+            f"| MRR | > 0.6 | {metrics.mrr:.3f} | "
+            f"{'PASS' if mrr_pass else 'FAIL'} |"
+        )
+
+        latency_pass = metrics.p95_total_ms < 2000
+        lines.append(
+            f"| P95 Latency | < 2000ms | {metrics.p95_total_ms:.0f}ms | "
+            f"{'PASS' if latency_pass else 'FAIL'} |"
+        )
+
+        lines.append("")
+
+        return "\n".join(lines)
+
+
+# ---------------------------------------------------------------------------
+# EvalDatasetGenerator
+# ---------------------------------------------------------------------------
+
+class EvalDatasetGenerator:
+    """Generates QA evaluation pairs from indexed documents."""
+
+    def __init__(self, llm_client: Any | None = None):
+        self.llm_client = llm_client
+
+    async def generate(
+        self,
+        documents: list[Any],
+        num_pairs: int = 200,
+    ) -> EvalDataset:
+        """Generate an evaluation dataset from documents."""
+        items: list[EvalItem] = []
+
+        for doc in documents:
+            if len(items) >= num_pairs:
+                break
+
+            if self.llm_client is not None:
+                try:
+                    qa_pairs = await self.llm_client.generate_qa(doc.content)
+                    for pair in qa_pairs:
+                        items.append(EvalItem(
+                            query=pair["question"],
+                            expected_answer=pair["answer"],
+                            expected_doc_ids=[doc.doc_id],
+                            tags=list(doc.metadata.get("tags", [])),
+                        ))
+                except Exception as e:
+                    logger.warning("qa_generation_failed", doc_id=doc.doc_id, error=str(e))
+            else:
+                # Fallback: generate simple question from content
+                items.append(EvalItem(
+                    query=f"What does the document say about: {doc.content[:50]}?",
+                    expected_answer=doc.content[:200],
+                    expected_doc_ids=[doc.doc_id],
+                    tags=list(doc.metadata.get("tags", [])),
+                ))
+
+        # Add hard negatives (~15% of total)
+        num_negatives = max(1, int(len(items) * 0.15))
+        for i in range(num_negatives):
+            items.append(EvalItem(
+                query=f"What is the meaning of life according to document {i}?",
+                expected_answer="",
+                expected_doc_ids=[],
+                tags=["hard_negative"],
+            ))
+
+        return EvalDataset(items=items)
+
+
+# ---------------------------------------------------------------------------
+# CLI Entrypoint
+# ---------------------------------------------------------------------------
+
+if __name__ == "__main__":
+    import argparse
+    import asyncio
+    import sys
+
+    parser = argparse.ArgumentParser(
+        description="Run RAG evaluation against a dataset.",
+    )
+    parser.add_argument(
+        "--dataset", required=True,
+        help="Path to JSON dataset file",
+    )
+    parser.add_argument(
+        "--k", type=int, default=5,
+        help="Number of top results to evaluate (default: 5)",
+    )
+    parser.add_argument(
+        "--output", default=None,
+        help="Output file path for markdown report (default: stdout)",
+    )
+
+    args = parser.parse_args()
+
+    # Validate dataset path
+    if not Path(args.dataset).exists():
+        print(f"Error: Dataset file not found: {args.dataset}", file=sys.stderr)
+        sys.exit(1)
+
+    try:
+        dataset = EvalDataset.from_json(args.dataset)
+    except (json.JSONDecodeError, KeyError) as e:
+        print(f"Error: Malformed dataset JSON: {e}", file=sys.stderr)
+        sys.exit(1)
+
+    async def _run() -> None:
+        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig
+
+        engine = HybridRAGEngine(config=RAGConfig())
+
+        # Load documents from the dataset file if present
+        for doc_data in dataset.documents:
+            await engine.add_document(
+                content=doc_data.get("content", ""),
+                metadata=doc_data.get("metadata", {}),
+                doc_id=doc_data.get("doc_id"),
+            )
+
+        evaluator = RAGEvaluator()
+        metrics = await evaluator.evaluate(engine, dataset, k=args.k)
+        report = evaluator.generate_report(metrics)
+
+        if args.output:
+            Path(args.output).write_text(report)
+            print(f"Report written to {args.output}")
+        else:
+            print(report)
+
+        await engine.cleanup()
+
+    asyncio.run(_run())
diff --git a/python-backend/app/orchestrator/rag/hybrid_rag.py b/python-backend/app/orchestrator/rag/hybrid_rag.py
index b7a03f9..0489e14 100644
--- a/python-backend/app/orchestrator/rag/hybrid_rag.py
+++ b/python-backend/app/orchestrator/rag/hybrid_rag.py
@@ -423,7 +423,20 @@ class HybridRAGEngine:
         if self.config.use_cache and cache_key in self._cache:
             cached_result, cached_time = self._cache[cache_key]
             if (datetime.utcnow() - cached_time).total_seconds() < self.config.cache_ttl_seconds:
-                logger.debug("cache_hit", query=query[:50])
+                scope_count = len(effective_scopes) if effective_scopes else 0
+                logger.info(
+                    "rag_retrieval_complete",
+                    query=query[:50],
+                    mode=mode.value,
+                    results=cached_result.final_count,
+                    total_ms=cached_result.total_time_ms,
+                    quality="unknown",
+                    confidence=0.0,
+                    query_strategy=strategy_val,
+                    rerank_strategy="none",
+                    scope_filter_count=scope_count,
+                    cache_hit=True,
+                )
                 return cached_result
 
         start_time = datetime.utcnow()
@@ -524,12 +537,35 @@ class HybridRAGEngine:
             if self.config.use_cache:
                 self._cache[cache_key] = (result, datetime.utcnow())
             
+            # Compute observability fields
+            _quality = "unknown"
+            _confidence = 0.0
+            try:
+                from app.orchestrator.rag.guardrails import RetrievalGuardrails
+                _assessment = RetrievalGuardrails(failure_mode="permissive").assess(result)
+                _quality = _assessment.quality.value
+                _confidence = _assessment.confidence_score
+            except Exception:
+                pass
+
+            _query_strategy = getattr(processed, "strategy_used", "passthrough")
+            _rerank_strategy = "none"
+            if self.config.use_rerank and mode == SearchMode.HYBRID:
+                _rerank_strategy = getattr(self._reranker, "last_strategy_used", "cross_encoder")
+            _scope_count = len(effective_scopes) if effective_scopes else 0
+
             logger.info(
                 "rag_retrieval_complete",
                 query=query[:50],
                 mode=mode.value,
                 results=result.final_count,
                 total_ms=result.total_time_ms,
+                quality=_quality,
+                confidence=_confidence,
+                query_strategy=_query_strategy,
+                rerank_strategy=_rerank_strategy,
+                scope_filter_count=_scope_count,
+                cache_hit=False,
             )
 
             # Bill for semantic/hybrid searches (BM25-only is free)
diff --git a/python-backend/tests/orchestrator/rag/test_eval_dataset.py b/python-backend/tests/orchestrator/rag/test_eval_dataset.py
new file mode 100644
index 0000000..879cce2
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_eval_dataset.py
@@ -0,0 +1,94 @@
+"""Tests for EvalDatasetGenerator -- Phase 5.2."""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock
+
+from app.orchestrator.rag.evaluator import (
+    EvalDatasetGenerator,
+    EvalItem,
+    EvalDataset,
+)
+from app.orchestrator.rag.hybrid_rag import Document
+
+
+@pytest.fixture
+def generator():
+    return EvalDatasetGenerator()
+
+
+@pytest.fixture
+def sample_documents():
+    return [
+        Document(
+            doc_id="doc-1",
+            content="Our refund policy allows returns within 30 days of purchase. "
+                    "Items must be in original condition with receipt.",
+            metadata={"title": "Refund Policy", "section": "Returns"},
+        ),
+        Document(
+            doc_id="doc-2",
+            content="To reset your password, navigate to Settings > Security > "
+                    "Reset Password. You will receive a verification email.",
+            metadata={"title": "User Guide", "section": "Account Security"},
+        ),
+        Document(
+            doc_id="doc-3",
+            content="Our premium plan includes unlimited API calls, priority support, "
+                    "and custom integrations starting at $99/month.",
+            metadata={"title": "Pricing", "section": "Plans"},
+        ),
+    ]
+
+
+class TestGeneratorProducesValidPairs:
+    @pytest.mark.asyncio
+    async def test_generates_qa_pairs(self, generator, sample_documents):
+        """Generator must produce EvalItem objects from documents."""
+        dataset = await generator.generate(sample_documents, num_pairs=3)
+        assert isinstance(dataset, EvalDataset)
+        # Should have at least the requested pairs + hard negatives
+        assert len(dataset.items) >= 3
+
+    @pytest.mark.asyncio
+    async def test_each_pair_has_required_fields(self, generator, sample_documents):
+        """Each EvalItem must have query, expected_answer, expected_doc_ids."""
+        dataset = await generator.generate(sample_documents, num_pairs=2)
+        for item in dataset.items:
+            assert isinstance(item, EvalItem)
+            assert item.query
+            assert isinstance(item.expected_doc_ids, list)
+
+    @pytest.mark.asyncio
+    async def test_expected_doc_ids_point_to_source(self, generator, sample_documents):
+        """expected_doc_ids must reference the source document's doc_id."""
+        dataset = await generator.generate(sample_documents, num_pairs=3)
+        valid_ids = {doc.doc_id for doc in sample_documents}
+        for item in dataset.items:
+            if "hard_negative" not in item.tags:
+                for doc_id in item.expected_doc_ids:
+                    assert doc_id in valid_ids
+
+
+class TestHardNegatives:
+    @pytest.mark.asyncio
+    async def test_hard_negatives_included(self, generator, sample_documents):
+        """Dataset must include items with empty expected_doc_ids."""
+        dataset = await generator.generate(sample_documents, num_pairs=5)
+        negatives = [i for i in dataset.items if not i.expected_doc_ids]
+        assert len(negatives) >= 1
+
+    @pytest.mark.asyncio
+    async def test_hard_negatives_have_clear_tags(self, generator, sample_documents):
+        """Hard negative items must be tagged with 'hard_negative'."""
+        dataset = await generator.generate(sample_documents, num_pairs=5)
+        negatives = [i for i in dataset.items if not i.expected_doc_ids]
+        for neg in negatives:
+            assert "hard_negative" in neg.tags
+
+
+class TestDatasetSize:
+    @pytest.mark.asyncio
+    async def test_minimum_pair_count(self, generator, sample_documents):
+        """Dataset must have at least the requested num_pairs items."""
+        dataset = await generator.generate(sample_documents, num_pairs=3)
+        assert len(dataset.items) >= 3
diff --git a/python-backend/tests/orchestrator/rag/test_evaluator.py b/python-backend/tests/orchestrator/rag/test_evaluator.py
new file mode 100644
index 0000000..d84c55b
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_evaluator.py
@@ -0,0 +1,261 @@
+"""Tests for RAGEvaluator -- Phase 5.1."""
+
+import math
+import pytest
+from unittest.mock import AsyncMock, MagicMock
+
+from app.orchestrator.rag.evaluator import (
+    RAGEvaluator,
+    EvalItem,
+    EvalDataset,
+    EvalMetrics,
+)
+from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
+
+
+@pytest.fixture
+def evaluator():
+    return RAGEvaluator()
+
+
+@pytest.fixture
+def sample_eval_items():
+    return [
+        EvalItem(
+            query="What is the refund policy?",
+            expected_answer="Returns within 30 days.",
+            expected_doc_ids=["doc-1", "doc-2"],
+            tags=["policy"],
+        ),
+        EvalItem(
+            query="How to reset password?",
+            expected_answer="Go to settings and click reset.",
+            expected_doc_ids=["doc-3"],
+            tags=["faq"],
+        ),
+    ]
+
+
+@pytest.fixture
+def sample_dataset(sample_eval_items):
+    return EvalDataset(items=sample_eval_items)
+
+
+# ---------------------------------------------------------------------------
+# Precision@K
+# ---------------------------------------------------------------------------
+
+class TestPrecisionAtK:
+    def test_precision_3_of_5(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-2", "doc-x", "doc-3", "doc-y"]
+        relevant_ids = {"doc-1", "doc-2", "doc-3"}
+        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=5)
+        assert abs(precision - 0.6) < 1e-9
+
+    def test_precision_all_relevant(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-2", "doc-3"]
+        relevant_ids = {"doc-1", "doc-2", "doc-3"}
+        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=3)
+        assert abs(precision - 1.0) < 1e-9
+
+    def test_precision_none_relevant(self, evaluator):
+        retrieved_ids = ["doc-x", "doc-y"]
+        relevant_ids = {"doc-1", "doc-2"}
+        precision = evaluator._precision_at_k(retrieved_ids, relevant_ids, k=2)
+        assert abs(precision - 0.0) < 1e-9
+
+    def test_precision_empty_results(self, evaluator):
+        precision = evaluator._precision_at_k([], {"doc-1"}, k=5)
+        assert precision == 0.0
+
+
+# ---------------------------------------------------------------------------
+# Recall@K
+# ---------------------------------------------------------------------------
+
+class TestRecallAtK:
+    def test_recall_3_of_10(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-x", "doc-2", "doc-3", "doc-y"]
+        relevant_ids = {f"doc-{i}" for i in range(1, 11)}
+        recall = evaluator._recall_at_k(retrieved_ids, relevant_ids, k=5)
+        assert abs(recall - 0.3) < 1e-9
+
+    def test_recall_all_found(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-2"]
+        relevant_ids = {"doc-1", "doc-2"}
+        recall = evaluator._recall_at_k(retrieved_ids, relevant_ids, k=5)
+        assert abs(recall - 1.0) < 1e-9
+
+    def test_recall_no_relevant_docs(self, evaluator):
+        recall = evaluator._recall_at_k(["doc-x"], set(), k=5)
+        assert recall == 0.0
+
+
+# ---------------------------------------------------------------------------
+# MRR
+# ---------------------------------------------------------------------------
+
+class TestMRR:
+    def test_mrr_first_at_3(self, evaluator):
+        retrieved_ids = ["doc-x", "doc-y", "doc-1", "doc-2"]
+        relevant_ids = {"doc-1", "doc-2"}
+        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
+        assert abs(rr - 1 / 3) < 1e-9
+
+    def test_mrr_first_at_1(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-x"]
+        relevant_ids = {"doc-1"}
+        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
+        assert abs(rr - 1.0) < 1e-9
+
+    def test_mrr_none_relevant(self, evaluator):
+        retrieved_ids = ["doc-x", "doc-y"]
+        relevant_ids = {"doc-1"}
+        rr = evaluator._reciprocal_rank(retrieved_ids, relevant_ids)
+        assert rr == 0.0
+
+
+# ---------------------------------------------------------------------------
+# NDCG@K
+# ---------------------------------------------------------------------------
+
+class TestNDCG:
+    def test_ndcg_binary_relevance(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-x", "doc-2", "doc-y", "doc-3"]
+        relevant_ids = {"doc-1", "doc-2", "doc-3"}
+        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=5)
+        dcg = 1.0 / math.log2(2) + 1.0 / math.log2(4) + 1.0 / math.log2(6)
+        idcg = 1.0 / math.log2(2) + 1.0 / math.log2(3) + 1.0 / math.log2(4)
+        expected = dcg / idcg
+        assert abs(ndcg - expected) < 1e-6
+
+    def test_ndcg_perfect_ranking(self, evaluator):
+        retrieved_ids = ["doc-1", "doc-2", "doc-3"]
+        relevant_ids = {"doc-1", "doc-2", "doc-3"}
+        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=3)
+        assert abs(ndcg - 1.0) < 1e-9
+
+    def test_ndcg_no_relevant(self, evaluator):
+        retrieved_ids = ["doc-x", "doc-y"]
+        relevant_ids = {"doc-1"}
+        ndcg = evaluator._ndcg_at_k(retrieved_ids, relevant_ids, k=2)
+        assert ndcg == 0.0
+
+
+# ---------------------------------------------------------------------------
+# Faithfulness
+# ---------------------------------------------------------------------------
+
+class TestFaithfulness:
+    @pytest.mark.asyncio
+    async def test_faithfulness_all_supported(self):
+        llm = AsyncMock()
+        llm.extract_claims = AsyncMock(return_value=["claim1", "claim2"])
+        llm.verify_claim = AsyncMock(return_value=True)
+        evaluator = RAGEvaluator(llm_client=llm)
+        result = await evaluator._faithfulness("answer", "context")
+        assert result == 1.0
+
+    @pytest.mark.asyncio
+    async def test_faithfulness_partial(self):
+        llm = AsyncMock()
+        llm.extract_claims = AsyncMock(return_value=["c1", "c2", "c3", "c4"])
+        llm.verify_claim = AsyncMock(side_effect=[True, True, False, False])
+        evaluator = RAGEvaluator(llm_client=llm)
+        result = await evaluator._faithfulness("answer", "context")
+        assert abs(result - 0.5) < 1e-9
+
+    @pytest.mark.asyncio
+    async def test_faithfulness_none_supported(self):
+        llm = AsyncMock()
+        llm.extract_claims = AsyncMock(return_value=["c1", "c2"])
+        llm.verify_claim = AsyncMock(return_value=False)
+        evaluator = RAGEvaluator(llm_client=llm)
+        result = await evaluator._faithfulness("answer", "context")
+        assert result == 0.0
+
+    @pytest.mark.asyncio
+    async def test_faithfulness_skipped_without_llm(self, evaluator):
+        result = await evaluator._faithfulness("answer", "context")
+        assert result is None
+
+
+# ---------------------------------------------------------------------------
+# Evaluate Dataset
+# ---------------------------------------------------------------------------
+
+class TestEvaluateDataset:
+    @pytest.mark.asyncio
+    async def test_evaluate_returns_all_metrics(self, evaluator, sample_dataset):
+        engine = AsyncMock()
+        engine.retrieve = AsyncMock(return_value=RAGResult(
+            query="test",
+            documents=[
+                Document(doc_id="doc-1", content="test", final_score=0.9),
+                Document(doc_id="doc-3", content="test", final_score=0.8),
+            ],
+            final_count=2,
+            total_time_ms=100,
+        ))
+        metrics = await evaluator.evaluate(engine, sample_dataset, k=5)
+        assert isinstance(metrics, EvalMetrics)
+        assert metrics.precision_at_k >= 0
+        assert metrics.recall_at_k >= 0
+        assert metrics.mrr >= 0
+        assert metrics.ndcg_at_k >= 0
+        assert metrics.avg_retrieval_ms >= 0
+
+    @pytest.mark.asyncio
+    async def test_evaluate_single_returns_per_item(self, evaluator, sample_eval_items):
+        engine = AsyncMock()
+        engine.retrieve = AsyncMock(return_value=RAGResult(
+            query="test",
+            documents=[Document(doc_id="doc-1", content="test", final_score=0.9)],
+            final_count=1,
+            total_time_ms=50,
+        ))
+        result = await evaluator.evaluate_single(engine, sample_eval_items[0], k=5)
+        assert "query" in result
+        assert "retrieved_ids" in result
+        assert "precision" in result
+        assert "recall" in result
+        assert "reciprocal_rank" in result
+        assert "ndcg" in result
+
+
+# ---------------------------------------------------------------------------
+# Report Generation
+# ---------------------------------------------------------------------------
+
+class TestReportGeneration:
+    def test_report_contains_metrics(self, evaluator):
+        metrics = EvalMetrics(
+            precision_at_k=0.6, recall_at_k=0.3, mrr=0.333,
+            ndcg_at_k=0.75, faithfulness=0.8,
+            avg_retrieval_ms=145.0, p95_total_ms=320.0,
+        )
+        report = evaluator.generate_report(metrics)
+        assert "Precision@K" in report
+        assert "Recall@K" in report
+        assert "MRR" in report
+        assert "NDCG@K" in report
+        assert "Faithfulness" in report
+        assert "0.6" in report
+
+    def test_report_includes_quality_gates(self, evaluator):
+        metrics = EvalMetrics(
+            precision_at_k=0.6, recall_at_k=0.95, mrr=0.7,
+            ndcg_at_k=0.8, faithfulness=0.85,
+            avg_retrieval_ms=145.0, p95_total_ms=1500.0,
+        )
+        report = evaluator.generate_report(metrics)
+        assert "PASS" in report
+
+    def test_report_shows_failing_gates(self, evaluator):
+        metrics = EvalMetrics(
+            precision_at_k=0.2, recall_at_k=0.3, mrr=0.2,
+            ndcg_at_k=0.4, faithfulness=0.5,
+            avg_retrieval_ms=500.0, p95_total_ms=3000.0,
+        )
+        report = evaluator.generate_report(metrics)
+        assert "FAIL" in report
diff --git a/python-backend/tests/orchestrator/rag/test_evaluator_cli.py b/python-backend/tests/orchestrator/rag/test_evaluator_cli.py
new file mode 100644
index 0000000..13e6550
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_evaluator_cli.py
@@ -0,0 +1,186 @@
+"""Tests for evaluator CLI entrypoint -- Phase 5.4."""
+
+import json
+import os
+import sys
+import tempfile
+import pytest
+
+from app.orchestrator.rag.evaluator import EvalDataset, EvalItem
+
+
+class TestCLIWithValidDataset:
+    def test_cli_exits_cleanly(self):
+        """CLI must exit with code 0 for valid inputs."""
+        # Create a temp dataset
+        dataset = {
+            "items": [
+                {
+                    "query": "What is the refund policy?",
+                    "expected_answer": "Returns within 30 days.",
+                    "expected_doc_ids": ["doc-1"],
+                    "tags": ["policy"],
+                }
+            ],
+            "documents": [
+                {
+                    "doc_id": "doc-1",
+                    "content": "Our refund policy allows returns within 30 days.",
+                    "metadata": {"title": "Policies"},
+                }
+            ],
+        }
+        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
+            json.dump(dataset, f)
+            dataset_path = f.name
+
+        try:
+            import subprocess
+            result = subprocess.run(
+                [
+                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
+                    "--dataset", dataset_path,
+                    "--k", "5",
+                ],
+                cwd="/home/dev/projects/SmartSpecPro/python-backend",
+                capture_output=True,
+                text=True,
+                timeout=30,
+                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
+            )
+            assert result.returncode == 0, f"CLI failed: {result.stderr}"
+        finally:
+            os.unlink(dataset_path)
+
+
+class TestCLIProducesOutputFile:
+    def test_output_file_created(self):
+        """CLI must create the output file at the specified path."""
+        dataset = {
+            "items": [
+                {
+                    "query": "Test query?",
+                    "expected_answer": "Answer.",
+                    "expected_doc_ids": ["doc-1"],
+                }
+            ],
+            "documents": [
+                {"doc_id": "doc-1", "content": "Test content.", "metadata": {}}
+            ],
+        }
+        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
+            json.dump(dataset, f)
+            dataset_path = f.name
+
+        output_path = tempfile.mktemp(suffix=".md")
+
+        try:
+            import subprocess
+            result = subprocess.run(
+                [
+                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
+                    "--dataset", dataset_path,
+                    "--output", output_path,
+                ],
+                cwd="/home/dev/projects/SmartSpecPro/python-backend",
+                capture_output=True,
+                text=True,
+                timeout=30,
+                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
+            )
+            assert result.returncode == 0, f"CLI failed: {result.stderr}"
+            assert os.path.exists(output_path)
+            content = open(output_path).read()
+            assert len(content) > 0
+        finally:
+            os.unlink(dataset_path)
+            if os.path.exists(output_path):
+                os.unlink(output_path)
+
+
+class TestCLIOutputContent:
+    def test_output_has_all_metrics(self):
+        """Output file must contain all metric category headers."""
+        dataset = {
+            "items": [
+                {
+                    "query": "Test?",
+                    "expected_answer": "Yes.",
+                    "expected_doc_ids": ["doc-1"],
+                }
+            ],
+            "documents": [
+                {"doc_id": "doc-1", "content": "Test content.", "metadata": {}}
+            ],
+        }
+        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
+            json.dump(dataset, f)
+            dataset_path = f.name
+
+        output_path = tempfile.mktemp(suffix=".md")
+
+        try:
+            import subprocess
+            result = subprocess.run(
+                [
+                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
+                    "--dataset", dataset_path,
+                    "--output", output_path,
+                ],
+                cwd="/home/dev/projects/SmartSpecPro/python-backend",
+                capture_output=True,
+                text=True,
+                timeout=30,
+                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
+            )
+            assert result.returncode == 0
+            content = open(output_path).read()
+            assert "Precision@K" in content
+            assert "Recall@K" in content
+            assert "MRR" in content
+            assert "NDCG@K" in content
+        finally:
+            os.unlink(dataset_path)
+            if os.path.exists(output_path):
+                os.unlink(output_path)
+
+
+class TestCLIInvalidDataset:
+    def test_invalid_path_error_message(self):
+        """CLI must show clear error for non-existent dataset path."""
+        import subprocess
+        result = subprocess.run(
+            [
+                sys.executable, "-m", "app.orchestrator.rag.evaluator",
+                "--dataset", "/nonexistent/path.json",
+            ],
+            cwd="/home/dev/projects/SmartSpecPro/python-backend",
+            capture_output=True,
+            text=True,
+            timeout=10,
+            env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
+        )
+        assert result.returncode != 0
+        assert "not found" in result.stderr.lower() or "error" in result.stderr.lower()
+
+    def test_malformed_json_error(self):
+        """CLI must show clear error for malformed JSON dataset."""
+        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
+            f.write("{invalid json")
+            path = f.name
+        try:
+            import subprocess
+            result = subprocess.run(
+                [
+                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
+                    "--dataset", path,
+                ],
+                cwd="/home/dev/projects/SmartSpecPro/python-backend",
+                capture_output=True,
+                text=True,
+                timeout=10,
+                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
+            )
+            assert result.returncode != 0
+        finally:
+            os.unlink(path)
diff --git a/python-backend/tests/orchestrator/rag/test_observability.py b/python-backend/tests/orchestrator/rag/test_observability.py
new file mode 100644
index 0000000..31f3129
--- /dev/null
+++ b/python-backend/tests/orchestrator/rag/test_observability.py
@@ -0,0 +1,169 @@
+"""Tests for observability enhancements -- Phase 5.3."""
+
+import json
+import pytest
+
+from app.orchestrator.rag.hybrid_rag import (
+    HybridRAGEngine,
+    RAGConfig,
+    SearchMode,
+)
+
+
+@pytest.fixture
+def engine_with_docs():
+    """Engine with caching/reranking disabled for test isolation."""
+    config = RAGConfig(
+        mode=SearchMode.HYBRID,
+        use_rerank=False,
+        use_cache=False,
+    )
+    return HybridRAGEngine(config=config)
+
+
+def _extract_log_event(caplog, event_name: str) -> dict | None:
+    """Extract a structured log event from caplog records."""
+    for record in caplog.records:
+        msg = record.getMessage()
+        try:
+            data = json.loads(msg)
+            if data.get("event") == event_name:
+                return data
+        except (json.JSONDecodeError, TypeError):
+            if event_name in msg:
+                return {"raw": msg}
+    return None
+
+
+class TestLogEventIncludesQuality:
+    @pytest.mark.asyncio
+    async def test_quality_in_log(self, engine_with_docs, caplog):
+        engine = engine_with_docs
+        await engine.add_document(
+            content="Test doc content",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
+            doc_id="doc-1",
+        )
+        with caplog.at_level("INFO"):
+            await engine.retrieve(
+                query="test query",
+                tenant_id="t1",
+                effective_scopes=["p:global"],
+            )
+        event = _extract_log_event(caplog, "rag_retrieval_complete")
+        assert event is not None
+        assert "quality" in event
+
+
+class TestLogEventIncludesConfidence:
+    @pytest.mark.asyncio
+    async def test_confidence_in_log(self, engine_with_docs, caplog):
+        engine = engine_with_docs
+        await engine.add_document(
+            content="Test doc",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
+            doc_id="doc-1",
+        )
+        with caplog.at_level("INFO"):
+            await engine.retrieve(
+                query="test",
+                tenant_id="t1",
+                effective_scopes=["p:global"],
+            )
+        event = _extract_log_event(caplog, "rag_retrieval_complete")
+        assert event is not None
+        assert "confidence" in event
+
+
+class TestLogEventIncludesQueryStrategy:
+    @pytest.mark.asyncio
+    async def test_query_strategy_in_log(self, engine_with_docs, caplog):
+        engine = engine_with_docs
+        await engine.add_document(
+            content="Test doc",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
+            doc_id="doc-1",
+        )
+        with caplog.at_level("INFO"):
+            await engine.retrieve(
+                query="test",
+                tenant_id="t1",
+                effective_scopes=["p:global"],
+            )
+        event = _extract_log_event(caplog, "rag_retrieval_complete")
+        assert event is not None
+        assert "query_strategy" in event
+
+
+class TestLogEventIncludesScopeFilterCount:
+    @pytest.mark.asyncio
+    async def test_scope_filter_count_in_log(self, engine_with_docs, caplog):
+        engine = engine_with_docs
+        await engine.add_document(
+            content="Test doc",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
+            doc_id="doc-1",
+        )
+        with caplog.at_level("INFO"):
+            await engine.retrieve(
+                query="test",
+                tenant_id="t1",
+                effective_scopes=["u:42", "g:10", "p:global"],
+            )
+        event = _extract_log_event(caplog, "rag_retrieval_complete")
+        assert event is not None
+        assert "scope_filter_count" in event
+        assert event["scope_filter_count"] == 3
+
+
+class TestLogEventIncludesCacheHit:
+    @pytest.mark.asyncio
+    async def test_cache_hit_false(self, engine_with_docs, caplog):
+        engine = engine_with_docs
+        await engine.add_document(
+            content="Test doc",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
+            doc_id="doc-1",
+        )
+        with caplog.at_level("INFO"):
+            await engine.retrieve(
+                query="test",
+                tenant_id="t1",
+                effective_scopes=["p:global"],
+            )
+        event = _extract_log_event(caplog, "rag_retrieval_complete")
+        assert event is not None
+        assert "cache_hit" in event
+        assert event["cache_hit"] is False
+
+    @pytest.mark.asyncio
+    async def test_cache_hit_true(self, caplog):
+        config = RAGConfig(
+            mode=SearchMode.HYBRID,
+            use_rerank=False,
+            use_cache=True,
+        )
+        engine = HybridRAGEngine(config=config)
+        await engine.add_document(
+            content="Test doc",
+            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
+            doc_id="doc-1",
+        )
+        # First call: populate cache
+        await engine.retrieve(
+            query="test",
+            tenant_id="t1",
+            effective_scopes=["p:global"],
+        )
+        # Second call: should hit cache
+        caplog.clear()
+        with caplog.at_level("INFO"):
+            await engine.retrieve(
+                query="test",
+                tenant_id="t1",
+                effective_scopes=["p:global"],
+            )
+        event = _extract_log_event(caplog, "rag_retrieval_complete")
+        assert event is not None
+        assert "cache_hit" in event
+        assert event["cache_hit"] is True
diff --git a/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json b/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json
index d08ac33..a7565b6 100644
--- a/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json
+++ b/specs/feature/019-RAG-MaturityAssessment/implementation/deep_implement_config.json
@@ -40,6 +40,10 @@
     "section-06-guardrails-and-citations": {
       "status": "complete",
       "commit_hash": "c5b0eda"
+    },
+    "section-07-rag-executor": {
+      "status": "complete",
+      "commit_hash": "c66a43e"
     }
   },
   "pre_commit": {
diff --git a/specs/feature/021-CanvasEditor/implementation-progress.md b/specs/feature/021-CanvasEditor/implementation-progress.md
index 728e241..59fbb50 100644
--- a/specs/feature/021-CanvasEditor/implementation-progress.md
+++ b/specs/feature/021-CanvasEditor/implementation-progress.md
@@ -5,3 +5,4 @@
 | section | commit | test_command | result | notable_deviations | blocked_tasks |
 |---|---|---|---|---|---|
 | section-01-canvas-runtime-foundation | c291f29 | `bash -lc "cd apps/web && npm test -- client/src/pages/PresentationEditor.test.tsx client/src/lib/presentationRouting.test.ts client/src/lib/presentationEditorState.test.ts"` | pass (14/14) | DOM stage scaffold used instead of full `react-konva` runtime in this section | `canvas-stage-konva-runtime (blocked)` |
+| section-02-v2-schema-and-contracts | ca5e35d | `bash -lc "cd apps/web && npm test -- shared/presentation/contracts.test.ts client/src/lib/presentationEditorState.test.ts server/services/presentationService.test.ts server/routers/presentation.test.ts"` | pass (27/27) | `shape` remains represented as `rect` discriminator in shared schema | `canvas-stage-konva-runtime (blocked)` |
