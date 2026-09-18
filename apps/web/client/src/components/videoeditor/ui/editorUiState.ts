export type EditorLanguage = 'th' | 'en';

export type EditorStatusTone = 'info' | 'success' | 'warning' | 'error';

export type EditorStatusKey =
  | 'loading'
  | 'empty'
  | 'error'
  | 'saving'
  | 'saved'
  | 'unsaved'
  | 'autosaving'
  | 'offline'
  | 'conflict'
  | 'waiting-agent'
  | 'capability-blocked'
  | 'degraded'
  | 'rendering'
  | 'qc-blocked'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface EditorStatus {
  key: EditorStatusKey;
  tone: EditorStatusTone;
  message: string;
  detail?: string;
  actionLabel?: string;
  action?: () => void;
  revisionId?: string;
  revision?: number;
  jobId?: number | string;
  live?: 'off' | 'polite' | 'assertive';
}

export type EditorErrorKind =
  | 'conflict'
  | 'offline'
  | 'capability-blocked'
  | 'waiting-agent'
  | 'permission'
  | 'validation'
  | 'unknown';

export interface EditorErrorProjection {
  code: string;
  kind: EditorErrorKind;
  message: string;
  detail?: string;
  recoverable: boolean;
  revisionId?: string;
  revision?: number;
}

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  currentRevisionId?: unknown;
  actualRevision?: unknown;
  cause?: unknown;
  data?: {
    code?: unknown;
    revisionId?: unknown;
    revision?: unknown;
    currentRevisionId?: unknown;
    actualRevision?: unknown;
    statusReason?: unknown;
    cause?: unknown;
  };
};

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? error as ErrorLike : {};
}

function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (let index = 0; index < 4 && current; index += 1) {
    const source = asErrorLike(current);
    chain.push(source);
    current = source.cause ?? source.data?.cause;
  }
  return chain;
}

