/**
 * VerticalDramaShell (spec feature 131, section 03).
 *
 * Shared PURE-CHROME wrapper for the Series list / Series detail / Episode
 * workspace pages: Media-Studio-style gradient background + a slim sticky
 * brand/back-navigation bar, plus a persistent, collapsible left sidebar
 * listing every series ("project") with search — styled after Storyboard
 * Review's project panel. Also owns the Create-Series Wizard so "New" works
 * from any of the three pages via `useVerticalDramaShell().openCreateWizard()`.
 *
 * This shell intentionally does NOT render a page title, breadcrumb, or
 * page-level actions — each page owns exactly one header via `AppPage`
 * (`@/components/AppPage`), rendered inside `children`. Rendering a title
 * here as well would produce a double header.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Menu,
  Plus,
  Search,
} from "lucide-react";

import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CreateSeriesWizard } from "./CreateSeriesWizard";
import {
  pickCopy,
  sequelBadgeText,
  seriesStatusCopy,
  specialEditionBadgeText,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "./verticalDramaCopy";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "verticalDrama:sidebarCollapsed";
const DESKTOP_SIDEBAR_BREAKPOINT_PX = 1280; // Tailwind `xl:`

/** Best-effort localStorage access. Reads/writes here are only a CONVENIENCE
 *  cache (remembered sidebar-collapsed preference) — never the source of
 *  truth. They MUST NOT throw: `localStorage.setItem` raises
 *  `QuotaExceededError` when the origin's storage is full (common for heavy
 *  users) and `getItem`/`setItem` raise `SecurityError` in
 *  sandboxed/blocked-storage contexts. An unguarded throw here used to abort
 *  the whole click handler BEFORE the real (state) action fired. Swallow the
 *  error and let the real action proceed. */
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

interface VerticalDramaShellContextValue {
  openCreateWizard: () => void;
}

const VerticalDramaShellContext =
  createContext<VerticalDramaShellContextValue | null>(null);

export function useVerticalDramaShell(): VerticalDramaShellContextValue {
  const ctx = useContext(VerticalDramaShellContext);
  if (!ctx) {
    throw new Error(
      "useVerticalDramaShell must be used within a VerticalDramaShell"
    );
  }
  return ctx;
}

interface SidebarSeriesItem {
  id: string;
  title: string;
  status: string;
  nextEpisodeNumber: number;
  episodeCount: number;
  targetEpisodeCount?: number | null;
  pendingApprovalCount: number;
  thumbnailUrl?: string | null;
  /**
   * Stage 2.6 (`planning/vd-series-memory-and-lineage/plan.md`) — lineage
   * badge fields. Feature-detected (same convention as `GenrePreset`'s
   * `visualIdentityJson` in `CreateSeriesWizard.tsx`): `verticalDramaSeries
   * .list` does NOT return these today (it only spreads a hand-picked field
   * set, not the raw row), so this badge renders nothing until that
   * procedure is extended to include them — a backend follow-up, not
   * something this frontend-only task may add (`server/routers/
   * verticalDramaSeries.ts` is out of scope here). Written defensively so it
   * "just works" the moment the query starts returning them.
   */
  createMode?: string | null;
  seasonNumber?: number | null;
  lineage?: { parentTitle?: string } | null;
}

function statusDotClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "completed":
      return "bg-sky-500";
    case "paused":
      return "bg-amber-500";
    case "archived":
      return "bg-slate-400";
    default:
      return "bg-slate-300";
  }
}

