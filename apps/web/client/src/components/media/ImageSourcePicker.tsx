import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ImagePlus,
  Upload,
  Library,
  Link,
  X,
  Loader2,
  Check,
  Search,
  History,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ImageSourcePickerProps {
  /** Current image URLs */
  value: string[];
  /** Called when images change */
  onChange: (urls: string[]) => void;
  /** Maximum number of images allowed */
  maxImages?: number;
  /** Whether upload is in progress (from parent) */
  isUploading?: boolean;
  /** Upload handler from parent (uses existing upload infrastructure) */
  onUpload?: (files: FileList | File[]) => Promise<string[]>;
  /** Label text */
  label?: string;
  /** Help text below label */
  helpText?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Language for labels */
  language?: "en" | "th";
  /** Replace the current image instead of appending to the list */
  selectionMode?: "append" | "replace";
  /** Disable picker interactions */
  disabled?: boolean;
}

const LIBRARY_SCOPES = [
  { value: "all" as const, labelEn: "All", labelTh: "ทั้งหมด" },
  {
    value: "my_library" as const,
    labelEn: "My Library",
    labelTh: "ไลบรารีของฉัน",
  },
  {
    value: "shared_with_me" as const,
    labelEn: "Shared with Me",
    labelTh: "แชร์ให้ฉัน",
  },
  {
    value: "shared_groups" as const,
    labelEn: "Group Shared",
    labelTh: "แชร์กลุ่ม",
  },
] as const;

type LibraryScope = (typeof LIBRARY_SCOPES)[number]["value"];

type PickerImageItem = {
  key: string;
  url: string;
  thumbnailUrl?: string | null;
  title?: string | null;
};

type RecentUploadRecord = {
  url: string;
  title?: string | null;
  createdAt: number;
};

type MediaHistoryTaskLike = {
  id?: string | number | null;
  taskId?: string | number | null;
  status?: string | null;
  mediaType?: string | null;
  resultUrl?: string | null;
  result_url?: string | null;
  resultData?: unknown;
  result_data?: unknown;
  prompt?: string | null;
  model?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

const RECENT_UPLOADS_STORAGE_KEY = "smartspec:image-source-picker:recent-uploads";
const MAX_RECENT_UPLOADS = 60;

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return Boolean(
    trimmed
      && (
        trimmed.startsWith("http://")
        || trimmed.startsWith("https://")
        || trimmed.startsWith("/uploads/")
        || trimmed.startsWith("/api/storage/")
      ),
  );
}

function readFirstMediaUrl(value: unknown, visited = new Set<unknown>()): string | null {
  if (isUsableImageUrl(value)) {
    return value.trim();
  }
  if (!value || typeof value !== "object" || visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstMediaUrl(item, visited);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "url",
    "result_url",
    "resultUrl",
    "image_url",
    "imageUrl",
    "output_url",
    "outputUrl",
    "source_url",
    "sourceUrl",
  ]) {
    const found = readFirstMediaUrl(record[key], visited);
    if (found) {
      return found;
    }
  }
  for (const nestedValue of Object.values(record)) {
    const found = readFirstMediaUrl(nestedValue, visited);
    if (found) {
      return found;
    }
  }
  return null;
}

function getDraggedImageUrl(dataTransfer: DataTransfer): string | null {
  const mediaType = (
    dataTransfer.getData("application/x-smartspec-media-type")
    || dataTransfer.getData("text/x-smartspec-media-type")
  ).trim().toLowerCase();
  const rawUrl = (
    dataTransfer.getData("text/uri-list")
    || dataTransfer.getData("text/plain")
  ).trim();
  const url = rawUrl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));

  if (!url || !isUsableImageUrl(url)) {
    return null;
  }
  if (mediaType === "image" || /\.(jpe?g|png|gif|webp|svg|avif|bmp)([?#].*)?$/i.test(url)) {
    return url;
  }
  return null;
}

function extractMediaHistoryResultUrl(task: MediaHistoryTaskLike): string | null {
  return (
    readFirstMediaUrl(task.resultUrl)
    || readFirstMediaUrl(task.result_url)
    || readFirstMediaUrl(task.resultData)
    || readFirstMediaUrl(task.result_data)
  );
}

function extractMediaHistoryThumbnailUrl(task: MediaHistoryTaskLike): string | null {
  const resultData = task.resultData ?? task.result_data;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }
  const record = resultData as Record<string, unknown>;
  return (
    readFirstMediaUrl(record.thumbnail_url)
    || readFirstMediaUrl(record.thumbnailUrl)
    || readFirstMediaUrl(record.thumbnail)
    || readFirstMediaUrl(record.poster_url)
    || readFirstMediaUrl(record.posterUrl)
    || readFirstMediaUrl(record.poster)
  );
}

