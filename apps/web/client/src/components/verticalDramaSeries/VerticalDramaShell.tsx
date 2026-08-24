/**
 * VerticalDramaShell (spec feature 131, section 03).
 *
 * Shared PURE-CHROME wrapper for the Series list / Series detail / Episode
 * workspace pages: Media-Studio-style gradient background + a slim sticky
 * brand/back-navigation bar, plus a persistent, collapsible left sidebar
 * listing every series ("project") with search — styled after Storyboard
 * Review's project panel. Also owns the Create-Series Wizard so "New" works
 * from any of the three pages via `useVerticalDramaShell().openCreateWizard()`.
 * The Draft Job Inbox is intentionally limited to the series index route;
 * detail/episode routes must not fetch or render it.
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
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Menu,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { useAuth } from "@/contexts/AuthContext";
import {
  CreateSeriesWizard,
  clearPersistedCreateSeriesWorkspace,
} from "./CreateSeriesWizard";
import { VerticalDramaDeleteSeriesDialog } from "./VerticalDramaDeleteSeriesDialog";
import {
  pickCopy,
  sequelBadgeText,
  seriesStatusCopy,
  sidebarChildSeasonsCountText,
  specialEditionBadgeText,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "./verticalDramaCopy";
import { safeStorageGet, safeStorageSet } from "@/lib/safeLocalStorage";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "verticalDrama:sidebarCollapsed";
/** Lineage-aware sidebar filter chip (findable-fast fix, 2026-07-18) —
 *  remembered across the 3 pages the same way `SIDEBAR_COLLAPSED_STORAGE_KEY`
 *  is. See `resolveSidebarSeriesView`'s doc comment for the filtering rules. */
const SIDEBAR_FILTER_STORAGE_KEY = "verticalDrama:sidebarProjectFilter";
// Keep the persistent project sidebar out of the content column until there
// is enough room for the planning workspace. At 1280-1535px the old `xl`
// layout left too little width for the wizard and caused intrinsic-width
// children (preset/category cards in particular) to push the page off-screen.
const DESKTOP_SIDEBAR_BREAKPOINT_PX = 1536; // Tailwind `2xl:`

/** Best-effort localStorage access. Reads/writes here are only a CONVENIENCE
 *  cache (remembered sidebar-collapsed preference) — never the source of
 *  truth. They MUST NOT throw: `localStorage.setItem` raises
 *  `QuotaExceededError` when the origin's storage is full (common for heavy
 *  users) and `getItem`/`setItem` raise `SecurityError` in
 *  sandboxed/blocked-storage contexts. An unguarded throw here used to abort
 *  the whole click handler BEFORE the real (state) action fired. Swallow the
 *  error and let the real action proceed. */

