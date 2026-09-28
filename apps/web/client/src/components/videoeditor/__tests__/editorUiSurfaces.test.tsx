/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmDialog from '../ConfirmDialog';
import KeyboardShortcutsOverlay from '../KeyboardShortcutsOverlay';
import { ReviewWorkspacePanel } from '../review/ReviewWorkspacePanel';

describe('editor UI surfaces', () => {
  it('renders an accessible confirmation dialog and exposes safe actions', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="ลบโปรเจกต์" message="การกระทำนี้ย้อนกลับไม่ได้" onConfirm={onConfirm} onCancel={onCancel} type="danger" />);

    expect(screen.getByRole('dialog', { name: 'ลบโปรเจกต์' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('opens and closes shortcut help through keyboard semantics', () => {
    render(<KeyboardShortcutsOverlay />);
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('dialog', { name: /Keyboard Shortcuts/ })).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Keyboard Shortcuts/ })).toBeNull();
  });

  it('keeps AI review review-gated when no server change set is available', () => {
    render(<ReviewWorkspacePanel currentRevisionId="revision-1" />);
    expect(screen.getByTestId('review-workspace-panel')).toBeDefined();
    expect(screen.getByText(/ยังไม่มีข้อเสนอแนะ/)).toBeDefined();
    expect(screen.getByRole('radio', { name: /คลิปปัจจุบัน/ })).toBeDefined();
  });
});
