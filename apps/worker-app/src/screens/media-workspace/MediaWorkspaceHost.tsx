import { useState } from "react";
import { useWorkerAppContext } from "../../app/workerContext";

type WorkspaceStage = "intake" | "inventory" | "ai-plan" | "review" | "qc" | "processing" | "published";
type WorkspaceStatus = { status: string; fileCount: number; totalBytes: number } | null;
type ScanStatus = { supportedFileCount: number; skippedFileCount: number; fileCount: number } | null;
type PlanStatus = { planId: string; trimEndMs: number; outputRelativeName: string } | null;

export function MediaWorkspaceHost({ workspace, scan, plan, busy, canSubmit, onSubmit, onIngest }: { workspace: WorkspaceStatus; scan: ScanStatus; plan: PlanStatus; busy: boolean; canSubmit?: boolean; onSubmit?: () => void; onIngest?: () => void }) {
  const { locale } = useWorkerAppContext();
  const [stage, setStage] = useState<WorkspaceStage>("intake");
  const stages: Array<{ id: WorkspaceStage; label: string }> = locale === "th"
    ? [
      { id: "intake", label: "รับเข้า" }, { id: "inventory", label: "คลังสื่อ" }, { id: "ai-plan", label: "แผน AI" },
      { id: "review", label: "ตรวจทาน" }, { id: "qc", label: "QC" }, { id: "processing", label: "กำลังประมวลผล" }, { id: "published", label: "เผยแพร่แล้ว" },
    ]
    : [
      { id: "intake", label: "Intake" }, { id: "inventory", label: "Inventory" }, { id: "ai-plan", label: "AI Plan" },
      { id: "review", label: "Review" }, { id: "qc", label: "QC" }, { id: "processing", label: "Processing" }, { id: "published", label: "Published" },
    ];
  const copy = locale === "th"
    ? { aria: "ขั้นตอน Media workspace", chooseFolder: "เลือกโฟลเดอร์ต้นฉบับบนเครื่อง Worker ก่อน", inventory: "ยังไม่ได้ scan inventory", found: (supported: number, total: number) => `ตรวจพบ ${supported} ไฟล์ที่รองรับ จาก ${total} ไฟล์`, plan: (id: string, seconds: number) => `แผน ${id} จำกัด ${seconds} วินาที`, noPlan: "ยังไม่มี edit plan", review: "ตรวจ intent: dead air, focus, aspect ratio และ duration budget ก่อนส่งงาน", qc: "QC จะตรวจ checksum, duration, dimensions, audio และ derived-only output", working: "กำลังประมวลผลบน Worker", idle: "ยังไม่มีงานกำลังประมวลผล", published: "แสดงเฉพาะ artifact ที่ server ยืนยันแล้วและพร้อมผูกกับ Series", submit: "ส่งเข้า Worker queue", ingest: "วิเคราะห์ inventory ทั้งโฟลเดอร์" }
    : { aria: "Media workspace stages", chooseFolder: "Select a source folder on the Worker machine first", inventory: "Inventory has not been scanned", found: (supported: number, total: number) => `${supported} supported file(s) found out of ${total}`, plan: (id: string, seconds: number) => `Plan ${id} limited to ${seconds} seconds`, noPlan: "No edit plan yet", review: "Review dead air, focus, aspect ratio, and duration budget before submission", qc: "QC checks checksum, duration, dimensions, audio, and derived-only output", working: "Processing on the Worker", idle: "No job is processing", published: "Only server-verified artifacts ready to bind to the Series are shown", submit: "Submit to Worker queue", ingest: "Analyze inventory for the folder" };
  return <section className="media-workspace-host" aria-label={copy.aria}>
    <div className="media-stage-nav">{stages.map((item) => <button key={item.id} type="button" className={stage === item.id ? "active" : ""} onClick={() => setStage(item.id)}>{item.label}</button>)}</div>
    <div className="workspace-status-card" role="status">
      <strong>{stages.find((item) => item.id === stage)?.label}</strong>
      {stage === "intake" && <span>{workspace ? (locale === "th" ? "เลือกโฟลเดอร์ footage ในเครื่องแล้ว" : "Local footage root selected") : copy.chooseFolder}</span>}
      {stage === "inventory" && <span>{scan ? copy.found(scan.supportedFileCount, scan.fileCount) : copy.inventory}</span>}
      {stage === "ai-plan" && <span>{plan ? copy.plan(plan.planId, Math.round(plan.trimEndMs / 1000)) : copy.noPlan}</span>}
      {stage === "review" && <span>{copy.review}</span>}
      {stage === "qc" && <span>{copy.qc}</span>}
      {stage === "processing" && <span>{busy ? copy.working : copy.idle}</span>}
      {stage === "published" && <span>{copy.published}</span>}
      {onSubmit ? <button type="button" className="secondary-button" onClick={onSubmit} disabled={!canSubmit || busy}>{copy.submit}</button> : null}
      {onIngest ? <button type="button" className="secondary-button" onClick={onIngest} disabled={!workspace || busy}>{copy.ingest}</button> : null}
    </div>
  </section>;
}