interface VerticalDramaShellContextValue {
  openCreateWizard: () => void;
  planningWizard?: {
    open: boolean;
    lang: "th" | "en";
    planningSeriesId: string;
    recoveryJobId?: string;
    recoverySessionId?: string;
    recoveryQcRunId?: string;
    onOpenChange: (open: boolean) => void;
    onCreated: (seriesId: string) => void;
  };
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

export interface SidebarSeriesItem {
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
   * badge fields. `verticalDramaSeries.list` (`server/routers/
   * verticalDramaSeries.ts`) projects these additively; still written as
   * optional/nullable (same convention as `GenrePreset`'s
   * `visualIdentityJson` in `CreateSeriesWizard.tsx`) since every
   * original-mode series (the overwhelming majority) has them `null`.
   */
  createMode?: string | null;
  seasonNumber?: number | null;
  lineage?: { parentTitle?: string } | null;
  /**
   * Findable-fast lineage filter fix (2026-07-18) — `verticalDramaSeries
   * .list` already projects this (`server/routers/verticalDramaSeries.ts`'s
   * `list` handler, "Series lineage (Stage 2.6)" block), it just wasn't
   * typed on this interface yet. Used by `classifySidebarSeriesItem` to
   * nest a sequel row under its parent's expander; `undefined`/`null` for
   * every original-mode series (the overwhelming majority today).
   */
  parentSeriesId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Lineage-aware sidebar filtering (findable-fast fix, 2026-07-18)            */
/*                                                                            */
/* Pure, render-free helpers so the classification/grouping/search-override  */
/* rules are unit-testable without mounting the component (same convention   */
/* as `buildCharacterRosterEntries` in `VerticalDramaCharacterStockPanel      */
/* .tsx`). See `planning/vd-series-memory-and-lineage/plan.md` Stage 2.6 for  */
/* the underlying `createMode`/`seasonNumber`/`parentSeriesId`/`lineage`      */
/* columns these classify.                                                   */
/* -------------------------------------------------------------------------- */

export type SidebarSeriesClass = "main" | "sequel" | "special";

/**
 * `special` = an explicit `special_edition` row. `sequel` = a `sequel` row
 * (or, defensively, any row carrying a `parentSeriesId`/`seasonNumber >= 2`
 * even if `createMode` were ever missing/stale — belt-and-suspenders, since
 * the schema only ever sets those together with `createMode: "sequel"`).
 * `main` = everything else, which importantly includes every one of today's
 * NULL-lineage rows (all 12 live series) — the "look identical to today"
 * requirement rests on this default bucket.
 */
export function classifySidebarSeriesItem(
  item: Pick<
    SidebarSeriesItem,
    "createMode" | "seasonNumber" | "parentSeriesId"
  >
): SidebarSeriesClass {
  if (item.createMode === "special_edition") return "special";
  if (
    item.createMode === "sequel" ||
    item.parentSeriesId != null ||
    (typeof item.seasonNumber === "number" && item.seasonNumber >= 2)
  ) {
    return "sequel";
  }
  return "main";
}

export interface SidebarSeriesGroupNode {
  item: SidebarSeriesItem;
  /** Sequel rows whose `parentSeriesId` resolves to this main row, sorted by `seasonNumber` ascending (ภาค 2 before ภาค 3, …). */
  children: SidebarSeriesItem[];
}

/**
 * Builds the "เรื่องหลัก" (main) chip's tree: every `main`-classified row as
 * a top-level node, each carrying the `sequel`-classified rows that point at
 * it (via `parentSeriesId`) as `children`, sorted by `seasonNumber`. A sequel
 * whose parent isn't in the list (deleted/archived/not owned) — or whose
 * parent isn't itself `main` — is an "orphan": it is NEVER dropped, it is
 * appended as its own top-level node with no children so it stays findable.
 * Main rows keep the server's original order (newest-`updatedAt`-first).
 */
export function groupMainViewSeries(
  series: SidebarSeriesItem[]
): SidebarSeriesGroupNode[] {
  const byId = new Map(series.map(item => [item.id, item]));
  const mains: SidebarSeriesItem[] = [];
  const sequels: SidebarSeriesItem[] = [];
  for (const item of series) {
    const cls = classifySidebarSeriesItem(item);
    if (cls === "main") mains.push(item);
    else if (cls === "sequel") sequels.push(item);
    // `special` rows are not part of the main-chip tree at all.
  }

  const childrenByParentId = new Map<string, SidebarSeriesItem[]>();
  const orphanSequels: SidebarSeriesItem[] = [];
  for (const sequel of sequels) {
    const parent =
      sequel.parentSeriesId != null
        ? byId.get(sequel.parentSeriesId)
        : undefined;
    if (parent && classifySidebarSeriesItem(parent) === "main") {
      const bucket = childrenByParentId.get(parent.id) ?? [];
      bucket.push(sequel);
      childrenByParentId.set(parent.id, bucket);
    } else {
      orphanSequels.push(sequel);
    }
  }
  for (const bucket of childrenByParentId.values()) {
    bucket.sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0));
  }

  const mainNodes: SidebarSeriesGroupNode[] = mains.map(item => ({
    item,
    children: childrenByParentId.get(item.id) ?? [],
  }));
  const orphanNodes: SidebarSeriesGroupNode[] = orphanSequels.map(item => ({
    item,
    children: [],
  }));
  return [...mainNodes, ...orphanNodes];
}

export type SidebarProjectFilterChip = "main" | "special" | "all";

