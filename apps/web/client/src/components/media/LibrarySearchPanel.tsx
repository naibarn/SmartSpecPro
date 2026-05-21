import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";
import { FileImage, FileText, Film, Loader2, Maximize2, Music, Plus, Search } from "lucide-react";

import type { LibraryItemTypeFilter, LibrarySearchResultItem } from "@/lib/libraryUi";
import { getLibraryStatusMeta } from "@/lib/libraryUi";

type MediaLibraryItemTypeFilter = Exclude<LibraryItemTypeFilter, "all">;

interface LibrarySearchPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  isLoading: boolean;
  isFetchingMore?: boolean;
  results: LibrarySearchResultItem[];
  totalResults?: number;
  hasMore?: boolean;
  loadMoreRef?: React.Ref<HTMLDivElement>;
  errorMessage?: string;
  selectedItemId?: number | null;
  itemTypeFilter?: MediaLibraryItemTypeFilter;
  onItemTypeFilterChange?: (value: MediaLibraryItemTypeFilter) => void;
  addToReferenceLabel?: string;
  canAddToReferenceItem?: (item: LibrarySearchResultItem) => boolean;
  onAddToReference?: (item: LibrarySearchResultItem) => void;
  onPreview?: (item: LibrarySearchResultItem) => void;
  onSelect: (item: LibrarySearchResultItem) => void;
}

