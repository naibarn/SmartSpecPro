import type { EditorErrorProjection, EditorLanguage, EditorStatusKey } from './editorUiState';

const thaiLabels: Partial<Record<EditorStatusKey, string>> = {
  loading: 'กำลังโหลดโปรเจกต์',
  empty: 'ยังไม่มีข้อมูลในส่วนนี้',
  saving: 'กำลังบันทึก',
  saved: 'บันทึกแล้ว',
  unsaved: 'มีการแก้ไขที่ยังไม่บันทึก',
  autosaving: 'กำลังบันทึกอัตโนมัติ',
  offline: 'รอการเชื่อมต่อ',
  conflict: 'ต้องตรวจสอบเวอร์ชัน',
  'waiting-agent': 'กำลังรอ Worker',
  'capability-blocked': 'ความสามารถของ Worker ไม่พร้อม',
  degraded: 'ทำงานแบบจำกัด',
  rendering: 'กำลังประมวลผล',
  'qc-blocked': 'ติดเงื่อนไขตรวจสอบคุณภาพ',
  completed: 'เสร็จสมบูรณ์',
  failed: 'ดำเนินการไม่สำเร็จ',
  canceled: 'ยกเลิกแล้ว',
  error: 'เกิดข้อผิดพลาด',
};

const englishLabels: Partial<Record<EditorStatusKey, string>> = {
  loading: 'Loading project',
  empty: 'Nothing here yet',
  saving: 'Saving',
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  autosaving: 'Autosaving',
  offline: 'Waiting for connection',
  conflict: 'Revision needs review',
  'waiting-agent': 'Waiting for Worker',
  'capability-blocked': 'Worker capability unavailable',
  degraded: 'Running with limitations',
  rendering: 'Processing',
  'qc-blocked': 'Quality check blocked',
  completed: 'Completed',
  failed: 'Action failed',
  canceled: 'Canceled',
  error: 'Something went wrong',
};

export function getEditorStatusLabel(key: EditorStatusKey, language: EditorLanguage = 'th'): string {
  return (language === 'th' ? thaiLabels : englishLabels)[key] ?? (language === 'th' ? 'สถานะงาน' : 'Status');
}

export function getSafeErrorCopy(error: EditorErrorProjection, language: EditorLanguage = 'th'): { title: string; detail?: string } {
  if (language === 'en') {
    return { title: error.message, detail: error.detail };
  }
  return { title: error.message, detail: error.detail };
}

export function formatRevision(revision?: number, revisionId?: string, language: EditorLanguage = 'th'): string {
  if (revision === undefined && !revisionId) return language === 'th' ? 'ยังไม่มี revision' : 'No revision yet';
  const numberPart = revision === undefined ? '' : `r${revision}`;
  const idPart = revisionId ? ` · ${revisionId.slice(0, 8)}` : '';
  return `${numberPart}${idPart}`.replace(/^ · /, '');
}
