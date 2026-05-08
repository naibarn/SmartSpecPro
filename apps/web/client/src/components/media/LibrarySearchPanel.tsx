import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";
import { FileImage, FileText, Film, Loader2, Music, Plus, Search } from "lucide-react";

import type { LibraryItemTypeFilter, LibrarySearchResultItem } from "@/lib/libraryUi";
import { getLibraryStatusMeta } from "@/lib/libraryUi";

type LibraryRecentDaysFilter = "all" | 1 | 3 | 7 | 15 | 30;

interface LibrarySearchPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  recentDays: LibraryRecentDaysFilter;
  onRecentDaysChange: (value: LibraryRecentDaysFilter) => void;
  isLoading: boolean;
  results: LibrarySearchResultItem[];
  totalResults?: number;
  hasMore?: boolean;
  errorMessage?: string;
  selectedItemId?: number | null;
  itemTypeFilter?: LibraryItemTypeFilter;
  onItemTypeFilterChange?: (value: LibraryItemTypeFilter) => void;
  addToReferenceLabel?: string;
  canAddToReferenceItem?: (item: LibrarySearchResultItem) => boolean;
  onAddToReference?: (item: LibrarySearchResultItem) => void;
  onSelect: (item: LibrarySearchResultItem) => void;
}

export default function LibrarySearchPanel({
  query,
  onQueryChange,
  recentDays,
  onRecentDaysChange,
  isLoading,
  results,
  totalResults = 0,
  hasMore = false,
  errorMessage,
  selectedItemId,
  itemTypeFilter = "all",
  onItemTypeFilterChange,
  addToReferenceLabel = "Use as reference",
  canAddToReferenceItem,
  onAddToReference,
  onSelect,
}: LibrarySearchPanelProps) {
  const { t } = useScopedTranslation(["media", "common"]);
  const showItemTypeFilter = typeof onItemTypeFilterChange === "function";
  const showAddToReference = typeof onAddToReference === "function";
  const hasActiveSearchCriteria = query.trim().length > 0 || recentDays !== "all" || itemTypeFilter !== "all";

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
    <div className="min-w-0 space-y-2 rounded-lg border bg-white/70 p-2.5 backdrop-blur">
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { value: "all", label: t("common.allReadStates"), icon: FileText },
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("mediaStudio.librarySearchUpdatedIn")}</span>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={String(recentDays)}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "all") {
              onRecentDaysChange("all");
              return;
            }
            onRecentDaysChange(Number(next) as Exclude<LibraryRecentDaysFilter, "all">);
          }}
        >
          <option value="1">{t("mediaStudio.librarySearchOneDay")}</option>
          <option value="3">{t("mediaStudio.librarySearchThreeDays")}</option>
          <option value="7">{t("mediaStudio.librarySearchSevenDays")}</option>
          <option value="15">{t("mediaStudio.librarySearchFifteenDays")}</option>
          <option value="30">{t("mediaStudio.librarySearchOneMonth")}</option>
          <option value="all">{t("mediaStudio.librarySearchAllTime")}</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("mediaStudio.librarySearchLoading")}
        </div>
      )}

      {errorMessage && !isLoading && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}

      {!hasActiveSearchCriteria && !isLoading && (
        <p className="text-xs text-muted-foreground">
          {t("mediaStudio.librarySearchHint")}
        </p>
      )}

      {hasActiveSearchCriteria && !isLoading && !errorMessage && results.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("mediaStudio.librarySearchNoMatches")}</p>
      )}

      {hasActiveSearchCriteria && !isLoading && !errorMessage && hasMore && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {t("mediaStudio.librarySearchHasMore", { total: totalResults })}
        </p>
      )}

      {results.length > 0 && (
        <ScrollArea className="h-52 pr-2">
          <div className="space-y-2">
            {results.map((item) => {
              const status = getLibraryStatusMeta(item.status);
              const isSelected = selectedItemId === item.item_id;
              const dragUrl = getItemDragUrl(item);
              const canDrag = Boolean(dragUrl);
              const canAddToReference = showAddToReference && (canAddToReferenceItem ? canAddToReferenceItem(item) : true);
              return (
                <div
                  key={item.item_id}
                  className={cn(
                    "rounded-lg border p-2 space-y-2",
                    isSelected ? "border-purple-400 bg-purple-50/60" : "border-slate-200",
                    canDrag && "cursor-grab active:cursor-grabbing",
                    !canDrag && "cursor-default",
                  )}
                  draggable={canDrag}
                  onDragStart={canDrag ? (event) => handleItemDragStart(event, item) : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md border bg-slate-50 flex items-center justify-center">
                        {renderItemPreview(item)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.item_type} • {item.model_name || item.source}
                        </p>
                      </div>
                    </div>
                    <Badge className={status.className}>{status.label}</Badge>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {status.retryable ? (
                      <span className="text-xs text-red-600">{t("mediaStudio.librarySearchRetryFromHistory")}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("mediaStudio.librarySearchReadyToReuse")}</span>
                    )}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {showAddToReference && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAddToReference?.(item)}
                          disabled={!canAddToReference}
                          title={addToReferenceLabel}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {addToReferenceLabel}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "outline"}
                        onClick={() => onSelect(item)}
                      >
                        {t("common.select")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
