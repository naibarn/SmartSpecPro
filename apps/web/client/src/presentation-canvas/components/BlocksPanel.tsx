import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Pin, Search, Sparkles, Star, Trash2, UserRound } from "lucide-react";
import DOMPurify from "dompurify";

import { Button } from "@/components/ui/button";
import { DEFAULT_PRESENTATION_CANVAS_SIZE } from "@/presentation-canvas/constants";
import { Input } from "@/components/ui/input";
import { SlideElementPreview } from "@/presentation-canvas/components/SlideElementPreview";
import type { PresentationCustomBlockDefinition } from "@/lib/presentationCustomBlocks";
import {
  buildBuiltInPresentationComponentInstanceFromSlotBindings,
  getBuiltInPresentationComponentMediaProfile,
  getBuiltInPresentationComponentDefinition,
  type BuiltInPresentationComponentId,
} from "@/lib/presentationComponentCatalog";
import {
  PRESENTATION_BLOCK_PRESETS,
  type PresentationBlockPresetId,
} from "@/lib/presentationBlockPresets";
import type {
  PresentationSlideBackground,
  PresentationSlideElement,
} from "@shared/presentation/contracts";

interface BlocksPanelProps {
  onInsertPreset: (presetId: PresentationBlockPresetId) => void;
  onInsertComponent?: (componentId: BuiltInPresentationComponentId) => void;
  customBlocks?: PresentationCustomBlockDefinition[];
  onInsertCustomBlock?: (blockId: string) => void;
  onDeleteCustomBlock?: (blockId: string) => void;
  onToggleFavoriteCustomBlock?: (blockId: string, nextFavorite: boolean) => void;
  onTogglePinCustomBlock?: (blockId: string, nextPinned: boolean) => void;
  onToggleTeamFeaturedCustomBlock?: (blockId: string, nextFeatured: boolean) => void;
  onTransferCustomBlockOwner?: (blockId: string, nextOwnerUserId: number) => void;
  onLibraryStateChange?: (state: {
    search: string;
    scope: "All" | "Built-in" | "Mine" | "Team";
    activityFilter: "All" | "Governed" | "Featured" | "Transferred";
    sortOrder: "Featured" | "Newest" | "A-Z" | "Most Used" | "Recent Activity";
  }) => void;
}

export type { PresentationBlockPresetId } from "@/lib/presentationBlockPresets";

type BlockGovernanceEvent = {
  eventType: string;
  detail?: string;
  recordedAt: string;
  actorRole?: string;
  actorUserId?: number;
};

interface BaseBlockCard {
  id: string;
  label: string;
  category: string;
  description: string;
  accentColor: string;
  componentId: BuiltInPresentationComponentId;
  isCustom: boolean;
  canvasIntent: "adaptive" | "portrait-document" | "landscape-16:9";
  mediaSlotCount: number;
  mediaSupportLabel: string | null;
  previewMediaZones: readonly { label: string; slotType: "image" | "video" | "media"; x: number; y: number; width: number; height: number }[];
}

interface CustomBlockCard extends BaseBlockCard {
  isCustom: true;
  previewUrl?: string;
  visibility: "private" | "team";
  canDelete: boolean;
  canFeature: boolean;
  canTransferOwnership: boolean;
  ownerUserId: number;
  isPinned: boolean;
  isTeamFeatured: boolean;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt?: string;
  savedAt: string;
  previewElements: readonly PresentationSlideElement[];
  previewBackground?: PresentationSlideBackground;
  governanceEvents: BlockGovernanceEvent[];
}

interface PresetBlockCard extends BaseBlockCard {
  id: PresentationBlockPresetId;
  isCustom: false;
  presetIndex: number;
  previewBackground: undefined;
  governanceEvents: [];
}

type BlocksPanelCard = CustomBlockCard | PresetBlockCard;

