/**
 * VerticalDramaAssetsTab (spec feature 131, section-10/11 — Series detail
 * "Assets" tab).
 *
 * Read-only display of `trpc.verticalDramaSeries.listSeriesAssets`: the
 * series' character reference assets and per-episode run artifacts. No
 * editing/generation actions here (backlogged separately) — this tab only
 * surfaces what already exists so the user can see it at a glance.
 */

import { CheckCircle2, Clock, Film, ImageIcon, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface CharacterAssetRow {
  id: string;
  characterId: string | null;
  characterName: string | null;
  mediaAssetId: string | null;
  assetType: string;
  role: string | null;
  approved: boolean;
  qcStatus: string;
  createdAt: string;
}

interface RunArtifactRow {
  id: string;
  episodeId: string;
  stage: string;
  storageKey: string | null;
  mediaAssetIds: number[];
  createdAt: string;
}

export interface VerticalDramaAssetsTabProps {
  lang: "th" | "en";
  seriesId: string;
}

export function VerticalDramaAssetsTab({ lang, seriesId }: VerticalDramaAssetsTabProps) {
  const assetsQuery = trpc.verticalDramaSeries.listSeriesAssets.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 30_000 },
  );

  if (assetsQuery.isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (assetsQuery.isError) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {lang === "th" ? "โหลดแอสเซ็ตไม่สำเร็จ" : "Failed to load assets"}
        </CardContent>
      </Card>
    );
  }

  const characterAssets = (assetsQuery.data?.characterAssets ?? []) as CharacterAssetRow[];
  const runArtifacts = (assetsQuery.data?.runArtifacts ?? []) as RunArtifactRow[];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            {lang === "th" ? "แอสเซ็ตตัวละคร" : "Character assets"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {characterAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lang === "th" ? "ยังไม่มีแอสเซ็ตตัวละคร" : "No character assets yet."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {characterAssets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {asset.characterName ??
                        (lang === "th" ? "ไม่ทราบตัวละคร" : "Unknown character")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {asset.assetType}
                      {asset.role ? ` · ${asset.role}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <QcStatusBadge status={asset.qcStatus} lang={lang} />
                    <Badge variant={asset.approved ? "secondary" : "outline"} className="text-xs">
                      {asset.approved
                        ? lang === "th"
                          ? "อนุมัติแล้ว"
                          : "Approved"
                        : lang === "th"
                          ? "ยังไม่อนุมัติ"
                          : "Not approved"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Film className="h-4 w-4" aria-hidden="true" />
            {lang === "th" ? "อาร์ติแฟกต์การรัน" : "Run artifacts"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runArtifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lang === "th" ? "ยังไม่มีอาร์ติแฟกต์การรัน" : "No run artifacts yet."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {runArtifacts.map((artifact) => (
                <li key={artifact.id} className="rounded-md border p-2.5 text-sm">
                  <p className="font-medium">{artifact.stage}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th" ? "ตอน" : "Episode"} {artifact.episodeId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(artifact.createdAt).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {artifact.mediaAssetIds.length}{" "}
                    {lang === "th" ? "สื่อ" : artifact.mediaAssetIds.length === 1 ? "media item" : "media items"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const QC_STATUS_META: Record<
  string,
  { icon: typeof CheckCircle2; th: string; en: string; tone: string }
> = {
  passed: { icon: CheckCircle2, th: "ผ่าน QC", en: "QC passed", tone: "text-emerald-600 dark:text-emerald-400" },
  failed: { icon: XCircle, th: "ไม่ผ่าน QC", en: "QC failed", tone: "text-destructive" },
  needs_repair: { icon: XCircle, th: "ต้องแก้ไข", en: "Needs repair", tone: "text-destructive" },
  pending: { icon: Clock, th: "รอตรวจ QC", en: "QC pending", tone: "text-muted-foreground" },
};

function QcStatusBadge({ status, lang }: { status: string; lang: "th" | "en" }) {
  const meta = QC_STATUS_META[status] ?? {
    icon: Clock,
    th: status,
    en: status,
    tone: "text-muted-foreground",
  };
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.tone)}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {lang === "th" ? meta.th : meta.en}
    </span>
  );
}
