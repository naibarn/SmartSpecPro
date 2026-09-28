import { describe, expect, it } from 'vitest';
import { buildConflictModel, getRevisionSyncLabel } from '../ui/projectRevisionUi';

describe('project revision UI projection', () => {
  it('keeps the local base and latest server revision distinct', () => {
    const result = buildConflictModel({
      local: { revision: 3, revisionId: 'local-3' },
      latest: { revision: 4, revisionId: 'server-4' },
    });

    expect(result.hasConflict).toBe(true);
    expect(result.local.revisionId).toBe('local-3');
    expect(result.latest.revisionId).toBe('server-4');
    expect(result.mergeSupported).toBe(false);
  });

  it('does not show a conflict when the latest revision is the pinned revision', () => {
    const result = buildConflictModel({
      local: { revision: 4, revisionId: 'server-4' },
      latest: { revision: 4, revisionId: 'server-4' },
    });

    expect(result.hasConflict).toBe(false);
  });

  it('uses explicit sync labels for the header', () => {
    expect(getRevisionSyncLabel('saved')).toContain('บันทึก');
    expect(getRevisionSyncLabel('conflict')).toContain('เวอร์ชัน');
  });
});
