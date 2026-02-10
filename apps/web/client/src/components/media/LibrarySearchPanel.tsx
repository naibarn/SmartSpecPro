import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";

import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import { getLibraryStatusMeta } from "@/lib/libraryUi";

interface LibrarySearchPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  isLoading: boolean;
  results: LibrarySearchResultItem[];
  errorMessage?: string;
  selectedItemId?: number | null;
  onSelect: (item: LibrarySearchResultItem) => void;
}

export default function LibrarySearchPanel({
  query,
  onQueryChange,
  isLoading,
  results,
  errorMessage,
  selectedItemId,
  onSelect,
}: LibrarySearchPanelProps) {
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

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching library...
        </div>
      )}

      {errorMessage && !isLoading && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}

      {!query.trim() && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Type to search indexed library items for reuse.
        </p>
      )}

      {!!query.trim() && !isLoading && !errorMessage && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No matching library items.</p>
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
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={item.title}>
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.item_type} • {item.model_name || item.source}
                      </p>
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
