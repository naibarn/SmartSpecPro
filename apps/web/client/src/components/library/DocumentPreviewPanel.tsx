import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentLibraryItem, DocumentPreviewType } from "@/lib/documentManagementUi";
import { ExternalLink } from "lucide-react";
import MarkdownFileEditor from "./MarkdownFileEditor";

interface DocumentPreviewPanelProps {
  item: DocumentLibraryItem | null;
  previewType: DocumentPreviewType;
  previewText?: string;
  markdownValue?: string;
  markdownUpdatedAt?: string;
  markdownError?: string;
  isMarkdownSaving?: boolean;
  onMarkdownChange?: (value: string) => void;
  onMarkdownSave?: () => void;
}

export default function DocumentPreviewPanel({
  item,
  previewType,
  previewText,
  markdownValue,
  markdownUpdatedAt,
  markdownError,
  isMarkdownSaving,
  onMarkdownChange,
  onMarkdownSave,
}: DocumentPreviewPanelProps) {
  if (!item) {
    return (
      <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
        Select a document to preview.
      </div>
    );
  }

  const sourceUrl = item.source_url;

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold" title={item.title}>
            {item.title}
          </h2>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">{item.item_type}</Badge>
            <Badge variant="outline">{item.status}</Badge>
          </div>
        </div>
        {sourceUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" />
              Open file
            </a>
          </Button>
        ) : null}
      </div>

      {previewType === "markdown" ? (
        <MarkdownFileEditor
          value={markdownValue || ""}
          onChange={(value) => onMarkdownChange?.(value)}
          onSave={() => onMarkdownSave?.()}
          updatedAt={markdownUpdatedAt}
          isSaving={isMarkdownSaving}
          errorMessage={markdownError}
        />
      ) : null}

      {previewType === "image" && sourceUrl ? (
        <img
          src={sourceUrl}
          alt={item.title}
          className="max-h-[60vh] w-full rounded-md border object-contain"
        />
      ) : null}

      {previewType === "video" && sourceUrl ? (
        <video src={sourceUrl} controls className="max-h-[60vh] w-full rounded-md border" />
      ) : null}

      {previewType === "audio" && sourceUrl ? (
        <audio src={sourceUrl} controls className="w-full" />
      ) : null}

      {previewType === "pdf" && sourceUrl ? (
        <iframe
          title={`preview-${item.id}`}
          src={sourceUrl}
          className="h-[60vh] w-full rounded-md border"
        />
      ) : null}

      {previewType !== "markdown" &&
      previewType !== "image" &&
      previewType !== "video" &&
      previewType !== "audio" &&
      previewType !== "pdf" ? (
        <div className="space-y-3">
          {previewText ? (
            <pre className="max-h-[60vh] overflow-auto rounded-md border bg-slate-50 p-3 text-xs">
              {previewText}
            </pre>
          ) : (
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-muted-foreground">
              Preview is not available for this file type in-browser. Use Open file instead.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
