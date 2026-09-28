import { describe, expect, it } from 'vitest';
import { canApplyReviewChangeSet, canRenderFromQc, type ReviewChangeSet } from '../review/reviewTypes';

const changeSet: ReviewChangeSet = {
  id: 'changes-1',
  revisionId: 'revision-1',
  status: 'ready',
  operations: [
    { id: 'locked', label: 'Manual trim', state: 'suggested', manualLock: true },
    { id: 'safe', label: 'Remove silence', state: 'suggested', confidence: 0.9 },
  ],
};

describe('review contracts', () => {
  it('blocks stale or fully protected change sets', () => {
    expect(canApplyReviewChangeSet(changeSet, 'revision-2')).toBe(false);
    expect(canApplyReviewChangeSet({ ...changeSet, operations: [changeSet.operations[0]] }, 'revision-1')).toBe(false);
    expect(canApplyReviewChangeSet(changeSet, 'revision-1')).toBe(true);
  });

  it('gates render on blocking QC severity', () => {
    expect(canRenderFromQc([{ id: 'warn', severity: 'WARNING', message: 'ตรวจสอบเสียง' }])).toBe(true);
    expect(canRenderFromQc([{ id: 'block', severity: 'BLOCKING', blocking: true, message: 'artifact ไม่ครบ' }])).toBe(false);
  });
});
