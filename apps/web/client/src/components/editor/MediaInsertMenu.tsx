import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Video, Music2, Upload, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import {
  validateMediaFile,
  readFileAsBase64,
  getAcceptString,
} from "./uploadMedia";

export type MediaInsertAttrs =
  | { type: "image"; src: string; alt: string; assetId?: string }
  | {
      type: "video";
      src: string;
      poster?: string;
      caption?: string;
      assetId?: string;
    }
  | { type: "audio"; src: string; assetId?: string };

interface MediaInsertMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: "image" | "video" | "audio";
  onInsert: (attrs: MediaInsertAttrs) => void;
  children?: React.ReactNode;
}

interface LibraryItem {
  id: number;
  title: string;
  source_url: string | null;
  thumbnail_url?: string | null;
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  image: "Search images...",
  video: "Search videos...",
  audio: "Search audio...",
};

const EMPTY_MESSAGES: Record<string, string> = {
  image: "No images found.",
  video: "No videos found.",
  audio: "No audio found.",
};

export default function MediaInsertMenu({
  open,
  onOpenChange,
  mediaType,
  onInsert,
  children,
}: MediaInsertMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when menu closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
      setUploadError(null);
    }
  }, [open]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchInput = useMemo(
    () => ({
      limit: 50,
      offset: 0,
      scope: "all" as const,
      filters: { itemType: mediaType },
    }),
    [mediaType],
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
      .filter((item: any) => Boolean(item.source_url))
      .map((item: any) => ({
        id: item.id as number,
        title: item.title as string,
        source_url: item.source_url as string | null,
        thumbnail_url:
          (item.thumbnail_url ?? item.source_url) as string | null,
      }));
  }, [debouncedQuery.length, listData, searchData]);

  const isLoading = listLoading || searchLoading;

  const uploadFileMutation = trpc.library.uploadFile.useMutation();

  const handleSelectItem = useCallback(
    (item: LibraryItem) => {
      if (!item.source_url) return;
      const assetId = String(item.id);

      if (mediaType === "image") {
        onInsert({
          type: "image",
          src: item.source_url,
          alt: item.title?.trim() || "image",
          assetId,
        });
      } else if (mediaType === "video") {
        onInsert({
          type: "video",
          src: item.source_url,
          poster: item.thumbnail_url || undefined,
          caption: item.title?.trim() || undefined,
          assetId,
        });
      } else {
        onInsert({
          type: "audio",
          src: item.source_url,
          assetId,
        });
      }
      onOpenChange(false);
    },
    [mediaType, onInsert, onOpenChange],
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      const validationError = validateMediaFile(file, mediaType);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      setUploading(true);
      setUploadError(null);

      try {
        const fileBase64 = await readFileAsBase64(file);
        const result = await uploadFileMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64,
          title: file.name.replace(/\.[^.]+$/, ""),
        });

        const sourceUrl = (result as any).source_url || (result as any).url;
        if (!sourceUrl) {
          setUploadError("Upload succeeded but no URL returned.");
          return;
        }

        const assetId = String((result as any).id || "");

        if (mediaType === "image") {
          onInsert({ type: "image", src: sourceUrl, alt: file.name, assetId });
        } else if (mediaType === "video") {
          onInsert({ type: "video", src: sourceUrl, assetId });
        } else {
          onInsert({ type: "audio", src: sourceUrl, assetId });
        }
        onOpenChange(false);
      } catch {
        setUploadError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [mediaType, onInsert, onOpenChange, uploadFileMutation],
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

  const MediaIcon =
    mediaType === "image"
      ? ImagePlus
      : mediaType === "video"
        ? Video
        : Music2;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}
      <PopoverContent
        className="w-[480px] p-0"
        align="start"
        data-testid="media-insert-menu"
      >
        <Tabs defaultValue="library" className="w-full">
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="library" className="flex-1" data-testid="library-tab">
              <Search className="w-4 h-4 mr-1" />
              Library
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1" data-testid="upload-tab">
              <Upload className="w-4 h-4 mr-1" />
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-0">
            <div className="p-3 border-b">
              <Input
                placeholder={SEARCH_PLACEHOLDERS[mediaType]}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8"
                data-testid="media-search-input"
              />
            </div>

            <ScrollArea className="h-[300px]">
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
                      <img
                        src={item.thumbnail_url || item.source_url || ""}
                        alt={item.title}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
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
                      {mediaType === "video" && item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          className="h-12 w-20 object-cover rounded flex-shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <MediaIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-sm truncate">{item.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="upload" className="mt-0">
            <div
              className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/25 rounded-b-lg m-3 hover:border-muted-foreground/50 transition-colors"
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
      </PopoverContent>
    </Popover>
  );
}

export { MediaInsertMenu };
export type { MediaInsertMenuProps, MediaInsertAttrs as MediaInsertAttrType };
