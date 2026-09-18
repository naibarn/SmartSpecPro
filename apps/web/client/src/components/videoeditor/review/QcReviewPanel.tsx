import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { canRenderFromQc, type ReviewQcItem } from './reviewTypes';

export function QcReviewPanel({ items, onOverride }: { items: ReviewQcItem[]; onOverride?: (id: string) => void }) {
  const canRender = canRenderFromQc(items);
  return (
    <section className="grid gap-2" aria-label="Quality control review" data-testid="qc-review-panel">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">ตรวจคุณภาพก่อน Render</h3><Badge variant={canRender ? 'default' : 'destructive'}>{canRender ? 'พร้อมตรวจต่อ' : 'บล็อกการ Render'}</Badge></div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีผล QC จาก artifact นี้</p> : <div className="grid gap-2">{items.map((item) => <div key={item.id} className="flex items-start gap-2 rounded-md border border-border/70 p-3 text-sm"><span aria-hidden="true">{item.severity === 'BLOCKING' ? <AlertTriangle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-primary" />}</span><div className="min-w-0"><div className="flex flex-wrap gap-2"><strong>{item.severity}</strong>{item.blocking ? <Badge variant="destructive">ต้องแก้ก่อน Render</Badge> : null}</div><p className="mt-1 text-muted-foreground">{item.message}</p>{item.overrideAllowed ? <button type="button" className="mt-2 underline underline-offset-4" onClick={() => onOverride?.(item.id)}>ดูทางเลือก override ที่ server อนุมัติ</button> : null}</div></div>)}</div>}
      {!canRender ? <p className="text-xs text-destructive">ระบบจะไม่ถือว่าผลลัพธ์ผ่าน และจะไม่เปิด final render จนกว่าจะมีทางเลือกที่ server อนุมัติ</p> : null}
    </section>
  );
}
