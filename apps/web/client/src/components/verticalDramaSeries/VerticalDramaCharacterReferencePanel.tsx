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
 *
 * "BROWSE ONLY" MODE (2026-07-05 fix): `characterId`/`onLinkMediaAssetId` are
 * now optional. `VerticalDramaEpisodePage.tsx` mounts this panel WITHOUT a
 * specific swap target so History/Library/Grid-cutter stay always available
 * on the storyboard view (not gated behind opening the swap picker first) —
 * dragging a tile out (already unconditional for every tile in this panel)
 * remains the way to use an image without an explicit target; click-to-link
 * shortcuts and the character-gallery tab are hidden/disabled in this mode
 * since they need a resolved target to link onto.
 */

import { useEffect, useRef, useState } from "react";
import {
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

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import LibrarySearchPanel from "@/components/media/LibrarySearchPanel";
import {
  getDraggedImageUrl,
  readDroppedImageInput,
  readFileAsDataUrl,
} from "@/components/media/ImageSourcePicker";
import type { LibrarySearchResultItem } from "@/lib/libraryUi";
import type { SplitResult } from "@/lib/imageGridSplitter";
import {
  ShotGridCutter,
  setUnifiedDragPayload,
} from "@/components/verticalDramaSeries/ShotGridCutter";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/** History/Library scope toggle (2026-07-05, project-scoped media panel
 *  filter) — "this project" (default, when a seriesId is available) shows
 *  only images tagged with / linked to this series; "all" shows every
 *  history item, same as before this feature. */
type HistoryScope = "series" | "all";
const HISTORY_SCOPE_STORAGE_KEY = "vd-reference-panel-history-scope";

/** Best-effort localStorage access. Reads/writes here are only a CONVENIENCE
 *  cache (remembered history-scope preference) — never the source of truth.
 *  They MUST NOT throw: `localStorage.setItem` raises `QuotaExceededError`
 *  when the origin's storage is full (common for heavy users) and
 *  `getItem`/`setItem` raise `SecurityError` in sandboxed/blocked-storage
 *  contexts. An unguarded throw here used to abort the whole handler/effect
 *  BEFORE the real (state) action fired. Swallow the error and let the real
 *  action proceed. */
function safeStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded / storage blocked — cache is best-effort, ignore */
  }
}

function readStoredHistoryScope(): HistoryScope | null {
  const raw = safeStorageGet(HISTORY_SCOPE_STORAGE_KEY);
  return raw === "series" || raw === "all" ? raw : null;
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
  /** Omit for a "browse only" mount (no specific swap target selected yet) —
   *  the History/Library/Cutter tabs still work fully (including dragging
   *  tiles out to a shot or the reference strip); only the character-gallery
   *  tab and click-to-link shortcut require a target. */
  characterId?: string;
  /** Called with a resolved numeric media asset id — wire directly to
   *  `linkMutation`. Omit for a "browse only" mount: click-to-link affordances
   *  are hidden (drag-and-drop out of this panel remains the way to use an
   *  image without an explicit target). */
  onLinkMediaAssetId?: (mediaAssetId: string) => void;
  isLinking?: boolean;
  /** Initial tab when no `characterId` is given (browse-only mode) —
   *  defaults to "library" like the targeted mode, but callers doing pure
   *  browsing/dragging (e.g. the episode page's always-on right panel) can
   *  pass "history" instead since previously-generated images are usually
   *  the more useful starting point there. Ignored once `characterId` is
   *  set — that path already has its own auto-default logic (character
   *  gallery first if it has assets). */
  defaultTab?: "library" | "history" | "cutter";
  className?: string;
}