export function isSidebarProjectFilterChip(
  value: string | null
): value is SidebarProjectFilterChip {
  return value === "main" || value === "special" || value === "all";
}

export type SidebarSeriesView =
  | { mode: "grouped-main"; groups: SidebarSeriesGroupNode[] }
  | { mode: "flat"; items: SidebarSeriesItem[] };

/**
 * Resolves what the sidebar list should render. Search ALWAYS overrides the
 * active filter chip — the sidebar's job is "find a project fast", and a
 * chip that were still hiding rows while the user is actively searching
 * would work against that goal. `series` is expected to already be
 * server-filtered by the search text (the shell's `list` query sends
 * `search` straight to the server), so the `isSearchActive` flat branch just
 * renders every row it was given, unfiltered by class.
 */
export function resolveSidebarSeriesView(
  series: SidebarSeriesItem[],
  filterChip: SidebarProjectFilterChip,
  isSearchActive: boolean
): SidebarSeriesView {
  if (isSearchActive || filterChip === "all") {
    return { mode: "flat", items: series };
  }
  if (filterChip === "special") {
    return {
      mode: "flat",
      items: series.filter(
        item => classifySidebarSeriesItem(item) === "special"
      ),
    };
  }
  return { mode: "grouped-main", groups: groupMainViewSeries(series) };
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

/** Draft recovery is an index-page concern; keep detail/episode routes cold. */
export function isVerticalDramaSeriesIndexPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return pathname === "/drama-series";
}

/**
 * Planner edit mode is intentionally a durable query-string deep link. Keep
 * the predicate pure so route changes can be regression-tested without
 * mounting the shell (which owns several authenticated queries).
 */
export function isVerticalDramaPlannerEditSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("tab") === "planning" && params.get("edit") === "1";
}

/**
 * Renders the planner inside the Series Planning tab. The index page still
 * uses the modal wizard for "New"; an existing Series must never portal the
 * planner over the detail page because that makes a tab deep-link look like a
 * second screen and leaves the underlying page state ambiguous.
 */
