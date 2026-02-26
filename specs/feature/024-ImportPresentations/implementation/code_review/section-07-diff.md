diff --git a/apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx b/apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx
new file mode 100644
index 0000000..ce095ee
--- /dev/null
+++ b/apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx
@@ -0,0 +1,597 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
+import userEvent from "@testing-library/user-event";
+import { ImportPresentationDialog } from "./ImportPresentationDialog";
+
+// ---------------------------------------------------------------------------
+// Hoisted helpers (must be declared before vi.mock calls)
+// ---------------------------------------------------------------------------
+
+const locationSetterMock = vi.hoisted(() => vi.fn());
+
+// ---------------------------------------------------------------------------
+// Mock tRPC
+// ---------------------------------------------------------------------------
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    presentationImport: {
+      startImport: { useMutation: vi.fn() },
+      getImportStatus: { useQuery: vi.fn() },
+      cancelImport: { useMutation: vi.fn() },
+    },
+    googleDrive: {
+      getConnectionStatus: { useQuery: vi.fn() },
+    },
+    library: {
+      uploadFile: { useMutation: vi.fn() },
+    },
+  },
+}));
+
+// Mock the XHR upload helper
+vi.mock("./uploadPptxFile", () => ({
+  uploadPptxFile: vi.fn(),
+}));
+
+// Mock wouter navigation
+vi.mock("wouter", () => ({
+  useLocation: () => ["/", locationSetterMock],
+}));
+
+// ---------------------------------------------------------------------------
+// Import mocked modules (after vi.mock calls)
+// ---------------------------------------------------------------------------
+
+import { trpc } from "@/lib/trpc";
+import { uploadPptxFile } from "./uploadPptxFile";
+
+// ---------------------------------------------------------------------------
+// Helpers
+// ---------------------------------------------------------------------------
+
+function makeMutationMock(overrides?: {
+  mutate?: ReturnType<typeof vi.fn>;
+  mutateAsync?: ReturnType<typeof vi.fn>;
+  isPending?: boolean;
+}) {
+  const mutate = overrides?.mutate ?? vi.fn();
+  const mutateAsync = overrides?.mutateAsync ?? vi.fn().mockResolvedValue(undefined);
+  return {
+    mutate,
+    mutateAsync,
+    isPending: overrides?.isPending ?? false,
+    isError: false,
+    isSuccess: false,
+    reset: vi.fn(),
+  };
+}
+
+function makeQueryMock(data?: Record<string, unknown> | null, opts?: { isLoading?: boolean }) {
+  return {
+    data: data ?? undefined,
+    isLoading: opts?.isLoading ?? false,
+    isError: false,
+  };
+}
+
+function makeFile(name = "test.pptx", size = 1_000_000): File {
+  const file = new File(["x".repeat(Math.min(size, 100))], name, {
+    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
+  });
+  Object.defineProperty(file, "size", { value: size });
+  return file;
+}
+
+const DEFAULT_PROPS = {
+  onClose: vi.fn(),
+};
+
+// ---------------------------------------------------------------------------
+// Default mock setup
+// ---------------------------------------------------------------------------
+
+beforeEach(() => {
+  vi.clearAllMocks();
+
+  vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+    makeMutationMock() as any,
+  );
+  vi.mocked(trpc.presentationImport.cancelImport.useMutation).mockReturnValue(
+    makeMutationMock() as any,
+  );
+  vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+    makeQueryMock() as any,
+  );
+  vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
+    makeQueryMock({ status: "not_connected" }) as any,
+  );
+  vi.mocked(trpc.library.uploadFile.useMutation).mockReturnValue(
+    makeMutationMock() as any,
+  );
+});
+
+// Helper: select a file via the hidden file input
+function selectFile(file: File) {
+  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
+  expect(fileInput).toBeTruthy();
+  fireEvent.change(fileInput, { target: { files: [file] } });
+}
+
+// Helper: switch to Google Slides tab using userEvent (Radix uses pointerdown)
+async function switchToGSlidesTab() {
+  const user = userEvent.setup({ pointerEventsCheck: 0 });
+  const tab = screen.getByRole("tab", { name: /google slides/i });
+  await user.click(tab);
+}
+
+// ---------------------------------------------------------------------------
+// Tests
+// ---------------------------------------------------------------------------
+
+describe("ImportPresentationDialog", () => {
+  // -------------------------------------------------------------------------
+  // File validation (before upload)
+  // -------------------------------------------------------------------------
+
+  it("shows inline error and stays on select step when file exceeds 50 MB", () => {
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+
+    const oversized = makeFile("big.pptx", 52_428_801);
+    selectFile(oversized);
+
+    // Error message specifically about file size
+    expect(screen.getByText(/too large/i)).toBeTruthy();
+
+    // "Import" button is still visible (select step)
+    expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
+  });
+
+  it("does not show error and stays on select step when file is within 50 MB limit", () => {
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+
+    const validFile = makeFile("valid.pptx", 1_000_000);
+    selectFile(validFile);
+
+    // No error message about file size (distinct from "Max 50 MB" badge)
+    expect(screen.queryByText(/too large/i)).toBeNull();
+
+    // Import button is enabled
+    const importBtn = screen.getByRole("button", { name: /^import$/i });
+    expect(importBtn).toBeTruthy();
+    expect((importBtn as HTMLButtonElement).disabled).toBe(false);
+  });
+
+  // -------------------------------------------------------------------------
+  // PPTX upload flow
+  // -------------------------------------------------------------------------
+
+  it("advances step to 'uploading' when Import is clicked with a valid file", async () => {
+    vi.mocked(uploadPptxFile).mockReturnValue(new Promise(() => {})); // never resolves
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    expect(screen.getByText(/uploading/i)).toBeTruthy();
+  });
+
+  it("updates progress bar value as upload progresses", async () => {
+    vi.mocked(uploadPptxFile).mockImplementation(async (_file, onProgress) => {
+      onProgress(50);
+      return { libraryItemId: 99 };
+    });
+
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
+      }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    // Progress bar should be in the DOM (either during upload or processing)
+    await waitFor(() => {
+      const progressBar = document.querySelector('[role="progressbar"]');
+      expect(progressBar).toBeTruthy();
+    });
+  });
+
+  it("calls startImport with sourceType 'pptx' and sourceLibraryItemId after upload success", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+
+    const mockMutateAsync = vi.fn().mockResolvedValue({ conversionId: 7 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({ mutateAsync: mockMutateAsync }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    const file = makeFile("slides.pptx");
+    selectFile(file);
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(mockMutateAsync).toHaveBeenCalledWith(
+        expect.objectContaining({
+          sourceType: "pptx",
+          sourceLibraryItemId: 99,
+          title: expect.any(String),
+        }),
+      );
+    });
+  });
+
+  it("advances step to 'processing' and sets conversionId after upload + startImport success", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
+      }) as any,
+    );
+
+    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "processing",
+        progress: 10,
+        fidelityWarnings: [],
+        deckLibraryItemId: null,
+        error: null,
+      }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByText(/processing/i)).toBeTruthy();
+    });
+  });
+
+  it("advances step to 'error' and shows error message when upload fails", async () => {
+    vi.mocked(uploadPptxFile).mockRejectedValue(new Error("Network error"));
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByText(/Network error/i)).toBeTruthy();
+    });
+  });
+
+  it("calls AbortController.abort() and resets step to 'select' when Cancel is clicked during upload", async () => {
+    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
+    vi.mocked(uploadPptxFile).mockReturnValue(new Promise(() => {})); // never resolves
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    // Should be in uploading step
+    expect(screen.getByText(/uploading/i)).toBeTruthy();
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
+    });
+
+    expect(abortSpy).toHaveBeenCalled();
+
+    // Should be back on select step
+    await waitFor(() => {
+      expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
+    });
+
+    abortSpy.mockRestore();
+  });
+
+  // -------------------------------------------------------------------------
+  // Google Slides flow
+  // -------------------------------------------------------------------------
+
+  it("shows 'Connect Google Drive' button when OAuth is not connected", async () => {
+    vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "not_connected" }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    await switchToGSlidesTab();
+
+    await waitFor(() => {
+      expect(screen.getByRole("button", { name: /connect google drive/i })).toBeTruthy();
+    });
+    expect(screen.queryByPlaceholderText(/docs\.google\.com/i)).toBeNull();
+  });
+
+  it("shows validation error for a non-Google Slides URL", async () => {
+    vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "connected" }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    await switchToGSlidesTab();
+
+    await waitFor(() => {
+      expect(screen.getByPlaceholderText(/docs\.google\.com/i)).toBeTruthy();
+    });
+
+    const input = screen.getByPlaceholderText(/docs\.google\.com/i);
+    fireEvent.change(input, { target: { value: "https://example.com/not-slides" } });
+
+    const mockMutateAsync = vi.fn();
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({ mutateAsync: mockMutateAsync }) as any,
+    );
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    expect(screen.getByText(/valid google slides url/i)).toBeTruthy();
+    expect(mockMutateAsync).not.toHaveBeenCalled();
+  });
+
+  it("calls startImport with sourceType 'google_slides' and slidesUrl for a valid URL", async () => {
+    vi.mocked(trpc.googleDrive.getConnectionStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "connected" }) as any,
+    );
+
+    const mockMutateAsync = vi.fn().mockResolvedValue({ conversionId: 3 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({ mutateAsync: mockMutateAsync }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    await switchToGSlidesTab();
+
+    await waitFor(() => {
+      expect(screen.getByPlaceholderText(/docs\.google\.com/i)).toBeTruthy();
+    });
+
+    const validUrl = "https://docs.google.com/presentation/d/abc123/edit";
+    const input = screen.getByPlaceholderText(/docs\.google\.com/i);
+    fireEvent.change(input, { target: { value: validUrl } });
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(mockMutateAsync).toHaveBeenCalledWith(
+        expect.objectContaining({
+          sourceType: "google_slides",
+          slidesUrl: validUrl,
+        }),
+      );
+    });
+  });
+
+  // -------------------------------------------------------------------------
+  // Processing step (polling)
+  // -------------------------------------------------------------------------
+
+  it("advances step to 'result' when polling returns status 'done'", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
+      }) as any,
+    );
+    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "done",
+        progress: 100,
+        fidelityWarnings: [],
+        deckLibraryItemId: 5,
+        error: null,
+      }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    // After upload + startImport resolve, step becomes "processing"
+    // Then the useEffect sees status "done" and transitions to "result"
+    await waitFor(() => {
+      expect(screen.getByText(/import complete/i)).toBeTruthy();
+    });
+  });
+
+  it("advances step to 'error' and shows error message when polling returns status 'failed'", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
+      }) as any,
+    );
+    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "failed",
+        progress: 0,
+        fidelityWarnings: [],
+        deckLibraryItemId: null,
+        error: "PPTX corrupt",
+      }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByText(/PPTX corrupt/i)).toBeTruthy();
+    });
+  });
+
+  it("calls cancelImport and resets to 'select' when Cancel is clicked during processing", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 42 }),
+      }) as any,
+    );
+    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "processing",
+        progress: 30,
+        fidelityWarnings: [],
+        deckLibraryItemId: null,
+        error: null,
+      }) as any,
+    );
+
+    const mockCancelMutate = vi.fn();
+    vi.mocked(trpc.presentationImport.cancelImport.useMutation).mockReturnValue(
+      makeMutationMock({ mutate: mockCancelMutate }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByText(/processing/i)).toBeTruthy();
+    });
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
+    });
+
+    expect(mockCancelMutate).toHaveBeenCalledWith({ conversionId: 42 });
+
+    await waitFor(() => {
+      expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
+    });
+  });
+
+  // -------------------------------------------------------------------------
+  // Result step
+  // -------------------------------------------------------------------------
+
+  it("renders fidelityWarnings as list items in the result step", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
+      }) as any,
+    );
+    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "done",
+        progress: 100,
+        fidelityWarnings: ["Oval approximated", "Table dropped"],
+        deckLibraryItemId: 5,
+        error: null,
+      }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByText("Oval approximated")).toBeTruthy();
+      expect(screen.getByText("Table dropped")).toBeTruthy();
+    });
+  });
+
+  it("navigates to the correct PresentationEditor route when 'Open Deck' is clicked", async () => {
+    vi.mocked(uploadPptxFile).mockResolvedValue({ libraryItemId: 99 });
+    vi.mocked(trpc.presentationImport.startImport.useMutation).mockReturnValue(
+      makeMutationMock({
+        mutateAsync: vi.fn().mockResolvedValue({ conversionId: 7 }),
+      }) as any,
+    );
+    vi.mocked(trpc.presentationImport.getImportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "done",
+        progress: 100,
+        fidelityWarnings: [],
+        deckLibraryItemId: 17,
+        error: null,
+      }) as any,
+    );
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByRole("button", { name: /open deck/i })).toBeTruthy();
+    });
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /open deck/i }));
+    });
+
+    expect(locationSetterMock).toHaveBeenCalledWith("/presentation/17");
+  });
+
+  // -------------------------------------------------------------------------
+  // Error step
+  // -------------------------------------------------------------------------
+
+  it("resets step to 'select' and clears error when 'Try Again' is clicked", async () => {
+    vi.mocked(uploadPptxFile).mockRejectedValue(new Error("Upload failed"));
+
+    render(<ImportPresentationDialog {...DEFAULT_PROPS} />);
+    selectFile(makeFile());
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
+    });
+
+    await waitFor(() => {
+      expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
+    });
+
+    await act(async () => {
+      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
+    });
+
+    // Back to select step — error message gone, Import button visible
+    expect(screen.queryByText(/upload failed/i)).toBeNull();
+    expect(screen.getByRole("button", { name: /^import$/i })).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/src/components/presentation/ImportPresentationDialog.tsx b/apps/web/client/src/components/presentation/ImportPresentationDialog.tsx
new file mode 100644
index 0000000..eaf00c5
--- /dev/null
+++ b/apps/web/client/src/components/presentation/ImportPresentationDialog.tsx
@@ -0,0 +1,389 @@
+import { useRef, useState, useEffect } from "react";
+import { useLocation } from "wouter";
+import { Loader2, FileUp } from "lucide-react";
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Progress } from "@/components/ui/progress";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import { trpc } from "@/lib/trpc";
+import { uploadPptxFile } from "./uploadPptxFile";
+
+// ---------------------------------------------------------------------------
+// Types
+// ---------------------------------------------------------------------------
+
+type ImportStep = "select" | "uploading" | "processing" | "result" | "error";
+
+interface ImportPresentationDialogProps {
+  /** Called when the dialog should close. */
+  onClose: () => void;
+}
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const MAX_FILE_BYTES = 52_428_800; // 50 MB
+
+const GSLIDES_URL_RE =
+  /^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/;
+
+// ---------------------------------------------------------------------------
+// Component
+// ---------------------------------------------------------------------------
+
+export function ImportPresentationDialog({ onClose }: ImportPresentationDialogProps) {
+  const [, setLocation] = useLocation();
+
+  // --- State machine ---
+  const [step, setStep] = useState<ImportStep>("select");
+  const [activeTab, setActiveTab] = useState<"pptx" | "google_slides">("pptx");
+
+  // PPTX
+  const [selectedFile, setSelectedFile] = useState<File | null>(null);
+  const [fileError, setFileError] = useState<string | null>(null);
+  const [uploadProgress, setUploadProgress] = useState(0);
+  const abortRef = useRef<AbortController | null>(null);
+  const fileInputRef = useRef<HTMLInputElement | null>(null);
+
+  // Google Slides
+  const [slidesUrl, setSlidesUrl] = useState("");
+  const [slidesUrlError, setSlidesUrlError] = useState<string | null>(null);
+
+  // Shared
+  const [conversionId, setConversionId] = useState<number | null>(null);
+  const [errorMessage, setErrorMessage] = useState<string | null>(null);
+
+  // --- tRPC mutations ---
+  const uploadFileMutation = trpc.library.uploadFile.useMutation();
+  const startImportMutation = trpc.presentationImport.startImport.useMutation();
+  const cancelImportMutation = trpc.presentationImport.cancelImport.useMutation();
+
+  // --- tRPC queries ---
+  const connectionStatusQuery = trpc.googleDrive.getConnectionStatus.useQuery(
+    undefined,
+    {
+      enabled: activeTab === "google_slides",
+      retry: false,
+    },
+  );
+
+  const statusQuery = trpc.presentationImport.getImportStatus.useQuery(
+    { conversionId: conversionId! },
+    {
+      enabled: conversionId !== null && step === "processing",
+      refetchInterval: (query) => {
+        const s = query.state.data?.status;
+        return s === "done" || s === "failed" || s === "cancelled" ? false : 2000;
+      },
+      staleTime: 0,
+    },
+  );
+
+  // --- Polling side effect ---
+  useEffect(() => {
+    if (step !== "processing") return;
+    if (!statusQuery.data) return;
+    const { status, error } = statusQuery.data;
+    if (status === "done") {
+      setStep("result");
+    } else if (status === "failed") {
+      setErrorMessage(error ?? "Import failed.");
+      setStep("error");
+    }
+  }, [statusQuery.data, step]);
+
+  // ---------------------------------------------------------------------------
+  // Handlers
+  // ---------------------------------------------------------------------------
+
+  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
+    const file = e.target.files?.[0];
+    if (!file) return;
+    if (file.size > MAX_FILE_BYTES) {
+      setFileError("File is too large. Maximum size is 50 MB.");
+      setSelectedFile(null);
+    } else {
+      setFileError(null);
+      setSelectedFile(file);
+    }
+  }
+
+  async function handlePptxImport() {
+    if (!selectedFile) return;
+    setFileError(null);
+    const controller = new AbortController();
+    abortRef.current = controller;
+    setStep("uploading");
+    setUploadProgress(0);
+
+    try {
+      const { libraryItemId } = await uploadPptxFile(
+        selectedFile,
+        (pct) => setUploadProgress(pct),
+        controller.signal,
+        uploadFileMutation.mutateAsync as any,
+      );
+
+      const result = await startImportMutation.mutateAsync({
+        sourceType: "pptx",
+        sourceLibraryItemId: libraryItemId,
+        title: selectedFile.name.replace(/\.pptx$/i, ""),
+      });
+
+      setConversionId(result.conversionId);
+      setStep("processing");
+    } catch (err) {
+      if (err instanceof DOMException && err.name === "AbortError") {
+        setStep("select");
+      } else {
+        setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
+        setStep("error");
+      }
+    }
+  }
+
+  async function handleGSlidesImport() {
+    setSlidesUrlError(null);
+    if (!GSLIDES_URL_RE.test(slidesUrl)) {
+      setSlidesUrlError(
+        "Enter a valid Google Slides URL (docs.google.com/presentation/d/...)",
+      );
+      return;
+    }
+
+    try {
+      const result = await startImportMutation.mutateAsync({
+        sourceType: "google_slides",
+        slidesUrl,
+      });
+      setConversionId(result.conversionId);
+      setStep("processing");
+    } catch (err) {
+      setErrorMessage(
+        err instanceof Error ? err.message : "Failed to start import.",
+      );
+      setStep("error");
+    }
+  }
+
+  function handleCancelUpload() {
+    abortRef.current?.abort();
+    setStep("select");
+    setUploadProgress(0);
+  }
+
+  function handleCancelProcessing() {
+    if (conversionId !== null) {
+      cancelImportMutation.mutate({ conversionId });
+    }
+    setConversionId(null);
+    setStep("select");
+  }
+
+  function handleTryAgain() {
+    setStep("select");
+    setConversionId(null);
+    setErrorMessage(null);
+    setUploadProgress(0);
+  }
+
+  function handleOpenDeck() {
+    const id = statusQuery.data?.deckLibraryItemId;
+    if (id) {
+      setLocation(`/presentation/${id}`);
+      onClose();
+    }
+  }
+
+  // Prevent accidental close during active operations
+  function handleOpenChange(open: boolean) {
+    if (!open && (step === "uploading" || step === "processing")) return;
+    if (!open) onClose();
+  }
+
+  // ---------------------------------------------------------------------------
+  // Render
+  // ---------------------------------------------------------------------------
+
+  return (
+    <Dialog open onOpenChange={handleOpenChange}>
+      <DialogContent className="sm:max-w-md">
+        <DialogHeader>
+          <DialogTitle>Import Presentation</DialogTitle>
+        </DialogHeader>
+
+        {/* ── Select step ─────────────────────────────────────────────────── */}
+        {step === "select" && (
+          <Tabs
+            value={activeTab}
+            onValueChange={(v) => setActiveTab(v as "pptx" | "google_slides")}
+          >
+            <TabsList className="w-full">
+              <TabsTrigger value="pptx" className="flex-1">
+                Upload PPTX
+              </TabsTrigger>
+              <TabsTrigger value="google_slides" className="flex-1">
+                Google Slides
+              </TabsTrigger>
+            </TabsList>
+
+            {/* PPTX tab */}
+            <TabsContent value="pptx" className="space-y-4 pt-2">
+              <label
+                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-muted-foreground/60 transition-colors"
+                htmlFor="pptx-file-input"
+              >
+                <FileUp className="h-8 w-8 text-muted-foreground" />
+                <span className="text-sm text-muted-foreground text-center">
+                  Drop your .pptx file here or click to browse
+                </span>
+                <span className="text-xs text-muted-foreground/60">Max 50 MB</span>
+                {selectedFile && (
+                  <span className="text-xs font-medium text-foreground">
+                    {selectedFile.name}
+                  </span>
+                )}
+              </label>
+              <input
+                id="pptx-file-input"
+                ref={fileInputRef}
+                type="file"
+                accept=".pptx"
+                className="sr-only"
+                onChange={handleFileChange}
+              />
+              {fileError && (
+                <p className="text-destructive text-sm">{fileError}</p>
+              )}
+              <Button
+                className="w-full"
+                onClick={handlePptxImport}
+                disabled={!selectedFile || startImportMutation.isPending}
+              >
+                Import
+              </Button>
+            </TabsContent>
+
+            {/* Google Slides tab */}
+            <TabsContent value="google_slides" className="space-y-4 pt-2">
+              {connectionStatusQuery.isLoading ? (
+                <div className="flex items-center justify-center py-6">
+                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
+                </div>
+              ) : connectionStatusQuery.data?.status === "connected" ? (
+                <>
+                  <Input
+                    type="url"
+                    placeholder="https://docs.google.com/presentation/d/..."
+                    value={slidesUrl}
+                    onChange={(e) => setSlidesUrl(e.target.value)}
+                  />
+                  {slidesUrlError && (
+                    <p className="text-destructive text-sm">{slidesUrlError}</p>
+                  )}
+                  <Button
+                    className="w-full"
+                    onClick={handleGSlidesImport}
+                    disabled={!slidesUrl || startImportMutation.isPending}
+                  >
+                    Import
+                  </Button>
+                </>
+              ) : (
+                <div className="flex flex-col items-center gap-3 py-4">
+                  <p className="text-sm text-muted-foreground text-center">
+                    Connect your Google Drive account to import presentations.
+                  </p>
+                  <Button
+                    onClick={() => {
+                      setLocation("/settings#google-drive");
+                      onClose();
+                    }}
+                  >
+                    Connect Google Drive
+                  </Button>
+                </div>
+              )}
+            </TabsContent>
+          </Tabs>
+        )}
+
+        {/* ── Uploading step ──────────────────────────────────────────────── */}
+        {step === "uploading" && (
+          <div className="flex flex-col items-center gap-4 py-4">
+            <Loader2 className="h-8 w-8 animate-spin text-primary" />
+            <p className="font-medium">Uploading...</p>
+            <Progress value={uploadProgress} className="w-full" />
+            <p className="text-sm text-muted-foreground">{uploadProgress}%</p>
+            <Button variant="secondary" onClick={handleCancelUpload}>
+              Cancel
+            </Button>
+          </div>
+        )}
+
+        {/* ── Processing step ─────────────────────────────────────────────── */}
+        {step === "processing" && (
+          <div className="flex flex-col items-center gap-4 py-4">
+            <Loader2 className="h-8 w-8 animate-spin text-primary" />
+            <p className="font-medium">Processing presentation...</p>
+            <Progress value={statusQuery.data?.progress ?? 0} className="w-full" />
+            <p className="text-sm text-muted-foreground">
+              {statusQuery.data?.progress ?? 0}%
+            </p>
+            <Button variant="secondary" onClick={handleCancelProcessing}>
+              Cancel
+            </Button>
+          </div>
+        )}
+
+        {/* ── Result step ─────────────────────────────────────────────────── */}
+        {step === "result" && (
+          <div className="space-y-4 py-2">
+            <p className="font-medium text-green-600 dark:text-green-400">
+              Import complete!
+            </p>
+            {(statusQuery.data?.fidelityWarnings?.length ?? 0) > 0 && (
+              <div>
+                <p className="text-sm font-medium mb-2">Compatibility notes:</p>
+                <ul className="list-disc list-inside space-y-1">
+                  {statusQuery.data!.fidelityWarnings!.map((w, i) => (
+                    <li key={i} className="text-sm text-muted-foreground">
+                      {w}
+                    </li>
+                  ))}
+                </ul>
+              </div>
+            )}
+            <div className="flex gap-2">
+              <Button onClick={handleOpenDeck} className="flex-1">
+                Open Deck
+              </Button>
+              <Button variant="secondary" onClick={onClose} className="flex-1">
+                Close
+              </Button>
+            </div>
+          </div>
+        )}
+
+        {/* ── Error step ──────────────────────────────────────────────────── */}
+        {step === "error" && (
+          <div className="space-y-4 py-2">
+            <p className="text-destructive text-sm">
+              {errorMessage ?? "An unexpected error occurred."}
+            </p>
+            <Button onClick={handleTryAgain} className="w-full">
+              Try Again
+            </Button>
+          </div>
+        )}
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/presentation/uploadPptxFile.ts b/apps/web/client/src/components/presentation/uploadPptxFile.ts
new file mode 100644
index 0000000..fe1ad8e
--- /dev/null
+++ b/apps/web/client/src/components/presentation/uploadPptxFile.ts
@@ -0,0 +1,81 @@
+/**
+ * Reads a PPTX file as a Base64 string and uploads it to the library
+ * via the provided tRPC `mutateAsync` callback.
+ *
+ * Separated from the component so it can be easily mocked in tests.
+ *
+ * Progress phases:
+ *   10%  – FileReader started
+ *   50%  – Base64 read complete, upload starting
+ *  100%  – Upload complete
+ *
+ * Throws DOMException("Aborted", "AbortError") when `signal` fires.
+ * Throws Error with a descriptive message on other failures.
+ */
+
+type UploadFileInput = {
+  fileName: string;
+  fileType: string;
+  fileBase64: string;
+  title?: string;
+  visibility?: string;
+};
+
+type UploadFileResult = {
+  item: { id: number };
+  [key: string]: unknown;
+};
+
+export async function uploadPptxFile(
+  file: File,
+  onProgress: (pct: number) => void,
+  signal: AbortSignal,
+  mutateAsync: (input: UploadFileInput) => Promise<UploadFileResult>,
+): Promise<{ libraryItemId: number }> {
+  onProgress(10);
+
+  const base64 = await readFileAsBase64(file, signal);
+
+  if (signal.aborted) {
+    throw new DOMException("Aborted", "AbortError");
+  }
+
+  onProgress(50);
+
+  const result = await mutateAsync({
+    fileName: file.name,
+    fileType:
+      file.type ||
+      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
+    fileBase64: base64,
+    title: file.name.replace(/\.pptx$/i, ""),
+    visibility: "private",
+  });
+
+  onProgress(100);
+  return { libraryItemId: result.item.id };
+}
+
+function readFileAsBase64(file: File, signal: AbortSignal): Promise<string> {
+  return new Promise<string>((resolve, reject) => {
+    const reader = new FileReader();
+
+    signal.addEventListener(
+      "abort",
+      () => {
+        reader.abort();
+        reject(new DOMException("Aborted", "AbortError"));
+      },
+      { once: true },
+    );
+
+    reader.onload = () => {
+      const dataUrl = reader.result as string;
+      const base64 = dataUrl.split(",")[1];
+      resolve(base64 ?? "");
+    };
+
+    reader.onerror = () => reject(new Error("Failed to read file"));
+    reader.readAsDataURL(file);
+  });
+}
