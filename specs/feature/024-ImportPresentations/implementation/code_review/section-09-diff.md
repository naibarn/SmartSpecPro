diff --git a/apps/web/client/src/pages/PresentationEditor.import.test.tsx b/apps/web/client/src/pages/PresentationEditor.import.test.tsx
new file mode 100644
index 0000000..6115653
--- /dev/null
+++ b/apps/web/client/src/pages/PresentationEditor.import.test.tsx
@@ -0,0 +1,279 @@
+import { describe, expect, it, vi, beforeEach } from "vitest";
+import { fireEvent, render, screen, waitFor } from "@testing-library/react";
+
+/**
+ * Focused import-integration tests for PresentationEditor.
+ *
+ * These verify that the Import toolbar button opens/closes the
+ * ImportPresentationDialog correctly.  The heavy editor mocks mirror
+ * PresentationEditor.test.tsx — only the assertions are import-specific.
+ */
+
+// ---- route mocks ----
+const setLocationMock = vi.fn();
+const routeParamsMock = { docId: "42" };
+
+// ---- mutation mocks ----
+const mutationMocks = {
+  updateItem: vi.fn(),
+  updateDeck: vi.fn(),
+  saveAsTemplate: vi.fn(),
+  restoreVersion: vi.fn(),
+  addSlide: vi.fn(),
+  duplicateSlide: vi.fn(),
+  deleteSlide: vi.fn(),
+  reorderSlides: vi.fn(),
+  updateSlide: vi.fn(),
+  createDeck: vi.fn(),
+  triggerExport: vi.fn(),
+  setSlideAudio: vi.fn(),
+  setDeckAudio: vi.fn(),
+};
+
+// ---- fixture builders ----
+function buildDeckByItem() {
+  return {
+    deck: {
+      id: 7,
+      libraryItemId: 42,
+      version: 5,
+      title: "Deck",
+      slideCount: 1,
+      totalAssetBytes: 0,
+      updatedAt: new Date(),
+    },
+    slides: [
+      {
+        id: 71,
+        deckId: 7,
+        orderIndex: 0,
+        version: 1,
+        title: "Slide 1",
+        slideContent: { elements: [] },
+        notes: null,
+      },
+    ],
+    assets: [],
+  };
+}
+
+const queryState = {
+  libraryItem: {
+    id: 42,
+    item_type: "presentation",
+    itemType: "presentation",
+    title: "Deck",
+  },
+  libraryMediaList: { total: 0, limit: 50, offset: 0, has_more: false, scope: "all", results: [] },
+  itemLoading: false,
+  guardLoading: false,
+  guard: { allowed: true, itemId: 42, editorRoute: "/presentation-editor/42" },
+  deckByItem: buildDeckByItem(),
+  deckError: null as Error | null,
+  presentationVersions: [] as any[],
+};
+
+// ---- vi.mock declarations (must come before component import) ----
+vi.mock("wouter", () => ({
+  useLocation: () => ["/presentation-editor/42", setLocationMock],
+  useRoute: () => [true, routeParamsMock],
+}));
+
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: () => ({ isLoading: false, isAuthenticated: true }),
+}));
+
+vi.mock("sonner", () => ({
+  toast: { success: vi.fn(), error: vi.fn() },
+}));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    useUtils: () => ({
+      library: {
+        getItem: { invalidate: vi.fn().mockResolvedValue(undefined) },
+        listDocuments: { invalidate: vi.fn().mockResolvedValue(undefined) },
+      },
+      presentation: {
+        listVersions: { invalidate: vi.fn().mockResolvedValue(undefined) },
+      },
+    }),
+    library: {
+      getItem: {
+        useQuery: vi.fn(() => ({
+          data: queryState.libraryItem,
+          isLoading: queryState.itemLoading,
+          error: null,
+        })),
+      },
+      listDocuments: {
+        useQuery: vi.fn(() => ({
+          data: queryState.libraryMediaList,
+          isLoading: false,
+          error: null,
+        })),
+      },
+      updateItem: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.updateItem, isPending: false })),
+      },
+    },
+    presentation: {
+      getSlideshow: {
+        useQuery: vi.fn(() => ({
+          data: {
+            schemaVersion: "presentation_slideshow_v1",
+            deckId: 7,
+            generatedAt: new Date(),
+            slides: [{ slideId: 71, orderIndex: 0, title: "Slide 1", durationMs: 3000, transition: "cut" }],
+          },
+          isLoading: false,
+          error: null,
+        })),
+      },
+      getExportStatus: {
+        useQuery: vi.fn(() => ({ data: null, isLoading: false, error: null })),
+      },
+      listVersions: {
+        useQuery: vi.fn(() => ({
+          data: queryState.presentationVersions,
+          isLoading: false,
+          error: null,
+        })),
+      },
+      guardEditorOpen: {
+        useQuery: vi.fn(() => ({
+          data: queryState.guard,
+          isLoading: queryState.guardLoading,
+          error: null,
+        })),
+      },
+      getDeckByLibraryItem: {
+        useQuery: vi.fn(() => ({
+          data: queryState.deckByItem,
+          isLoading: false,
+          error: queryState.deckError,
+          refetch: vi.fn(),
+        })),
+      },
+      addSlide: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.addSlide, isPending: false })),
+      },
+      duplicateSlide: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.duplicateSlide, isPending: false })),
+      },
+      deleteSlide: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.deleteSlide, isPending: false })),
+      },
+      reorderSlides: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.reorderSlides, isPending: false })),
+      },
+      updateSlide: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.updateSlide, isPending: false })),
+      },
+      createDeck: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.createDeck, isPending: false })),
+      },
+      updateDeck: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.updateDeck, isPending: false })),
+      },
+      saveAsTemplate: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.saveAsTemplate, isPending: false })),
+      },
+      restoreVersion: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.restoreVersion, isPending: false })),
+      },
+      triggerExport: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.triggerExport, isPending: false })),
+      },
+      setSlideAudio: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.setSlideAudio, isPending: false })),
+      },
+      setDeckAudio: {
+        useMutation: vi.fn(() => ({ mutateAsync: mutationMocks.setDeckAudio, isPending: false })),
+      },
+    },
+    presentationImport: {
+      startImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
+      getImportStatus: { useQuery: vi.fn(() => ({ data: null, isLoading: false })) },
+      cancelImport: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })) },
+    },
+  },
+}));
+
+vi.mock("@/components/presentation/ExportDialog", () => ({
+  ExportDialog: ({ open }: { open: boolean }) =>
+    open ? <div data-testid="export-dialog-mock">ExportDialog</div> : null,
+}));
+
+vi.mock("@/components/presentation/ImportPresentationDialog", () => ({
+  ImportPresentationDialog: ({ onClose }: { onClose: () => void }) => (
+    <div data-testid="import-dialog-mock">
+      ImportPresentationDialog
+      <button onClick={onClose}>Close Import</button>
+    </div>
+  ),
+}));
+
+vi.mock("@/components/presentation/SlideAudioPanel", () => ({
+  SlideAudioPanel: () => <div data-testid="slide-audio-panel-mock">SlideAudioPanel</div>,
+}));
+
+import PresentationEditor from "./PresentationEditor";
+
+describe("PresentationEditor — Import integration", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.useRealTimers();
+    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1200 });
+    mutationMocks.addSlide.mockResolvedValue({});
+    mutationMocks.updateItem.mockResolvedValue({});
+    mutationMocks.updateDeck.mockResolvedValue({});
+    mutationMocks.saveAsTemplate.mockResolvedValue({ item: { id: 500, title: "Template" } });
+    mutationMocks.restoreVersion.mockResolvedValue({ restoredSlideId: 71, restoredSlideVersion: 2, deckVersion: 6 });
+    mutationMocks.duplicateSlide.mockResolvedValue({});
+    mutationMocks.deleteSlide.mockResolvedValue({});
+    mutationMocks.reorderSlides.mockResolvedValue({});
+    mutationMocks.updateSlide.mockResolvedValue({});
+    mutationMocks.createDeck.mockResolvedValue({});
+    mutationMocks.triggerExport.mockResolvedValue({ exportId: 1, status: "queued", deduped: false, message: "Queued" });
+    mutationMocks.setSlideAudio.mockResolvedValue({});
+    mutationMocks.setDeckAudio.mockResolvedValue({});
+    queryState.guard = { allowed: true, itemId: 42, editorRoute: "/presentation-editor/42" };
+    queryState.itemLoading = false;
+    queryState.guardLoading = false;
+    queryState.deckByItem = buildDeckByItem();
+    queryState.deckError = null;
+    queryState.presentationVersions = [];
+  });
+
+  it("renders Import button in the toolbar", () => {
+    render(<PresentationEditor />);
+    expect(screen.getByRole("button", { name: /^import$/i })).toBeInTheDocument();
+  });
+
+  it("renders ImportPresentationDialog when Import button is clicked", async () => {
+    render(<PresentationEditor />);
+
+    expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();
+
+    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+
+    await waitFor(() => {
+      expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument();
+    });
+  });
+
+  it("hides ImportPresentationDialog when onClose is called", async () => {
+    render(<PresentationEditor />);
+
+    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    await waitFor(() => {
+      expect(screen.getByTestId("import-dialog-mock")).toBeInTheDocument();
+    });
+
+    fireEvent.click(screen.getByText("Close Import"));
+    await waitFor(() => {
+      expect(screen.queryByTestId("import-dialog-mock")).not.toBeInTheDocument();
+    });
+  });
+});
