/**
 * VerticalDramaCharacterReferencePanel (spec feature 131, section-05 §7.1 / §7.2).
 *
 * The richer "import reference" surface for a selected character: a right-side
 * panel with Library search, Media History, and a 3x3 (or detected-grid) image
 * cutter, all supporting drag-and-drop onto a drop zone — mirroring Media
 * Studio's own reference-picking UX (`LibrarySearchPanel` + `imageGridSplitter`).
 *
 * RESOLUTION FLOW — every drop path ends at a real `media_assets.id`:
 * `verticalDramaCharacters.linkAsset` requires a raw `media_assets.id` (the
 * Drizzle `mediaAssets` table). Library items (`library_items.id`) and Media
 * History tasks (Python-backend generation records) are different tables with
 * no direct FK to `media_assets`, so this panel calls the
 * `resolveMediaAssetForImport` mutation first to register/dedupe a canonical
 * `media_assets` row, then immediately calls `linkAsset` with the resolved id
 * — no manual ID entry anywhere in this flow:
 *  - Library drop/click -> `resolveMediaAssetForImport({source:"library"})` -> `linkAsset`
 *  - Media History drop/click -> `resolveMediaAssetForImport({source:"url"})` -> `linkAsset`
 *  - Cutter tile drop -> `ai.upload` (mirrors MediaStudio.tsx's own upload
 *    pattern) -> `resolveMediaAssetForImport({source:"url"})` -> `linkAsset`
 *
 * DRAG CONTRACT: every drag source in this feature (History tiles, cutter
 * tiles) sets the same codebase-standard payload already used by
 * `LibrarySearchPanel.tsx`'s `handleItemDragStart` — `text/uri-list` +
 * `text/plain` + `application/x-smartspec-media-type` — instead of a bespoke
 * MIME type, so any drop target (this panel's own drop zone, or the
 * per-character cards in `VerticalDramaCharacterStockPanel.tsx`) can read
 * from any source via the shared `readDroppedImageUrl` helper below.
 */

