import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  MARKETPLACE_DRAFT_QC_ROUND_OPTIONS,
  type MarketplaceDraftQcState,
} from "@shared/marketplaceAutoReview/draftQualityQc";

const CRITERION_LABELS: Record<string, { th: string; en: string }> = {
  hook_strength: { th: "Hook / จุดหยุดการเลื่อน", en: "Hook strength" },
  audience_problem_relevance: { th: "ตรงปัญหากลุ่มเป้าหมาย", en: "Audience & problem" },
  product_integration: { th: "การผูกสินค้าเข้ากับเรื่อง", en: "Product integration" },
  benefit_clarity: { th: "ความชัดเจนของประโยชน์", en: "Benefit clarity" },
  story_review_progression: { th: "ลำดับเรื่องและการรีวิว", en: "Story / review progression" },
  proof_credibility: { th: "หลักฐานและความน่าเชื่อถือ", en: "Proof & credibility" },
  emotional_persuasive_power: { th: "พลังอารมณ์และการโน้มน้าว", en: "Emotional / persuasive power" },
  product_memorability: { th: "ความจำสินค้า", en: "Product memorability" },
  cta_conversion_path: { th: "CTA และทางไปสู่การตัดสินใจ", en: "CTA / conversion path" },
  originality_scroll_stop: { th: "ความสดใหม่และหยุดการเลื่อน", en: "Originality / scroll-stop" },
};

