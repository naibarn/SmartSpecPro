import { describe, expect, it } from 'vitest';
import { getEditorViewportMode } from '../ui/responsiveEditorUi';

describe('editor responsive modes', () => {
  it('selects intentional mobile, tablet, and desktop layouts', () => {
    expect(getEditorViewportMode(390)).toBe('mobile');
    expect(getEditorViewportMode(768)).toBe('tablet');
    expect(getEditorViewportMode(1440)).toBe('desktop');
  });

  it('does not classify invalid widths as desktop by accident', () => {
    expect(getEditorViewportMode(0)).toBe('mobile');
    expect(getEditorViewportMode(Number.NaN)).toBe('mobile');
  });
});
