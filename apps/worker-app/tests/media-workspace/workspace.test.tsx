import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MediaWorkspaceHost } from "../../src/screens/media-workspace/MediaWorkspaceHost";
import { createDefaultProjectDraft } from "../../src/types/nleProject";
import { resolveWorkspaceRelativePath, resolveWorkspaceSourcePath } from "../../src/screens/media-workspace/sourcePath";
const state = vi.hoisted(() => ({ explorer: null as any, player: null as any, mounts: 0, unmounts: 0 }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../src/app/workerContext", () => ({ useWorkerAppContext: () => ({locale: "th"}) }));
vi.mock("../../src/screens/media-workspace/MediaExplorerView", () => ({
  MediaExplorerView: (props: any) => { state.explorer = props; return null; },
  isAudioFile: (entry: any) => entry.extension === "wav", isImageFile: () => false,
  isProjectFile: (entry: any) => entry.extension === "json" || entry.path?.endsWith(".json"),
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
  const draft = createDefaultProjectDraft({projectId: 'p1', title: 'one', videoPath: '/root/one.mp4', videoDurationMs: 1000});
  vi.mocked(invoke).mockResolvedValue(JSON.stringify(draft));
  await act(async () => state.explorer.onOpenProjectFile(entry('/draft.ssproj')));
  expect(state.player.loadedProjectDraft.projectId).toBe('p1');
  act(() => state.explorer.onSelectVideoFile(entry('/two.mp4')));
  expect(state.player.loadedProjectDraft).toBeNull();
});
it("restores the project source video as the queue source when opening a project", async () => {
  const select = vi.fn();
  render('/root', select);
  const draft = createDefaultProjectDraft({projectId: 'p1', title: 'one', videoPath: '/root/video.mp4', videoDurationMs: 1000});
  vi.mocked(invoke).mockResolvedValue(JSON.stringify(draft));
  await act(async () => state.explorer.onOpenProjectFile(entry('/root/one.videoproject.json')));
  expect(select).toHaveBeenLastCalledWith('video.mp4', '/root/video.mp4');
});
it("resolves a project-relative source before exposing it to the editor and queue", async () => {
  const select = vi.fn();
  render('D:/project', select);
  const draft = createDefaultProjectDraft({projectId: 'p-relative', title: 'relative', videoPath: 'clips/C3775.MP4', videoDurationMs: 1000});
  draft.metadata = { ...draft.metadata, workspacePath: 'D:/project' };
  vi.mocked(invoke).mockResolvedValue(JSON.stringify(draft));
  await act(async () => state.explorer.onOpenProjectFile(entry('D:/project/relative.videoproject.json')));
  expect(select).toHaveBeenLastCalledWith('clips/C3775.MP4', 'D:/project/clips/C3775.MP4');
  expect(state.player.videoFile.path).toBe('D:/project/clips/C3775.MP4');
});
it("clears a stale queue source when opening a project without a source video", async () => {
  const select = vi.fn();
  render('/root', select);
  act(() => state.explorer.onSelectVideoFile(entry('/root/previous.mp4')));
  const draft = createDefaultProjectDraft({projectId: 'p2', title: 'empty', videoPath: '', videoDurationMs: 0});
  vi.mocked(invoke).mockResolvedValue(JSON.stringify(draft));
  await act(async () => state.explorer.onOpenProjectFile(entry('/root/empty.videoproject.json')));
  expect(select).toHaveBeenLastCalledWith('', '/root/empty.videoproject.json');
  expect(state.player.videoFile.isVideo).toBe(false);
});
it("normalizes Windows verbatim and file URL source paths", () => {
  expect(resolveWorkspaceRelativePath("D:\\Naibarn Money\\Cart\\C2139-เตียงนอน", "\\\\?\\D:\\Naibarn Money\\Cart\\C2139-เตียงนอน\\C3775.MP4")).toBe("C3775.MP4");
  expect(resolveWorkspaceRelativePath("D:\\Naibarn Money\\Cart\\C2139-เตียงนอน", "file:///D:/Naibarn%20Money/Cart/C2139-%E0%B9%80%E0%B8%95%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B8%99%E0%B8%AD%E0%B8%99/C3775.MP4")).toBe("C3775.MP4");
});
it("resolves project-relative source paths for editor commands", () => {
  expect(resolveWorkspaceSourcePath("D:\\workspace", null, "clips\\C3775.MP4")).toBe("D:/workspace/clips/C3775.MP4");
  expect(resolveWorkspaceSourcePath("D:\\current", "D:\\project", "C3775.MP4")).toBe("D:/project/C3775.MP4");
  expect(resolveWorkspaceSourcePath("D:\\workspace", null, "file:///D:/workspace/C3775.MP4")).toBe("D:/workspace/C3775.MP4");
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
  const select = vi.fn();
  render('/root', select); act(() => state.explorer.onSelectVideoFile(entry('/root/a.mp4')));
  render('/other', select); expect(state.player.videoFile).toBeNull();
  expect(select).toHaveBeenLastCalledWith('', '/other');
});
