import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import type { TranscriptState } from './reviewTypes';

export function TranscriptAnchorView({ state, transcript, onRetry }: { state: TranscriptState; transcript?: string; onRetry?: () => void }) {
  if (state === 'loading') return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />กำลังโหลด transcript…</div>;
  if (state === 'ready' && transcript) {
    return <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm leading-6" data-testid="transcript-anchor-view"><div className="mb-2 flex items-center gap-2 font-semibold"><FileText className="size-4" />Transcript / source anchor</div><p>{transcript}</p></div>;
  }
  const message = state === 'stale' ? 'transcript นี้ไม่ตรงกับ revision ปัจจุบัน' : state === 'error' ? 'โหลด transcript ไม่สำเร็จ' : 'ยังไม่มี transcript ที่พร้อมใช้งาน';
  return <div className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200" role="status"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{message}{onRetry ? <button type="button" className="ml-2 underline underline-offset-4" onClick={onRetry}>ลองใหม่</button> : null}</span></div>;
}
