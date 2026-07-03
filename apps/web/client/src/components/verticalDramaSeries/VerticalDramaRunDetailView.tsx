/**
 * VerticalDramaRunDetailView — read-only, past-run artifact ledger (spec §09
 * "Run Detail Read-Only Ledger", route `/episodes/:episodeId/runs/:runId`).
 *
 * Renders the complete artifact ledger for a selected run (`input.normalized.json`
 * … `10_qc_report.json`, `readable_summary.md`, `run_log.jsonl`) in read-only
 * mode, plus per-clip provider job IDs and their last stable provider statuses.
 * A run selector switches between runs of the same episode without leaving the
 * view. No repair / re-run / export / memory actions are offered here — because
 * run artifacts are immutable and durable, this renders for archived series and
 * completed episodes just as for active ones.
 *
 * Presentational: data (`runs`, `detail`, `loading`, `error`) is injected so the
 * view is testable without a tRPC provider; the section-03 container wires
 * `assembly.listRuns` + `assembly.getRunDetail`.
 */

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type VdRunDetailLocale = "th" | "en";

/** One ledger row for the selected run (present or missing). */
export interface VdLedgerEntry {
  filename: string;
  stage: string;
  present: boolean;
  artifactId?: string;
  runId?: string;
  checksumSha256?: string;
  mediaAssetIds?: string[];
  jsonPayload?: unknown;
  createdAt?: string | Date;
}

/** Per-clip provider job id + last stable provider status. */
export interface VdClipProviderStatus {
  clipNumber: number;
  parentShotNumber?: number;
  subShotNumber?: number | null;
  mediaAssetId?: string;
  providerJobId?: string;
  providerStatus?: string;
  status?: string;
}

export interface VdRunSummary {
  runId: string;
  stage: string;
  status: string;
  mode: string;
  updatedAt: string | Date;
}

export interface VdRunDetail {
  runId: string;
  episodeId: string;
  seriesId: string;
  stage: string;
  status: string;
  mode: string;
  nextAction: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  ledger: VdLedgerEntry[];
  clipProviderStatuses: VdClipProviderStatus[];
}

export interface VerticalDramaRunDetailViewProps {
  locale?: VdRunDetailLocale;
  /** Run summaries for the run selector (from `assembly.listRuns`). */
  runs: VdRunSummary[];
  /** The currently selected run's full ledger (from `assembly.getRunDetail`). */
  detail: VdRunDetail | null;
  selectedRunId?: string;
  onSelectRun?: (runId: string) => void;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const COPY = {
  en: {
    title: "Run detail",
    subtitle: "Read-only artifact ledger",
    runSelector: "Select run",
    noRuns: "No runs to inspect yet",
    loading: "Loading run ledger…",
    errorTitle: "Could not load run ledger",
    artifactLedger: "Artifact ledger",
    present: "Present",
    missing: "Missing",
    checksum: "Checksum",
    assets: "Assets",
    clips: "Per-clip provider status",
    noClips: "No clip provider statuses recorded for this run.",
    clip: "Clip",
    shot: "Shot",
    sub: "Sub",
    providerJob: "Provider job",
    providerStatus: "Provider status",
    mediaAsset: "Media asset",
    readOnlyNote: "Read-only. Run artifacts are immutable and durable.",
    stage: "Stage",
    status: "Status",
    mode: "Mode",
    none: "—",
  },
  th: {
    title: "รายละเอียดการรัน",
    subtitle: "บันทึกอาร์ติแฟกต์ (อ่านอย่างเดียว)",
    runSelector: "เลือกการรัน",
    noRuns: "ยังไม่มีการรันให้ตรวจสอบ",
    loading: "กำลังโหลดบันทึกการรัน…",
    errorTitle: "โหลดบันทึกการรันไม่สำเร็จ",
    artifactLedger: "บันทึกอาร์ติแฟกต์",
    present: "มีอยู่",
    missing: "ไม่มี",
    checksum: "เช็คซัม",
    assets: "แอสเซต",
    clips: "สถานะผู้ให้บริการรายคลิป",
    noClips: "ไม่มีสถานะผู้ให้บริการของคลิปสำหรับการรันนี้",
    clip: "คลิป",
    shot: "ช็อต",
    sub: "ซับ",
    providerJob: "งานผู้ให้บริการ",
    providerStatus: "สถานะผู้ให้บริการ",
    mediaAsset: "มีเดียแอสเซต",
    readOnlyNote: "อ่านอย่างเดียว อาร์ติแฟกต์ของการรันไม่เปลี่ยนแปลงและคงอยู่ถาวร",
    stage: "ขั้นตอน",
    status: "สถานะ",
    mode: "โหมด",
    none: "—",
  },
} as const;

function fmt(ts: string | Date | null | undefined, none: string): string {
  if (!ts) return none;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? none : d.toLocaleString();
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "succeeded" || status === "completed") return "secondary";
  if (status === "assembly_ready" || status === "approval_required") return "outline";
  return "default";
}

