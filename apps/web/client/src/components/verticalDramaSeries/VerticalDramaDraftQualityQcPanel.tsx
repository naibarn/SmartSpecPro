import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  DraftQualityQcCreditEstimate,
  DraftQualityQcFailure,
  DraftQualityQcHistoryEntry,
  DraftQualityQcProgress,
  DraftQualityQcReport,
  DraftQualityQcJobStatus,
  DraftQualityQcResultSnapshot,
} from "@shared/verticalDramaSeries/draftQualityQc";
import {
  buildDraftQualityQcRepairPlan,
  draftQualityQcReportSchema,
} from "@shared/verticalDramaSeries/draftQualityQc";

type UiStatus = "idle" | DraftQualityQcJobStatus;

export interface VerticalDramaDraftQualityQcPanelProps {
  lang: "th" | "en";
  status: UiStatus;
  progress?: DraftQualityQcProgress | null;
  report?: DraftQualityQcReport | null;
  /** The last durable QC result, shown for comparison only. */
  previousResult?: DraftQualityQcResultSnapshot | null;
  /** A durable result is being shown because the active run failed/expired. */
  recoveredResult?: boolean;
  history?: DraftQualityQcHistoryEntry[];
  estimate?: DraftQualityQcCreditEstimate | null;
  maxRounds: number;
  disabled?: boolean;
  overrideSelected: boolean;
  overrideEligible: boolean;
  error?: string | null;
  failure?: DraftQualityQcFailure | null;
  onMaxRoundsChange: (value: number) => void;
  onStart: () => void;
  onRepair?: () => void;
  onCancel: () => void;
  onOverrideChange: (value: boolean) => void;
  selectedCandidateFingerprint?: string | null;
  candidateSelectionPending?: boolean;
  onSelectCandidate?: (item: DraftQualityQcHistoryEntry) => void;
  onConfirmCandidate?: () => void;
  candidateCanBeConfirmed?: boolean;
  candidateAlreadyConfirmed?: boolean;
}

