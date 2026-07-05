/**
 * ShotGridCutter (Vertical Drama Storyboard Completion Plan, Phase 2.3).
 *
 * Standalone grid-cutter surface extracted from
 * `VerticalDramaCharacterReferencePanel.tsx`'s original inline "cutter" tab
 * (formerly lines ~266-897) so both the character-reference panel and the
 * storyboard shot card's multi-angle picker can reuse the exact same
 * upload/grid-size/preview/detected-grid UX instead of maintaining two
 * copies. Behavior is unchanged from the original inline tab except for two
 * additions (Phase 2.3):
 *  - **Multi-select**: tiles can now be selected via checkbox (not just a
 *    single click-to-use), driving `onTilesSelected(tiles)`.
 *  - **Optional per-tile 9:16 crop**: a toggle refines any tile through
 *    `cropImageToAspect` before it's handed back — useful when a cut tile
 *    isn't already exactly 9:16.
 *
 * A single click on a tile (no selection made yet) still immediately fires
 * `onTilesSelected([tile])` for the common "just grab one" case, matching the
 * original panel's UX; checking one or more boxes and pressing "Use N tiles"
 * covers the new multi-select path.
 */

import { useRef, useState } from "react";
import {
  Crop,
  Download,
  Loader2,
  Scissors,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  COMMON_GRIDS,
  DEFAULT_SPLIT_GRID,
  createSplitPreview,
  cropImageToAspect,
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
 *  `handleItemDragStart`) so a cut tile is interchangeable with every other
 *  drag source/drop target in the feature. */
export function setUnifiedDragPayload(event: React.DragEvent, url: string): void {
  event.dataTransfer.setData("text/uri-list", url);
  event.dataTransfer.setData("text/plain", url);
  event.dataTransfer.setData("application/x-smartspec-media-type", "image");
  event.dataTransfer.effectAllowed = "copy";
}

export interface ShotGridCutterProps {
  /** Optional initial image to cut — when provided, the cutter starts already
   *  primed with this source (grid detection runs immediately). Leave unset
   *  to show only the upload button (character-reference panel's original
   *  "start empty, cut a Library/History image via its own button" flow). */
  sourceUrl?: string;
  /** Fired with the selected tiles — either a single tile (plain click) or
   *  several (checkbox multi-select + "Use N tiles"). Optionally cropped to
   *  `cropAspect` first when the per-tile crop toggle is on. */
  onTilesSelected: (tiles: SplitResult[]) => void;
  /** When true, checkboxes + a "Use N tiles" action bar are shown so more
   *  than one tile can be selected at once (Phase 2.3/2.4 multi-angle
   *  reference picking). Defaults to true; set false to restore the
   *  original single-click-only behavior. */
  allowMultiSelect?: boolean;
  /** Aspect ratio offered by the per-tile crop toggle (defaults to "9:16",
   *  since 3x3 multi-angle grids are already vertical-drama frames). */
  cropAspect?: string;
  busy?: boolean;
  className?: string;
}

