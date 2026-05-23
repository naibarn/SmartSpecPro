import { useMemo, useState } from "react";
import { Image, MousePointerClick, Music, PackagePlus, Search, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductionContextAssetZone, ProductionReferenceInput } from "@shared/mediaProduction";
import { assetKindLabel, zoneLabel } from "./displayLabels";
import type { ProductionLocale } from "./types";

export interface ContextAssetBoardProps {
  assets: ProductionReferenceInput[];
  selectedNodeId?: string | null;
  selectedNodeTitle?: string | null;
  locale?: ProductionLocale;
  onAddAsset?: (asset: ProductionReferenceInput) => void;
  onAssignAssetToNode?: (asset: ProductionReferenceInput, nodeId?: string | null) => void;
  providerCharacterResults?: ProductionReferenceInput[];
  isSearchingProviders?: boolean;
  onSearchProviders?: (query: string) => void;
  onAddProviderAsset?: (asset: ProductionReferenceInput) => void;
}

function assetIcon(kind: ProductionReferenceInput["kind"]) {
  if (kind === "source_video" || kind === "generated_media") return Video;
  if (kind === "audio_asset") return Music;
  if (kind === "marketplace_product" || kind === "product_image") return PackagePlus;
  return Image;
}

const assetZones: Array<{ zone: ProductionContextAssetZone | "all" }> = [
  { zone: "all" },
  { zone: "cast" },
  { zone: "products" },
  { zone: "scene_mood" },
  { zone: "audio" },
  { zone: "generated" },
  { zone: "targets" },
];

function inferAssetZone(asset: ProductionReferenceInput): ProductionContextAssetZone {
  if (asset.zone) return asset.zone;
  if (asset.kind === "marketplace_product" || asset.kind === "product_image") return "products";
  if (asset.kind === "character_asset") return "cast";
  if (asset.kind === "audio_asset") return "audio";
  if (asset.kind === "generated_media") return "generated";
  if (asset.kind === "source_video") return "targets";
  return "scene_mood";
}

