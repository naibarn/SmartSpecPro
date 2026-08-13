import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "@shared/verticalDramaSeries/draftQualityQc";

type UiStatus = "idle" | DraftQualityQcJobStatus;

export interface VerticalDramaDraftQualityQcPanelProps {
  lang: "th" | "en";
  status: UiStatus;
  progress?: DraftQualityQcProgress | null;
  report?: DraftQualityQcReport | null;
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
  onCancel: () => void;
  onOverrideChange: (value: boolean) => void;
}

const copy = {
  th: {
    title: "ตรวจคุณภาพ Draft ก่อนสร้างเรื่องเต็ม",
    body: "ระบบจะให้ Skill ประเมินแกนเรื่องและเครื่องยนต์ของซีรีย์ ไม่ใช่คุณภาพภาพหรือบทพูดรายบรรทัด",
    threshold: "ผ่านอัตโนมัติเมื่อได้ 9.0/10 ขึ้นไปและไม่มีจุดวิกฤต",
    rounds: "รอบปรับปรุงสูงสุด",
    estimate: "เครดิตโดยประมาณ (สูงสุด)",
    start: "เริ่มตรวจ QC",
    running: "กำลังตรวจ Draft…",
    cancel: "ยกเลิก",
    queued: "เข้าคิวแล้ว รอ Worker เริ่มตรวจ",
    passed: "ผ่าน QC — ใช้ Draft นี้ต่อได้",
    strong: "Draft แข็งแรง แต่ยังไม่ถึงเกณฑ์ 9.0",
    needs_work: "ควรปรับปรุง Draft เพิ่ม",
    blocked: "ถูกบล็อกด้วยจุดสำคัญที่ต้องแก้",
    failed: "ตรวจ QC ไม่สำเร็จ — ลองใหม่ได้",
    cancelled: "ยกเลิกการตรวจแล้ว",
    score: "คะแนนรวม",
    bestRound: "Draft ที่ดีที่สุด: รอบ",
    strengths: "จุดแข็ง",
    weaknesses: "จุดที่ควรปรับ",
    recommendations: "คำแนะนำ",
    history: "ประวัติรอบตรวจ",
    override:
      "ยืนยันใช้ Draft แม้ยังไม่ผ่าน 9.0 (ใช้ได้เมื่อครบจำนวนรอบและไม่มีจุดวิกฤต)",
    actual: "ใช้จริง",
    noReport: "ยังไม่มีผลตรวจ — เริ่ม QC เพื่อดูคะแนนก่อนใช้ Draft",
    failureDetails: "รายละเอียดที่ทำให้ QC หยุด",
    phase: "ขั้นตอนที่หยุด",
    attempted: "รอบปรับปรุงที่ทำ",
    evaluations: "การประเมินที่ได้คะแนน",
    baseline: "Baseline",
    round: "รอบ",
    noEvaluation: "รอบนี้ยังไม่ได้คะแนนใหม่",
    scoreDetails: "รายละเอียดคะแนนรายเกณฑ์ของรอบนี้",
  },
  en: {
    title: "Quality-check the draft before full story generation",
    body: "The skill checks the premise and repeatable story engine—not shot quality or line-by-line dialogue.",
    threshold:
      "Automatic pass requires 9.0/10 or higher with no critical failure.",
    rounds: "Maximum improvement rounds",
    estimate: "Estimated credits (maximum)",
    start: "Start QC",
    running: "Checking draft…",
    cancel: "Cancel",
    queued: "Queued — waiting for a worker",
    passed: "QC passed — this draft can continue",
    strong: "Strong draft, but below the 9.0 threshold",
    needs_work: "The draft needs more work",
    blocked: "Blocked by a critical story issue",
    failed: "QC failed — you can retry",
    cancelled: "QC cancelled",
    score: "Overall score",
    bestRound: "Best draft: round",
    strengths: "Strengths",
    weaknesses: "Needs attention",
    recommendations: "Recommendations",
    history: "QC round history",
    override:
      "Confirm using this draft below 9.0 (available only after all rounds and with no critical failure)",
    actual: "Actual",
    noReport: "No QC result yet — start QC to see whether this draft is ready.",
    failureDetails: "Why QC stopped",
    phase: "Stopped at",
    attempted: "Improvement rounds attempted",
    evaluations: "Scored evaluations",
    baseline: "Baseline",
    round: "Round",
    noEvaluation: "No new score was produced for this round",
    scoreDetails: "Criterion-level scores for this round",
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

export function VerticalDramaDraftQualityQcPanel({
  lang,
  status,
  progress,
  report,
  history = [],
  estimate,
  maxRounds,
  disabled,
  overrideSelected,
  overrideEligible,
  error,
  failure,
  onMaxRoundsChange,
  onStart,
  onCancel,
  onOverrideChange,
}: VerticalDramaDraftQualityQcPanelProps) {
  const t = copy[lang];
  const running = status === "queued" || status === "running";
  const terminal =
    status === "succeeded" || status === "failed" || status === "cancelled";
  const visibleReport = report ?? failure?.lastReport ?? null;
  const pass = visibleReport?.pass === true;
  const bestRound =
    history.find(
      item => item.kept && item.score === visibleReport?.overallScore
    )?.round ??
    failure?.round ??
    0;
  const roundsAttempted =
    failure?.roundsAttempted ?? Math.max(0, ...history.map(item => item.round));
  const evaluationsCompleted =
    failure?.evaluationsCompleted ?? history.filter(item => item.report).length;

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
          {statusIcon(status, pass)}
          <span className="text-sm font-medium">
            {statusCopy(lang, status, report)}
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
              onClick={onStart}
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

      {(history.length > 0 || failure) && (
        <div className="mt-4 grid gap-2 rounded-lg border bg-background/70 p-3 text-xs text-muted-foreground sm:grid-cols-2">
          <span>
            {t.attempted}: {roundsAttempted}
          </span>
          <span>
            {t.evaluations}: {evaluationsCompleted}
          </span>
        </div>
      )}

      {status === "failed" && (error || failure) && (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          role="alert"
        >
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {t.failureDetails}
          </div>
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

      {visibleReport ? (
        <div className="mt-4 space-y-4">
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
          {overrideEligible && !pass && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <input
                type="checkbox"
                checked={overrideSelected}
                onChange={event => onOverrideChange(event.target.checked)}
                className="mt-0.5"
              />
              {t.override}
            </label>
          )}
          {history.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium">
                {t.history} ({history.length}{" "}
                {lang === "th" ? "ผลประเมิน" : "evaluations"})
              </summary>
              <div className="mt-2 space-y-2">
                {history.map(item => (
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
        <p className="mt-4 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          {t.noReport}
        </p>
      )}
    </section>
  );
}
