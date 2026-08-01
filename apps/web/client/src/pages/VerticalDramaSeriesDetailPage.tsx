/**
 * VerticalDramaSeriesDetailPage (spec feature 131, section 03 · §8.3).
 *
 * Tabbed series workspace — every tab (Overview/Episodes/Bible/Characters/
 * Memory/Product/Assets/Settings) is always reachable so the user can jump
 * around to inspect what each tab already has vs. what still needs filling
 * in; tabs whose group has no content yet show a small "needs attention"
 * indicator rather than being hidden.
 *
 * Reversible via `AppPage`'s breadcrumbs (Series list → this series).
 * Consumes the base series router `trpc.verticalDramaSeries.get`.
 */

import { useMemo, useRef, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { toast } from "sonner";
import {
  Clapperboard,
  Copy,
  Download,
  Expand,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { VerticalDramaCharacterStockPanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import { VerticalDramaLocationStockPanel } from "@/components/verticalDramaSeries/VerticalDramaLocationStockPanel";
import { VerticalDramaSeriesTrailerPanel } from "@/components/verticalDramaSeries/VerticalDramaSeriesTrailerPanel";
// Production Episodes panel (Phase D′-1,
// `planning/vertical-drama-production-episodes/plan.md`) — the public
// deliverable surface (groups of 5/10 Sub-episodes concatenated into one
// 4-10 min video), distinct from the per-Sub-episode workspace this page's
// own "episodes" tab already links out to.
import { VerticalDramaProductionEpisodesPanel } from "@/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel";
import { VerticalDramaShell } from "@/components/verticalDramaSeries/VerticalDramaShell";
import { VerticalDramaSettingsTab } from "@/components/verticalDramaSeries/VerticalDramaSettingsTab";
import { VerticalDramaProductTieInTab } from "@/components/verticalDramaSeries/VerticalDramaProductTieInTab";
import { VerticalDramaAssetsTab } from "@/components/verticalDramaSeries/VerticalDramaAssetsTab";
import { VerticalDramaSeriesMemoryTab } from "@/components/verticalDramaSeries/VerticalDramaSeriesMemoryTab";
import { VerticalDramaSeriesMemoryStateTab } from "@/components/verticalDramaSeries/VerticalDramaSeriesMemoryStateTab";
import { VerticalDramaSeriesShareDialog } from "@/components/verticalDramaSeries/VerticalDramaSeriesShareDialog";
import { getActiveBreakdownItemsForDisplay } from "@/components/verticalDramaSeries/VerticalDramaArcReplanCard";
import {
  buildStoryScriptText,
  STORY_SCRIPT_TEXT_CHAR_LIMIT,
  type StoryScriptEpisodeInput,
} from "@shared/verticalDramaSeries/storyScriptText";
import {
  VerticalDramaDeepStoryDraftEpisodeDetail,
  VerticalDramaDeepStoryDraftsActions,
  readDeepDraftShotDrafts,
  type VerticalDramaDeepDraftSummary,
} from "@/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel";
import {
  editSynopsisSavedSuccessText,
  pickCopy,
  seriesStatusCopy,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
/**
 * Task #22 (season-level product tie-in draft awareness, added 2026-07-09) —
 * own STANDALONE copy module (see that file's own header doc comment).
 * Aliased `pickCopy` to avoid colliding with `verticalDramaCopy.ts`'s own
 * `pickCopy` already imported above — both are structurally
 * `(lang: "th" | "en", value) => value[lang]`, so calling either with this
 * page's own `lang` works without a cast.
 */
import {
  pickCopy as pickTieInDraftCopy,
  verticalDramaTieInDraftCopy,
} from "@/components/verticalDramaSeries/verticalDramaTieInDraftCopy";
/**
 * Task #21 / W12.5 "Final Render Suite" phase B (season batch render,
 * added 2026-07-09) — this page otherwise uses `verticalDramaCopy.ts`'s
 * `pickCopy(lang, verticalDramaCopy.X)` convention exclusively, but the
 * season-render dialog reuses the SAME subtitle-preset labels + option
 * copy the per-episode workspace section already defines in
 * `verticalDramaWorkspaceCopy.ts` (owned by this same wave) — importing it
 * here (rather than duplicating 9 preset names + option copy a second time
 * in `verticalDramaCopy.ts`, which this wave does not own) is the least-
 * invasive option, and `VerticalDramaEpisodePage.tsx` already establishes
 * the precedent of a page importing from BOTH copy modules at once.
 */
import {
  VD_FINAL_RENDER_SUBTITLE_PRESET_IDS,
  vdCopy,
  vdCopyWithParams,
  vdFinalRenderSubtitlePresetLabel,
  vdSeasonRenderSkipReasonLabel,
  type VdFinalRenderSubtitlePresetValue,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
// Text Overlay Suite (F131AB, task #34) — same "import from BOTH copy
// modules" precedent this file's own doc comment above already establishes.
import { vdTextOverlayCopy } from "@/components/verticalDramaSeries/verticalDramaTextOverlayCopy";

type TabId =
  | "overview"
  | "characters"
  | "scenes"
  | "episodes"
  | "production"
  | "bible"
  | "seriesMemory"
  | "memory"
  | "product"
  | "assets"
  | "settings";

// Character-variants plan (planning/vertical-drama-character-variants/plan.md,
// Phase A) — "characters" moved before "episodes": character (and character
// variant) planning must exist before episode/storyboard generation can
// reference the right look, so the tab order should guide the user through
// the workflow in that sequence.
// Location Visual Bible (dedicated tab, mirrors the Characters tab) —
// "scenes" inserted right after "characters" for the same reason: location
// references should be planned before episode/storyboard generation
// consumes them.
const ALL_TABS: TabId[] = [
  "overview",
  "characters",
  "scenes",
  "episodes",
  "production",
  "bible",
  "seriesMemory",
  "memory",
  "product",
  "assets",
  "settings",
];
const STORY_TABS: TabId[] = [
  "bible",
  "characters",
  "scenes",
  "seriesMemory",
  "memory",
];
const ADVANCED_TABS: TabId[] = ["product", "assets", "settings"];

const tabLabels: Record<TabId, { th: string; en: string }> = {
  overview: { th: "ภาพรวม", en: "Overview" },
  episodes: { th: "ตอนย่อย", en: "Sub-episodes" },
  // Production Episodes (Phase D′-1) — the public deliverable surface,
  // deliberately NOT part of `STORY_TABS`/`ADVANCED_TABS` (so it never gets
  // a "needs attention" dot), same precedent as "episodes" itself above.
  production: { th: "ตอนเต็ม (Production)", en: "Production" },
  bible: { th: "ไบเบิล", en: "Bible" },
  characters: { th: "ตัวละคร", en: "Characters" },
  scenes: { th: "ฉาก", en: "Locations" },
  // Stage 1.4 (`planning/vd-series-memory-and-lineage/plan.md`) added the
  // NEW `seriesMemory` tab (reads/edits `VdSeriesMemory`, the materialized
  // relationships/open-threads/episode-timeline projection) as the primary
  // "read this and understand the whole story" surface. The PRE-EXISTING
  // `memory` tab (durable append-only event log, `listMemoryEvents`) is
  // relabeled here so the two tabs don't show an identical name — it keeps
  // its own TabId/behavior untouched, only this visible label changes.
  seriesMemory: { th: "ความจำซีรีย์", en: "Series Memory" },
  memory: { th: "บันทึกเหตุการณ์", en: "Event Log" },
  product: { th: "สินค้าผูกเรื่อง", en: "Product Tie-in" },
  assets: { th: "แอสเซ็ต", en: "Assets" },
  settings: { th: "ตั้งค่า", en: "Settings" },
};

/**
 * Resolve the tab this page should open on, from the URL's `?tab=` query
 * param (W12-B voice chain wave — lets another surface, e.g. the episode
 * Dialogue/Audio panel's missing-casting banner, deep-link straight to the
 * Characters tab via `` `${verticalDramaRoutes.seriesDetail(seriesId)}?tab=characters` ``).
 * Falls back to `"overview"` (the pre-existing default) for a missing/
 * unrecognized/empty value — pure, exported for direct unit testing, same
 * convention as `VerticalDramaEpisodePage.tsx`'s `shouldResumeVideoClipPoll`.
 */
export function resolveInitialSeriesTab(search: string): TabId {
  const requested = new URLSearchParams(search).get("tab");
  return requested && (ALL_TABS as readonly string[]).includes(requested)
    ? (requested as TabId)
    : "overview";
}

export default function VerticalDramaSeriesDetailPage() {
  const lang = useVerticalDramaLang();
  const [, params] = useRoute("/drama-series/:seriesId");
  const seriesId = params?.seriesId ?? "";
  const search = useSearch();
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    resolveInitialSeriesTab(search)
  );
  // W10-C (spec F131T) — resolved once here and passed down as a prop so
  // `StoryBibleOverviewCard` (and the deep-draft child components it
  // conditionally mounts) stay fully prop-driven; flag off -> those children
  // never mount, so the Overview tab renders byte-identical to today.
  const deepDraftsFlagEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesDeepStoryDrafts"
  );
  // W12-B voice chain wave — gates the Characters tab's per-character voice
  // casting card (`VerticalDramaCharacterVoiceCastingCard`, mounted from
  // `VerticalDramaCharacterStockPanel.tsx`). Same fail-closed convention as
  // `deepDraftsFlagEnabled` above.
  const voiceChainEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesVoiceChain"
  );
  // Task #32 (Collab-lite L1, added 2026-07-09) — gates ONLY the "แชร์ซีรีส์"
  // header button (`VerticalDramaSeriesShareDialog` self-gates on this prop,
  // same convention as `deepDraftsFlagEnabled` above). The public viewer
  // route (`/share/vd/:token`) is intentionally NOT gated by this flag —
  // see `routers/verticalDramaShare.ts`'s own doc comment for why.
  const shareLinksEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesShareLinks"
  );
  // Text Overlay Suite (F131AB, task #34) — gates the Settings tab's series
  // watermark card + the season batch render dialog's text-overlay/watermark
  // toggles below. Same fail-closed convention as `deepDraftsFlagEnabled`.
  const textOverlaySuiteEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesTextOverlaySuite"
  );
  const seriesLookLockEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesLookLock"
  );
  // F132F (spec 132 §7.3/§10.1, added 2026-07-09) — gates the Characters
  // tab's speech-profile editing sub-section
  // (`VerticalDramaCharacterStockPanel.tsx`) and the voice-casting card's
  // "prefill from speech profile" suggestion action. Same fail-closed
  // convention as `voiceChainEnabled` above.
  const characterProfilesEnabled = useTenantFeatureFlag(
    "verticalDramaCharacterProfiles"
  );

  const detailQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 30_000 }
  );

  const series = detailQuery.data?.series as
    | {
        id: string;
        title: string;
        status: string;
        bible?: unknown;
        memory?: unknown;
        genre?: string | null;
        tone?: string | null;
        targetAudience?: string | null;
        targetEpisodeCount?: number | null;
        defaultEpisodeDurationSeconds?: number | null;
        locale?: string | null;
        productTieIn?: {
          enabled?: boolean;
          productName?: string;
          productId?: string;
          productImageUrl?: string;
          forbiddenClaims?: string[];
          [key: string]: unknown;
        } | null;
        /** W10-C (spec F131T) — additive, `null` when no episode has a deep draft yet. */
        deepDraftSummary?: VerticalDramaDeepDraftSummary | null;
        /** Text Overlay Suite (F131AB, task #34) — `null` when no watermark
         *  has been configured yet. Passed through `get`'s full-row spread
         *  (`...row`), no server-side change needed for this new column. */
        watermark?: unknown;
        /** Manual LLM model override (added 2026-07-11 — see
         *  `/home/dev/.claude/plans/polished-toasting-gadget.md`) — `null`
         *  when unset (fully automatic). Passed through `get`'s full-row
         *  spread, no server-side change needed for this new column. */
        llmModelPolicy?: unknown;
        /** Series lineage (Stage 2.6) — raw DB columns, passed through
         *  `get`'s full-row spread. `null`/absent for the overwhelming
         *  majority (original-mode series). Read here only to derive
         *  `isLineageSeries` below (extend-deep-draft premium default). */
        createMode?: string | null;
        parentSeriesId?: number | string | null;
      }
    | undefined;
  const episodes = (detailQuery.data?.episodes ?? []) as Array<{
    id: string;
    episodeNumber: number;
    title?: string | null;
    status: string;
    thumbnailUrl?: string | null;
    updatedAt?: Date | string | null;
    /** Compact compiled-video player on the Episodes tab card — present +
     *  non-null ONLY when a completed full-episode render exists. */
    compiledVideo?: {
      videoUrl: string;
      status: string;
      durationSeconds?: number;
    } | null;
  }>;

  // All 8 tabs are always reachable; these flags only drive a "needs
  // attention" indicator on the tabs whose group has no content yet, so the
  // user can see at a glance what's filled in vs. what still needs work.
  const storyPopulated = Boolean(
    series?.bible || series?.memory || episodes.length > 0
  );
  const advancedPopulated = Boolean(series?.productTieIn?.enabled);
  const isArchived = series?.status === "archived";
  // Extend deep-draft premium default (mirrors the server's own sequel-aware
  // default in `extendStoryDraftHorizon` — `routers/verticalDramaSeries.ts`):
  // a lineage series (sequel/special edition) should default the extend
  // checkbox to premium so continuity-checking actually runs, instead of
  // silently defaulting via server-side omission while the UI shows
  // unchecked. `parentSeriesId != null` is the same lineage signal the
  // server keys off of; `createMode` is checked too since it's the more
  // explicit field when both are present.
  const isLineageSeries =
    series?.createMode === "sequel" ||
    series?.createMode === "special_edition" ||
    series?.parentSeriesId != null;

  const needsAttention = useMemo<Partial<Record<TabId, boolean>>>(() => {
    const flags: Partial<Record<TabId, boolean>> = {};
    for (const tab of STORY_TABS) flags[tab] = !storyPopulated;
    for (const tab of ADVANCED_TABS) flags[tab] = !advancedPopulated;
    return flags;
  }, [storyPopulated, advancedPopulated]);

  const pageState: AppPageState = detailQuery.isLoading
    ? "loading"
    : detailQuery.isError || !series
      ? "error"
      : "ready";

  const pageTitle = detailQuery.isLoading
    ? pickCopy(lang, verticalDramaCopy.loading)
    : detailQuery.isError || !series
      ? pickCopy(lang, verticalDramaCopy.errorTitle)
      : series.title;

  const statusLabel = series
    ? seriesStatusCopy[series.status as VerticalDramaSeriesStatus] != null
      ? pickCopy(
          lang,
          seriesStatusCopy[series.status as VerticalDramaSeriesStatus]
        )
      : series.status
    : undefined;

  return (
    <VerticalDramaShell currentSeriesId={seriesId}>
      <AppPage
        title={pageTitle}
        breadcrumbs={[
          {
            label: pickCopy(lang, verticalDramaCopy.menuTitle),
            href: verticalDramaRoutes.seriesList(),
          },
          { label: pageTitle },
        ]}
        actions={
          <VerticalDramaSeriesShareDialog
            lang={lang}
            enabled={shareLinksEnabled}
            seriesId={seriesId}
          />
        }
        state={pageState}
        loadingSkeleton={
          <div className="grid gap-4" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
        error={{
          title: pickCopy(lang, verticalDramaCopy.errorTitle),
          description: detailQuery.error?.message,
          onRetry: () => detailQuery.refetch(),
        }}
      >
        {series ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge>{statusLabel}</Badge>
              {isArchived && (
                <Badge variant="outline">
                  {pickCopy(lang, verticalDramaCopy.readOnly)}
                </Badge>
              )}
            </div>

            <Tabs
              value={activeTab}
              onValueChange={v => setActiveTab(v as TabId)}
            >
              <TabsList className="flex-wrap">
                {ALL_TABS.map(tab => (
                  <TabsTrigger key={tab} value={tab} className="gap-1.5">
                    {pickCopy(lang, tabLabels[tab])}
                    {needsAttention[tab] ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                        aria-label={
                          lang === "th" ? "ยังไม่มีข้อมูล" : "Needs attention"
                        }
                        title={
                          lang === "th" ? "ยังไม่มีข้อมูล" : "Needs attention"
                        }
                      />
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {lang === "th"
                        ? "การกระทำถัดไปที่ปลอดภัย"
                        : "Next safe action"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {episodes.length === 0
                      ? lang === "th"
                        ? "ยังไม่มีตอนย่อย — เพิ่มตอนย่อยแรกเพื่อเริ่มวางแผน (ยังไม่มีค่าใช้จ่าย)"
                        : "No Sub-episodes yet — add the first Sub-episode to start planning (no paid generation)."
                      : lang === "th"
                        ? "เปิดตอนย่อยล่าสุดเพื่อดำเนินการขั้นต่อไป"
                        : "Open the latest Sub-episode to continue to the next stage."}
                  </CardContent>
                </Card>

                <StoryBibleOverviewCard
                  lang={lang}
                  seriesId={seriesId}
                  seriesTitle={series.title}
                  bible={series.bible}
                  genre={series.genre}
                  tone={series.tone}
                  targetEpisodeCount={series.targetEpisodeCount}
                  readOnly={isArchived}
                  onViewEpisodes={() => setActiveTab("episodes")}
                  onEpisodesGenerated={() => detailQuery.refetch()}
                  onEditPremiseClick={() => setActiveTab("settings")}
                  deepDraftsFlagEnabled={deepDraftsFlagEnabled}
                  deepDraftSummary={series.deepDraftSummary}
                  createdEpisodeNumbers={episodes.map(
                    episode => episode.episodeNumber
                  )}
                  isLineageSeries={isLineageSeries}
                />

                {!isArchived && (
                  <SaveAsPresetCard
                    lang={lang}
                    seriesId={seriesId}
                    seriesTitle={series.title}
                  />
                )}
              </TabsContent>

              <TabsContent value="episodes" className="pt-4">
                <EpisodesTab
                  lang={lang}
                  seriesId={seriesId}
                  episodes={episodes}
                  readOnly={isArchived}
                  targetEpisodeCount={series.targetEpisodeCount ?? undefined}
                />
              </TabsContent>

              {/* Production Episodes (Phase D′-1,
                  `planning/vertical-drama-production-episodes/plan.md`) — a
                  dedicated tab (not a section under "episodes") for clarity:
                  this groups 5/10 Sub-episodes into ONE publishable 4-10 min
                  video, a materially different action from the Sub-episode
                  workspace the "episodes" tab links out to. Self-contained
                  panel (own `verticalDramaSeries.get` query), same
                  `{ seriesId, readOnly }` prop contract as
                  `VerticalDramaLocationStockPanel`. */}
              <TabsContent value="production" className="pt-4">
                <VerticalDramaProductionEpisodesPanel
                  seriesId={seriesId}
                  readOnly={isArchived}
                />
              </TabsContent>

              {STORY_TABS.concat(ADVANCED_TABS).map(tab => (
                <TabsContent key={tab} value={tab} className="pt-4">
                  {tab === "characters" ? (
                    <VerticalDramaCharacterStockPanel
                      seriesId={seriesId}
                      readOnly={isArchived}
                      voiceChainEnabled={voiceChainEnabled}
                      characterProfilesEnabled={characterProfilesEnabled}
                    />
                  ) : tab === "scenes" ? (
                    <VerticalDramaLocationStockPanel
                      seriesId={seriesId}
                      readOnly={isArchived}
                    />
                  ) : tab === "bible" ? (
                    <StoryBibleTab
                      lang={lang}
                      seriesId={seriesId}
                      locale={series.locale}
                      bible={series.bible}
                      readOnly={isArchived}
                    />
                  ) : tab === "seriesMemory" ? (
                    <VerticalDramaSeriesMemoryStateTab
                      lang={lang}
                      seriesId={seriesId}
                      readOnly={isArchived}
                    />
                  ) : tab === "memory" ? (
                    <VerticalDramaSeriesMemoryTab
                      lang={lang}
                      seriesId={seriesId}
                      readOnly={isArchived}
                    />
                  ) : tab === "settings" ? (
                    <VerticalDramaSettingsTab
                      lang={lang}
                      seriesId={seriesId}
                      title={series.title}
                      status={series.status}
                      genre={series.genre}
                      tone={series.tone}
                      targetAudience={series.targetAudience}
                      targetEpisodeCount={series.targetEpisodeCount}
                      defaultEpisodeDurationSeconds={
                        series.defaultEpisodeDurationSeconds
                      }
                      locale={series.locale}
                      bible={series.bible}
                      llmModelPolicy={series.llmModelPolicy}
                      readOnly={isArchived}
                      onSaved={() => detailQuery.refetch()}
                      textOverlaySuiteEnabled={textOverlaySuiteEnabled}
                      lookLockEnabled={seriesLookLockEnabled}
                      watermark={series.watermark}
                    />
                  ) : tab === "product" ? (
                    <VerticalDramaProductTieInTab
                      lang={lang}
                      seriesId={seriesId}
                      productTieIn={series.productTieIn}
                      readOnly={isArchived}
                      onSaved={() => detailQuery.refetch()}
                    />
                  ) : tab === "assets" ? (
                    <VerticalDramaAssetsTab lang={lang} seriesId={seriesId} />
                  ) : (
                    <PlaceholderTab
                      lang={lang}
                      label={pickCopy(lang, tabLabels[tab])}
                      readOnly={isArchived}
                    />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </>
        ) : null}
      </AppPage>
    </VerticalDramaShell>
  );
}

/** Exported (2026-07-09, task #21 phase B) so the season batch render button
 *  + dialog can be covered by direct, isolated render tests — same "export
 *  the sub-component for direct testing" convention as `StoryBibleOverviewCard`
 *  below. */
export function EpisodesTab({
  lang,
  seriesId,
  episodes,
  readOnly,
  targetEpisodeCount,
}: {
  lang: "th" | "en";
  seriesId: string;
  episodes: Array<{
    id: string;
    episodeNumber: number;
    title?: string | null;
    status: string;
    thumbnailUrl?: string | null;
    updatedAt?: Date | string | null;
    /** Compact compiled-video player on the Episodes tab card — present +
     *  non-null ONLY when a completed full-episode render exists. */
    compiledVideo?: {
      videoUrl: string;
      status: string;
      durationSeconds?: number;
    } | null;
  }>;
  readOnly: boolean;
  /** Series' configured planned Sub-episode count (Settings tab), used to
   *  compute how many slots remain and offer an "All remaining (N)" bulk
   *  option in the add-episodes dropdown below (task: bulk sub-episode
   *  slot creation, `planning/vertical-drama-scene-dedup-bulk-slots/plan.md`). */
  targetEpisodeCount?: number | null;
}) {
  const utils = trpc.useUtils();
  const t = vdCopy(lang);
  /* ---- Task #21 / W12.5 "Final Render Suite" phase B — season batch
   *  render (added 2026-07-09). Same direct `useTenantFeatureFlag` gate as
   *  this page's own `voiceChainEnabled` (used a few lines up the tree for
   *  `VerticalDramaCharacterStockPanel`) — gates ONLY the dialog's dialogue-
   *  audio checkbox; plain concat + subtitles work without the flag, so the
   *  button/dialog themselves are never gated on it (owner-specified: "do
   *  not gate on F131U"). */
  const seasonVoiceChainEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesVoiceChain"
  );
  // Text Overlay Suite (F131AB, task #34) — same direct `useTenantFeatureFlag`
  // gate convention as `seasonVoiceChainEnabled` above; gates ONLY the
  // dialog's two toggles (batch render itself is never gated on this flag).
  const seasonTextOverlaySuiteEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesTextOverlaySuite"
  );
  const tOverlay = vdTextOverlayCopy(lang);
  const episodeNumberById = useMemo(
    () => new Map(episodes.map(ep => [ep.id, ep.episodeNumber])),
    [episodes]
  );
  const [seasonRenderDialogOpen, setSeasonRenderDialogOpen] = useState(false);
  const [
    seasonRenderIncludeDialogueAudio,
    setSeasonRenderIncludeDialogueAudio,
  ] = useState(false);
  const [seasonRenderLoudnessNormalize, setSeasonRenderLoudnessNormalize] =
    useState(false);
  const [seasonRenderSubtitlePreset, setSeasonRenderSubtitlePreset] =
    useState<VdFinalRenderSubtitlePresetValue>("classic_box");
  // Text Overlay Suite (F131AB, task #34, plan.md v2 "batch season render:
  // toggle รวม") — default ON (each toggle represents "include", checked by
  // default), mirroring the server's own `!== false` default-on semantics.
  const [seasonRenderApplyTextOverlays, setSeasonRenderApplyTextOverlays] =
    useState(true);
  const [seasonRenderApplyWatermark, setSeasonRenderApplyWatermark] =
    useState(true);
  const [episodeToDelete, setEpisodeToDelete] = useState<{
    id: string;
    episodeNumber: number;
    title?: string | null;
  } | null>(null);
  /** Durable inline result (not just a toast) — mirrors the episode
   *  workspace's own `finalRenderOptionsPanel.lastResult` convention.
   *  `null` until the first successful `assembleSeasonVideos` call. */
  const [seasonRenderResult, setSeasonRenderResult] = useState<{
    submitted: Array<{ episodeId: string; jobId: string }>;
    skipped: Array<{ episodeId: string; reason: string }>;
  } | null>(null);

  const assembleSeasonVideosMutation =
    trpc.verticalDramaSeries.assembleSeasonVideos.useMutation({
      onSuccess: (data: {
        submitted: Array<{ episodeId: string; jobId: string }>;
        skipped: Array<{ episodeId: string; reason: string }>;
      }) => {
        setSeasonRenderResult({
          submitted: data.submitted,
          skipped: data.skipped,
        });
        setSeasonRenderDialogOpen(false);
        if (data.submitted.length === 0) {
          toast.warning(t.seasonRenderNoneSubmittedToast);
        } else {
          toast.success(t.seasonRenderStartedToast);
        }
      },
      onError: (err: { message?: string }) => {
        toast.error(err?.message || t.seasonRenderFailedToast);
      },
    });

  function handleConfirmSeasonRender() {
    assembleSeasonVideosMutation.mutate({
      seriesId,
      options: {
        // Belt-and-suspenders re-check mirroring `assembleSeasonVideos`'s own
        // `voiceChainEnabled && options.includeDialogueAudio === true` guard
        // (server/routers/verticalDramaSeries.ts) — the checkbox itself never
        // renders while the flag is off, so this can never actually differ.
        includeDialogueAudio:
          seasonVoiceChainEnabled && seasonRenderIncludeDialogueAudio,
        loudnessNormalize: seasonRenderLoudnessNormalize,
        subtitlePreset: seasonRenderSubtitlePreset,
        // Text Overlay Suite (F131AB, task #34) — the toggles themselves only
        // render/change while `seasonTextOverlaySuiteEnabled` is true (JSX
        // below), so this is sent as-is (unlike `includeDialogueAudio`, ANDing
        // this against the client-side flag read is unnecessary — the server
        // independently re-checks its OWN tenant flag before honoring either
        // value, so a stale client flag can never leak the feature past the
        // server's own gate either way).
        applyTextOverlays: seasonRenderApplyTextOverlays,
        applyWatermark: seasonRenderApplyWatermark,
      },
    });
  }

  const generateNextEpisodesMutation =
    trpc.verticalDramaEpisodes.generateNextEpisodes.useMutation({
      onSuccess: (data: {
        episodes: Array<{
          id: string;
          episodeNumber: number;
          title: string | null;
          status: string;
        }>;
        creditsUsed: number;
        source: "breakdown" | "generated" | "mixed";
      }) => {
        const credited = data.creditsUsed > 0;
        if (data.episodes.length > 0) {
          toast.success(
            lang === "th"
              ? `เพิ่ม ${data.episodes.length} ตอนย่อยแล้ว${credited ? ` (ใช้ ${data.creditsUsed} เครดิต)` : ""}`
              : `Added ${data.episodes.length} Sub-episode(s)${credited ? ` (${data.creditsUsed} credits used)` : ""}`
          );
        } else {
          toast.warning(
            lang === "th"
              ? "ยังไม่ได้เพิ่มตอนย่อยใหม่ เพราะซีรีย์นี้ครบจำนวนตอนย่อยที่วางแผนไว้แล้ว"
              : "No new Sub-episodes were added because this series is already at its planned Sub-episode count."
          );
        }
        void utils.verticalDramaSeries.get.invalidate();
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? "เพิ่มตอนย่อยไม่สำเร็จ"
              : "Failed to add Sub-episode")
        );
      },
    });
  const deleteEpisodeMutation =
    trpc.verticalDramaEpisodes.deleteEpisode.useMutation({
      onSuccess: (data: {
        episode: { episodeNumber: number; title?: string | null };
      }) => {
        setEpisodeToDelete(null);
        toast.success(
          lang === "th"
            ? `ลบตอนย่อยที่ ${data.episode.episodeNumber} แล้ว`
            : `Deleted Sub-episode ${data.episode.episodeNumber}`
        );
        void utils.verticalDramaSeries.get.invalidate();
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? "ลบตอนย่อยไม่สำเร็จ"
              : "Failed to delete Sub-episode")
        );
      },
    });

  const isAdding = generateNextEpisodesMutation.isPending;
  const isDeleting = deleteEpisodeMutation.isPending;
  const [episodeAddCount, setEpisodeAddCount] = useState("1");
  const handleAddEpisode = () => {
    generateNextEpisodesMutation.mutate({
      seriesId,
      count: Number(episodeAddCount) || 1,
    });
  };
  // Bulk sub-episode slot creation
  // (`planning/vertical-drama-scene-dedup-bulk-slots/plan.md`) — when a
  // planned count is configured, cap how many slots remain and offer an
  // "All remaining (N)" quick option so the whole plan can be materialized
  // in one click (Mode A, free) instead of repeated 1-5 clicks.
  const hasPlannedTarget =
    typeof targetEpisodeCount === "number" && targetEpisodeCount > 0;
  const remainingPlanned = hasPlannedTarget
    ? Math.max(0, (targetEpisodeCount as number) - episodes.length)
    : null;
  // Series already has every planned slot created — disable the create
  // controls rather than let the user submit a no-op call.
  const isAtPlannedTarget = hasPlannedTarget && remainingPlanned === 0;
  const episodeAddCountOptions = useMemo(() => {
    const quickMax =
      remainingPlanned !== null ? Math.min(5, remainingPlanned || 5) : 5;
    const options: Array<{ value: string; label: string }> = [];
    for (let count = 1; count <= quickMax; count++) {
      options.push({
        value: String(count),
        label: lang === "th" ? `${count} ตอนย่อย` : `${count} Sub-ep`,
      });
    }
    if (remainingPlanned !== null && remainingPlanned > 1) {
      const value = String(remainingPlanned);
      const label =
        lang === "th"
          ? `ทั้งหมดที่เหลือ (${remainingPlanned})`
          : `All remaining (${remainingPlanned})`;
      const existingIndex = options.findIndex(
        option => option.value === value
      );
      if (existingIndex >= 0) {
        options[existingIndex] = { value, label };
      } else {
        options.push({ value, label });
      }
    }
    return options;
  }, [lang, remainingPlanned]);
  const handleConfirmDeleteEpisode = () => {
    if (!episodeToDelete) return;
    deleteEpisodeMutation.mutate({ seriesId, episodeId: episodeToDelete.id });
  };

  if (episodes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {lang === "th"
              ? "ยังไม่มีตอนย่อยในซีรีย์นี้"
              : "This series has no Sub-episodes yet."}
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={isAdding || isAtPlannedTarget}
              onClick={handleAddEpisode}
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {lang === "th" ? "เพิ่มตอนย่อยแรก" : "Add first Sub-episode"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {episodes.map(ep => (
          <li key={ep.id}>
            <Card className="transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={verticalDramaRoutes.episode(seriesId, ep.id)}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {ep.thumbnailUrl ? (
                        <img
                          src={ep.thumbnailUrl}
                          alt=""
                          aria-hidden="true"
                          className="aspect-[9/16] w-12 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="flex aspect-[9/16] w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40"
                        >
                          <Clapperboard
                            className="h-4 w-4 text-muted-foreground/60"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">
                          SUB-EP {ep.episodeNumber}
                          {ep.title ? ` · ${ep.title}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ep.status}
                        </p>
                      </div>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">
                      {pickCopy(lang, verticalDramaCopy.open)}
                    </Badge>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={isDeleting}
                        onClick={() =>
                          setEpisodeToDelete({
                            id: ep.id,
                            episodeNumber: ep.episodeNumber,
                            title: ep.title,
                          })
                        }
                        title={
                          lang === "th" ? "ลบตอนย่อยนี้" : "Delete Sub-episode"
                        }
                        aria-label={
                          lang === "th"
                            ? `ลบตอนย่อยที่ ${ep.episodeNumber}`
                            : `Delete Sub-episode ${ep.episodeNumber}`
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
                {/* Compact compiled-video player (2026-07-13) — OUTSIDE the
                    episode-navigation <Link> above so play/seek/download/
                    fullscreen never triggers navigation. Only rendered once
                    a completed full-episode render exists; episodes without
                    one keep the thumbnail-only row above unchanged. */}
                {ep.compiledVideo &&
                ep.compiledVideo.status === "completed" &&
                ep.compiledVideo.videoUrl ? (
                  <EpisodeCompiledVideoPlayer
                    lang={lang}
                    episodeNumber={ep.episodeNumber}
                    title={ep.title}
                    videoUrl={ep.compiledVideo.videoUrl}
                    posterUrl={ep.thumbnailUrl}
                  />
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Label
              htmlFor="vd-add-episodes-count"
              className="text-xs text-muted-foreground"
            >
              {lang === "th" ? "เพิ่มตอนย่อยใหม่" : "Add new Sub-episodes"}
            </Label>
            <Select
              value={episodeAddCount}
              onValueChange={setEpisodeAddCount}
              disabled={isAtPlannedTarget}
            >
              <SelectTrigger
                id="vd-add-episodes-count"
                className="h-9 w-[160px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {episodeAddCountOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isAdding || isAtPlannedTarget}
              onClick={handleAddEpisode}
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {lang === "th" ? "สร้างตอนย่อยใหม่" : "Generate new Sub-episodes"}
            </Button>
            {isAtPlannedTarget && (
              <span className="text-xs text-muted-foreground">
                {lang === "th"
                  ? "ครบจำนวนตอนย่อยที่วางแผนไว้แล้ว"
                  : "Already at the planned Sub-episode count."}
              </span>
            )}
          </div>
        )}
        {/* Task #21 / W12.5 "Final Render Suite" phase B — season batch
            render (2026-07-09). NOT gated on `readOnly`: rendering already-
            generated clips into an mp4 doesn't modify the series' story
            content (same "free, mechanical re-encode of already-owned
            media" rationale as the per-episode assemble action) — an
            archived/completed series should still be able to export its
            finished videos. */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setSeasonRenderDialogOpen(true)}
          data-testid="vd-season-render-button"
        >
          <Clapperboard className="h-4 w-4" aria-hidden="true" />
          {t.seasonRenderButton}
        </Button>
      </div>

      {seasonRenderResult ? (
        <div
          className="rounded-md border bg-muted/30 p-3 text-sm"
          data-testid="vd-season-render-result"
        >
          <p data-testid="vd-season-render-submitted-summary">
            {vdCopyWithParams(t.seasonRenderSubmittedSummaryTemplate, {
              n: seasonRenderResult.submitted.length,
              episodes: seasonRenderResult.submitted
                .map(s => episodeNumberById.get(s.episodeId) ?? s.episodeId)
                .join(", "),
            })}
          </p>
          {seasonRenderResult.skipped.length > 0 ? (
            <div data-testid="vd-season-render-skipped-summary">
              <p>
                {vdCopyWithParams(t.seasonRenderSkippedSummaryTemplate, {
                  n: seasonRenderResult.skipped.length,
                })}
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {seasonRenderResult.skipped.map(s => (
                  <li key={s.episodeId}>
                    SUB-EP {episodeNumberById.get(s.episodeId) ?? s.episodeId}:{" "}
                    {vdSeasonRenderSkipReasonLabel(s.reason, lang)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={Boolean(episodeToDelete)}
        onOpenChange={open => !open && setEpisodeToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lang === "th"
                ? "ยืนยันการลบตอนย่อย"
                : "Confirm Sub-episode deletion"}
            </DialogTitle>
            <DialogDescription>
              {episodeToDelete
                ? lang === "th"
                  ? `ลบตอนย่อยที่ ${episodeToDelete.episodeNumber}${episodeToDelete.title ? ` · ${episodeToDelete.title}` : ""} ออกจากซีรีย์นี้ การลบจะลบงานรันและอาร์ติแฟกต์ของตอนย่อยนี้ด้วย แต่ไฟล์ในคลังสื่อจะยังอยู่`
                  : `Delete Sub-episode ${episodeToDelete.episodeNumber}${episodeToDelete.title ? ` · ${episodeToDelete.title}` : ""} from this series. This also removes this Sub-episode's runs and artifacts, but media library files remain.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setEpisodeToDelete(null)}
            >
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || !episodeToDelete}
              onClick={handleConfirmDeleteEpisode}
            >
              {isDeleting ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {lang === "th" ? "ลบตอนย่อย" : "Delete Sub-episode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={seasonRenderDialogOpen}
        onOpenChange={setSeasonRenderDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.seasonRenderDialogTitle}</DialogTitle>
            <DialogDescription>
              {t.seasonRenderDialogExplainer}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {seasonVoiceChainEnabled ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="season-render-include-audio"
                    checked={seasonRenderIncludeDialogueAudio}
                    onCheckedChange={checked =>
                      setSeasonRenderIncludeDialogueAudio(checked === true)
                    }
                    data-testid="vd-season-render-include-audio"
                  />
                  <Label
                    htmlFor="season-render-include-audio"
                    className="text-sm font-medium"
                  >
                    {t.finalRenderIncludeDialogueAudioLabel}
                  </Label>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <Checkbox
                    id="season-render-loudness-normalize"
                    checked={seasonRenderLoudnessNormalize}
                    disabled={!seasonRenderIncludeDialogueAudio}
                    onCheckedChange={checked =>
                      setSeasonRenderLoudnessNormalize(checked === true)
                    }
                    data-testid="vd-season-render-loudness-normalize"
                  />
                  <Label
                    htmlFor="season-render-loudness-normalize"
                    className="text-sm text-muted-foreground"
                  >
                    {t.finalRenderLoudnessNormalizeLabel}
                  </Label>
                </div>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t.finalRenderSubtitlePresetLabel}
              </Label>
              <Select
                value={seasonRenderSubtitlePreset}
                onValueChange={v =>
                  setSeasonRenderSubtitlePreset(
                    v as VdFinalRenderSubtitlePresetValue
                  )
                }
              >
                <SelectTrigger data-testid="vd-season-render-subtitle-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t.finalRenderSubtitlePresetNone}
                  </SelectItem>
                  {VD_FINAL_RENDER_SUBTITLE_PRESET_IDS.map(id => (
                    <SelectItem key={id} value={id}>
                      {vdFinalRenderSubtitlePresetLabel(id, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {seasonTextOverlaySuiteEnabled ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="season-render-apply-text-overlays"
                    checked={seasonRenderApplyTextOverlays}
                    onCheckedChange={checked =>
                      setSeasonRenderApplyTextOverlays(checked === true)
                    }
                    data-testid="vd-season-render-apply-text-overlays"
                  />
                  <Label
                    htmlFor="season-render-apply-text-overlays"
                    className="text-sm font-medium"
                  >
                    {tOverlay.batchApplyTextOverlaysLabel}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="season-render-apply-watermark"
                    checked={seasonRenderApplyWatermark}
                    onCheckedChange={checked =>
                      setSeasonRenderApplyWatermark(checked === true)
                    }
                    data-testid="vd-season-render-apply-watermark"
                  />
                  <Label
                    htmlFor="season-render-apply-watermark"
                    className="text-sm font-medium"
                  >
                    {tOverlay.batchApplyWatermarkLabel}
                  </Label>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSeasonRenderDialogOpen(false)}
              disabled={assembleSeasonVideosMutation.isPending}
            >
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              onClick={handleConfirmSeasonRender}
              disabled={assembleSeasonVideosMutation.isPending}
              className="gap-2"
              data-testid="vd-season-render-confirm"
            >
              {assembleSeasonVideosMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {t.seasonRenderDialogConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Pure predicate — true only when `ep.compiledVideo` is a completed,
 * playable full-episode render (non-empty `videoUrl`). Exported for direct
 * unit testing, same convention as `resolveInitialSeriesTab` above. The
 * `EpisodesTab` render loop re-checks the same condition inline (rather
 * than calling this) so TypeScript's control-flow narrowing can access
 * `ep.compiledVideo.videoUrl` without a non-null assertion — this helper
 * exists for testability, not as the actual render gate.
 */
export function hasPlayableCompiledVideo(ep: {
  compiledVideo?: {
    videoUrl: string;
    status: string;
    durationSeconds?: number;
  } | null;
}): boolean {
  return Boolean(
    ep.compiledVideo &&
    ep.compiledVideo.status === "completed" &&
    ep.compiledVideo.videoUrl
  );
}

/**
 * Compact compiled-video player for an Episodes-tab card (added
 * 2026-07-13) — shown only when the episode has a completed full-episode
 * render (see `hasPlayableCompiledVideo`). Icons + copy match the
 * per-episode workspace's own compiled-video/clip players
 * (`VerticalDramaStoryboardPanel.tsx`'s "วิดีโอรวมทั้งตอน" card and its per-clip
 * player): `Download` for the download action, `Expand` for the explicit
 * fullscreen action (same icon that section's "เปิดแบบเต็มจอ"/"View fullscreen"
 * button already uses). Rendered by `EpisodesTab` as a sibling of — never
 * inside — the episode-navigation `<Link>`, so play/seek/download/
 * fullscreen here never triggers navigation.
 */
function EpisodeCompiledVideoPlayer({
  lang,
  episodeNumber,
  title,
  videoUrl,
  posterUrl,
}: {
  lang: "th" | "en";
  episodeNumber: number;
  title?: string | null;
  videoUrl: string;
  posterUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const episodeLabel = `SUB-EP ${episodeNumber}${title ? ` · ${title}` : ""}`;

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof video.requestFullscreen === "function") {
      void video.requestFullscreen();
      return;
    }
    // iOS Safari has no standard `Element.requestFullscreen`; its <video>
    // elements expose this vendor-prefixed method instead.
    const iosVideo = video as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    };
    if (typeof iosVideo.webkitEnterFullscreen === "function") {
      iosVideo.webkitEnterFullscreen();
    }
  };

  return (
    <div className="border-t border-border pt-3">
      <div className="mx-auto w-36 max-w-full overflow-hidden rounded-md border border-border bg-black sm:mx-0">
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          controls
          playsInline
          preload="none"
          className="aspect-[9/16] max-h-[40vh] w-full bg-black"
          aria-label={
            lang === "th"
              ? `วิดีโอรวม Sub-episode ${episodeLabel}`
              : `${episodeLabel} compiled Sub-episode video`
          }
          data-testid="vd-episode-card-compiled-video-player"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a
            href={videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              lang === "th"
                ? `ดาวน์โหลดวิดีโอรวม ${episodeLabel}`
                : `Download compiled video for ${episodeLabel}`
            }
            data-testid="vd-episode-card-compiled-video-download"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {lang === "th" ? "ดาวน์โหลด" : "Download"}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleFullscreen}
          aria-label={
            lang === "th"
              ? `เปิดวิดีโอรวม ${episodeLabel} แบบเต็มจอ`
              : `Open compiled video for ${episodeLabel} fullscreen`
          }
          data-testid="vd-episode-card-compiled-video-fullscreen"
        >
          <Expand className="h-3.5 w-3.5" aria-hidden="true" />
          {lang === "th" ? "เต็มจอ" : "Fullscreen"}
        </Button>
      </div>
    </div>
  );
}

function PlaceholderTab({
  lang,
  label,
  readOnly,
}: {
  lang: "th" | "en";
  label: string;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {readOnly && (
          <Badge variant="outline" className="mb-2">
            {pickCopy(lang, verticalDramaCopy.readOnly)}
          </Badge>
        )}
        <p>
          {lang === "th"
            ? "ส่วนนี้จะพร้อมใช้งานเมื่อฟีเจอร์ของส่วนถัดไปถูกติดตั้ง (โหมดวางแผน)"
            : "This section becomes available as later feature sections ship (planning mode)."}
        </p>
      </CardContent>
    </Card>
  );
}

interface ExpandedStoryBible {
  // Wizard-input fields, present before generation.
  // Feature 132 §4 (F132A) — "โจทย์เรื่องที่อยากได้" (user premise), persisted
  // into this same jsonb bible (no migration). Read-only here.
  userPremise?: string;
  logline?: string;
  mainPlot?: string;
  seasonArc?: string;
  visualStyle?: string;
  cliffhangerStyle?: string;
  charactersDraft?: Array<{ name: string; role: string; description: string }>;
  // LLM-expanded fields, present after "Generate story".
  expandedSeasonArc?: string;
  refinedCharacters?: Array<{
    name: string;
    role: string;
    description: string;
  }>;
  episodeBreakdown?: Array<{
    episodeNumber: number;
    workingTitle: string;
    logline: string;
    keyBeats: string[];
  }>;
  expandedAt?: string;
}

/** Re-exported from the shared module (was a locally-declared constant) — see `storyScriptText.ts`'s own doc comment. */
export const VD_STORY_COPY_CLIPBOARD_CHAR_LIMIT = STORY_SCRIPT_TEXT_CHAR_LIMIT;

type StoryCopyEpisodePlan = NonNullable<
  ExpandedStoryBible["episodeBreakdown"]
>[number];
type StoryCopyDeepDraftItem = ReturnType<
  typeof getActiveBreakdownItemsForDisplay
>[number];

/**
 * Thin adapter — maps this page's own two-source data (the episode plan +
 * the active `deepDraftItem`, when any) onto the shared `StoryScriptEpisodeInput`
 * shape and delegates to `buildStoryScriptText` (`@shared/verticalDramaSeries/storyScriptText`).
 * Zero behavior change vs. the former locally-owned formatter — see that
 * module's own doc comment for the extraction history.
 */
export function buildVerticalDramaStoryCopyText(params: {
  lang: "th" | "en";
  title?: string | null;
  genre?: string | null;
  tone?: string | null;
  seasonArc?: string | null;
  episodes: StoryCopyEpisodePlan[];
  activeItems: StoryCopyDeepDraftItem[];
  fromEpisode: number;
  toEpisode: number;
  maxChars?: number;
}): {
  text: string;
  copiedEpisodeNumbers: number[];
  omittedEpisodeNumbers: number[];
  truncated: boolean;
} {
  const activeItemByEpisode = new Map(
    params.activeItems.map(item => [item.episodeNumber, item])
  );
  const episodes: StoryScriptEpisodeInput[] = params.episodes.map(episode => {
    const deepDraftItem = activeItemByEpisode.get(episode.episodeNumber);
    const cliffhangerLine = (
      deepDraftItem as { cliffhanger_line?: unknown } | undefined
    )?.cliffhanger_line;
    return {
      episodeNumber: episode.episodeNumber,
      workingTitle: episode.workingTitle,
      logline: episode.logline,
      keyBeats: episode.keyBeats,
      shotDrafts: deepDraftItem ? readDeepDraftShotDrafts(deepDraftItem) : null,
      cliffhangerLine:
        typeof cliffhangerLine === "string" ? cliffhangerLine : undefined,
    };
  });

  return buildStoryScriptText({
    lang: params.lang,
    title: params.title,
    genre: params.genre,
    tone: params.tone,
    seasonArc: params.seasonArc,
    episodes,
    fromEpisode: params.fromEpisode,
    toEpisode: params.toEpisode,
    maxChars: params.maxChars,
  });
}

/**
 * Bible tab (spec addendum) — read-only display of the series' `bible` jsonb
 * column: wizard-input fields (logline/mainPlot/visualStyle/cliffhangerStyle)
 * shown even before generation, plus the LLM-refined character list once
 * "Generate story" has run. The expanded season arc + episode breakdown are
 * already shown in the Overview tab's `StoryBibleOverviewCard`, so this tab
 * focuses on the fields not surfaced anywhere else.
 */
function StoryBibleTab({
  lang,
  seriesId,
  locale,
  bible,
  readOnly,
}: {
  lang: "th" | "en";
  seriesId: string;
  locale?: string | null;
  bible: unknown;
  readOnly: boolean;
}) {
  const b = (bible ?? {}) as ExpandedStoryBible;
  const hasRefinedCharacters = Boolean(
    b.refinedCharacters && b.refinedCharacters.length > 0
  );
  const fields: Array<{
    key: keyof ExpandedStoryBible;
    label: { th: string; en: string };
  }> = [
    { key: "logline", label: { th: "โลจไลน์", en: "Logline" } },
    { key: "mainPlot", label: { th: "โครงเรื่องหลัก", en: "Main plot" } },
    { key: "visualStyle", label: { th: "สไตล์ภาพ", en: "Visual style" } },
    {
      key: "cliffhangerStyle",
      label: { th: "สไตล์ปมค้างตอนจบ", en: "Cliffhanger style" },
    },
  ];

  return (
    <div className="space-y-4">
      {readOnly && (
        <Badge variant="outline">
          {pickCopy(lang, verticalDramaCopy.readOnly)}
        </Badge>
      )}

      <VerticalDramaSeriesTrailerPanel
        lang={lang}
        seriesId={seriesId}
        locale={locale}
        logline={b.logline}
        mainPlot={b.mainPlot}
        readOnly={readOnly}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th"
              ? "ไบเบิลเรื่อง (จากขั้นตอนสร้าง)"
              : "Story bible (from wizard)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {fields.map(({ key, label }) => {
            const value = b[key];
            return (
              <div key={key}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {pickCopy(lang, label)}
                </p>
                {typeof value === "string" && value.trim().length > 0 ? (
                  <p className="whitespace-pre-wrap">{value}</p>
                ) : (
                  <p className="italic text-muted-foreground">
                    {lang === "th" ? "ยังไม่ได้ระบุ" : "Not set yet"}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th" ? "ตัวละครที่ปรับปรุงแล้ว" : "Refined characters"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {hasRefinedCharacters ? (
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {b.refinedCharacters!.map((c, i) => (
                <li key={i} className="rounded-md border p-2.5">
                  <p className="font-medium">
                    {c.name}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      · {c.role}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              {lang === "th"
                ? 'ตัวละครที่ปรับปรุงแล้วจะปรากฏที่นี่หลังจากกด "สร้างเนื้อเรื่องเต็ม" ในแท็บภาพรวม'
                : 'Refined characters will appear here after clicking "Generate story" in the Overview tab.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Mirrors the server's `updateEpisodeDraftSynopsisInput` `logline` cap (`verticalDramaSeries.ts`) — soft `maxLength` guardrail on the textarea (the server independently enforces the same limit). */
const EDIT_SYNOPSIS_MAX_LENGTH = 1200;

/**
 * Manual synopsis edits (added 2026-07-22) — the inline per-sub-episode
 * logline editor form, rendered INSTEAD OF the read-only logline text for
 * whichever ONE sub-episode is currently being edited (at most one per card
 * at a time — see `StoryBibleOverviewCard`'s own `editingEpisodeNumber`
 * state). Purely presentational, mirrors `ManualDialogueEditShotForm`'s own
 * doc comment in `VerticalDramaDeepStoryDraftsPanel.tsx` — the parent owns
 * every piece of state and the mutation itself, so this component has no
 * hooks of its own.
 */
function EditSynopsisForm({
  lang,
  episodeNumber,
  value,
  isSaving,
  onChange,
  onCancel,
  onSave,
}: {
  lang: "th" | "en";
  episodeNumber: number;
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const trimmedEmpty = value.trim().length === 0;
  return (
    <div
      className="grid gap-2"
      data-testid={`vd-edit-synopsis-form-${episodeNumber}`}
    >
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        maxLength={EDIT_SYNOPSIS_MAX_LENGTH}
        className="min-h-[4.5rem] text-xs"
        data-testid={`vd-edit-synopsis-textarea-${episodeNumber}`}
      />
      {trimmedEmpty && (
        <p className="text-[10px] text-destructive">
          {pickCopy(lang, verticalDramaCopy.editSynopsisRequired)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isSaving}
          onClick={onCancel}
          data-testid={`vd-edit-synopsis-cancel-${episodeNumber}`}
        >
          {pickCopy(lang, verticalDramaCopy.editSynopsisCancel)}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving || trimmedEmpty}
          onClick={onSave}
          className="gap-1.5"
          data-testid={`vd-edit-synopsis-save-${episodeNumber}`}
        >
          {isSaving && (
            <Loader2
              className="h-3 w-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {isSaving
            ? pickCopy(lang, verticalDramaCopy.editSynopsisSaving)
            : pickCopy(lang, verticalDramaCopy.editSynopsisSave)}
        </Button>
      </div>
    </div>
  );
}

/**
 * Overview card for the "Generate story" action (spec addendum) — the first
 * real, credit-consuming LLM call in this feature. Shows the expanded season
 * arc + episode breakdown once generated, or a Generate/retry CTA otherwise.
 */
export function StoryBibleOverviewCard({
  lang,
  seriesId,
  seriesTitle,
  bible,
  genre,
  tone,
  targetEpisodeCount,
  readOnly,
  onViewEpisodes,
  onEpisodesGenerated,
  onEditPremiseClick,
  deepDraftsFlagEnabled = false,
  deepDraftSummary,
  createdEpisodeNumbers = [],
  isLineageSeries = false,
}: {
  lang: "th" | "en";
  seriesId: string;
  seriesTitle?: string | null;
  bible: unknown;
  genre?: string | null;
  tone?: string | null;
  targetEpisodeCount?: number | null;
  readOnly: boolean;
  onViewEpisodes?: () => void;
  onEpisodesGenerated?: () => void;
  /**
   * Feature 132 §4.4 (F132A) — edit-affordance for `VerticalDramaDeepStoryDraftsActions`'s
   * read-only premise preview; navigates to the series settings tab where the
   * premise can actually be edited (this card builds no new settings UI).
   */
  onEditPremiseClick?: () => void;
  /** W10-C (spec F131T) — flag off (default) keeps this card byte-identical to before. */
  deepDraftsFlagEnabled?: boolean;
  deepDraftSummary?: VerticalDramaDeepDraftSummary | null;
  /**
   * Manual dialogue edits (W10.5) — episode numbers that already have a REAL
   * created episode row (this page's own `episodes` list — the same data
   * source the "ดูตอนจริงที่สร้างแล้ว..." link below reads). Threaded straight
   * through to `VerticalDramaDeepStoryDraftEpisodeDetail` as a per-episode
   * `episodeAlreadyCreated` boolean. Defaults to `[]` so every pre-existing
   * caller (including this file's own test suite) renders byte-identical.
   */
  createdEpisodeNumbers?: number[];
  /**
   * Extend deep-draft premium default (client fix, 2026-07-18) — whether the
   * series is a lineage series (sequel/special edition), sourced by the
   * parent page (`VerticalDramaSeriesDetailPage`'s own `isLineageSeries`,
   * derived from `series.createMode`/`parentSeriesId`). Threaded straight
   * through to both `VerticalDramaDeepStoryDraftsActions` call sites below —
   * see that component's own `isLineageSeries` prop doc comment. Defaults to
   * `false` so every pre-existing caller (including this file's own test
   * suite) renders byte-identical.
   */
  isLineageSeries?: boolean;
}) {
  const utils = trpc.useUtils();
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyFromEpisode, setCopyFromEpisode] = useState<number | null>(null);
  const [copyToEpisode, setCopyToEpisode] = useState<number | null>(null);
  // Manual synopsis edits (added 2026-07-22) — at most one sub-episode's
  // logline is editable at a time, same shape as `editingShotNumber` in
  // `VerticalDramaDeepStoryDraftEpisodeDetail`.
  const [editingEpisodeNumber, setEditingEpisodeNumber] = useState<
    number | null
  >(null);
  const [synopsisDraft, setSynopsisDraft] = useState("");
  const updateSynopsisMutation =
    trpc.verticalDramaSeries.updateEpisodeDraftSynopsis.useMutation({
      onSuccess: (
        data: { episodeNumber: number; logline: string },
        variables: { episodeNumber: number }
      ) => {
        void utils.verticalDramaSeries.get.invalidate({ seriesId });
        // Required so the shot-splitting page (VerticalDramaEpisodePage ->
        // VerticalDramaEpisodePlanPanel) picks up the new synopsis
        // immediately — mirrors every other mutation in this file's sibling
        // pages that touches the active breakdown version.
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        toast.success(
          editSynopsisSavedSuccessText(lang, variables.episodeNumber)
        );
        setEditingEpisodeNumber(null);
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message || pickCopy(lang, verticalDramaCopy.editSynopsisSaveError)
        );
      },
    });
  const handleOpenSynopsisEdit = (episodeNumber: number, logline: string) => {
    setEditingEpisodeNumber(episodeNumber);
    setSynopsisDraft(logline);
  };
  const handleCancelSynopsisEdit = () => setEditingEpisodeNumber(null);
  const handleSaveSynopsis = (episodeNumber: number) => {
    const trimmed = synopsisDraft.trim();
    if (!trimmed) return;
    updateSynopsisMutation.mutate({
      seriesId,
      episodeNumber,
      logline: trimmed,
      idempotencyKey: crypto.randomUUID(),
    });
  };
  const expanded = (bible ?? {}) as ExpandedStoryBible;
  const createdEpisodeNumberSet = useMemo(
    () => new Set(createdEpisodeNumbers),
    [createdEpisodeNumbers]
  );
  const hasStory = Boolean(
    expanded.episodeBreakdown && expanded.episodeBreakdown.length > 0
  );
  const episodePlans = useMemo(
    () =>
      [...(expanded.episodeBreakdown ?? [])].sort(
        (a, b) => a.episodeNumber - b.episodeNumber
      ),
    [expanded.episodeBreakdown]
  );
  const activeBreakdownItems = useMemo(
    () => getActiveBreakdownItemsForDisplay(bible),
    [bible]
  );
  // W10-C — resolves the SAME active-breakdown-version the server uses for
  // deep drafts (`getActiveBreakdown` in the server-only
  // `verticalDramaStoryBible.ts`), so per-episode shot drafts/cliffhanger
  // lines/completeness (persisted onto `bible.breakdownVersions[]`, not the
  // legacy top-level `bible.episodeBreakdown` this card otherwise reads) are
  // still found by episode number. Flag-gated so there is zero extra work
  // when the flag is off.
  const activeBreakdownByEpisode = useMemo(() => {
    if (!deepDraftsFlagEnabled)
      return new Map<
        number,
        ReturnType<typeof getActiveBreakdownItemsForDisplay>[number]
      >();
    return new Map(
      activeBreakdownItems.map(item => [item.episodeNumber, item])
    );
  }, [deepDraftsFlagEnabled, activeBreakdownItems]);
  // Task #31 (spec §7.7.2/§7.7.3, added 2026-07-09) — season-plan tie-in
  // badge, computed INDEPENDENTLY of `deepDraftsFlagEnabled` above (an
  // unrelated feature's gate) so the badge works regardless of that flag.
  // Self-gating: `tieIn` is only ever populated once the
  // `verticalDramaSeriesTieInReplan` flag has been used at least once for
  // this series (bootstrap or full-season plan) — a legacy/flag-off series
  // simply never has any entries here, so this Map is empty and the badge
  // never renders (grandfather).
  //
  // Task #22 (added 2026-07-09) — EXTENDED with draft-awareness: `isDrafted`/
  // `hasMarkedShot` read the SAME `shotDrafts`/`tie_in` marking
  // `reconcileTieInDraftMarking` checks server-side (via the Panel's own
  // `readDeepDraftShotDrafts` tolerant reader — this page already imports
  // several siblings from that file). An episode with no `shotDrafts` yet
  // (`isDrafted: false`) is NOT treated as a mismatch — nothing to judge yet.
  const tieInStateByEpisode = useMemo(() => {
    const map = new Map<
      number,
      { planned: boolean; isDrafted: boolean; hasMarkedShot: boolean }
    >();
    for (const item of activeBreakdownItems) {
      if (!item.tieIn) continue;
      const shotDrafts = readDeepDraftShotDrafts(item);
      map.set(item.episodeNumber, {
        planned: item.tieIn.planned,
        isDrafted: shotDrafts !== null,
        hasMarkedShot:
          shotDrafts?.some(shot => shot.tie_in?.has_product_moment === true) ??
          false,
      });
    }
    return map;
  }, [activeBreakdownItems]);

  const firstEpisodeNumber = episodePlans[0]?.episodeNumber ?? 1;
  const lastEpisodeNumber =
    episodePlans[episodePlans.length - 1]?.episodeNumber ?? firstEpisodeNumber;
  const effectiveCopyFrom = copyFromEpisode ?? firstEpisodeNumber;
  const effectiveCopyTo = copyToEpisode ?? lastEpisodeNumber;
  const selectedCopy = useMemo(
    () =>
      buildVerticalDramaStoryCopyText({
        lang,
        title: seriesTitle,
        genre,
        tone,
        seasonArc: expanded.expandedSeasonArc,
        episodes: episodePlans,
        activeItems: activeBreakdownItems,
        fromEpisode: Math.min(effectiveCopyFrom, effectiveCopyTo),
        toEpisode: Math.max(effectiveCopyFrom, effectiveCopyTo),
      }),
    [
      lang,
      seriesTitle,
      genre,
      tone,
      expanded.expandedSeasonArc,
      episodePlans,
      activeBreakdownItems,
      effectiveCopyFrom,
      effectiveCopyTo,
    ]
  );
  const draftedEpisodeNumbers = useMemo(
    () =>
      activeBreakdownItems
        .filter(item => readDeepDraftShotDrafts(item) !== null)
        .map(item => item.episodeNumber)
        .sort((a, b) => a - b),
    [activeBreakdownItems]
  );

  function openCopyDialog() {
    setCopyFromEpisode(firstEpisodeNumber);
    setCopyToEpisode(lastEpisodeNumber);
    setCopyDialogOpen(true);
  }

  async function writeTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  async function copySelectedStory() {
    try {
      await writeTextToClipboard(selectedCopy.text);
      const rangeLabel =
        selectedCopy.copiedEpisodeNumbers.length > 0
          ? `${selectedCopy.copiedEpisodeNumbers[0]}-${selectedCopy.copiedEpisodeNumbers[selectedCopy.copiedEpisodeNumbers.length - 1]}`
          : "-";
      toast.success(
        selectedCopy.truncated || selectedCopy.omittedEpisodeNumbers.length > 0
          ? lang === "th"
            ? `คัดลอกได้ถึงตอนย่อย ${rangeLabel} (ข้อความยาวเกิน จึงตัดตอนย่อยที่เหลือออก)`
            : `Copied through Sub-episode ${rangeLabel} (remaining Sub-episodes were too long for clipboard)`
          : lang === "th"
            ? `คัดลอกเนื้อเรื่องตอนย่อย ${rangeLabel} แล้ว`
            : `Copied Sub-episode stories ${rangeLabel}`
      );
      setCopyDialogOpen(false);
    } catch {
      toast.error(lang === "th" ? "คัดลอกไม่สำเร็จ" : "Copy failed");
    }
  }

  // After a full story is (re)generated, materialize the newly-planned
  // episodes into real episode rows for free — this only ever hits Mode A
  // ("materialize from plan", no LLM call, no credits) since the plan was
  // just freshly written and can't be exhausted yet. Its failure is a
  // convenience-add-on failure, not a Story Bible generation failure, so it
  // gets its own toast and never blocks/overrides the success toast above.
  const generateNextEpisodesMutation =
    trpc.verticalDramaEpisodes.generateNextEpisodes.useMutation({
      onSuccess: (data: { episodes: Array<{ id: string }> }) => {
        if (data.episodes.length > 0) {
          toast.success(
            lang === "th"
              ? `สร้างตอนย่อยจริง ${data.episodes.length} ตอนจากแผนแล้ว`
              : `Created ${data.episodes.length} real Sub-episode(s) from the plan`
          );
        }
        void utils.verticalDramaSeries.get.invalidate();
        onEpisodesGenerated?.();
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? 'สร้างเนื้อเรื่องเต็มสำเร็จ แต่สร้างตอนย่อยจริงจากแผนไม่สำเร็จ — ลองกด "เพิ่มตอนย่อย" ในแท็บตอนย่อยได้'
              : 'Story generated, but creating real Sub-episodes from the plan failed — try "Add Sub-episode" in the Sub-episodes tab.')
        );
      },
    });

  const generateMutation =
    trpc.verticalDramaSeries.generateStoryBible.useMutation({
      onSuccess: (data: { creditsUsed: number }) => {
        toast.success(
          lang === "th"
            ? `สร้างเนื้อเรื่องเต็มแล้ว (ใช้ ${data.creditsUsed} เครดิต)`
            : `Full story generated (${data.creditsUsed} credits used)`
        );
        void utils.verticalDramaSeries.get.invalidate();
        // Materialize only the remaining planned episodes. Never let the
        // overview "Generate story" action spill into the separate "add new
        // episodes" continuation flow.
        const targetCount =
          targetEpisodeCount ?? expanded.episodeBreakdown?.length ?? 0;
        const remainingPlannedEpisodes = Math.max(
          0,
          targetCount - createdEpisodeNumberSet.size
        );
        if (remainingPlannedEpisodes > 0) {
          generateNextEpisodesMutation.mutate({
            seriesId,
            count: Math.min(5, remainingPlannedEpisodes),
          });
        }
      },
      onError: (err: { message?: string }) => {
        toast.error(
          err?.message ||
            (lang === "th"
              ? "สร้างเนื้อเรื่องเต็มไม่สำเร็จ"
              : "Story generation failed")
        );
      },
    });

  // Consolidated primary action (spec addendum, added 2026-07-08) — thin
  // awaitable wrapper so `VerticalDramaDeepStoryDraftsActions` can sequence
  // its own deep-draft call after this one resolves, without needing to know
  // this mutation's input/output shape. Rejects on failure; `onError` above
  // already shows the error toast, so callers only need to know settlement,
  // not the reason.
  const runGenerateStoryBible = async () => {
    await generateMutation.mutateAsync({ seriesId });
  };

  const contextParts: string[] = [];
  if (genre) contextParts.push(`${lang === "th" ? "แนว" : "Genre"}: ${genre}`);
  if (tone) contextParts.push(`${lang === "th" ? "โทน" : "Tone"}: ${tone}`);
  if (targetEpisodeCount != null) {
    contextParts.push(
      `${lang === "th" ? "จำนวนตอนย่อยที่วางแผน" : "Planned Sub-episodes"}: ${targetEpisodeCount}`
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {lang === "th" ? "เนื้อเรื่องเต็ม" : "Full story"}
        </CardTitle>
        {hasStory && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 self-start"
            onClick={openCopyDialog}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {lang === "th" ? "คัดลอกเนื้อเรื่อง" : "Copy story"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {contextParts.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground">
            {contextParts.join(" · ")}
          </p>
        )}
        {!hasStory ? (
          <>
            <p className="text-muted-foreground">
              {lang === "th"
                ? "ยังไม่ได้สร้างเนื้อเรื่องเต็ม — กดเพื่อขยายโครงเรื่อง/เรื่องย่อ/ตัวละครให้เป็นเนื้อเรื่องเต็มพร้อมแบ่งตอนย่อย แล้วสร้างตอนย่อยจริงให้อัตโนมัติ (ใช้เครดิต)"
                : "No full story yet — generate one to expand the plot/logline/characters into a full Sub-episode-by-Sub-episode story, and real Sub-episodes will be created automatically (uses credits)."}
            </p>
            {!readOnly &&
              (deepDraftsFlagEnabled ? (
                // W12 (consolidated primary action) — no plan yet: the ONE
                // primary button always chains generateStoryBible ->
                // generateStoryBibleDeep; see VerticalDramaDeepStoryDraftsActions.
                <VerticalDramaDeepStoryDraftsActions
                  lang={lang}
                  seriesId={seriesId}
                  readOnly={readOnly}
                  targetEpisodeCount={targetEpisodeCount}
                  hasPlan={false}
                  onGenerateStoryBible={runGenerateStoryBible}
                  userPremise={expanded.userPremise}
                  onEditPremiseClick={onEditPremiseClick}
                />
              ) : (
                <Button
                  onClick={() => generateMutation.mutate({ seriesId })}
                  disabled={generateMutation.isPending}
                  className="gap-2"
                >
                  {generateMutation.isPending && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {generateMutation.isPending
                    ? lang === "th"
                      ? "กำลังสร้าง…"
                      : "Generating…"
                    : lang === "th"
                      ? "สร้างเนื้อเรื่องเต็ม"
                      : "Generate story"}
                </Button>
              ))}
          </>
        ) : (
          <>
            {expanded.expandedSeasonArc && (
              <p className="text-muted-foreground">
                {expanded.expandedSeasonArc}
              </p>
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {lang === "th"
                ? "แผนเนื้อเรื่องรายตอนย่อย (ร่าง)"
                : "Sub-episode-by-Sub-episode story plan (draft)"}
            </p>
            <ol className="space-y-2">
              {expanded.episodeBreakdown!.map(ep => {
                const tieInState = tieInStateByEpisode.get(ep.episodeNumber);
                // Task #22 — "warning" tone ONLY once a draft actually exists
                // and still has no shot marked; an undrafted planned episode
                // (or one that IS correctly marked) both read as "normal".
                const tieInDraftMismatch = Boolean(
                  tieInState?.planned &&
                  tieInState.isDrafted &&
                  !tieInState.hasMarkedShot
                );
                return (
                  <li
                    key={ep.episodeNumber}
                    className="rounded-md border p-2.5"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span>
                        {lang === "th"
                          ? `ตอนย่อยที่ ${ep.episodeNumber} (แผน)`
                          : `Sub-episode ${ep.episodeNumber} (draft plan)`}
                        {` · ${ep.workingTitle}`}
                      </span>
                      {tieInState?.planned ? (
                        <Badge
                          variant={
                            tieInDraftMismatch ? "destructive" : "secondary"
                          }
                          className="text-[10px] font-normal"
                          data-testid={`vd-overview-tie-in-badge-${ep.episodeNumber}`}
                        >
                          {tieInDraftMismatch
                            ? pickTieInDraftCopy(
                                lang,
                                verticalDramaTieInDraftCopy.badgePlannedUnmarked
                              )
                            : pickTieInDraftCopy(
                                lang,
                                verticalDramaTieInDraftCopy.badgePlannedNormal
                              )}
                        </Badge>
                      ) : null}
                    </p>
                    {ep.logline ||
                    editingEpisodeNumber === ep.episodeNumber ||
                    !readOnly ? (
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {lang === "th" ? "เรื่องย่อ" : "Logline"}
                          </p>
                          {!readOnly && editingEpisodeNumber !== ep.episodeNumber ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px]"
                              onClick={() =>
                                handleOpenSynopsisEdit(
                                  ep.episodeNumber,
                                  ep.logline ?? ""
                                )
                              }
                              data-testid={`vd-edit-synopsis-cta-${ep.episodeNumber}`}
                            >
                              {pickCopy(lang, verticalDramaCopy.editSynopsisCta)}
                            </Button>
                          ) : null}
                        </div>
                        {editingEpisodeNumber === ep.episodeNumber ? (
                          <EditSynopsisForm
                            lang={lang}
                            episodeNumber={ep.episodeNumber}
                            value={synopsisDraft}
                            isSaving={updateSynopsisMutation.isPending}
                            onChange={setSynopsisDraft}
                            onCancel={handleCancelSynopsisEdit}
                            onSave={() => handleSaveSynopsis(ep.episodeNumber)}
                          />
                        ) : ep.logline ? (
                          <p className="text-xs text-muted-foreground">
                            {ep.logline}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {ep.keyBeats.length > 0 ? (
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {lang === "th" ? "จุดดำเนินเรื่อง" : "Key beats"}
                        </p>
                        <ul className="list-inside list-disc text-xs text-muted-foreground">
                          {ep.keyBeats.map((beat, i) => (
                            <li key={i}>{beat}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {deepDraftsFlagEnabled && (
                      <VerticalDramaDeepStoryDraftEpisodeDetail
                        lang={lang}
                        seriesId={seriesId}
                        episodeNumber={ep.episodeNumber}
                        item={activeBreakdownByEpisode.get(ep.episodeNumber)}
                        readOnly={readOnly}
                        episodeAlreadyCreated={createdEpisodeNumberSet.has(
                          ep.episodeNumber
                        )}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            {onViewEpisodes ? (
              <button
                type="button"
                onClick={onViewEpisodes}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                {lang === "th"
                  ? 'ดูตอนย่อยจริงที่สร้างแล้วได้ที่แท็บ "ตอนย่อย"'
                  : 'See the actual created Sub-episodes in the "Sub-episodes" tab'}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {lang === "th"
                  ? 'ดูตอนย่อยจริงที่สร้างแล้วได้ที่แท็บ "ตอนย่อย"'
                  : 'See the actual created Sub-episodes in the "Sub-episodes" tab'}
              </p>
            )}
            {/* W12 (consolidated primary action) — this standalone Regenerate
                button is HIDDEN once the flag is on: its behavior now lives
                inside VerticalDramaDeepStoryDraftsActions' confirm dialog as
                the "rewrite everything" scope. Flag off -> byte-identical. */}
            {!readOnly && !deepDraftsFlagEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate({ seriesId })}
                disabled={generateMutation.isPending}
                className="gap-2"
              >
                {generateMutation.isPending && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {lang === "th" ? "สร้างใหม่อีกครั้ง" : "Regenerate"}
              </Button>
            )}
            {deepDraftsFlagEnabled && (
              <VerticalDramaDeepStoryDraftsActions
                lang={lang}
                seriesId={seriesId}
                readOnly={readOnly}
                targetEpisodeCount={targetEpisodeCount}
                deepDraftSummary={deepDraftSummary}
                hasPlan={true}
                onGenerateStoryBible={runGenerateStoryBible}
                userPremise={expanded.userPremise}
                onEditPremiseClick={onEditPremiseClick}
                isLineageSeries={isLineageSeries}
              />
            )}
          </>
        )}
      </CardContent>
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {lang === "th"
                ? "คัดลอกเนื้อเรื่องพร้อมบทพูด"
                : "Copy story with dialogue"}
            </DialogTitle>
            <DialogDescription>
              {lang === "th"
                ? "เลือกช่วงตอนย่อยที่ต้องการคัดลอก ระบบจะใส่เรื่องย่อรายตอนย่อยและบทพูดครบทุกช็อตเท่าที่ clipboard รองรับ"
                : "Choose a Sub-episode range. The copied text includes each Sub-episode summary and every shot's dialogue, capped to what the clipboard can handle."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopyFromEpisode(firstEpisodeNumber);
                  setCopyToEpisode(lastEpisodeNumber);
                }}
              >
                {lang === "th" ? "ทั้งหมด" : "All"}
              </Button>
              {draftedEpisodeNumbers.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCopyFromEpisode(draftedEpisodeNumbers[0]);
                    setCopyToEpisode(
                      draftedEpisodeNumbers[draftedEpisodeNumbers.length - 1]
                    );
                  }}
                >
                  {lang === "th"
                    ? "ตอนย่อยที่ร่างละเอียดแล้ว"
                    : "Detailed Sub-episodes"}
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {lang === "th" ? "จากตอนย่อยที่" : "From Sub-episode"}
                </Label>
                <Select
                  value={String(effectiveCopyFrom)}
                  onValueChange={value => setCopyFromEpisode(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {episodePlans.map(episode => (
                      <SelectItem
                        key={episode.episodeNumber}
                        value={String(episode.episodeNumber)}
                      >
                        {lang === "th"
                          ? `ตอนย่อยที่ ${episode.episodeNumber}`
                          : `Sub-episode ${episode.episodeNumber}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {lang === "th" ? "ถึงตอนย่อยที่" : "To Sub-episode"}
                </Label>
                <Select
                  value={String(effectiveCopyTo)}
                  onValueChange={value => setCopyToEpisode(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {episodePlans.map(episode => (
                      <SelectItem
                        key={episode.episodeNumber}
                        value={String(episode.episodeNumber)}
                      >
                        {lang === "th"
                          ? `ตอนย่อยที่ ${episode.episodeNumber}`
                          : `Sub-episode ${episode.episodeNumber}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {lang === "th"
                ? `พร้อมคัดลอก ${selectedCopy.copiedEpisodeNumbers.length} ตอนย่อย · ประมาณ ${selectedCopy.text.length.toLocaleString("th-TH")} ตัวอักษร`
                : `Ready to copy ${selectedCopy.copiedEpisodeNumbers.length} Sub-episode(s) · about ${selectedCopy.text.length.toLocaleString("en-US")} characters`}
              {selectedCopy.omittedEpisodeNumbers.length > 0 && (
                <span className="block pt-1 text-amber-600">
                  {lang === "th"
                    ? `ข้อความยาวเกิน จึงจะเว้นตอนย่อยที่ ${selectedCopy.omittedEpisodeNumbers.join(", ")}`
                    : `Too long; Sub-episode(s) ${selectedCopy.omittedEpisodeNumbers.join(", ")} will be omitted.`}
                </span>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              onClick={copySelectedStory}
              className="gap-2"
              disabled={selectedCopy.text.trim().length === 0}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {lang === "th" ? "คัดลอกช่วงที่เลือก" : "Copy selected range"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * "Save as preset" (section-11) — reuses the series the user is already
 * editing instead of a separate preset-management screen. Non-admins always
 * save privately (visible only to them); the "publish globally" checkbox only
 * renders for admins, and only they can make a preset visible to every user.
 */
function SaveAsPresetCard({
  lang,
  seriesId,
  seriesTitle,
}: {
  lang: "th" | "en";
  seriesId: string;
  seriesTitle: string;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(seriesTitle);
  const [publishGlobally, setPublishGlobally] = useState(false);

  const saveMutation = trpc.verticalDramaSeries.saveSeriesAsPreset.useMutation({
    onSuccess: () => {
      toast.success(pickCopy(lang, verticalDramaCopy.saveAsPresetSuccess));
      setOpen(false);
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message || pickCopy(lang, verticalDramaCopy.saveAsPresetError)
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Save className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, verticalDramaCopy.saveAsPreset)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          {pickCopy(lang, verticalDramaCopy.saveAsPresetDialogBody)}
        </p>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            setTitle(seriesTitle);
            setOpen(true);
          }}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, verticalDramaCopy.saveAsPreset)}
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pickCopy(lang, verticalDramaCopy.saveAsPresetDialogTitle)}
            </DialogTitle>
            <DialogDescription>
              {pickCopy(lang, verticalDramaCopy.saveAsPresetDialogBody)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {pickCopy(lang, verticalDramaCopy.presetTitleLabel)}
              </Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {isAdmin && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="publish-globally"
                  checked={publishGlobally}
                  onCheckedChange={checked =>
                    setPublishGlobally(checked === true)
                  }
                />
                <div className="grid gap-0.5">
                  <Label
                    htmlFor="publish-globally"
                    className="text-sm font-medium"
                  >
                    {pickCopy(lang, verticalDramaCopy.publishGlobally)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {pickCopy(lang, verticalDramaCopy.publishGloballyHint)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saveMutation.isPending}
            >
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              onClick={() =>
                saveMutation.mutate({
                  seriesId,
                  title: title.trim(),
                  publishGlobally: isAdmin ? publishGlobally : undefined,
                })
              }
              disabled={saveMutation.isPending || title.trim().length === 0}
              className="gap-2"
            >
              {saveMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {lang === "th" ? "บันทึก" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