export function BlocksPanel({
  onInsertPreset,
  onInsertComponent,
  customBlocks = [],
  onInsertCustomBlock,
  onDeleteCustomBlock,
  onToggleFavoriteCustomBlock,
  onTogglePinCustomBlock,
  onToggleTeamFeaturedCustomBlock,
  onTransferCustomBlockOwner,
  onLibraryStateChange,
}: BlocksPanelProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [canvasIntentFilter, setCanvasIntentFilter] = useState<"All" | "Portrait Document" | "Landscape 16:9" | "Adaptive">("All");
  const [scope, setScope] = useState<"All" | "Built-in" | "Mine" | "Team">("All");
  const [activityFilter, setActivityFilter] = useState<"All" | "Governed" | "Featured" | "Transferred">("All");
  const [sortOrder, setSortOrder] = useState<"Featured" | "Newest" | "A-Z" | "Most Used" | "Recent Activity">("Featured");
  const [expandedGovernanceCardIds, setExpandedGovernanceCardIds] = useState<string[]>([]);
  const [teamGovernanceFilter, setTeamGovernanceFilter] = useState<"All" | "Featured" | "Ownership" | "Pin" | "Visibility">("All");

  function formatCanvasIntentLabel(intent: "adaptive" | "portrait-document" | "landscape-16:9"): string {
    if (intent === "portrait-document") {
      return "Portrait Document";
    }
    if (intent === "landscape-16:9") {
      return "Landscape 16:9";
    }
    return "Adaptive";
  }

  function formatMediaSupportLabel(profile: ReturnType<typeof getBuiltInPresentationComponentMediaProfile>): string | null {
    if (!profile.slotCount) {
      return null;
    }
    if (profile.acceptsImages && profile.acceptsVideos) {
      return "Image / Video";
    }
    if (profile.acceptsVideos) {
      return "Video";
    }
    if (profile.acceptsImages) {
      return "Image";
    }
    return null;
  }

  function formatMediaZoneTypeLabel(slotType: "image" | "video" | "media"): string {
    if (slotType === "image") {
      return "IMG";
    }
    if (slotType === "video") {
      return "VID";
    }
    return "IMG/VID";
  }

  function getMediaZoneClasses(slotType: "image" | "video" | "media"): string {
    if (slotType === "image") {
      return "border-sky-300/90 bg-sky-400/10 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.28)]";
    }
    if (slotType === "video") {
      return "border-fuchsia-300/90 bg-fuchsia-400/10 shadow-[inset_0_0_0_1px_rgba(217,70,239,0.28)]";
    }
    return "border-emerald-300/90 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)]";
  }

  const customCards = useMemo<CustomBlockCard[]>(() => customBlocks.map((block) => {
    const definition = getBuiltInPresentationComponentDefinition(block.componentId);
    const mediaProfile = definition ? getBuiltInPresentationComponentMediaProfile(block.componentId) : null;
    const previewComponent = buildBuiltInPresentationComponentInstanceFromSlotBindings(block.componentId, {
      canvas: DEFAULT_PRESENTATION_CANVAS_SIZE,
      instanceId: `custom-preview-${block.id}`,
      slotBindings: block.slotBindings,
    });
    return {
      id: block.id,
      label: block.label,
      category: block.category,
      description: block.description || `Saved reusable block based on ${definition?.label ?? block.componentId}.`,
      accentColor: definition?.accentColor ?? "#0ea5e9",
      componentId: block.componentId,
      isCustom: true,
      previewUrl: block.preview?.artifactUrl,
      visibility: block.visibility,
      canDelete: block.canDelete,
      canFeature: block.canFeature,
      canTransferOwnership: block.canTransferOwnership,
      ownerUserId: block.ownerUserId,
      isPinned: block.isPinned,
      isTeamFeatured: block.isTeamFeatured,
      isFavorite: block.isFavorite,
      usageCount: block.usageCount,
      lastUsedAt: block.lastUsedAt,
      savedAt: block.savedAt,
      canvasIntent: definition?.canvasIntent ?? "adaptive",
      mediaSlotCount: mediaProfile?.slotCount ?? 0,
      mediaSupportLabel: mediaProfile ? formatMediaSupportLabel(mediaProfile) : null,
      previewMediaZones: definition?.previewMediaZones ?? [],
      previewElements: previewComponent.fallbackElements,
      previewBackground: block.previewSource?.background,
      governanceEvents: block.governanceEvents ?? [],
    } as CustomBlockCard;
  }), [customBlocks]);
  const presetCards = useMemo<PresetBlockCard[]>(() => PRESENTATION_BLOCK_PRESETS.map((preset, index) => {
    const definition = getBuiltInPresentationComponentDefinition(preset.id);
    const mediaProfile = definition ? getBuiltInPresentationComponentMediaProfile(preset.id) : null;
    return {
      ...preset,
      componentId: preset.id,
      isCustom: false,
      presetIndex: index,
      previewBackground: undefined,
      governanceEvents: [],
      canvasIntent: definition?.canvasIntent ?? "adaptive",
      mediaSlotCount: mediaProfile?.slotCount ?? 0,
      mediaSupportLabel: mediaProfile ? formatMediaSupportLabel(mediaProfile) : null,
      previewMediaZones: definition?.previewMediaZones ?? [],
    } as PresetBlockCard;
  }), []);
  const allCards = useMemo(
    () => [...customCards, ...presetCards] as BlocksPanelCard[],
    [customCards, presetCards],
  );

  const categories = useMemo(
    () => ["All", ...new Set(allCards.map((preset) => preset.category))],
    [allCards],
  );

  useEffect(() => {
    onLibraryStateChange?.({ search, scope, activityFilter, sortOrder });
  }, [activityFilter, onLibraryStateChange, scope, search, sortOrder]);

  function getSortedGovernanceEvents(card: {
    governanceEvents?: Array<{ eventType?: string; detail?: string; recordedAt: string; actorRole?: string; actorUserId?: number }>;
  }): Array<{ eventType?: string; detail?: string; recordedAt: string; actorRole?: string; actorUserId?: number }> {
    return [...(card.governanceEvents ?? [])].sort((left, right) => {
      const leftTs = Date.parse(left.recordedAt) || 0;
      const rightTs = Date.parse(right.recordedAt) || 0;
      return rightTs - leftTs;
    });
  }

  function getLatestGovernanceTimestamp(card: {
    governanceEvents?: Array<{ recordedAt: string; actorRole?: string; actorUserId?: number }>;
  }): number {
    const latestEvent = getSortedGovernanceEvents(card)[0];
    return latestEvent ? Date.parse(latestEvent.recordedAt) || 0 : 0;
  }

  const filteredPresets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allCards.filter((preset) => {
      const matchesCategory = category === "All" || preset.category === category;
      const matchesCanvasIntent = canvasIntentFilter === "All"
        || (canvasIntentFilter === "Portrait Document" && preset.canvasIntent === "portrait-document")
        || (canvasIntentFilter === "Landscape 16:9" && preset.canvasIntent === "landscape-16:9")
        || (canvasIntentFilter === "Adaptive" && preset.canvasIntent === "adaptive");
      const matchesScope = scope === "All"
        || (scope === "Built-in" && !preset.isCustom)
        || (scope === "Mine" && preset.isCustom && preset.canDelete === true)
        || (scope === "Team" && preset.isCustom && preset.visibility === "team");
      const matchesQuery = !query
        || preset.label.toLowerCase().includes(query)
        || preset.description.toLowerCase().includes(query)
        || preset.category.toLowerCase().includes(query);
      const governanceEvents = preset.isCustom ? getSortedGovernanceEvents(preset) : [];
      const matchesActivity = activityFilter === "All"
        || (preset.isCustom && activityFilter === "Governed" && governanceEvents.length > 0)
        || (preset.isCustom && activityFilter === "Featured" && governanceEvents.some((event) => event.eventType === "featured_changed"))
        || (preset.isCustom && activityFilter === "Transferred" && governanceEvents.some((event) => event.eventType === "ownership_transferred"));
      return matchesCategory && matchesCanvasIntent && matchesScope && matchesQuery && matchesActivity;
    }).sort((left, right) => {
      if (sortOrder === "A-Z") {
        return left.label.localeCompare(right.label);
      }

      const leftTime = left.isCustom ? Date.parse(left.savedAt || "") || 0 : 0;
      const rightTime = right.isCustom ? Date.parse(right.savedAt || "") || 0 : 0;
      const leftGovernanceTime = left.isCustom ? getLatestGovernanceTimestamp(left) : 0;
      const rightGovernanceTime = right.isCustom ? getLatestGovernanceTimestamp(right) : 0;
      const leftFeatured = left.isCustom && left.isTeamFeatured === true;
      const rightFeatured = right.isCustom && right.isTeamFeatured === true;
      const leftPinned = left.isCustom && left.isPinned === true;
      const rightPinned = right.isCustom && right.isPinned === true;
      const leftFavorite = left.isCustom && left.isFavorite === true;
      const rightFavorite = right.isCustom && right.isFavorite === true;
      const leftUsageCount = left.isCustom ? Number(left.usageCount ?? 0) : 0;
      const rightUsageCount = right.isCustom ? Number(right.usageCount ?? 0) : 0;
      if (sortOrder === "Newest") {
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
        if (left.isCustom !== right.isCustom) {
          return left.isCustom ? -1 : 1;
        }
        return left.label.localeCompare(right.label);
      }
      if (sortOrder === "Most Used") {
        if (rightUsageCount !== leftUsageCount) {
          return rightUsageCount - leftUsageCount;
        }
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
        return left.label.localeCompare(right.label);
      }
      if (sortOrder === "Recent Activity") {
        if (rightGovernanceTime !== leftGovernanceTime) {
          return rightGovernanceTime - leftGovernanceTime;
        }
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
        return left.label.localeCompare(right.label);
      }

      if (left.isCustom !== right.isCustom) {
        return left.isCustom ? -1 : 1;
      }
      if (leftFeatured !== rightFeatured) {
        return leftFeatured ? -1 : 1;
      }
      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }
      if (leftFavorite !== rightFavorite) {
        return leftFavorite ? -1 : 1;
      }
      if (rightUsageCount !== leftUsageCount) {
        return rightUsageCount - leftUsageCount;
      }
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return (left.isCustom ? Number.MAX_SAFE_INTEGER : left.presetIndex) - (right.isCustom ? Number.MAX_SAFE_INTEGER : right.presetIndex);
    });
  }, [activityFilter, allCards, canvasIntentFilter, category, scope, search, sortOrder]);

  function getInsertAriaLabel(label: string): string {
    return label.trim().toLowerCase().endsWith("block")
      ? label
      : `${label} Block`;
  }

  function formatGovernanceEventLabel(card: {
    governanceEvents?: Array<{ eventType?: string; detail?: string; recordedAt: string; actorRole?: string; actorUserId?: number }>;
  }): string | null {
    const latestEvent = getSortedGovernanceEvents(card)[0];
    if (!latestEvent) {
      return null;
    }
    if (latestEvent.detail) {
      return latestEvent.detail;
    }
    switch (latestEvent.eventType) {
      case "featured_changed":
        return "Featured state updated";
      case "ownership_transferred":
        return "Ownership transferred";
      case "pinned_changed":
        return "Pinned state updated";
      case "visibility_changed":
        return "Visibility updated";
      default:
        return "Governance updated";
    }
  }

  function formatGovernanceEventTime(recordedAt: string): string {
    const parsed = Date.parse(recordedAt);
    if (!Number.isFinite(parsed)) {
      return recordedAt;
    }
    return new Date(parsed).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function toggleGovernanceTimeline(cardId: string) {
    setExpandedGovernanceCardIds((current) => (
      current.includes(cardId)
        ? current.filter((entry) => entry !== cardId)
        : [...current, cardId]
    ));
  }

  const teamGovernanceFeed = useMemo(() => (
    customCards
      .filter((card) => card.visibility === "team")
      .flatMap((card) => getSortedGovernanceEvents(card).map((event) => ({
        blockId: card.id,
        blockLabel: card.label,
        eventType: event.eventType,
        detail: event.detail,
        actorRole: event.actorRole,
        recordedAt: event.recordedAt,
      })))
      .filter((event) => {
        if (teamGovernanceFilter === "All") {
          return true;
        }
        if (teamGovernanceFilter === "Featured") {
          return event.eventType === "featured_changed";
        }
        if (teamGovernanceFilter === "Ownership") {
          return event.eventType === "ownership_transferred";
        }
        if (teamGovernanceFilter === "Pin") {
          return event.eventType === "pinned_changed";
        }
        return event.eventType === "visibility_changed";
      })
      .sort((left, right) => {
        const leftTs = Date.parse(left.recordedAt) || 0;
        const rightTs = Date.parse(right.recordedAt) || 0;
        return rightTs - leftTs;
      })
  ), [customCards, teamGovernanceFilter]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 text-slate-100">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search blocks..."
          className="border-slate-700 bg-slate-950/70 pl-8 text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Block Scope">
        {(["All", "Built-in", "Mine", "Team"] as const).map((nextScope) => {
          const active = scope === nextScope;
          return (
            <button
              key={nextScope}
              type="button"
              onClick={() => setScope(nextScope)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {nextScope}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Block Categories">
        {categories.map((nextCategory) => {
          const active = category === nextCategory;
          return (
            <button
              key={nextCategory}
              type="button"
              onClick={() => setCategory(nextCategory)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-sky-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {nextCategory}
            </button>
          );
        })}
        <label className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          <span>Sort</span>
          <select
            aria-label="Sort Blocks"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100"
          >
            <option value="Featured">Featured</option>
            <option value="Newest">Newest</option>
            <option value="A-Z">A-Z</option>
            <option value="Most Used">Most Used</option>
            <option value="Recent Activity">Recent Activity</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Canvas Intent Filters">
        {(["All", "Portrait Document", "Landscape 16:9", "Adaptive"] as const).map((nextIntent) => {
          const active = canvasIntentFilter === nextIntent;
          return (
            <button
              key={nextIntent}
              type="button"
              onClick={() => setCanvasIntentFilter(nextIntent)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-cyan-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {nextIntent}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Governance Filters">
        {(["All", "Governed", "Featured", "Transferred"] as const).map((nextFilter) => {
          const active = activityFilter === nextFilter;
          return (
            <button
              key={nextFilter}
              type="button"
              onClick={() => setActivityFilter(nextFilter)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-fuchsia-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {nextFilter}
            </button>
          );
        })}
      </div>

      {teamGovernanceFeed.length > 0 ? (
        <div
          className="rounded-lg border border-slate-700 bg-slate-900/80 p-3"
          data-testid="team-governance-panel"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Team Governance</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Recent governance activity across shared presets.
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-300">
              {teamGovernanceFeed.length} events
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Team Governance Timeline Filters">
            {(["All", "Featured", "Ownership", "Pin", "Visibility"] as const).map((nextFilter) => {
              const active = teamGovernanceFilter === nextFilter;
              return (
                <button
                  key={nextFilter}
                  type="button"
                  onClick={() => setTeamGovernanceFilter(nextFilter)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-cyan-500 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {nextFilter}
                </button>
              );
            })}
          </div>
          <div
            className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1"
            data-testid="team-governance-feed"
          >
            {teamGovernanceFeed.slice(0, 8).map((event, index) => (
              <div
                key={`${event.blockId}-${event.recordedAt}-${index}`}
                className="rounded border border-slate-700 bg-slate-950/70 px-2 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-slate-100">{event.blockLabel}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{formatGovernanceEventTime(event.recordedAt)}</span>
                </div>
                <p className="mt-1 text-[10px] text-slate-300">
                  {event.detail ?? formatGovernanceEventLabel({ governanceEvents: [event] }) ?? "Governance updated"}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                  {event.actorRole}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        data-testid="blocks-panel-scroll-area"
      >
        {filteredPresets.length === 0 ? (
          <p className="text-sm text-slate-400">No blocks found.</p>
        ) : (
          <div className="space-y-2">
            {filteredPresets.map((preset) => (
              <div key={preset.id} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/80 shadow-sm">
                <div className="h-1.5 w-full" style={{ backgroundColor: preset.accentColor }} />
                <div className="space-y-3 p-3">
                  {preset.isCustom && preset.previewUrl ? (
                    <div
                      className="relative overflow-hidden rounded-md border border-slate-700 bg-slate-950/80"
                      data-testid={`block-preview-${preset.id}`}
                      aria-hidden="true"
                    >
                      <img
                        src={preset.previewUrl}
                        alt=""
                        className="aspect-[16/9] w-full object-cover"
                        loading="lazy"
                      />
                      {preset.previewMediaZones.length > 0 ? (
                        <div className="pointer-events-none absolute inset-0">
                          {preset.previewMediaZones.map((zone) => (
                            <div
                              key={`${preset.id}-${zone.label}-${zone.x}-${zone.y}`}
                              className={`absolute rounded border ${getMediaZoneClasses(zone.slotType)}`}
                              style={{
                                left: `${zone.x}%`,
                                top: `${zone.y}%`,
                                width: `${zone.width}%`,
                                height: `${zone.height}%`,
                              }}
                            >
                              <span className="absolute left-1 top-1 rounded bg-emerald-950/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-100">
                                {zone.label}
                              </span>
                              <span className="absolute bottom-1 right-1 rounded bg-slate-950/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                                {formatMediaZoneTypeLabel(zone.slotType)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : getBuiltInPresentationComponentDefinition(preset.id)?.previewSvg ? (
                    preset.isCustom ? (
                      <SlideElementPreview
                        elements={Array.from(preset.previewElements)}
                        canvasSize={DEFAULT_PRESENTATION_CANVAS_SIZE}
                        background={preset.previewBackground}
                        testId={`block-preview-${preset.id}`}
                        className="border-slate-700 bg-slate-950/80"
                      />
                    ) : (
                      <div
                        className="relative overflow-hidden rounded-md border border-slate-700 bg-slate-950/80 p-2"
                        data-testid={`block-preview-${preset.id}`}
                        aria-hidden="true"
                      >
                        <div
                          className="aspect-[16/9] w-full [&>svg]:h-full [&>svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(getBuiltInPresentationComponentDefinition(preset.id)?.previewSvg ?? "", { USE_PROFILES: { svg: true, svgFilters: true } }) }}
                        />
                        {preset.previewMediaZones.length > 0 ? (
                          <div className="pointer-events-none absolute inset-2">
                            {preset.previewMediaZones.map((zone) => (
                              <div
                                key={`${preset.id}-${zone.label}-${zone.x}-${zone.y}`}
                                className={`absolute rounded border ${getMediaZoneClasses(zone.slotType)}`}
                                style={{
                                  left: `${zone.x}%`,
                                  top: `${zone.y}%`,
                                  width: `${zone.width}%`,
                                  height: `${zone.height}%`,
                                }}
                              >
                                <span className="absolute left-1 top-1 rounded bg-emerald-950/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-100">
                                  {zone.label}
                                </span>
                                <span className="absolute bottom-1 right-1 rounded bg-slate-950/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                                  {formatMediaZoneTypeLabel(zone.slotType)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : preset.isCustom ? (
                    <SlideElementPreview
                      elements={Array.from(preset.previewElements)}
                      canvasSize={DEFAULT_PRESENTATION_CANVAS_SIZE}
                      testId={`block-preview-${preset.id}`}
                      className="border-slate-700 bg-slate-950/80"
                    />
                  ) : null}
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-950"
                      style={{ color: preset.accentColor }}
                    >
                      <LayoutTemplate className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-100">{preset.label}</p>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          {preset.category}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          preset.canvasIntent === "portrait-document"
                            ? "bg-cyan-900/70 text-cyan-200"
                            : preset.canvasIntent === "landscape-16:9"
                              ? "bg-amber-900/70 text-amber-200"
                              : "bg-slate-800 text-slate-300"
                        }`}>
                          {formatCanvasIntentLabel(preset.canvasIntent)}
                        </span>
                        {preset.mediaSlotCount > 0 ? (
                          <span className="rounded-full bg-emerald-900/70 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                            {preset.mediaSlotCount} media
                          </span>
                        ) : null}
                        {preset.mediaSupportLabel ? (
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                            {preset.mediaSupportLabel}
                          </span>
                        ) : null}
                        {preset.isCustom ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            preset.visibility === "team"
                              ? "bg-emerald-900/70 text-emerald-200"
                              : "bg-slate-800 text-slate-300"
                          }`}>
                            {preset.visibility === "team" ? "Team" : "Mine"}
                          </span>
                        ) : null}
                        {preset.isCustom && preset.isPinned ? (
                          <span className="rounded-full bg-amber-900/70 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                            Pinned
                          </span>
                        ) : null}
                        {preset.isCustom && preset.isTeamFeatured ? (
                          <span className="rounded-full bg-sky-900/70 px-2 py-0.5 text-[10px] font-medium text-sky-200">
                            Featured
                          </span>
                        ) : null}
                        {preset.isCustom && preset.isFavorite ? (
                          <span className="rounded-full bg-fuchsia-900/70 px-2 py-0.5 text-[10px] font-medium text-fuchsia-200">
                            Favorite
                          </span>
                        ) : null}
                        {preset.isCustom ? (
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                            Used {preset.usageCount ?? 0}x
                          </span>
                        ) : null}
                        {preset.isCustom && onToggleTeamFeaturedCustomBlock && preset.visibility === "team" && preset.canFeature ? (
                          <button
                            type="button"
                            className={`ml-auto grid h-6 w-6 place-items-center rounded border bg-slate-950 hover:border-sky-500 hover:text-sky-300 ${
                              preset.isTeamFeatured
                                ? "border-sky-500 text-sky-300"
                                : "border-slate-700 text-slate-300"
                            }`}
                            aria-label={`${preset.isTeamFeatured ? "Unfeature" : "Feature"} ${getInsertAriaLabel(preset.label)}`}
                            data-testid={`feature-custom-block-${preset.id}`}
                            onClick={() => onToggleTeamFeaturedCustomBlock(preset.id, !preset.isTeamFeatured)}
                          >
                            <Sparkles className={`h-3.5 w-3.5 ${preset.isTeamFeatured ? "fill-current" : ""}`} />
                          </button>
                        ) : null}
                        {preset.isCustom && onToggleFavoriteCustomBlock ? (
                          <button
                            type="button"
                            className={`grid h-6 w-6 place-items-center rounded border bg-slate-950 hover:border-fuchsia-500 hover:text-fuchsia-300 ${
                              preset.isFavorite
                                ? "border-fuchsia-500 text-fuchsia-300"
                                : "border-slate-700 text-slate-300"
                            }`}
                            aria-label={`${preset.isFavorite ? "Unfavorite" : "Favorite"} ${getInsertAriaLabel(preset.label)}`}
                            data-testid={`favorite-custom-block-${preset.id}`}
                            onClick={() => onToggleFavoriteCustomBlock(preset.id, !preset.isFavorite)}
                          >
                            <Star className={`h-3.5 w-3.5 ${preset.isFavorite ? "fill-current" : ""}`} />
                          </button>
                        ) : null}
                        {preset.isCustom && onTogglePinCustomBlock && preset.canDelete ? (
                          <button
                            type="button"
                            className={`grid h-6 w-6 place-items-center rounded border bg-slate-950 hover:border-amber-500 hover:text-amber-300 ${
                              preset.isPinned
                                ? "border-amber-500 text-amber-300"
                                : "border-slate-700 text-slate-300"
                            }`}
                            aria-label={`${preset.isPinned ? "Unpin" : "Pin"} ${getInsertAriaLabel(preset.label)}`}
                            data-testid={`pin-custom-block-${preset.id}`}
                            onClick={() => onTogglePinCustomBlock(preset.id, !preset.isPinned)}
                          >
                            <Pin className={`h-3.5 w-3.5 ${preset.isPinned ? "fill-current" : ""}`} />
                          </button>
                        ) : null}
                        {preset.isCustom && onTransferCustomBlockOwner && preset.canTransferOwnership ? (
                          <button
                            type="button"
                            className="grid h-6 w-6 place-items-center rounded border border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-500 hover:text-cyan-300"
                            aria-label={`Transfer Owner ${getInsertAriaLabel(preset.label)}`}
                            data-testid={`transfer-custom-block-${preset.id}`}
                            onClick={() => {
                              const raw = window.prompt("Transfer block to user ID");
                              const nextOwnerUserId = Number(raw);
                              if (!Number.isInteger(nextOwnerUserId) || nextOwnerUserId <= 0) {
                                return;
                              }
                              onTransferCustomBlockOwner(preset.id, nextOwnerUserId);
                            }}
                          >
                            <UserRound className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {preset.isCustom && preset.canDelete && onDeleteCustomBlock ? (
                          <button
                            type="button"
                            className="grid h-6 w-6 place-items-center rounded border border-slate-700 bg-slate-950 text-slate-300 hover:border-rose-500 hover:text-rose-300"
                            aria-label={`Delete ${getInsertAriaLabel(preset.label)}`}
                            data-testid={`delete-custom-block-${preset.id}`}
                            onClick={() => onDeleteCustomBlock(preset.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{preset.description}</p>
                      {preset.isCustom && formatGovernanceEventLabel(preset) ? (
                        <div className="mt-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500" data-testid={`custom-block-governance-${preset.id}`}>
                              Governance: {formatGovernanceEventLabel(preset)}
                            </p>
                            {preset.governanceEvents.length > 0 ? (
                              <button
                                type="button"
                                className="text-[10px] font-medium text-sky-300 hover:text-sky-200"
                                aria-label={`${expandedGovernanceCardIds.includes(preset.id) ? "Hide" : "Show"} governance timeline for ${getInsertAriaLabel(preset.label)}`}
                                data-testid={`toggle-governance-timeline-${preset.id}`}
                                onClick={() => toggleGovernanceTimeline(preset.id)}
                              >
                                {expandedGovernanceCardIds.includes(preset.id) ? "Hide activity" : "Show activity"}
                              </button>
                            ) : null}
                          </div>
                          {expandedGovernanceCardIds.includes(preset.id) ? (
                            <div
                              className="rounded border border-slate-700 bg-slate-950/70 px-2 py-2"
                              data-testid={`governance-timeline-${preset.id}`}
                            >
                              <div className="space-y-1.5">
                                {getSortedGovernanceEvents(preset).slice(0, 3).map((event, index) => (
                                  <div key={`${preset.id}-governance-${index}-${event.recordedAt}`} className="text-[10px] text-slate-400">
                                    <span className="font-medium text-slate-200">{formatGovernanceEventLabel({ governanceEvents: [event] })}</span>
                                    {" · "}
                                    {formatGovernanceEventTime(event.recordedAt)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(preset.isCustom ? onInsertCustomBlock : onInsertComponent) ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 w-full gap-1 bg-sky-600 text-xs text-white hover:bg-sky-500"
                        aria-label={`Insert Editable ${getInsertAriaLabel(preset.label)}`}
                        onClick={() => {
                          if (preset.isCustom) {
                            onInsertCustomBlock?.(preset.id);
                            return;
                          }
                          onInsertComponent?.(preset.id as BuiltInPresentationComponentId);
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Insert Editable
                      </Button>
                    ) : null}
                    {!preset.isCustom ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full border-slate-700 bg-slate-950 text-xs text-slate-100 hover:bg-slate-800"
                        aria-label={`Insert ${getInsertAriaLabel(preset.label)}`}
                        onClick={() => onInsertPreset(preset.id)}
                      >
                        Insert As Elements
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
