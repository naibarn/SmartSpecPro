/** @vitest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import ProjectBinPanel from '../ProjectBinPanel';
import AiMusicPanel from '../AiMusicPanel';
import AiMediaStudioPanel from '../AiMediaStudioPanel';
import SpeakerPlanPanel from '../SpeakerPlanPanel';
import SubtitleEditorPanel from '../SubtitleEditorPanel';
import BlurPanel from '../BlurPanel';
import SymbolCatalogPanel from '../SymbolCatalogPanel';
import CodeOverlayPanel from '../CodeOverlayPanel';
import VoiceRecorderPanel from '../VoiceRecorderPanel';
import { WebAssetResolver } from '../../../services/webAssetResolver';

afterEach(() => vi.restoreAllMocks());

describe('web editor parity panels', () => {
  it('uploads a selected file into Bin and reports the managed URI', async () => {
    const onAssetImported = vi.fn();
    vi.spyOn(WebAssetResolver.prototype, 'uploadAsset').mockReturnValue({
      promise: Promise.resolve({ assetId: 'upload-1', uri: '/api/storage/files/upload-1', mediaAssetId: '42' }),
      abort: vi.fn(),
    });
    render(<ProjectBinPanel assets={{}} onAddToTimeline={vi.fn()} onAssetImported={onAssetImported} />);
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('Project Bin').querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(onAssetImported).toHaveBeenCalledWith(expect.objectContaining({ type: 'video', mediaAssetId: 42 }), '/api/storage/files/upload-1'));
  });

  it('queues AI music only after consent', async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    render(<AiMusicPanel onQueueOperation={queue} />);
    fireEvent.click(screen.getByRole('button', { name: 'ประเมินและส่งงานเข้า Worker' }));
    expect(queue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('ยืนยันสิทธิ์การใช้งานเพลงและเครดิต'));
    fireEvent.click(screen.getByRole('button', { name: 'ประเมินและส่งงานเข้า Worker' }));
    await waitFor(() => expect(queue).toHaveBeenCalledWith('media.ai_music', expect.objectContaining({ consent: true })));
  });

  it('renders all parity panels and exposes their primary controls', () => {
    const props = { onQueueOperation: vi.fn(), assetIds: [{ id: 'asset-1', name: 'clip.mp4', type: 'video' as const }] };
    const { unmount } = render(<AiMediaStudioPanel {...props} />);
    expect(screen.getByRole('heading', { name: /AI Media Studio/i })).toBeTruthy();
    unmount();
    const panels = [<SpeakerPlanPanel key="speaker" {...props} />, <SubtitleEditorPanel key="subtitle" {...props} />, <BlurPanel key="blur" {...props} />, <SymbolCatalogPanel key="symbols" />, <CodeOverlayPanel key="code" {...props} />, <VoiceRecorderPanel key="voice" onRecordingReady={vi.fn()} />];
    render(<>{panels}</>);
    expect(screen.getByRole('heading', { name: /วิเคราะห์ผู้พูด/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /สร้าง Subtitle/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /FX \/ Blur/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Symbols/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /AI CSS/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /อัดเสียง/ })).toBeTruthy();
  });

  it('queues a sanitized stock SVG instead of executing arbitrary code', async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    render(<SymbolCatalogPanel onQueueOperation={queue} />);
    fireEvent.click(screen.getByRole('button', { name: /ลูกศรขวา/ }));
    await waitFor(() => expect(queue).toHaveBeenCalledWith('media.ai_media_studio', expect.objectContaining({ mode: 'stock_svg', sourceExecution: 'static_sanitized' })));
    const payload = queue.mock.calls[0]?.[1] as { svg?: string };
    expect(payload.svg).toMatch(/^<svg/);
    expect(payload.svg).not.toMatch(/script|on[a-z]+\s*=/i);
  });
});
