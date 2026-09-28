/**
 * Video Studio asset picker (Feature 143 §4.7 client half, §4.13 states,
 * §4.15 Thai terms) — the ONE component every layer-authoring action uses
 * to choose an image/video/audio asset for a layer's `src`.
 *
 * Backed by `trpc.videoProjects.listPickerAssets`, whose `storageUrl` is
 * ALREADY an allowlisted internal proxy URL (§4.7(b)) — callers can drop it
 * straight into a layer's `src` with no further resolution. `onPick`
 * receives the FULL asset object (including `assetId` and `sha256`)
 * because downstream callers need both.
 *
 * Dual API, one component (kept intentionally simple per the task brief):
 *  - Embedded panel: omit `open`/`onOpenChange` — the picker renders its
 *    content directly, and the host decides when it's mounted/visible (this
 *    is how the timeline will embed it later).
 *  - Dialog: pass `open`/`onOpenChange` (same controlled-boolean contract as
 *    `CatalogCreateDialog`) and the same content renders inside an Astryx
 *    `Dialog` + `DialogHeader` shell.
 *
 * Paging: "load more" button (not infinite scroll), consistent with how the
 * rest of `components/videoStudio/*` avoids IntersectionObserver machinery.
 * `nextOffset` from the server response drives whether the button shows;
 * pages accumulate client-side and reset whenever the kind filter or
 * (debounced) search term changes.
 *
 * States per §4.13: skeleton (not spinner) while loading, an EmptyState for
 * zero results (distinct copy for "no results" is out of scope per spec;
 * the empty-library guidance covers both cases well enough for a picker),
 * an error Banner with retry, and a per-item selected highlight — never a
 * panel-wide pending lock (memory `project_panel_wide_pending_dead_button`).
 * Audio items have no thumbnail; they render a distinct icon tile instead of
 * a waveform (explicitly out of scope for this component).
 *
 * NOTE — Astryx exception: same deliberate, twice-confirmed exception as the
 * rest of `components/videoStudio/*` (see `VideoStudioWorkspacePage.tsx`'s
 * top-of-file docstring / `planning/video-studio-astryx-migration/plan.md`).
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Image as ImageIcon, Music, Video as VideoIcon, Check } from "lucide-react";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";

import { trpc } from "@/lib/trpc";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export type VideoStudioAssetKind = "image" | "video" | "audio";

/** Full asset shape returned by `listPickerAssets` — `onPick` always gets
 * this whole object, never just the URL. */
export interface VideoStudioPickerAsset {
  assetId: number;
  storageUrl: string;
  sha256: string;
  kind: VideoStudioAssetKind;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

export const VIDEO_STUDIO_ASSET_DRAG_MIME = "application/x-video-studio-asset";
export type VideoStudioTimelineAsset = Omit<VideoStudioPickerAsset, "assetId"> & {
  assetId: number | string;
};

export function writeVideoStudioAssetDragData(
  dataTransfer: DataTransfer,
  asset: VideoStudioTimelineAsset,
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(VIDEO_STUDIO_ASSET_DRAG_MIME, JSON.stringify(asset));
  dataTransfer.setData("text/uri-list", asset.storageUrl);
  dataTransfer.setData("text/plain", asset.storageUrl);
}

export function readVideoStudioAssetDragData(dataTransfer: DataTransfer): VideoStudioTimelineAsset | null {
  const raw = dataTransfer.getData(VIDEO_STUDIO_ASSET_DRAG_MIME);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<VideoStudioTimelineAsset>;
    if (
      (typeof value.assetId !== "number" && typeof value.assetId !== "string") ||
      typeof value.storageUrl !== "string" ||
      (value.kind !== "image" && value.kind !== "video" && value.kind !== "audio")
    ) {
      return null;
    }
    return value as VideoStudioTimelineAsset;
  } catch {
    return null;
  }
}

type KindFilter = VideoStudioAssetKind | "all";

const PAGE_LIMIT = 24;

export interface VideoStudioAssetPickerProps {
  lang: VideoStudioLang;
  /** Initial kind filter. The user can still change it via the on-screen
   * filter unless the host only ever mounts the picker for one kind. */
  kind?: VideoStudioAssetKind;
  onPick: (asset: VideoStudioPickerAsset) => void;
  /** Makes each asset draggable into the timeline while keeping click-pick
   * behaviour unchanged for existing dialog callers. */
  onDragStart?: (asset: VideoStudioPickerAsset, event: DragEvent<HTMLButtonElement>) => void;
  /** Dialog mode: pass both to render inside an Astryx `Dialog` shell
   * (same controlled-boolean contract as `CatalogCreateDialog`). Omit both
   * to render as a bare embedded panel instead. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Closes the dialog automatically after a pick. Only applies in dialog
   * mode. Defaults to true. */
  closeOnPick?: boolean;
  /** Dialog-mode header title override (P3 — each `TimelineStagePanel`
   * launcher gives the picker a specific Thai title, e.g. "เลือกวิดีโอพื้นหลัง"
   * instead of the generic default). Ignored in embedded-panel mode. */
  title?: string;
  "data-testid"?: string;
}

