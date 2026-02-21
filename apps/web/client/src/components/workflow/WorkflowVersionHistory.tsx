import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Clock, GitBranch, Loader2, RotateCcw, Workflow, X } from "lucide-react";
import { toast } from "sonner";

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

interface WorkflowVersionHistoryProps {
  workflowId: number;
  onClose: () => void;
  onRestore?: () => void;
}

export function WorkflowVersionHistory({
  workflowId,
  onClose,
  onRestore,
}: WorkflowVersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const trpcUtils = trpc.useUtils();

  const { data: versionData, isLoading: isLoadingVersions } =
    trpc.workflow.listVersions.useQuery(
      { workflowId, limit: 50 },
      { enabled: isOpen },
    );
  const versions = versionData?.items;
  const versionTotal = versionData?.total ?? 0;

  const { data: selectedVersion, isLoading: isLoadingContent } =
    trpc.workflow.getVersion.useQuery(
      { versionId: selectedVersionId! },
      { enabled: !!selectedVersionId },
    );

  const restoreMutation = trpc.workflow.restoreVersion.useMutation();

  async function handleRestore() {
    if (!selectedVersionId) return;
    try {
      await restoreMutation.mutateAsync({ versionId: selectedVersionId });
      toast.success("Workflow restored successfully.");
      await Promise.all([
        trpcUtils.workflow.load.invalidate({ id: workflowId }),
        trpcUtils.workflow.listVersions.invalidate({ workflowId }),
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
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSelectedVersionId(null);
          onClose();
        }
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
                {versionTotal > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {versionTotal} version{versionTotal !== 1 ? "s" : ""}
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
              Select a version to preview. A snapshot is saved automatically every time you save the
              workflow.
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
                  {versions.map((version: any) => {
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
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <span>
                            {version.nodeCount ?? 0} nodes · {version.edgeCount ?? 0} connections
                          </span>
                        </div>
                        {version.changeDescription && (
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {version.changeDescription}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Workflow className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-500">No versions yet.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Save the workflow to create the first version.
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
                                Your current workflow will be auto-saved as a new version before
                                restoring. You can always undo by restoring the latest version.
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

                  {/* Version detail */}
                  <div className="flex-1 overflow-y-auto p-5">
                    {isLoadingContent ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    ) : selectedVersion ? (
                      <div className="space-y-4">
                        {/* Workflow name */}
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Workflow Name
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-slate-800">
                            {selectedVersion.name}
                          </p>
                        </div>

                        {/* Description */}
                        {selectedVersion.description && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              Description
                            </p>
                            <p className="mt-0.5 text-sm text-slate-600">
                              {selectedVersion.description}
                            </p>
                          </div>
                        )}

                        {/* Stats */}
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Workflow Structure
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-3">
                            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                              <GitBranch className="h-4 w-4 text-slate-500" />
                              <span className="text-sm font-medium text-slate-700">
                                {selectedVersion.workflowJson?.nodes?.length ?? 0} nodes
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                              <Workflow className="h-4 w-4 text-slate-500" />
                              <span className="text-sm font-medium text-slate-700">
                                {selectedVersion.workflowJson?.edges?.length ?? 0} connections
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Default model */}
                        {selectedVersion.defaultModel && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              Default Model
                            </p>
                            <p className="mt-0.5 text-sm text-slate-600">
                              {selectedVersion.defaultModel}
                            </p>
                          </div>
                        )}

                        {/* Node type breakdown */}
                        {selectedVersion.workflowJson?.nodes?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              Node Types
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {(Object.entries(
                                (selectedVersion.workflowJson as any).nodes.reduce(
                                  (acc: Record<string, number>, node: any) => {
                                    const t = node?.data?.nodeType ?? node?.type ?? "unknown";
                                    acc[t] = (acc[t] ?? 0) + 1;
                                    return acc;
                                  },
                                  {} as Record<string, number>,
                                ),
                              ) as [string, number][])
                                .sort((a, b) => b[1] - a[1])
                                .map(([type, cnt]) => (
                                  <Badge
                                    key={type}
                                    variant="secondary"
                                    className="text-xs font-normal"
                                  >
                                    {type}
                                    {cnt > 1 ? ` ×${cnt}` : ""}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
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
  );
}
