import { describe, expect, it } from 'vitest';
import {
  mapEditorError,
  getEditorStatusTone,
  shouldAnnounceStatus,
  type EditorStatus,
} from '../ui/editorUiState';

describe('editor UI state projections', () => {
  it('maps conflict errors to recoverable Thai-first copy without exposing raw details', () => {
    const result = mapEditorError({
      data: { code: 'CONFLICT', revisionId: 'rev-2', revision: 2 },
      message: 'internal provider URL https://secret.invalid/stack',
    });

    expect(result.code).toBe('CONFLICT');
    expect(result.recoverable).toBe(true);
    expect(result.revisionId).toBe('rev-2');
    expect(result.message).toContain('เวอร์ชัน');
    expect(result.message).not.toContain('secret.invalid');
  });

  it('finds conflict metadata in a nested tRPC cause', () => {
    const result = mapEditorError({
      message: 'Request failed',
      cause: { data: { code: 'CONFLICT', currentRevisionId: 'revision-9', actualRevision: 9 } },
    });

    expect(result.kind).toBe('conflict');
    expect(result.revisionId).toBe('revision-9');
    expect(result.revision).toBe(9);
  });

  it('classifies capability and network failures as actionable states', () => {
    expect(mapEditorError({ data: { code: 'CAPABILITY_BLOCKED' }, message: 'no worker' }).kind).toBe('capability-blocked');
    expect(mapEditorError(new Error('Failed to fetch')).kind).toBe('offline');
    expect(mapEditorError(new Error('unexpected')).kind).toBe('unknown');
  });

  it('announces only meaningful status changes', () => {
    const first: EditorStatus = { key: 'saving', tone: 'info', message: 'กำลังบันทึก' };
    const same: EditorStatus = { ...first };
    const next: EditorStatus = { key: 'saved', tone: 'success', message: 'บันทึกแล้ว' };

    expect(shouldAnnounceStatus(first, same)).toBe(false);
    expect(shouldAnnounceStatus(first, next)).toBe(true);
    expect(shouldAnnounceStatus(null, first)).toBe(true);
  });

  it('uses semantic tones rather than color-only status semantics', () => {
    expect(getEditorStatusTone('conflict')).toBe('warning');
    expect(getEditorStatusTone('capability-blocked')).toBe('error');
    expect(getEditorStatusTone('completed')).toBe('success');
    expect(getEditorStatusTone('waiting-agent')).toBe('info');
  });
});