export function normalizeMediaHistoryImageItems(
  tasks: unknown,
  query = "",
): PickerImageItem[] {
  if (!Array.isArray(tasks)) {
    return [];
  }
  const normalizedQuery = query.trim().toLowerCase();
  const items: PickerImageItem[] = [];
  const seenUrls = new Set<string>();

  for (const rawTask of tasks) {
    const task = rawTask as MediaHistoryTaskLike;
    if (String(task.status || "").toLowerCase() !== "completed") {
      continue;
    }
    if (String(task.mediaType || "").toLowerCase() !== "image") {
      continue;
    }

    const url = extractMediaHistoryResultUrl(task);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    const title = String(task.prompt || task.model || task.taskId || task.id || "Generated image").trim();
    const searchable = `${title} ${task.model || ""} ${task.prompt || ""} ${task.id || ""} ${task.taskId || ""}`.toLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) {
      continue;
    }

    seenUrls.add(url);
    items.push({
      key: `history-${task.id || task.taskId || url}`,
      url,
      thumbnailUrl: extractMediaHistoryThumbnailUrl(task) || url,
      title,
    });
  }

  return items;
}

function normalizeRecentUploadRecords(records: unknown): RecentUploadRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }

  const seenUrls = new Set<string>();
  return records.reduce<RecentUploadRecord[]>((acc, rawRecord) => {
    if (!rawRecord || typeof rawRecord !== "object") {
      return acc;
    }
    const record = rawRecord as Partial<RecentUploadRecord>;
    const url = String(record.url || "").trim();
    if (!isUsableImageUrl(url) || seenUrls.has(url)) {
      return acc;
    }

    seenUrls.add(url);
    acc.push({
      url,
      title: typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : url.split("/").pop() || "Uploaded image",
      createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
        ? record.createdAt
        : 0,
    });
    return acc;
  }, [])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RECENT_UPLOADS);
}

