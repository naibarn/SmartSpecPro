import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";

interface MarkdownVersionHistoryProps {
  itemId: number;
  onRestore?: () => void;
}

export function MarkdownVersionHistory({
  itemId,
  onRestore,
}: MarkdownVersionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<number | null>(null);

  const trpcUtils = trpc.useUtils();

  const { data: versions, isLoading } = trpc.library.getVersionHistory.useQuery(
    { itemId, limit: 30 },
    { enabled: isExpanded },
  );

  const { data: previewVersion } = trpc.library.getVersionContent.useQuery(
    { versionId: previewVersionId! },
    { enabled: !!previewVersionId },
  );

  const restoreMutation = trpc.library.restoreVersion.useMutation();

  async function handleRestore(versionId: number) {
    const confirmed = window.confirm(
      "Restore this version? Current content will be saved as a new version before restoring.",
    );
    if (!confirmed) return;

    try {
      await restoreMutation.mutateAsync({ versionId });
      toast.success("Version restored successfully.");
      await Promise.all([
        trpcUtils.library.getMarkdownContent.invalidate({ id: itemId }),
        trpcUtils.library.getVersionHistory.invalidate({ itemId }),
        trpcUtils.library.listDocuments.invalidate(),
      ]);
      onRestore?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore version",
      );
    }
  }

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="gap-2"
      >
        <Clock className="h-4 w-4" />
        Version History
        <ChevronDown className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-600" />
          <span className="text-sm font-semibold">Version History</span>
          {versions && versions.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {versions.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsExpanded(false);
            setPreviewVersionId(null);
          }}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : versions && versions.length > 0 ? (
        <ScrollArea className="max-h-[320px]">
          <div className="space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`rounded-md border p-2.5 transition-colors ${
                  previewVersionId === version.id
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        v{version.versionNumber}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {version.changeDescription && (
                      <p className="mt-1 text-xs text-slate-600">
                        {version.changeDescription}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-400">
                      {(version.contentSizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(version.id)}
                    disabled={restoreMutation.isPending}
                    title="Restore this version"
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </Button>
                </div>

                {previewVersionId === version.id && previewVersion && (
                  <div className="mt-2 rounded border bg-slate-100 p-2">
                    <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap text-xs">
                      {previewVersion.content.slice(0, 1000)}
                      {previewVersion.content.length > 1000 && "\n..."}
                    </pre>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 h-6 w-full text-xs text-slate-500"
                  onClick={() =>
                    setPreviewVersionId(
                      previewVersionId === version.id ? null : version.id,
                    )
                  }
                >
                  {previewVersionId === version.id
                    ? "Hide preview"
                    : "Preview content"}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="py-4 text-center text-sm text-slate-500">
          No version history yet. Versions are created automatically when you
          save.
        </p>
      )}
    </div>
  );
}
