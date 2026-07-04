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
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { Loader2, Plus, Save, Sparkles } from "lucide-react";

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
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { VerticalDramaCharacterStockPanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import { VerticalDramaShell } from "@/components/verticalDramaSeries/VerticalDramaShell";
import {
  pickCopy,
  seriesStatusCopy,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";

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

export default function VerticalDramaSeriesDetailPage() {
  const lang = useVerticalDramaLang();
  const [, params] = useRoute("/drama-series/:seriesId");
  const seriesId = params?.seriesId ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("overview");

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
        productTieIn?: { enabled?: boolean } | null;
      }
    | undefined;
  const episodes = (detailQuery.data?.episodes ?? []) as Array<{
    id: string;
    episodeNumber: number;
    title?: string | null;
    status: string;
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

                <StoryBibleOverviewCard lang={lang} seriesId={seriesId} bible={series.bible} readOnly={isArchived} />

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
                    <VerticalDramaCharacterStockPanel seriesId={seriesId} readOnly={isArchived} />
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

function EpisodesTab({
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
    updatedAt?: Date | string | null;
  }>;
  readOnly: boolean;
}) {
  if (episodes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {lang === "th" ? "ยังไม่มีตอนในซีรีย์นี้" : "This series has no episodes yet."}
          </p>
          {!readOnly && (
            <Button variant="outline" className="gap-2" disabled>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {lang === "th" ? "เพิ่มตอน (เร็วๆ นี้)" : "Add episode (coming soon)"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {episodes.map((ep) => (
        <li key={ep.id}>
          <Link href={verticalDramaRoutes.episode(seriesId, ep.id)}>
            <Card className="cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    EP {ep.episodeNumber}
                    {ep.title ? ` · ${ep.title}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{ep.status}</p>
                </div>
                <Badge variant="outline">{pickCopy(lang, verticalDramaCopy.open)}</Badge>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
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
 * Overview card for the "Generate story" action (spec addendum) — the first
 * real, credit-consuming LLM call in this feature. Shows the expanded season
 * arc + episode breakdown once generated, or a Generate/retry CTA otherwise.
 */
function StoryBibleOverviewCard({
  lang,
  seriesId,
  bible,
  readOnly,
}: {
  lang: "th" | "en";
  seriesId: string;
  bible: unknown;
  readOnly: boolean;
}) {
  const utils = trpc.useUtils();
  const expanded = (bible ?? {}) as ExpandedStoryBible;
  const hasStory = Boolean(expanded.episodeBreakdown && expanded.episodeBreakdown.length > 0);

  const generateMutation = trpc.verticalDramaSeries.generateStoryBible.useMutation({
    onSuccess: (data: { creditsUsed: number }) => {
      toast.success(
        lang === "th"
          ? `สร้างเนื้อเรื่องเต็มแล้ว (ใช้ ${data.creditsUsed} เครดิต)`
          : `Full story generated (${data.creditsUsed} credits used)`,
      );
      void utils.verticalDramaSeries.get.invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "สร้างเนื้อเรื่องเต็มไม่สำเร็จ" : "Story generation failed"));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {lang === "th" ? "เนื้อเรื่องเต็ม" : "Full story"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!hasStory ? (
          <>
            <p className="text-muted-foreground">
              {lang === "th"
                ? "ยังไม่ได้สร้างเนื้อเรื่องเต็ม — กดเพื่อขยายโครงเรื่อง/เรื่องย่อ/ตัวละครให้เป็นเนื้อเรื่องเต็มพร้อมแบ่งตอน (ใช้เครดิต)"
                : "No full story yet — generate one to expand the plot/logline/characters into a full episode-by-episode story (uses credits)."}
            </p>
            {!readOnly && (
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
            )}
          </>
        ) : (
          <>
            {expanded.expandedSeasonArc && (
              <p className="text-muted-foreground">{expanded.expandedSeasonArc}</p>
            )}
            <ol className="space-y-2">
              {expanded.episodeBreakdown!.map((ep) => (
                <li key={ep.episodeNumber} className="rounded-md border p-2.5">
                  <p className="font-medium">
                    EP {ep.episodeNumber} · {ep.workingTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">{ep.logline}</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {ep.keyBeats.map((beat, i) => (
                      <li key={i}>{beat}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            {!readOnly && (
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