export function MarketplaceDraftQualityQcPanel(props: {
  state: MarketplaceDraftQcState | null | undefined;
  onStart: (maxImprovementRounds: number) => void;
  onRepair?: () => void;
  onSelectRepair?: () => void;
  starting?: boolean;
  repairing?: boolean;
  error?: string | null;
  locale?: string;
}) {
  const isEnglish = String(props.locale ?? "th").toLowerCase().startsWith("en");
  const [rounds, setRounds] = useState(
    props.state?.maxImprovementRounds ?? 3
  );
  const [repairConfirmationOpen, setRepairConfirmationOpen] = useState(false);
  const [startConfirmationOpen, setStartConfirmationOpen] = useState(false);
  const state = props.state;
  const report = state?.report;
  const statusLabel = useMemo(() => {
    if (state?.status === "succeeded" && report?.pass) return isEnglish ? "Passed" : "ผ่าน QC";
    if (state?.status === "failed") return isEnglish ? "QC failed" : "ตรวจไม่สำเร็จ";
    if (state?.status === "queued") return isEnglish ? "Queued" : "เข้าคิวตรวจ";
    if (state?.status === "running") return isEnglish ? "Reviewing" : "กำลังตรวจ";
    if (report?.status === "blocked") return isEnglish ? "Blocked" : "มีจุดต้องแก้";
    return isEnglish ? "Not reviewed" : "ยังไม่ได้ตรวจ";
  }, [isEnglish, report?.pass, report?.status, state?.status]);
  const progress = state?.progress;
  const progressPercent = progress
    ? Math.min(100, Math.round((progress.callsDone / Math.max(1, progress.callsMax)) * 100))
    : 0;
  const scoreText = report ? `${report.overallScore.toFixed(2)}/10` : "—";
  const repairPlan = report?.repairPlan;
  const repairPending =
    state?.repairStatus === "queued" || state?.repairStatus === "running";
  const canRepair = Boolean(
    props.onRepair &&
      report &&
      !report.pass &&
      repairPlan?.available &&
      !repairPending &&
      state?.repairStatus !== "succeeded",
  );

  if (!state?.required) return null;

  return (
    <section className="mt-5 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/90 to-white p-4 shadow-sm" aria-labelledby="marketplace-draft-qc-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-700" aria-hidden="true" />
            <h3 id="marketplace-draft-qc-heading" className="text-base font-semibold text-slate-900">
              {isEnglish ? "Creative QC before approval" : "ตรวจคุณภาพ Draft ก่อนยืนยัน"}
            </h3>
            <Badge variant={report?.pass ? "default" : "secondary"}>{statusLabel}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {isEnglish
              ? "The system checks the product story against evidence, hook, benefits, progression, proof, CTA, and scroll-stopping quality before media credits are spent."
              : "ระบบตรวจ Draft กับข้อมูลสินค้า หลักฐาน Hook ประโยชน์ ลำดับรีวิว ความน่าเชื่อถือ CTA และความน่าสนใจ ก่อนเริ่มใช้เครดิตสร้างสื่อ"}
          </p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-right">
          <div className="text-xs text-slate-500">{isEnglish ? "Overall score" : "คะแนนรวม"}</div>
          <div className={`text-2xl font-bold ${report?.pass ? "text-emerald-700" : "text-slate-900"}`}>{scoreText}</div>
          <div className="text-xs text-slate-500">{isEnglish ? "pass ≥ 8.00 with no hard fail" : "ผ่านเมื่อ ≥ 8.00 และไม่มีจุดวิกฤต"}</div>
        </div>
      </div>

      {state.status === "not_started" || state.status === "failed" ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-sky-300 bg-white/80 p-3">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">{isEnglish ? "Improvement rounds" : "รอบปรับปรุงอัตโนมัติ"}</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              value={rounds}
              onChange={event => setRounds(Number(event.target.value))}
              disabled={props.starting}
              aria-label={isEnglish ? "Improvement rounds" : "จำนวนรอบปรับปรุง"}
            >
              {MARKETPLACE_DRAFT_QC_ROUND_OPTIONS.map(value => (
                <option key={value} value={value}>{value} {isEnglish ? "rounds" : "รอบ"}</option>
              ))}
            </select>
          </label>
          <p className="max-w-xl text-xs text-slate-500">
            {isEnglish
              ? `Maximum ${1 + rounds * 2} LLM calls (baseline + revise/evaluate). Actual unused reservation is refunded.`
              : `สูงสุด ${1 + rounds * 2} ครั้ง (ตรวจฐาน + ปรับ/ตรวจซ้ำ) ระบบคืนเครดิตส่วนที่ไม่ได้ใช้`}
          </p>
          <Button type="button" onClick={() => setStartConfirmationOpen(true)} disabled={props.starting}>
            {props.starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {isEnglish ? "Run Creative QC" : "เริ่มตรวจ Creative QC"}
          </Button>
        </div>
      ) : null}

      {state.status === "queued" || state.status === "running" ? (
        <div className="mt-4 rounded-lg border border-sky-200 bg-white p-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-medium text-sky-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            {state.status === "queued" ? (isEnglish ? "Waiting for QC worker…" : "กำลังรอคิวตรวจ…") : (isEnglish ? "Evaluating and retaining the best draft…" : "กำลังตรวจและเก็บ Draft ที่ดีที่สุด…")}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${progressPercent}%`}>
            <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{progress ? `${progress.callsDone}/${progress.callsMax} calls` : (isEnglish ? "The page refreshes automatically." : "หน้าจะอัปเดตอัตโนมัติ")}</p>
        </div>
      ) : null}

      {state.creditEstimate ? (
        <p className="mt-3 text-xs text-slate-600">
          {isEnglish
            ? `QC credit estimate: up to ${state.creditEstimate.estimatedCredits ?? 0} credits; actual ${state.creditEstimate.actualCredits ?? 0}.`
            : `ประมาณการเครดิต QC: สูงสุด ${state.creditEstimate.estimatedCredits ?? 0} เครดิต ใช้จริง ${state.creditEstimate.actualCredits ?? 0} เครดิต`}
        </p>
      ) : null}

      {props.error || state.error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{props.error || state.error}</span>
        </div>
      ) : null}

      {report ? (
        <>
          {report.criticalFails.length > 0 ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-900"><CircleAlert className="h-4 w-4" />{isEnglish ? "Hard failures" : "จุดวิกฤตที่ยังไม่ผ่าน"}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">{report.criticalFails.map(item => <li key={`${item.code}-${item.explanation}`}>{item.explanation}</li>)}</ul>
            </div>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.criteria.map(item => {
              const label = CRITERION_LABELS[item.criterionId ?? ""];
              return <article key={item.criterionId} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium text-slate-800">{isEnglish ? label?.en ?? item.criterionId : label?.th ?? item.criterionId}</span><span className="text-sm font-semibold text-slate-900">{item.rawScore.toFixed(1)}/5</span></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.evidence}</p>
              </article>;
            })}
          </div>
          {report.recommendations.length > 0 && !report.pass ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>{isEnglish ? "Next improvements" : "จุดแนะนำให้ปรับ"}</strong><ul className="mt-1 list-disc space-y-1 pl-5">{report.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
          {!report.pass ? (
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{isEnglish ? "Guided repair plan" : "แผนซ่อมแบบมีการยืนยัน"}</strong>
                {canRepair ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setRepairConfirmationOpen(true)}
                    disabled={props.repairing}
                  >
                    {props.repairing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isEnglish ? "Repair and re-check" : "ซ่อมและตรวจ QC ใหม่"}
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-orange-900/80">
                {repairPlan?.available
                  ? isEnglish
                    ? "Only bounded, evidence-backed fields are sent to the Skill. The current plan remains active until you select a passed repair."
                    : "ระบบจะส่งเฉพาะจุดที่มีหลักฐานให้ Skill แก้แบบจำกัด และจะไม่เปลี่ยนแผนปัจจุบันจนกว่าคุณจะเลือกผลที่ผ่าน"
                  : isEnglish
                    ? "No safe automatic repair plan is available. Use manual redraft instead."
                    : "ยังไม่มีแผนซ่อมอัตโนมัติที่ปลอดภัย แนะนำให้แก้แผนด้วยตนเอง"
                }
              </p>
              {repairPlan?.actions.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {repairPlan.actions.map((action, index) => (
                    <li key={`${action.criterionId ?? "critical"}-${index}`}>
                      {action.action}
                      {!action.autoRunnable ? ` (${isEnglish ? "manual review" : "ต้องตรวจ/แก้เอง"})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {state.repairStatus === "queued" || state.repairStatus === "running" ? (
            <div className="mt-3 rounded-lg border border-orange-200 bg-white p-3 text-sm text-orange-900" role="status" aria-live="polite">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {isEnglish ? "Repair is running; a fresh QC will follow." : "กำลังซ่อม และจะตรวจ QC ฉบับใหม่ต่อให้อัตโนมัติ"}
            </div>
          ) : null}
          {state.repairReport ? (
            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
              <strong>{isEnglish ? "Repair result" : "ผลหลังซ่อม"}</strong>
              <p className="mt-1 text-xs">
                {isEnglish ? "Original" : "เดิม"}: {state.repairComparison?.sourceScore?.toFixed(2) ?? "—"}/10 · {isEnglish ? "Repaired" : "ซ่อมแล้ว"}: {state.repairReport.overallScore.toFixed(2)}/10
              </p>
              {state.repairStatus === "succeeded" &&
              state.repairReport.pass &&
              props.onSelectRepair ? (
                <Button type="button" size="sm" className="mt-2" onClick={props.onSelectRepair}>
                  {isEnglish ? "Use passed repaired plan" : "เลือกแผนที่ซ่อมแล้ว"}
                </Button>
              ) : (
                <p className="mt-1 text-xs">
                  {isEnglish
                    ? "The original plan remains active because the repaired result was not a better passed candidate."
                    : "ยังคงใช้แผนเดิม เพราะผลซ่อมยังไม่ใช่ candidate ที่ผ่านและดีกว่าเดิม"}
                </p>
              )}
            </div>
          ) : null}
          {report.pass ? <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />{isEnglish ? "QC passed. You can review the draft and approve it." : "QC ผ่านแล้ว คุณยังอ่าน Draft ได้ และสามารถกดยืนยันได้"}</div> : null}
        </>
      ) : null}
      <AlertDialog open={repairConfirmationOpen} onOpenChange={setRepairConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isEnglish ? "Confirm guided repair" : "ยืนยันการซ่อม Draft"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isEnglish
                ? "This uses a bounded Skill repair call and a fresh QC evaluation. The current plan is preserved until you explicitly select a passed result."
                : "ระบบจะใช้ Skill ซ่อมแบบจำกัด 1 ครั้งและตรวจ QC ฉบับใหม่ โดยเก็บแผนเดิมไว้จนกว่าคุณจะกดเลือกผลที่ผ่านด้วยตนเอง"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isEnglish ? "Cancel" : "ยกเลิก"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRepairConfirmationOpen(false);
                props.onRepair?.();
              }}
            >
              {isEnglish ? "Confirm and repair" : "ยืนยันและสั่งซ่อม"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={startConfirmationOpen} onOpenChange={setStartConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isEnglish ? "Confirm Creative QC" : "ยืนยันเริ่มตรวจ Creative QC"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isEnglish
                ? `This may use up to ${1 + rounds * 2} LLM calls. Unused reserved credits are refunded.`
                : `การตรวจอาจใช้สูงสุด ${1 + rounds * 2} ครั้ง ระบบจะคืนเครดิตส่วนที่จองไว้แต่ไม่ได้ใช้`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isEnglish ? "Cancel" : "ยกเลิก"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setStartConfirmationOpen(false);
                props.onStart(rounds);
              }}
            >
              {isEnglish ? "Confirm and run QC" : "ยืนยันและเริ่มตรวจ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
