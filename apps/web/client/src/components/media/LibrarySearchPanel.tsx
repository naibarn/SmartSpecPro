import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { FileImage, FileText, Film, Loader2, Search } from "lucide-react";

import type { LibrarySearchResultItem } from "@/lib/libraryUi";
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
  onSelect,
}: LibrarySearchPanelProps) {
  const hasActiveSearchCriteria = query.trim().length > 0 || recentDays !== "all";

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

    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Search className="h-4 w-4" />
          Search Library
        </h3>
      </div>

      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search reusable assets..."
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Updated in:</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
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
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="15">15 days</option>
          <option value="30">1 month</option>
          <option value="all">All time</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching library...
        </div>
      )}

      {errorMessage && !isLoading && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}

      {!hasActiveSearchCriteria && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Pick a timeframe or type to search indexed library items for reuse.
        </p>
      )}

      {hasActiveSearchCriteria && !isLoading && !errorMessage && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No matching library items.</p>
      )}

      {hasActiveSearchCriteria && !isLoading && !errorMessage && hasMore && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Showing up to 50 results. There may be more items ({totalResults}+). Add more filters or keywords.
        </p>
      )}

      {results.length > 0 && (
        <ScrollArea className="h-56 pr-2">
          <div className="space-y-2">
            {results.map((item) => {
              const status = getLibraryStatusMeta(item.status);
              const isSelected = selectedItemId === item.item_id;
              return (
                <div
                  key={item.item_id}
                  className={cn(
                    "rounded-lg border p-2 space-y-2",
                    isSelected ? "border-purple-400 bg-purple-50/60" : "border-slate-200",
                  )}
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

                  <div className="flex items-center justify-between">
                    {status.retryable ? (
                      <span className="text-xs text-red-600">Retry from Media History</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ready to reuse</span>
                    )}
                    <Button
                      size="sm"
                      variant={isSelected ? "secondary" : "outline"}
                      onClick={() => onSelect(item)}
                    >
                      Select
                    </Button>
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
