import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveDocumentPreviewType } from "@/lib/documentManagementUi";
import { cn } from "@/lib/utils";
import { getLibraryStatusMeta } from "@/lib/libraryUi";
import { getDocumentAccessLabel, type DocumentLibraryItem } from "@/lib/documentManagementUi";
import {
  FileText,
  FileType2,
  Image as ImageIcon,
  Loader2,
  Music2,
  PlayCircle,
  Video,
} from "lucide-react";

interface DocumentGridListProps {
  items: DocumentLibraryItem[];
  selectedId?: number | null;
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  onSelect: (item: DocumentLibraryItem) => void;
  onOpen?: (item: DocumentLibraryItem) => void;
}

export default function DocumentGridList({
  items,
  selectedId,
  isLoading,
  emptyMessage,
  className,
  onSelect,
  onOpen,
}: DocumentGridListProps) {
  function handleCardKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    item: DocumentLibraryItem,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(item);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documents...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
        {emptyMessage || "No documents found in this view."}
      </div>
    );
  }

  function getExtensionLabel(item: DocumentLibraryItem): string {
    const fromMetadata = typeof item.metadata?.extension === "string"
      ? item.metadata.extension.replace(/^\./, "")
      : "";
    if (fromMetadata) return fromMetadata.toLowerCase();
    const source = item.source_url || "";
    const clean = source.split("?")[0];
    const parts = clean.split(".");
    if (parts.length < 2) return item.item_type.toLowerCase();
    return (parts.pop() || item.item_type).toLowerCase();
  }

  function renderCardPreview(item: DocumentLibraryItem) {
    const previewType = resolveDocumentPreviewType(item);
    const imageLikeUrl = item.thumbnail_url || item.source_url;

    if (previewType === "image" && imageLikeUrl) {
      return (
        <div className="h-24 w-32 overflow-hidden rounded-xl border bg-slate-100 lg:h-28 lg:w-40">
          <img
            src={imageLikeUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      );
    }

    if (previewType === "video" && imageLikeUrl) {
      return (
        <div className="relative h-24 w-32 overflow-hidden rounded-xl border bg-slate-900 lg:h-28 lg:w-40">
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover opacity-90"
            />
          ) : (
            <video
              src={imageLikeUrl}
              preload="metadata"
              muted
              playsInline
              className="h-full w-full object-cover opacity-90"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-2 text-white">
              <PlayCircle className="h-6 w-6" />
            </span>
          </div>
        </div>
      );
    }

    if (previewType === "audio") {
      return (
        <div className="flex h-24 w-32 items-center justify-center rounded-xl border bg-gradient-to-br from-slate-100 to-cyan-100 text-slate-700 lg:h-28 lg:w-40">
          <Music2 className="mr-2 h-5 w-5" />
          <span className="text-xs font-medium">Audio Preview</span>
        </div>
      );
    }

    const ext = getExtensionLabel(item).toUpperCase();
    const docIcon = previewType === "markdown"
      ? <FileText className="h-5 w-5" />
      : previewType === "video"
        ? <Video className="h-5 w-5" />
        : previewType === "image"
          ? <ImageIcon className="h-5 w-5" />
          : <FileType2 className="h-5 w-5" />;

    return (
      <div className="flex h-24 w-32 items-center justify-center rounded-xl border border-dashed bg-slate-50 text-slate-600 lg:h-28 lg:w-40">
        <div className="flex flex-col items-center gap-2">
          {docIcon}
          <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700">
            {ext}
          </span>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full min-h-0 rounded-lg", className)}>
      <div className="space-y-3 pr-1.5">
        {items.map((item) => {
          const statusMeta = getLibraryStatusMeta(item.status);
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => handleCardKeyDown(event, item)}
              className={cn(
                "cursor-pointer rounded-2xl border bg-white/95 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30",
                selectedId === item.id ? "border-sky-300 bg-sky-50/70" : "border-slate-200",
              )}
            >
              <div className="flex gap-3">
                <div className="shrink-0">
                  {renderCardPreview(item)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="line-clamp-2 text-[15px] font-semibold leading-5 text-slate-900" title={item.title}>
                        {item.title}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="uppercase tracking-wide">{item.item_type}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getDocumentAccessLabel(item.access_source)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-2 sm:flex-col sm:items-end">
                      <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg px-3"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (onOpen) {
                            onOpen(item);
                            return;
                          }
                          onSelect(item);
                        }}
                      >
                        Open
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                    Updated:
                    {" "}
                    <span className="font-medium text-slate-700">
                      {new Date(item.updated_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
