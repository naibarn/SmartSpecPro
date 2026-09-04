import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AutoSubtitleModal } from "../../src/screens/media-workspace/AutoSubtitleModal";
import { AiMediaStudioModal } from "../../src/screens/media-workspace/AiMediaStudioModal";
it('does not fabricate a transcript when the native bridge is unavailable', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement('section'); const root = createRoot(el); const apply = vi.fn();
  try {
    act(() => root.render(<AutoSubtitleModal isOpen onClose={() => {}} videoDurationMs={10000} onApplySubtitles={apply} />));
    act(() => (el.querySelector('.media-intent-modal-footer .primary-button') as HTMLButtonElement).click());
    expect(apply).not.toHaveBeenCalled(); expect(el.querySelector('[role=alert]')?.textContent).toContain('ยังไม่พร้อมใช้งาน');
  } finally { act(() => root.unmount()); }
});
it('shows unavailable AI generation instead of sample assets', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement('section'); const root = createRoot(el); const add = vi.fn();
  try {
    act(() => root.render(<AiMediaStudioModal isOpen onClose={() => {}} currentTimeMs={0} onAddMediaClip={add} />));
    expect(el.querySelector('[role=status]')?.textContent).toContain('ยังไม่พร้อมใช้งาน');
    expect(el.querySelector('img,video,audio')).toBeNull(); expect(add).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); }
});
