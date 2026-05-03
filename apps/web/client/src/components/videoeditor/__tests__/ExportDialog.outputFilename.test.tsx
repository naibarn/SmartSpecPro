/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ExportDialog from '../ExportDialog';
import { createEmptyProject } from '../../../types/videoEditor';

vi.mock('../../../services/videoEditorService', () => ({
  videoEditorMediaLibrary: {
    detectEncoders: vi.fn(() => new Promise<string[]>(() => {})),
  },
}));

describe('ExportDialog output filename', () => {
  it('sanitizes encoded project names before building the default output filename', () => {
    const project = createEmptyProject('Storyboard Edit 2&amp;#x2F;5&amp;#x2F;2569 21:34:50');
    const onExport = vi.fn();

    render(<ExportDialog project={project} onExport={onExport} onCancel={vi.fn()} />);

    const input = screen.getByLabelText('Filename') as HTMLInputElement;
    expect(input.value).toMatch(/^Storyboard_Edit_2_5_2569_21_34_50_\d{4}-\d{2}-\d{2}\.mp4$/);
    expect(input.value).not.toMatch(/[;&|`$(){}[\]<>'"\\/:]/);
  });

  it('sanitizes manually edited output filenames before export', () => {
    const project = createEmptyProject('Safe Project');
    const onExport = vi.fn();

    render(<ExportDialog project={project} onExport={onExport} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Filename'), {
      target: { value: 'bad&name:with/slash.mp4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(onExport).toHaveBeenCalledWith(
      'bad_name_with_slash.mp4',
      expect.objectContaining({ audioCodec: 'aac' }),
    );
  });
});
