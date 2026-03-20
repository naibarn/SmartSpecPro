diff --git a/apps/web/client/src/components/editor/MediaInsertMenu.test.tsx b/apps/web/client/src/components/editor/MediaInsertMenu.test.tsx
new file mode 100644
index 00000000..c8b0d7c6
--- /dev/null
+++ b/apps/web/client/src/components/editor/MediaInsertMenu.test.tsx
@@ -0,0 +1,204 @@
+/**
+ * @vitest-environment jsdom
+ */
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const mockOnInsert = vi.fn();
+const mockOnOpenChange = vi.fn();
+const mockMutateAsync = vi.fn();
+
+const mockListResults = vi.fn(() => ({
+  data: { results: [] },
+  isLoading: false,
+}));
+
+const mockSearchResults = vi.fn(() => ({
+  data: { results: [] },
+  isLoading: false,
+}));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    library: {
+      listDocuments: {
+        useQuery: (...args: any[]) => mockListResults(...args),
+      },
+      search: {
+        useQuery: (...args: any[]) => mockSearchResults(...args),
+      },
+      uploadFile: {
+        useMutation: () => ({
+          mutateAsync: mockMutateAsync,
+          isPending: false,
+        }),
+      },
+    },
+  },
+}));
+
+import MediaInsertMenu from "./MediaInsertMenu";
+
+function renderMenu(
+  overrides: Partial<{
+    mediaType: "image" | "video" | "audio";
+    open: boolean;
+  }> = {},
+) {
+  return render(
+    <MediaInsertMenu
+      open={overrides.open ?? true}
+      onOpenChange={mockOnOpenChange}
+      mediaType={overrides.mediaType ?? "image"}
+      onInsert={mockOnInsert}
+    >
+      <button>Trigger</button>
+    </MediaInsertMenu>,
+  );
+}
+
+describe("MediaInsertMenu", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockListResults.mockReturnValue({
+      data: { results: [] },
+      isLoading: false,
+    });
+    mockSearchResults.mockReturnValue({
+      data: { results: [] },
+      isLoading: false,
+    });
+  });
+
+  it("renders Library and Upload tabs", () => {
+    renderMenu();
+    expect(screen.getByTestId("library-tab")).toBeDefined();
+    expect(screen.getByTestId("upload-tab")).toBeDefined();
+  });
+
+  it("clicking an image item fires onInsert with correct attrs", () => {
+    mockListResults.mockReturnValue({
+      data: {
+        results: [
+          {
+            id: 1,
+            title: "Test Image",
+            source_url: "https://example.com/img.jpg",
+            thumbnail_url: "https://example.com/thumb.jpg",
+          },
+        ],
+      },
+      isLoading: false,
+    });
+
+    renderMenu({ mediaType: "image" });
+
+    const item = screen.getByTestId("library-item");
+    fireEvent.click(item);
+
+    expect(mockOnInsert).toHaveBeenCalledWith({
+      type: "image",
+      src: "https://example.com/img.jpg",
+      alt: "Test Image",
+      assetId: "1",
+    });
+    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
+  });
+
+  it("clicking a video item fires onInsert with video attrs", () => {
+    mockListResults.mockReturnValue({
+      data: {
+        results: [
+          {
+            id: 2,
+            title: "Test Video",
+            source_url: "https://example.com/video.mp4",
+            thumbnail_url: "https://example.com/thumb.jpg",
+          },
+        ],
+      },
+      isLoading: false,
+    });
+
+    renderMenu({ mediaType: "video" });
+
+    const item = screen.getByTestId("library-item");
+    fireEvent.click(item);
+
+    expect(mockOnInsert).toHaveBeenCalledWith({
+      type: "video",
+      src: "https://example.com/video.mp4",
+      poster: "https://example.com/thumb.jpg",
+      caption: "Test Video",
+      assetId: "2",
+    });
+  });
+
+  it("clicking an audio item fires onInsert with audio attrs", () => {
+    mockListResults.mockReturnValue({
+      data: {
+        results: [
+          {
+            id: 3,
+            title: "Test Audio",
+            source_url: "https://example.com/audio.mp3",
+          },
+        ],
+      },
+      isLoading: false,
+    });
+
+    renderMenu({ mediaType: "audio" });
+
+    const item = screen.getByTestId("library-item");
+    fireEvent.click(item);
+
+    expect(mockOnInsert).toHaveBeenCalledWith({
+      type: "audio",
+      src: "https://example.com/audio.mp3",
+      assetId: "3",
+    });
+  });
+
+  it("empty search results show 'no items' message", () => {
+    renderMenu({ mediaType: "image" });
+    expect(screen.getByTestId("empty-message")).toBeDefined();
+    expect(screen.getByText("No images found.")).toBeDefined();
+  });
+
+  it("loading state shows spinner", () => {
+    mockListResults.mockReturnValue({
+      data: undefined,
+      isLoading: true,
+    });
+
+    renderMenu();
+    expect(screen.getByTestId("loading-spinner")).toBeDefined();
+  });
+
+  it("menu closes after item selection", () => {
+    mockListResults.mockReturnValue({
+      data: {
+        results: [
+          {
+            id: 1,
+            title: "Test",
+            source_url: "https://example.com/img.jpg",
+          },
+        ],
+      },
+      isLoading: false,
+    });
+
+    renderMenu();
+    fireEvent.click(screen.getByTestId("library-item"));
+    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
+  });
+
+  it("upload tab trigger is present", () => {
+    renderMenu();
+    const uploadTab = screen.getByTestId("upload-tab");
+    expect(uploadTab).toBeDefined();
+    expect(uploadTab.textContent).toContain("Upload");
+  });
+});
diff --git a/apps/web/client/src/components/editor/MediaInsertMenu.tsx b/apps/web/client/src/components/editor/MediaInsertMenu.tsx
new file mode 100644
index 00000000..6d12399d
--- /dev/null
+++ b/apps/web/client/src/components/editor/MediaInsertMenu.tsx
@@ -0,0 +1,398 @@
+import { useCallback, useEffect, useMemo, useRef, useState } from "react";
+import { ImagePlus, Video, Music2, Upload, Loader2, Search } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import {
+  Popover,
+  PopoverContent,
+  PopoverTrigger,
+} from "@/components/ui/popover";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import { ScrollArea } from "@/components/ui/scroll-area";
+import { trpc } from "@/lib/trpc";
+import {
+  validateMediaFile,
+  readFileAsBase64,
+  getAcceptString,
+} from "./uploadMedia";
+
+export type MediaInsertAttrs =
+  | { type: "image"; src: string; alt: string; assetId?: string }
+  | {
+      type: "video";
+      src: string;
+      poster?: string;
+      caption?: string;
+      assetId?: string;
+    }
+  | { type: "audio"; src: string; assetId?: string };
+
+interface MediaInsertMenuProps {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  mediaType: "image" | "video" | "audio";
+  onInsert: (attrs: MediaInsertAttrs) => void;
+  children?: React.ReactNode;
+}
+
+interface LibraryItem {
+  id: number;
+  title: string;
+  source_url: string | null;
+  thumbnail_url?: string | null;
+}
+
+const SEARCH_PLACEHOLDERS: Record<string, string> = {
+  image: "Search images...",
+  video: "Search videos...",
+  audio: "Search audio...",
+};
+
+const EMPTY_MESSAGES: Record<string, string> = {
+  image: "No images found.",
+  video: "No videos found.",
+  audio: "No audio found.",
+};
+
+export default function MediaInsertMenu({
+  open,
+  onOpenChange,
+  mediaType,
+  onInsert,
+  children,
+}: MediaInsertMenuProps) {
+  const [searchQuery, setSearchQuery] = useState("");
+  const [debouncedQuery, setDebouncedQuery] = useState("");
+  const [uploading, setUploading] = useState(false);
+  const [uploadError, setUploadError] = useState<string | null>(null);
+  const fileInputRef = useRef<HTMLInputElement>(null);
+
+  // Reset state when menu closes
+  useEffect(() => {
+    if (!open) {
+      setSearchQuery("");
+      setDebouncedQuery("");
+      setUploadError(null);
+    }
+  }, [open]);
+
+  // Debounce search query
+  useEffect(() => {
+    const timer = setTimeout(() => {
+      setDebouncedQuery(searchQuery.trim());
+    }, 300);
+    return () => clearTimeout(timer);
+  }, [searchQuery]);
+
+  const searchInput = useMemo(
+    () => ({
+      limit: 50,
+      offset: 0,
+      scope: "all" as const,
+      filters: { itemType: mediaType },
+    }),
+    [mediaType],
+  );
+
+  const { data: listData, isLoading: listLoading } =
+    trpc.library.listDocuments.useQuery(searchInput, {
+      enabled: open && debouncedQuery.length === 0,
+    });
+
+  const { data: searchData, isLoading: searchLoading } =
+    trpc.library.search.useQuery(
+      {
+        ...searchInput,
+        query: debouncedQuery || undefined,
+      },
+      {
+        enabled: open && debouncedQuery.length > 0,
+      },
+    );
+
+  const items: LibraryItem[] = useMemo(() => {
+    const results =
+      debouncedQuery.length > 0
+        ? (searchData?.results || []).map((item: any) => ({
+            ...item,
+            id: item.id ?? item.item_id,
+          }))
+        : listData?.results || [];
+    return results
+      .filter((item: any) => Boolean(item.source_url))
+      .map((item: any) => ({
+        id: item.id as number,
+        title: item.title as string,
+        source_url: item.source_url as string | null,
+        thumbnail_url:
+          (item.thumbnail_url ?? item.source_url) as string | null,
+      }));
+  }, [debouncedQuery.length, listData, searchData]);
+
+  const isLoading = listLoading || searchLoading;
+
+  const uploadFileMutation = trpc.library.uploadFile.useMutation();
+
+  const handleSelectItem = useCallback(
+    (item: LibraryItem) => {
+      if (!item.source_url) return;
+      const assetId = String(item.id);
+
+      if (mediaType === "image") {
+        onInsert({
+          type: "image",
+          src: item.source_url,
+          alt: item.title?.trim() || "image",
+          assetId,
+        });
+      } else if (mediaType === "video") {
+        onInsert({
+          type: "video",
+          src: item.source_url,
+          poster: item.thumbnail_url || undefined,
+          caption: item.title?.trim() || undefined,
+          assetId,
+        });
+      } else {
+        onInsert({
+          type: "audio",
+          src: item.source_url,
+          assetId,
+        });
+      }
+      onOpenChange(false);
+    },
+    [mediaType, onInsert, onOpenChange],
+  );
+
+  const handleFileSelect = useCallback(
+    async (file: File) => {
+      const validationError = validateMediaFile(file, mediaType);
+      if (validationError) {
+        setUploadError(validationError);
+        return;
+      }
+
+      setUploading(true);
+      setUploadError(null);
+
+      try {
+        const fileBase64 = await readFileAsBase64(file);
+        const result = await uploadFileMutation.mutateAsync({
+          fileName: file.name,
+          fileType: file.type,
+          fileBase64,
+          title: file.name.replace(/\.[^.]+$/, ""),
+        });
+
+        const sourceUrl = (result as any).source_url || (result as any).url;
+        if (!sourceUrl) {
+          setUploadError("Upload succeeded but no URL returned.");
+          return;
+        }
+
+        const assetId = String((result as any).id || "");
+
+        if (mediaType === "image") {
+          onInsert({ type: "image", src: sourceUrl, alt: file.name, assetId });
+        } else if (mediaType === "video") {
+          onInsert({ type: "video", src: sourceUrl, assetId });
+        } else {
+          onInsert({ type: "audio", src: sourceUrl, assetId });
+        }
+        onOpenChange(false);
+      } catch {
+        setUploadError("Upload failed. Please try again.");
+      } finally {
+        setUploading(false);
+      }
+    },
+    [mediaType, onInsert, onOpenChange, uploadFileMutation],
+  );
+
+  const handleInputChange = useCallback(
+    (e: React.ChangeEvent<HTMLInputElement>) => {
+      const file = e.target.files?.[0];
+      if (file) handleFileSelect(file);
+      // Reset input so same file can be re-selected
+      e.target.value = "";
+    },
+    [handleFileSelect],
+  );
+
+  const handleDrop = useCallback(
+    (e: React.DragEvent) => {
+      e.preventDefault();
+      const file = e.dataTransfer.files?.[0];
+      if (file) handleFileSelect(file);
+    },
+    [handleFileSelect],
+  );
+
+  const handleDragOver = useCallback((e: React.DragEvent) => {
+    e.preventDefault();
+  }, []);
+
+  const MediaIcon =
+    mediaType === "image"
+      ? ImagePlus
+      : mediaType === "video"
+        ? Video
+        : Music2;
+
+  return (
+    <Popover open={open} onOpenChange={onOpenChange}>
+      {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}
+      <PopoverContent
+        className="w-[480px] p-0"
+        align="start"
+        data-testid="media-insert-menu"
+      >
+        <Tabs defaultValue="library" className="w-full">
+          <TabsList className="w-full rounded-none border-b">
+            <TabsTrigger value="library" className="flex-1" data-testid="library-tab">
+              <Search className="w-4 h-4 mr-1" />
+              Library
+            </TabsTrigger>
+            <TabsTrigger value="upload" className="flex-1" data-testid="upload-tab">
+              <Upload className="w-4 h-4 mr-1" />
+              Upload
+            </TabsTrigger>
+          </TabsList>
+
+          <TabsContent value="library" className="mt-0">
+            <div className="p-3 border-b">
+              <Input
+                placeholder={SEARCH_PLACEHOLDERS[mediaType]}
+                value={searchQuery}
+                onChange={(e) => setSearchQuery(e.target.value)}
+                className="h-8"
+                data-testid="media-search-input"
+              />
+            </div>
+
+            <ScrollArea className="h-[300px]">
+              {isLoading ? (
+                <div
+                  className="flex items-center justify-center py-8"
+                  data-testid="loading-spinner"
+                >
+                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
+                </div>
+              ) : items.length === 0 ? (
+                <div
+                  className="text-center py-8 text-sm text-muted-foreground"
+                  data-testid="empty-message"
+                >
+                  {EMPTY_MESSAGES[mediaType]}
+                </div>
+              ) : mediaType === "image" ? (
+                <div className="grid grid-cols-2 gap-2 p-3">
+                  {items.map((item) => (
+                    <button
+                      key={item.id}
+                      type="button"
+                      className="relative rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
+                      onClick={() => handleSelectItem(item)}
+                      data-testid="library-item"
+                    >
+                      <img
+                        src={item.thumbnail_url || item.source_url || ""}
+                        alt={item.title}
+                        className="h-24 w-full object-cover"
+                        loading="lazy"
+                      />
+                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate">
+                        {item.title}
+                      </div>
+                    </button>
+                  ))}
+                </div>
+              ) : (
+                <div className="flex flex-col gap-1 p-2">
+                  {items.map((item) => (
+                    <button
+                      key={item.id}
+                      type="button"
+                      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent transition-colors cursor-pointer text-left"
+                      onClick={() => handleSelectItem(item)}
+                      data-testid="library-item"
+                    >
+                      {mediaType === "video" && item.thumbnail_url ? (
+                        <img
+                          src={item.thumbnail_url}
+                          alt=""
+                          className="h-12 w-20 object-cover rounded flex-shrink-0"
+                          loading="lazy"
+                        />
+                      ) : (
+                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
+                          <MediaIcon className="w-5 h-5 text-muted-foreground" />
+                        </div>
+                      )}
+                      <span className="text-sm truncate">{item.title}</span>
+                    </button>
+                  ))}
+                </div>
+              )}
+            </ScrollArea>
+          </TabsContent>
+
+          <TabsContent value="upload" className="mt-0">
+            <div
+              className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/25 rounded-b-lg m-3 hover:border-muted-foreground/50 transition-colors"
+              onDrop={handleDrop}
+              onDragOver={handleDragOver}
+              data-testid="upload-dropzone"
+            >
+              {uploading ? (
+                <div className="flex flex-col items-center gap-2">
+                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
+                  <span className="text-sm text-muted-foreground">
+                    Uploading...
+                  </span>
+                </div>
+              ) : (
+                <>
+                  <MediaIcon className="w-10 h-10 text-muted-foreground" />
+                  <Button
+                    variant="outline"
+                    size="sm"
+                    onClick={() => fileInputRef.current?.click()}
+                    data-testid="choose-file-btn"
+                  >
+                    Choose file
+                  </Button>
+                  <span className="text-xs text-muted-foreground">
+                    or drag and drop here
+                  </span>
+                </>
+              )}
+
+              {uploadError && (
+                <p
+                  className="text-sm text-red-500 mt-2"
+                  data-testid="upload-error"
+                >
+                  {uploadError}
+                </p>
+              )}
+
+              <input
+                ref={fileInputRef}
+                type="file"
+                accept={getAcceptString(mediaType)}
+                onChange={handleInputChange}
+                className="hidden"
+                data-testid="file-input"
+              />
+            </div>
+          </TabsContent>
+        </Tabs>
+      </PopoverContent>
+    </Popover>
+  );
+}
+
+export { MediaInsertMenu };
+export type { MediaInsertMenuProps, MediaInsertAttrs as MediaInsertAttrType };
diff --git a/apps/web/client/src/components/editor/uploadMedia.ts b/apps/web/client/src/components/editor/uploadMedia.ts
new file mode 100644
index 00000000..2bdf9e75
--- /dev/null
+++ b/apps/web/client/src/components/editor/uploadMedia.ts
@@ -0,0 +1,49 @@
+/**
+ * Shared media upload helper.
+ * Converts a File to base64 and returns the data needed for tRPC uploadFile mutation.
+ * This is a plain async function (not a hook) so it can be used from editor callbacks.
+ */
+
+const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
+
+const ACCEPTED_TYPES: Record<string, string[]> = {
+  image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
+  video: ["video/mp4", "video/webm", "video/quicktime"],
+  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"],
+};
+
+export interface UploadMediaResult {
+  fileName: string;
+  fileType: string;
+  fileBase64: string;
+}
+
+export function validateMediaFile(
+  file: File,
+  mediaType: "image" | "video" | "audio",
+): string | null {
+  if (file.size > MAX_FILE_SIZE) {
+    return "File is too large (max 50MB).";
+  }
+  const accepted = ACCEPTED_TYPES[mediaType];
+  if (accepted && !accepted.includes(file.type)) {
+    return "Invalid file type.";
+  }
+  return null;
+}
+
+export function readFileAsBase64(file: File): Promise<string> {
+  return new Promise((resolve, reject) => {
+    const reader = new FileReader();
+    reader.onload = () => {
+      const result = reader.result as string;
+      resolve(result);
+    };
+    reader.onerror = () => reject(new Error("Failed to read file"));
+    reader.readAsDataURL(file);
+  });
+}
+
+export function getAcceptString(mediaType: "image" | "video" | "audio"): string {
+  return (ACCEPTED_TYPES[mediaType] || []).join(",");
+}