export function VerticalDramaShell({
  currentSeriesId,
  children,
}: {
  /** Highlights the matching sidebar card. Each page resolves its own route params. */
  currentSeriesId?: string;
  children: ReactNode;
}) {
  const lang = useVerticalDramaLang();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // Default expanded on desktop/tablet-landscape, collapsed elsewhere — unless
  // the user already made an explicit choice (persisted across the 3 pages).
  useEffect(() => {
    const stored = safeStorageGet(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (stored != null) {
      setIsSidebarCollapsed(stored === "true");
    } else if (window.innerWidth >= DESKTOP_SIDEBAR_BREAKPOINT_PX) {
      setIsSidebarCollapsed(false);
    }
  }, []);

  const setCollapsed = (value: boolean) => {
    setIsSidebarCollapsed(value);
    safeStorageSet(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
  };

  const listQuery = trpc.verticalDramaSeries.list.useQuery(
    { search: search.trim() || undefined },
    { staleTime: 30_000 }
  );
  const series = (listQuery.data?.series ?? []) as SidebarSeriesItem[];

  const contextValue = useMemo<VerticalDramaShellContextValue>(
    () => ({ openCreateWizard: () => setWizardOpen(true) }),
    []
  );

  function handleSelectSeries(seriesId: string) {
    setLocation(verticalDramaRoutes.seriesDetail(seriesId));
    setIsMobilePanelOpen(false);
  }

  const sidebarBody = (
    <>
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-slate-900">
            {pickCopy(lang, verticalDramaCopy.sidebarTitle)}
          </h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="hidden xl:inline-flex"
            onClick={() => setCollapsed(true)}
            aria-label={pickCopy(lang, verticalDramaCopy.sidebarCollapse)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={pickCopy(
                lang,
                verticalDramaCopy.sidebarSearchPlaceholder
              )}
              aria-label={pickCopy(
                lang,
                verticalDramaCopy.sidebarSearchPlaceholder
              )}
              className="h-9 bg-white pl-9"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.sidebarNewSeries)}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain">
        <div className="space-y-1.5 p-2">
          {listQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))
          ) : listQuery.isError ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              <AlertTriangle
                className="h-4 w-4 text-destructive"
                aria-hidden="true"
              />
              {pickCopy(lang, verticalDramaCopy.sidebarError)}
            </div>
          ) : series.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {pickCopy(lang, verticalDramaCopy.sidebarEmpty)}
            </div>
          ) : (
            series.map(item => {
              const isSelected = item.id === currentSeriesId;
              const statusLabel =
                seriesStatusCopy[item.status as VerticalDramaSeriesStatus] !=
                null
                  ? pickCopy(
                      lang,
                      seriesStatusCopy[item.status as VerticalDramaSeriesStatus]
                    )
                  : item.status;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSeries(item.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-cyan-300 bg-cyan-50"
                      : "border-transparent bg-white hover:bg-slate-50"
                  )}
                >
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-10 w-7 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-slate-100"
                    >
                      <Clapperboard
                        className="h-3.5 w-3.5 text-slate-300"
                        aria-hidden="true"
                      />
                    </div>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          statusDotClass(item.status)
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                        {item.title}
                      </span>
                      {item.pendingApprovalCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 px-1.5 py-0 text-[10px]"
                        >
                          {item.pendingApprovalCount}
                        </Badge>
                      )}
                    </span>
                    <span className="truncate pl-4 text-xs text-muted-foreground">
                      {statusLabel} · SUB-EP {item.episodeCount}
                      {typeof item.targetEpisodeCount === "number" &&
                      item.targetEpisodeCount > 0
                        ? `/${item.targetEpisodeCount}`
                        : ""}
                    </span>
                    {/* Stage 2.6 — lineage badge. Feature-detected: renders
                        only once `list` starts including these fields (see
                        `SidebarSeriesItem`'s own doc comment). */}
                    {item.createMode === "sequel" &&
                      typeof item.seasonNumber === "number" && (
                        <span className="truncate pl-4 text-[11px] text-cyan-700">
                          {sequelBadgeText(lang, item.seasonNumber)}
                        </span>
                      )}
                    {item.createMode === "special_edition" &&
                      item.lineage?.parentTitle && (
                        <span className="truncate pl-4 text-[11px] text-cyan-700">
                          {specialEditionBadgeText(lang, item.lineage.parentTitle)}
                        </span>
                      )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );

  return (
    <VerticalDramaShellContext.Provider value={contextValue}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
        <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-none items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Button
              asChild
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
            >
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {pickCopy(lang, verticalDramaCopy.backToDashboard)}
                </span>
              </Link>
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary">
              <Clapperboard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="truncate text-sm font-medium text-slate-500">
                {pickCopy(lang, verticalDramaCopy.menuTitle)}
              </span>
            </div>
            <LocaleToggle className="shrink-0" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 xl:hidden"
              onClick={() => setIsMobilePanelOpen(v => !v)}
              aria-expanded={isMobilePanelOpen}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              {pickCopy(lang, verticalDramaCopy.sidebarTitle)}
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-none px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div
            className={cn(
              "grid grid-cols-1 gap-4",
              isSidebarCollapsed
                ? "xl:grid-cols-[3.25rem_minmax(0,1fr)]"
                : "xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)]"
            )}
          >
            {/* Tablet-portrait / mobile: collapsible strip above the main content, never an overlay */}
            {isMobilePanelOpen && (
              <aside className="flex max-h-[50vh] flex-col overflow-hidden rounded-xl border bg-white/90 shadow-sm xl:hidden">
                {sidebarBody}
              </aside>
            )}

            {/* Desktop / tablet-landscape: persistent sidebar column */}
            <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-xl border bg-white/90 shadow-sm xl:flex">
              {isSidebarCollapsed ? (
                <div className="flex h-full flex-col items-center gap-2 p-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setCollapsed(false)}
                    aria-label={pickCopy(lang, verticalDramaCopy.sidebarExpand)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span className="mt-2 text-[11px] font-medium text-slate-500 [writing-mode:vertical-rl]">
                    {pickCopy(lang, verticalDramaCopy.sidebarTitle)}
                  </span>
                </div>
              ) : (
                sidebarBody
              )}
            </aside>

            <div className="min-w-0">{children}</div>
          </div>
        </main>
      </div>

      <CreateSeriesWizard
        open={wizardOpen}
        lang={lang}
        onOpenChange={setWizardOpen}
        onCreated={seriesId => {
          setWizardOpen(false);
          void listQuery.refetch();
          setLocation(verticalDramaRoutes.seriesDetail(seriesId));
        }}
      />
    </VerticalDramaShellContext.Provider>
  );
}
