import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ImagePlus,
  Video,
  Music2,
  Upload,
  Loader2,
  Search,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { DOCUMENT_MANAGEMENT_ROUTE, isMarkdownLibraryItem } from "@/lib/documentManagementUi";
import {
  validateMediaFile,
  validateAttachmentFile,
  getAcceptString,
} from "./uploadMedia";
import { uploadLibraryFileDirect } from "@/services/libraryUploadClient";
import { resolveDocumentPreviewType } from "@/lib/documentManagementUi";

export type MediaInsertAttrs =
  | { type: "image"; src: string; alt: string; assetId?: string }
  | {
      type: "video";
      src: string;
      poster?: string;
      caption?: string;
      assetId?: string;
    }
  | { type: "audio"; src: string; caption?: string; assetId?: string }
  | {
      type: "attachment";
      src: string;
      title: string;
      fileName: string;
      mimeType?: string;
      assetId?: string;
      sizeBytes?: number;
    };

interface MediaInsertMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: "image" | "video" | "audio" | "file";
  onInsert: (attrs: MediaInsertAttrs) => void;
  uploadMetadata?: Record<string, unknown>;
  libraryScope?: "all" | "my_library" | "private_vault";
  children?: React.ReactNode;
}

interface LibraryItem {
  id: number;
  title: string;
  source_url: string | null;
  thumbnail_url?: string | null;
  item_type?: string;
  metadata?: Record<string, unknown>;
  previewType?: ReturnType<typeof resolveDocumentPreviewType>;
  markdownSourceLink?: string | null;
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  image: "Search images...",
  video: "Search videos...",
  audio: "Search audio...",
  file: "Search files...",
};

const EMPTY_MESSAGES: Record<string, string> = {
  image: "No images found.",
  video: "No videos found.",
  audio: "No audio found.",
  file: "No files found.",
};

