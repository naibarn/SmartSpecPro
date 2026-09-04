import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectDraft } from "../../src/types/nleProject";
import { parseProjectDraft, saveCapCutDraft, saveNleProject } from "../../src/screens/media-workspace/projectPersistence";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const draft = () => createDefaultProjectDraft({projectId: "p1", title: "v.mp4", videoPath: "/v.mp4", videoDurationMs: 1000});
beforeEach(() => vi.mocked(invoke).mockReset());
describe("native project persistence", () => {
  it("uses the save command's string response", async () => {
    vi.mocked(invoke).mockResolvedValue("/v.smartspec.json");
    const project = draft();
    expect(await saveNleProject(project, "/v.smartspec.json")).toBe("/v.smartspec.json");
    expect(invoke).toHaveBeenCalledWith("worker_app_save_nle_project", {projectPath: "/v.smartspec.json", projectJson: JSON.stringify(project, null, 2)});
  });
  it("sends Rust's draftDir and serialized draftJson arguments", async () => {
    vi.mocked(invoke).mockResolvedValue("/draft/draft_content.json");
    expect(await saveCapCutDraft(draft(), "/draft")).toBe("/draft/draft_content.json");
    const [command, args] = vi.mocked(invoke).mock.calls[0];
    expect(command).toBe("worker_app_export_capcut_draft");
    expect(args).toEqual({draftDir: "/draft", draftJson: expect.any(String)});
    expect(JSON.parse((args as any).draftJson).duration).toBe(1000000);
  });
  it.each([null, {}, {version: "2.0.0"}, {...draft(), tracks: {}}, {...draft(), canvas: null}])("rejects malformed projects: %j", value => {
    expect(() => parseProjectDraft(JSON.stringify(value))).toThrow();
  });
  it("rejects invalid nested clip collections", () => {
    const project = draft(); (project.tracks[3].clips[0] as any).words = {};
    expect(() => parseProjectDraft(JSON.stringify(project))).toThrow();
  });
  it("round-trips the full current project format", () => {
    const project = draft(); expect(parseProjectDraft(JSON.stringify(project))).toEqual(project);
  });
});
it("does not overwrite source videos through Save Project", async () => {
  await expect(saveNleProject(draft(), "/v.mp4")).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
