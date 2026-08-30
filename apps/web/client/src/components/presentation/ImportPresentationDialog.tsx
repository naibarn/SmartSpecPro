import { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, FileUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { uploadPptxFile } from "./uploadPptxFile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportStep = "select" | "uploading" | "processing" | "result" | "error";

interface ImportPresentationDialogProps {
  /** Called when the dialog should close. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 52_428_800; // 50 MB

const GSLIDES_URL_RE =
  /^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportPresentationDialog({ onClose }: ImportPresentationDialogProps) {
  const [, setLocation] = useLocation();

  // --- State machine ---
  const [step, setStep] = useState<ImportStep>("select");
  const [activeTab, setActiveTab] = useState<"pptx" | "google_slides">("pptx");

  // PPTX
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Google Slides
  const [slidesUrl, setSlidesUrl] = useState("");
  const [slidesUrlError, setSlidesUrlError] = useState<string | null>(null);

  // Shared
  const [conversionId, setConversionId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- tRPC mutations ---
  const startImportMutation = trpc.presentationImport.startImport.useMutation();
  const cancelImportMutation = trpc.presentationImport.cancelImport.useMutation();

  // --- tRPC queries ---
  const connectionStatusQuery = trpc.googleDrive.getConnectionStatus.useQuery(
    undefined,
    {
      enabled: activeTab === "google_slides",
      retry: false,
    },
  );

  const statusQuery = trpc.presentationImport.getImportStatus.useQuery(
    { conversionId: conversionId! },
    {
      enabled: conversionId !== null && step === "processing",
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        return s === "done" || s === "failed" || s === "cancelled" ? false : 2000;
      },
      staleTime: 0,
    },
  );

  // --- Polling side effect ---
  useEffect(() => {
    if (step !== "processing") return;
    if (!statusQuery.data) return;
    const { status, error } = statusQuery.data;
    if (status === "done") {
      setStep("result");
    } else if (status === "failed") {
      setErrorMessage(error ?? "Import failed.");
      setStep("error");
    }
  }, [statusQuery.data, step]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError("File is too large. Maximum size is 50 MB.");
      setSelectedFile(null);
    } else {
      setFileError(null);
      setSelectedFile(file);
    }
  }

  async function handlePptxImport() {
    if (!selectedFile) return;
    setFileError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("uploading");
    setUploadProgress(0);

    try {
      const { libraryItemId } = await uploadPptxFile(
        selectedFile,
        (pct) => setUploadProgress(pct),
        controller.signal,
      );

      const result = await startImportMutation.mutateAsync({
        sourceType: "pptx",
        sourceLibraryItemId: libraryItemId,
        title: selectedFile.name.replace(/\.pptx$/i, ""),
      });

      setConversionId(result.conversionId);
      setStep("processing");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStep("select");
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
        setStep("error");
      }
    }
  }

  async function handleGSlidesImport() {
    setSlidesUrlError(null);
    if (!GSLIDES_URL_RE.test(slidesUrl)) {
      setSlidesUrlError(
        "Enter a valid Google Slides URL (docs.google.com/presentation/d/...)",
      );
      return;
    }

    try {
      const result = await startImportMutation.mutateAsync({
        sourceType: "google_slides",
        slidesUrl,
      });
      setConversionId(result.conversionId);
      setStep("processing");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start import.",
      );
      setStep("error");
    }
  }

  function handleCancelUpload() {
    abortRef.current?.abort();
    setStep("select");
    setUploadProgress(0);
  }

  function handleCancelProcessing() {
    if (conversionId !== null) {
      cancelImportMutation.mutate({ conversionId });
    }
    setConversionId(null);
    setStep("select");
  }

  function handleTryAgain() {
    setStep("select");
    setConversionId(null);
    setErrorMessage(null);
    setUploadProgress(0);
    setSelectedFile(null);
    setFileError(null);
    setSlidesUrl("");
    setSlidesUrlError(null);
    // Reset the file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenDeck() {
    const id = statusQuery.data?.deckLibraryItemId;
    if (id) {
      onClose();
      setLocation(`/presentation/${id}`);
    } else {
      setErrorMessage("Could not open deck — library item not found.");
      setStep("error");
    }
  }

  // Prevent accidental close during active operations
  function handleOpenChange(open: boolean) {
    if (!open && (step === "uploading" || step === "processing")) return;
    if (!open) onClose();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Presentation</DialogTitle>
        </DialogHeader>

        {/* ── Select step ─────────────────────────────────────────────────── */}
        {step === "select" && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "pptx" | "google_slides")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="pptx" className="flex-1">
                Upload PPTX
              </TabsTrigger>
              <TabsTrigger value="google_slides" className="flex-1">
                Google Slides
              </TabsTrigger>
            </TabsList>

            {/* PPTX tab */}
            <TabsContent value="pptx" className="space-y-4 pt-2">
              <label
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-muted-foreground/60 transition-colors"
                htmlFor="pptx-file-input"
              >
                <FileUp className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground text-center">
                  Drop your .pptx file here or click to browse
                </span>
                <span className="text-xs text-muted-foreground/60">Max 50 MB</span>
                {selectedFile && (
                  <span className="text-xs font-medium text-foreground">
                    {selectedFile.name}
                  </span>
                )}
              </label>
              <input
                id="pptx-file-input"
                ref={fileInputRef}
                type="file"
                accept=".pptx"
                className="sr-only"
                onChange={handleFileChange}
              />
              {fileError && (
                <p className="text-destructive text-sm">{fileError}</p>
              )}
              <Button
                className="w-full"
                onClick={handlePptxImport}
                disabled={!selectedFile || startImportMutation.isPending}
              >
                Import
              </Button>
            </TabsContent>

            {/* Google Slides tab */}
            <TabsContent value="google_slides" className="space-y-4 pt-2">
              {connectionStatusQuery.isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : connectionStatusQuery.data?.status === "connected" ? (
                <>
                  <Input
                    type="url"
                    placeholder="https://docs.google.com/presentation/d/..."
                    value={slidesUrl}
                    onChange={(e) => setSlidesUrl(e.target.value)}
                  />
                  {slidesUrlError && (
                    <p className="text-destructive text-sm">{slidesUrlError}</p>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleGSlidesImport}
                    disabled={!slidesUrl || startImportMutation.isPending}
                  >
                    Import
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-muted-foreground text-center">
                    {connectionStatusQuery.data?.status === "expired"
                      ? "Your Google Drive authorization has expired. Please reconnect."
                      : "Connect your Google Drive account to import presentations."}
                  </p>
                  <Button
                    onClick={() => {
                      setLocation("/settings#google-drive");
                      onClose();
                    }}
                  >
                    {connectionStatusQuery.data?.status === "expired"
                      ? "Reconnect Google Drive"
                      : "Connect Google Drive"}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* ── Uploading step ──────────────────────────────────────────────── */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">Uploading...</p>
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-sm text-muted-foreground">{uploadProgress}%</p>
            <Button variant="secondary" onClick={handleCancelUpload}>
              Cancel
            </Button>
          </div>
        )}

        {/* ── Processing step ─────────────────────────────────────────────── */}
        {step === "processing" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">Processing presentation...</p>
            <Progress value={statusQuery.data?.progress ?? 0} className="w-full" />
            <p className="text-sm text-muted-foreground">
              {statusQuery.data?.progress ?? 0}%
            </p>
            <Button variant="secondary" onClick={handleCancelProcessing}>
              Cancel
            </Button>
          </div>
        )}

        {/* ── Result step ─────────────────────────────────────────────────── */}
        {step === "result" && (
          <div className="space-y-4 py-2">
            <p className="font-medium text-green-600 dark:text-green-400">
              Import complete!
            </p>
            {(statusQuery.data?.fidelityWarnings?.length ?? 0) > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Compatibility notes:</p>
                <ul className="list-disc list-inside space-y-1">
                  {statusQuery.data!.fidelityWarnings!.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleOpenDeck} className="flex-1">
                Open Deck
              </Button>
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ── Error step ──────────────────────────────────────────────────── */}
        {step === "error" && (
          <div className="space-y-4 py-2">
            <p className="text-destructive text-sm">
              {errorMessage ?? "An unexpected error occurred."}
            </p>
            <Button onClick={handleTryAgain} className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
