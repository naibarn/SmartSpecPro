import React, { useState, useRef, useCallback } from "react";
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
  onUpload?: (files: FileList) => Promise<string[]>;
  /** Label text */
  label?: string;
  /** Help text below label */
  helpText?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Language for labels */
  language?: "en" | "th";
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
}: ImageSourcePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryScope, setLibraryScope] = useState<LibraryScope>("all");
  const [activeTab, setActiveTab] = useState<string>("library");

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

  const canAddMore = value.length < maxImages;
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

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !onUpload) return;

      try {
        const urls = await onUpload(files);
        if (urls.length > 0) {
          const remaining = maxImages - value.length;
          const toAdd = urls.slice(0, remaining);
          onChange([...value, ...toAdd]);
        }
      } catch {
        // Error handling done by parent's onUpload
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onUpload, value, onChange, maxImages],
  );

  // Add from library
  const handleAddFromLibrary = useCallback(
    (url: string) => {
      if (!value.includes(url) && canAddMore) {
        onChange([...value, url]);
      }
    },
    [value, onChange, canAddMore],
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

    if (!value.includes(trimmed) && canAddMore) {
      onChange([...value, trimmed]);
      setUrlInput("");
    }
  }, [urlInput, value, onChange, canAddMore]);

  // Remove image
  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
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
                className="h-16 w-16"
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0"
              align="start"
              side="bottom"
            >
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="w-full grid grid-cols-3 h-9">
                  <TabsTrigger value="upload" className="text-xs gap-1">
                    <Upload className="h-3 w-3" />
                    {isTh ? "อัปโหลด" : "Upload"}
                  </TabsTrigger>
                  <TabsTrigger value="library" className="text-xs gap-1">
                    <Library className="h-3 w-3" />
                    {isTh ? "ไลบรารี" : "Library"}
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
                      ? "เลือกรูปภาพจากเครื่องของคุณ (JPG, PNG, WebP)"
                      : "Select images from your device (JPG, PNG, WebP)"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    {isTh ? "เลือกไฟล์" : "Choose Files"}
                  </Button>
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
                  <div className="grid max-h-[200px] grid-cols-4 gap-1.5 overflow-y-auto">
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
                              "group relative aspect-square overflow-hidden rounded-md border transition-all",
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
