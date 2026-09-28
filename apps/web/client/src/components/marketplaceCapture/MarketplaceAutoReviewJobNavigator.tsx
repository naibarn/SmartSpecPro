import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export type MarketplaceAutoReviewJobSummary = Record<string, any>;

interface MarketplaceAutoReviewJobNavigatorProps {
  runs: MarketplaceAutoReviewJobSummary[];
  selectedRunId?: string | null;
  loading?: boolean;
  error?: string | null;
  productId: string;
  setupMode?: boolean;
  onOpenRun: (runId: string) => void;
  onCreateNew: () => void;
  /** Delete one job. Omit to hide the affordance entirely (read-only mounts).
   *  Dependent rows cascade server-side; already-generated media stays in the
   *  user's Media library. */
  onDeleteRun?: (runId: string) => void;
  /** Run id currently being deleted, for the row's spinner. */
  deletingRunId?: string | null;
  className?: string;
}

function text(...values: unknown[]): string {
  return (
    values
      .find(value => typeof value === "string" && value.trim())
      ?.toString()
      .trim() ?? ""
  );
}

function runTimestamp(run: MarketplaceAutoReviewJobSummary): number {
  const value = text(run.updatedAt, run.createdAt);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortMarketplaceAutoReviewRunsNewestFirst(
  runs: MarketplaceAutoReviewJobSummary[]
): MarketplaceAutoReviewJobSummary[] {
  return [...runs].sort((left, right) => {
    const timestampDelta = runTimestamp(right) - runTimestamp(left);
    if (timestampDelta !== 0) return timestampDelta;

    // Keep the ordering deterministic when old rows have no timestamp or the
    // provider returned the same timestamp for multiple jobs.
    return text(right.id, right.productionRunId).localeCompare(
      text(left.id, left.productionRunId)
    );
  });
}

function isStagedRun(run: MarketplaceAutoReviewJobSummary): boolean {
  return (
    text(
      run.metadataJson?.planningArchitecture,
      run.planningArchitecture,
      run.apiProjection?.metadataJson?.planningArchitecture
    ) === "staged_two_skill_v2"
  );
}

function currentStageStatus(run: MarketplaceAutoReviewJobSummary): string {
  const currentStage = text(run.currentStage);
  const stage = Array.isArray(run.stages)
    ? run.stages.find((item: any) => text(item?.stageKey) === currentStage)
    : null;
  return text(stage?.status, run.statusDetail?.status);
}

function statusDetailState(run: MarketplaceAutoReviewJobSummary): string {
  return text(
    run.statusDetail?.state,
    run.apiProjection?.statusDetail?.state,
    run.metadataJson?.statusDetail?.state
  );
}

function isWaitingForUser(run: MarketplaceAutoReviewJobSummary): boolean {
  if (!isStagedRun(run)) return false;
  const stageStatus = currentStageStatus(run);
  const detailState = statusDetailState(run);
  return (
    ["blocked_needs_user", "blocked", "qa_pending"].includes(stageStatus) ||
    detailState.includes("awaiting_")
  );
}

function statusPresentation(run: MarketplaceAutoReviewJobSummary) {
  if (isWaitingForUser(run)) {
    return {
      label: "รอตรวจ/ยืนยัน",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      Icon: Clock3,
    };
  }
  switch (text(run.status)) {
    case "completed":
      return {
        label: "เสร็จแล้ว",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        Icon: CheckCircle2,
      };
    case "failed":
      return {
        label: "ต้องแก้ไข",
        className: "border-red-200 bg-red-50 text-red-800",
        Icon: AlertTriangle,
      };
    case "cancelled":
      return {
        label: "ยกเลิกแล้ว",
        className: "border-slate-200 bg-slate-100 text-slate-700",
        Icon: AlertTriangle,
      };
    case "queued":
      return {
        label: "รอเริ่มงาน",
        className: "border-sky-200 bg-sky-50 text-sky-800",
        Icon: Clock3,
      };
    case "waiting_provider":
      return {
        label: "รอผู้ให้บริการ",
        className: "border-violet-200 bg-violet-50 text-violet-800",
        Icon: Clock3,
      };
    case "running":
      return {
        label: "กำลังทำงาน",
        className: "border-violet-200 bg-violet-50 text-violet-800",
        Icon: Loader2,
      };
    default:
      return {
        label: "กำลังโหลด",
        className: "border-slate-200 bg-slate-50 text-slate-700",
        Icon: Clock3,
      };
  }
}

function stageLabel(stage: unknown): string {
  switch (text(stage)) {
    case "product_preflight":
      return "ตรวจข้อมูลสินค้า";
    case "concept_story":
      return "ตรวจเนื้อเรื่อง";
    case "prompt_plan":
      return "ตรวจ Prompt ภาพ";
    case "image_generation":
    case "storyboard_review":
      return "Storyboard Review / ผลภาพ";
    case "video_generation":
      return "ตรวจวิดีโอ";
    case "audio_generation":
      return "ตรวจเสียง";
    case "render":
      return "ยืนยันการประกอบ";
    default:
      return text(stage) || "รอเลือกขั้นตอน";
  }
}

function formatDate(value: unknown): string {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return "ยังไม่มีเวลา";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortRunId(runId: string): string {
  return runId.length > 22 ? `${runId.slice(0, 10)}…${runId.slice(-8)}` : runId;
}

function jobTitle(run: MarketplaceAutoReviewJobSummary, index: number): string {
  return (
    text(
      run.name,
      run.title,
      run.metadataJson?.jobName,
      run.metadataJson?.title
    ) || `Job Review #${index + 1}`
  );
}

export function MarketplaceAutoReviewJobNavigator({
  runs,
  selectedRunId,
  loading = false,
  error = null,
  productId,
  setupMode = false,
  onOpenRun,
  onCreateNew,
  onDeleteRun,
  deletingRunId = null,
  className = "",
}: MarketplaceAutoReviewJobNavigatorProps) {
  // Two-step inline confirm — this codebase's convention for a destructive
  // row action (see the character/look delete buttons in the VD panels).
  // Deleting a job is irreversible: the run row cascades to its stages,
  // attempts, artifacts and outbox jobs.
  const [confirmingDeleteRunId, setConfirmingDeleteRunId] = useState<
    string | null
  >(null);
  const visibleRuns = sortMarketplaceAutoReviewRunsNewestFirst(
    runs.filter(run => text(run.id, run.productionRunId))
  );

  return (
    <aside
      className={`flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10 ${className}`}
      aria-label="Jobs ของสินค้านี้"
    >
      <header className="border-b border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
            <Sparkles className="h-4 w-4" /> Jobs
          </span>
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-slate-300">
            {visibleRuns.length} งาน
          </span>
        </div>
        <h2 className="mt-2 text-base font-semibold">งาน Review ของสินค้า</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
          เลือกเปิดงานเดิมเพื่อตรวจต่อ หรือสร้างงานใหม่จากสินค้านี้
        </p>
        <p
          className="mt-2 truncate text-[11px] text-slate-500"
          title={productId}
        >
          Product: {productId}
        </p>
      </header>

      <nav
        className="min-h-0 flex-1 overflow-y-auto p-3"
        aria-label="รายการ Job Review"
      >
        {loading && visibleRuns.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดรายการงาน…
          </p>
        ) : null}
        {error && visibleRuns.length === 0 ? (
          <p
            className="rounded-lg border border-red-300/30 bg-red-500/10 p-4 text-xs leading-5 text-red-200"
            role="alert"
          >
            โหลดรายการ Job ไม่สำเร็จ: {error}
          </p>
        ) : null}
        {!loading && !error && visibleRuns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center text-xs leading-5 text-slate-400">
            ยังไม่มี Job Review สำหรับสินค้านี้
          </p>
        ) : null}
        <ul className="space-y-2">
          {visibleRuns.map((run, index) => {
            const runId = text(run.id, run.productionRunId);
            const selected = runId === selectedRunId;
            const staged = isStagedRun(run);
            const status = statusPresentation(run);
            const StatusIcon = status.Icon;
            const stageCount = Number(run.stageCount) || 0;
            const stageIndex = Number(run.stageIndex) || 0;
            const progress =
              stageCount > 0
                ? `${Math.min(stageIndex, stageCount)}/${stageCount}`
                : null;
            return (
              <li key={runId} className="relative">
                <button
                  type="button"
                  className={`w-full rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                    selected
                      ? "border-violet-300 bg-violet-500/20"
                      : "border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]"
                  }`}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onOpenRun(runId)}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate text-sm font-semibold text-white">
                          {jobTitle(run, index)}
                        </span>
                        {index === 0 ? (
                          <span className="shrink-0 rounded-full bg-violet-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-200">
                            ล่าสุด
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-400">
                        {shortRunId(runId)}
                      </span>
                    </span>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium ${status.className}`}
                    >
                      <StatusIcon
                        className={`h-3 w-3 ${status.Icon === Loader2 ? "animate-spin" : ""}`}
                      />
                      {status.label}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-400">
                      {staged ? "Staged" : "Legacy"}
                    </span>
                    {progress ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-400">
                        {progress}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block truncate text-xs text-slate-300">
                    {stageLabel(run.currentStage)}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-slate-500">
                    {formatDate(run.updatedAt ?? run.createdAt)}
                  </span>
                </button>
                {/* Delete — sits OUTSIDE the card button (buttons can't nest)
                    and is absolutely positioned over its top-right corner.
                    Two-step confirm, since a deleted job takes its stages,
                    attempts and artifacts with it. */}
                {onDeleteRun ? (
                  confirmingDeleteRunId === runId ? (
                    <span className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-white/20 bg-slate-900/95 px-1 py-0.5 shadow-lg">
                      <span className="px-1 text-[10px] text-slate-200">
                        ลบงานนี้?
                      </span>
                      <button
                        type="button"
                        className="rounded p-1 text-slate-300 hover:text-white"
                        aria-label={`ยกเลิกการลบ ${jobTitle(run, index)}`}
                        onClick={() => setConfirmingDeleteRunId(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingRunId === runId}
                        className="rounded bg-red-500/90 p-1 text-white hover:bg-red-500 disabled:opacity-60"
                        aria-label={`ยืนยันลบ ${jobTitle(run, index)}`}
                        data-testid={`job-delete-confirm-${runId}`}
                        onClick={() => {
                          setConfirmingDeleteRunId(null);
                          onDeleteRun(runId);
                        }}
                      >
                        {deletingRunId === runId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={deletingRunId === runId}
                      // ALWAYS visible, never hover-only: an affordance the
                      // user cannot see is one they will report as missing —
                      // the same mistake the look selector made earlier today.
                      className="absolute right-8 top-2 z-10 rounded-md border border-white/10 bg-slate-900/70 p-1 text-slate-400 transition hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-60"
                      aria-label={`ลบ ${jobTitle(run, index)}`}
                      title="ลบงานนี้"
                      data-testid={`job-delete-${runId}`}
                      onClick={() => setConfirmingDeleteRunId(runId)}
                    >
                      {deletingRunId === runId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="border-t border-white/10 p-3">
        <button
          type="button"
          className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
            setupMode
              ? "bg-white/20 text-white hover:bg-white/25"
              : "bg-violet-700 text-white hover:bg-violet-800"
          }`}
          onClick={onCreateNew}
        >
          <Plus className="h-4 w-4" />
          สร้าง Job Review ใหม่
        </button>
      </footer>
    </aside>
  );
}