export default function LibrarySearchPanel({
  query,
  onQueryChange,
  isLoading,
  isFetchingMore = false,
  results,
  totalResults = 0,
  hasMore = false,
  loadMoreRef,
  errorMessage,
  selectedItemId,
  itemTypeFilter = "image",
  onItemTypeFilterChange,
  addToReferenceLabel = "Use as reference",
  canAddToReferenceItem,
  onAddToReference,
  onPreview,
  onSelect,
}: LibrarySearchPanelProps) {
  const { t } = useScopedTranslation(["media", "common"]);
  const showItemTypeFilter = typeof onItemTypeFilterChange === "function";
  const showAddToReference = typeof onAddToReference === "function";

  const getItemDragUrl = (item: LibrarySearchResultItem): string | null => {
    const itemType = item.item_type.toLowerCase();
    const sourceUrl = item.source_url?.trim() || null;
    const thumbnailUrl = item.thumbnail_url?.trim() || null;

    if (itemType === "video") {
      return sourceUrl;
    }

    return sourceUrl || thumbnailUrl;
  };

  const handleItemDragStart = (event: React.DragEvent, item: LibrarySearchResultItem) => {
    const dragUrl = getItemDragUrl(item);
    if (!dragUrl) {
      event.preventDefault();
      return;
    }

    const mediaType = item.item_type.toLowerCase() === "video"
      ? "video"
      : item.item_type.toLowerCase() === "audio"
        ? "audio"
        : "image";
    event.dataTransfer.setData("text/uri-list", dragUrl);
    event.dataTransfer.setData("text/plain", dragUrl);
    event.dataTransfer.setData("application/x-smartspec-media-type", mediaType);
    event.dataTransfer.setData("text/x-smartspec-media-type", mediaType);
    event.dataTransfer.effectAllowed = "copy";
  };

  const renderItemPreview = (item: LibrarySearchResultItem) => {
    const itemType = item.item_type.toLowerCase();
    const thumbnailUrl = item.thumbnail_url?.trim() || null;
    const sourceUrl = item.source_url?.trim() || null;
    const previewUrl = thumbnailUrl || sourceUrl;

    if (itemType === "image" && previewUrl) {
      return (
        <img
          src={previewUrl}
          alt={item.title}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      );
    }

    if (itemType === "video") {
      if (thumbnailUrl) {
        return (
          <img
            src={thumbnailUrl}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        );
      }
      if (sourceUrl) {
        return (
          <video
            src={sourceUrl}
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            playsInline
            draggable={false}
          />
        );
      }
    }

    if (itemType === "image") {
      return <FileImage className="h-5 w-5 text-muted-foreground" />;
    }
    if (itemType === "video") {
      return <Film className="h-5 w-5 text-muted-foreground" />;
    }
    if (itemType === "audio") {
      return <Music className="h-5 w-5 text-muted-foreground" />;
    }

    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="min-h-full min-w-0 space-y-2 rounded-lg border bg-white/70 p-2.5 backdrop-blur">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Search className="h-3.5 w-3.5" />
          {t("mediaStudio.librarySearchTitle")}
        </h3>
      </div>

      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("mediaStudio.librarySearchPlaceholder")}
        className="h-9"
      />

      {showItemTypeFilter && (
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "image", label: t("mediaStudio.librarySearchImage"), icon: FileImage },
              { value: "video", label: t("mediaStudio.librarySearchVideo"), icon: Film },
              { value: "audio", label: t("mediaStudio.librarySearchAudio"), icon: Music },
            ] as const
          ).map(({ value, label, icon: Icon }) => {
            const active = itemTypeFilter === value;
            return (
              <Button
                key={value}
                size="sm"
                type="button"
                variant={active ? "default" : "outline"}
                className="h-9 gap-1.5"
                aria-pressed={active}
                onClick={() => onItemTypeFilterChange?.(value)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            );
          })}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("mediaStudio.librarySearchLoading")}
        </div>
      )}

      {errorMessage && !isLoading && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}

      {!isLoading && !errorMessage && results.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("mediaStudio.librarySearchNoMatches")}</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
            {results.map((item) => {
              const status = getLibraryStatusMeta(item.status);
              const isSelected = selectedItemId === item.item_id;
              const dragUrl = getItemDragUrl(item);
              const canDrag = Boolean(dragUrl);
              const canAddToReference = showAddToReference && (canAddToReferenceItem ? canAddToReferenceItem(item) : true);
              const itemType = item.item_type.toLowerCase();
              const canPreview = itemType === "image" || itemType === "video";
              return (
                <div
                  key={item.item_id}
                  className={cn(
                    "group rounded-lg border bg-background p-1.5 transition hover:border-blue-300",
                    isSelected ? "border-purple-400 bg-purple-50/60 ring-2 ring-purple-100" : "border-slate-200",
                    canDrag && "cursor-grab active:cursor-grabbing",
                    !canDrag && "cursor-default",
                  )}
                  draggable={canDrag}
                  onDragStart={canDrag ? (event) => handleItemDragStart(event, item) : undefined}
                >
                  <button
                    type="button"
                    className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-slate-50 text-left"
                    onClick={() => {
                      if (canPreview && onPreview) {
                        onPreview(item);
                      } else {
                        onSelect(item);
                      }
                    }}
                    aria-label={`Preview ${item.title}`}
                  >
                    {renderItemPreview(item)}
                    {canPreview && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                        <span className="rounded-full bg-white/90 p-2 text-slate-800 shadow">
                          <Maximize2 className="h-4 w-4" />
                        </span>
                      </span>
                    )}
                    <Badge className={cn("absolute left-1.5 top-1.5 shadow-sm", status.className)}>
                      {status.label}
                    </Badge>
                  </button>

                  <div className="mt-2 space-y-2 px-0.5">
                    <div className="min-w-0">
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug" title={item.title}>
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.item_type} • {item.model_name || item.source}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {status.retryable ? (
                        <span className="min-w-0 truncate text-xs text-red-600">{t("mediaStudio.librarySearchRetryFromHistory")}</span>
                      ) : (
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{t("mediaStudio.librarySearchReadyToReuse")}</span>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {showAddToReference && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-w-0 flex-1"
                          onClick={() => onAddToReference?.(item)}
                          disabled={!canAddToReference}
                          title={addToReferenceLabel}
                        >
                          <Plus className="mr-1 h-4 w-4 shrink-0" />
                          <span className="truncate">{addToReferenceLabel}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "outline"}
                        className="min-w-0 flex-1"
                        onClick={() => onSelect(item)}
                      >
                        <span className="truncate">{t("common.select")}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div ref={loadMoreRef} className="min-h-8">
            {hasMore ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {isFetchingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("mediaStudio.librarySearchLoading")}
                  </>
                ) : (
                  t("mediaStudio.historyGalleryShowingCount", {
                    shown: results.length,
                    total: totalResults,
                  })
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
