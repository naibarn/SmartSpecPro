/** @vitest-environment jsdom */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SmartCameraPanel from '../SmartCameraPanel';
import type { Clip } from '../../../types/videoEditor';

const clip: Clip = {
  id: 'clip-1', assetId: 'asset-1', trackId: 'track-v1', startTime: 0, duration: 4,
  trimIn: 0, trimOut: 4, volume: 1, speed: 1, effects: [],
};

describe('SmartCameraPanel', () => {
  it('updates face mode, auto controls and worker analysis intent', () => {
    const onChange = vi.fn();
    const onRequestAnalysis = vi.fn();
    const { getByRole, getByText } = render(
      <SmartCameraPanel selectedClip={clip} onChange={onChange} onAddKeyframe={vi.fn()} onRequestAnalysis={onRequestAnalysis} />,
    );
    fireEvent.click(getByRole('button', { name: 'ติดตามใบหน้า' }));
    expect(onChange).toHaveBeenCalledWith('clip-1', expect.objectContaining({ mode: 'auto_face' }));
    fireEvent.click(getByText('🔍 วิเคราะห์ใน browser (Quick)'));
    expect(onRequestAnalysis).toHaveBeenCalledWith('clip-1');
  });
});