function readRecentUploadRecords(): RecentUploadRecord[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return normalizeRecentUploadRecords(
      JSON.parse(window.localStorage.getItem(RECENT_UPLOADS_STORAGE_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

function writeRecentUploadRecords(records: RecentUploadRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      RECENT_UPLOADS_STORAGE_KEY,
      JSON.stringify(normalizeRecentUploadRecords(records)),
    );
  } catch {
    // Ignore storage quota or privacy-mode errors; uploads still work for the active field.
  }
}

export function mergeRecentUploadedImages(
  existingRecords: unknown,
  urls: string[],
  now = Date.now(),
): RecentUploadRecord[] {
  const existing = normalizeRecentUploadRecords(existingRecords);
  const uploaded = urls
    .map((url) => String(url || "").trim())
    .filter(isUsableImageUrl)
    .map((url) => ({
      url,
      title: url.split("/").pop() || "Uploaded image",
      createdAt: now,
    }));

  return normalizeRecentUploadRecords([...uploaded, ...existing]);
}

export function normalizeRecentUploadedImageItems(
  records: unknown,
): PickerImageItem[] {
  return normalizeRecentUploadRecords(records).map((record) => ({
    key: `recent-upload-${record.url}`,
    url: record.url,
    thumbnailUrl: record.url,
    title: record.title || "Uploaded image",
  }));
}

export function ImageSourcePicker({
  value,
  onChange,
  maxImages = 5,
  isUploading = false,
  onUpload,
  label,
  helpText,
  required,
  language = "th",
  selectionMode = "append",
  disabled = false,
}: ImageSourcePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryScope, setLibraryScope] = useState<LibraryScope>("all");
  const [activeTab, setActiveTab] = useState<string>("library");
  const [recentUploads, setRecentUploads] = useState<PickerImageItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  // Library query
  const libraryQuery = trpc.library.listDocuments.useQuery(
    {
      scope: libraryScope,
      sort: "updated_desc",
      limit: 30,
      offset: 0,
      filters: { itemType: "image" },
    },
    { enabled: popoverOpen && librarySearch.trim().length === 0 },
  );
  const librarySearchQuery = trpc.library.search.useQuery(
    {
      query: librarySearch || undefined,
      scope: libraryScope,
      limit: 30,
      offset: 0,
      filters: { itemType: "image" },
    },
    { enabled: popoverOpen && librarySearch.trim().length > 0 },
  );
  const mediaHistoryQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: 50,
      offset: 0,
      daysAgo: 30,
    },
    { enabled: popoverOpen },
  );

  const isReplaceMode = selectionMode === "replace";
  const canAddMore = !disabled && (isReplaceMode || value.length < maxImages);
  const libraryResults = (
    librarySearch.trim().length > 0
      ? (librarySearchQuery.data?.results ?? [])
      : (libraryQuery.data?.results ?? [])
  ) as Array<{
    id?: number;
    item_id?: number;
    source_url?: string | null;
    title?: string | null;
  }>;
  const libraryLoading = libraryQuery.isLoading || librarySearchQuery.isLoading;
  const historyResults = useMemo(
    () => normalizeMediaHistoryImageItems(mediaHistoryQuery.data?.tasks ?? [], librarySearch),
    [mediaHistoryQuery.data?.tasks, librarySearch],
  );
  const historyLoading = mediaHistoryQuery.isLoading || mediaHistoryQuery.isFetching;

  const refreshRecentUploads = useCallback(() => {
    setRecentUploads(normalizeRecentUploadedImageItems(readRecentUploadRecords()));
  }, []);

  useEffect(() => {
    if (popoverOpen) {
      refreshRecentUploads();
    }
  }, [popoverOpen, refreshRecentUploads]);

  const handleUploadFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0 || !onUpload || isUploading || !canAddMore) return;

      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const remaining = isReplaceMode ? 1 : maxImages - value.length;
      if (remaining <= 0) return;

      try {
        const urls = await onUpload(imageFiles.slice(0, remaining));
        if (urls.length > 0) {
          const nextRecentUploads = mergeRecentUploadedImages(readRecentUploadRecords(), urls);
          writeRecentUploadRecords(nextRecentUploads);
          setRecentUploads(normalizeRecentUploadedImageItems(nextRecentUploads));

          if (isReplaceMode) {
            onChange(urls.slice(0, 1));
            setPopoverOpen(false);
          } else {
            const remaining = maxImages - value.length;
            const toAdd = urls.slice(0, remaining);
            onChange([...value, ...toAdd]);
          }
        }
      } catch {
        // Error handling done by parent's onUpload
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [canAddMore, isUploading, isReplaceMode, maxImages, onChange, onUpload, value],
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await handleUploadFiles(e.target.files);
    },
    [handleUploadFiles],
  );

  const hasDroppableImage = useCallback((dataTransfer: DataTransfer) => {
    const mediaType = (
      dataTransfer.getData("application/x-smartspec-media-type")
      || dataTransfer.getData("text/x-smartspec-media-type")
    ).trim().toLowerCase();
    if (mediaType && mediaType !== "image") {
      return false;
    }
    return (
      dataTransfer.files.length > 0
      || dataTransfer.types.includes("Files")
      || dataTransfer.types.includes("application/x-smartspec-media-type")
      || dataTransfer.types.includes("text/x-smartspec-media-type")
      || dataTransfer.types.includes("text/uri-list")
      || Boolean(getDraggedImageUrl(dataTransfer))
    );
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (isUploading || !canAddMore || !hasDroppableImage(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(true);
    },
    [canAddMore, hasDroppableImage, isUploading],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (isUploading || !canAddMore || !hasDroppableImage(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setIsDragActive(true);
    },
    [canAddMore, hasDroppableImage, isUploading],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLElement>) => {
      if (isUploading || !canAddMore) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        await handleUploadFiles(e.dataTransfer.files);
        return;
      }

      const droppedImageUrl = getDraggedImageUrl(e.dataTransfer);
      if (droppedImageUrl && (isReplaceMode || !value.includes(droppedImageUrl))) {
        onChange(isReplaceMode ? [droppedImageUrl] : [...value, droppedImageUrl]);
        if (isReplaceMode) {
          setPopoverOpen(false);
        }
      }
    },
    [canAddMore, handleUploadFiles, isReplaceMode, isUploading, onChange, value],
  );

  // Add from library
  const handleAddFromLibrary = useCallback(
    (url: string) => {
      if (canAddMore && (isReplaceMode || !value.includes(url))) {
        onChange(isReplaceMode ? [url] : [...value, url]);
        if (isReplaceMode) {
          setPopoverOpen(false);
        }
      }
    },
    [value, onChange, canAddMore, isReplaceMode],
  );

  // Add from URL
  const handleAddUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    const isValid =
      trimmed.startsWith("https://") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("/uploads/");
    if (!isValid) return;

    if (canAddMore && (isReplaceMode || !value.includes(trimmed))) {
      onChange(isReplaceMode ? [trimmed] : [...value, trimmed]);
      setUrlInput("");
      if (isReplaceMode) {
        setPopoverOpen(false);
      }
    }
  }, [urlInput, value, onChange, canAddMore, isReplaceMode]);

  // Remove image
  const handleRemove = useCallback(
    (index: number) => {
      if (!disabled) {
        onChange(value.filter((_, i) => i !== index));
      }
    },
    [disabled, value, onChange],
  );

  const isTh = language === "th";

  return (
    <div className="space-y-1.5">
      {label && (
        <Label className="flex items-center gap-1.5">
          {label}{" "}
          {value.length > 0 && `(${value.length}/${maxImages})`}
          {required && <span className="text-red-500">*</span>}
        </Label>
      )}

      {/* Thumbnails + Add button */}
      <div className="flex flex-wrap gap-2">
        {value.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative group">
            <img
              src={url}
              alt={`Image ${idx + 1}`}
              className="h-16 w-16 rounded-lg object-cover border"
              loading="lazy"
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              disabled={disabled}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
            <Badge
              variant="secondary"
              className="absolute bottom-0 left-0 text-[8px] px-1"
            >
              {idx + 1}
            </Badge>
          </div>
        ))}

        {canAddMore && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                aria-label={isTh ? "เพิ่มรูปภาพ" : "Add image"}
                className={cn(
                  "h-16 w-16",
                  isDragActive && "border-sky-400 bg-sky-50 text-sky-600 ring-2 ring-sky-200",
                )}
                disabled={disabled || isUploading}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[calc(100vw-2rem)] max-w-[56rem] p-0 sm:w-[34rem] md:w-[44rem] lg:w-[56rem]"
              align="start"
              side="bottom"
            >
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="w-full grid grid-cols-4 h-9">
                  <TabsTrigger value="upload" className="text-xs gap-1">
                    <Upload className="h-3 w-3" />
                    {isTh ? "อัปโหลด" : "Upload"}
                  </TabsTrigger>
                  <TabsTrigger value="library" className="text-xs gap-1">
                    <Library className="h-3 w-3" />
                    {isTh ? "ไลบรารี" : "Library"}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs gap-1">
                    <History className="h-3 w-3" />
                    {isTh ? "ประวัติ" : "History"}
                  </TabsTrigger>
                  <TabsTrigger value="url" className="text-xs gap-1">
                    <Link className="h-3 w-3" />
                    URL
                  </TabsTrigger>
                </TabsList>

                {/* Upload tab */}
                <TabsContent value="upload" className="p-3 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isTh
                      ? "เลือกรูปภาพจากเครื่องของคุณ หรือลากรูปมาวางที่นี่ (JPG, PNG, WebP)"
                      : "Select images from your device or drop them here (JPG, PNG, WebP)"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full border-dashed",
                      isDragActive && "border-sky-400 bg-sky-50 text-sky-600 ring-2 ring-sky-200",
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {isUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    {isTh ? "เลือกไฟล์" : "Choose Files"}
                  </Button>

                  {recentUploads.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-foreground">
                          {isTh ? "อัปโหลดล่าสุด" : "Recent uploads"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {isTh ? "เลือกใช้ซ้ำได้" : "Reuse previous uploads"}
                        </p>
                      </div>
                      <div className="grid max-h-[38vh] grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto pr-1 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
                        {recentUploads.map((item) => {
                          const alreadyAdded = value.includes(item.url);
                          return (
                            <button
                              key={item.key}
                              type="button"
                              disabled={alreadyAdded || !canAddMore}
                              className={cn(
                                "group relative aspect-square overflow-hidden rounded-lg border bg-muted/30 transition-all",
                                alreadyAdded
                                  ? "cursor-not-allowed border-primary opacity-60"
                                  : "cursor-pointer border-transparent hover:border-primary hover:ring-1 hover:ring-primary",
                              )}
                              onClick={() => {
                                if (!alreadyAdded) {
                                  handleAddFromLibrary(item.url);
                                }
                              }}
                            >
                              <img
                                src={item.thumbnailUrl || item.url}
                                alt={String(item.title || "Uploaded image")}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              {alreadyAdded && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                  <Check className="h-4 w-4 text-white" />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                                <p className="truncate text-[9px] leading-tight text-white">
                                  {String(
                                    item.title ||
                                      item.url.split("/").pop() ||
                                      "Image",
                                  )}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Library tab */}
                <TabsContent value="library" className="p-3 space-y-2">
                  {/* Scope filter */}
                  <div className="flex flex-wrap gap-1">
                    {LIBRARY_SCOPES.map((scope) => (
                      <Button
                        key={scope.value}
                        type="button"
                        variant={
                          libraryScope === scope.value ? "default" : "ghost"
                        }
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setLibraryScope(scope.value)}
                      >
                        {isTh ? scope.labelTh : scope.labelEn}
                      </Button>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={
                        isTh ? "ค้นหารูปภาพ..." : "Search images..."
                      }
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      className="h-7 text-xs pl-7"
                    />
                  </div>

                  {/* Image grid */}
                  <div className="grid max-h-[56vh] grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto pr-1 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
                    {libraryLoading ? (
                      <div className="col-span-full flex items-center justify-center py-4 text-xs text-muted-foreground">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        {isTh ? "กำลังโหลด..." : "Loading..."}
                      </div>
                    ) : libraryResults.length === 0 ? (
                      <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                        {isTh
                          ? "ไม่พบรูปภาพ"
                          : "No images found."}
                      </p>
                    ) : (
                      libraryResults.map((item) => {
                        const url = String(item.source_url || "").trim();
                        if (!url) return null;
                        const alreadyAdded = value.includes(url);
                        return (
                          <button
                            key={url}
                            type="button"
                            disabled={alreadyAdded || !canAddMore}
                            className={cn(
                              "group relative aspect-square overflow-hidden rounded-lg border bg-muted/30 transition-all",
                              alreadyAdded
                                ? "cursor-not-allowed border-primary opacity-60"
                                : "cursor-pointer border-transparent hover:border-primary hover:ring-1 hover:ring-primary",
                            )}
                            onClick={() => {
                              if (!alreadyAdded) {
                                handleAddFromLibrary(url);
                              }
                            }}
                          >
                            <img
                              src={url}
                              alt={String(item.title || "Library image")}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            {alreadyAdded && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Check className="h-4 w-4 text-white" />
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                              <p className="truncate text-[9px] leading-tight text-white">
                                {String(
                                  item.title ||
                                    url.split("/").pop() ||
                                    "Image",
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </TabsContent>

                {/* Media history tab */}
                <TabsContent value="history" className="p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={
                        isTh ? "ค้นหาประวัติรูปภาพ..." : "Search image history..."
                      }
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      className="h-7 text-xs pl-7"
                    />
                  </div>

                  <div className="grid max-h-[56vh] grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto pr-1 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
                    {historyLoading ? (
                      <div className="col-span-full flex items-center justify-center py-4 text-xs text-muted-foreground">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        {isTh ? "กำลังโหลด..." : "Loading..."}
                      </div>
                    ) : historyResults.length === 0 ? (
                      <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                        {isTh
                          ? "ไม่พบรูปภาพในประวัติ"
                          : "No image history found."}
                      </p>
                    ) : (
                      historyResults.map((item) => {
                        const alreadyAdded = value.includes(item.url);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            disabled={alreadyAdded || !canAddMore}
                            className={cn(
                              "group relative aspect-square overflow-hidden rounded-lg border bg-muted/30 transition-all",
                              alreadyAdded
                                ? "cursor-not-allowed border-primary opacity-60"
                                : "cursor-pointer border-transparent hover:border-primary hover:ring-1 hover:ring-primary",
                            )}
                            onClick={() => {
                              if (!alreadyAdded) {
                                handleAddFromLibrary(item.url);
                              }
                            }}
                          >
                            <img
                              src={item.thumbnailUrl || item.url}
                              alt={String(item.title || "History image")}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            {alreadyAdded && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Check className="h-4 w-4 text-white" />
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                              <p className="truncate text-[9px] leading-tight text-white">
                                {String(
                                  item.title ||
                                    item.url.split("/").pop() ||
                                    "Image",
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </TabsContent>

                {/* URL tab */}
                <TabsContent value="url" className="p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {isTh
                      ? "วาง URL ของรูปภาพ (https:// หรือ /uploads/...)"
                      : "Paste an image URL (https:// or /uploads/...)"}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddUrl();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddUrl}
                      disabled={!urlInput.trim() || !canAddMore}
                    >
                      {isTh ? "เพิ่ม" : "Add"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}

export default ImageSourcePicker;
