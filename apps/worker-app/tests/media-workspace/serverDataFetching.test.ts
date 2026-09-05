import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SMARTAIHUB_CLOUD_LIBRARY_PRESETS } from "../../src/screens/media-workspace/AssetDrawerPanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

describe("SmartAIHub Server Data Fetching & Cloud Media", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("fetches real series list from worker_app_list_series", async () => {
    vi.mocked(invoke).mockResolvedValue({
      contractVersion: "1.0.0",
      items: [
        { seriesId: "s101", title: "คู่กัดลวงรัก", status: "active", accessMode: "operate" },
        { seriesId: "s102", title: "สายลับรอยยิ้ม", status: "active", accessMode: "read" },
      ],
    });

    const result = await invoke<{ items: Array<{ seriesId: string; title: string }> }>("worker_app_list_series", { query: null, cursor: null });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("คู่กัดลวงรัก");
    expect(invoke).toHaveBeenCalledWith("worker_app_list_series", { query: null, cursor: null });
  });

  it("fetches series media workspace with specific query terms and strict item limit", async () => {
    vi.mocked(invoke).mockResolvedValue({
      series: { seriesId: "s101", title: "คู่กัดลวงรัก" },
      episodes: [{ episodeId: "ep1", title: "EP 01: จุดเริ่มต้น" }],
      assets: [
        {
          id: "ast_flower_1",
          assetKind: "image_stock",
          pipelineState: "completed",
          sourceMetadataJson: JSON.stringify({ title: "ภาพดอกไม้กุหลาบสดใส (Flower Image)", durationMs: 5000, format: "png" }),
          derivedArtifactJson: JSON.stringify({ thumbnailUrl: "https://server.smartaihub.app/flower.png" }),
          episodeId: "ep1",
        },
      ],
    });

    const workspace = await invoke<{ assets: Array<{ id: string; assetKind: string }> }>("worker_app_get_series_media_workspace", {
      seriesId: "s101",
      query: "ภาพดอกไม้",
      limit: 25,
    });

    expect(workspace.assets).toHaveLength(1);
    expect(workspace.assets[0].id).toBe("ast_flower_1");
    expect(invoke).toHaveBeenCalledWith("worker_app_get_series_media_workspace", {
      seriesId: "s101",
      query: "ภาพดอกไม้",
      limit: 25,
    });
  });

  it("fetches worker job summary and queue for media history", async () => {
    vi.mocked(invoke).mockResolvedValue({
      items: [
        {
          id: "job_777",
          jobType: "automated_ai_editing",
          status: "completed",
          createdAt: "2026-09-05T10:00:00Z",
          outputJson: { fileName: "Render_EP1.mp4", videoUrl: "https://server.smartaihub.app/out.mp4", durationMs: 15000 },
        },
      ],
    });

    const summary = await invoke<{ items: Array<{ id: string; status: string }> }>("worker_app_get_worker_job_summary");
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].status).toBe("completed");
  });

  it("ensures SmartAIHub cloud library presets are available for all media tabs", () => {
    expect(SMARTAIHUB_CLOUD_LIBRARY_PRESETS.length).toBeGreaterThan(0);
    const categories = new Set(SMARTAIHUB_CLOUD_LIBRARY_PRESETS.map((item) => item.category));
    expect(categories.has("music")).toBe(true);
    expect(categories.has("sfx")).toBe(true);
    expect(categories.has("broll")).toBe(true);
    expect(categories.has("video")).toBe(true);
  });

  it("fetches series episodes, 9 individual shot clips, and 9-shot compound video independently", async () => {
    vi.mocked(invoke).mockResolvedValue({
      series: { seriesId: "53", title: "คู่กัดลวงรัก" },
      episodes: [
        { episodeId: "225", episodeNumber: 1, title: "EP 01 - คืนที่ทุกอย่างพัง" },
        { episodeId: "227", episodeNumber: 2, title: "EP 02 - เด็กชายเพียงคนเดียว" },
      ],
      assets: [
        {
          id: "compound_ep_225",
          assetKind: "compound_9_shots",
          isCompoundShot: true,
          isShotClip: false,
          episodeId: "225",
          episodeTitle: "EP 01: คืนที่ทุกอย่างพัง",
          sourceUrl: "https://server.smartaihub.app/render-ep1.mp4",
          thumbnailUrl: "https://server.smartaihub.app/render-ep1.jpg",
          durationMs: 72000,
        },
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `shot_ep_225_clip_${i + 1}`,
          assetKind: "shot_clip",
          isCompoundShot: false,
          isShotClip: true,
          shotNumber: i + 1,
          episodeId: "225",
          episodeTitle: "EP 01: คืนที่ทุกอย่างพัง",
          sourceUrl: `https://server.smartaihub.app/shot-${i + 1}.mp4`,
          durationMs: 8000,
        })),
      ],
    });

    const res = await invoke<{
      series: { seriesId: string; title: string };
      episodes: Array<{ episodeId: string; title: string }>;
      assets: Array<{ id: string; assetKind: string; isCompoundShot?: boolean; isShotClip?: boolean; episodeId?: string }>;
    }>("worker_app_get_series_media_workspace", {
      seriesId: "53",
      limit: 100,
    });

    expect(res.episodes).toHaveLength(2);
    expect(res.episodes[0].title).toBe("EP 01 - คืนที่ทุกอย่างพัง");
    expect(res.assets).toHaveLength(10); // 1 compound + 9 shots

    const compounds = res.assets.filter((a) => a.isCompoundShot);
    const shots = res.assets.filter((a) => a.isShotClip);

    expect(compounds).toHaveLength(1);
    expect(compounds[0].id).toBe("compound_ep_225");
    expect(shots).toHaveLength(9);
    expect(shots.every((s) => s.episodeId === "225")).toBe(true);
  });
});