export function ShotGridCutter({
  sourceUrl: initialSourceUrl,
  onTilesSelected,
  allowMultiSelect = true,
  cropAspect = "9:16",
  busy = false,
  className,
}: ShotGridCutterProps) {
  const lang = useVerticalDramaLang();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---- Cut results, rekeyed by source URL so cutting a second candidate
   *  image doesn't wipe the first candidate's already-visible tiles. ---- */
  const [cutterResultsByUrl, setCutterResultsByUrl] = useState<
    Record<string, SplitResult[]>
  >({});
  const [cuttingUrl, setCuttingUrl] = useState<string | null>(null);

  /* ---- Grid-size choice, asked before every cut. ---- */
  const [pendingCutSource, setPendingCutSource] = useState<string | null>(
    initialSourceUrl ?? null
  );
  const [pendingCutGrid, setPendingCutGrid] =
    useState<GridDimension>(DEFAULT_SPLIT_GRID);
  const [detectedGrid, setDetectedGrid] = useState<DetectedGrid | null>(null);
  const [splitPreviewUrl, setSplitPreviewUrl] = useState<string | null>(null);
  const [isDetectingGrid, setIsDetectingGrid] = useState(false);

  /* ---- Multi-select + per-tile crop toggle (Phase 2.3 additions). ---- */
  const [selectedTileKeys, setSelectedTileKeys] = useState<Set<string>>(
    new Set()
  );
  const [cropEnabled, setCropEnabled] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const tileKey = (sourceUrl: string, index: number) => `${sourceUrl}::${index}`;

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

  // Prime the cutter immediately when `sourceUrl` is supplied.
  const primedForRef = useRef<string | null>(null);
  if (initialSourceUrl && primedForRef.current !== initialSourceUrl) {
    primedForRef.current = initialSourceUrl;
    void startGridCut(initialSourceUrl);
  }

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

  /** Optionally crop a tile to `cropAspect` before handing it back — mirrors
   *  the crop primitives already used elsewhere in the app
   *  (`cropImageToAspect`, from `imageGridSplitter.ts`). */
  const maybeCropTiles = async (tiles: SplitResult[]): Promise<SplitResult[]> => {
    if (!cropEnabled) return tiles;
    setIsCropping(true);
    try {
      const cropped = await Promise.all(
        tiles.map(async tile => {
          try {
            const result = await cropImageToAspect(
              tile.dataUrl,
              cropAspect,
              "image/jpeg",
              0.92
            );
            return {
              ...tile,
              blob: result.blob,
              dataUrl: result.dataUrl,
              width: result.width,
              height: result.height,
              targetAspectRatio: cropAspect,
            };
          } catch {
            return tile;
          }
        })
      );
      return cropped;
    } finally {
      setIsCropping(false);
    }
  };

  const handleUseTile = async (tile: SplitResult) => {
    const [cropped] = await maybeCropTiles([tile]);
    onTilesSelected([cropped]);
  };

  const handleUseSelected = async (sourceUrl: string, tiles: SplitResult[]) => {
    const selected = tiles.filter(tile =>
      selectedTileKeys.has(tileKey(sourceUrl, tile.index))
    );
    if (selected.length === 0) return;
    const cropped = await maybeCropTiles(selected);
    onTilesSelected(cropped);
    setSelectedTileKeys(prev => {
      const next = new Set(prev);
      for (const tile of selected) next.delete(tileKey(sourceUrl, tile.index));
      return next;
    });
  };

  const toggleTileSelected = (sourceUrl: string, index: number) => {
    const key = tileKey(sourceUrl, index);
    setSelectedTileKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const disabled = busy || isCropping;

  return (
    <div className={cn("space-y-3 rounded-lg border bg-white/70 p-2.5 backdrop-blur", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud aria-hidden="true" className="h-3.5 w-3.5" />
          {t(lang, "อัปโหลดภาพเพื่อตัดกริด", "Upload an image to cut")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => handleFileSelected(e.target.files?.[0])}
        />
        {allowMultiSelect ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={cropEnabled}
              onCheckedChange={value => setCropEnabled(Boolean(value))}
              aria-label={t(
                lang,
                `ตัดขอบเป็น ${cropAspect} ก่อนใช้`,
                `Crop to ${cropAspect} before use`
              )}
            />
            <Crop aria-hidden="true" className="h-3.5 w-3.5" />
            {t(lang, `ตัดขอบเป็น ${cropAspect}`, `Crop to ${cropAspect}`)}
          </label>
        ) : null}
      </div>

      {/* Grid-size choice — live numbered-overlay preview, detected-grid chip,
          preset + custom rows/cols controls. */}
      {pendingCutSource && (
        <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/60 p-2.5">
          <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            {isDetectingGrid ? (
              <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
            ) : splitPreviewUrl ? (
              <img src={splitPreviewUrl} alt="" className="max-h-72 max-w-full object-contain" />
            ) : (
              <img src={pendingCutSource} alt="" className="max-h-72 max-w-full object-contain" />
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
                  pendingCutGrid.rows === grid.rows && pendingCutGrid.cols === grid.cols
                    ? "default"
                    : "outline"
                }
                className="h-8 px-1 text-[10px]"
                onClick={() => void updatePendingCutGrid(grid.rows, grid.cols)}
              >
                {grid.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">{t(lang, "แถว", "Rows")}</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={pendingCutGrid.rows}
                onChange={event =>
                  void updatePendingCutGrid(
                    Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                    pendingCutGrid.cols
                  )
                }
                className="h-8"
              />
            </label>
            <span className="pb-2 text-xs text-muted-foreground">x</span>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">{t(lang, "คอลัมน์", "Cols")}</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={pendingCutGrid.cols}
                onChange={event =>
                  void updatePendingCutGrid(
                    pendingCutGrid.rows,
                    Math.min(10, Math.max(1, Number(event.target.value) || 1))
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
              onClick={() => void runSplit(pendingCutSource, pendingCutGrid.rows, pendingCutGrid.cols)}
            >
              {cuttingUrl === pendingCutSource ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
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

      {!pendingCutSource && Object.keys(cutterResultsByUrl).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            lang,
            "อัปโหลดภาพกริด (หรือกดปุ่มตัดกริดจากที่อื่น) เพื่อเลือกขนาดและแยกเป็นภาพย่อยแต่ละช่อง",
            "Upload a grid image (or trigger a grid-cut from elsewhere) to choose a size and split it into individual tiles"
          )}
        </p>
      ) : (
        Object.entries(cutterResultsByUrl).map(([sourceUrl, tiles]) => {
          const selectedCount = tiles.filter(tile =>
            selectedTileKeys.has(tileKey(sourceUrl, tile.index))
          ).length;
          return (
            <div key={sourceUrl} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2">
                <img
                  src={sourceUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded border border-border object-cover"
                />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                  {t(lang, `ผลลัพธ์ ${tiles.length} รูป`, `${tiles.length} results`)}
                </p>
                {allowMultiSelect && selectedCount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    disabled={disabled}
                    onClick={() => void handleUseSelected(sourceUrl, tiles)}
                    data-testid="vd-grid-cutter-use-selected"
                  >
                    {isCropping ? (
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {t(lang, `ใช้ ${selectedCount} ช่องที่เลือก`, `Use ${selectedCount} selected`)}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  onClick={() => void downloadAllSplitImages(tiles, "shot-grid-cutter")}
                >
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  {t(lang, "ทั้งหมด", "All")}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {tiles.map(tile => {
                  const key = tileKey(sourceUrl, tile.index);
                  const checked = selectedTileKeys.has(key);
                  return (
                    <div
                      key={tile.index}
                      draggable
                      onDragStart={event => setUnifiedDragPayload(event, tile.dataUrl)}
                      className={cn(
                        "relative cursor-grab overflow-hidden rounded-md border active:cursor-grabbing",
                        checked ? "border-primary ring-2 ring-primary" : "border-border"
                      )}
                    >
                      <button
                        type="button"
                        className="block aspect-square w-full"
                        disabled={disabled}
                        onClick={() => void handleUseTile(tile)}
                        data-testid={`vd-grid-cutter-tile-${tile.index}`}
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
                      {allowMultiSelect ? (
                        <label
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/50"
                          onClick={event => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleTileSelected(sourceUrl, tile.index)}
                            className="h-3.5 w-3.5 border-white"
                            aria-label={t(
                              lang,
                              `เลือกช่อง ${tile.index + 1}`,
                              `Select tile ${tile.index + 1}`
                            )}
                          />
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
      <p className="text-xs text-muted-foreground">
        {allowMultiSelect
          ? t(
              lang,
              "ลากช่องไปวางที่กล่องรับวาง, คลิกช่องเพื่อใช้ทันที, หรือติ๊กเลือกหลายช่องแล้วกด \"ใช้ที่เลือก\"",
              "Drag a tile to a drop zone, click a tile to use it immediately, or check several and press \"Use selected\""
            )
          : t(
              lang,
              "ลากช่องที่ตัดแล้วไปยังกล่องรับวาง หรือคลิกที่ช่องเพื่อใช้เป็นอ้างอิงทันที",
              "Drag a cut tile to a drop zone, or click a tile to use it as a reference immediately."
            )}
      </p>
    </div>
  );
}

export default ShotGridCutter;
