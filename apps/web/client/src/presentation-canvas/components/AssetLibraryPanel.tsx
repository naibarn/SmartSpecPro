import { type ComponentType, type DragEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Clapperboard, ImageIcon, Layers3, Search, Shapes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export type AssetLibraryTab = "slides" | "photos" | "videos" | "graphics";
type AssetSourceFilter = "all" | "history" | "library" | "shared";

export interface CanvasLibraryAsset {
  id: number;
  kind: "image" | "video";
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  sourceType?: "history" | "library" | "shared";
}

interface AssetLibraryPanelProps {
  activeTab: AssetLibraryTab;
  onTabChange: (tab: AssetLibraryTab) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  assets: CanvasLibraryAsset[];
  isLoading: boolean;
  slidesPanel: ReactNode;
  graphicsPanel?: ReactNode;
  onInsertAsset: (asset: CanvasLibraryAsset) => void;
  onDragAssetStart: (event: DragEvent<HTMLElement>, asset: CanvasLibraryAsset) => void;
}

const TABS: Array<{
  id: AssetLibraryTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
    { id: "slides", label: "Slides", icon: Layers3 },
    { id: "photos", label: "Photos", icon: ImageIcon },
    { id: "videos", label: "Videos", icon: Clapperboard },
    { id: "graphics", label: "Graphics", icon: Shapes },
  ];

const SOURCE_FILTERS: Array<{ id: AssetSourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "history", label: "History" },
  { id: "library", label: "Library" },
  { id: "shared", label: "Shared" },
];

function AssetThumbnail({ asset }: { asset: CanvasLibraryAsset }) {
  const [failed, setFailed] = useState(false);
  const sourceBadgeLabel = asset.sourceType === "history"
    ? "History"
    : asset.sourceType === "shared"
      ? "Shared"
      : "Library";

  const placeholder = (
    <div
      className="grid h-full w-full place-items-center text-xs text-slate-400"
      data-testid={`asset-thumb-placeholder-${asset.kind}-${asset.id}`}
    >
      {asset.kind === "video" ? (
        <Clapperboard className="h-5 w-5 text-slate-500" />
      ) : (
        <ImageIcon className="h-5 w-5 text-slate-500" />
      )}
    </div>
  );

  return (
    <div className="relative aspect-video w-full bg-slate-800">
      {failed ? (
        placeholder
      ) : asset.kind === "video" ? (
        <video
          src={asset.sourceUrl}
          poster={asset.thumbnailUrl || undefined}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          autoPlay
          loop
          playsInline
          onError={() => setFailed(true)}
          data-testid={`asset-video-thumb-${asset.id}`}
        />
      ) : asset.thumbnailUrl ? (
        <img
          src={asset.thumbnailUrl}
          alt={asset.title}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          data-testid={`asset-thumb-${asset.kind}-${asset.id}`}
        />
      ) : (
        placeholder
      )}
      {asset.kind === "video" ? (
        <div className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] tracking-wide text-white">
          VIDEO
        </div>
      ) : null}
      <div className="absolute right-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] tracking-wide text-white">
        {sourceBadgeLabel}
      </div>
    </div>
  );
}

export function AssetLibraryPanel({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchQueryChange,
  assets,
  isLoading,
  slidesPanel,
  graphicsPanel,
  onInsertAsset,
  onDragAssetStart,
}: AssetLibraryPanelProps) {
  const [sourceFilter, setSourceFilter] = useState<AssetSourceFilter>("all");
  const sourceFilterCounts = useMemo(() => {
    const counts = { history: 0, library: 0, shared: 0 };
    for (const asset of assets) {
      const sourceType = asset.sourceType ?? "library";
      counts[sourceType] += 1;
    }
    return counts;
  }, [assets]);
  const filteredAssets = useMemo(() => (
    assets.filter((asset) => {
      if (sourceFilter === "all") {
        return true;
      }
      const sourceType = asset.sourceType ?? "library";
      return sourceType === sourceFilter;
    })
  ), [assets, sourceFilter]);

  useEffect(() => {
    if (activeTab === "slides" || activeTab === "graphics") {
      setSourceFilter("all");
    }
  }, [activeTab]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-slate-100">
      <div className="grid grid-cols-2 gap-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant="ghost"
              className={`h-auto gap-1 rounded-md border px-2 py-2 text-xs ${active
                  ? "border-sky-400/70 bg-sky-500/20 text-sky-100"
                  : "border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                }`}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {activeTab === "slides" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {slidesPanel}
        </div>
      ) : activeTab === "graphics" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {graphicsPanel}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {SOURCE_FILTERS.map((filter) => {
              const count = filter.id === "all" ? assets.length : sourceFilterCounts[filter.id];
              const active = sourceFilter === filter.id;
              return (
                <Button
                  key={filter.id}
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Filter source ${filter.label}`}
                  className={`h-7 rounded-full border px-2 text-[11px] ${active
                    ? "border-sky-400/70 bg-sky-500/20 text-sky-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                    }`}
                  onClick={() => setSourceFilter(filter.id)}
                >
                  {filter.label} ({count})
                </Button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={activeTab === "photos" ? "Search images..." : "Search videos..."}
              className="border-slate-700 bg-slate-950/70 pl-8 text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <ScrollArea className="h-[calc(70vh-160px)] pr-1">
            {isLoading ? (
              <p className="text-sm text-slate-400">Loading media sources...</p>
            ) : filteredAssets.length ? (
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => (
                  <div
                    key={`${asset.kind}-${asset.id}`}
                    className="group overflow-hidden rounded-md border border-slate-700 bg-slate-950 text-left shadow-sm transition hover:border-sky-500/80"
                    draggable
                    onDragStart={(event) => onDragAssetStart(event, asset)}
                    onDoubleClick={() => onInsertAsset(asset)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Drag ${asset.kind} ${asset.title} to canvas`}
                    title="Drag to canvas or double-click to insert"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onInsertAsset(asset);
                      }
                    }}
                  >
                    <AssetThumbnail asset={asset} />
                    <div className="space-y-1 p-2">
                      <p className="truncate text-xs text-slate-200">{asset.title}</p>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 w-full bg-sky-600 text-xs text-white hover:bg-sky-500"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInsertAsset(asset);
                        }}
                      >
                        Insert
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                {sourceFilter === "all"
                  ? "No media found in Media History or Library."
                  : `No ${sourceFilter} media found for this search.`}
              </p>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  );
}
