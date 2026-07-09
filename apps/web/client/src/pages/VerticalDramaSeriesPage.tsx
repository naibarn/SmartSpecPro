/**
 * VerticalDramaSeriesPage (spec feature 131, section 03 · §8.1–8.2).
 *
 * Feature-flagged Dashboard workspace entry: a series list (search/filter,
 * status chips, next-episode, last-edited, missing-approval badge, product
 * tie-in marker, Thai create button) plus the 6-step Create-Series Wizard that
 * runs in DRY-RUN mode — reaching Review and confirming creates a series shell
 * only and never triggers paid generation.
 *
 * The base series router (`trpc.verticalDramaSeries`) is wired into the tRPC
 * app router by the conductor; this page consumes `list` / `create`.
 */

import { useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  Clapperboard,
  Search,
  ShoppingBag,
  Sparkles,
  Plus,
} from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  pickCopy,
  seriesStatusCopy,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VerticalDramaShell, useVerticalDramaShell } from "@/components/verticalDramaSeries/VerticalDramaShell";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const STATUS_FILTERS: Array<VerticalDramaSeriesStatus | "all"> = [
  "all",
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
];

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "completed") return "secondary";
  if (status === "archived" || status === "paused") return "outline";
  return "secondary";
}

function formatRelative(value: Date | string | null | undefined, lang: "th" | "en"): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function VerticalDramaSeriesPage() {
  const lang = useVerticalDramaLang();
  return (
    <VerticalDramaShell>
      <VerticalDramaSeriesListContent lang={lang} />
    </VerticalDramaShell>
  );
}

function VerticalDramaSeriesListContent({ lang }: { lang: "th" | "en" }) {
  const { openCreateWizard } = useVerticalDramaShell();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VerticalDramaSeriesStatus | "all">("all");

  const listQuery = trpc.verticalDramaSeries.list.useQuery(
    {
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { staleTime: 30_000 },
  );

  const series = listQuery.data?.series ?? [];

  const pageState: AppPageState = listQuery.isLoading
    ? "loading"
    : listQuery.isError
      ? "error"
      : series.length === 0
        ? "empty"
        : "ready";

  return (
    <AppPage
      title={pickCopy(lang, verticalDramaCopy.menuTitle)}
      description={pickCopy(lang, verticalDramaCopy.planningOnly)}
      actions={
        <Button
          onClick={openCreateWizard}
          className="shrink-0 gap-2"
          aria-label={pickCopy(lang, verticalDramaCopy.createSeries)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, verticalDramaCopy.createSeries)}
        </Button>
      }
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pickCopy(lang, verticalDramaCopy.searchPlaceholder)}
              aria-label={pickCopy(lang, verticalDramaCopy.searchPlaceholder)}
              className="pl-9"
            />
          </div>
          <div
            role="group"
            aria-label={pickCopy(lang, verticalDramaCopy.allStatuses)}
            className="flex flex-wrap gap-1.5"
          >
            {STATUS_FILTERS.map((status) => {
              const active = statusFilter === status;
              const label =
                status === "all"
                  ? pickCopy(lang, verticalDramaCopy.allStatuses)
                  : pickCopy(lang, seriesStatusCopy[status]);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      }
      state={pageState}
      loadingSkeleton={<SeriesListSkeleton />}
      error={{
        title: pickCopy(lang, verticalDramaCopy.errorTitle),
        description: listQuery.error?.message,
        onRetry: () => listQuery.refetch(),
      }}
      empty={{
        title: pickCopy(lang, verticalDramaCopy.emptyTitle),
        description: pickCopy(lang, verticalDramaCopy.emptyBody),
        icon: <Sparkles className="h-6 w-6" aria-hidden="true" />,
        actions: (
          <Button onClick={openCreateWizard} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.createSeries)}
          </Button>
        ),
      }}
    >
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {series.map((item) => (
          <li key={item.id}>
            <SeriesCard lang={lang} series={item} />
          </li>
        ))}
      </ul>
    </AppPage>
  );
}

/* -------------------------------------------------------------------------- */
/* Series card                                                                */
/* -------------------------------------------------------------------------- */

interface SeriesListItem {
  id: string;
  title: string;
  status: string;
  nextEpisodeNumber: number;
  episodeCount: number;
  pendingApprovalCount: number;
  productTieInEnabled: boolean;
  thumbnailUrl?: string | null;
  updatedAt?: Date | string | null;
}

function SeriesCard({ lang, series }: { lang: "th" | "en"; series: SeriesListItem }) {
  const statusLabel =
    seriesStatusCopy[series.status as VerticalDramaSeriesStatus] != null
      ? pickCopy(lang, seriesStatusCopy[series.status as VerticalDramaSeriesStatus])
      : series.status;

  return (
    <Link href={verticalDramaRoutes.seriesDetail(series.id)}>
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="truncate text-base">{series.title}</CardTitle>
            <Badge variant={statusBadgeVariant(series.status)}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex gap-3 text-sm">
          {series.thumbnailUrl ? (
            <img
              src={series.thumbnailUrl}
              alt=""
              aria-hidden="true"
              className="aspect-[9/16] w-16 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex aspect-[9/16] w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40"
            >
              <Clapperboard className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <dl className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>
                <dt className="text-xs">{pickCopy(lang, verticalDramaCopy.nextEpisode)}</dt>
                <dd className="font-medium text-foreground">EP {series.nextEpisodeNumber}</dd>
              </div>
              <div>
                <dt className="text-xs">{pickCopy(lang, verticalDramaCopy.episodes)}</dt>
                <dd className="font-medium text-foreground">{series.episodeCount}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs">{pickCopy(lang, verticalDramaCopy.lastEdited)}</dt>
                <dd className="font-medium text-foreground">
                  {formatRelative(series.updatedAt, lang)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {series.pendingApprovalCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {pickCopy(lang, verticalDramaCopy.missingApproval)} ({series.pendingApprovalCount})
                </Badge>
              )}
              {series.productTieInEnabled && (
                <Badge variant="outline" className="gap-1">
                  <ShoppingBag className="h-3 w-3" aria-hidden="true" />
                  {pickCopy(lang, verticalDramaCopy.productTieIn)}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function SeriesListSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Card className="h-40">
            <CardContent className="flex h-full flex-col gap-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-auto h-6 w-24" />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

