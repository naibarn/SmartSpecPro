import { Badge } from '@/components/ui/badge';
import type { ReviewOperation } from './reviewTypes';

export function EvidenceInspector({ operation }: { operation: ReviewOperation }) {
  return (
    <details className="rounded-md border border-border/60 bg-background/30 p-2 text-xs">
      <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">หลักฐานและความมั่นใจ</summary>
      <div className="mt-2 grid gap-1 text-muted-foreground">
        <span>Confidence: {typeof operation.confidence === 'number' ? `${Math.round(operation.confidence * 100)}%` : 'ไม่มีข้อมูล'}</span>
        <span>Evidence: {operation.evidenceRefs?.length ? operation.evidenceRefs.join(', ') : 'ยังไม่มี reference'}</span>
        {operation.manualLock ? <Badge variant="outline" className="w-fit">ป้องกันไว้ด้วย manual lock</Badge> : null}
      </div>
    </details>
  );
}
