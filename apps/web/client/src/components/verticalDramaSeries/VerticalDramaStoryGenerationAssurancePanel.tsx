import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { VerticalDramaLang } from "./verticalDramaCopy";

type AssurancePanelProps = {
  lang: VerticalDramaLang;
  seriesId: string;
  runId: string | null;
};

const statusText: Record<string, { th: string; en: string }> = {
  queued: { th: "รอคิวสร้าง", en: "Queued" },
  running: { th: "กำลังสร้าง", en: "Generating" },
  validating: { th: "กำลังตรวจสอบ", en: "Validating" },
  repairing: { th: "กำลังซ่อมเฉพาะจุด", en: "Repairing" },
  awaiting_reconciliation: { th: "รอตรวจสอบผล provider/เครดิต", en: "Reconciling provider/credit result" },
  awaiting_approval: { th: "รออนุมัติขอบเขตการซ่อม", en: "Awaiting repair approval" },
  partial: { th: "สร้างได้บางส่วนและกลับมาทำต่อได้", en: "Partial and resumable" },
  needs_repair: { th: "พบจุดที่ต้องซ่อม", en: "Needs repair" },
  succeeded: { th: "เสร็จสมบูรณ์และผ่าน final gate", en: "Completed final gate" },
  failed: { th: "หยุดพร้อมข้อผิดพลาด", en: "Failed" },
  cancelled: { th: "ยกเลิกแล้ว", en: "Cancelled" },
};

export function VerticalDramaStoryGenerationAssurancePanel({ lang, seriesId, runId }: AssurancePanelProps) {
  const utils = trpc.useUtils();
  const enabled = Boolean(runId);
  const query = trpc.verticalDramaSeries.getStoryGenerationRun.useQuery(
    { seriesId, runId: runId ?? "disabled" },
    { enabled, refetchInterval: enabled ? 4000 : false },
  );
  const resume = trpc.verticalDramaSeries.resumeStoryGeneration.useMutation({ onSuccess: () => void query.refetch() });
  const repair = trpc.verticalDramaSeries.repairStoryGeneration.useMutation({ onSuccess: () => void query.refetch() });
  const cancel = trpc.verticalDramaSeries.cancelStoryGeneration.useMutation({ onSuccess: () => void query.refetch() });
  const approve = trpc.verticalDramaSeries.approveStoryGenerationRepair.useMutation({ onSuccess: () => void query.refetch() });
  const summary = query.data;
  if (!runId || !summary) return null;
  const copy = statusText[summary.status] ?? { th: summary.status, en: summary.status };
  const label = lang === "th" ? copy.th : copy.en;
  const busy = resume.isPending || repair.isPending || cancel.isPending || approve.isPending;
  const refresh = () => void utils.verticalDramaSeries.getStoryGenerationRun.invalidate({ seriesId, runId });
  return (
    <section
      aria-label={lang === "th" ? "สถานะการสร้างเนื้อเรื่องแบบตรวจสอบ" : "Assured story generation status"}
      className="rounded-md border border-sky-200 bg-sky-50/70 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/20"
      data-testid="vd-story-generation-assurance-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {summary.status === "succeeded" ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : summary.status === "failed" ? <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-600" /> : <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-sky-600" />}
          <span className="font-medium" data-testid="vd-story-generation-assurance-status">{label}</span>
          <Badge variant="outline">{summary.stage}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {lang === "th" ? `checkpoint ${summary.eventCursor}` : `checkpoint ${summary.eventCursor}`}
        </span>
      </div>
      {summary.report && !summary.report.passed && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300" aria-label={lang === "th" ? "จุดที่ต้องตรวจสอบ" : "Validation findings"}>
          {summary.report.findings.filter((finding) => finding.blocking).slice(0, 4).map((finding) => <li key={`${finding.code}:${finding.message}`}>{finding.message}</li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(summary.status === "partial" || summary.status === "needs_repair") && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (summary.status === "needs_repair") repair.mutate({ seriesId, runId }); else resume.mutate({ seriesId, runId }); }}>
            <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {summary.status === "needs_repair" ? (lang === "th" ? "ซ่อมเนื้อเรื่อง" : "Repair story") : (lang === "th" ? "ทำต่อจาก checkpoint" : "Resume checkpoint")}
          </Button>
        )}
        {summary.status === "awaiting_approval" && <Button size="sm" disabled={busy} onClick={() => approve.mutate({ seriesId, runId })}>{lang === "th" ? "อนุมัติการซ่อม" : "Approve repair"}</Button>}
        {summary.resumable && summary.status !== "cancelled" && summary.status !== "succeeded" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel.mutate({ seriesId, runId })}><Square aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />{lang === "th" ? "ยกเลิก" : "Cancel"}</Button>}
        <Button size="sm" variant="ghost" onClick={refresh}>{lang === "th" ? "รีเฟรชผลตรวจ" : "Refresh validation"}</Button>
      </div>
    </section>
  );
}
