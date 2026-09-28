import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScopePicker } from './ScopePicker';
import { TranscriptAnchorView } from './TranscriptAnchorView';
import { ChangeSetReviewPanel } from './ChangeSetReviewPanel';
import { BeforeAfterPreview } from './BeforeAfterPreview';
import { QcReviewPanel } from './QcReviewPanel';
import type { ReviewChangeSet, ReviewQcItem, ReviewScope, TranscriptState } from './reviewTypes';

export interface ReviewWorkspacePanelProps {
  currentRevisionId: string | null;
  transcriptState?: TranscriptState;
  transcript?: string;
  changeSet?: ReviewChangeSet | null;
  qcItems?: ReviewQcItem[];
  onApply?: (operationIds: string[]) => void;
  onReject?: (operationIds: string[]) => void;
}

export function ReviewWorkspacePanel({ currentRevisionId, transcriptState = 'unavailable', transcript, changeSet = null, qcItems = [], onApply, onReject }: ReviewWorkspacePanelProps) {
  const [scope, setScope] = useState<ReviewScope>('current_clip');
  return (
    <section className="grid gap-4 p-3" aria-label="AI review workspace" data-testid="review-workspace-panel">
      <div><h3 className="text-base font-semibold">AI Review Workspace</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">ตรวจสอบข้อเสนอแนะก่อนเปลี่ยน timeline · ขอบเขต: {scope}</p></div>
      <ScopePicker value={scope} onChange={setScope} />
      <Tabs defaultValue="changes" className="min-w-0">
        <TabsList className="h-auto w-full flex-wrap justify-start"><TabsTrigger value="changes">ข้อเสนอแนะ</TabsTrigger><TabsTrigger value="transcript">Transcript</TabsTrigger><TabsTrigger value="preview">A/B Preview</TabsTrigger><TabsTrigger value="qc">QC</TabsTrigger></TabsList>
        <TabsContent value="changes" className="mt-3"><ChangeSetReviewPanel changeSet={changeSet} currentRevisionId={currentRevisionId} onApply={onApply} onReject={onReject} /></TabsContent>
        <TabsContent value="transcript" className="mt-3"><TranscriptAnchorView state={transcriptState} transcript={transcript} /></TabsContent>
        <TabsContent value="preview" className="mt-3"><BeforeAfterPreview /></TabsContent>
        <TabsContent value="qc" className="mt-3"><QcReviewPanel items={qcItems} /></TabsContent>
      </Tabs>
    </section>
  );
}
