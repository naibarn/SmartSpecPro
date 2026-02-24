import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportDialogProps {
  /** Library item ID of the presentation deck being exported */
  deckId: number;
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog is closed */
  onClose: () => void;
}

type ExportFormat = "mp4" | "png" | "jpg" | "pdf";
type ExportQuality = "draft" | "standard" | "high";
type DialogPhase = "selecting" | "exporting" | "done" | "error";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<string, string> = {
  rendering: "Rendering slides...",
  encoding: "Encoding video...",
  uploading: "Uploading file...",
};

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: "mp4", label: "MP4", description: "Video file, suitable for sharing and embedding" },
  { value: "png", label: "PNG", description: "Lossless image slides (ZIP archive)" },
  { value: "jpg", label: "JPG", description: "Compressed image slides (ZIP archive)" },
  { value: "pdf", label: "PDF", description: "Portable document, all slides in one file" },
];

const QUALITY_OPTIONS: Array<{ value: ExportQuality; label: string; description: string }> = [
  { value: "draft", label: "Draft", description: "Faster render, smaller file" },
  { value: "standard", label: "Standard", description: "Balanced quality and size (default)" },
  { value: "high", label: "High", description: "Best quality, larger file, slower render" },
];

// Formats for which the quality picker is shown
const QUALITY_APPLICABLE_FORMATS: ExportFormat[] = ["mp4", "jpg"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportDialog({ deckId, open, onClose }: ExportDialogProps) {
  // Format and quality selection
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [quality, setQuality] = useState<ExportQuality>("standard");

  // Export job tracking (set after triggerExport resolves)
  const [exportId, setExportId] = useState<number | null>(null);

  // Dialog phase
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("selecting");

  // Stable idempotency key — reset on "Try Again"
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // -------------------------------------------------------------------------
  // tRPC mutation
  // -------------------------------------------------------------------------

  const triggerExportMutation = trpc.presentation.triggerExport.useMutation({
    onSuccess(data) {
      setExportId(data.exportId);
      setDialogPhase("exporting");
    },
    onError(err) {
      toast.error(`Export failed to start: ${err.message}`);
    },
  });

  function handleExport() {
    triggerExportMutation.mutate({
      deckId,
      format,
      quality,
      idempotencyKey: idempotencyKeyRef.current,
    });
  }

  // -------------------------------------------------------------------------
  // tRPC polling query
  // -------------------------------------------------------------------------

  const exportStatusQuery = trpc.presentation.getExportStatus.useQuery(
    { exportId: exportId! },
    {
      enabled: exportId !== null && dialogPhase === "exporting",
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "done" || status === "error") return false;
        return 2000; // Poll every 2 seconds
      },
      refetchIntervalInBackground: false,
    },
  );

  // M1: Reset idempotency key and state when dialog is reopened
  useEffect(() => {
    if (open) {
      idempotencyKeyRef.current = crypto.randomUUID();
      setExportId(null);
      setDialogPhase("selecting");
    }
  }, [open]);

  // Transition phase when query resolves to terminal state
  // H3: guard prevents stale data from re-triggering when not exporting
  useEffect(() => {
    if (dialogPhase !== "exporting") return;
    if (exportId === null) return;
    const status = exportStatusQuery.data?.status;
    if (status === "done") setDialogPhase("done");
    if (status === "error") setDialogPhase("error");
  }, [exportId, exportStatusQuery.data?.status, dialogPhase]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleTryAgain() {
    idempotencyKeyRef.current = crypto.randomUUID();
    setExportId(null);
    setDialogPhase("selecting");
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose();
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const showQualityPicker = QUALITY_APPLICABLE_FORMATS.includes(format);
  const statusData = exportStatusQuery.data;
  const progressPct = statusData?.progressPct ?? 0;
  const stage = statusData?.stage ?? null;
  const downloadUrl = statusData?.downloadUrl ?? null;
  const errorMessage = statusData?.errorMessage ?? null;
  const outputBytes = statusData?.outputBytes ?? null;

  // -------------------------------------------------------------------------
  // Phase: selecting
  // -------------------------------------------------------------------------

  function renderSelecting() {
    return (
      <>
        <div className="space-y-6 py-4">
          {/* Format picker */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Format</p>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-2 gap-3"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                  data-testid={`format-option-${opt.value}`}
                  onClick={() => setFormat(opt.value)}
                >
                  <RadioGroupItem
                    value={opt.value}
                    id={`format-${opt.value}`}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`format-${opt.value}`} className="cursor-pointer font-medium">
                      {opt.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Quality picker — only for formats where it's applicable */}
          {showQualityPicker && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Quality</p>
              <RadioGroup
                value={quality}
                onValueChange={(v) => setQuality(v as ExportQuality)}
                className="grid grid-cols-3 gap-2"
              >
                {QUALITY_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className="flex items-start gap-2 rounded-lg border p-2 cursor-pointer hover:bg-muted/50"
                    data-testid={`quality-option-${opt.value}`}
                    onClick={() => setQuality(opt.value)}
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`quality-${opt.value}`}
                      className="mt-0.5 shrink-0"
                    />
                    <div>
                      <Label htmlFor={`quality-${opt.value}`} className="cursor-pointer font-medium text-sm">
                        {opt.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={triggerExportMutation.isPending}
            data-testid="export-button"
          >
            {triggerExportMutation.isPending ? "Starting..." : "Export"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Phase: exporting
  // -------------------------------------------------------------------------

  function renderExporting() {
    return (
      <>
        <div className="space-y-4 py-6">
          <Progress
            value={progressPct}
            aria-valuenow={progressPct}
            className="w-full"
          />
          {stage && (
            <p className="text-sm text-muted-foreground text-center">
              {STAGE_LABELS[stage] ?? "Processing..."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled
            title="Cancellation not yet supported"
            aria-label="Cancellation not yet supported"
          >
            Cancel
          </Button>
        </DialogFooter>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Phase: done
  // -------------------------------------------------------------------------

  function renderDone() {
    // H1: Show file size if available
    const fileSizeMb = outputBytes ? (outputBytes / (1024 * 1024)).toFixed(1) : null;

    return (
      <>
        <div className="space-y-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">Your export is ready.</p>
          {fileSizeMb && (
            <p className="text-xs text-muted-foreground">{fileSizeMb} MB</p>
          )}
          {downloadUrl && (
            // H2: window.open avoids <a> nesting inside <Button> (invalid DOM)
            <Button
              onClick={() => window.open(downloadUrl, "_blank", "noopener")}
              data-testid="download-link"
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Phase: error
  // -------------------------------------------------------------------------

  function renderError() {
    return (
      <>
        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertDescription>
              {errorMessage ?? "Export failed. Please try again."}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleTryAgain} data-testid="try-again-button">
            Try Again
          </Button>
        </DialogFooter>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={
          dialogPhase === "exporting"
            ? (e) => e.preventDefault()
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>Export Presentation</DialogTitle>
          {/* L3: DialogDescription prevents Radix a11y console warning */}
          <DialogDescription className="sr-only">
            Choose a format and quality setting, then export your presentation.
          </DialogDescription>
        </DialogHeader>

        {dialogPhase === "selecting" && renderSelecting()}
        {dialogPhase === "exporting" && renderExporting()}
        {dialogPhase === "done" && renderDone()}
        {dialogPhase === "error" && renderError()}
      </DialogContent>
    </Dialog>
  );
}
