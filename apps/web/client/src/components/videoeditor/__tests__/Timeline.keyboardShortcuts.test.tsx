/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import Timeline from '../Timeline';
import type { Timeline as TimelineData, Asset } from '../../../types/videoEditor';

function makeTimeline(): TimelineData {
  return {
    tracks: [
      {
        id: 'track-v1',
        type: 'video',
        name: 'V1',
        clips: [
          {
            id: 'clip-1',
            assetId: 'asset-1',
            trackId: 'track-v1',
            startTime: 0,
            duration: 4,
            trimIn: 0,
            trimOut: 4,
            volume: 1,
            speed: 1,
            effects: [],
          },
        ],
        muted: false,
        locked: false,
        visible: true,
      },
    ],
  };
}

function makeAssets(): Record<string, Asset> {
  return {
    'asset-1': {
      id: 'asset-1',
      type: 'video',
      source: 'imported',
      path: '/tmp/test.mp4',
      filename: 'test.mp4',
      format: 'mp4',
      duration: 4,
    },
  };
}

function renderTimeline(onClipDelete: (clipId: string) => void) {
  return render(
    <Timeline
      timeline={makeTimeline()}
      assets={makeAssets()}
      currentTime={0}
      duration={10}
      zoom={50}
      selectedClipId="clip-1"
      selectedClipIds={[]}
      onTimeChange={vi.fn()}
      onClipSelect={vi.fn()}
      onClipMove={vi.fn()}
      onClipResize={vi.fn()}
      onClipDelete={onClipDelete}
    />,
  );
}

describe('Timeline keyboard shortcuts', () => {
  it('does not delete selected clip on Backspace', () => {
    const onClipDelete = vi.fn();
    renderTimeline(onClipDelete);

    fireEvent.keyDown(document, { key: 'Backspace' });
    expect(onClipDelete).not.toHaveBeenCalled();
  });

  it('deletes selected clip on Delete key', () => {
    const onClipDelete = vi.fn();
    renderTimeline(onClipDelete);

    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(onClipDelete).toHaveBeenCalledTimes(1);
    expect(onClipDelete).toHaveBeenCalledWith('clip-1');
  });

  it('ignores Delete shortcut while typing in textarea', () => {
    const onClipDelete = vi.fn();
    renderTimeline(onClipDelete);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'Delete' });

    expect(onClipDelete).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });
});
