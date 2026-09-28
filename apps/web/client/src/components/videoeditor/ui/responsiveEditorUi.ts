export type EditorViewportMode = 'mobile' | 'tablet' | 'desktop';

export function getEditorViewportMode(width: number): EditorViewportMode {
  if (!Number.isFinite(width) || width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}