function firstErrorValue(chain: ErrorLike[], getter: (source: ErrorLike) => unknown): unknown {
  for (const source of chain) {
    const value = getter(source);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeCode(chain: ErrorLike[]): string {
  const code = firstErrorValue(chain, (source) => source.data?.code ?? source.code);
  return typeof code === 'string' ? code.toUpperCase() : '';
}

function containsAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function mapEditorError(error: unknown, language: EditorLanguage = 'th'): EditorErrorProjection {
  const chain = errorChain(error);
  const code = normalizeCode(chain);
  const message = chain.map((source) => typeof source.message === 'string' ? source.message.toLowerCase() : '').join(' ');
  const revisionIdValue = firstErrorValue(chain, (source) => source.data?.revisionId ?? source.data?.currentRevisionId ?? source.currentRevisionId);
  const revisionValue = firstErrorValue(chain, (source) => source.data?.revision ?? source.data?.actualRevision ?? source.actualRevision);
  const revisionId = typeof revisionIdValue === 'string' ? revisionIdValue : undefined;
  const revision = typeof revisionValue === 'number' ? revisionValue : undefined;
  const statusReasonValue = firstErrorValue(chain, (source) => source.data?.statusReason);
  const statusReason = typeof statusReasonValue === 'string' ? statusReasonValue.toUpperCase() : '';

  if (code === 'CONFLICT' || containsAny(message, ['conflict', 'stale revision', 'revision mismatch'])) {
    return {
      code: code || 'CONFLICT',
      kind: 'conflict',
      message: language === 'th' ? 'โปรเจกต์มีเวอร์ชันใหม่กว่า งานที่แก้ไว้ยังไม่ถูกทับ' : 'A newer project revision exists. Your local work is preserved.',
      detail: language === 'th' ? 'โหลดเวอร์ชันล่าสุดหรือเลือกวิธีบันทึกที่ปลอดภัยก่อนดำเนินการต่อ' : 'Load the latest revision or choose a safe save action before continuing.',
      recoverable: true,
      revisionId,
      revision,
    };
  }

  if (code === 'CAPABILITY_BLOCKED' || statusReason === 'CAPABILITY_BLOCKED' || containsAny(message, ['capability', 'no eligible worker'])) {
    return {
      code: code || 'CAPABILITY_BLOCKED',
      kind: 'capability-blocked',
      message: language === 'th' ? 'ยังไม่มี Worker ที่รองรับงานนี้' : 'No eligible Worker can run this job.',
      detail: language === 'th' ? 'ตรวจสอบความสามารถของ Worker หรือบันทึกงานไว้ลองใหม่ภายหลัง' : 'Check Worker capabilities or keep the job for a later retry.',
      recoverable: true,
    };
  }

  if (code === 'WAITING_AGENT' || statusReason === 'WAITING_AGENT' || containsAny(message, ['waiting for worker', 'waiting-agent'])) {
    return {
      code: code || 'WAITING_AGENT',
      kind: 'waiting-agent',
      message: language === 'th' ? 'ส่งงานแล้ว กำลังรอ Worker' : 'Submitted and waiting for a Worker.',
      detail: language === 'th' ? 'คุณยังแก้ไขต่อได้ งานจะทำต่อเมื่อมี Worker ที่พร้อม' : 'You can keep editing; the job will continue when a Worker is available.',
      recoverable: true,
    };
  }

  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED' || code === 'NOT_AUTHORIZED') {
    return {
      code,
      kind: 'permission',
      message: language === 'th' ? 'ไม่มีสิทธิ์ทำรายการนี้' : 'You do not have permission to perform this action.',
      recoverable: false,
    };
  }

  if (code === 'BAD_REQUEST' || code === 'VALIDATION_ERROR' || containsAny(message, ['invalid', 'required'])) {
    return {
      code: code || 'VALIDATION_ERROR',
      kind: 'validation',
      message: language === 'th' ? 'ข้อมูลยังไม่ครบหรือไม่ถูกต้อง' : 'Some information is missing or invalid.',
      detail: language === 'th' ? 'ตรวจสอบข้อมูลแล้วลองใหม่' : 'Review the fields and try again.',
      recoverable: true,
    };
  }

  if (code === 'NETWORK_ERROR' || containsAny(message, ['failed to fetch', 'network', 'offline', 'timeout'])) {
    return {
      code: code || 'NETWORK_ERROR',
      kind: 'offline',
      message: language === 'th' ? 'เชื่อมต่อระบบไม่ได้ชั่วคราว' : 'The service is temporarily unreachable.',
      detail: language === 'th' ? 'งานในเครื่องยังอยู่ ลองใหม่เมื่อการเชื่อมต่อกลับมา' : 'Your local work is preserved. Retry when the connection returns.',
      recoverable: true,
    };
  }

  return {
    code: code || 'UNKNOWN_ERROR',
    kind: 'unknown',
    message: language === 'th' ? 'ดำเนินการไม่สำเร็จ' : 'The action could not be completed.',
    detail: language === 'th' ? 'ลองใหม่อีกครั้ง หากยังไม่สำเร็จให้ตรวจสอบสถานะงาน' : 'Try again, or inspect the job status if the problem persists.',
    recoverable: true,
  };
}

export function shouldAnnounceStatus(previous: EditorStatus | null, next: EditorStatus | null): boolean {
  if (!next || next.live === 'off') return false;
  return !previous || previous.key !== next.key || previous.message !== next.message || previous.detail !== next.detail;
}

export function getEditorStatusTone(key: EditorStatusKey): EditorStatusTone {
  if (key === 'completed' || key === 'saved') return 'success';
  if (key === 'conflict' || key === 'offline' || key === 'degraded' || key === 'unsaved') return 'warning';
  if (key === 'error' || key === 'failed' || key === 'capability-blocked' || key === 'qc-blocked') return 'error';
  return 'info';
}

export function createEditorStatus(
  key: EditorStatusKey,
  message: string,
  options: Omit<EditorStatus, 'key' | 'message' | 'tone'> = {},
): EditorStatus {
  return { key, message, tone: getEditorStatusTone(key), ...options };
}