const copy = {
  th: {
    title: "ตรวจคุณภาพ Draft ก่อนสร้างเรื่องเต็ม",
    body: "QC เป็นข้อมูลประกอบการตัดสินใจของคุณ ระบบจะประเมินแกนเรื่องและเครื่องยนต์ของซีรีย์ ไม่ใช่คุณภาพภาพหรือบทพูดรายบรรทัด",
    threshold: "คะแนน 9.0/10 เป็นเกณฑ์แนะนำเท่านั้น — คุณยืนยัน Draft และไปต่อได้ทุกคะแนน",
    rounds: "รอบปรับปรุงสูงสุด",
    estimate: "เครดิตโดยประมาณ (สูงสุด)",
    start: "เริ่มตรวจ QC",
    repair: "ให้ AI ซ่อมตามผล QC (1 รอบ)",
    confirmStartTitle: "ยืนยันเริ่มตรวจ QC",
    confirmRepairTitle: "ยืนยันให้ AI ซ่อม Draft",
    confirmStartBody: "ระบบจะใช้ Skill ตรวจและปรับปรุง Draft ตามจำนวนรอบที่เลือก โดยจะใช้เครดิตตามประมาณการด้านล่าง",
    confirmRepairBody: "ระบบจะส่ง Draft ที่เลือกให้ Skill ปรับเฉพาะจุดที่คะแนนต่ำ แล้วสร้าง Draft ฉบับใหม่โดยไม่ลบฉบับเดิม",
    confirmAction: "ยืนยันและเริ่ม",
    repairPlan: "แผนซ่อมอัตโนมัติ",
    repairPlanHint: "ระบบจะซ่อมเฉพาะจุดที่ตก โดยรักษา premise และ Story Architecture เดิมไว้",
    noRepairPlan: "ยังไม่มีแผนซ่อมที่ปลอดภัย — ไม่ต้องเสียเครดิตเพิ่มและสามารถยืนยัน Draft นี้แบบมีคำเตือนได้",
    running: "กำลังตรวจ Draft — รอผลได้ หรือใช้ Draft ต่อได้",
    cancel: "ยกเลิก",
    queued: "เข้าคิวแล้ว — รอผลได้ หรือใช้ Draft ต่อได้",
    passed: "ผ่าน QC — ใช้ Draft นี้ต่อได้",
    strong: "Draft แข็งแรง แต่ต่ำกว่าเกณฑ์แนะนำ — คุณยังใช้ต่อได้",
    needs_work: "มีคำแนะนำให้ปรับปรุง — คุณยังใช้ Draft ต่อได้",
    blocked: "พบจุดสำคัญที่ควรพิจารณา — คุณยังตัดสินใจใช้ Draft ต่อได้",
    failed: "ตรวจ QC ไม่สำเร็จ — ลองใหม่หรือใช้ Draft ต่อได้",
    cancelled: "ยกเลิกการตรวจแล้ว",
    score: "คะแนนรวม",
    bestRound: "Draft ที่ดีที่สุด: รอบ",
    strengths: "จุดแข็ง",
    weaknesses: "จุดที่ควรปรับ",
    recommendations: "คำแนะนำ",
    evaluatorWarnings: "หมายเหตุจากตัวประเมิน",
    history: "ประวัติรอบตรวจ",
    actual: "ใช้จริง",
    noReport: "ยังไม่มีผลตรวจ — ใช้ Draft ต่อได้ทันที หรือเริ่ม QC เพื่อดูคำแนะนำ",
    continueDraft: "ใช้ Draft นี้และไปต่อ",
    continueDraftHint: "QC เป็นทางเลือก คุณไม่ต้องรอผลเพื่อไปขั้นตอนถัดไป",
    continueAfterFailureHint: "QC ไม่สำเร็จ แต่ Draft เดิมยังใช้ต่อได้",
    belowThresholdHint: "คะแนนต่ำกว่าเกณฑ์แนะนำ แต่ผลนี้ไม่บล็อกการทำงาน — คุณเป็นผู้ตัดสินใจ",
    failureDetails: "รายละเอียดที่ทำให้ QC หยุด",
    phase: "ขั้นตอนที่หยุด",
    attempted: "รอบปรับปรุงที่ทำ",
    evaluations: "การประเมินที่ได้คะแนน",
    baseline: "Baseline",
    round: "รอบ",
    noEvaluation: "รอบนี้ยังไม่ได้คะแนนใหม่",
    scoreDetails: "รายละเอียดคะแนนรายเกณฑ์ของรอบนี้",
    previousResult: "ผล QC รอบก่อน (กู้จากประวัติถาวร)",
    previousResultHint:
      "ผลนี้ใช้สำหรับเปรียบเทียบเท่านั้น — ต้องเริ่ม QC รอบใหม่เพื่อรับผลล่าสุด",
    previousRound: "รอบที่ดีที่สุด",
    selectCandidate: "เลือก Draft รอบนี้",
    selectedCandidate: "เลือก Draft รอบนี้แล้ว",
    candidateHint: "เลือกได้ทุกฉบับที่ถูกประเมิน แล้วระบบจะตรวจ receipt ของฉบับที่เลือกอีกครั้งก่อนสร้างเรื่อง",
    currentResult: "ผล QC รอบล่าสุด",
    currentResultHint: "ผลนี้เป็นผลหลักของการตรวจรอบปัจจุบัน",
    recoveredResult: "ผล QC ที่กู้คืนจากประวัติ",
    recoveredResultHint:
      "รอบล่าสุดตรวจไม่สำเร็จ แต่ระบบกู้ผลรอบที่เสร็จสมบูรณ์แล้วให้เลือกยืนยันได้ตามเกณฑ์",
    selectedDraft: "Draft ที่จะยืนยัน",
    selectedDraftHint: "ระบบเลือกฉบับที่ดีที่สุดของรอบล่าสุดเป็นค่าเริ่มต้น คุณสามารถเลือกฉบับอื่นจากประวัติได้",
    confirmDraft: "ยืนยันใช้ Draft รอบนี้",
    confirmedDraft: "ยืนยัน Draft รอบนี้แล้ว",
    recoveredConfirmHint:
      "รอบล่าสุดหยุดเพราะ scorecard ไม่ครบ แต่ระบบกู้ผลที่ตรวจครบจาก ledger แล้ว — คุณยังเลือกยืนยัน Draft นี้ได้",
    previousCollapsed: "ดูผล QC รอบก่อนในประวัติ",
    historicalBetter: "มีผล QC จากประวัติที่คะแนนสูงกว่า — ขยายประวัติเพื่อเลือก และระบบจะ QC ฉบับนั้นใหม่ก่อนใช้",
  },
  en: {
    title: "Quality-check the draft before full story generation",
    body: "QC is advisory. The skill checks the premise and repeatable story engine—not shot quality or line-by-line dialogue.",
    threshold:
      "9.0/10 is a recommendation only — you can confirm and continue with any score.",
    rounds: "Maximum improvement rounds",
    estimate: "Estimated credits (maximum)",
    start: "Start QC",
    running: "Checking draft — you can wait or continue with this Draft",
    cancel: "Cancel",
    queued: "Queued — wait for the result or continue with this Draft",
    passed: "QC passed — this draft can continue",
    strong: "Strong draft, below the recommendation — you can still continue",
    needs_work: "Suggestions are available — you can still continue",
    blocked: "A critical story issue was found — you still decide whether to continue",
    failed: "QC failed — retry or continue with this Draft",
    cancelled: "QC cancelled",
    score: "Overall score",
    bestRound: "Best draft: round",
    strengths: "Strengths",
    weaknesses: "Needs attention",
    recommendations: "Recommendations",
    evaluatorWarnings: "Evaluator notes",
    history: "QC round history",
    actual: "Actual",
    noReport: "No QC result yet — you can continue now or start QC for suggestions.",
    continueDraft: "Use this Draft and continue",
    continueDraftHint: "QC is optional. You do not need to wait for a result.",
    continueAfterFailureHint: "QC did not complete, but the existing Draft can still be used.",
    belowThresholdHint: "Below the recommended score, but not blocked — you decide whether to continue.",
    failureDetails: "Why QC stopped",
    phase: "Stopped at",
    attempted: "Improvement rounds attempted",
    evaluations: "Scored evaluations",
    baseline: "Baseline",
    round: "Round",
    noEvaluation: "No new score was produced for this round",
    scoreDetails: "Criterion-level scores for this round",
    previousResult: "Previous QC result (recovered from durable history)",
    previousResultHint:
      "This result is comparison-only — start a new QC run for a current result.",
    previousRound: "Best round",
    selectCandidate: "Use this Draft version",
    selectedCandidate: "Selected Draft version",
    candidateHint: "Every evaluated version can be selected; the selected version must pass the QC receipt check before creation.",
    currentResult: "Latest QC result",
    currentResultHint: "This is the primary result for the current QC run.",
    recoveredResult: "Recovered QC result",
    recoveredResultHint:
      "The latest run failed, but a completed result was recovered and can be selected for confirmation subject to the normal gates.",
    selectedDraft: "Draft to confirm",
    selectedDraftHint: "The best version from the current run is selected by default. You can choose another version from history.",
    confirmDraft: "Confirm this Draft",
    confirmedDraft: "Draft confirmed",
    recoveredConfirmHint:
      "The latest run stopped because its scorecard was incomplete, but a completed result was recovered from the ledger — you can still confirm this Draft.",
    previousCollapsed: "View the previous QC result in history",
    historicalBetter: "A historical QC result scored higher — expand history to select it; that Draft will be QC-checked again before use.",
    repair: "Let AI repair from QC findings (1 round)",
    confirmStartTitle: "Confirm Draft QC",
    confirmRepairTitle: "Confirm AI Draft repair",
    confirmStartBody: "The Skill will evaluate and improve the Draft within the selected round budget. Credits are used according to the estimate below.",
    confirmRepairBody: "The Skill will repair only the weak criteria and create a new Draft version without deleting the previous one.",
    confirmAction: "Confirm and start",
    repairPlan: "Automatic repair plan",
    repairPlanHint: "Only weak areas will be repaired while the premise and Story Architecture stay unchanged.",
    noRepairPlan: "No safe repair plan is available — do not spend more credits; you can confirm this Draft with a warning.",
  },
} as const;

