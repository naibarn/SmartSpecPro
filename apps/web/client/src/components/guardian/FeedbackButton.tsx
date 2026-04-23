import { useEffect, useState, useRef, useCallback, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@smartspec/ui/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@smartspec/ui/src/components/ui/dialog";
import { Input } from "@smartspec/ui/src/components/ui/input";
import { Textarea } from "@smartspec/ui/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartspec/ui/src/components/ui/select";
import { toast } from "sonner";
import { MessageSquarePlus, Paperclip, X, FileText, Image, RefreshCw } from "lucide-react";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "md"]);
const FEEDBACK_STORAGE_KEY = "feedback-button-position";
const FEEDBACK_STORAGE_VERSION = 1;
const FEEDBACK_MARGIN = 16;
const FEEDBACK_DEFAULT_WIDTH = 138;
const FEEDBACK_DEFAULT_HEIGHT = 40;
const FEEDBACK_DRAG_THRESHOLD = 4;

type FeedbackPosition = {
  x: number;
  y: number;
};

type FeedbackPlacement =
  | { mode: "docked" }
  | ({ mode: "custom" } & FeedbackPosition);

type FeedbackPlacementStorage = {
  version: number;
  placement: FeedbackPlacement;
};

type FeedbackDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getDockedFeedbackPosition(
  viewportWidth: number,
  viewportHeight: number,
  size: { width: number; height: number } = {
    width: FEEDBACK_DEFAULT_WIDTH,
    height: FEEDBACK_DEFAULT_HEIGHT,
  },
): FeedbackPosition {
  return {
    x: Math.max(FEEDBACK_MARGIN, viewportWidth - size.width - FEEDBACK_MARGIN),
    y: Math.max(FEEDBACK_MARGIN, viewportHeight - size.height - FEEDBACK_MARGIN),
  };
}

function clampFeedbackPosition(
  position: FeedbackPosition,
  viewportWidth: number,
  viewportHeight: number,
  size: { width: number; height: number } = {
    width: FEEDBACK_DEFAULT_WIDTH,
    height: FEEDBACK_DEFAULT_HEIGHT,
  },
) {
  return {
    x: clamp(position.x, FEEDBACK_MARGIN, Math.max(FEEDBACK_MARGIN, viewportWidth - size.width - FEEDBACK_MARGIN)),
    y: clamp(position.y, FEEDBACK_MARGIN, Math.max(FEEDBACK_MARGIN, viewportHeight - size.height - FEEDBACK_MARGIN)),
  };
}

function getInitialFeedbackPlacement(): FeedbackPlacement {
  if (typeof window === "undefined") {
    return { mode: "docked" };
  }

  try {
    const saved = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<FeedbackPlacementStorage> & Partial<FeedbackPlacement>;
      if (parsed.version === FEEDBACK_STORAGE_VERSION) {
        const placement = parsed.placement;
        if (placement?.mode === "custom" && typeof placement.x === "number" && typeof placement.y === "number") {
          return {
            mode: "custom",
            ...clampFeedbackPosition({ x: placement.x, y: placement.y }, window.innerWidth, window.innerHeight),
          };
        }
      }
    }
  } catch {
    // Ignore malformed storage and fall back to the default docked position.
  }

  return { mode: "docked" };
}

