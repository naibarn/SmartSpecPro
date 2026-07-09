/**
 * VerticalDramaSharedSeriesPage — the PUBLIC, unauthenticated read-only
 * viewer for a Vertical Drama Series share link (task #32, Collab-lite L1,
 * F131AA). Route: `/share/vd/:token`, registered in `App.tsx` OUTSIDE any
 * `RequireAuth`/`RequireVerticalDramaSeries` wrapper — same "standalone
 * public page, no app shell" convention as `Login.tsx`/`Signup.tsx`
 * (deliberately does NOT use `AppPage`/`VerticalDramaShell`, which assume an
 * authenticated app-shell context).
 *
 * Deliberately imports ONLY generic, non-owner UI primitives (Card/Badge/
 * Accordion) plus this feature's own standalone
 * `verticalDramaShareCopy.ts` — never any owner-oriented interactive
 * component from `components/verticalDramaSeries/` (no edit affordances,
 * no action buttons anywhere on this page).
 *
 * Data comes from the single public procedure
 * `trpc.verticalDramaShare.getSharedSeries` — a fully pre-whitelisted DTO
 * (see `server/services/verticalDramaShareLinks.ts`). This page renders
 * exactly what it receives and nothing more; it does not need its own
 * leak-prevention logic since the server never sends more than the
 * whitelist.
 */

import { useEffect, useRef } from "react";
import { useRoute } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trpc } from "@/lib/trpc";
import {
  pickCopy,
  useVerticalDramaShareLang,
  verticalDramaShareCopy,
  type VerticalDramaShareLang,
} from "@/components/verticalDramaSeries/verticalDramaShareCopy";

interface SharedSeriesDialogueLine {
  speaker: string;
  text: string;
}

interface SharedSeriesEpisode {
  episodeNumber: number;
  title: string | null;
  roughStatus: "draft" | "scripted" | "video";
  logline: string | null;
  dialogue?: SharedSeriesDialogueLine[];
}

interface SharedSeriesProjection {
  series: {
    title: string;
    genre: string | null;
    tone: string | null;
    targetEpisodeCount: number;
  };
  overview: {
    logline: string | null;
    mainPlot: string | null;
    seasonArc: string | null;
  };
  episodes: SharedSeriesEpisode[];
}

/** Exported for direct unit testing — pure label lookup, no component mount needed. */
export function roughStatusLabel(
  status: SharedSeriesEpisode["roughStatus"],
  lang: VerticalDramaShareLang,
): string {
  if (status === "video") return pickCopy(lang, verticalDramaShareCopy.episodeStatusVideo);
  if (status === "scripted") return pickCopy(lang, verticalDramaShareCopy.episodeStatusScripted);
  return pickCopy(lang, verticalDramaShareCopy.episodeStatusDraft);
}

export default function VerticalDramaSharedSeriesPage() {
  const [, params] = useRoute("/share/vd/:token");
  const token = params?.token ?? "";
  const lang = useVerticalDramaShareLang();

  // useMutation (not useQuery) on purpose: the server procedure is a
  // `.mutation()` so the raw share token travels in the POST body instead
  // of a GET query string that nginx access logs would record in plaintext
  // (security review 2026-07-09, finding #1 — CLAUDE.md "NEVER pass secrets
  // as URL query parameters"). Fired exactly once per token on mount; no
  // retry — a NOT_FOUND (unknown/expired/revoked token) is never transient,
  // so retrying only burns the public read-path's rate-limit budget.
  const query = trpc.verticalDramaShare.getSharedSeries.useMutation({ retry: false });
  const fetchedTokenRef = useRef<string | null>(null);
  const fetchShared = query.mutate;
  useEffect(() => {
    if (!token || fetchedTokenRef.current === token) return;
    fetchedTokenRef.current = token;
    fetchShared({ token });
  }, [token, fetchShared]);

  // Covers both the pre-effect idle render and the in-flight request; a
  // settled-but-empty result (defensive, server never does this) falls
  // through to the error card below instead of spinning forever.
  if (Boolean(token) && (query.isIdle || query.isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground" data-testid="vd-shared-viewer-loading">
          {pickCopy(lang, verticalDramaShareCopy.viewerLoading)}
        </p>
      </div>
    );
  }

  if (!token || query.isError || !query.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center" data-testid="vd-shared-viewer-error">
          <CardHeader>
            <CardTitle>{pickCopy(lang, verticalDramaShareCopy.notFoundTitle)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {pickCopy(lang, verticalDramaShareCopy.notFoundBody)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { series, overview, episodes } = query.data as SharedSeriesProjection;
  const hasOverview = Boolean(overview.logline || overview.mainPlot || overview.seasonArc);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div
          className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-xs font-medium text-primary"
          data-testid="vd-shared-viewer-banner"
        >
          {pickCopy(lang, verticalDramaShareCopy.viewerBanner)}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold" data-testid="vd-shared-series-title">
            {series.title}
          </h1>
          <div className="flex flex-wrap gap-2">
            {series.genre ? <Badge variant="secondary">{series.genre}</Badge> : null}
            {series.tone ? <Badge variant="outline">{series.tone}</Badge> : null}
            <Badge variant="outline">
              {pickCopy(lang, verticalDramaShareCopy.episodeCountLabel)}: {series.targetEpisodeCount}
            </Badge>
          </div>
        </div>

        {hasOverview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {pickCopy(lang, verticalDramaShareCopy.overviewTitle)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {overview.logline ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {pickCopy(lang, verticalDramaShareCopy.loglineLabel)}
                  </p>
                  <p>{overview.logline}</p>
                </div>
              ) : null}
              {overview.mainPlot ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {pickCopy(lang, verticalDramaShareCopy.mainPlotLabel)}
                  </p>
                  <p className="whitespace-pre-wrap">{overview.mainPlot}</p>
                </div>
              ) : null}
              {overview.seasonArc ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {pickCopy(lang, verticalDramaShareCopy.seasonArcLabel)}
                  </p>
                  <p className="whitespace-pre-wrap">{overview.seasonArc}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {pickCopy(lang, verticalDramaShareCopy.episodesTitle)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {episodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {pickCopy(lang, verticalDramaShareCopy.episodesEmpty)}
              </p>
            ) : (
              <Accordion type="multiple" className="w-full" data-testid="vd-shared-episode-list">
                {episodes.map(episode => (
                  <AccordionItem key={episode.episodeNumber} value={String(episode.episodeNumber)}>
                    <AccordionTrigger data-testid={`vd-shared-episode-trigger-${episode.episodeNumber}`}>
                      <div className="flex flex-1 items-center justify-between gap-2 pr-2 text-left">
                        <span>
                          {episode.episodeNumber}.{" "}
                          {episode.title ||
                            `${pickCopy(lang, verticalDramaShareCopy.episodeFallbackTitle)} ${episode.episodeNumber}`}
                        </span>
                        <Badge variant="outline">{roughStatusLabel(episode.roughStatus, lang)}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      {episode.logline ? (
                        <p className="text-sm text-muted-foreground">{episode.logline}</p>
                      ) : null}
                      {episode.dialogue && episode.dialogue.length > 0 ? (
                        <div className="space-y-1.5 rounded-md bg-muted/40 p-3">
                          {episode.dialogue.map((line, index) => (
                            <p key={index} className="text-sm">
                              <span className="font-medium">{line.speaker}: </span>
                              {line.text}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {pickCopy(lang, verticalDramaShareCopy.dialogueEmpty)}
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
