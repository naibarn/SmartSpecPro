import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MediaWorkspaceHost } from "../../src/screens/media-workspace/MediaWorkspaceHost";
import { createDefaultProjectDraft } from "../../src/types/nleProject";
const state = vi.hoisted(() => ({ explorer: null as any, player: null as any, mounts: 0, unmounts: 0 }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../src/app/workerContext", () => ({ useWorkerAppContext: () => ({locale: "th"}) }));
vi.mock("../../src/screens/media-workspace/MediaExplorerView", () => ({
  MediaExplorerView: (props: any) => { state.explorer = props; return null; },
  isAudioFile: (entry: any) => entry.extension === "wav", isImageFile: () => false,
}));
vi.mock("../../src/screens/media-workspace/MediaVideoEditorPlayer", () => ({
  MediaVideoEditorPlayer: (props: any) => { state.player = props; useEffect(() => { state.mounts++; return () => { state.unmounts++; }; }, []); return null; },
}));
const entry = (path: string) => ({path, name: path.split('/').pop(), extension: "mp4", isVideo: true, isDirectory: false, sizeBytes: 0, modifiedUnixMs: 0});
let root: ReturnType<typeof createRoot>; let container: HTMLElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("section"); root = createRoot(container); state.mounts = 0; state.unmounts = 0; vi.mocked(invoke).mockReset(); });
afterEach(() => act(() => root.unmount()));
const render = (path = '/root', onSelectSourceFile = vi.fn()) => act(() => root.render(<MediaWorkspaceHost workspace={{localPath: path, status: "ready", fileCount: 0, totalBytes: 0}} scan={null} plan={null} busy={false} onSelectSourceFile={onSelectSourceFile} />));
it("remounts editor state for identical filenames at different paths", () => {
  render(); act(() => state.explorer.onSelectVideoFile(entry('/a/same.mp4')));
  const mounts = state.mounts;
  act(() => state.explorer.onSelectVideoFile(entry('/b/same.mp4')));
  expect(state.mounts).toBe(mounts + 1); expect(state.player.videoFile.path).toBe('/b/same.mp4');
});
it("clears an explicitly loaded draft when another video is chosen", async () => {
  render();
  const draft = createDefaultProjectDraft({projectId: 'p1', title: 'one', videoPath: '/one.mp4', videoDurationMs: 1000});
  vi.mocked(invoke).mockResolvedValue(JSON.stringify(draft));
  await act(async () => state.explorer.onOpenProjectFile(entry('/draft.ssproj')));
  expect(state.player.loadedProjectDraft.projectId).toBe('p1');
  act(() => state.explorer.onSelectVideoFile(entry('/two.mp4')));
  expect(state.player.loadedProjectDraft).toBeNull();
});
it("ignores a late project read after New Project", async () => {
  render(); let resolve!: (value: string) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(r => { resolve = r; }));
  let pending: Promise<void>;
  act(() => { pending = state.explorer.onOpenProjectFile(entry('/draft.ssproj')); });
  act(() => state.explorer.onNewProject());
  await act(async () => { resolve(JSON.stringify(createDefaultProjectDraft({projectId:'old', title:'old', videoPath:'/old.mp4', videoDurationMs:1000}))); await pending; });
  expect(state.player.videoFile).toBeNull();
});
it("keeps the active project when a malformed file is opened", async () => {
  render(); act(() => state.explorer.onSelectVideoFile(entry('/good.mp4')));
  vi.mocked(invoke).mockResolvedValue('{}');
  await act(async () => state.explorer.onOpenProjectFile(entry('/bad.ssproj')));
  expect(state.player.videoFile.path).toBe('/good.mp4');
  expect(container.querySelector('[role=alert]')?.textContent).toContain('ไฟล์โปรเจกต์ไม่ถูกต้อง');
});
it("requires a path-segment boundary for relative source names", () => {
  const select = vi.fn(); render('/root', select);
  act(() => state.explorer.onSelectVideoFile(entry('/root-other/same.mp4')));
  expect(select).toHaveBeenLastCalledWith('same.mp4', '/root-other/same.mp4');
  act(() => state.explorer.onSelectVideoFile(entry('/root/sub/same.mp4')));
  expect(select).toHaveBeenLastCalledWith('sub/same.mp4', '/root/sub/same.mp4');
});
it("resets the editor when workspace changes", () => {
  render(); act(() => state.explorer.onSelectVideoFile(entry('/root/a.mp4')));
  render('/other'); expect(state.player.videoFile).toBeNull();
});
