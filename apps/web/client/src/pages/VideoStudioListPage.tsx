/**
 * VideoStudioListPage (Feature 133, section-08 §10.2) — project list +
 * "New from product" (Catalog Video Studio, F133C) / "New blank project"
 * (Motion Studio, F133-motion) create actions. Both create actions are
 * fail-closed gated: hidden when their studio-specific flag is off, even
 * though the master F133A route guard (`RequireVideoIntelligence` in
 * `App.tsx`) already covers the page itself.
 *
 * INTENTIONAL EXCEPTION: this file imports `@astryxdesign/core/*` components
 * directly below the `<AppPage>` shell. `AppPage.tsx`'s docstring states it
 * is "intentionally the ONLY app file... that imports @astryxdesign
 * directly" — Video Studio is a deliberate, explicit, twice-confirmed
 * user-directed exception to that rule (see
 * `planning/video-studio-astryx-migration/plan.md`). Do not treat this as
 * an accidental violation, and do not copy this pattern into other pages
 * without the same explicit sign-off.
 */
import { useState } from "react";
import { Clapperboard, Plus, Search, ShoppingBag } from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import { CatalogCreateDialog } from "@/components/videoStudio/CatalogCreateDialog";
import { MotionCreateDialog } from "@/components/videoStudio/MotionCreateDialog";
import { pickCopy, useVideoStudioLang, videoStudioCopy } from "@/components/videoStudio/videoStudioCopy";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";

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
    <HStack gap={2} align="center" wrap="wrap">
      {catalogStudioEnabled ? (
        <Button
          data-testid="video-studio-new-from-product"
          variant="primary"
          icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
          label={pickCopy(lang, videoStudioCopy.newFromProduct)}
          onClick={() => setCatalogDialogOpen(true)}
        />
      ) : null}
      {motionStudioEnabled ? (
        <Button
          data-testid="video-studio-new-blank-project"
          variant="secondary"
          icon={<Plus className="h-4 w-4" aria-hidden="true" />}
          label={pickCopy(lang, videoStudioCopy.newBlankProject)}
          onClick={() => setMotionDialogOpen(true)}
        />
      ) : null}
    </HStack>
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
          <Card variant="muted" padding={3}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <TextInput
                  label={pickCopy(lang, videoStudioCopy.searchPlaceholder)}
                  isLabelHidden
                  value={search}
                  onChange={(value) => setSearch(value)}
                  placeholder={pickCopy(lang, videoStudioCopy.searchPlaceholder)}
                  startIcon={<Search className="h-4 w-4" aria-hidden="true" />}
                  width="100%"
                />
              </div>
              <ToggleButtonGroup
                type="single"
                label="studio type filter"
                value={studioTypeFilter}
                onChange={(value) => {
                  // ToggleButtonGroup (single) allows deselecting the active
                  // button (value -> null). The original hand-rolled filter
                  // pills had no deselect concept — clicking the active pill
                  // was a no-op. Preserve that behavior by ignoring null.
                  if (value) setStudioTypeFilter(value as StudioTypeFilter);
                }}
              >
                {STUDIO_TYPE_FILTERS.map((studioType) => {
                  const label =
                    studioType === "all"
                      ? pickCopy(lang, videoStudioCopy.allStudioTypes)
                      : pickCopy(lang, videoStudioCopy[STUDIO_TYPE_LABEL_KEY[studioType]]);
                  return <ToggleButton key={studioType} value={studioType} size="sm" label={label} />;
                })}
              </ToggleButtonGroup>
            </div>
          </Card>
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
          icon: (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clapperboard className="h-7 w-7" aria-hidden="true" />
            </div>
          ),
          actions: createActions,
        }}
      >
        <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
          {filtered.map((project) => (
            <ProjectCard key={project.id} lang={lang} project={project} />
          ))}
        </Grid>
      </AppPage>

      <CatalogCreateDialog lang={lang} open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen} />
      <MotionCreateDialog lang={lang} open={motionDialogOpen} onOpenChange={setMotionDialogOpen} />
    </>
  );
}

function ProjectCard({ lang, project }: { lang: "th" | "en"; project: VideoProjectListItem }) {
  const StudioIcon = project.studioType === "catalog" ? ShoppingBag : Clapperboard;
  return (
    <ClickableCard label={project.name} href={`/video-studio/${project.id}`} height="100%">
      <VStack gap={2}>
        <HStack justify="between" align="start" gap={2}>
          <Text type="body" weight="bold" maxLines={1}>
            {project.name}
          </Text>
          <Badge variant="neutral" label={project.status} />
        </HStack>
        <HStack gap={1.5} align="center">
          <StudioIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <Text type="supporting" color="secondary">
            {project.studioType === "catalog"
              ? pickCopy(lang, videoStudioCopy.studioTypeCatalog)
              : project.studioType === "motion"
                ? pickCopy(lang, videoStudioCopy.studioTypeMotion)
                : project.studioType}
          </Text>
        </HStack>
        <Text type="supporting" color="secondary">
          {formatRelative(project.updatedAt, lang)}
        </Text>
      </VStack>
    </ClickableCard>
  );
}

function ProjectListSkeleton() {
  return (
    <Grid columns={{ minWidth: 280, max: 3 }} gap={4} aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} height={128} padding={4}>
          <VStack gap={3} height="100%" justify="between">
            <Skeleton width="66%" height={20} index={i * 3} />
            <Skeleton width="50%" height={16} index={i * 3 + 1} />
            <Skeleton width="33%" height={16} index={i * 3 + 2} />
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}
