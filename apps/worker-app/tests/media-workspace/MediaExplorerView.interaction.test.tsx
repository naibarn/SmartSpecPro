import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { MediaExplorerView, type DirectoryBrowseResult } from "../../src/screens/media-workspace/MediaExplorerView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const project = (name: string, path: string) => ({
  name,
  path,
  isDirectory: false,
  sizeBytes: 128,
  modifiedUnixMs: 0,
  extension: "videoproject.json",
  isVideo: false,
});

const folder = (name: string, path: string) => ({
  name,
  path,
  isDirectory: true,
  sizeBytes: 0,
  modifiedUnixMs: 0,
  extension: null,
  isVideo: false,
});

const browse = (currentPath: string, entries: DirectoryBrowseResult["entries"]): DirectoryBrowseResult => ({
  currentPath,
  parentPath: null,
  entries,
  breadcrumbs: [{ name: currentPath.split("/").pop() || currentPath, path: currentPath }],
  totalFolders: entries.filter((entry) => entry.isDirectory).length,
  totalFiles: entries.filter((entry) => !entry.isDirectory).length,
  totalVideoFiles: 0,
});

let root: ReturnType<typeof createRoot>;
let container: HTMLElement;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("section");
  root = createRoot(container);
  vi.mocked(invoke).mockResolvedValue(browse("/workspace", [
    project("one.videoproject.json", "/workspace/one.videoproject.json"),
    project("two.videoproject.json", "/workspace/two.videoproject.json"),
  ]));
});

afterEach(() => act(() => root.unmount()));

const renderExplorer = async (props: Partial<React.ComponentProps<typeof MediaExplorerView>> = {}) => {
  await act(async () => {
    root.render(
      <MediaExplorerView
        initialPath="/workspace"
        onSelectVideoFile={vi.fn()}
        {...props}
      />,
    );
    await Promise.resolve();
  });
};

it("selects a project on single click and opens it only on double click", async () => {
  const onOpenProjectFile = vi.fn();
  await renderExplorer({ onOpenProjectFile });
  const row = container.querySelector<HTMLElement>(".explorer-row.is-project");
  expect(row).toBeTruthy();

  act(() => row!.click());
  expect(onOpenProjectFile).not.toHaveBeenCalled();
  expect(row!.className).toContain("selected");

  act(() => row!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  expect(onOpenProjectFile).toHaveBeenCalledTimes(1);
});

it("opens a focused project row with Enter", async () => {
  const onOpenProjectFile = vi.fn();
  await renderExplorer({ onOpenProjectFile });
  const row = container.querySelector<HTMLElement>(".explorer-row.is-project");
  expect(row).toBeTruthy();

  act(() => row!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(onOpenProjectFile).toHaveBeenCalledTimes(1);
});

it("auto-opens the only project at the selected workspace root", async () => {
  const onOpenProjectFile = vi.fn();
  vi.mocked(invoke).mockResolvedValueOnce(browse("/workspace", [
    project("only.videoproject.json", "/workspace/only.videoproject.json"),
  ]));

  await renderExplorer({ onOpenProjectFile });
  expect(onOpenProjectFile).toHaveBeenCalledTimes(1);
  expect(onOpenProjectFile).toHaveBeenCalledWith(expect.objectContaining({ name: "only.videoproject.json" }));
});

it("does not auto-open a project discovered after entering a child folder", async () => {
  const onOpenProjectFile = vi.fn();
  vi.mocked(invoke)
    .mockResolvedValueOnce(browse("/workspace", [folder("derived", "/workspace/derived")]))
    .mockResolvedValueOnce(browse("/workspace/derived", [project("only.videoproject.json", "/workspace/derived/only.videoproject.json")]));

  await renderExplorer({ onOpenProjectFile });
  const row = container.querySelector<HTMLElement>(".explorer-row.is-folder");
  act(() => row!.click());
  await act(async () => { await Promise.resolve(); });
  expect(onOpenProjectFile).not.toHaveBeenCalled();
});

it("uses folder selection to change the workspace without creating a project", async () => {
  const onOpenProjectFile = vi.fn();
  const onNewProject = vi.fn();
  vi.mocked(openFolderDialog).mockResolvedValue("/selected-workspace");
  vi.mocked(invoke)
    .mockResolvedValueOnce(browse("/workspace", [project("old.videoproject.json", "/workspace/old.videoproject.json")]))
    .mockResolvedValueOnce(browse("/selected-workspace", [project("only.videoproject.json", "/selected-workspace/only.videoproject.json")]));

  await renderExplorer({ onOpenProjectFile, onNewProject });
  onOpenProjectFile.mockClear();
  await act(async () => {
    container.querySelector<HTMLButtonElement>(".explorer-pick-btn")!.click();
    await Promise.resolve();
  });

  expect(onNewProject).not.toHaveBeenCalled();
  expect(onOpenProjectFile).toHaveBeenCalledTimes(1);
});