import { useEffect, useRef, useState } from "react";
import {
  Crop,
  Download,
  Grid2X2,
  History as HistoryIcon,
  ImagePlus,
  Library as LibraryIcon,
  Loader2,
  Scissors,
  UploadCloud,
  UserSquare2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import LibrarySearchPanel from "@/components/media/LibrarySearchPanel";
import { getDraggedImageUrl } from "@/components/media/ImageSourcePicker";
import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import {
  COMMON_GRIDS,
  DEFAULT_SPLIT_GRID,
  createSplitPreview,
  detectGridFromDimensions,
  downloadAllSplitImages,
  splitImage,
  type DetectedGrid,
  type GridDimension,
  type SplitResult,
} from "@/lib/imageGridSplitter";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/** Maps a detected `{rows, cols}` onto the matching `COMMON_GRIDS` preset (for
 *  a consistent label), falling back to a synthesized label for odd shapes. */
function toGridDimension(rows: number, cols: number): GridDimension {
  return (
    COMMON_GRIDS.find(g => g.rows === rows && g.cols === cols) ?? {
      rows,
      cols,
      label: `${rows}x${cols}`,
    }
  );
}

/** Sets the codebase-standard drag payload (matches `LibrarySearchPanel.tsx`'s
 *  `handleItemDragStart`) so this tile is interchangeable with every other
 *  drag source/drop target in the feature. */
function setUnifiedDragPayload(event: React.DragEvent, url: string): void {
  event.dataTransfer.setData("text/uri-list", url);
  event.dataTransfer.setData("text/plain", url);
  event.dataTransfer.setData("application/x-smartspec-media-type", "image");
  event.dataTransfer.effectAllowed = "copy";
}

/**
 * Reads a dropped image URL using the codebase-standard drag contract (see
 * `ImageSourcePicker.tsx`'s exported `getDraggedImageUrl`). Exported so
 * `VerticalDramaCharacterStockPanel.tsx`'s per-character card drop targets
 * can use the exact same extraction logic as this panel's own drop zone.
 *
 * Grid-cutter tiles carry client-side `data:` URLs (`canvas.toDataURL`
 * output) that still need an upload leg (`ai.upload`) before they can
 * resolve to a media asset; `getDraggedImageUrl`'s strict http(s)/upload-path
 * check intentionally excludes those, so we fall back to reading the raw
 * payload for `data:` URLs specifically — the two-key contract (`text/uri-list`
 * + `application/x-smartspec-media-type`) is still identical for every source.
 */
export function readDroppedImageUrl(event: React.DragEvent): string | null {
  const unifiedUrl = getDraggedImageUrl(event.dataTransfer);
  if (unifiedUrl) return unifiedUrl;
  const raw = (
    event.dataTransfer.getData("text/uri-list") ||
    event.dataTransfer.getData("text/plain")
  ).trim();
  return raw.startsWith("data:") ? raw : null;
}

export interface VerticalDramaCharacterReferencePanelProps {
  seriesId: string;
  characterId: string;
  /** Called with a resolved numeric media asset id — wire directly to `linkMutation`. */
  onLinkMediaAssetId: (mediaAssetId: string) => void;
  isLinking: boolean;
  className?: string;
}

export function VerticalDramaCharacterReferencePanel({
  seriesId,
  characterId,
  onLinkMediaAssetId,
  isLinking,
  className,
}: VerticalDramaCharacterReferencePanelProps) {
  const lang = useVerticalDramaLang();
  const [activeTab, setActiveTab] = useState<
    "characterGallery" | "library" | "history" | "cutter"
  >("library");

  /* ---- "This character's images" sub-panel — the character's own existing
   * asset stock (all generated/imported/approved images), not a blank
   * Library/History search. `characterId` is a real numeric character id for
   * the character-portrait swap target; for the shot-start-frame swap target
   * the caller passes a `shot-<n>` placeholder (not parseable as a number),
   * in which case this tab naturally shows no results — the tab still
   * renders, just empty, rather than needing conditional hiding logic. */
  const manifestQuery = trpc.verticalDramaCharacters.listCharacters.useQuery({
    seriesId,
  });
  const numericCharacterId = Number(characterId);
  const characterAssets = (
    (manifestQuery.data?.manifest?.assets ?? []) as Array<{
      assetLinkId: string;
      characterId?: string | number | null;
      mediaAssetId?: string | null;
      role?: string | null;
      state: string;
      thumbnailUrl?: string | null;
    }>
  ).filter(
    a =>
      Number.isFinite(numericCharacterId) &&
      String(a.characterId) === String(numericCharacterId) &&
      Boolean(a.mediaAssetId)
  );

  // Default to the character's own gallery the moment it has at least one
  // asset — "แสดงภาพที่มีของตัวละครนั้น ๆ" (show existing images for that
  // character) as the FIRST thing seen, not something to click into. Re-runs
  // whenever the swap target changes (new `characterId`) or the manifest
  // finishes loading, but never overrides a manual tab switch afterward.
  const defaultedForCharacterRef = useRef<string | null>(null);
  useEffect(() => {
    if (defaultedForCharacterRef.current === characterId) return;
    if (manifestQuery.isLoading) return;
    defaultedForCharacterRef.current = characterId;
    setActiveTab(characterAssets.length > 0 ? "characterGallery" : "library");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, manifestQuery.isLoading]);

  const uploadMutation = trpc.ai.upload.useMutation();
  const resolveMutation =
    trpc.verticalDramaCharacters.resolveMediaAssetForImport.useMutation();
  const [isResolving, setIsResolving] = useState(false);
  const busy =
    isLinking ||
    isResolving ||
    uploadMutation.isPending ||
    resolveMutation.isPending;

  const resolveAndLink = async (
    input:
      | { source: "library"; libraryItemId: number }
      | { source: "url"; url: string; mimeType: string; fileName?: string }
  ) => {
    setIsResolving(true);
    try {
      const result = await resolveMutation.mutateAsync({ seriesId, ...input });
      onLinkMediaAssetId(result.mediaAssetId);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t(lang, "นำเข้าอ้างอิงไม่สำเร็จ", "Failed to import reference")
      );
    } finally {
      setIsResolving(false);
    }
  };

  const resolveAndLinkFromDataUrl = async (
    dataUrl: string,
    fileName: string
  ) => {
    setIsResolving(true);
    try {
      const uploadResult = await uploadMutation.mutateAsync({
        fileName,
        fileType: "image/jpeg",
        fileBase64: dataUrl,
      });
      const result = await resolveMutation.mutateAsync({
        seriesId,
        source: "url",
        url: uploadResult.url,
        mimeType: uploadResult.fileType,
        fileName,
      });
      onLinkMediaAssetId(result.mediaAssetId);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t(lang, "นำเข้าอ้างอิงไม่สำเร็จ", "Failed to import reference")
      );
    } finally {
      setIsResolving(false);
    }
  };

  /* ---- Library sub-panel ---- */
  const [libraryQuery, setLibraryQuery] = useState("");
  /** Purely a visual "highlighted" marker (mirrors Media Studio's own
   *  `onSelect` semantics) — selecting a Library item no longer implicitly
   *  reroutes into the grid cutter; that only ever happens via the explicit
   *  "grid cut" button. */
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState<
    number | null
  >(null);
  const librarySearchQuery = trpc.library.search.useQuery(
    {
      query: libraryQuery || undefined,
      limit: 24,
      filters: { itemType: "image" },
    },
    { enabled: activeTab === "library" }
  );
  const libraryResults = (librarySearchQuery.data?.results ??
    []) as LibrarySearchResultItem[];

  /* ---- Media History sub-panel ---- */
  const historyQuery = trpc.media.listTasks.useQuery(
    { mediaType: "image", status: "completed", limit: 24, daysAgo: 12 },
    { enabled: activeTab === "history" }
  );
  const historyTasks = historyQuery.data?.tasks ?? [];

  /* ---- 3x3 / grid cutter sub-panel ----
   * Rekeyed from a single array to a `Record<sourceUrl, SplitResult[]>` so
   * grid-cutting a second candidate image doesn't wipe out the first
   * candidate's already-visible split tiles — every cut stays visible until
   * the user explicitly uses or dismisses it. */
  const [cutterResultsByUrl, setCutterResultsByUrl] = useState<
    Record<string, SplitResult[]>
  >({});
  const [cuttingUrl, setCuttingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---- Grid-size choice, asked before every cut (mirrors Media Studio /
   * Storyboard Review's own split tool exactly: COMMON_GRIDS preset buttons +
   * rows/cols inputs + a live numbered-overlay preview via
   * `createSplitPreview`, not a silent auto-guess and not a plain thumbnail).
   * `pendingCutSource` gates rendering the picker; `pendingCutGrid` is
   * prefilled from `detectGridFromDimensions` (falling back to 3x3) but the
   * user can override it — every change regenerates `splitPreviewUrl`. */
  const [pendingCutSource, setPendingCutSource] = useState<string | null>(null);
  const [pendingCutGrid, setPendingCutGrid] =
    useState<GridDimension>(DEFAULT_SPLIT_GRID);
  const [detectedGrid, setDetectedGrid] = useState<DetectedGrid | null>(null);
  const [splitPreviewUrl, setSplitPreviewUrl] = useState<string | null>(null);
  const [isDetectingGrid, setIsDetectingGrid] = useState(false);

  const updatePendingCutGrid = async (
    rows: number,
    cols: number,
    sourceUrl = pendingCutSource
  ) => {
    if (!sourceUrl) return;
    setPendingCutGrid(toGridDimension(rows, cols));
    try {
      setSplitPreviewUrl(await createSplitPreview(sourceUrl, rows, cols));
    } catch {
      setSplitPreviewUrl(null);
    }
  };

  const startGridCut = async (imageUrl: string) => {
    if (!imageUrl) return;
    setPendingCutSource(imageUrl);
    setPendingCutGrid(DEFAULT_SPLIT_GRID);
    setDetectedGrid(null);
    setSplitPreviewUrl(null);
    setActiveTab("cutter");
    setIsDetectingGrid(true);
    try {
      const img = new Image();
      const dims = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("load-failed"));
          img.src = imageUrl;
        }
      ).catch(() => null);
      const detected = dims
        ? detectGridFromDimensions(dims.width, dims.height)
        : null;
      setDetectedGrid(detected);
      const rows = detected?.rows ?? DEFAULT_SPLIT_GRID.rows;
      const cols = detected?.cols ?? DEFAULT_SPLIT_GRID.cols;
      await updatePendingCutGrid(rows, cols, imageUrl);
    } finally {
      setIsDetectingGrid(false);
    }
  };

  const runSplit = async (imageUrl: string, rows: number, cols: number) => {
    if (!imageUrl) return;
    setCuttingUrl(imageUrl);
    try {
      const results = await splitImage(imageUrl, rows, cols);
      setCutterResultsByUrl(prev => ({ ...prev, [imageUrl]: results }));
      setPendingCutSource(null);
      setSplitPreviewUrl(null);
      toast.success(
        t(
          lang,
          `ตัดภาพเป็น ${results.length} ช่องแล้ว`,
          `Cut into ${results.length} tiles`
        )
      );
    } catch (err) {
      toast.error(
        t(
          lang,
          "ตัดภาพไม่สำเร็จ — ตรวจสอบ URL ของภาพ",
          "Failed to cut image — check the image URL"
        )
      );
    } finally {
      setCuttingUrl(null);
    }
  };

  const handleFileSelected = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      void startGridCut(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  /* ---- Drop zone (accepts drags from Library items, History tiles, cutter tiles) ---- */
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const url = readDroppedImageUrl(event);
    if (!url) {
      toast.error(
        t(
          lang,
          "ไม่พบภาพที่ลากมา — ลองใหม่อีกครั้ง",
          "No draggable image found — please try again"
        )
      );
      return;
    }
    if (url.startsWith("data:")) {
      void resolveAndLinkFromDataUrl(
        url,
        `character-reference-${Date.now()}.jpg`
      );
    } else {
      void resolveAndLink({ source: "url", url, mimeType: "image/jpeg" });
    }
  };

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {t(
            lang,
            "เลือกอ้างอิงจาก Library / ประวัติ / ตัดภาพกริด",
            "Pick reference: Library / History / Grid cutter"
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          onDragOver={e => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground transition-colors",
            isDragOver ? "border-purple-400 bg-purple-50/60" : "border-border"
          )}
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud aria-hidden="true" className="h-4 w-4" />
          )}
          {t(
            lang,
            "ลากรูปจาก Library, ประวัติ หรือช่องตัดภาพมาวางที่นี่เพื่อใช้เป็นอ้างอิง",
            "Drag an image from Library, History, or the grid cutter here to use as a reference"
          )}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={v => setActiveTab(v as typeof activeTab)}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="characterGallery" className="gap-1.5 text-xs">
              <UserSquare2 aria-hidden="true" className="h-3.5 w-3.5" />
              {t(lang, "ภาพตัวละครนี้", "This character")}
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-1.5 text-xs">
              <LibraryIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t(lang, "คลัง", "Library")}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <HistoryIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t(lang, "ประวัติ", "History")}
            </TabsTrigger>
            <TabsTrigger value="cutter" className="gap-1.5 text-xs">
              <Scissors aria-hidden="true" className="h-3.5 w-3.5" />
              {t(lang, "ตัดภาพกริด", "Grid cutter")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="characterGallery" className="mt-2">
            {manifestQuery.isLoading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {t(lang, "กำลังโหลด…", "Loading…")}
              </p>
            ) : characterAssets.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {t(
                  lang,
                  "ตัวละครนี้ยังไม่มีภาพที่สร้างไว้ — ลองแท็บคลังหรือประวัติ",
                  "This character has no existing images yet — try Library or History."
                )}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {characterAssets.map(asset => (
                  <button
                    key={asset.assetLinkId}
                    type="button"
                    disabled={busy}
                    onClick={() => asset.mediaAssetId && onLinkMediaAssetId(asset.mediaAssetId)}
                    className="group relative aspect-[9/16] overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary disabled:opacity-60"
                    data-testid={`vd-character-gallery-asset-${asset.assetLinkId}`}
                  >
                    {asset.thumbnailUrl ? (
                      <img
                        src={asset.thumbnailUrl}
                        alt={asset.role ?? "reference"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        {t(lang, "ไม่มีรูปย่อ", "No preview")}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">
                      {asset.role ?? asset.state}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="library" className="mt-2">
            <LibrarySearchPanel
              query={libraryQuery}
              onQueryChange={setLibraryQuery}
              isLoading={librarySearchQuery.isLoading}
              results={libraryResults}
              totalResults={
                librarySearchQuery.data?.total ?? libraryResults.length
              }
              errorMessage={librarySearchQuery.error?.message}
              selectedItemId={selectedLibraryItemId}
              addToReferenceLabel={t(
                lang,
                "ใช้เป็นอ้างอิง",
                "Use as reference"
              )}
              onAddToReference={item => {
                void resolveAndLink({
                  source: "library",
                  libraryItemId: item.item_id,
                });
              }}
              gridCutLabel={t(
                lang,
                "ตัดภาพนี้เป็นกริด",
                "Cut this image into a grid"
              )}
              onGridCutItem={item => {
                const sourceUrl = item.source_url || item.thumbnail_url;
                if (sourceUrl) void startGridCut(sourceUrl);
              }}
              onSelect={item => {
                // Selecting merely highlights the item (matches Media
                // Studio's own `onSelect` semantics) — it must NOT silently
                // reroute into the grid cutter. Cutting only ever happens
                // via the explicit "grid cut" button above.
                setSelectedLibraryItemId(item.item_id);
              }}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-2">
            <div className="space-y-2 rounded-lg border bg-white/70 p-2.5 backdrop-blur">
              {historyQuery.isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t(lang, "กำลังโหลดประวัติ…", "Loading history…")}
                </div>
              )}
              {!historyQuery.isLoading && historyTasks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t(lang, "ไม่พบรายการในประวัติ", "No history items found")}
                </p>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                {historyTasks
                  .filter(task => Boolean(task.resultUrl))
                  .map(task => {
                    const cuttingThis = cuttingUrl === task.resultUrl;
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={event =>
                          setUnifiedDragPayload(event, task.resultUrl ?? "")
                        }
                        className="group relative cursor-grab overflow-hidden rounded-md border border-border active:cursor-grabbing"
                        title={task.prompt}
                      >
                        <button
                          type="button"
                          className="block aspect-square w-full"
                          disabled={busy}
                          onClick={() => {
                            if (task.resultUrl) {
                              void resolveAndLink({
                                source: "url",
                                url: task.resultUrl,
                                mimeType: "image/jpeg",
                              });
                            }
                          }}
                        >
                          <img
                            src={task.resultUrl}
                            alt={
                              task.prompt ||
                              t(lang, "ภาพจากประวัติ", "History image")
                            }
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute right-1 top-1 h-6 w-6 opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          disabled={busy || cuttingThis}
                          title={t(
                            lang,
                            "ตัดภาพนี้เป็นกริด",
                            "Cut this image into a grid"
                          )}
                          aria-label={t(
                            lang,
                            "ตัดภาพนี้เป็นกริด",
                            "Cut this image into a grid"
                          )}
                          onClick={event => {
                            event.stopPropagation();
                            if (task.resultUrl)
                              void startGridCut(task.resultUrl);
                          }}
                        >
                          {cuttingThis ? (
                            <Loader2
                              aria-hidden="true"
                              className="h-3.5 w-3.5 animate-spin"
                            />
                          ) : (
                            <Grid2X2
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                          )}
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cutter" className="mt-2">
            <div className="space-y-3 rounded-lg border bg-white/70 p-2.5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Crop aria-hidden="true" className="h-3.5 w-3.5" />
                  {t(
                    lang,
                    "หรืออัปโหลดภาพเพื่อตัดกริด",
                    "Or upload an image to cut"
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleFileSelected(e.target.files?.[0])}
                />
              </div>

              {/* Grid-size choice — asked every time before cutting, mirroring
                  Storyboard Review's own split tool exactly: a live numbered-
                  overlay preview (`createSplitPreview`) redrawn on every
                  preset/rows/cols change, a "detected grid" chip, and
                  explicit preset + custom rows/cols controls — instead of a
                  small static thumbnail and a silent auto-guess. */}
              {pendingCutSource && (
                <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/60 p-2.5">
                  <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {isDetectingGrid ? (
                      <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
                    ) : splitPreviewUrl ? (
                      <img
                        src={splitPreviewUrl}
                        alt=""
                        className="max-h-72 max-w-full object-contain"
                      />
                    ) : (
                      <img
                        src={pendingCutSource}
                        alt=""
                        className="max-h-72 max-w-full object-contain"
                      />
                    )}
                  </div>
                  {detectedGrid ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                      {t(
                        lang,
                        `ตรวจพบ grid ${detectedGrid.rows}x${detectedGrid.cols}`,
                        `Detected ${detectedGrid.rows}x${detectedGrid.cols} grid`
                      )}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 gap-1.5">
                    {COMMON_GRIDS.map(grid => (
                      <Button
                        key={`${grid.rows}x${grid.cols}`}
                        type="button"
                        size="sm"
                        variant={
                          pendingCutGrid.rows === grid.rows &&
                          pendingCutGrid.cols === grid.cols
                            ? "default"
                            : "outline"
                        }
                        className="h-8 px-1 text-[10px]"
                        onClick={() =>
                          void updatePendingCutGrid(grid.rows, grid.cols)
                        }
                      >
                        {grid.label}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <label className="grid gap-1 text-xs">
                      <span className="text-muted-foreground">
                        {t(lang, "แถว", "Rows")}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={pendingCutGrid.rows}
                        onChange={event =>
                          void updatePendingCutGrid(
                            Math.min(
                              10,
                              Math.max(1, Number(event.target.value) || 1)
                            ),
                            pendingCutGrid.cols
                          )
                        }
                        className="h-8"
                      />
                    </label>
                    <span className="pb-2 text-xs text-muted-foreground">
                      x
                    </span>
                    <label className="grid gap-1 text-xs">
                      <span className="text-muted-foreground">
                        {t(lang, "คอลัมน์", "Cols")}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={pendingCutGrid.cols}
                        onChange={event =>
                          void updatePendingCutGrid(
                            pendingCutGrid.rows,
                            Math.min(
                              10,
                              Math.max(1, Number(event.target.value) || 1)
                            )
                          )
                        }
                        className="h-8"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPendingCutSource(null);
                        setSplitPreviewUrl(null);
                      }}
                    >
                      {t(lang, "ยกเลิก", "Cancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2"
                      disabled={cuttingUrl === pendingCutSource}
                      onClick={() =>
                        void runSplit(
                          pendingCutSource,
                          pendingCutGrid.rows,
                          pendingCutGrid.cols
                        )
                      }
                    >
                      {cuttingUrl === pendingCutSource ? (
                        <Loader2
                          aria-hidden="true"
                          className="h-3.5 w-3.5 animate-spin"
                        />
                      ) : (
                        <Scissors aria-hidden="true" className="h-3.5 w-3.5" />
                      )}
                      {t(
                        lang,
                        `ตัด ${pendingCutGrid.rows * pendingCutGrid.cols} รูป`,
                        `Cut ${pendingCutGrid.rows * pendingCutGrid.cols} images`
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {!pendingCutSource &&
              Object.keys(cutterResultsByUrl).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    lang,
                    "กดปุ่มตัดกริดบนภาพใน Library หรือประวัติ หรืออัปโหลดภาพกริด เพื่อเลือกขนาดและแยกเป็นภาพย่อยแต่ละช่อง",
                    "Click the grid-cut button on a Library or History image, or upload a grid image, to choose a size and split it into individual tiles"
                  )}
                </p>
              ) : (
                Object.entries(cutterResultsByUrl).map(([sourceUrl, tiles]) => (
                  <div
                    key={sourceUrl}
                    className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={sourceUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded border border-border object-cover"
                      />
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                        {t(
                          lang,
                          `ผลลัพธ์ ${tiles.length} รูป`,
                          `${tiles.length} results`
                        )}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 gap-1 px-2 text-xs"
                        onClick={() =>
                          void downloadAllSplitImages(
                            tiles,
                            "character-reference"
                          )
                        }
                      >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" />
                        {t(lang, "ทั้งหมด", "All")}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {tiles.map(tile => (
                        <div
                          key={tile.index}
                          draggable
                          onDragStart={event =>
                            setUnifiedDragPayload(event, tile.dataUrl)
                          }
                          className="relative cursor-grab overflow-hidden rounded-md border border-border active:cursor-grabbing"
                        >
                          <button
                            type="button"
                            className="block aspect-square w-full"
                            disabled={busy}
                            onClick={() =>
                              void resolveAndLinkFromDataUrl(
                                tile.dataUrl,
                                `character-reference-tile-${tile.index + 1}.jpg`
                              )
                            }
                          >
                            <img
                              src={tile.dataUrl}
                              alt={`${t(lang, "ช่อง", "Tile")} ${tile.index + 1}`}
                              className="aspect-square w-full object-cover"
                              draggable={false}
                            />
                          </button>
                          <Badge className="absolute left-1 top-1 px-1 py-0 text-[9px]">
                            {tile.index + 1}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  lang,
                  "ลากช่องที่ตัดแล้วไปยังกล่องรับวางด้านบน (หรือการ์ดตัวละครโดยตรง) หรือคลิกที่ช่องเพื่อใช้เป็นอ้างอิงทันที",
                  "Drag a cut tile to the drop zone above (or directly onto a character card), or click a tile to use it as a reference immediately."
                )}
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ImagePlus
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          {t(
            lang,
            "ลากหรือคลิกภาพเพื่อเชื่อมเป็นอ้างอิงของตัวละครนี้ทันที — ไม่ต้องกรอกรหัสด้วยตนเอง",
            "Drag or click an image to link it as this character's reference immediately — no manual ID entry needed."
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default VerticalDramaCharacterReferencePanel;
