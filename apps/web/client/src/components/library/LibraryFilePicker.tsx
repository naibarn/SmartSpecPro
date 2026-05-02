import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface LibraryFilePickerProps {
  value: string;
  onValueChange: (url: string) => void;
  /** Allowed file extensions without leading dot, e.g. ["png", "jpg"]. Omit to allow all. */
  allowedExtensions?: string[];
  extraOptions?: Array<{
    id: string;
    title: string;
    url: string;
    extension?: string;
    groupLabel?: string;
  }>;
  disabled?: boolean;
}

/** Extract file extension from a library item (mirrors documentManagementUi.ts logic). */
function getItemExt(item: {
  item_type: string;
  source_url: string | null;
  metadata?: Record<string, unknown>;
}): string {
  const metaExt =
    typeof item.metadata?.extension === "string" ? item.metadata.extension : "";
  if (metaExt) return metaExt.toLowerCase().replace(/^\./, "");
  const mimeType = (
    typeof item.metadata?.mimeType === "string" ? item.metadata.mimeType :
    typeof item.metadata?.mime_type === "string" ? item.metadata.mime_type :
    typeof item.metadata?.contentType === "string" ? item.metadata.contentType :
    typeof item.metadata?.content_type === "string" ? item.metadata.content_type :
    ""
  ).toLowerCase();
  if (mimeType.startsWith("audio/")) {
    const subtype = mimeType.split("/")[1]?.split(";")[0]?.trim();
    if (subtype) return subtype === "mpeg" ? "mp3" : subtype;
    return "audio";
  }
  const url = item.source_url ?? "";
  if (!url) return item.item_type.toLowerCase();
  const withoutQuery = url.split("?")[0];
  const parts = withoutQuery.split(".");
  if (parts.length < 2) return item.item_type.toLowerCase();
  return (parts.pop() ?? "").toLowerCase();
}

function isAllowedByExtensionOrType(
  item: { item_type: string; source_url: string | null; metadata?: Record<string, unknown> },
  allowedExtensions?: string[],
): boolean {
  if (!allowedExtensions || allowedExtensions.length === 0) return true;
  const normalizedAllowed = allowedExtensions.map((ext) => ext.toLowerCase().replace(/^\./, ""));
  const ext = getItemExt(item);
  if (normalizedAllowed.includes(ext)) return true;
  const itemType = String(item.item_type ?? "").toLowerCase();
  const acceptsAudio = normalizedAllowed.some((value) =>
    ["audio", "mp3", "wav", "m4a", "ogg", "flac", "aac", "webm", "mpeg"].includes(value),
  );
  return acceptsAudio && (itemType === "audio" || itemType === "sound");
}

export function LibraryFilePicker({
  value,
  onValueChange,
  allowedExtensions,
  extraOptions = [],
  disabled,
}: LibraryFilePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(0);

  const docsQuery = trpc.library.listDocuments.useQuery(
    { limit: 50 },
    { staleTime: 60_000, enabled: open && query.trim().length === 0 },
  );
  const searchQuery = trpc.library.search.useQuery(
    { query: query.trim() || undefined, limit: 50 },
    { staleTime: 30_000, enabled: open && query.trim().length > 0 },
  );

  useEffect(() => {
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, [open]);

  useEffect(() => {
    if (!open && query) {
      setQuery("");
    }
  }, [open, query]);

  const libraryResults = (
    query.trim().length > 0
      ? (searchQuery.data?.results ?? []).map((item: any) => ({
          ...item,
          id: item.id ?? item.item_id,
        }))
      : (docsQuery.data?.results ?? [])
  );
  const normalizedQuery = query.trim().toLowerCase();
  const extraResults = extraOptions
    .filter((item) => item.url)
    .filter((item) => {
      if (!normalizedQuery) return true;
      return item.title.toLowerCase().includes(normalizedQuery)
        || item.url.toLowerCase().includes(normalizedQuery)
        || (item.extension ?? "").toLowerCase().includes(normalizedQuery);
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      source_url: item.url,
      item_type: item.extension || "audio",
      metadata: item.extension ? { extension: item.extension } : undefined,
      groupLabel: item.groupLabel,
      __extra: true,
    }));
  const allResults = [...extraResults, ...libraryResults];
  const isLoading = docsQuery.isLoading || searchQuery.isLoading;

  // Filter by extension if specified
  const matchingResults =
    allowedExtensions && allowedExtensions.length > 0
      ? allResults.filter((item) => isAllowedByExtensionOrType(item, allowedExtensions))
      : allResults;

  // Find display name for the currently-selected URL
  const selectedItem = allResults.find((item) => item.source_url === value);
  const displayLabel = value
    ? (selectedItem?.title ?? value)
    : "Select from Library…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: triggerWidth > 0 ? triggerWidth : undefined }}
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search files…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matching files found.</CommandEmpty>
            <CommandGroup>
              {/* Clear / none option */}
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="italic text-muted-foreground">None</span>
              </CommandItem>

              {isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

              {matchingResults.map((item) => {
                const ext = getItemExt(item);
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.title} ${item.source_url ?? ""}`}
                    onSelect={() => {
                      onValueChange(item.source_url ?? "");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === item.source_url ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-1 items-center gap-2 overflow-hidden">
                      <span className="truncate">{item.title}</span>
                      {(item as any).__extra && (item as any).groupLabel ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 px-1.5 py-0 text-[10px]"
                        >
                          {(item as any).groupLabel}
                        </Badge>
                      ) : null}
                      {ext && (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-1.5 py-0 text-[10px]"
                        >
                          .{ext}
                        </Badge>
                      )}
                    </div>
                  </CommandItem>
                );
              })}

              {matchingResults.length === 0 && !isLoading && (
                <div className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
                  {allowedExtensions && allowedExtensions.length > 0
                    ? `No files with extension: ${allowedExtensions.map((e) => `.${e}`).join(", ")}`
                    : "No files in your library."}
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
