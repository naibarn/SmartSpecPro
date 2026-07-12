/**
 * VideoStudioListPage (Feature 133, section-08 §10.2) — project list +
 * "New from product" (Catalog Video Studio, F133C) / "New blank project"
 * (Motion Studio, F133-motion) create actions. Both create actions are
 * fail-closed gated: hidden when their studio-specific flag is off, even
 * though the master F133A route guard (`RequireVideoIntelligence` in
 * `App.tsx`) already covers the page itself.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Clapperboard, Plus, Search, ShoppingBag } from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CatalogCreateDialog } from "@/components/videoStudio/CatalogCreateDialog";
import { MotionCreateDialog } from "@/components/videoStudio/MotionCreateDialog";
import { pickCopy, useVideoStudioLang, videoStudioCopy } from "@/components/videoStudio/videoStudioCopy";

type StudioTypeFilter = "all" | "catalog" | "motion" | "content" | "review_remix" | "imported";

const STUDIO_TYPE_FILTERS: StudioTypeFilter[] = [
  "all",
  "catalog",
  "motion",
  "content",
  "review_remix",
  "imported",
];

const STUDIO_TYPE_LABEL_KEY: Record<Exclude<StudioTypeFilter, "all">, keyof typeof videoStudioCopy> = {
  catalog: "studioTypeCatalog",
  motion: "studioTypeMotion",
  content: "studioTypeContent",
  review_remix: "studioTypeReviewRemix",
  imported: "studioTypeImported",
};

interface VideoProjectListItem {
  id: number;
  name: string;
  studioType: string;
  status: string;
  updatedAt?: Date | string | null;
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

export default function VideoStudioListPage() {
  const lang = useVideoStudioLang();
  const [search, setSearch] = useState("");
  const [studioTypeFilter, setStudioTypeFilter] = useState<StudioTypeFilter>("all");
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [motionDialogOpen, setMotionDialogOpen] = useState(false);

  const catalogStudioEnabled = useTenantFeatureFlag("videoIntelligenceCatalogStudioEnabled");
  const motionStudioEnabled = useTenantFeatureFlag("videoIntelligenceMotionStudioEnabled");

  const listQuery = trpc.videoProjects.list.useQuery(
    { studioType: studioTypeFilter === "all" ? undefined : studioTypeFilter },
    { staleTime: 15_000 },
  );

  const projects = (listQuery.data ?? []) as VideoProjectListItem[];
  const filtered = search.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : projects;

  const pageState: AppPageState = listQuery.isLoading
    ? "loading"
    : listQuery.isError
      ? "error"
      : filtered.length === 0
        ? "empty"
        : "ready";

  const createActions = (
    <div className="flex flex-wrap gap-2">
      {catalogStudioEnabled ? (
        <Button
          data-testid="video-studio-new-from-product"
          className="gap-2"
          onClick={() => setCatalogDialogOpen(true)}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, videoStudioCopy.newFromProduct)}
        </Button>
      ) : null}
      {motionStudioEnabled ? (
        <Button
          data-testid="video-studio-new-blank-project"
          variant="outline"
          className="gap-2"
          onClick={() => setMotionDialogOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, videoStudioCopy.newBlankProject)}
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <AppPage
        title={pickCopy(lang, videoStudioCopy.pageTitle)}
        description={pickCopy(lang, videoStudioCopy.pageDescription)}
        breadcrumbs={[
          { label: pickCopy(lang, videoStudioCopy.dashboard), href: "/dashboard" },
          { label: pickCopy(lang, videoStudioCopy.pageTitle) },
        ]}
        actions={createActions}
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
                placeholder={pickCopy(lang, videoStudioCopy.searchPlaceholder)}
                aria-label={pickCopy(lang, videoStudioCopy.searchPlaceholder)}
                className="pl-9"
              />
            </div>
            <div role="group" aria-label="studio type filter" className="flex flex-wrap gap-1.5">
              {STUDIO_TYPE_FILTERS.map((studioType) => {
                const active = studioTypeFilter === studioType;
                const label =
                  studioType === "all"
                    ? pickCopy(lang, videoStudioCopy.allStudioTypes)
                    : pickCopy(lang, videoStudioCopy[STUDIO_TYPE_LABEL_KEY[studioType]]);
                return (
                  <button
                    key={studioType}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStudioTypeFilter(studioType)}
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
        loadingSkeleton={<ProjectListSkeleton />}
        error={{
          title: pickCopy(lang, videoStudioCopy.errorTitle),
          description: listQuery.error?.message,
          onRetry: () => listQuery.refetch(),
        }}
        empty={{
          title: pickCopy(lang, videoStudioCopy.emptyTitle),
          description: pickCopy(lang, videoStudioCopy.emptyBody),
          icon: <Clapperboard className="h-6 w-6" aria-hidden="true" />,
          actions: createActions,
        }}
      >
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <li key={project.id}>
              <ProjectCard lang={lang} project={project} />
            </li>
          ))}
        </ul>
      </AppPage>

      <CatalogCreateDialog lang={lang} open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen} />
      <MotionCreateDialog lang={lang} open={motionDialogOpen} onOpenChange={setMotionDialogOpen} />
    </>
  );
}

function ProjectCard({ lang, project }: { lang: "th" | "en"; project: VideoProjectListItem }) {
  return (
    <Link href={`/video-studio/${project.id}`}>
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="truncate text-base">{project.name}</CardTitle>
            <Badge variant="outline">{project.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div>
            {project.studioType === "catalog"
              ? pickCopy(lang, videoStudioCopy.studioTypeCatalog)
              : project.studioType === "motion"
                ? pickCopy(lang, videoStudioCopy.studioTypeMotion)
                : project.studioType}
          </div>
          <div>{formatRelative(project.updatedAt, lang)}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ProjectListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Card className="h-32">
            <CardContent className="flex h-full flex-col gap-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-auto h-4 w-1/3" />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
