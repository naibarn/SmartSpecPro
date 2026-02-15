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
});