function statusCopy(
  lang: "th" | "en",
  status: UiStatus,
  report?: DraftQualityQcReport | null
): string {
  const t = copy[lang];
  if (status === "succeeded" && report)
    return report.pass ? t.passed : t[report.status];
  if (status === "queued") return t.queued;
  if (status === "running") return t.running;
  if (status === "failed") return t.failed;
  if (status === "cancelled") return t.cancelled;
  return t.noReport;
}

function statusIcon(status: UiStatus, pass: boolean) {
  if (status === "succeeded" && pass)
    return (
      <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
    );
  if (
    status === "failed" ||
    status === "cancelled" ||
    (status === "succeeded" && !pass)
  )
    return <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />;
  if (status === "queued" || status === "running")
    return (
      <Loader2
        className="h-5 w-5 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  return (
    <CircleDashed
      className="h-5 w-5 text-muted-foreground"
      aria-hidden="true"
    />
  );
}

/**
 * QC reports are persisted JSON and can predate additive fields such as
 * `evaluationWarnings`.  tRPC's output is not a runtime parser, so normalize
 * at the render boundary.  Invalid core scorecards are rejected instead of
 * fabricating a score; legacy additive fields receive the schema defaults.
 */
function normalizeReportForUi(
  candidate: DraftQualityQcReport | null | undefined
): DraftQualityQcReport | null {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as unknown as Record<string, unknown>;
  const parsed = draftQualityQcReportSchema.safeParse({
    ...raw,
    evaluationWarnings: Array.isArray(raw.evaluationWarnings)
      ? raw.evaluationWarnings
      : [],
  });
  return parsed.success ? parsed.data : null;
}

