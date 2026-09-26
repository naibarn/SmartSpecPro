export type ExecutionDisplayState =
  | 'queued'
  | 'waiting-agent'
  | 'capability-blocked'
  | 'claimed'
  | 'running'
  | 'retrying'
  | 'degraded'
  | 'uploading'
  | 'qc'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'stale';

export interface ExecutionJobLike {
  jobType?: string | null;
  status?: string | null;
  statusReason?: string | null;
  failureReason?: string | null;
  operatorReviewRequired?: boolean | null;
  runtimeType?: string | null;
  worker?: { displayName?: string | null; machineName?: string | null } | null;
  progressPercent?: number | null;
  progressPhase?: string | null;
  outputRefs?: Array<{ verificationState?: string | null; publishedItemId?: number | null }> | null;
  pinnedRevisionId?: string | null;
  canCancel?: boolean;
}

export interface ExecutionStatusProjection {
  state: ExecutionDisplayState;
  label: string;
  reason: string;
  context: string;
  progress?: number;
  outputReady: boolean;
  canCancel: boolean;
  canRetry: boolean;
  isTerminal: boolean;
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasReason(reason: string, values: string[]): boolean {
  return values.some((value) => reason.includes(value));
}

export function projectExecutionStatus(job: ExecutionJobLike): ExecutionStatusProjection {
  const status = normalized(job.status);
  const reason = normalized(job.statusReason);
  const failureReason = job.failureReason?.trim();
  const outputRefs = job.outputRefs ?? [];
  const acceptedVerificationStates = new Set(['verified', 'committed', 'published', 'ready', 'complete', 'completed']);
  const hasUnverifiedOutput = outputRefs.some((ref) => {
    const verificationState = normalized(ref.verificationState);
    return Boolean(verificationState) && !acceptedVerificationStates.has(verificationState);
  });
  const outputBlockedByReason = hasReason(reason, ['qc', 'quality', 'stale', 'mismatch', 'conflict', 'blocked', 'unverified', 'pending']);
  // Control-plane jobs such as episode-stage and prompt-authoring jobs are
  // successful operations whose durable result is written to their domain
  // projection, not to worker artifact refs. Requiring outputRefs for every
  // job made those terminal jobs look stuck/degraded in the queue.
  const outputRequired = new Set([
    'remotion_render_video',
    'editor_video_render',
    'hyperframes_final_composite',
    'vertical_drama_ffmpeg_assembly',
    'content_protection.protect',
  ]).has(job.jobType ?? '');
  const outputReady = (status === 'completed' || status === 'succeeded')
    && (!outputRequired || outputRefs.length > 0)
    && !hasUnverifiedOutput
    && !outputBlockedByReason
    && job.operatorReviewRequired !== true;
  let state: ExecutionDisplayState;

  if (hasReason(reason, ['capability', 'no_eligible', 'unsupported'])) state = 'capability-blocked';
  else if (hasReason(reason, ['waiting', 'no_worker', 'external'])) state = 'waiting-agent';
  else if (hasReason(reason, ['stale', 'revision'])) state = 'stale';
  else if (hasReason(reason, ['qc', 'quality'])) state = 'qc';
  else if (status === 'pending' || status === 'queued' || status === 'leased') state = 'queued';
  else if (status === 'waiting_external') state = 'waiting-agent';
  else if (status === 'claimed' || status === 'preparing') state = 'claimed';
  else if (status === 'running' || status === 'rendering') state = 'running';
  else if (status === 'retry_scheduled' || status === 'retrying') state = 'retrying';
  else if (status === 'uploading' || status === 'publishing' || status === 'indexing') state = 'uploading';
  else if (status === 'qc' || status === 'qc_pending' || status === 'quality_check') state = 'qc';
  else if (status === 'degraded') state = 'degraded';
  else if (status === 'completed' || status === 'succeeded') state = outputReady ? 'completed' : 'degraded';
  else if (status === 'failed' || status === 'expired') state = 'failed';
  else if (status === 'cancelled' || status === 'canceled') state = 'canceled';
  else state = 'degraded';

  const labels: Record<ExecutionDisplayState, string> = {
    queued: 'รับคำขอแล้ว',
    'waiting-agent': 'กำลังรอ Worker',
    'capability-blocked': 'ความสามารถของ Worker ไม่พร้อม',
    claimed: 'มี Worker รับงานแล้ว',
    running: 'กำลังทำงาน',
    retrying: 'กำลังรอลองใหม่',
    degraded: 'ต้องตรวจสอบผลลัพธ์',
    uploading: 'กำลังส่งมอบผลลัพธ์',
    qc: 'กำลังตรวจ QC',
    completed: 'พร้อมเปิดผลลัพธ์',
    failed: 'งานล้มเหลว',
    canceled: 'ยกเลิกแล้ว',
    stale: 'revision ไม่เป็นปัจจุบัน',
  };

  const reasons: Record<ExecutionDisplayState, string> = {
    queued: 'ระบบรับงานแล้วและกำลังหา execution path ที่ตรงกับข้อกำหนด',
    'waiting-agent': 'มี execution path แต่ยังไม่มี Worker ที่พร้อมรับงาน',
    'capability-blocked': 'ยังไม่พบ Worker ที่รองรับ capability ที่งานนี้ร้องขอ',
    claimed: 'Worker กำลังเตรียม input และ snapshot ที่ถูก pin ไว้',
    running: job.progressPhase ? `ระยะงาน: ${job.progressPhase}` : 'Worker กำลังประมวลผล',
    retrying: 'ระบบจะลองใหม่ตาม policy ที่กำหนดไว้',
    degraded: failureReason ?? 'ผลลัพธ์ยังไม่ผ่านเงื่อนไข artifact/QC ที่จำเป็น',
    uploading: 'กำลังตรวจและเผยแพร่ artifact ก่อนเปิดให้ใช้งาน',
    qc: 'ผลลัพธ์อยู่ระหว่างการตรวจสอบคุณภาพ',
    completed: 'artifact ผ่านเงื่อนไขที่จำเป็นและพร้อมให้ตรวจสอบ',
    failed: failureReason ?? 'งานหยุดก่อนสร้างผลลัพธ์ที่พร้อมใช้งาน',
    canceled: 'งานถูกยกเลิกและไม่ควรแสดงเป็นผลสำเร็จ',
    stale: 'ต้องส่งงานใหม่จาก revision ล่าสุดก่อนใช้งานผลลัพธ์',
  };

  const contextParts = [
    job.runtimeType,
    job.worker?.displayName,
    job.worker?.machineName,
    job.pinnedRevisionId ? `revision ${job.pinnedRevisionId}` : undefined,
  ].filter(Boolean);

  return {
    state,
    label: labels[state],
    reason: reasons[state],
    context: contextParts.join(' · '),
    progress: typeof job.progressPercent === 'number' ? Math.max(0, Math.min(100, job.progressPercent)) : undefined,
    outputReady,
    canCancel: job.canCancel === true && !['completed', 'failed', 'canceled'].includes(state),
    canRetry: state === 'failed' || state === 'stale' || state === 'capability-blocked',
    isTerminal: ['completed', 'failed', 'canceled'].includes(state),
  };
}
