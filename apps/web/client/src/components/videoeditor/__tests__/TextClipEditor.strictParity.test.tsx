/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TextClipEditor from '../TextClipEditor';

describe('TextClipEditor strict parity effect gating', () => {
  it('only renders supported strict-parity effects', () => {
    render(<TextClipEditor onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByText('None').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shadow').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Outline').length).toBeGreaterThan(0);

    expect(screen.queryByText('Glow')).toBeNull();
    expect(screen.queryByText('Typewriter')).toBeNull();
    expect(screen.queryByText('Fade In Word')).toBeNull();
  });

  it('shows edit heading when config is provided', () => {
    render(
      <TextClipEditor
        config={{
          text: 'Timeline text',
          fontFamily: 'Noto Sans',
          fontSize: 40,
          fontWeight: 700,
          fontStyle: 'normal',
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
          effect: 'none',
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Edit Text Overlay')).toBeTruthy();
    expect(screen.queryByText('Add Text Overlay')).toBeNull();
  });

  it('syncs local form values when switching to another text clip config', () => {
    const { rerender } = render(
      <TextClipEditor
        config={{
          text: 'Clip A',
          fontFamily: 'Roboto',
          fontSize: 36,
          fontWeight: 700,
          fontStyle: 'normal',
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
          effect: 'none',
        }}
        duration={4}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Clip A')).toBeTruthy();
    expect(screen.getByDisplayValue('4')).toBeTruthy();

    rerender(
      <TextClipEditor
        config={{
          text: 'Clip B',
          fontFamily: 'Noto Sans Thai',
          fontSize: 52,
          fontWeight: 600,
          fontStyle: 'italic',
          color: '#00ff00',
          backgroundColor: '#101010',
          textAlign: 'left',
          effect: 'shadow',
          effectColor: '#000000',
        }}
        duration={7}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Clip B')).toBeTruthy();
    expect(screen.getByDisplayValue('7')).toBeTruthy();
  });
});