export function VerticalDramaDraftQualityQcPanel({
  lang,
  status,
  progress,
  report,
  previousResult,
  recoveredResult = false,
  history = [],
  estimate,
  maxRounds,
  disabled,
  error,
  failure,
  onMaxRoundsChange,
  onStart,
  onCancel,
  selectedCandidateFingerprint,
  candidateSelectionPending = false,
  onSelectCandidate,
  onConfirmCandidate,
  candidateCanBeConfirmed = false,
  candidateAlreadyConfirmed = false,
  onRepair,
}: VerticalDramaDraftQualityQcPanelProps) {
  const [confirmation, setConfirmation] = useState<"start" | "repair" | null>(null);
  const t = copy[lang];
  const running = status === "queued" || status === "running";
  const displayStatus: UiStatus = recoveredResult ? "succeeded" : status;
  const terminal =
    status === "succeeded" || status === "failed" || status === "cancelled";
  const rawVisibleReport = report ?? failure?.lastReport ?? null;
  const visibleReport = normalizeReportForUi(rawVisibleReport);
  const safeHistory = Array.isArray(history) ? history : [];
  const visibleHistory = safeHistory.map(item => ({
    ...item,
    source: item,
    report: normalizeReportForUi(item.report),
  }));
  const incompleteReport = rawVisibleReport != null && visibleReport == null;
  const previousReport = normalizeReportForUi(previousResult?.best.report);
  const pass = visibleReport?.pass === true;
  const bestRound =
    visibleHistory.find(
      item => item.kept && item.score === visibleReport?.overallScore
    )?.round ??
    failure?.round ??
    0;
  const roundsAttempted =
    failure?.roundsAttempted ??
    Math.max(0, ...visibleHistory.map(item => item.round));
  const evaluationsCompleted =
    failure?.evaluationsCompleted ??
    visibleHistory.filter(item => item.report).length;
  const selectedHistoryEntry = selectedCandidateFingerprint
    ? visibleHistory.find(
        item => item.candidateFingerprint === selectedCandidateFingerprint
      )
    : undefined;
  const selectedRound = selectedHistoryEntry?.round ?? bestRound;
  const selectedScore = selectedHistoryEntry?.score ?? visibleReport?.overallScore;
  const historicalBetter = Boolean(
    visibleReport &&
      previousReport &&
      previousReport.overallScore > visibleReport.overallScore
  );
  const repairPlan = visibleReport
    ? visibleReport.repairPlan ?? buildDraftQualityQcRepairPlan(visibleReport)
    : null;
  const canRepair = Boolean(
    onRepair &&
      visibleReport &&
      !visibleReport.pass &&
      repairPlan?.available &&
      !running
  );
  const confirmationEstimate =
    confirmation === "repair" && estimate
      ? {
          ...estimate,
          maxImprovementRounds: 1,
          maxCalls: 3,
          estimatedCredits: Number(
            ((estimate.estimatedCredits / Math.max(1, estimate.maxCalls)) * 3).toFixed(2)
          ),
        }
      : estimate;

  return (
    <section
      className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
      aria-labelledby="draft-qc-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h3 id="draft-qc-title" className="font-semibold text-foreground">
              {t.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.threshold}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2" aria-live="polite">
          {statusIcon(displayStatus, pass)}
          <span className="text-sm font-medium">
            {statusCopy(lang, displayStatus, visibleReport)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-end">
        <div>
          <Label htmlFor="draft-qc-rounds">{t.rounds}</Label>
          <Select
            value={String(maxRounds)}
            onValueChange={value => onMaxRoundsChange(Number(value))}
            disabled={running || disabled}
          >
            <SelectTrigger id="draft-qc-rounds" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 5, 10].map(value => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border bg-background/70 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground">{t.estimate}</div>
          <div className="font-medium">
            {estimate
              ? `${estimate.estimatedCredits.toFixed(2)} · ${estimate.maxCalls} calls`
              : "—"}
          </div>
          {estimate && estimate.actualCredits > 0 && (
            <div className="text-xs text-muted-foreground">
              {t.actual}: {estimate.actualCredits.toFixed(2)}
            </div>
          )}
        </div>
        <div className="flex gap-2 sm:justify-end">
          {running ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t.cancel}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setConfirmation("start")}
              disabled={disabled || (status === "succeeded" && pass)}
            >
              {status === "idle" || terminal ? t.start : t.start}
            </Button>
          )}
        </div>
      </div>

      {running && progress && (
        <div className="mt-4" aria-live="polite">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.phase} · {lang === "th" ? "รอบ" : "round"}{" "}
              {progress.round}/{progress.maxRounds}
            </span>
            <span>
              {progress.callsDone}/{progress.callsMax}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{
                width: `${Math.min(100, (progress.callsDone / Math.max(1, progress.callsMax)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {(visibleHistory.length > 0 || failure) && (
        <div className="mt-4 grid gap-2 rounded-lg border bg-background/70 p-3 text-xs text-muted-foreground sm:grid-cols-2">
          <span>
            {t.attempted}: {roundsAttempted}
          </span>
          <span>
            {t.evaluations}: {evaluationsCompleted}
          </span>
        </div>
      )}

      {visibleReport && !visibleReport.pass && (
        <div
          className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          data-testid="vd-draft-qc-repair-plan"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {t.repairPlan}
            </h4>
            {canRepair && (
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmation("repair")}
              >
                {t.repair}
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {repairPlan?.available ? t.repairPlanHint : t.noRepairPlan}
          </p>
          {repairPlan?.actions.length ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-amber-950 dark:text-amber-100">
              {repairPlan.actions.map((action, index) => (
                <li key={`${action.criterionId ?? "critical"}-${index}`}>
                  <span className="font-medium">
                    {action.criterionId
                      ? `${lang === "th" ? "เกณฑ์ที่" : "Criterion"} ${index + 1}`
                      : lang === "th"
                        ? "จุดวิกฤต"
                        : "Critical issue"}
                  </span>{" "}
                  — {action.action}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}

      {(status === "failed" || incompleteReport) &&
        (error || failure || incompleteReport) && (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          role="alert"
        >
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {t.failureDetails}
          </div>
          {incompleteReport && (
            <p className="mt-2 break-words text-xs text-destructive">
              {lang === "th"
                ? "ผลประเมิน QC ไม่ครบถ้วน จึงไม่ใช้คะแนนนี้เป็นผลผ่านและไม่สร้างคะแนนทดแทน"
                : "The QC scorecard is incomplete, so it cannot be accepted and no score was fabricated."}
            </p>
          )}
          {error && (
            <p className="mt-2 break-words text-xs text-destructive">{error}</p>
          )}
          {failure && (
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>
                {t.phase}: {failure.phase} ({t.round} {failure.round})
              </span>
              <span>
                {t.attempted}: {failure.roundsAttempted}
              </span>
              <span>
                {t.evaluations}: {failure.evaluationsCompleted}
              </span>
              <span>
                Calls: {failure.callsDone}/{failure.callsMax}
              </span>
            </div>
          )}
        </div>
      )}

      {previousResult && previousReport && !visibleReport && !running && (
        <div
          className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3"
          data-testid="vd-draft-qc-previous-result"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h4 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
              {t.previousResult}
            </h4>
            <strong className="text-lg text-sky-900 dark:text-sky-100">
              {previousReport.overallScore.toFixed(2)}/10
            </strong>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.previousResultHint} · {t.previousRound} {previousResult.best.round}{" "}
            · {previousResult.model}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {previousReport.criteria.map(item => (
              <div
                key={item.criterionId}
                className="rounded border bg-background/70 p-2 text-xs"
              >
                <div className="flex justify-between gap-2">
                  <span>{item.criterionId.replaceAll("_", " ")}</span>
                  <strong>{item.rawScore}/5</strong>
                </div>
                <p className="mt-1 text-muted-foreground">{item.evidence}</p>
              </div>
            ))}
          </div>
          {previousReport?.criticalFails.length > 0 && (
            <p className="mt-2 text-xs text-destructive">
              {lang === "th"
                ? "รอบก่อนมีจุดวิกฤต"
                : "The previous run had critical failures"}:{" "}
              {previousReport.criticalFails.length}
            </p>
          )}
          {previousResult.history.some(
            item => item.candidateVersion && item.candidateFingerprint
          ) && (
            <div className="mt-3 space-y-2 rounded border border-sky-500/20 bg-background/60 p-2">
              <p className="text-xs font-medium text-sky-900 dark:text-sky-100">
                {t.history} — {t.previousResultHint}
              </p>
              {previousResult.history.map(item =>
                item.candidateVersion && item.candidateFingerprint ? (
                  <div
                    key={`historical-${item.round}-${item.candidateFingerprint}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background/70 p-2 text-xs"
                  >
                    <span>
                      {item.round === 0 ? t.baseline : `${t.round} ${item.round}`} · {item.score.toFixed(2)}/10
                    </span>
                    {onSelectCandidate && (
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          selectedCandidateFingerprint === item.candidateFingerprint
                            ? "secondary"
                            : "outline"
                        }
                        disabled={
                          candidateSelectionPending ||
                          selectedCandidateFingerprint === item.candidateFingerprint
                        }
                        onClick={() => onSelectCandidate(item)}
                      >
                        {selectedCandidateFingerprint === item.candidateFingerprint
                          ? t.selectedCandidate
                          : t.selectCandidate}
                      </Button>
                    )}
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>
      )}

      {visibleReport ? (
        <div className="mt-4 space-y-4">
          <div
            className="rounded-lg border border-primary/30 bg-primary/5 p-3"
            data-testid="vd-draft-qc-current-result"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {recoveredResult ? t.recoveredResult : t.currentResult}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {recoveredResult ? t.recoveredResultHint : t.currentResultHint} · {t.bestRound} {bestRound}
                </p>
              </div>
              <strong
                className={cn(
                  "text-lg",
                  pass ? "text-emerald-600" : "text-foreground"
                )}
              >
                {pass ? t.passed : statusCopy(lang, status, visibleReport)}
              </strong>
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {t.selectedDraft} · {t.round} {selectedRound} · {selectedScore?.toFixed(2)}/10
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.selectedDraftHint}
                </p>
                {!pass && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
            {t.belowThresholdHint}
                  </p>
                )}
              </div>
              {onConfirmCandidate && (
                <Button
                  type="button"
                  size="sm"
                  variant={candidateAlreadyConfirmed ? "secondary" : "default"}
                  disabled={
                    candidateSelectionPending ||
                    candidateAlreadyConfirmed ||
                    !candidateCanBeConfirmed
                  }
                  onClick={onConfirmCandidate}
                >
                  {candidateAlreadyConfirmed ? t.confirmedDraft : t.confirmDraft}
                </Button>
              )}
            </div>
            {recoveredResult && (
              <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-900 dark:text-amber-100">
                {t.recoveredConfirmHint}
              </p>
            )}
            {historicalBetter && (
              <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-900 dark:text-amber-100">
                {t.historicalBetter} ({previousReport?.overallScore.toFixed(2) ?? "—"}/10)
              </p>
            )}
          </div>
          <div className="rounded-lg border bg-background/80 p-3">
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t.score}</span>
              <strong
                className={cn(
                  "text-2xl",
                  pass ? "text-emerald-600" : "text-foreground"
                )}
              >
                {visibleReport.overallScore.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  /10
                </span>
              </strong>
            </div>
            <div
              className="mt-2 h-2 rounded-full bg-muted"
              role="progressbar"
              aria-label={`${t.score} ${visibleReport.overallScore.toFixed(2)} / 10`}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={visibleReport.overallScore}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  pass ? "bg-emerald-500" : "bg-primary"
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, visibleReport.overallScore * 10))}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.bestRound} {bestRound}
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {visibleReport.criteria.map(item => (
              <div
                key={item.criterionId}
                className="rounded-lg border bg-background/70 p-3"
              >
                <div className="flex justify-between gap-2 text-sm">
                  <span>{item.criterionId.replaceAll("_", " ")}</span>
                  <strong>{item.rawScore}/5</strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.evidence}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  weighted: {item.weightedScore.toFixed(2)} · weight{" "}
                  {item.weight}
                </p>
              </div>
            ))}
          </div>
          {visibleReport.criticalFails.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {lang === "th" ? "จุดวิกฤต" : "Critical failures"}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {visibleReport.criticalFails.map(item => (
                  <li key={item.code}>{item.explanation}</li>
                ))}
              </ul>
            </div>
          )}
          {visibleReport.evaluationWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-900">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {t.evaluatorWarnings}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
                {visibleReport.evaluationWarnings.map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                [t.strengths, visibleReport.strengths],
                [t.weaknesses, visibleReport.weaknesses],
                [t.recommendations, visibleReport.recommendations],
              ] as const
            ).map(([heading, items]) => (
              <div
                key={heading}
                className="rounded-lg border bg-background/70 p-3"
              >
                <h4 className="text-sm font-medium">{heading}</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {items.length ? (
                    items.map(item => <li key={item}>{item}</li>)
                  ) : (
                    <li>—</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          {visibleHistory.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium">
                {t.history} ({visibleHistory.length}{" "}
                {lang === "th" ? "ผลประเมิน" : "evaluations"})
              </summary>
              <div className="mt-2 space-y-2">
                {visibleHistory.map(item => (
                  <details
                    key={`${item.round}-${item.reason}`}
                    className="rounded-lg border bg-background/70 p-3"
                  >
                    <summary className="cursor-pointer text-xs font-medium">
                      <span>
                        {item.round === 0
                          ? t.baseline
                          : `${t.round} ${item.round}`}
                      </span>{" "}
                      · <span>{item.score.toFixed(2)}/10</span> ·{" "}
                      <span>
                        {item.kept ? "✓" : "—"} {item.reason}
                      </span>
                    </summary>
                    {item.candidateVersion && item.candidateFingerprint && onSelectCandidate && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-primary/20 bg-primary/5 p-2">
                        <span className="text-[11px] text-muted-foreground">
                          {t.candidateHint} · v{item.candidateVersion}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            selectedCandidateFingerprint === item.candidateFingerprint
                              ? "secondary"
                              : "outline"
                          }
                          disabled={
                            candidateSelectionPending ||
                            selectedCandidateFingerprint === item.candidateFingerprint
                          }
                          onClick={() => onSelectCandidate(item.source)}
                        >
                          {selectedCandidateFingerprint === item.candidateFingerprint
                            ? t.selectedCandidate
                            : t.selectCandidate}
                        </Button>
                      </div>
                    )}
                    {item.report ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          {t.scoreDetails}
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {item.report.criteria.map(criterion => (
                            <div
                              key={criterion.criterionId}
                              className="rounded border p-2 text-xs"
                            >
                              <div className="flex justify-between gap-2">
                                <span>
                                  {criterion.criterionId.replaceAll("_", " ")}
                                </span>
                                <strong>{criterion.rawScore}/5</strong>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                                {criterion.evidence}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                weighted: {criterion.weightedScore.toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>
                        {item.report.criticalFails.length > 0 && (
                          <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
                            <p className="font-medium text-destructive">
                              {lang === "th"
                                ? "จุดวิกฤตของรอบนี้"
                                : "Critical failures in this round"}
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                              {item.report.criticalFails.map(failure => (
                                <li key={failure.code}>
                                  {failure.explanation}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.report.evaluationWarnings.length > 0 && (
                          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-900">
                            <p className="font-medium">{t.evaluatorWarnings}</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {item.report.evaluationWarnings.map(warning => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.note && (
                          <p className="text-xs text-amber-700">{item.note}</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.noEvaluation}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t.noReport}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {status === "failed" || status === "cancelled"
                ? t.continueAfterFailureHint
                : t.continueDraftHint}
            </p>
          </div>
          {onConfirmCandidate && (
            <Button
              type="button"
              size="sm"
              variant={candidateAlreadyConfirmed ? "secondary" : "default"}
              disabled={
                candidateSelectionPending ||
                candidateAlreadyConfirmed ||
                !candidateCanBeConfirmed
              }
              onClick={onConfirmCandidate}
            >
              {candidateAlreadyConfirmed ? t.confirmedDraft : t.continueDraft}
            </Button>
          )}
        </div>
      )}

      {previousResult && previousReport && (visibleReport || running) && (
        <details
          className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3"
          data-testid="vd-draft-qc-previous-result"
        >
          <summary className="cursor-pointer text-sm font-medium text-sky-900 dark:text-sky-100">
            {t.previousCollapsed} · {previousReport.overallScore.toFixed(2)}/10
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            {t.previousResultHint} · {t.previousRound} {previousResult.best.round} · {previousResult.model}
          </p>
          {previousResult.history.length > 0 && (
            <div className="mt-3 space-y-2">
              {previousResult.history.map(item =>
                item.candidateVersion && item.candidateFingerprint ? (
                  <div
                    key={`collapsed-historical-${item.round}-${item.candidateFingerprint}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background/70 p-2 text-xs"
                  >
                    <span>
                      {item.round === 0 ? t.baseline : `${t.round} ${item.round}`} · {item.score.toFixed(2)}/10
                    </span>
                    {onSelectCandidate && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={candidateSelectionPending}
                        onClick={() => onSelectCandidate(item)}
                      >
                        {t.selectCandidate}
                      </Button>
                    )}
                  </div>
                ) : null
              )}
            </div>
          )}
        </details>
      )}

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={open => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "repair"
                ? t.confirmRepairTitle
                : t.confirmStartTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === "repair"
                ? t.confirmRepairBody
                : t.confirmStartBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">{t.estimate}</div>
            <div className="font-medium">
              {confirmationEstimate
                ? `${confirmationEstimate.estimatedCredits.toFixed(2)} · ${confirmationEstimate.maxCalls} calls`
                : "—"}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirmation;
                setConfirmation(null);
                if (action === "repair") onRepair?.();
                else onStart();
              }}
            >
              {t.confirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