function persistFeedbackPlacement(placement: FeedbackPlacement) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (placement.mode === "custom") {
      const payload: FeedbackPlacementStorage = {
        version: FEEDBACK_STORAGE_VERSION,
        placement,
      };
      window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(payload));
      return;
    }

    window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private mode / restricted environments.
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return <Image className="h-4 w-4 text-blue-500 shrink-0" />;
  }
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function FeedbackButton() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [ticketType, setTicketType] = useState<string>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [feedbackPlacement, setFeedbackPlacement] = useState<FeedbackPlacement>(() => getInitialFeedbackPlacement());
  const [isButtonDragging, setIsButtonDragging] = useState(false);
  // Holds the ticket ID when ticket was created but file upload failed
  const [pendingUploadTicketId, setPendingUploadTicketId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const dragStateRef = useRef<FeedbackDragState | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < FEEDBACK_DRAG_THRESHOLD) {
          return;
        }
        dragState.moved = true;
      }

      event.preventDefault();
      const nextPosition = clampFeedbackPosition(
        {
          x: dragState.originX + deltaX,
          y: dragState.originY + deltaY,
        },
        window.innerWidth,
        window.innerHeight,
        {
          width: dragState.width,
          height: dragState.height,
        },
      );
      setFeedbackPlacement({
        mode: "custom",
        ...nextPosition,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      suppressNextClickRef.current = dragState.moved;
      dragStateRef.current = null;
      setIsButtonDragging(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    persistFeedbackPlacement(feedbackPlacement);
  }, [feedbackPlacement]);

  useEffect(() => {
    const handleResize = () => {
      const rect = feedbackButtonRef.current?.getBoundingClientRect();
      setFeedbackPlacement((current) => {
        if (current.mode !== "custom") {
          return current;
        }

        const nextPosition = clampFeedbackPosition(
          { x: current.x, y: current.y },
          window.innerWidth,
          window.innerHeight,
          {
            width: rect?.width ?? FEEDBACK_DEFAULT_WIDTH,
            height: rect?.height ?? FEEDBACK_DEFAULT_HEIGHT,
          },
        );
        return {
          mode: "custom",
          ...nextPosition,
        };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function uploadFiles(ticketId: number): Promise<boolean> {
    if (files.length === 0) return true;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("ticketId", String(ticketId));
      for (const file of files) {
        formData.append("files", file);
      }
      // Include CSRF token header to prevent cross-origin form submission
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1] ?? "";
      const res = await fetch("/api/feedback/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        toast.error(err.error || "File upload failed");
        return false;
      }
      return true;
    } catch {
      toast.error("File upload failed — you can retry");
      return false;
    } finally {
      setUploading(false);
    }
  }

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: async (data) => {
      const uploadOk = await uploadFiles(data.id);
      if (!uploadOk) {
        // Keep dialog open with files for retry
        setPendingUploadTicketId(data.id);
        return;
      }
      toast.success("Feedback submitted! Thank you.");
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit feedback");
    },
  });

  const resetForm = useCallback(() => {
    setOpen(false);
    setTitle("");
    setDescription("");
    setTicketType("bug");
    setFiles([]);
    setPendingUploadTicketId(null);
  }, []);

  const handleRetryUpload = useCallback(async () => {
    if (!pendingUploadTicketId) return;
    const ok = await uploadFiles(pendingUploadTicketId);
    if (ok) {
      toast.success("Feedback submitted! Thank you.");
      resetForm();
    }
  }, [pendingUploadTicketId, files, resetForm]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const errors: string[] = [];

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) {
        errors.push(`Maximum ${MAX_FILES} files allowed`);
        return prev;
      }

      const valid: File[] = [];
      for (const file of fileArray.slice(0, remaining)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          errors.push(`${file.name}: type not allowed (jpg, png, webp, pdf, md)`);
          continue;
        }
        if (file.size === 0) {
          errors.push(`${file.name}: file is empty`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: too large (max 5 MB)`);
          continue;
        }
        valid.push(file);
      }

      if (fileArray.length > remaining) {
        const skipped = fileArray.slice(remaining).map((f) => f.name).join(", ");
        errors.push(`Skipped (limit reached): ${skipped}`);
      }

      if (errors.length > 0) {
        setTimeout(() => toast.error(errors.join("\n")), 0);
      }

      return [...prev, ...valid];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const isSubmitting = submitMutation.isPending || uploading;
  const feedbackButtonStyle = feedbackPlacement.mode === "custom"
    ? {
      left: `${feedbackPlacement.x}px`,
      top: `${feedbackPlacement.y}px`,
    }
    : {
      right: `${FEEDBACK_MARGIN}px`,
      bottom: `calc(${FEEDBACK_MARGIN}px + env(safe-area-inset-bottom))`,
    };

  const handleFeedbackPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    suppressNextClickRef.current = false;
    setIsButtonDragging(true);

    const rect = feedbackButtonRef.current?.getBoundingClientRect();
    const fallbackPosition = feedbackPlacement.mode === "custom"
      ? { x: feedbackPlacement.x, y: feedbackPlacement.y }
      : getDockedFeedbackPosition(window.innerWidth, window.innerHeight, {
        width: rect?.width ?? FEEDBACK_DEFAULT_WIDTH,
        height: rect?.height ?? FEEDBACK_DEFAULT_HEIGHT,
      });

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect?.left ?? fallbackPosition.x,
      originY: rect?.top ?? fallbackPosition.y,
      width: rect?.width ?? FEEDBACK_DEFAULT_WIDTH,
      height: rect?.height ?? FEEDBACK_DEFAULT_HEIGHT,
      moved: false,
    };
  };

  const handleFeedbackClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressNextClickRef.current) {
      event.preventDefault();
      suppressNextClickRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSubmitting) { setOpen(v); if (!v) resetForm(); } }}>
      <DialogTrigger asChild>
        <Button
          ref={feedbackButtonRef}
          size="sm"
          variant="outline"
          aria-label="Open feedback dialog"
          className="z-50 h-11 w-11 rounded-full p-0 shadow-lg sm:h-8 sm:w-auto sm:gap-2 sm:px-3"
          style={{
            position: "fixed",
            touchAction: "none",
            cursor: isButtonDragging ? "grabbing" : "grab",
            ...feedbackButtonStyle,
          }}
          onPointerDown={handleFeedbackPointerDown}
          onClick={handleFeedbackClick}
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Show retry banner if ticket created but upload failed */}
          {pendingUploadTicketId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="text-amber-800 font-medium">Ticket created but file upload failed</p>
              <p className="text-amber-600 text-xs mt-1">
                You can retry uploading or skip to submit without files.
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={uploading}
                  onClick={handleRetryUpload}
                >
                  <RefreshCw className={`h-3 w-3 ${uploading ? "animate-spin" : ""}`} />
                  {uploading ? "Uploading..." : "Retry Upload"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    toast.success("Feedback submitted without attachments.");
                    resetForm();
                  }}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}

          {!pendingUploadTicketId && (
            <>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Describe in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </>
          )}

          {/* File Attachments */}
          <div>
            <div
              role="button"
              tabIndex={0}
              className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50 hover:bg-muted/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Paperclip className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isDragOver ? "Drop files here" : "Drag & drop or click to attach files"}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                jpg, png, webp, pdf, md — max 5 MB each — up to {MAX_FILES} files
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1 text-xs"
                  >
                    {getFileIcon(file.name)}
                    <span className="truncate flex-1 min-w-0">{file.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      aria-label={`Remove ${file.name}`}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  {files.length}/{MAX_FILES} files
                </p>
              </div>
            )}
          </div>

          {!pendingUploadTicketId && (
            <Button
              className="w-full"
              disabled={!title.trim() || isSubmitting}
              onClick={() =>
                submitMutation.mutate({
                  ticketType: ticketType as any,
                  title: title.trim(),
                  description: description.trim() || undefined,
                })
              }
            >
              {uploading
                ? "Uploading files..."
                : submitMutation.isPending
                  ? "Submitting..."
                  : "Submit Feedback"}
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-primary text-center w-full"
            onClick={() => { setOpen(false); setLocation("/my-feedback"); }}
          >
            View my submitted feedback &rarr;
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
