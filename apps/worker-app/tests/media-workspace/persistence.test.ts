import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectDraft } from "../../src/types/nleProject";
import { parseProjectDraft, saveCapCutDraft, saveNleProject } from "../../src/screens/media-workspace/projectPersistence";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const draft = () => createDefaultProjectDraft({projectId: "p1", title: "v.mp4", videoPath: "/v.mp4", videoDurationMs: 1000});
beforeEach(() => vi.mocked(invoke).mockReset());
describe("native project persistence", () => {
  it("uses the save command's string response", async () => {
    vi.mocked(invoke).mockResolvedValue("/v.videoproject.json");
    const project = draft();
    expect(await saveNleProject(project, "/v.videoproject.json")).toBe("/v.videoproject.json");
    expect(invoke).toHaveBeenCalledWith("worker_app_save_nle_project", {projectPath: "/v.videoproject.json", projectJson: JSON.stringify(project, null, 2)});
  });
  it("sends Rust's draftDir and serialized draftJson arguments", async () => {
    vi.mocked(invoke).mockResolvedValue("/draft/draft_content.json");
    expect(await saveCapCutDraft(draft(), "/draft")).toBe("/draft/draft_content.json");
    const [command, args] = vi.mocked(invoke).mock.calls[0];
    expect(command).toBe("worker_app_export_capcut_draft");
    expect(args).toEqual({draftDir: "/draft", draftJson: expect.any(String)});
    expect(JSON.parse((args as any).draftJson).duration).toBe(1000000);
  });
  it.each([null, {}, {version: "2.0.0"}, {...draft(), tracks: {}}, {...draft(), canvas: null}])("rejects malformed projects: %j", (value: any) => {
    expect(() => parseProjectDraft(JSON.stringify(value))).toThrow();
  });
  it("rejects invalid nested clip collections", () => {
    const project = draft(); (project.tracks[3].clips[0] as any).words = {};
    expect(() => parseProjectDraft(JSON.stringify(project))).toThrow();
  });
  it("round-trips the full current project format", () => {
    const project = draft(); expect(parseProjectDraft(JSON.stringify(project))).toEqual(project);
  });
  it("sanitizes mediaPool and track clips containing project files", () => {
    const project = draft();
    project.mediaPool = [
      { id: "media_valid", name: "good.mp4", filePath: "/videos/good.mp4", mediaType: "video", importedAt: new Date().toISOString() },
      { id: "media_bad_proj", name: "proj.videoproject.json", filePath: "/videos/proj.videoproject.json", mediaType: "video", importedAt: new Date().toISOString() },
    ];
    (project.metadata as any).originalSourceVideo = "/videos/proj.videoproject.json";
    (project.tracks[3].clips as any).push({
      id: "v1_clip_bad",
      name: "proj.videoproject.json",
      timelineStartMs: 0,
      durationMs: 1000,
      sourceType: "local_file",
      sourcePath: "/videos/proj.videoproject.json",
      trimInMs: 0,
      trimOutMs: 1000,
      volume: 1.0,
    });

    const parsed = parseProjectDraft(JSON.stringify(project));
    expect(parsed.mediaPool?.length).toBe(1);
    expect(parsed.mediaPool?.[0].filePath).toBe("/videos/good.mp4");
    expect(parsed.metadata?.originalSourceVideo).toBe("");
    expect(parsed.tracks[3].clips.some(c => c.sourcePath?.includes(".videoproject.json"))).toBe(false);
  });
  it("does not create mediaPool items or video clips when given a project file path", () => {
    const projDraft = createDefaultProjectDraft({
      projectId: "p2",
      title: "My Project",
      videoPath: "D:/footage/My Project.videoproject.json",
      videoDurationMs: 5000,
    });
    expect(projDraft.mediaPool?.length).toBe(0);
    expect(projDraft.metadata?.originalSourceVideo).toBe("");
    expect(projDraft.tracks.find(t => t.type === "video_main")?.clips.length).toBe(0);
  });
  it("successfully parses newly created projects with 0 duration and empty originalSourceVideo", () => {
    const emptyProj = createDefaultProjectDraft({
      projectId: "empty_proj",
      title: "C2138-Projector",
      videoPath: "D:/C2138-Projector.videoproject.json",
      videoDurationMs: 0,
    });
    expect(emptyProj.canvas.durationMs).toBe(0);
    const parsed = parseProjectDraft(JSON.stringify(emptyProj));
    expect(parsed.projectId).toBe("empty_proj");
    expect(parsed.canvas.durationMs).toBe(0);
    expect(parsed.metadata?.originalSourceVideo).toBe("");
  });
});
it("does not overwrite source videos through Save Project", async () => {
  await expect(saveNleProject(draft(), "/v.mp4")).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
