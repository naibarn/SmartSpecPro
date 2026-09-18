export interface ProjectRevisionIdentity {
  revision?: number;
  revisionId?: string | null;
}

export interface ConflictModel {
  hasConflict: boolean;
  local: ProjectRevisionIdentity;
  latest: ProjectRevisionIdentity;
  mergeSupported: false;
}

export function buildConflictModel(input: {
  local: ProjectRevisionIdentity;
  latest: ProjectRevisionIdentity;
}): ConflictModel {
  const hasSameId = Boolean(input.local.revisionId && input.latest.revisionId && input.local.revisionId === input.latest.revisionId);
  const hasSameNumber = input.local.revision !== undefined && input.latest.revision !== undefined && input.local.revision === input.latest.revision;
  return {
    hasConflict: !(hasSameId || hasSameNumber),
    local: input.local,
    latest: input.latest,
    mergeSupported: false,
  };
}

export function getRevisionSyncLabel(state: 'saved' | 'saving' | 'unsaved' | 'conflict' | 'offline'): string {
  switch (state) {
    case 'saved': return 'บันทึกแล้ว';
    case 'saving': return 'กำลังบันทึก';
    case 'unsaved': return 'มีการแก้ไขที่ยังไม่บันทึก';
    case 'conflict': return 'พบเวอร์ชันใหม่กว่า';
    case 'offline': return 'รอการเชื่อมต่อ';
  }
}
