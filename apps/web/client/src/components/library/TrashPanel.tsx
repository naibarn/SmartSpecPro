import React, { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";

export function TrashPanel() {
  const trpcUtils = trpc.useUtils();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);

  const {
    data: trashData,
    isLoading,
    error,
    refetch,
  } = trpc.library.listTrash.useQuery({ limit: 50, offset: 0 });

  const restoreMutation = trpc.library.restoreFromTrash.useMutation({
    onSuccess: () => {
      trpcUtils.library.listTrash.invalidate();
      trpcUtils.library.listDocuments.invalidate();
    },
  });

  const deleteMutation = trpc.library.permanentDelete.useMutation({
    onSuccess: () => {
      trpcUtils.library.listTrash.invalidate();
    },
  });

  const items = trashData?.items ?? [];

  async function handleRestore(itemId: number) {
    try {
      await restoreMutation.mutateAsync({ itemId });
      toast.success("File restored successfully");
    } catch {
      toast.error("Failed to restore file");
    }
  }

  async function handlePermanentDelete(itemId: number) {
    try {
      await deleteMutation.mutateAsync({ itemId });
      toast.success("File permanently deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete file");
    }
  }

  async function handleEmptyTrash() {
    try {
      const results = await Promise.allSettled(
        items.map((item) => deleteMutation.mutateAsync({ itemId: item.id })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        toast.success("Trash emptied");
      } else {
        toast.error(`Failed to delete ${failed} of ${items.length} items`);
      }
    } catch {
      toast.error("Failed to empty trash");
    } finally {
      setEmptyTrashOpen(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Trash</h2>
          <p className="text-sm text-muted-foreground">
            Items will be permanently deleted after 90 days.
          </p>
        </div>
        {items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setEmptyTrashOpen(true)}
            aria-label="Empty all trash items"
          >
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            Empty Trash
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="mt-3 text-sm text-muted-foreground">
            Loading trash items...
          </span>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="h-16 w-16 text-red-500" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Failed to load trash
          </h3>
          <p className="mt-2 text-sm text-gray-500">{error.message}</p>
          <Button onClick={() => refetch()} className="mt-4" size="sm">
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && items.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16"
          role="status"
          aria-live="polite"
        >
          <Trash2
            className="h-16 w-16 text-gray-400"
            aria-hidden="true"
          />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Trash is empty
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Deleted items will appear here
          </p>
        </div>
      )}

      {/* Item list */}
      {!isLoading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-900">
                  {item.title}
                </span>
                {item.daysUntilPurge < 7 && (
                  <span
                    role="status"
                    aria-label={`Item will be deleted in ${item.daysUntilPurge} days`}
                    className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                  >
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {item.daysUntilPurge} days left
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDeleteInfo(item.daysInTrash)}
                {item.daysUntilPurge >= 7 && (
                  <>{" \u00b7 "}{item.daysUntilPurge} days left</>
                )}
              </p>
            </div>

            <div className="ml-4 flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(item.id)}
                disabled={restoreMutation.isPending}
                aria-label={`Restore ${item.title}`}
              >
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
                Restore
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() =>
                  setDeleteTarget({ id: item.id, title: item.title })
                }
                disabled={deleteMutation.isPending}
                aria-label={`Permanently delete ${item.title}`}
              >
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.title}&rdquo;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) handlePermanentDelete(deleteTarget.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty trash confirmation dialog */}
      <AlertDialog open={emptyTrashOpen} onOpenChange={setEmptyTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete all {items.length}{" "}
              items in trash? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleEmptyTrash}
            >
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDeleteInfo(daysInTrash: number): string {
  if (daysInTrash === 0) return "Deleted today";
  if (daysInTrash === 1) return "Deleted yesterday";
  if (daysInTrash < 7) return `Deleted ${daysInTrash} days ago`;
  if (daysInTrash < 30)
    return `Deleted ${Math.floor(daysInTrash / 7)} weeks ago`;
  return `Deleted ${Math.floor(daysInTrash / 30)} months ago`;
}
