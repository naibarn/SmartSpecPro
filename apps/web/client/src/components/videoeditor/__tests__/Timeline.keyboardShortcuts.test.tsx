/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function renderTimeline(
  onClipDelete: (clipId: string) => void,
  onClipMove = vi.fn(),
) {
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
      onClipMove={onClipMove}
      onClipResize={vi.fn()}
      onClipDelete={onClipDelete}
    />,
  );
}

describe('Timeline keyboard shortcuts', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('commits clip movement only after mouseup', () => {
    const onClipDelete = vi.fn();
    const onClipMove = vi.fn();
    const { container } = renderTimeline(onClipDelete, onClipMove);

    const clip = container.querySelector('.timeline-clip') as HTMLElement;
    const tracks = container.querySelector('.timeline-tracks') as HTMLElement;

    vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 70,
      right: 200,
      bottom: 70,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    vi.spyOn(tracks, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 80,
      right: 1000,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseDown(clip, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(document, { clientX: 170, clientY: 20 });

    expect(onClipMove).not.toHaveBeenCalled();

    fireEvent.mouseUp(document, { clientX: 170, clientY: 20 });

    expect(onClipMove).toHaveBeenCalledTimes(1);
    expect(onClipMove).toHaveBeenCalledWith('clip-1', 3, 'track-v1');
  });
});