export default function MediaInsertMenu({
  open,
  onOpenChange,
  mediaType,
  onInsert,
  uploadMetadata,
  libraryScope = "all",
  children,
}: MediaInsertMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [brokenPreviews, setBrokenPreviews] = useState<Record<number, true>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when menu closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
      setUploadError(null);
      setBrokenPreviews({});
    }
  }, [open]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setBrokenPreviews({});
  }, [libraryScope, mediaType]);

  const searchInput = useMemo(
    () => ({
      limit: 50,
      offset: 0,
      scope: libraryScope,
      filters: mediaType === "file" ? undefined : { itemType: mediaType },
    }),
    [libraryScope, mediaType],
  );

  const { data: listData, isLoading: listLoading } =
    trpc.library.listDocuments.useQuery(searchInput, {
      enabled: open && debouncedQuery.length === 0,
    });

  const { data: searchData, isLoading: searchLoading } =
    trpc.library.search.useQuery(
      {
        ...searchInput,
        query: debouncedQuery || undefined,
      },
      {
        enabled: open && debouncedQuery.length > 0,
      },
    );

  const items: LibraryItem[] = useMemo(() => {
    const results =
      debouncedQuery.length > 0
        ? (searchData?.results || []).map((item: any) => ({
            ...item,
            id: item.id ?? item.item_id,
          }))
        : listData?.results || [];
    return results
      .filter((item: any) => {
        const previewType = resolveDocumentPreviewType(item);
        if (mediaType !== "file") {
          return Boolean(item.source_url ?? item.sourceUrl);
        }
        if (previewType === "image" || previewType === "video" || previewType === "audio") {
          return false;
        }
        if (Boolean(item.source_url ?? item.sourceUrl)) {
          return true;
        }
        return isMarkdownLibraryItem(item);
      })
      .map((item: any) => {
        const previewType = resolveDocumentPreviewType(item);
        const markdownEligible = previewType === "markdown" && !(item.source_url ?? item.sourceUrl);
        return {
          id: item.id as number,
          title: item.title as string,
          source_url: (item.source_url ?? item.sourceUrl) as string | null,
          thumbnail_url: (item.thumbnail_url ?? item.thumbnailUrl) as string | null,
          item_type: item.item_type as string | undefined,
          metadata: (item.metadata ?? {}) as Record<string, unknown>,
          previewType,
          markdownSourceLink: markdownEligible
            ? `${DOCUMENT_MANAGEMENT_ROUTE}?mode=editor&doc=${item.id}&scope=${libraryScope === "all" ? "my_library" : libraryScope}`
            : null,
        };
      });
  }, [debouncedQuery, libraryScope, listData, searchData, mediaType]);

  const isLoading = listLoading || searchLoading;

  const handleSelectItem = useCallback(
    (item: LibraryItem) => {
      const assetId = String(item.id);
      const resolvedSourceUrl = item.source_url || item.markdownSourceLink;
      if (!resolvedSourceUrl) return;

      if (mediaType === "image") {
        onInsert({
          type: "image",
          src: resolvedSourceUrl,
          alt: item.title?.trim() || "image",
          assetId,
        });
      } else if (mediaType === "video") {
        onInsert({
          type: "video",
          src: resolvedSourceUrl,
          poster: item.thumbnail_url || undefined,
          caption: item.title?.trim() || undefined,
          assetId,
        });
      } else if (mediaType === "audio") {
        onInsert({
          type: "audio",
          src: resolvedSourceUrl,
          caption: item.title?.trim() || undefined,
          assetId,
        });
      } else {
        onInsert({
          type: "attachment",
          src: resolvedSourceUrl,
          title: item.title?.trim() || "Attachment",
          fileName: item.title?.trim() || "Attachment",
          mimeType: item.previewType === "markdown"
            ? "text/markdown"
            : typeof item.metadata?.file_type === "string"
            ? item.metadata.file_type
            : item.item_type || "application/octet-stream",
          assetId,
          sizeBytes: typeof item.metadata?.file_size_bytes === "number"
            ? item.metadata.file_size_bytes
            : undefined,
        });
      }
      onOpenChange(false);
    },
    [mediaType, onInsert, onOpenChange],
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      const validationError =
        mediaType === "file"
          ? validateAttachmentFile(file)
          : validateMediaFile(file, mediaType);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      setUploading(true);
      setUploadError(null);

      try {
        const result = await uploadLibraryFileDirect(file, {
          title: file.name.replace(/\.[^.]+$/, ""),
          metadata: uploadMetadata,
        });

        const sourceUrl =
          (result as any).item?.sourceUrl ||
          (result as any).item?.source_url ||
          (result as any).source_url ||
          (result as any).url;
        if (!sourceUrl) {
          setUploadError("Upload succeeded but no URL returned.");
          return;
        }

        const assetId = String((result as any).item?.id || (result as any).id || "");
        const uploadedMimeType =
          (result as any).item?.metadata?.file_type ||
          file.type ||
          "application/octet-stream";

        if (mediaType === "image") {
          onInsert({ type: "image", src: sourceUrl, alt: file.name, assetId });
        } else if (mediaType === "video") {
          onInsert({
            type: "video",
            src: sourceUrl,
            assetId,
            caption: file.name.replace(/\.[^.]+$/, ""),
          });
        } else if (mediaType === "audio") {
          onInsert({ type: "audio", src: sourceUrl, caption: file.name.replace(/\.[^.]+$/, ""), assetId });
        } else {
          onInsert({
            type: "attachment",
            src: sourceUrl,
            title: file.name.replace(/\.[^.]+$/, "") || file.name,
            fileName: file.name,
            mimeType: uploadedMimeType,
            assetId,
            sizeBytes: file.size,
          });
        }
        onOpenChange(false);
      } catch {
        setUploadError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [mediaType, onInsert, onOpenChange, uploadMetadata],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const markPreviewBroken = useCallback((id: number) => {
    setBrokenPreviews((current) => {
      if (current[id]) return current;
      return { ...current, [id]: true };
    });
  }, []);

  const MediaIcon =
    mediaType === "image"
      ? ImagePlus
      : mediaType === "video"
        ? Video
        : mediaType === "audio"
          ? Music2
          : FileUp;

  const content = (
    <>
      <Tabs defaultValue="library" className="flex h-full min-h-0 w-full flex-col">
        <TabsList className="w-full shrink-0 rounded-none border-b">
          <TabsTrigger value="library" className="flex-1" data-testid="library-tab">
            <Search className="w-4 h-4 mr-1" />
            Library
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex-1" data-testid="upload-tab">
            <Upload className="w-4 h-4 mr-1" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="p-3 border-b">
            <Input
              placeholder={SEARCH_PLACEHOLDERS[mediaType]}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
              data-testid="media-search-input"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="media-results-scroll">
            {isLoading ? (
              <div
                className="flex items-center justify-center py-8"
                data-testid="loading-spinner"
              >
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div
                className="text-center py-8 text-sm text-muted-foreground"
                data-testid="empty-message"
              >
                {EMPTY_MESSAGES[mediaType]}
              </div>
            ) : mediaType === "image" ? (
              <div className="grid grid-cols-2 gap-2 p-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="relative rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
                    onClick={() => handleSelectItem(item)}
                    data-testid="library-item"
                  >
                    {brokenPreviews[item.id] ? (
                      <div
                        className="flex h-24 w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-50 to-slate-100 px-2 text-center text-slate-500"
                        data-testid={`image-preview-fallback-${item.id}`}
                      >
                        <ImagePlus className="h-6 w-6 text-slate-400" />
                        <span className="line-clamp-2 text-[10px] leading-tight">{item.title}</span>
                      </div>
                    ) : (
                      <img
                        src={item.thumbnail_url || item.source_url || ""}
                        alt={item.title}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                        onError={() => markPreviewBroken(item.id)}
                      />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate">
                      {item.title}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent transition-colors cursor-pointer text-left"
                    onClick={() => handleSelectItem(item)}
                    data-testid="library-item"
                  >
                    {mediaType === "video" && !brokenPreviews[item.id] ? (
                      item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          className="h-12 w-20 rounded flex-shrink-0 object-cover"
                          loading="lazy"
                          onError={() => markPreviewBroken(item.id)}
                        />
                      ) : item.source_url ? (
                        <video
                          src={item.source_url}
                          className="h-12 w-20 rounded flex-shrink-0 object-cover bg-black/5"
                          preload="metadata"
                          muted
                          playsInline
                          onError={() => markPreviewBroken(item.id)}
                          data-testid={`video-preview-${item.id}`}
                        />
                      ) : (
                        <div
                          className="h-12 w-20 rounded flex-shrink-0 bg-muted"
                          data-testid={`video-preview-fallback-${item.id}`}
                        />
                      )
                    ) : (
                      <div className="h-12 w-20 rounded flex-shrink-0 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                        <MediaIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{item.title}</span>
                      {mediaType === "file" && item.previewType === "markdown" && (
                        <span className="block text-[11px] text-muted-foreground">Markdown document</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-0 flex min-h-0 flex-1 overflow-hidden">
          <div
            className="m-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-b-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/50"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-testid="upload-dropzone"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Uploading...
                </span>
              </div>
            ) : (
              <>
                <MediaIcon className="w-10 h-10 text-muted-foreground" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="choose-file-btn"
                >
                  Choose file
                </Button>
                <span className="text-xs text-muted-foreground">
                  or drag and drop here
                </span>
              </>
            )}

            {uploadError && (
              <p
                className="text-sm text-red-500 mt-2"
                data-testid="upload-error"
              >
                {uploadError}
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={getAcceptString(mediaType)}
              onChange={handleInputChange}
              className="hidden"
              data-testid="file-input"
            />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );

  return (
    children ? (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          className="w-[480px] p-0"
          align="start"
          data-testid="media-insert-menu"
        >
          {content}
        </PopoverContent>
      </Popover>
    ) : (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-testid="media-insert-dialog"
          className="flex h-[min(90vh,48rem)] w-[min(56rem,calc(100vw-1rem))] max-h-[90vh] max-w-none min-h-[28rem] min-w-[22rem] resize flex-col overflow-hidden p-0"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Insert {mediaType}</DialogTitle>
            <DialogDescription>
              Browse library files or upload a new media item.
            </DialogDescription>
          </DialogHeader>
          <div data-testid="media-insert-menu" className="flex h-full min-h-0 flex-col">
            {content}
          </div>
        </DialogContent>
      </Dialog>
    )
  );
}

export { MediaInsertMenu };
export type { MediaInsertMenuProps, MediaInsertAttrs as MediaInsertAttrType };
