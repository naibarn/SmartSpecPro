/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TextClipEditor from '../TextClipEditor';

describe('TextClipEditor transform controls', () => {
  it('exposes position and scale controls and saves transform payload', () => {
    const onSave = vi.fn();
    render(<TextClipEditor onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Text position X'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Text position Y'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Text scale X'), { target: { value: '1.7' } });
    fireEvent.change(screen.getByLabelText('Text scale Y'), { target: { value: '0.8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Timeline' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Number),
      expect.objectContaining({
        x: 0.2,
        y: 0.8,
        scaleX: 1.7,
        scaleY: 0.8,
      }),
    );
  });

  it('allows dragging text inside editor preview to change position', () => {
    render(<TextClipEditor onSave={vi.fn()} onCancel={vi.fn()} />);

    const stage = screen.getByTestId('text-preview-stage');
    const canvas = stage.querySelector('.tce-preview-canvas') as HTMLDivElement;
    const draggable = screen.getByTestId('text-preview-draggable');

    Object.defineProperty(canvas, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(draggable, { clientX: 100, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 25 });
    fireEvent.mouseUp(window);

    const xSlider = screen.getByLabelText('Text position X') as HTMLInputElement;
    const ySlider = screen.getByLabelText('Text position Y') as HTMLInputElement;
    expect(xSlider.value).toBe('75');
    expect(ySlider.value).toBe('25');
  });
});
