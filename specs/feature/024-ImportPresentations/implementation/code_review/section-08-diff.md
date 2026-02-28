diff --git a/apps/web/client/src/pages/PresentationEditor.test.tsx b/apps/web/client/src/pages/PresentationEditor.test.tsx
index b9accb9..48e1dff 100644
--- a/apps/web/client/src/pages/PresentationEditor.test.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.test.tsx
@@ -331,6 +331,11 @@ vi.mock("@/lib/trpc", () => ({
         })),
       },
     },
+    presentationImport: {
+      startImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
+      getImportStatus: { useQuery: vi.fn(() => ({ data: null, isLoading: false })) },
+      cancelImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
+    },
   },
 }));
 
@@ -339,6 +344,15 @@ vi.mock("@/components/presentation/ExportDialog", () => ({
     open ? <div data-testid="export-dialog-mock">ExportDialog</div> : null,
 }));
 
+vi.mock("@/components/presentation/ImportPresentationDialog", () => ({
+  ImportPresentationDialog: ({ onClose }: { onClose: () => void }) => (
+    <div data-testid="import-dialog-mock">
+      ImportPresentationDialog
+      <button onClick={onClose}>Close Import</button>
+    </div>
+  ),
+}));
+
 vi.mock("@/components/presentation/SlideAudioPanel", () => ({
   SlideAudioPanel: ({ slideId, deckId }: { slideId: number | null; deckId: number }) => (
     <div data-testid="slide-audio-panel-mock" data-slide-id={String(slideId)} data-deck-id={String(deckId)}>
@@ -1329,4 +1343,34 @@ describe("PresentationEditor", () => {
       saveMode: "manual",
     }));
   });
+
+  describe("Import button integration", () => {
+    it('renders an "Import" button in the toolbar', () => {
+      render(<PresentationEditor />);
+      expect(screen.getByRole("button", { name: /^import$/i })).toBeInTheDocument();
+    });
+
+    it("opens ImportPresentationDialog when Import button is clicked", async () => {
+      render(<PresentationEditor />);
+      expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();
+
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+
+      await waitFor(() => {
+        expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument();
+      });
+    });
+
+    it("closes ImportPresentationDialog when onClose is called", async () => {
+      render(<PresentationEditor />);
+
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+      await waitFor(() => expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument());
+
+      fireEvent.click(screen.getByRole("button", { name: /close import/i }));
+      await waitFor(() => {
+        expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();
+      });
+    });
+  });
 });
