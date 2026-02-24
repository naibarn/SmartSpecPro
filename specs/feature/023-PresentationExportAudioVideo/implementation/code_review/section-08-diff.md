diff --git a/apps/web/client/src/components/presentation/ExportDialog.test.tsx b/apps/web/client/src/components/presentation/ExportDialog.test.tsx
new file mode 100644
index 0000000..fc436f4
--- /dev/null
+++ b/apps/web/client/src/components/presentation/ExportDialog.test.tsx
@@ -0,0 +1,377 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, act } from "@testing-library/react";
+import { ExportDialog } from "./ExportDialog";
+import { trpc } from "@/lib/trpc";
+
+// ---------------------------------------------------------------------------
+// Mock tRPC hooks
+// ---------------------------------------------------------------------------
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    presentation: {
+      triggerExport: { useMutation: vi.fn() },
+      getExportStatus: { useQuery: vi.fn() },
+    },
+  },
+}));
+
+// Mock sonner toast to avoid DOM side effects
+vi.mock("sonner", () => ({
+  toast: { error: vi.fn(), success: vi.fn() },
+}));
+
+// ---------------------------------------------------------------------------
+// Mock factories
+// ---------------------------------------------------------------------------
+
+function makeMutationMock(overrides?: {
+  mutate?: ReturnType<typeof vi.fn>;
+  isPending?: boolean;
+  options?: Record<string, unknown>;
+}) {
+  const mutate = overrides?.mutate ?? vi.fn();
+  return {
+    mutate,
+    isPending: overrides?.isPending ?? false,
+    isError: false,
+    isSuccess: false,
+    reset: vi.fn(),
+  };
+}
+
+type MockStatusData = {
+  status?: string;
+  progressPct?: number;
+  stage?: string | null;
+  downloadUrl?: string | null;
+  errorMessage?: string | null;
+  outputBytes?: number | null;
+};
+
+function makeQueryMock(data?: MockStatusData) {
+  return {
+    data: data
+      ? {
+          schemaVersion: 1 as const,
+          exportId: 99,
+          status: data.status ?? "processing",
+          format: "mp4" as const,
+          progressPct: data.progressPct ?? 0,
+          stage: data.stage ?? null,
+          downloadUrl: data.downloadUrl ?? null,
+          errorMessage: data.errorMessage ?? null,
+          updatedAt: new Date(),
+          warnings: [],
+        }
+      : undefined,
+    isLoading: false,
+    isError: false,
+  };
+}
+
+const TRIGGER_SUCCESS_DATA = {
+  schemaVersion: 1 as const,
+  exportId: 99,
+  deckId: 42,
+  format: "mp4" as const,
+  deduped: false,
+  status: "queued" as const,
+  renderSpec: {},
+  warnings: [],
+  message: undefined,
+};
+
+const DEFAULT_PROPS = {
+  deckId: 42,
+  open: true,
+  onClose: vi.fn(),
+};
+
+// ---------------------------------------------------------------------------
+// Tests
+// ---------------------------------------------------------------------------
+
+describe("ExportDialog", () => {
+  beforeEach(() => {
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
+      makeMutationMock() as any,
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock() as any,
+    );
+  });
+
+  // 1. Format picker renders all four options
+  it("renders all four format options", () => {
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    expect(screen.getByText("MP4")).toBeDefined();
+    expect(screen.getByText("PNG")).toBeDefined();
+    expect(screen.getByText("JPG")).toBeDefined();
+    expect(screen.getByText("PDF")).toBeDefined();
+  });
+
+  // 2. Quality picker conditional on format — shown for MP4 (default)
+  it("shows quality picker when MP4 is selected (default)", () => {
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    expect(screen.getByText("Draft")).toBeDefined();
+    expect(screen.getByText("Standard")).toBeDefined();
+    expect(screen.getByText("High")).toBeDefined();
+  });
+
+  // 3. Quality picker hidden for PNG
+  it("hides quality picker when PNG is selected", () => {
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    // Click the PNG radio button
+    const pngOption = screen.getByTestId("format-option-png");
+    fireEvent.click(pngOption);
+    expect(screen.queryByText("Draft")).toBeNull();
+    expect(screen.queryByText("Standard")).toBeNull();
+    expect(screen.queryByText("High")).toBeNull();
+  });
+
+  // 4. Quality picker hidden for PDF
+  it("hides quality picker when PDF is selected", () => {
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    const pdfOption = screen.getByTestId("format-option-pdf");
+    fireEvent.click(pdfOption);
+    expect(screen.queryByText("Draft")).toBeNull();
+    expect(screen.queryByText("Standard")).toBeNull();
+    expect(screen.queryByText("High")).toBeNull();
+  });
+
+  // 5. Export button calls triggerExport mutation
+  it("calls triggerExport mutation with selected format and quality when Export is clicked", () => {
+    const mockMutate = vi.fn();
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
+      makeMutationMock({ mutate: mockMutate }) as any,
+    );
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    fireEvent.click(screen.getByTestId("export-button"));
+    expect(mockMutate).toHaveBeenCalledTimes(1);
+    expect(mockMutate).toHaveBeenCalledWith(
+      expect.objectContaining({ format: "mp4", quality: "standard" }),
+    );
+  });
+
+  // 6. triggerExport receives non-empty idempotencyKey
+  it("triggerExport mutation is called with a non-empty idempotencyKey", () => {
+    const mockMutate = vi.fn();
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockReturnValue(
+      makeMutationMock({ mutate: mockMutate }) as any,
+    );
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    fireEvent.click(screen.getByTestId("export-button"));
+    const callArg = mockMutate.mock.calls[0][0];
+    expect(typeof callArg.idempotencyKey).toBe("string");
+    expect(callArg.idempotencyKey.length).toBeGreaterThan(0);
+  });
+
+  // 7. Dialog transitions to in-progress after triggerExport resolves
+  it("shows progress bar after triggerExport onSuccess fires with exportId", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "processing", progressPct: 0 }) as any,
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => {
+      capturedOnSuccess?.(TRIGGER_SUCCESS_DATA);
+    });
+
+    expect(screen.getByRole("progressbar")).toBeDefined();
+  });
+
+  // 8. Progress bar shows progressPct
+  it("progress bar reflects progressPct from getExportStatus", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "processing", progressPct: 42 }) as any,
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => {
+      capturedOnSuccess?.(TRIGGER_SUCCESS_DATA);
+    });
+
+    const progressBar = screen.getByRole("progressbar");
+    expect(progressBar.getAttribute("aria-valuenow")).toBe("42");
+  });
+
+  // 9. Stage label renders for "rendering"
+  it("renders stage label 'Rendering slides...' when stage is 'rendering'", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "processing", stage: "rendering" }) as any,
+    );
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
+    expect(screen.getByText("Rendering slides...")).toBeDefined();
+  });
+
+  // 10. Stage label renders for "encoding"
+  it("renders stage label 'Encoding video...' when stage is 'encoding'", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "processing", stage: "encoding" }) as any,
+    );
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
+    expect(screen.getByText("Encoding video...")).toBeDefined();
+  });
+
+  // 11. Stage label renders for "uploading"
+  it("renders stage label 'Uploading file...' when stage is 'uploading'", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "processing", stage: "uploading" }) as any,
+    );
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
+    expect(screen.getByText("Uploading file...")).toBeDefined();
+  });
+
+  // 12. Polling stops when status is "done"
+  it("refetchInterval returns false (polling stops) when status is done", () => {
+    let capturedQueryOptions: any;
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockImplementation(
+      (_input: any, opts?: any) => {
+        capturedQueryOptions = opts;
+        return makeQueryMock({ status: "done" }) as any;
+      },
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+
+    const refetchResult = capturedQueryOptions?.refetchInterval?.({
+      state: { data: { status: "done" } },
+    });
+    expect(refetchResult).toBe(false);
+  });
+
+  // 13. Polling stops when status is "error"
+  it("refetchInterval returns false (polling stops) when status is error", () => {
+    let capturedQueryOptions: any;
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockImplementation(
+      (_input: any, opts?: any) => {
+        capturedQueryOptions = opts;
+        return makeQueryMock({ status: "error" }) as any;
+      },
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+
+    const refetchResult = capturedQueryOptions?.refetchInterval?.({
+      state: { data: { status: "error" } },
+    });
+    expect(refetchResult).toBe(false);
+  });
+
+  // 14. Download button appears with downloadUrl when done
+  it("shows a download link with the downloadUrl when status is done", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "done",
+        progressPct: 100,
+        downloadUrl: "https://r2.example.com/export.mp4?token=abc",
+      }) as any,
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
+
+    const downloadLink = screen.getByTestId("download-link");
+    expect(downloadLink).toBeDefined();
+    expect(downloadLink.getAttribute("href")).toBe(
+      "https://r2.example.com/export.mp4?token=abc",
+    );
+  });
+
+  // 15. Error message renders when status is "error"
+  it("renders errorMessage text when status is error", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({
+        status: "error",
+        errorMessage: "Render worker out of memory",
+      }) as any,
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
+
+    expect(screen.getByText("Render worker out of memory")).toBeDefined();
+  });
+
+  // 16. "Try Again" button resets dialog to format selection
+  it("clicking Try Again resets to format selection phase", () => {
+    let capturedOnSuccess: ((data: any) => void) | undefined;
+    vi.mocked(trpc.presentation.triggerExport.useMutation).mockImplementation(
+      (opts?: any) => {
+        capturedOnSuccess = opts?.onSuccess;
+        return makeMutationMock() as any;
+      },
+    );
+    vi.mocked(trpc.presentation.getExportStatus.useQuery).mockReturnValue(
+      makeQueryMock({ status: "error", errorMessage: "Failed" }) as any,
+    );
+
+    render(<ExportDialog {...DEFAULT_PROPS} />);
+    act(() => { capturedOnSuccess?.(TRIGGER_SUCCESS_DATA); });
+
+    // Click Try Again
+    const tryAgainBtn = screen.getByTestId("try-again-button");
+    fireEvent.click(tryAgainBtn);
+
+    // Should be back at format selection — format picker visible again
+    expect(screen.getByText("MP4")).toBeDefined();
+    expect(screen.getByTestId("export-button")).toBeDefined();
+  });
+});
diff --git a/apps/web/client/src/components/presentation/ExportDialog.tsx b/apps/web/client/src/components/presentation/ExportDialog.tsx
new file mode 100644
index 0000000..74d6842
--- /dev/null
+++ b/apps/web/client/src/components/presentation/ExportDialog.tsx
@@ -0,0 +1,362 @@
+import { useEffect, useRef, useState } from "react";
+import { Download } from "lucide-react";
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+  DialogFooter,
+} from "@/components/ui/dialog";
+import { Button } from "@/components/ui/button";
+import { Progress } from "@/components/ui/progress";
+import { Alert, AlertDescription } from "@/components/ui/alert";
+import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
+import { Label } from "@/components/ui/label";
+import { trpc } from "@/lib/trpc";
+import { toast } from "sonner";
+
+// ---------------------------------------------------------------------------
+// Types
+// ---------------------------------------------------------------------------
+
+interface ExportDialogProps {
+  /** Library item ID of the presentation deck being exported */
+  deckId: number;
+  /** Whether the dialog is open */
+  open: boolean;
+  /** Called when the dialog is closed */
+  onClose: () => void;
+}
+
+type ExportFormat = "mp4" | "png" | "jpg" | "pdf";
+type ExportQuality = "draft" | "standard" | "high";
+type DialogPhase = "selecting" | "exporting" | "done" | "error";
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const STAGE_LABELS: Record<string, string> = {
+  rendering: "Rendering slides...",
+  encoding: "Encoding video...",
+  uploading: "Uploading file...",
+};
+
+const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; description: string }> = [
+  { value: "mp4", label: "MP4", description: "Video file, suitable for sharing and embedding" },
+  { value: "png", label: "PNG", description: "Lossless image slides (ZIP archive)" },
+  { value: "jpg", label: "JPG", description: "Compressed image slides (ZIP archive)" },
+  { value: "pdf", label: "PDF", description: "Portable document, all slides in one file" },
+];
+
+const QUALITY_OPTIONS: Array<{ value: ExportQuality; label: string; description: string }> = [
+  { value: "draft", label: "Draft", description: "Faster render, smaller file" },
+  { value: "standard", label: "Standard", description: "Balanced quality and size (default)" },
+  { value: "high", label: "High", description: "Best quality, larger file, slower render" },
+];
+
+// Formats for which the quality picker is shown
+const QUALITY_APPLICABLE_FORMATS: ExportFormat[] = ["mp4", "jpg"];
+
+// ---------------------------------------------------------------------------
+// Component
+// ---------------------------------------------------------------------------
+
+export function ExportDialog({ deckId, open, onClose }: ExportDialogProps) {
+  // Format and quality selection
+  const [format, setFormat] = useState<ExportFormat>("mp4");
+  const [quality, setQuality] = useState<ExportQuality>("standard");
+
+  // Export job tracking (set after triggerExport resolves)
+  const [exportId, setExportId] = useState<number | null>(null);
+
+  // Dialog phase
+  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("selecting");
+
+  // Stable idempotency key — reset on "Try Again"
+  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
+
+  // -------------------------------------------------------------------------
+  // tRPC mutation
+  // -------------------------------------------------------------------------
+
+  const triggerExportMutation = trpc.presentation.triggerExport.useMutation({
+    onSuccess(data) {
+      setExportId(data.exportId);
+      setDialogPhase("exporting");
+    },
+    onError(err) {
+      toast.error(`Export failed to start: ${err.message}`);
+    },
+  });
+
+  function handleExport() {
+    triggerExportMutation.mutate({
+      deckId,
+      format,
+      quality,
+      idempotencyKey: idempotencyKeyRef.current,
+    });
+  }
+
+  // -------------------------------------------------------------------------
+  // tRPC polling query
+  // -------------------------------------------------------------------------
+
+  const exportStatusQuery = trpc.presentation.getExportStatus.useQuery(
+    { exportId: exportId! },
+    {
+      enabled: exportId !== null && dialogPhase === "exporting",
+      refetchInterval: (query) => {
+        const status = query.state.data?.status;
+        if (status === "done" || status === "error") return false;
+        return 2000; // Poll every 2 seconds
+      },
+      refetchIntervalInBackground: false,
+    },
+  );
+
+  // Transition phase when query resolves to terminal state
+  useEffect(() => {
+    if (exportId === null) return;
+    const status = exportStatusQuery.data?.status;
+    if (status === "done") setDialogPhase("done");
+    if (status === "error") setDialogPhase("error");
+  }, [exportId, exportStatusQuery.data?.status]);
+
+  // -------------------------------------------------------------------------
+  // Handlers
+  // -------------------------------------------------------------------------
+
+  function handleTryAgain() {
+    idempotencyKeyRef.current = crypto.randomUUID();
+    setExportId(null);
+    setDialogPhase("selecting");
+  }
+
+  function handleOpenChange(isOpen: boolean) {
+    if (!isOpen) onClose();
+  }
+
+  // -------------------------------------------------------------------------
+  // Render helpers
+  // -------------------------------------------------------------------------
+
+  const showQualityPicker = QUALITY_APPLICABLE_FORMATS.includes(format);
+  const statusData = exportStatusQuery.data;
+  const progressPct = statusData?.progressPct ?? 0;
+  const stage = statusData?.stage ?? null;
+  const downloadUrl = statusData?.downloadUrl ?? null;
+  const errorMessage = statusData?.errorMessage ?? null;
+
+  // -------------------------------------------------------------------------
+  // Phase: selecting
+  // -------------------------------------------------------------------------
+
+  function renderSelecting() {
+    return (
+      <>
+        <div className="space-y-6 py-4">
+          {/* Format picker */}
+          <div className="space-y-3">
+            <p className="text-sm font-medium">Format</p>
+            <RadioGroup
+              value={format}
+              onValueChange={(v) => setFormat(v as ExportFormat)}
+              className="grid grid-cols-2 gap-3"
+            >
+              {FORMAT_OPTIONS.map((opt) => (
+                <div
+                  key={opt.value}
+                  className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
+                  data-testid={`format-option-${opt.value}`}
+                  onClick={() => setFormat(opt.value)}
+                >
+                  <RadioGroupItem
+                    value={opt.value}
+                    id={`format-${opt.value}`}
+                    className="mt-0.5 shrink-0"
+                  />
+                  <div className="space-y-0.5">
+                    <Label htmlFor={`format-${opt.value}`} className="cursor-pointer font-medium">
+                      {opt.label}
+                    </Label>
+                    <p className="text-xs text-muted-foreground">{opt.description}</p>
+                  </div>
+                </div>
+              ))}
+            </RadioGroup>
+          </div>
+
+          {/* Quality picker — only for formats where it's applicable */}
+          {showQualityPicker && (
+            <div className="space-y-3">
+              <p className="text-sm font-medium">Quality</p>
+              <RadioGroup
+                value={quality}
+                onValueChange={(v) => setQuality(v as ExportQuality)}
+                className="grid grid-cols-3 gap-2"
+              >
+                {QUALITY_OPTIONS.map((opt) => (
+                  <div
+                    key={opt.value}
+                    className="flex items-start gap-2 rounded-lg border p-2 cursor-pointer hover:bg-muted/50"
+                    onClick={() => setQuality(opt.value)}
+                  >
+                    <RadioGroupItem
+                      value={opt.value}
+                      id={`quality-${opt.value}`}
+                      className="mt-0.5 shrink-0"
+                    />
+                    <div>
+                      <Label htmlFor={`quality-${opt.value}`} className="cursor-pointer font-medium text-sm">
+                        {opt.label}
+                      </Label>
+                      <p className="text-xs text-muted-foreground">{opt.description}</p>
+                    </div>
+                  </div>
+                ))}
+              </RadioGroup>
+            </div>
+          )}
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose}>
+            Cancel
+          </Button>
+          <Button
+            onClick={handleExport}
+            disabled={triggerExportMutation.isPending}
+            data-testid="export-button"
+          >
+            {triggerExportMutation.isPending ? "Starting..." : "Export"}
+          </Button>
+        </DialogFooter>
+      </>
+    );
+  }
+
+  // -------------------------------------------------------------------------
+  // Phase: exporting
+  // -------------------------------------------------------------------------
+
+  function renderExporting() {
+    return (
+      <>
+        <div className="space-y-4 py-6">
+          <Progress
+            value={progressPct}
+            aria-valuenow={progressPct}
+            className="w-full"
+          />
+          {stage && (
+            <p className="text-sm text-muted-foreground text-center">
+              {STAGE_LABELS[stage] ?? stage}
+            </p>
+          )}
+        </div>
+
+        <DialogFooter>
+          <Button
+            variant="outline"
+            disabled
+            title="Cancellation not yet supported"
+            aria-label="Cancellation not yet supported"
+          >
+            Cancel
+          </Button>
+        </DialogFooter>
+      </>
+    );
+  }
+
+  // -------------------------------------------------------------------------
+  // Phase: done
+  // -------------------------------------------------------------------------
+
+  function renderDone() {
+    return (
+      <>
+        <div className="space-y-4 py-6 text-center">
+          <p className="text-sm text-muted-foreground">Your export is ready.</p>
+          {downloadUrl && (
+            <a
+              href={downloadUrl}
+              target="_blank"
+              rel="noopener noreferrer"
+              data-testid="download-link"
+              className="inline-flex items-center gap-2"
+            >
+              <Button asChild>
+                <span>
+                  <Download className="mr-2 h-4 w-4" />
+                  Download
+                </span>
+              </Button>
+            </a>
+          )}
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose}>
+            Close
+          </Button>
+        </DialogFooter>
+      </>
+    );
+  }
+
+  // -------------------------------------------------------------------------
+  // Phase: error
+  // -------------------------------------------------------------------------
+
+  function renderError() {
+    return (
+      <>
+        <div className="space-y-4 py-4">
+          <Alert variant="destructive">
+            <AlertDescription>
+              {errorMessage ?? "Export failed. Please try again."}
+            </AlertDescription>
+          </Alert>
+        </div>
+
+        <DialogFooter>
+          <Button variant="outline" onClick={onClose}>
+            Close
+          </Button>
+          <Button onClick={handleTryAgain} data-testid="try-again-button">
+            Try Again
+          </Button>
+        </DialogFooter>
+      </>
+    );
+  }
+
+  // -------------------------------------------------------------------------
+  // Main render
+  // -------------------------------------------------------------------------
+
+  return (
+    <Dialog open={open} onOpenChange={handleOpenChange}>
+      <DialogContent
+        className="sm:max-w-lg"
+        onInteractOutside={
+          dialogPhase === "exporting"
+            ? (e) => e.preventDefault()
+            : undefined
+        }
+      >
+        <DialogHeader>
+          <DialogTitle>Export Presentation</DialogTitle>
+        </DialogHeader>
+
+        {dialogPhase === "selecting" && renderSelecting()}
+        {dialogPhase === "exporting" && renderExporting()}
+        {dialogPhase === "done" && renderDone()}
+        {dialogPhase === "error" && renderError()}
+      </DialogContent>
+    </Dialog>
+  );
+}
