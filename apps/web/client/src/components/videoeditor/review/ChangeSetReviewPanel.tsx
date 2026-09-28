import { Check, LockKeyhole, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { canApplyReviewChangeSet, type ReviewChangeSet } from './reviewTypes';
import { EvidenceInspector } from './EvidenceInspector';

export function ChangeSetReviewPanel({ changeSet, currentRevisionId, onApply, onReject, onRevert, onRegenerate }: { changeSet: ReviewChangeSet | null; currentRevisionId: string | null; onApply?: (operationIds: string[]) => void; onReject?: (operationIds: string[]) => void; onRevert?: () => void; onRegenerate?: (operationIds: string[]) => void }) {
  if (!changeSet) return <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">ยังไม่มีข้อเสนอแนะสำหรับขอบเขตนี้ ระบบจะไม่แก้ timeline โดยอัตโนมัติ</div>;
  const stale = changeSet.revisionId !== currentRevisionId || changeSet.status === 'stale';
  const selectable = changeSet.operations.filter((operation) => operation.state === 'suggested' && !operation.manualLock).map((operation) => operation.id);
  return (
    <section className="grid gap-3" data-testid="change-set-review-panel">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">ตรวจสอบข้อเสนอแนะ</h3><p className="text-xs text-muted-foreground">Change-set {changeSet.id} · revision {changeSet.revisionId}</p></div><Badge variant={stale ? 'destructive' : 'outline'}>{stale ? 'stale' : changeSet.status}</Badge></div>
      {stale ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">ข้อเสนอแนะไม่ตรงกับ revision ปัจจุบัน ต้องวิเคราะห์ใหม่ก่อน Apply</div> : null}
      <div className="grid gap-2">
        {changeSet.operations.map((operation) => <article key={operation.id} className="grid gap-2 rounded-md border border-border/70 p-3"><div className="flex items-start justify-between gap-2"><span className="font-medium">{operation.label}</span><Badge variant={operation.manualLock ? 'outline' : operation.state === 'skipped' ? 'secondary' : 'default'}>{operation.manualLock ? <><LockKeyhole className="mr-1 size-3" />ป้องกันไว้</> : operation.state === 'skipped' ? 'ข้ามไว้' : operation.state}</Badge></div>{operation.reason ? <p className="text-xs text-muted-foreground">{operation.reason}</p> : null}<EvidenceInspector operation={operation} /></article>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={stale || !canApplyReviewChangeSet(changeSet, currentRevisionId)} onClick={() => onApply?.(selectable)}><Check className="size-4" />Apply ที่เลือกได้</button>
        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={stale || selectable.length === 0} onClick={() => onReject?.(selectable)}><X className="size-4" />Reject</button>
        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={changeSet.status !== 'applied'} onClick={onRevert}><RotateCcw className="size-4" />Revert</button>
        <button type="button" className="min-h-10 rounded-md px-3 py-2 text-sm underline underline-offset-4 disabled:opacity-50" disabled={selectable.length === 0} onClick={() => onRegenerate?.(selectable)}>Regenerate ที่เลือก</button>
      </div>
    </section>
  );
}
