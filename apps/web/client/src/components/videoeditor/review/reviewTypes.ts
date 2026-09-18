export type ReviewScope = 'current_clip' | 'selected_range' | 'scene' | 'timeline' | 'unedited_ranges';
export type TranscriptState = 'loading' | 'unavailable' | 'stale' | 'ready' | 'error';
export type ChangeOperationState = 'suggested' | 'protected' | 'skipped' | 'applied' | 'rejected';
export type QcSeverity = 'INFO' | 'REVIEW' | 'WARNING' | 'BLOCKING';

export interface ReviewOperation {
  id: string;
  label: string;
  state: ChangeOperationState;
  confidence?: number | null;
  evidenceRefs?: string[];
  reason?: string;
  manualLock?: boolean;
}

export interface ReviewChangeSet {
  id: string;
  revisionId: string;
  operations: ReviewOperation[];
  status: 'draft' | 'ready' | 'stale' | 'applied' | 'rejected';
}

export interface ReviewQcItem {
  id: string;
  severity: QcSeverity;
  message: string;
  blocking?: boolean;
  overrideAllowed?: boolean;
}

export function canApplyReviewChangeSet(changeSet: ReviewChangeSet | null, currentRevisionId: string | null): boolean {
  if (!changeSet || !currentRevisionId || changeSet.revisionId !== currentRevisionId) return false;
  if (changeSet.status !== 'draft' && changeSet.status !== 'ready') return false;
  return changeSet.operations.some((operation) => operation.state === 'suggested' && !operation.manualLock);
}

export function canRenderFromQc(items: ReviewQcItem[]): boolean {
  return !items.some((item) => item.severity === 'BLOCKING' || item.blocking === true);
}