function AssetPickerContent({
  lang,
  kind,
  onPick,
  onDragStart,
  onPicked,
}: {
  lang: VideoStudioLang;
  kind: VideoStudioAssetKind | undefined;
  onPick: (asset: VideoStudioPickerAsset) => void;
  onPicked?: () => void;
  onDragStart?: (asset: VideoStudioPickerAsset, event: DragEvent<HTMLButtonElement>) => void;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>(kind ?? "all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<VideoStudioPickerAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);

  const filterKey = `${kindFilter}::${debouncedSearch.trim()}`;
  const filterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      setOffset(0);
      setItems([]);
    }
  }, [filterKey]);

  const listQuery = trpc.videoProjects.listPickerAssets.useQuery({
    kind: kindFilter === "all" ? undefined : kindFilter,
    query: debouncedSearch.trim() || undefined,
    limit: PAGE_LIMIT,
    offset,
  });

  useEffect(() => {
    if (!listQuery.data) return;
    setItems((prev) => (offset === 0 ? listQuery.data.items : [...prev, ...listQuery.data.items]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data]);

  const isInitialLoading = listQuery.isLoading && offset === 0;
  const isLoadingMore = listQuery.isFetching && offset > 0;
  const hasMore = Boolean(listQuery.data?.nextOffset != null || (offset > 0 && items.length > 0 && listQuery.isFetching));
  const nextOffset = listQuery.data?.nextOffset ?? null;

  function handlePick(asset: VideoStudioPickerAsset) {
    setSelectedAssetId(asset.assetId);
    onPick(asset);
    onPicked?.();
  }

  return (
    <VStack gap={3} data-testid="asset-picker">
      <HStack gap={2} align="center" wrap="wrap">
        <TextInput
          label={pickCopy(lang, videoStudioCopy.assetPickerSearchPlaceholder)}
          isLabelHidden
          value={searchInput}
          onChange={(value) => setSearchInput(value)}
          placeholder={pickCopy(lang, videoStudioCopy.assetPickerSearchPlaceholder)}
          data-testid="asset-picker-search"
        />
        <ToggleButtonGroup
          type="single"
          label={pickCopy(lang, videoStudioCopy.assetPickerFilterAll)}
          value={kindFilter}
          onChange={(value) => setKindFilter((value as KindFilter) ?? "all")}
          data-testid="asset-picker-kind-filter"
        >
          <ToggleButton value="all" label={pickCopy(lang, videoStudioCopy.assetPickerFilterAll)} />
          <ToggleButton value="image" label={pickCopy(lang, videoStudioCopy.assetPickerFilterImage)} />
          <ToggleButton value="video" label={pickCopy(lang, videoStudioCopy.assetPickerFilterVideo)} />
          <ToggleButton value="audio" label={pickCopy(lang, videoStudioCopy.assetPickerFilterAudio)} />
        </ToggleButtonGroup>
      </HStack>

      {isInitialLoading ? (
        <Grid columns={{ minWidth: 96, max: 6 }} gap={2}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} height={96} width="100%" radius={2} />
          ))}
        </Grid>
      ) : listQuery.isError ? (
        <Banner
          status="error"
          title={pickCopy(lang, videoStudioCopy.assetPickerLoadError)}
          description={listQuery.error?.message}
          endContent={
            <Button
              variant="ghost"
              size="sm"
              label={pickCopy(lang, videoStudioCopy.retry)}
              onClick={() => listQuery.refetch()}
            />
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          isCompact
          icon={<ImageIcon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
          title={pickCopy(lang, videoStudioCopy.assetPickerEmptyTitle)}
          description={pickCopy(lang, videoStudioCopy.assetPickerEmptyBody)}
        />
      ) : (
        <>
          <Grid columns={{ minWidth: 96, max: 6 }} gap={2}>
            {items.map((asset) => {
              const isSelected = selectedAssetId === asset.assetId;
              return (
                <button
                  key={asset.assetId}
                  type="button"
                  className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                    isSelected ? "border-primary" : "border-border/60 hover:border-primary/60"
                  }`}
                  data-testid="asset-picker-item"
                  data-selected={isSelected}
                  data-asset-kind={asset.kind}
                  aria-pressed={isSelected}
                  draggable
                  onDragStart={(event) => onDragStart?.(asset, event)}
                  onClick={() => handlePick(asset)}
                >
                  {asset.kind === "audio" ? (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted">
                      <Music className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      <Text type="supporting" color="secondary">
                        {pickCopy(lang, videoStudioCopy.assetPickerAudioTile)}
                      </Text>
                    </span>
                  ) : asset.kind === "video" && !asset.thumbnailUrl ? (
                    <span className="flex h-full w-full items-center justify-center bg-muted">
                      <VideoIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    </span>
                  ) : (
                    <img
                      src={asset.thumbnailUrl ?? asset.storageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  {isSelected ? (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </Grid>

          {nextOffset != null ? (
            <Button
              variant="ghost"
              size="sm"
              label={pickCopy(lang, videoStudioCopy.assetPickerLoadMore)}
              isLoading={isLoadingMore}
              isDisabled={isLoadingMore}
              data-testid="asset-picker-load-more"
              onClick={() => setOffset(nextOffset)}
            />
          ) : null}
        </>
      )}
    </VStack>
  );
}

export function VideoStudioAssetPicker({
  lang,
  kind,
  onPick,
  onDragStart,
  open,
  onOpenChange,
  closeOnPick = true,
  title,
  "data-testid": dataTestId,
}: VideoStudioAssetPickerProps) {
  const isDialogMode = open !== undefined;

  if (!isDialogMode) {
    return (
      <div data-testid={dataTestId}>
        <AssetPickerContent lang={lang} kind={kind} onPick={onPick} onDragStart={onDragStart} />
      </div>
    );
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
      purpose="form"
      width={720}
      data-testid={dataTestId ?? "video-studio-asset-picker-dialog"}
    >
      <Layout
        height="auto"
        header={
          <DialogHeader
            title={title ?? pickCopy(lang, videoStudioCopy.assetPickerTitle)}
            onOpenChange={(nextOpen: boolean) => onOpenChange?.(nextOpen)}
          />
        }
        content={
          <LayoutContent>
            <AssetPickerContent
              lang={lang}
              kind={kind}
              onPick={onPick}
              onDragStart={onDragStart}
              onPicked={() => {
                if (closeOnPick) onOpenChange?.(false);
              }}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
