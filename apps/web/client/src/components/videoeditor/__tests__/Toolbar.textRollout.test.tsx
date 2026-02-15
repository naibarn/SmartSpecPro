/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import Toolbar from '../Toolbar';

function makeBaseProps() {
  return {
    zoom: 50,
    onZoomChange: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    onExport: vi.fn(),
    isDirty: false,
  };
}

describe('Toolbar text rollout controls', () => {
  it('shows add text control when handler is provided', () => {
    const props = makeBaseProps();
    const { getByTitle } = render(<Toolbar {...props} onAddText={vi.fn()} />);
    expect(getByTitle('Add Text Overlay')).toBeTruthy();
  });

  it('hides add text control while preserving non-text controls when disabled', () => {
    const props = makeBaseProps();
    const { queryByTitle, getByTitle } = render(<Toolbar {...props} />);

    expect(queryByTitle('Add Text Overlay')).toBeNull();
    const saveButton = getByTitle('Save Project (Ctrl+S)');
    fireEvent.click(saveButton);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });
});
