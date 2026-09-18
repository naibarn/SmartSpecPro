import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getEditorStatusLabel } from './editorCopy';
import { shouldAnnounceStatus, type EditorStatus } from './editorUiState';

const toneIcon = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
} as const;

export interface EditorStatusBannerProps {
  status: EditorStatus | null;
  progress?: number;
  className?: string;
}

export function EditorStatusBanner({ status, progress, className }: EditorStatusBannerProps) {
  const previousRef = useRef<EditorStatus | null>(null);
  const [announcement, setAnnouncement] = useAnnouncement(status, previousRef.current);

  useEffect(() => {
    previousRef.current = status;
  }, [status]);

  if (!status) return null;
  const Icon = toneIcon[status.tone];
  const live = status.live === 'assertive' ? 'assertive' : 'polite';

  return (
    <Alert className={className} data-testid="editor-status-banner" data-status={status.key}>
      <Icon className="size-4" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <AlertTitle className="flex flex-wrap items-center gap-2">
          <span>{getEditorStatusLabel(status.key)}</span>
          {status.jobId ? <Badge variant="outline">Job {status.jobId}</Badge> : null}
        </AlertTitle>
        <AlertDescription>{status.message}{status.detail ? ` — ${status.detail}` : ''}</AlertDescription>
        {progress !== undefined ? <Progress value={Math.max(0, Math.min(100, progress))} className="mt-2 h-1.5" aria-label="ความคืบหน้างาน" /> : null}
        {status.action && status.actionLabel ? (
          <button type="button" className="mt-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={status.action}>
            {status.actionLabel}
          </button>
        ) : null}
      </div>
      <span className="sr-only" role={live === 'assertive' ? 'alert' : 'status'} aria-live={live}>
        {announcement}
      </span>
      {status.key === 'saving' || status.key === 'autosaving' ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-label="กำลังทำงาน" /> : null}
    </Alert>
  );
}

function useAnnouncement(status: EditorStatus | null, previous: EditorStatus | null): [string, (value: string) => void] {
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (status && shouldAnnounceStatus(previous, status)) {
      setAnnouncement(`${getEditorStatusLabel(status.key)}: ${status.message}${status.detail ? ` ${status.detail}` : ''}`);
    }
  }, [previous, setAnnouncement, status]);
  return [announcement, setAnnouncement];
}