diff --git a/apps/web/client/src/pages/PresentationEditor.tsx b/apps/web/client/src/pages/PresentationEditor.tsx
index 8a273db..d2d3491 100644
--- a/apps/web/client/src/pages/PresentationEditor.tsx
+++ b/apps/web/client/src/pages/PresentationEditor.tsx
@@ -1,4 +1,4 @@
-import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
+import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactElement } from "react";
 import { useLocation, useRoute } from "wouter";
 import {
   BookMarked,
@@ -20,6 +20,7 @@ import {
   MousePointer2,
   Plus,
   Save,
+  Shapes,
   SkipBack,
   SkipForward,
   RectangleHorizontal,
@@ -30,6 +31,7 @@ import {
   Trash2,
   Type,
   Undo2,
+  Upload,
   X,
   ZoomIn,
   ZoomOut,
@@ -40,6 +42,7 @@ import {
   CANVAS_LIBRARY_ASSET_DRAG_MIME,
   CanvasShell,
   CanvasStage,
+  GraphicsPanel,
   MobileBottomSheet,
   MobileDrawerPanel,
   MobileQuickActions,
@@ -49,6 +52,7 @@ import {
   type CanvasLibraryAsset,
   type CanvasStageDropAssetPayload,
   type MobileBottomSheetTab,
+  type SvgGraphic,
 } from "@/presentation-canvas";
 import {
   AlertDialog,
@@ -77,6 +81,7 @@ import { SelectionEngine } from "@/presentation-canvas/selection/SelectionEngine
 import { CommandBus } from "@/presentation-canvas/commands/CommandBus";
 import { useMobileGestures } from "@/presentation-canvas/mobile/useMobileGestures";
 import { ExportDialog } from "@/components/presentation/ExportDialog";
+import { ImportPresentationDialog } from "@/components/presentation/ImportPresentationDialog";
 import { SlideAudioPanel } from "@/components/presentation/SlideAudioPanel";
 import { useAutosaveController } from "@/presentation-canvas/save/useAutosaveController";
 import {
@@ -519,7 +524,7 @@ function renderReadonlySlideElement(
   index: number,
   canvasWidth: number,
   canvasHeight: number,
-): JSX.Element {
+): ReactElement {
   const commonStyle = {
     left: `${(element.x / canvasWidth) * 100}%`,
     top: `${(element.y / canvasHeight) * 100}%`,
@@ -658,8 +663,8 @@ export default function PresentationEditor() {
     {
       enabled: Boolean(
         docId
-          && itemType === PRESENTATION_ITEM_TYPE
-          && guardQuery.data?.allowed !== false,
+        && itemType === PRESENTATION_ITEM_TYPE
+        && guardQuery.data?.allowed !== false,
       ),
       retry: false,
     },
@@ -717,6 +722,7 @@ export default function PresentationEditor() {
   const [mobileSheetTab, setMobileSheetTab] = useState<MobileBottomSheetTab>("Properties");
   const [desktopInspectorTab, setDesktopInspectorTab] = useState<"properties" | "versions" | "audio">("properties");
   const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
+  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
   const [libraryTab, setLibraryTab] = useState<AssetLibraryTab>("slides");
   const [librarySearchQuery, setLibrarySearchQuery] = useState("");
   const [selectedSavedVersionId, setSelectedSavedVersionId] = useState<number | null>(null);
@@ -1241,6 +1247,28 @@ export default function PresentationEditor() {
     executeCommand(addElementCommand(nextElement));
   }
 
+  function handleInsertGraphic(graphic: SvgGraphic) {
+    const type: PresentationElementType = "image";
+    const id = nextElementId(type);
+    const size = Math.min(activeCanvasSize.width, activeCanvasSize.height) * 0.2;
+    const defaultX = Math.max(0, Math.round((activeCanvasSize.width - size) / 2));
+    const defaultY = Math.max(0, Math.round((activeCanvasSize.height - size) / 2));
+    // Store raw SVG (with currentColor placeholder) so color can be changed later
+    const nextElement = {
+      ...createElement(type, id),
+      src: "",
+      alt: graphic.label,
+      svgContent: graphic.svg,
+      svgColor: "#ffffff",
+      width: Math.round(size),
+      height: Math.round(size),
+      x: defaultX,
+      y: defaultY,
+    };
+    executeCommand(addElementCommand(nextElement as any));
+    setLibraryTab("slides");
+  }
+
   function handleDragAssetStart(event: DragEvent<HTMLElement>, asset: CanvasLibraryAsset) {
     event.dataTransfer.effectAllowed = "copy";
     event.dataTransfer.setData(
@@ -2147,11 +2175,10 @@ export default function PresentationEditor() {
             <button
               key={slide.id}
               type="button"
-              className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${
-                selectedSlideId === slide.id
-                  ? "border-sky-400 bg-sky-500/10 text-sky-800"
-                  : "border-slate-300 bg-white hover:border-slate-400"
-              }`}
+              className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${selectedSlideId === slide.id
+                ? "border-sky-400 bg-sky-500/10 text-sky-800"
+                : "border-slate-300 bg-white hover:border-slate-400"
+                }`}
               onClick={() => setSelectedSlideId(slide.id)}
               aria-label={`Select slide ${slide.orderIndex + 1}`}
               data-testid={`slide-preview-${slide.orderIndex + 1}`}
@@ -2280,11 +2307,10 @@ export default function PresentationEditor() {
                       <button
                         key={version.id}
                         type="button"
-                        className={`w-full rounded border px-2 py-1.5 text-left ${
-                          isSelected
-                            ? "border-sky-300 bg-sky-50"
-                            : "border-slate-200 bg-white hover:border-slate-300"
-                        }`}
+                        className={`w-full rounded border px-2 py-1.5 text-left ${isSelected
+                          ? "border-sky-300 bg-sky-50"
+                          : "border-slate-200 bg-white hover:border-slate-300"
+                          }`}
                         onClick={() => setSelectedSavedVersionId(version.id)}
                         aria-label={`Select Version ${version.versionNumber ?? version.id}`}
                         data-testid={`presentation-version-item-${version.id}`}
@@ -2418,11 +2444,10 @@ export default function PresentationEditor() {
         type="button"
         size="icon"
         variant={libraryTab === "slides" ? "secondary" : "ghost"}
-        className={`h-10 w-10 ${
-          libraryTab === "slides"
-            ? "bg-sky-600 text-white hover:bg-sky-500"
-            : "text-slate-300 hover:bg-slate-800"
-        }`}
+        className={`h-10 w-10 ${libraryTab === "slides"
+          ? "bg-sky-600 text-white hover:bg-sky-500"
+          : "text-slate-300 hover:bg-slate-800"
+          }`}
         onClick={() => setLibraryTab("slides")}
         aria-label="Open Slides Panel"
       >
@@ -2432,11 +2457,10 @@ export default function PresentationEditor() {
         type="button"
         size="icon"
         variant={libraryTab === "photos" ? "secondary" : "ghost"}
-        className={`h-10 w-10 ${
-          libraryTab === "photos"
-            ? "bg-sky-600 text-white hover:bg-sky-500"
-            : "text-slate-300 hover:bg-slate-800"
-        }`}
+        className={`h-10 w-10 ${libraryTab === "photos"
+          ? "bg-sky-600 text-white hover:bg-sky-500"
+          : "text-slate-300 hover:bg-slate-800"
+          }`}
         onClick={() => setLibraryTab("photos")}
         aria-label="Open Photos Library"
       >
@@ -2446,16 +2470,28 @@ export default function PresentationEditor() {
         type="button"
         size="icon"
         variant={libraryTab === "videos" ? "secondary" : "ghost"}
-        className={`h-10 w-10 ${
-          libraryTab === "videos"
-            ? "bg-sky-600 text-white hover:bg-sky-500"
-            : "text-slate-300 hover:bg-slate-800"
-        }`}
+        className={`h-10 w-10 ${libraryTab === "videos"
+          ? "bg-sky-600 text-white hover:bg-sky-500"
+          : "text-slate-300 hover:bg-slate-800"
+          }`}
         onClick={() => setLibraryTab("videos")}
         aria-label="Open Videos Library"
       >
         <Clapperboard className="h-4 w-4" />
       </Button>
+      <Button
+        type="button"
+        size="icon"
+        variant={libraryTab === "graphics" ? "secondary" : "ghost"}
+        className={`h-10 w-10 ${libraryTab === "graphics"
+          ? "bg-sky-600 text-white hover:bg-sky-500"
+          : "text-slate-300 hover:bg-slate-800"
+          }`}
+        onClick={() => setLibraryTab("graphics")}
+        aria-label="Open Graphics Library"
+      >
+        <Shapes className="h-4 w-4" />
+      </Button>
       <div className="my-2 h-px w-8 bg-slate-700" />
       <Button
         type="button"
@@ -2498,6 +2534,7 @@ export default function PresentationEditor() {
       assets={currentLibraryAssets}
       isLoading={libraryLoading}
       slidesPanel={slidesPanel}
+      graphicsPanel={<GraphicsPanel onInsertGraphic={handleInsertGraphic} />}
       onInsertAsset={(asset) => insertLibraryAsset(asset)}
       onDragAssetStart={handleDragAssetStart}
     />
@@ -2988,6 +3025,16 @@ export default function PresentationEditor() {
             <Play className="h-3.5 w-3.5" />
             <span className="hidden sm:inline">Play</span>
           </Button>
+          <Button
+            onClick={() => setIsImportDialogOpen(true)}
+            aria-label="Import"
+            variant="secondary"
+            size="sm"
+            className="gap-1"
+          >
+            <Upload className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">Import</span>
+          </Button>
           <Button
             onClick={() => setIsExportDialogOpen(true)}
             aria-label="Export"
@@ -3175,6 +3222,9 @@ export default function PresentationEditor() {
           deckId={deck.id}
         />
       )}
+      {isImportDialogOpen && (
+        <ImportPresentationDialog onClose={() => setIsImportDialogOpen(false)} />
+      )}
       {isMobileViewport && (
         <MobileDrawerPanel
           isOpen={isMobileDrawerOpen}