export function ContextAssetBoard({
  assets,
  selectedNodeId,
  selectedNodeTitle,
  locale,
  onAddAsset,
  onAssignAssetToNode,
  providerCharacterResults = [],
  isSearchingProviders,
  onSearchProviders,
  onAddProviderAsset,
}: ContextAssetBoardProps) {
  const isThai = locale === "th";
  const [query, setQuery] = useState("");
  const [selectedZone, setSelectedZone] = useState<ProductionContextAssetZone | "all">("all");
  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
      const zone = inferAssetZone(asset);
      const matchesZone = selectedZone === "all" || zone === selectedZone;
      const matchesQuery = !normalizedQuery || [
        asset.title,
        asset.kind,
        asset.source,
        asset.role ?? "",
        asset.sku ?? "",
        asset.variantId ?? "",
        ...(asset.warnings ?? []),
      ].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesZone && matchesQuery;
    });
    return filtered.length
      ? filtered
      : [{ id: "empty", title: isThai ? "ไม่พบ asset" : "No assets found", kind: "reference_image" as const, source: "empty" }];
  }, [assets, isThai, query, selectedZone]);

  return (
    <div className="rounded-lg border bg-white p-3" data-testid="context-asset-board">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PackagePlus className="h-4 w-4 text-sky-600" />
          {isThai ? "Context Assets" : "Context Assets"}
        </div>
        {selectedNodeId ? <Badge variant="outline">{selectedNodeTitle ?? selectedNodeId}</Badge> : null}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded border bg-slate-50 px-2">
        <Search className="h-4 w-4 text-muted-foreground" />
	        <Input
	          value={query}
	          onChange={(event) => {
	            setQuery(event.target.value);
	            onSearchProviders?.(event.target.value);
	          }}
	          placeholder={isThai ? "ค้นหา asset / character / provider" : "Search assets / characters / providers"}
	          aria-label={isThai ? "ค้นหา asset character provider" : "Search assets characters providers"}
	          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
	        />
	      </div>
	      {(providerCharacterResults.length > 0 || isSearchingProviders) ? (
	        <div className="mt-3 rounded border border-sky-100 bg-sky-50 p-2" data-testid="provider-character-results">
	          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-sky-800">
	            <span>{isThai ? "Character / Provider Results" : "Character / Provider Results"}</span>
	            {isSearchingProviders ? <Badge variant="outline">{isThai ? "กำลังค้นหา" : "Searching"}</Badge> : <Badge variant="outline">{providerCharacterResults.length}</Badge>}
	          </div>
	          <div className="grid gap-2">
	            {providerCharacterResults.map((asset) => {
	              const Icon = assetIcon(asset.kind);
	              return (
	                <div
	                  key={asset.id}
	                  className="flex items-center gap-2 rounded border bg-white px-2 py-2 text-left text-sm hover:border-sky-200"
	                >
	                  <Icon className="h-4 w-4 text-sky-600" />
	                  <span className="min-w-0 flex-1">
	                    <span className="block truncate font-medium">{asset.title}</span>
	                    <span className="block truncate text-xs text-muted-foreground">{assetKindLabel(asset.kind, locale)} · {asset.source}</span>
	                  </span>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10 sm:min-h-0"
                        onClick={() => {
                          onAddProviderAsset?.(asset);
                          onAddAsset?.(asset);
                        }}
                      >
                        {isThai ? "เพิ่ม" : "Add"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10 sm:min-h-0"
                        disabled={!selectedNodeId}
                        onClick={() => onAssignAssetToNode?.(asset, selectedNodeId)}
                      >
                        {isThai ? "ผูก" : "Attach"}
                      </Button>
                    </div>
	                </div>
	              );
	            })}
	          </div>
	        </div>
	      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {assetZones.map((item) => (
          <button
            key={item.zone}
            type="button"
            onClick={() => setSelectedZone(item.zone)}
            aria-pressed={selectedZone === item.zone}
            className={`min-h-10 rounded border px-3 py-1 text-xs sm:min-h-0 sm:px-2 ${selectedZone === item.zone ? "border-sky-300 bg-sky-50 text-sky-800" : "bg-white text-muted-foreground"}`}
          >
            {zoneLabel(item.zone, locale)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {visibleAssets.map((asset) => {
          const Icon = assetIcon(asset.kind);
          const isEmpty = asset.id === "empty";
          const zone = inferAssetZone(asset);

          return (
            <div
              key={asset.id}
              draggable={!isEmpty}
              onDragStart={(event) => {
                if (isEmpty) return;
                event.dataTransfer.setData("application/x-production-asset-id", asset.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
              className="w-full rounded border bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-sky-200 hover:bg-sky-50"
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{asset.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {assetKindLabel(asset.kind, locale)} · {asset.source}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">{zoneLabel(zone, locale)}</Badge>
                    {asset.role ? <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">{asset.role}</Badge> : null}
                    {asset.approvalState ? <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">{asset.approvalState}</Badge> : null}
                    {asset.sku ? <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">{asset.sku}</Badge> : null}
                  </div>
                  {asset.warnings?.length ? (
                    <div className="mt-1 line-clamp-2 text-xs text-amber-700">{asset.warnings.join(", ")}</div>
                  ) : null}
                </div>
                {!isEmpty ? <MousePointerClick className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /> : null}
              </div>
              {!isEmpty ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="min-h-10 sm:min-h-0" onClick={() => onAddAsset?.(asset)}>
                    <PackagePlus className="mr-1 h-3.5 w-3.5" />
                    {isThai ? "เพิ่มเข้า canvas" : "Add to canvas"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10 sm:min-h-0"
                    disabled={!selectedNodeId}
                    onClick={() => onAssignAssetToNode?.(asset, selectedNodeId)}
                  >
                    {isThai ? "ผูกกับ node" : "Attach to selected node"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        className="mt-3 rounded border border-dashed p-3 text-xs text-muted-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const assetId = event.dataTransfer.getData("application/x-production-asset-id");
          const asset = assets.find((item) => item.id === assetId);
          if (asset) onAssignAssetToNode?.(asset, selectedNodeId);
        }}
      >
        {selectedNodeId
          ? (isThai ? `Drop asset เพื่อผูกกับ ${selectedNodeTitle ?? selectedNodeId}` : `Drop an asset here to attach it to ${selectedNodeTitle ?? selectedNodeId}.`)
          : (isThai ? "เลือก node ก่อนเพื่อผูก asset" : "Select a node before attaching assets.")}
      </div>
    </div>
  );
}
