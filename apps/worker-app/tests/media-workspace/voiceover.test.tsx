import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceoverRecordModal } from "../../src/screens/media-workspace/VoiceoverRecordModal";
let container: HTMLElement; let root: ReturnType<typeof createRoot> | null;
let getUserMedia: ReturnType<typeof vi.fn>; let stop: ReturnType<typeof vi.fn>; let close: ReturnType<typeof vi.fn>;
const render = (open: boolean) => act(async () => { root!.render(<VoiceoverRecordModal isOpen={open} onClose={() => {}} currentTimeMs={0} videoDurationMs={10000} onAddAudioClip={() => {}} />); });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('section'); root = createRoot(container);
  stop = vi.fn(); close = vi.fn().mockResolvedValue(undefined);
  getUserMedia = vi.fn().mockResolvedValue({getTracks: () => [{stop}]});
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([])}});
  vi.stubGlobal('AudioContext', class { close = close; createAnalyser() { return {fftSize: 256, frequencyBinCount: 1, getByteFrequencyData: () => {}}; } createMediaStreamSource() { return {connect: () => {}}; } });
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm'; onstop?: () => void;
    start() {this.state = 'recording';} stop() {this.state = 'inactive'; this.onstop?.();}
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { if (root) act(() => root!.unmount()); vi.unstubAllGlobals(); });
it('stops microphone permission results that arrive after closing', async () => {
  await render(true);
  let resolve!: (stream: unknown) => void;
  getUserMedia.mockImplementationOnce(() => new Promise(r => {resolve = r;}));
  act(() => (container.querySelector('.modal-confirm-btn') as HTMLButtonElement).click());
  await render(false);
  const lateStop = vi.fn();
  await act(async () => resolve({getTracks: () => [{stop: lateStop}]}));
  expect(lateStop).toHaveBeenCalledOnce();
});
it('releases the recorder, microphone, and AudioContext when unmounted', async () => {
  await render(true);
  await act(async () => (container.querySelector('.modal-confirm-btn') as HTMLButtonElement).click());
  stop.mockClear();
  act(() => root!.unmount()); root = null;
  expect(stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
