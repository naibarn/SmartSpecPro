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

import { useMemo, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { toast } from "sonner";
import { Clapperboard, Loader2, Plus, Save, Sparkles } from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
import { VerticalDramaSeriesTrailerPanel } from "@/components/verticalDramaSeries/VerticalDramaSeriesTrailerPanel";
import { VerticalDramaShell } from "@/components/verticalDramaSeries/VerticalDramaShell";
import { VerticalDramaSettingsTab } from "@/components/verticalDramaSeries/VerticalDramaSettingsTab";
import { VerticalDramaProductTieInTab } from "@/components/verticalDramaSeries/VerticalDramaProductTieInTab";
import { VerticalDramaAssetsTab } from "@/components/verticalDramaSeries/VerticalDramaAssetsTab";
import { VerticalDramaSeriesMemoryTab } from "@/components/verticalDramaSeries/VerticalDramaSeriesMemoryTab";
import { VerticalDramaSeriesShareDialog } from "@/components/verticalDramaSeries/VerticalDramaSeriesShareDialog";
import { getActiveBreakdownItemsForDisplay } from "@/components/verticalDramaSeries/VerticalDramaArcReplanCard";
import {
  VerticalDramaDeepStoryDraftEpisodeDetail,
  VerticalDramaDeepStoryDraftsActions,
  readDeepDraftShotDrafts,
  type VerticalDramaDeepDraftSummary,
} from "@/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel";
import {
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

type TabId =
  | "overview"
  | "episodes"
  | "bible"
  | "characters"
  | "memory"
  | "product"
  | "assets"
  | "settings";

const ALL_TABS: TabId[] = [
  "overview",
  "episodes",
  "bible",
  "characters",
  "memory",
  "product",
  "assets",
  "settings",
];
const STORY_TABS: TabId[] = ["bible", "characters", "memory"];
const ADVANCED_TABS: TabId[] = ["product", "assets", "settings"];

const tabLabels: Record<TabId, { th: string; en: string }> = {
  overview: { th: "ภาพรวม", en: "Overview" },
  episodes: { th: "ตอน", en: "Episodes" },
  bible: { th: "ไบเบิล", en: "Bible" },
  characters: { th: "ตัวละคร", en: "Characters" },
  memory: { th: "ความจำซีรีย์", en: "Memory" },
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
  const [activeTab, setActiveTab] = useState<TabId>(() => resolveInitialSeriesTab(search));
  // W10-C (spec F131T) — resolved once here and passed down as a prop so
  // `StoryBibleOverviewCard` (and the deep-draft child components it
  // conditionally mounts) stay fully prop-driven; flag off -> those children
  // never mount, so the Overview tab renders byte-identical to today.
  const deepDraftsFlagEnabled = useTenantFeatureFlag("verticalDramaSeriesDeepStoryDrafts");
  // W12-B voice chain wave — gates the Characters tab's per-character voice
  // casting card (`VerticalDramaCharacterVoiceCastingCard`, mounted from
  // `VerticalDramaCharacterStockPanel.tsx`). Same fail-closed convention as
  // `deepDraftsFlagEnabled` above.
  const voiceChainEnabled = useTenantFeatureFlag("verticalDramaSeriesVoiceChain");
  // Task #32 (Collab-lite L1, added 2026-07-09) — gates ONLY the "แชร์ซีรีส์"
  // header button (`VerticalDramaSeriesShareDialog` self-gates on this prop,
  // same convention as `deepDraftsFlagEnabled` above). The public viewer
  // route (`/share/vd/:token`) is intentionally NOT gated by this flag —
  // see `routers/verticalDramaShare.ts`'s own doc comment for why.
  const shareLinksEnabled = useTenantFeatureFlag("verticalDramaSeriesShareLinks");

  const detailQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 30_000 },
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
      }
    | undefined;
  const episodes = (detailQuery.data?.episodes ?? []) as Array<{
    id: string;
    episodeNumber: number;
    title?: string | null;
    status: string;
    thumbnailUrl?: string | null;
    updatedAt?: Date | string | null;
  }>;

  // All 8 tabs are always reachable; these flags only drive a "needs
  // attention" indicator on the tabs whose group has no content yet, so the
  // user can see at a glance what's filled in vs. what still needs work.
  const storyPopulated = Boolean(series?.bible || series?.memory || episodes.length > 0);
  const advancedPopulated = Boolean(series?.productTieIn?.enabled);
  const isArchived = series?.status === "archived";

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
      ? pickCopy(lang, seriesStatusCopy[series.status as VerticalDramaSeriesStatus])
      : series.status
    : undefined;

  return (
    <VerticalDramaShell currentSeriesId={seriesId}>
      <AppPage
        title={pageTitle}
        breadcrumbs={[
          { label: pickCopy(lang, verticalDramaCopy.menuTitle), href: verticalDramaRoutes.seriesList() },
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
                <Badge variant="outline">{pickCopy(lang, verticalDramaCopy.readOnly)}</Badge>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
              <TabsList className="flex-wrap">
                {ALL_TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="gap-1.5">
                    {pickCopy(lang, tabLabels[tab])}
                    {needsAttention[tab] ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                        aria-label={lang === "th" ? "ยังไม่มีข้อมูล" : "Needs attention"}
                        title={lang === "th" ? "ยังไม่มีข้อมูล" : "Needs attention"}
                      />
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {lang === "th" ? "การกระทำถัดไปที่ปลอดภัย" : "Next safe action"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {episodes.length === 0
                      ? lang === "th"
                        ? "ยังไม่มีตอน — เพิ่มตอนแรกเพื่อเริ่มวางแผน (ยังไม่มีค่าใช้จ่าย)"
                        : "No episodes yet — add the first episode to start planning (no paid generation)."
                      : lang === "th"
                        ? "เปิดตอนล่าสุดเพื่อดำเนินการขั้นต่อไป"
                        : "Open the latest episode to continue to the next stage."}
                  </CardContent>
                </Card>

                <StoryBibleOverviewCard
                  lang={lang}
                  seriesId={seriesId}
                  bible={series.bible}
                  genre={series.genre}
                  tone={series.tone}
                  targetEpisodeCount={series.targetEpisodeCount}
                  readOnly={isArchived}
                  onViewEpisodes={() => setActiveTab("episodes")}
                  onEpisodesGenerated={() => detailQuery.refetch()}
                  deepDraftsFlagEnabled={deepDraftsFlagEnabled}
                  deepDraftSummary={series.deepDraftSummary}
                  createdEpisodeNumbers={episodes.map((episode) => episode.episodeNumber)}
                />

                {!isArchived && (
                  <SaveAsPresetCard lang={lang} seriesId={seriesId} seriesTitle={series.title} />
                )}
              </TabsContent>

              <TabsContent value="episodes" className="pt-4">
                <EpisodesTab lang={lang} seriesId={seriesId} episodes={episodes} readOnly={isArchived} />
              </TabsContent>

              {STORY_TABS.concat(ADVANCED_TABS).map((tab) => (
                <TabsContent key={tab} value={tab} className="pt-4">
                  {tab === "characters" ? (
                    <VerticalDramaCharacterStockPanel
                      seriesId={seriesId}
                      readOnly={isArchived}
                      voiceChainEnabled={voiceChainEnabled}
                    />
                  ) : tab === "bible" ? (
                    <StoryBibleTab
                      lang={lang}
                      seriesId={seriesId}
                      locale={series.locale}
                      bible={series.bible}
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
                      defaultEpisodeDurationSeconds={series.defaultEpisodeDurationSeconds}
                      locale={series.locale}
                      bible={series.bible}
                      readOnly={isArchived}
                      onSaved={() => detailQuery.refetch()}
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
                    <PlaceholderTab lang={lang} label={pickCopy(lang, tabLabels[tab])} readOnly={isArchived} />
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
  }>;
  readOnly: boolean;
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
    "verticalDramaSeriesVoiceChain",
  );
  const episodeNumberById = useMemo(
    () => new Map(episodes.map((ep) => [ep.id, ep.episodeNumber])),
    [episodes],
  );
  const [seasonRenderDialogOpen, setSeasonRenderDialogOpen] = useState(false);
  const [seasonRenderIncludeDialogueAudio, setSeasonRenderIncludeDialogueAudio] =
    useState(false);
  const [seasonRenderLoudnessNormalize, setSeasonRenderLoudnessNormalize] =
    useState(false);
  const [seasonRenderSubtitlePreset, setSeasonRenderSubtitlePreset] =
    useState<VdFinalRenderSubtitlePresetValue>("classic_box");
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
      },
    });
  }

  const generateNextEpisodesMutation = trpc.verticalDramaEpisodes.generateNextEpisodes.useMutation({
    onSuccess: (data: {
      episodes: Array<{ id: string; episodeNumber: number; title: string | null; status: string }>;
      creditsUsed: number;
      source: "breakdown" | "generated" | "mixed";
    }) => {
      const credited = data.creditsUsed > 0;
      toast.success(
        lang === "th"
          ? `เพิ่ม ${data.episodes.length} ตอนแล้ว${credited ? ` (ใช้ ${data.creditsUsed} เครดิต)` : ""}`
          : `Added ${data.episodes.length} episode(s)${credited ? ` (${data.creditsUsed} credits used)` : ""}`,
      );
      void utils.verticalDramaSeries.get.invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message || (lang === "th" ? "เพิ่มตอนไม่สำเร็จ" : "Failed to add episode"),
      );
    },
  });

  const isAdding = generateNextEpisodesMutation.isPending;
  const handleAddEpisode = () => {
    generateNextEpisodesMutation.mutate({ seriesId, count: 1 });
  };

  if (episodes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {lang === "th" ? "ยังไม่มีตอนในซีรีย์นี้" : "This series has no episodes yet."}
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={isAdding}
              onClick={handleAddEpisode}
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {lang === "th" ? "เพิ่มตอนแรก" : "Add first episode"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {episodes.map((ep) => (
          <li key={ep.id}>
            <Link href={verticalDramaRoutes.episode(seriesId, ep.id)}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
                <CardContent className="flex items-center justify-between gap-3 p-4">
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
                        <Clapperboard className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        EP {ep.episodeNumber}
                        {ep.title ? ` · ${ep.title}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{ep.status}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{pickCopy(lang, verticalDramaCopy.open)}</Badge>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isAdding}
            onClick={handleAddEpisode}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {lang === "th" ? "เพิ่มตอน" : "Add episode"}
          </Button>
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
                .map(
                  (s) => episodeNumberById.get(s.episodeId) ?? s.episodeId,
                )
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
                {seasonRenderResult.skipped.map((s) => (
                  <li key={s.episodeId}>
                    EP {episodeNumberById.get(s.episodeId) ?? s.episodeId}:{" "}
                    {vdSeasonRenderSkipReasonLabel(s.reason, lang)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

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
                    onCheckedChange={(checked) =>
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
                    onCheckedChange={(checked) =>
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
                onValueChange={(v) =>
                  setSeasonRenderSubtitlePreset(
                    v as VdFinalRenderSubtitlePresetValue,
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
                  {VD_FINAL_RENDER_SUBTITLE_PRESET_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {vdFinalRenderSubtitlePresetLabel(id, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
  logline?: string;
  mainPlot?: string;
  seasonArc?: string;
  visualStyle?: string;
  cliffhangerStyle?: string;
  charactersDraft?: Array<{ name: string; role: string; description: string }>;
  // LLM-expanded fields, present after "Generate story".
  expandedSeasonArc?: string;
  refinedCharacters?: Array<{ name: string; role: string; description: string }>;
  episodeBreakdown?: Array<{
    episodeNumber: number;
    workingTitle: string;
    logline: string;
    keyBeats: string[];
  }>;
  expandedAt?: string;
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
  const hasRefinedCharacters = Boolean(b.refinedCharacters && b.refinedCharacters.length > 0);
  const fields: Array<{ key: keyof ExpandedStoryBible; label: { th: string; en: string } }> = [
    { key: "logline", label: { th: "โลจไลน์", en: "Logline" } },
    { key: "mainPlot", label: { th: "โครงเรื่องหลัก", en: "Main plot" } },
    { key: "visualStyle", label: { th: "สไตล์ภาพ", en: "Visual style" } },
    { key: "cliffhangerStyle", label: { th: "สไตล์ปมค้างตอนจบ", en: "Cliffhanger style" } },
  ];

  return (
    <div className="space-y-4">
      {readOnly && (
        <Badge variant="outline">{pickCopy(lang, verticalDramaCopy.readOnly)}</Badge>
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
            {lang === "th" ? "ไบเบิลเรื่อง (จากขั้นตอนสร้าง)" : "Story bible (from wizard)"}
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
                  <p className="text-xs text-muted-foreground">{c.description}</p>
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

/**
 * Overview card for the "Generate story" action (spec addendum) — the first
 * real, credit-consuming LLM call in this feature. Shows the expanded season
 * arc + episode breakdown once generated, or a Generate/retry CTA otherwise.
 */
export function StoryBibleOverviewCard({
  lang,
  seriesId,
  bible,
  genre,
  tone,
  targetEpisodeCount,
  readOnly,
  onViewEpisodes,
  onEpisodesGenerated,
  deepDraftsFlagEnabled = false,
  deepDraftSummary,
  createdEpisodeNumbers = [],
}: {
  lang: "th" | "en";
  seriesId: string;
  bible: unknown;
  genre?: string | null;
  tone?: string | null;
  targetEpisodeCount?: number | null;
  readOnly: boolean;
  onViewEpisodes?: () => void;
  onEpisodesGenerated?: () => void;
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
}) {
  const utils = trpc.useUtils();
  const expanded = (bible ?? {}) as ExpandedStoryBible;
  const createdEpisodeNumberSet = useMemo(() => new Set(createdEpisodeNumbers), [createdEpisodeNumbers]);
  const hasStory = Boolean(expanded.episodeBreakdown && expanded.episodeBreakdown.length > 0);
  // W10-C — resolves the SAME active-breakdown-version the server uses for
  // deep drafts (`getActiveBreakdown` in the server-only
  // `verticalDramaStoryBible.ts`), so per-episode shot drafts/cliffhanger
  // lines/completeness (persisted onto `bible.breakdownVersions[]`, not the
  // legacy top-level `bible.episodeBreakdown` this card otherwise reads) are
  // still found by episode number. Flag-gated so there is zero extra work
  // when the flag is off.
  const activeBreakdownByEpisode = useMemo(() => {
    if (!deepDraftsFlagEnabled) return new Map<number, ReturnType<typeof getActiveBreakdownItemsForDisplay>[number]>();
    return new Map(getActiveBreakdownItemsForDisplay(bible).map((item) => [item.episodeNumber, item]));
  }, [deepDraftsFlagEnabled, bible]);
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
    for (const item of getActiveBreakdownItemsForDisplay(bible)) {
      if (!item.tieIn) continue;
      const shotDrafts = readDeepDraftShotDrafts(item);
      map.set(item.episodeNumber, {
        planned: item.tieIn.planned,
        isDrafted: shotDrafts !== null,
        hasMarkedShot: shotDrafts?.some((shot) => shot.tie_in?.has_product_moment === true) ?? false,
      });
    }
    return map;
  }, [bible]);

  // After a full story is (re)generated, materialize the newly-planned
  // episodes into real episode rows for free — this only ever hits Mode A
  // ("materialize from plan", no LLM call, no credits) since the plan was
  // just freshly written and can't be exhausted yet. Its failure is a
  // convenience-add-on failure, not a Story Bible generation failure, so it
  // gets its own toast and never blocks/overrides the success toast above.
  const generateNextEpisodesMutation = trpc.verticalDramaEpisodes.generateNextEpisodes.useMutation({
    onSuccess: (data: { episodes: Array<{ id: string }> }) => {
      if (data.episodes.length > 0) {
        toast.success(
          lang === "th"
            ? `สร้างตอนจริง ${data.episodes.length} ตอนจากแผนแล้ว`
            : `Created ${data.episodes.length} real episode(s) from the plan`,
        );
      }
      void utils.verticalDramaSeries.get.invalidate();
      onEpisodesGenerated?.();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ||
          (lang === "th"
            ? 'สร้างเนื้อเรื่องเต็มสำเร็จ แต่สร้างตอนจริงจากแผนไม่สำเร็จ — ลองกด "เพิ่มตอน" ในแท็บตอนได้'
            : 'Story generated, but creating real episodes from the plan failed — try "Add episode" in the Episodes tab.'),
      );
    },
  });

  const generateMutation = trpc.verticalDramaSeries.generateStoryBible.useMutation({
    onSuccess: (data: { creditsUsed: number }) => {
      toast.success(
        lang === "th"
          ? `สร้างเนื้อเรื่องเต็มแล้ว (ใช้ ${data.creditsUsed} เครดิต)`
          : `Full story generated (${data.creditsUsed} credits used)`,
      );
      void utils.verticalDramaSeries.get.invalidate();
      // Materialize the plan into real episode rows (free Mode A path).
      generateNextEpisodesMutation.mutate({ seriesId, count: 5 });
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "สร้างเนื้อเรื่องเต็มไม่สำเร็จ" : "Story generation failed"));
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
      `${lang === "th" ? "จำนวนตอนเป้าหมาย" : "Target episodes"}: ${targetEpisodeCount}`,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {lang === "th" ? "เนื้อเรื่องเต็ม" : "Full story"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {contextParts.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground">{contextParts.join(" · ")}</p>
        )}
        {!hasStory ? (
          <>
            <p className="text-muted-foreground">
              {lang === "th"
                ? "ยังไม่ได้สร้างเนื้อเรื่องเต็ม — กดเพื่อขยายโครงเรื่อง/เรื่องย่อ/ตัวละครให้เป็นเนื้อเรื่องเต็มพร้อมแบ่งตอน แล้วสร้างตอนจริงให้อัตโนมัติ (ใช้เครดิต)"
                : "No full story yet — generate one to expand the plot/logline/characters into a full episode-by-episode story, and real episodes will be created automatically (uses credits)."}
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
                />
              ) : (
                <Button
                  onClick={() => generateMutation.mutate({ seriesId })}
                  disabled={generateMutation.isPending}
                  className="gap-2"
                >
                  {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
              <p className="text-muted-foreground">{expanded.expandedSeasonArc}</p>
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {lang === "th" ? "แผนเนื้อเรื่องรายตอน (ร่าง)" : "Episode-by-episode story plan (draft)"}
            </p>
            <ol className="space-y-2">
              {expanded.episodeBreakdown!.map((ep) => {
                const tieInState = tieInStateByEpisode.get(ep.episodeNumber);
                // Task #22 — "warning" tone ONLY once a draft actually exists
                // and still has no shot marked; an undrafted planned episode
                // (or one that IS correctly marked) both read as "normal".
                const tieInDraftMismatch = Boolean(
                  tieInState?.planned && tieInState.isDrafted && !tieInState.hasMarkedShot,
                );
                return (
                  <li key={ep.episodeNumber} className="rounded-md border p-2.5">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span>
                        {lang === "th"
                          ? `ตอนที่ ${ep.episodeNumber} (แผน)`
                          : `Episode ${ep.episodeNumber} (draft plan)`}
                        {` · ${ep.workingTitle}`}
                      </span>
                      {tieInState?.planned ? (
                        <Badge
                          variant={tieInDraftMismatch ? "destructive" : "secondary"}
                          className="text-[10px] font-normal"
                          data-testid={`vd-overview-tie-in-badge-${ep.episodeNumber}`}
                        >
                          {tieInDraftMismatch
                            ? pickTieInDraftCopy(lang, verticalDramaTieInDraftCopy.badgePlannedUnmarked)
                            : pickTieInDraftCopy(lang, verticalDramaTieInDraftCopy.badgePlannedNormal)}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{ep.logline}</p>
                    <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                      {ep.keyBeats.map((beat, i) => (
                        <li key={i}>{beat}</li>
                      ))}
                    </ul>
                    {deepDraftsFlagEnabled && (
                      <VerticalDramaDeepStoryDraftEpisodeDetail
                        lang={lang}
                        seriesId={seriesId}
                        episodeNumber={ep.episodeNumber}
                        item={activeBreakdownByEpisode.get(ep.episodeNumber)}
                        readOnly={readOnly}
                        episodeAlreadyCreated={createdEpisodeNumberSet.has(ep.episodeNumber)}
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
                  ? 'ดูตอนจริงที่สร้างแล้วได้ที่แท็บ "ตอน"'
                  : 'See the actual created episodes in the "Episodes" tab'}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {lang === "th"
                  ? 'ดูตอนจริงที่สร้างแล้วได้ที่แท็บ "ตอน"'
                  : 'See the actual created episodes in the "Episodes" tab'}
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
                {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
              />
            )}
          </>
        )}
      </CardContent>
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
      toast.error(err?.message || pickCopy(lang, verticalDramaCopy.saveAsPresetError));
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
            <DialogTitle>{pickCopy(lang, verticalDramaCopy.saveAsPresetDialogTitle)}</DialogTitle>
            <DialogDescription>{pickCopy(lang, verticalDramaCopy.saveAsPresetDialogBody)}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {pickCopy(lang, verticalDramaCopy.presetTitleLabel)}
              </Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>

            {isAdmin && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="publish-globally"
                  checked={publishGlobally}
                  onCheckedChange={(checked) => setPublishGlobally(checked === true)}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="publish-globally" className="text-sm font-medium">
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saveMutation.isPending}>
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
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {lang === "th" ? "บันทึก" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