export function VerticalDramaCharacterReferencePanel({
  seriesId,
  characterId,
  onLinkMediaAssetId,
  isLinking = false,
  defaultTab = "library",
  className,
}: VerticalDramaCharacterReferencePanelProps) {
  const lang = useVerticalDramaLang();
  const [activeTab, setActiveTab] = useState<
    "characterGallery" | "library" | "history" | "cutter"
  >(characterId ? "library" : defaultTab);

  /* ---- "This character's images" sub-panel — the character's own existing
   * asset stock (all generated/imported/approved images), not a blank
   * Library/History search. `characterId` is a real numeric character id for
   * the character-portrait swap target; for the shot-start-frame swap target
   * the caller passes a `shot-<n>` placeholder (not parseable as a number),
   * in which case this tab naturally shows no results — the tab still
   * renders, just empty, rather than needing conditional hiding logic. Absent
   * entirely in "browse only" mode (no `characterId` at all) — the tab is
   * hidden rather than shown empty. */
  const manifestQuery = trpc.verticalDramaCharacters.listCharacters.useQuery(
    { seriesId },
    { enabled: Boolean(characterId) }
  );
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
  // Skipped entirely in "browse only" mode (no `characterId`).
  const defaultedForCharacterRef = useRef<string | null>(null);
  useEffect(() => {
    if (!characterId) return;
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
    if (!onLinkMediaAssetId) return; // "browse only" mode — dragging out is the supported action
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
    if (!onLinkMediaAssetId) return; // "browse only" mode — dragging out is the supported action
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

  /* ---- Media History sub-panel ----
   * "โปรเจกต์นี้ / ทั้งหมด" scope toggle (2026-07-05) — defaults to
   * "series" (this project) whenever a seriesId is available (always true
   * here — the prop is required), remembers the caller's last choice in
   * localStorage. "series" merges two sources, deduped by URL:
   *  1. `media.listTasks({seriesId})` — NEW generations tagged with
   *     `__vd_series_id` at submit time.
   *  2. `verticalDramaSeries.listSeriesLinkedImageUrls` — a fallback for
   *     images generated BEFORE this feature shipped (no tag), sourced from
   *     the durable character-asset / shot-reference / start-frame-plan
   *     link tables instead.
   * "all" bypasses both and shows every completed image task, unfiltered —
   * the exact behavior this panel had before this feature.
   */
  const [historyScope, setHistoryScope] = useState<HistoryScope>(
    () => readStoredHistoryScope() ?? "series"
  );
  useEffect(() => {
    safeStorageSet(HISTORY_SCOPE_STORAGE_KEY, historyScope);
  }, [historyScope]);

  const historyQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: 24,
      daysAgo: 12,
      ...(historyScope === "series" ? { seriesId } : {}),
    },
    { enabled: activeTab === "history" }
  );
  const linkedSeriesAssetsQuery =
    trpc.verticalDramaSeries.listSeriesLinkedImageUrls.useQuery(
      { seriesId },
      { enabled: activeTab === "history" && historyScope === "series" }
    );

  const historyTasks = historyQuery.data?.tasks ?? [];
  /** Linked-asset URLs not already covered by a tagged history task — merged
   *  in as lightweight synthetic "tasks" (drag/click both only ever need
   *  `resultUrl`) so the grid below can render one unified list. */
  const linkedOnlyHistoryTasks =
    historyScope === "series"
      ? (linkedSeriesAssetsQuery.data?.imageUrls ?? [])
          .filter((url) => !historyTasks.some((task) => task.resultUrl === url))
          .map((url, index) => ({
            id: `vd-linked-asset-${index}-${url}`,
            resultUrl: url,
            prompt: t(lang, "ภาพที่เชื่อมกับซีรีส์นี้", "Image linked to this series"),
          }))
      : [];
  const mergedHistoryTasks = [...historyTasks, ...linkedOnlyHistoryTasks];
  const isHistoryLoading =
    historyQuery.isLoading ||
    (historyScope === "series" && linkedSeriesAssetsQuery.isLoading);

  /* ---- 3x3 / grid cutter sub-panel ----
   * Delegates all upload/grid-size/preview/detected-grid/split logic to the
   * shared `ShotGridCutter` component (extracted, Phase 2.3) — this panel
   * only tracks which source URL to cut (so the Library/History "grid cut"
   * buttons below can prime it) and whether a cut is currently in flight
   * (for disabling other controls while resolving/linking). Single-select
   * only here (`allowMultiSelect={false}`) — this panel's own semantics are
   * unchanged: click a tile to link it immediately as this character's
   * reference (never a multi-select batch, unlike the storyboard shot
   * card's multi-angle picker). */
  const [gridCutSourceUrl, setGridCutSourceUrl] = useState<string | null>(
    null
  );
  const [gridCutNonce, setGridCutNonce] = useState(0);
  /** Tracks a cut currently in flight (which source URL is being primed) so
   *  the History tab's per-item grid-cut button can show its own spinner —
   *  same visual affordance the original inline tab had, now derived from
   *  whether that URL is the one about to be handed to `ShotGridCutter`. */
  const [cuttingUrl, setCuttingUrl] = useState<string | null>(null);

  const startGridCut = (imageUrl: string) => {
    if (!imageUrl) return;
    setCuttingUrl(imageUrl);
    setGridCutSourceUrl(imageUrl);
    setGridCutNonce(n => n + 1);
    setActiveTab("cutter");
    // The cutter primes itself synchronously (grid detection runs inside
    // `ShotGridCutter`); clear the transient spinner on the next tick so the
    // History thumbnail's icon reverts once the cutter tab is showing.
    setTimeout(() => setCuttingUrl(null), 0);
  };

  const handleTilesSelected = (tiles: SplitResult[]) => {
    const tile = tiles[0];
    if (!tile) return;
    void resolveAndLinkFromDataUrl(
      tile.dataUrl,
      `character-reference-tile-${tile.index + 1}.jpg`
    );
  };

  /* ---- Drop zone (accepts drags from Library items, History tiles, cutter
   * tiles, AND real OS files dropped straight from the user's computer) ---- */
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const { input, error } = readDroppedImageInput(event);
    if (error) {
      if (error.kind === "unsupported-file-type") {
        toast.error(t(lang, "รองรับเฉพาะไฟล์ภาพ", "Only image files are supported"));
      } else {
        toast.error(
          t(
            lang,
            `ไฟล์ภาพใหญ่เกินไป (สูงสุด ${Math.round(error.maxBytes / (1024 * 1024))}MB)`,
            `Image is too large (max ${Math.round(error.maxBytes / (1024 * 1024))}MB)`
          )
        );
      }
      return;
    }
    if (!input) {
      toast.error(
        t(
          lang,
          "ไม่พบภาพที่ลากมา — ลองใหม่อีกครั้ง",
          "No draggable image found — please try again"
        )
      );
      return;
    }
    if (input.kind === "file") {
      void readFileAsDataUrl(input.file).then(dataUrl =>
        resolveAndLinkFromDataUrl(dataUrl, input.file.name || `character-reference-${Date.now()}.jpg`)
      );
      return;
    }
    const url = input.url;
    if (url.startsWith("data:")) {
      void resolveAndLinkFromDataUrl(
        url,
        `character-reference-${Date.now()}.jpg`
      );
    } else {
      void resolveAndLink({ source: "url", url, mimeType: "image/jpeg" });
    }
  };

  /* ---- Explicit upload button (2026-07-06 file-drop upgrade) — a visible
   * "อัปโหลดภาพ" affordance alongside the drag/drop zone, for users who don't
   * drag-and-drop. Uses the exact same `resolveAndLinkFromDataUrl` path as a
   * dropped file, so it uploads + resolves + links (or just browse-only
   * uploads, when there's no `onLinkMediaAssetId` target) identically. */
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const handleUploadInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t(lang, "รองรับเฉพาะไฟล์ภาพ", "Only image files are supported"));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error(
        t(lang, "ไฟล์ภาพใหญ่เกินไป (สูงสุด 15MB)", "Image is too large (max 15MB)")
      );
      return;
    }
    void readFileAsDataUrl(file).then(dataUrl =>
      resolveAndLinkFromDataUrl(dataUrl, file.name || `character-reference-${Date.now()}.jpg`)
    );
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
        {onLinkMediaAssetId ? (
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground transition-colors",
              isDragOver ? "border-purple-400 bg-purple-50/60" : "border-border"
            )}
          >
            <div className="flex items-center gap-2">
              {busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud aria-hidden="true" className="h-4 w-4" />
              )}
              {t(
                lang,
                "ลากรูปจาก Library, ประวัติ หรือช่องตัดภาพมาวางที่นี่เพื่อใช้เป็นอ้างอิง หรือไฟล์จากเครื่องของคุณ",
                "Drag an image from Library, History, the grid cutter, or a file from your computer here to use as a reference"
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={busy}
              onClick={() => uploadInputRef.current?.click()}
              data-testid="vd-character-reference-upload-button"
            >
              <UploadCloud aria-hidden="true" className="h-3.5 w-3.5" />
              {t(lang, "อัปโหลดภาพ", "Upload image")}
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadInputChange}
            />
          </div>
        ) : (
          // "Browse only" mode (no swap target picked yet) — this panel's
          // own drop zone would have nothing to resolve onto, so the hint
          // instead points at the real drop targets elsewhere on the page
          // (a shot's image / the reference strip), matching how the tiles
          // below are actually meant to be used.
          <p className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            <UploadCloud aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t(
              lang,
              "ลากภาพจากที่นี่ไปวางบนภาพช็อต หรือช่องภาพอ้างอิงด้านซ้ายเพื่อใช้ทันที",
              "Drag an image from here onto a shot's picture or its reference strip to use it right away"
            )}
          </p>
        )}

        <Tabs
          value={activeTab}
          onValueChange={v => setActiveTab(v as typeof activeTab)}
        >
          <TabsList
            className={cn("grid w-full", characterId ? "grid-cols-4" : "grid-cols-3")}
          >
            {characterId ? (
              <TabsTrigger value="characterGallery" className="gap-1.5 text-xs">
                <UserSquare2 aria-hidden="true" className="h-3.5 w-3.5" />
                {t(lang, "ภาพตัวละครนี้", "This character")}
              </TabsTrigger>
            ) : null}
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
                    onClick={() => asset.mediaAssetId && onLinkMediaAssetId?.(asset.mediaAssetId)}
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
              onAddToReference={
                onLinkMediaAssetId
                  ? item => {
                      void resolveAndLink({
                        source: "library",
                        libraryItemId: item.item_id,
                      });
                    }
                  : undefined
              }
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
              <div
                className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5 text-xs"
                data-testid="vd-history-scope-toggle"
              >
                <button
                  type="button"
                  onClick={() => setHistoryScope("series")}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors",
                    historyScope === "series"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="vd-history-scope-series"
                >
                  {t(lang, "โปรเจกต์นี้", "This project")}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryScope("all")}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors",
                    historyScope === "all"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="vd-history-scope-all"
                >
                  {t(lang, "ทั้งหมด", "All")}
                </button>
              </div>
              {isHistoryLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t(lang, "กำลังโหลดประวัติ…", "Loading history…")}
                </div>
              )}
              {!isHistoryLoading && mergedHistoryTasks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {historyScope === "series"
                    ? t(
                        lang,
                        "ยังไม่พบภาพของโปรเจกต์นี้ — ลองสลับไปที่ \"ทั้งหมด\"",
                        'No images found for this project yet — try "All"'
                      )
                    : t(lang, "ไม่พบรายการในประวัติ", "No history items found")}
                </p>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                {mergedHistoryTasks
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
                          className="block aspect-square w-full disabled:cursor-grab"
                          disabled={busy || !onLinkMediaAssetId}
                          title={
                            onLinkMediaAssetId
                              ? undefined
                              : t(lang, "ลากภาพนี้ไปวางเพื่อใช้งาน", "Drag this image to use it")
                          }
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
            <ShotGridCutter
              key={gridCutNonce}
              sourceUrl={gridCutSourceUrl ?? undefined}
              onTilesSelected={handleTilesSelected}
              allowMultiSelect={false}
              busy={busy}
            />
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
