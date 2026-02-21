import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Clock, FileText, Loader2, RotateCcw, X } from "lucide-react";
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

interface MarkdownVersionHistoryProps {
  itemId: number;
  onRestore?: () => void;
}

export function MarkdownVersionHistory({
  itemId,
  onRestore,
}: MarkdownVersionHistoryProps) {
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

  async function handleRestore() {
    if (!selectedVersionId) return;
    try {
      await restoreMutation.mutateAsync({ versionId: selectedVersionId });
      toast.success("Version restored successfully.");
      await Promise.all([
        trpcUtils.library.getMarkdownContent.invalidate({ id: itemId }),
        trpcUtils.library.getVersionHistory.invalidate({ itemId }),
        trpcUtils.library.listDocuments.invalidate(),
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
        className="gap-2"
      >
        <Clock className="h-4 w-4" />
        Version History
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
                Click a version on the left to preview. Versions are saved automatically on each save.
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
                            {(version.contentSizeBytes / 1024).toFixed(1)} KB
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
                      Versions are saved automatically when you save.
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
                            <span className="text-sm text-slate-600">
                              {new Date(selectedVersion.createdAt).toLocaleString()}
                            </span>
                            {selectedVersion.changeDescription && (
                              <span className="text-sm text-slate-500">
                                — {selectedVersion.changeDescription}
                              </span>
                            )}
                          </div>
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
                                  Current content will be saved as a new version before restoring. You can always undo by restoring again.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleRestore}>
                                  Restore
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ) : (
                        <Skeleton className="h-6 w-48" />
                      )}
                    </div>

                    {/* Markdown preview area */}
                    <div className="flex-1 overflow-y-auto p-5">
                      {isLoadingContent ? (
                        <div className="space-y-3">
                          <Skeleton className="h-8 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-5/6" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      ) : selectedVersion ? (
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
