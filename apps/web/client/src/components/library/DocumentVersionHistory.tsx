import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Clock, Download, File, FileText, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

interface DocumentVersionHistoryProps {
  itemId: number;
  onRestore?: () => void;
  compact?: boolean;
}

interface FileSnapshotMeta {
  file_name?: string;
  file_type?: string;
  file_size_bytes?: number;
  original_source_url?: string;
}

function parseFileSnapshotMeta(content: string): FileSnapshotMeta | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentVersionHistory({
  itemId,
  onRestore,
  compact = false,
}: DocumentVersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const trpcUtils = trpc.useUtils();

  const { data: versions, isLoading: isLoadingVersions } = trpc.library.getVersionHistory.useQuery(
    { itemId, limit: 50 },
    { enabled: isOpen },
  );

  const { data: selectedVersion, isLoading: isLoadingContent } = trpc.library.getVersionContent.useQuery(
    { versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const restoreMutation = trpc.library.restoreVersion.useMutation();

  const isFileSnapshot = selectedVersion?.contentType === "file_snapshot";
  const fileMeta = isFileSnapshot && selectedVersion
    ? parseFileSnapshotMeta(selectedVersion.content)
    : null;

  // Resolve a fresh download URL for file snapshots (handles S3 signed URL expiry)
  const { data: snapshotUrl } = trpc.library.getVersionSnapshotUrl.useQuery(
    { versionId: selectedVersionId! },
    { enabled: !!selectedVersionId && isFileSnapshot },
  );

  async function handleRestore() {
    if (!selectedVersionId) return;
    try {
      await restoreMutation.mutateAsync({ versionId: selectedVersionId });
      toast.success("Version restored successfully.");
      await Promise.all([
        trpcUtils.library.getMarkdownContent.invalidate({ id: itemId }),
        trpcUtils.library.getVersionHistory.invalidate({ itemId }),
        trpcUtils.library.listDocuments.invalidate(),
        trpcUtils.library.getItem.invalidate({ id: itemId }),
      ]);
      setIsOpen(false);
      setSelectedVersionId(null);
      onRestore?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore version",
      );
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={compact
          ? "h-8 w-8 rounded-full p-0"
          : "gap-1.5 px-2 sm:gap-2 sm:px-3"}
        aria-label="Version history"
      >
        <Clock className="h-4 w-4" />
        {compact ? null : <span className="hidden sm:inline">Version History</span>}
      </Button>

      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setSelectedVersionId(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-xl focus:outline-none"
            style={{ width: "80vw", maxWidth: "1100px" }}
          >
            {/* Header */}
            <div className="shrink-0 border-b px-6 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-slate-600" />
                  <span className="text-base font-semibold">Version History</span>
                  {versions && versions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {versions.length} versions
                    </Badge>
                  )}
                </div>
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </button>
                </DialogPrimitive.Close>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Click a version on the left to preview. Restoring a version archives the current file first.
              </p>
            </div>

            {/* Body: version list + preview side-by-side */}
            <div className="flex min-h-0 flex-1">
              {/* Left: version list */}
              <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r p-3">
                {isLoadingVersions ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : versions && versions.length > 0 ? (
                  <div className="space-y-1.5">
                    {versions.map((version) => {
                      const isSelected = selectedVersionId === version.id;
                      const isFile = version.contentType === "file_snapshot";
                      const meta = isFile ? parseFileSnapshotMeta(version.content) : null;
                      return (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => setSelectedVersionId(version.id)}
                          className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                            isSelected
                              ? "border-sky-400 bg-sky-50 ring-1 ring-sky-300"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isFile ? (
                              <File className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            )}
                            <Badge
                              variant={isSelected ? "default" : "outline"}
                              className="shrink-0 text-xs"
                            >
                              v{version.versionNumber}
                            </Badge>
                            <span className="truncate text-xs text-slate-500">
                              {new Date(version.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {version.changeDescription && (
                            <p className="mt-1 truncate text-xs text-slate-600">
                              {version.changeDescription}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-slate-400">
                            {isFile && meta?.file_size_bytes
                              ? formatFileSize(meta.file_size_bytes)
                              : `${(version.contentSizeBytes / 1024).toFixed(1)} KB`}
                            {isFile && meta?.file_name ? (
                              <span className="ml-1">({meta.file_name})</span>
                            ) : null}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-500">No versions yet.</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Versions are created when you upload a new version or edit content.
                    </p>
                  </div>
                )}
              </div>

              {/* Right: preview */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {selectedVersionId ? (
                  <>
                    {/* Preview toolbar */}
                    <div className="shrink-0 border-b px-4 py-3">
                      {selectedVersion ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              v{selectedVersion.versionNumber}
                            </Badge>
                            {isFileSnapshot ? (
                              <Badge variant="secondary" className="text-xs">
                                File
                              </Badge>
                            ) : null}
                            <span className="text-sm text-slate-600">
                              {new Date(selectedVersion.createdAt).toLocaleString()}
                            </span>
                            {selectedVersion.changeDescription && (
                              <span className="text-sm text-slate-500">
                                — {selectedVersion.changeDescription}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isFileSnapshot && snapshotUrl?.url ? (
                              <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
                                <a
                                  href={snapshotUrl.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  download={snapshotUrl.fileName}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Download
                                </a>
                              </Button>
                            ) : null}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={restoreMutation.isPending}
                                  className="shrink-0 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                                >
                                  {restoreMutation.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )}
                                  Restore this version
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Restore version {selectedVersion.versionNumber}?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {isFileSnapshot
                                      ? "The current file will be archived as a new version before restoring. You can always undo by restoring again."
                                      : "Current content will be saved as a new version before restoring. You can always undo by restoring again."}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      await handleRestore();
                                    }}
                                  >
                                    Restore
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ) : (
                        <Skeleton className="h-6 w-48" />
                      )}
                    </div>

                    {/* Content preview area */}
                    <div className="flex-1 overflow-y-auto p-5">
                      {isLoadingContent ? (
                        <div className="space-y-3">
                          <Skeleton className="h-8 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-5/6" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      ) : selectedVersion && isFileSnapshot && fileMeta ? (
                        /* File snapshot preview */
                        <div className="space-y-4">
                          <div className="rounded-lg border bg-gradient-to-r from-slate-50 to-sky-50 p-6">
                            <div className="flex items-start gap-4">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm">
                                <File className="h-6 w-6 text-slate-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-base font-medium">
                                  {fileMeta.file_name || "Unknown file"}
                                </h3>
                                <div className="mt-2 space-y-1 text-sm text-slate-600">
                                  <p>
                                    <span className="font-medium">Type:</span>{" "}
                                    {fileMeta.file_type || "Unknown"}
                                  </p>
                                  <p>
                                    <span className="font-medium">Size:</span>{" "}
                                    {fileMeta.file_size_bytes
                                      ? formatFileSize(fileMeta.file_size_bytes)
                                      : "Unknown"}
                                  </p>
                                  <p>
                                    <span className="font-medium">Archived:</span>{" "}
                                    {new Date(selectedVersion.createdAt).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                          {fileMeta.original_source_url ? (
                            <p className="text-xs text-muted-foreground">
                              This is a snapshot of the file before it was replaced. You can download it or restore it to make it the current version.
                            </p>
                          ) : null}
                        </div>
                      ) : selectedVersion ? (
                        /* Markdown preview */
                        <SafeMarkdown className="md-preview">
                          {selectedVersion.content}
                        </SafeMarkdown>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <Clock className="h-10 w-10 text-slate-200" />
                    <p className="text-sm">Select a version on the left to preview</p>
                  </div>
                )}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
