import { AlertTriangle, Copy, RefreshCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatRevision } from './ui/editorCopy';
import type { ProjectRevisionIdentity } from './ui/projectRevisionUi';

export interface ProjectConflictPanelProps {
  local: ProjectRevisionIdentity;
  latest: ProjectRevisionIdentity;
  onReloadLatest: () => void;
  onSaveAsVariant: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

export function ProjectConflictPanel({
  local,
  latest,
  onReloadLatest,
  onSaveAsVariant,
  onDismiss,
  isLoading = false,
}: ProjectConflictPanelProps) {
  return (
    <Alert variant="destructive" className="mx-2 mt-2 shrink-0" data-testid="project-conflict-panel">
      <AlertTriangle className="size-4" aria-hidden="true" />
      <div className="min-w-0">
        <AlertTitle className="flex flex-wrap items-center gap-2">
          พบการแก้ไขจากเวอร์ชันอื่น
          <Badge variant="outline">ต้องเลือกวิธีดำเนินการ</Badge>
        </AlertTitle>
        <AlertDescription className="mt-1 space-y-2">
          <p>ระบบยังไม่ทับงานที่แก้ไว้ในเครื่อง โปรดโหลดเวอร์ชันล่าสุดหรือเก็บงานนี้เป็นโปรเจกต์แยก</p>
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <span>ฐานที่แก้ไข: <strong>{formatRevision(local.revision, local.revisionId)}</strong></span>
            <span>เวอร์ชันล่าสุด: <strong>{formatRevision(latest.revision, latest.revisionId)}</strong></span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={onReloadLatest} disabled={isLoading}>
              <RefreshCcw className="size-4" aria-hidden="true" /> โหลดเวอร์ชันล่าสุด
            </button>
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={onSaveAsVariant} disabled={isLoading}>
              <Copy className="size-4" aria-hidden="true" /> เก็บเป็นโปรเจกต์ใหม่
            </button>
            <button type="button" className="min-h-10 rounded-md px-3 py-2 text-sm underline underline-offset-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onDismiss}>
              ไว้ทีหลัง
            </button>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
}
