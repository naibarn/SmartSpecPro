/**
 * VerticalDramaSeriesDetailPage (spec feature 131, section 03 · §8.3).
 *
 * Tabbed series workspace with progressive disclosure. Default-visible tabs are
 * the essentials (Overview + Episodes); the Story group (Bible, Characters,
 * Memory) and Advanced group (Product Tie-in, Assets, Settings) are revealed
 * once their underlying content exists, and always remain reachable via an
 * explicit "more" affordance so nothing is permanently hidden.
 *
 * Reversible via `VerticalDramaBreadcrumb` (Series). Consumes the base series
 * router `trpc.verticalDramaSeries.get`.
 */

import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronDown, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { VerticalDramaBreadcrumb } from "@/components/verticalDramaSeries/VerticalDramaBreadcrumb";
import { VerticalDramaCharacterStockPanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
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
  const [, params] = useRoute("/dashboard/vertical-drama/:seriesId");
  const seriesId = params?.seriesId ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showMore, setShowMore] = useState(false);

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

  // Progressive disclosure: reveal a group when any of its content exists.
  const storyPopulated = Boolean(series?.bible || series?.memory || episodes.length > 0);
  const advancedPopulated = Boolean(series?.productTieIn?.enabled);
  const isArchived = series?.status === "archived";

  const visibleTabs = useMemo<TabId[]>(() => {
    const tabs: TabId[] = ["overview", "episodes"];
    if (storyPopulated || showMore) tabs.push(...STORY_TABS);
    if (advancedPopulated || showMore) tabs.push(...ADVANCED_TABS);
    return tabs;
  }, [storyPopulated, advancedPopulated, showMore]);

  const allRevealed = visibleTabs.length >= 8;

  if (detailQuery.isLoading) {
    return (
      <PageShell lang={lang} seriesId={seriesId} title={pickCopy(lang, verticalDramaCopy.loading)}>
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  if (detailQuery.isError || !series) {
    return (
      <PageShell lang={lang} seriesId={seriesId} title={pickCopy(lang, verticalDramaCopy.errorTitle)}>
        <Card className="border-destructive/40">
          <CardContent role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {detailQuery.error?.message ?? pickCopy(lang, verticalDramaCopy.errorTitle)}
            </p>
            <Button variant="outline" onClick={() => detailQuery.refetch()}>
              {pickCopy(lang, verticalDramaCopy.retry)}
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const statusLabel =
    seriesStatusCopy[series.status as VerticalDramaSeriesStatus] != null
      ? pickCopy(lang, seriesStatusCopy[series.status as VerticalDramaSeriesStatus])
      : series.status;

  return (
    <PageShell lang={lang} seriesId={seriesId} title={series.title}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge>{statusLabel}</Badge>
        {isArchived && (
          <Badge variant="outline">{pickCopy(lang, verticalDramaCopy.readOnly)}</Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="flex-wrap">
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {pickCopy(lang, tabLabels[tab])}
              </TabsTrigger>
            ))}
          </TabsList>
          {!allRevealed && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setShowMore(true)}
              aria-label={lang === "th" ? "แสดงแท็บเพิ่มเติม" : "Show more tabs"}
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
              {lang === "th" ? "เพิ่มเติม" : "More"}
            </Button>
          )}
        </div>

        <TabsContent value="overview" className="pt-4">
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
    </PageShell>
  );
}

function PageShell({
  lang,
  seriesId,
  title,
  children,
}: {
  lang: "th" | "en";
  seriesId: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 sm:p-6">
        <VerticalDramaBreadcrumb
          crumbs={[
            { label: pickCopy(lang, verticalDramaCopy.menuTitle), href: verticalDramaRoutes.seriesList() },
            { label: title },
          ]}
        />
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
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