export function VerticalDramaRunDetailView({
  locale = "en",
  runs,
  detail,
  selectedRunId,
  onSelectRun,
  loading = false,
  error = null,
  className,
}: VerticalDramaRunDetailViewProps) {
  const t = useMemo(() => COPY[locale], [locale]);
  const activeRunId = selectedRunId ?? detail?.runId ?? runs[0]?.runId;

  return (
    <section
      className={cn("flex flex-col gap-4", className)}
      aria-label={t.title}
      data-testid="vd-run-detail"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t.title}</h2>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="vd-run-selector" className="text-xs font-medium text-muted-foreground">
            {t.runSelector}
          </label>
          <select
            id="vd-run-selector"
            className="min-w-56 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            value={activeRunId ?? ""}
            disabled={runs.length === 0}
            onChange={(e) => onSelectRun?.(e.target.value)}
            data-testid="vd-run-selector"
          >
            {runs.length === 0 ? (
              <option value="">{t.noRuns}</option>
            ) : (
              runs.map((r) => (
                <option key={r.runId} value={r.runId}>
                  #{r.runId} · {r.stage} · {r.status}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      <p className="text-xs text-muted-foreground" data-testid="vd-run-detail-readonly-note">
        {t.readOnlyNote}
      </p>

      {/* error state */}
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="vd-run-detail-error"
        >
          <p className="font-medium">{t.errorTitle}</p>
          <p className="text-xs">{error}</p>
        </div>
      ) : loading ? (
        /* loading state */
        <div className="space-y-2" data-testid="vd-run-detail-loading" aria-busy="true">
          <p className="sr-only">{t.loading}</p>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        /* empty state */
        <p className="text-sm text-muted-foreground" data-testid="vd-run-detail-empty">
          {t.noRuns}
        </p>
      ) : detail ? (
        <div className="flex flex-col gap-4" data-testid="vd-run-detail-body">
          {/* run summary line */}
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">{t.stage}</dt>
              <dd className="font-medium">{detail.stage}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">{t.status}</dt>
              <dd>
                <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">{t.mode}</dt>
              <dd className="font-mono text-xs uppercase">{detail.mode}</dd>
            </div>
          </dl>

          {/* artifact ledger */}
          <section aria-label={t.artifactLedger} className="rounded-lg border">
            <header className="border-b px-3 py-2 text-sm font-medium">{t.artifactLedger}</header>
            <ScrollArea className="max-h-[28rem]">
              <ul className="divide-y">
                {detail.ledger.map((entry) => (
                  <li
                    key={entry.filename}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    data-testid={`vd-ledger-${entry.filename}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant={entry.present ? "secondary" : "outline"}
                        className="shrink-0 text-[10px] uppercase"
                      >
                        {entry.present ? t.present : t.missing}
                      </Badge>
                      <span className="truncate font-mono text-xs">{entry.filename}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      {entry.checksumSha256 ? (
                        <span title={entry.checksumSha256}>
                          {t.checksum}: <span className="font-mono">{entry.checksumSha256.slice(0, 10)}</span>
                        </span>
                      ) : null}
                      {entry.mediaAssetIds && entry.mediaAssetIds.length > 0 ? (
                        <span>
                          {t.assets}: {entry.mediaAssetIds.length}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </section>

          {/* per-clip provider statuses */}
          <section aria-label={t.clips} className="rounded-lg border">
            <header className="border-b px-3 py-2 text-sm font-medium">{t.clips}</header>
            {detail.clipProviderStatuses.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground" data-testid="vd-clip-statuses-empty">
                {t.noClips}
              </p>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">{t.clip}</th>
                        <th className="px-3 py-2 font-medium">{t.shot}</th>
                        <th className="px-3 py-2 font-medium">{t.sub}</th>
                        <th className="px-3 py-2 font-medium">{t.mediaAsset}</th>
                        <th className="px-3 py-2 font-medium">{t.providerJob}</th>
                        <th className="px-3 py-2 font-medium">{t.providerStatus}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.clipProviderStatuses.map((c) => (
                        <tr key={c.clipNumber} data-testid={`vd-clip-status-${c.clipNumber}`}>
                          <td className="px-3 py-2 font-mono text-xs">#{c.clipNumber}</td>
                          <td className="px-3 py-2 text-xs">{c.parentShotNumber ?? t.none}</td>
                          <td className="px-3 py-2 text-xs">{c.subShotNumber ?? t.none}</td>
                          <td className="px-3 py-2 font-mono text-xs">{c.mediaAssetId ?? t.none}</td>
                          <td className="px-3 py-2 font-mono text-xs">{c.providerJobId ?? t.none}</td>
                          <td className="px-3 py-2 text-xs">
                            {c.providerStatus ? (
                              <Badge variant={statusVariant(c.providerStatus)} className="text-[10px]">
                                {c.providerStatus}
                              </Badge>
                            ) : (
                              t.none
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="vd-run-detail-empty">
          {t.noRuns}
        </p>
      )}
    </section>
  );
}

export default VerticalDramaRunDetailView;