export function VerticalDramaPlanningWizardSlot() {
  const { planningWizard } = useVerticalDramaShell();
  if (!planningWizard?.open) return null;
  return (
    <div className="isolate min-w-0 w-full max-w-full overflow-x-clip [contain:inline-size]">
      <CreateSeriesWizard
        open={planningWizard.open}
        lang={planningWizard.lang}
        presentation="page"
        planningSeriesId={planningWizard.planningSeriesId}
        recoveryJobId={planningWizard.recoveryJobId}
        recoverySessionId={planningWizard.recoverySessionId}
        recoveryQcRunId={planningWizard.recoveryQcRunId}
        onOpenChange={planningWizard.onOpenChange}
        onCreated={planningWizard.onCreated}
      />
    </div>
  );
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
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  // wouter's useLocation intentionally returns pathname only. Planner edit
  // mode is a query-string deep link, so subscribe to the search separately;
  // otherwise `?tab=planning&edit=1` changes the URL without opening the
  // wizard on an already-mounted Series detail page.
  const locationSearch = useSearch();
  const isSeriesIndexPage = isVerticalDramaSeriesIndexPath(location);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [planningSeriesId, setPlanningSeriesId] = useState<
    string | undefined
  >();
  const [selectedRecoverySessionId, setSelectedRecoverySessionId] = useState<
    string | undefined
  >();
  const [selectedRecoveryJobId, setSelectedRecoveryJobId] = useState<
    string | undefined
  >();
  const [selectedRecoveryQcRunId, setSelectedRecoveryQcRunId] = useState<
    string | undefined
  >();
  const [deleteTarget, setDeleteTarget] = useState<SidebarSeriesItem | null>(
    null
  );
  const [legacyDraftMigrationStatus, setLegacyDraftMigrationStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [filterChip, setFilterChip] =
    useState<SidebarProjectFilterChip>("main");
  const [expandedMainIds, setExpandedMainIds] = useState<Set<string>>(
    () => new Set()
  );

  const createPlanningSeriesShellMutation =
    trpc.verticalDramaSeries.createPlanningSeriesShell.useMutation({
      onSuccess: data => {
        const seriesId = data.series.id;
        setPlanningSeriesId(seriesId);
        setSelectedRecoveryJobId(undefined);
        setSelectedRecoverySessionId(undefined);
        setSelectedRecoveryQcRunId(undefined);
        setLocation(
          `${verticalDramaRoutes.seriesDetail(seriesId)}?tab=planning&edit=1`
        );
      },
    });

  // Legacy Draft migration is intentionally fire-and-forget. The Series-first
  // UI must not fetch or render the old Draft Inbox after the migration: doing
  // so reintroduces the expensive history load and makes a new Series appear
  // to depend on an unrelated Draft job.
  const migrateLegacyDraftJobsMutation =
    trpc.verticalDramaSeries.migrateLegacyDraftJobs.useMutation({
      onSuccess: data =>
        setLegacyDraftMigrationStatus(data.failed > 0 ? "error" : "success"),
      onError: () => setLegacyDraftMigrationStatus("error"),
    });
  useEffect(() => {
    if (
      !isSeriesIndexPage ||
      authLoading ||
      !isAuthenticated ||
      legacyDraftMigrationStatus !== "idle"
    ) {
      return;
    }
    setLegacyDraftMigrationStatus("pending");
    migrateLegacyDraftJobsMutation.mutate({ limit: 100 });
  }, [
    authLoading,
    isAuthenticated,
    isSeriesIndexPage,
    legacyDraftMigrationStatus,
    migrateLegacyDraftJobsMutation,
  ]);
  // A refreshed Planning URL is the durable resume signal for the page-mode
  // wizard. No Draft/QC history is fetched here; the Series detail query owns
  // only the compact active projection.
  useEffect(() => {
    if (!currentSeriesId || isSeriesIndexPage) return;
    if (isVerticalDramaPlannerEditSearch(locationSearch)) {
      const query = new URLSearchParams(locationSearch);
      setPlanningSeriesId(currentSeriesId);
      setSelectedRecoveryJobId(query.get("recoveryJobId") ?? undefined);
      setSelectedRecoverySessionId(query.get("recoverySessionId") ?? undefined);
      setSelectedRecoveryQcRunId(query.get("recoveryQcRunId") ?? undefined);
      setWizardOpen(true);
    }
  }, [currentSeriesId, isSeriesIndexPage, locationSearch]);

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

  // Remembered project filter chip (persisted across the 3 pages, same
  // convention as the sidebar-collapsed preference above). Default stays
  // "main" — the whole point of this filter is that a heavy special-edition
  // count must never bury the main story list by default.
  useEffect(() => {
    const stored = safeStorageGet(SIDEBAR_FILTER_STORAGE_KEY);
    if (isSidebarProjectFilterChip(stored)) {
      setFilterChip(stored);
    }
  }, []);

  const setCollapsed = (value: boolean) => {
    setIsSidebarCollapsed(value);
    safeStorageSet(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
  };

  const setFilterChipPersisted = (value: SidebarProjectFilterChip) => {
    setFilterChip(value);
    safeStorageSet(SIDEBAR_FILTER_STORAGE_KEY, value);
  };

  const toggleMainExpanded = (id: string) => {
    setExpandedMainIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const listQuery = trpc.verticalDramaSeries.list.useQuery(
    { search: search.trim() || undefined },
    { staleTime: 30_000 }
  );
  const series = (
    Array.isArray(listQuery.data?.series) ? listQuery.data.series : []
  ) as SidebarSeriesItem[];
  const isSearchActive = search.trim().length > 0;
  const sidebarView = resolveSidebarSeriesView(
    series,
    filterChip,
    isSearchActive
  );

  function startNewSeriesFromScratch() {
    if (createPlanningSeriesShellMutation.isPending) return;
    clearPersistedCreateSeriesWorkspace();
    setSelectedRecoveryJobId(undefined);
    setSelectedRecoverySessionId(undefined);
    setSelectedRecoveryQcRunId(undefined);
    createPlanningSeriesShellMutation.mutate({});
  }

  function detachPlanningWorkspace() {
    setWizardOpen(false);
    setPlanningSeriesId(undefined);
    setSelectedRecoveryJobId(undefined);
    setSelectedRecoverySessionId(undefined);
    setSelectedRecoveryQcRunId(undefined);
  }

  function handleSelectSeries(seriesId: string) {
    // A page-mode planner belongs to the Series that opened it. Close and
    // detach it before changing the route so React cannot render the old
    // wizard alongside the newly-selected Series detail page.
    detachPlanningWorkspace();
    setLocation(verticalDramaRoutes.seriesDetail(seriesId));
    setIsMobilePanelOpen(false);
  }

  function handleWizardOpenChange(open: boolean) {
    setWizardOpen(open);
    if (!open && planningSeriesId) {
      setPlanningSeriesId(undefined);
      setLocation(
        `${verticalDramaRoutes.seriesDetail(planningSeriesId)}?tab=planning`
      );
    }
  }

  function handleWizardCreated(seriesId: string) {
    detachPlanningWorkspace();
    void listQuery.refetch();
    setLocation(`${verticalDramaRoutes.seriesDetail(seriesId)}?tab=planning`);
  }

  function handleSeriesDeleted(seriesId: string) {
    setDeleteTarget(null);
    if (currentSeriesId === seriesId) {
      detachPlanningWorkspace();
      setLocation(verticalDramaRoutes.seriesList());
      return;
    }
    void listQuery.refetch();
  }

  const contextValue = useMemo<VerticalDramaShellContextValue>(
    () => ({
      openCreateWizard: () => startNewSeriesFromScratch(),
      planningWizard: currentSeriesId
        ? {
            open: wizardOpen,
            lang,
            planningSeriesId: planningSeriesId ?? currentSeriesId,
            recoveryJobId: selectedRecoveryJobId,
            recoverySessionId: selectedRecoverySessionId,
            recoveryQcRunId: selectedRecoveryQcRunId,
            onOpenChange: handleWizardOpenChange,
            onCreated: handleWizardCreated,
          }
        : undefined,
    }),
    [
      currentSeriesId,
      handleWizardCreated,
      handleWizardOpenChange,
      lang,
      planningSeriesId,
      selectedRecoveryJobId,
      selectedRecoveryQcRunId,
      selectedRecoverySessionId,
      startNewSeriesFromScratch,
      wizardOpen,
    ]
  );

  function renderSeriesCard(item: SidebarSeriesItem) {
    const isSelected = item.id === currentSeriesId;
    const statusLabel =
      seriesStatusCopy[item.status as VerticalDramaSeriesStatus] != null
        ? pickCopy(
            lang,
            seriesStatusCopy[item.status as VerticalDramaSeriesStatus]
          )
        : item.status;
    return (
      <div
        key={item.id}
        className={cn(
          "flex w-full items-start rounded-lg border text-left text-sm transition-colors",
          isSelected
            ? "border-cyan-300 bg-cyan-50"
            : "border-transparent bg-white hover:bg-slate-50"
        )}
      >
        <button
          type="button"
          onClick={() => handleSelectSeries(item.id)}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.thumbnailUrl ? (
            <AuthenticatedMediaImage
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
            {/* Stage 2.6 — lineage badge. Feature-detected: renders only once
                `list` starts including these fields (see `SidebarSeriesItem`'s
                own doc comment). */}
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
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="mr-1 mt-1.5 h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`${pickCopy(lang, verticalDramaCopy.deleteSeries)}: ${item.title}`}
          title={pickCopy(lang, verticalDramaCopy.deleteSeries)}
          onClick={event => {
            event.stopPropagation();
            setDeleteTarget(item);
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
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
            className="hidden 2xl:inline-flex"
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
            onClick={startNewSeriesFromScratch}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.sidebarNewSeries)}
          </Button>
        </div>
        {/* Lineage-aware project filter chips — hidden while actively
            searching, since search overrides the chip (see
            `resolveSidebarSeriesView`'s doc comment). */}
        {!isSearchActive && (
          <div
            role="group"
            aria-label={pickCopy(
              lang,
              verticalDramaCopy.sidebarFilterGroupLabel
            )}
            className="mt-2 flex items-center gap-1.5"
          >
            {[
              {
                chip: "main" as const,
                copy: verticalDramaCopy.sidebarFilterMain,
              },
              {
                chip: "special" as const,
                copy: verticalDramaCopy.sidebarFilterSpecial,
              },
              {
                chip: "all" as const,
                copy: verticalDramaCopy.sidebarFilterAll,
              },
            ].map(({ chip, copy }) => (
              <button
                key={chip}
                type="button"
                aria-pressed={filterChip === chip}
                onClick={() => setFilterChipPersisted(chip)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filterChip === chip
                    ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {pickCopy(lang, copy)}
              </button>
            ))}
          </div>
        )}
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
          ) : sidebarView.mode === "flat" ? (
            sidebarView.items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {pickCopy(lang, verticalDramaCopy.sidebarEmpty)}
              </div>
            ) : (
              sidebarView.items.map(item => renderSeriesCard(item))
            )
          ) : (
            sidebarView.groups.map(group => {
              const isExpanded = expandedMainIds.has(group.item.id);
              return (
                <div key={group.item.id} className="space-y-1.5">
                  {renderSeriesCard(group.item)}
                  {group.children.length > 0 && (
                    <div className="pl-4">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleMainExpanded(group.item.id)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 transition-transform",
                            isExpanded ? "" : "-rotate-90"
                          )}
                          aria-hidden="true"
                        />
                        {sidebarChildSeasonsCountText(
                          lang,
                          group.children.length
                        )}
                      </button>
                      {isExpanded && (
                        <div className="mt-1 space-y-1.5 border-l pl-3">
                          {group.children.map(child => renderSeriesCard(child))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );

  return (
    <VerticalDramaShellContext.Provider value={contextValue}>
      <div className="isolate min-h-screen min-w-0 w-full max-w-full overflow-x-clip bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 [contain:inline-size]">
        <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
          <div className="mx-auto flex min-w-0 w-full max-w-full items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
              className="shrink-0 gap-1.5 2xl:hidden"
              onClick={() => setIsMobilePanelOpen(v => !v)}
              aria-expanded={isMobilePanelOpen}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              {pickCopy(lang, verticalDramaCopy.sidebarTitle)}
            </Button>
          </div>
        </header>

        <main className="mx-auto isolate min-w-0 w-full max-w-full overflow-x-clip px-4 py-4 sm:px-6 sm:py-6 lg:px-8 [contain:inline-size]">
          <div
            className={cn(
              "grid min-w-0 w-full max-w-full grid-cols-1 gap-4",
              isSidebarCollapsed
                ? "2xl:grid-cols-[3.25rem_minmax(0,1fr)]"
                : "2xl:grid-cols-[18rem_minmax(0,1fr)]"
            )}
          >
            {/* Tablet-portrait / mobile: collapsible strip above the main content, never an overlay */}
            {isMobilePanelOpen && (
              <aside className="flex max-h-[50vh] flex-col overflow-hidden rounded-xl border bg-white/90 shadow-sm 2xl:hidden">
                {sidebarBody}
              </aside>
            )}

            {/* Desktop / tablet-landscape: persistent sidebar column */}
            <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-xl border bg-white/90 shadow-sm 2xl:flex">
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

            <div className="isolate min-w-0 w-full max-w-full overflow-x-clip [contain:inline-size]">
              {children}
            </div>
          </div>
        </main>
        {deleteTarget ? (
          <VerticalDramaDeleteSeriesDialog
            lang={lang}
            open
            onOpenChange={open => {
              if (!open) setDeleteTarget(null);
            }}
            seriesId={deleteTarget.id}
            seriesTitle={deleteTarget.title}
            onDeleteStarted={() => {
              if (planningSeriesId === deleteTarget.id) {
                detachPlanningWorkspace();
              }
            }}
            onDeleted={() => handleSeriesDeleted(deleteTarget.id)}
          />
        ) : null}
      </div>
    </VerticalDramaShellContext.Provider>
  );
}
