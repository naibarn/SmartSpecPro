import type { MediaOperation } from '@smartspec/shared';
import type { CSSProperties } from 'react';

export type QueueEditorOperation = (
  operation: MediaOperation,
  options?: Record<string, unknown>,
  assetIds?: string[],
) => void | Promise<void>;

export interface EditorPanelBaseProps {
  onQueueOperation?: QueueEditorOperation;
  assetIds?: ReadonlyArray<{ id: string; name: string; type: 'video' | 'audio' | 'image' }>;
}

export const panelStyle: CSSProperties = {
  padding: 14,
  color: '#ddd',
  fontSize: 12,
};

export const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#181818',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 5,
  padding: '7px 8px',
  fontSize: 12,
};

export const actionStyle: CSSProperties = {
  border: '1px solid #0078d4',
  background: '#123450',
  color: '#dff4ff',
  borderRadius: 5,
  padding: '8px 10px',
  cursor: 'pointer',
  fontSize: 11,
};

export const secondaryActionStyle: CSSProperties = {
  ...actionStyle,
  borderColor: '#444',
  background: '#252525',
  color: '#ddd',
};

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
