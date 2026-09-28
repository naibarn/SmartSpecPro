import { useEffect } from 'react';
import { Ban, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { projectExecutionStatus } from './ui/executionStatusUi';

export interface EditorJobStatusPanelProps {
  jobId: string | number | null;
  pinnedRevisionId?: string | null;
  onOpenQueue: () => void;
  onReturnToEditor?: () => void;
}
export function EditorJobStatusPanel({ jobId, pinnedRevisionId, onOpenQueue, onReturnToEditor }: EditorJobStatusPanelProps) {
  const detailQuery = trpc.workerJobs.detail.useQuery(
    { jobId: jobId ? String(jobId) : '' },
    { enabled: Boolean(jobId), refetchInterval: jobId ? 5000 : false },
  );
  const cancelMutation = trpc.workerJobs.cancelQueued.useMutation({
    onSuccess: () => void detailQuery.refetch(),
  });

  useEffect(() => {
    if (detailQuery.data?.status === 'completed' || detailQuery.data?.status === 'succeeded') {
      void detailQuery.refetch();
    }
  }, [detailQuery.data?.status]);

  if (!jobId) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีงานที่ส่งเข้า Worker</p>;
  }

  if (detailQuery.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />กำลังโหลดสถานะงาน…</div>;
  }

  const projection = projectExecutionStatus({
    ...(detailQuery.data ?? { status: 'queued' }),
    pinnedRevisionId,
  });

  return (
    <section className="grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3" data-testid="editor-job-status-panel" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Job {jobId}</p>
          <h3 className="font-semibold text-foreground">{projection.label}</h3>
        </div>
        <Badge variant={projection.state === 'completed' ? 'default' : projection.state === 'failed' || projection.state === 'capability-blocked' ? 'destructive' : 'outline'}>{projection.state}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{projection.reason}</p>
      {projection.context ? <p className="break-words text-xs text-muted-foreground">{projection.context}</p> : null}
      {projection.progress !== undefined ? <Progress value={projection.progress} aria-label="ความคืบหน้างาน Worker" /> : null}
      <div className="flex flex-wrap gap-2">
        {projection.canCancel ? (
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={() => cancelMutation.mutate({ jobId: String(jobId) })} disabled={cancelMutation.isPending}>
            {cancelMutation.isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Ban className="size-4" />}
            ยกเลิกงาน
          </button>
        ) : null}
        {projection.canRetry ? <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-400/40 px-3 py-2 text-sm text-amber-300"><RotateCcw className="size-4" />ตรวจสอบเงื่อนไขก่อนลองใหม่</span> : null}
        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpenQueue}>
          <ExternalLink className="size-4" />เปิดรายละเอียดคิวงาน
        </button>
        {onReturnToEditor ? <button type="button" className="min-h-10 rounded-md px-3 py-2 text-sm underline underline-offset-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onReturnToEditor}>กลับไปแก้ไข</button> : null}
      </div>
      {!projection.outputReady && projection.state === 'degraded' ? <p className="text-xs text-amber-300">ยังไม่เปิดลิงก์ผลลัพธ์ เพราะ artifact หรือ QC ยังไม่ผ่านเงื่อนไข</p> : null}
    </section>
  );
}
