/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import PreviewPlayer, { type ActiveTextClipInfo } from '../PreviewPlayer';
import type { TextConfig } from '../../../types/videoEditor';

const DEFAULT_TEXT_CONFIG: TextConfig = {
  text: 'Preview text',
  fontFamily: 'Roboto',
  fontSize: 42,
  fontWeight: 700,
  fontStyle: 'normal',
  color: '#ffffff',
  backgroundColor: 'transparent',
  textAlign: 'center',
  effect: 'none',
};

function makeTextClip(overrides: Partial<ActiveTextClipInfo> = {}): ActiveTextClipInfo {
  return {
    id: 'text-1',
    clipStartTime: 0,
    clipDuration: 4,
    textConfig: DEFAULT_TEXT_CONFIG,
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      keyframes: [],
    },
    ...overrides,
  };
}

function renderPlayer(activeTextClips: ActiveTextClipInfo[], currentTime = 0) {
  return render(
    <PreviewPlayer
      currentTime={currentTime}
      duration={20}
      isPlaying={false}
      onTimeChange={vi.fn()}
      onPlayPause={vi.fn()}
      onStop={vi.fn()}
      previewVideoUrl="/test-video.mp4"
      activeTextClips={activeTextClips}
    />,
  );
}

describe('PreviewPlayer text parity', () => {
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  let fontLoadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fontLoadMock = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: fontLoadMock,
      },
    });
  });

  afterEach(() => {
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('renders text payload fields with deterministic position/style at fixed timestamp', async () => {
    const clip = makeTextClip({
      id: 'text-style',
      textConfig: {
        ...DEFAULT_TEXT_CONFIG,
        text: 'Hello parity',
        color: '#ff0000',
        backgroundColor: '#000000',
        textAlign: 'right',
      },
      transform: {
        x: 0.25,
        y: 0.75,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        keyframes: [],
      },
    });

    const { getByTestId } = renderPlayer([clip], 1);

    await waitFor(() => {
      expect(getByTestId('preview-text-clip-text-style')).toBeTruthy();
    });

    const overlay = getByTestId('preview-text-clip-text-style') as HTMLDivElement;
    expect(overlay.textContent).toBe('Hello parity');
    expect(overlay.style.left).toBe('25%');
    expect(overlay.style.top).toBe('75%');
    expect(overlay.style.textAlign).toBe('right');
    expect(overlay.style.fontSize).toBe('42px');
    expect(overlay.style.color).toBe('rgb(255, 0, 0)');
  });

  it('uses clip-array order as text overlay z-order', async () => {
    const first = makeTextClip({ id: 'text-first', textConfig: { ...DEFAULT_TEXT_CONFIG, text: 'First' } });
    const second = makeTextClip({ id: 'text-second', textConfig: { ...DEFAULT_TEXT_CONFIG, text: 'Second' } });

    const { getByTestId } = renderPlayer([first, second], 1);

    await waitFor(() => {
      expect(getByTestId('preview-text-clip-text-first')).toBeTruthy();
      expect(getByTestId('preview-text-clip-text-second')).toBeTruthy();
    });

    const firstOverlay = getByTestId('preview-text-clip-text-first') as HTMLDivElement;
    const secondOverlay = getByTestId('preview-text-clip-text-second') as HTMLDivElement;

    expect(firstOverlay.style.zIndex).toBe('1');
    expect(secondOverlay.style.zIndex).toBe('2');
  });

  it('applies keyframe interpolation with per-property easing override in preview', async () => {
    const clip = makeTextClip({
      id: 'text-easing',
      transform: {
        x: 0.1,
        y: 0.1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        keyframes: [
          { time: 0, x: 0.1, y: 0.1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, easing: 'linear' },
          {
            time: 1,
            x: 0.9,
            y: 0.9,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            easing: 'linear',
            easingOverrides: { x: 'ease-in' },
          },
        ],
      },
    });

    const { getByTestId } = renderPlayer([clip], 2);

    await waitFor(() => {
      expect(getByTestId('preview-text-clip-text-easing')).toBeTruthy();
    });

    const overlay = getByTestId('preview-text-clip-text-easing') as HTMLDivElement;
    expect(parseFloat(overlay.style.left)).toBeCloseTo(30, 4);
    expect(parseFloat(overlay.style.top)).toBeCloseTo(50, 4);
  });

  it('waits for font readiness before showing parity-sensitive text overlays', async () => {
    let resolveFonts: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: vi.fn().mockReturnValue(pending),
      },
    });

    const clip = makeTextClip({ id: 'text-font-wait', textConfig: { ...DEFAULT_TEXT_CONFIG, text: 'Font wait' } });
    const { queryByTestId, getByText } = renderPlayer([clip], 1);

    expect(queryByTestId('preview-text-clip-text-font-wait')).toBeNull();
    expect(getByText('Loading preview fonts...')).toBeTruthy();

    resolveFonts();

    await waitFor(() => {
      expect(queryByTestId('preview-text-clip-text-font-wait')).toBeTruthy();
    });
  });

  it('loads preview fonts using clip style and weight variants', async () => {
    const clip = makeTextClip({
      id: 'text-font-variant',
      textConfig: {
        ...DEFAULT_TEXT_CONFIG,
        fontStyle: 'italic',
        fontWeight: 600,
      },
    });

    renderPlayer([clip], 1);

    await waitFor(() => {
      expect(fontLoadMock).toHaveBeenCalled();
    });

    expect(fontLoadMock).toHaveBeenCalledWith('italic 600 16px "Roboto"');
  });

  it('does not restart font loading on time updates when font requirements are unchanged', async () => {
    const clip = makeTextClip({
      id: 'text-font-stable',
      textConfig: {
        ...DEFAULT_TEXT_CONFIG,
        fontFamily: 'Roboto',
        fontStyle: 'normal',
        fontWeight: 700,
      },
    });

    const { rerender } = render(
      <PreviewPlayer
        currentTime={0.5}
        duration={20}
        isPlaying
        onTimeChange={vi.fn()}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        previewVideoUrl="/test-video.mp4"
        activeTextClips={[clip]}
      />,
    );

    await waitFor(() => {
      expect(fontLoadMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PreviewPlayer
        currentTime={1.0}
        duration={20}
        isPlaying
        onTimeChange={vi.fn()}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        previewVideoUrl="/test-video.mp4"
        activeTextClips={[
          makeTextClip({
            id: 'text-font-stable',
            textConfig: {
              ...DEFAULT_TEXT_CONFIG,
              fontFamily: 'Roboto',
              fontStyle: 'normal',
              fontWeight: 700,
            },
          }),
        ]}
      />,
    );

    expect(fontLoadMock).toHaveBeenCalledTimes(1);
  });

  it('renders i18n fixture text and falls back to whitelisted preview font', async () => {
    const clip = makeTextClip({
      id: 'text-i18n',
      textConfig: {
        ...DEFAULT_TEXT_CONFIG,
        text: 'Hello\\nภาษาไทย مرحبا office ﬁ',
        fontFamily: 'Unsupported Custom Font',
      },
    });

    const { getByTestId } = renderPlayer([clip], 1);

    await waitFor(() => {
      expect(getByTestId('preview-text-clip-text-i18n')).toBeTruthy();
    });

    const overlay = getByTestId('preview-text-clip-text-i18n') as HTMLDivElement;
    expect(overlay.textContent).toBe('Hello\\nภาษาไทย مرحبا office ﬁ');
    expect(overlay.style.whiteSpace).toBe('pre-wrap');
    expect(overlay.style.fontFamily).toContain('Noto Sans');
  });

  it('emits deterministic font fallback diagnostics for unsupported fonts', async () => {
    const onTextDiagnostics = vi.fn();
    const clip = makeTextClip({
      id: 'text-font-diagnostics',
      textConfig: {
        ...DEFAULT_TEXT_CONFIG,
        text: 'Font telemetry',
        fontFamily: 'Missing Preview Font',
      },
    });

    render(
      <PreviewPlayer
        currentTime={1}
        duration={20}
        isPlaying={false}
        onTimeChange={vi.fn()}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        previewVideoUrl="/test-video.mp4"
        activeTextClips={[clip]}
        onTextDiagnostics={onTextDiagnostics}
      />,
    );

    await waitFor(() => {
      expect(onTextDiagnostics).toHaveBeenCalled();
    });

    const diagnostics = onTextDiagnostics.mock.calls.at(-1)?.[0];
    expect(diagnostics.fontFallbackCount).toBe(1);
    expect(diagnostics.fontResolution[0]).toMatchObject({
      clipId: 'text-font-diagnostics',
      requested: 'Missing Preview Font',
      resolved: 'Noto Sans',
      fallback: true,
    });
  });

  it('enables transform edit mode for selected active text clip', async () => {
    const clip = makeTextClip({
      id: 'text-draggable',
      clipStartTime: 0,
      clipDuration: 5,
      transform: {
        x: 0.5,
        y: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        keyframes: [],
      },
    });

    const { getByRole } = render(
      <PreviewPlayer
        currentTime={1}
        duration={20}
        isPlaying={false}
        onTimeChange={vi.fn()}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        activeTextClips={[clip]}
        selectedClipId="text-draggable"
        onTransformChangeAtCurrentTime={vi.fn()}
      />,
    );

    const transformButton = getByRole('button', { name: 'Toggle transform edit mode' }) as HTMLButtonElement;
    expect(transformButton.disabled).toBe(false);
    fireEvent.click(transformButton);
    expect(transformButton.className).toContain('primary');
  });
});
