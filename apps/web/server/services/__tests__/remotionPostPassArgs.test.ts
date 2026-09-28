/**
 * Feature 133 (Video Intelligence Platform) — section-04 — pure argv
 * builder tests for the `remotion_render_video` worker job's post-passes.
 *
 * Pure string/array assertions only — NO real ffmpeg execution (repo
 * convention, see `verticalDramaFinalRenderGraph.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { buildConcatFfmpegArgs } from "../verticalDramaEpisodeVideoAssembly";
import {
  buildAssBurnPassArgs,
  buildLoudnormPassArgs,
  planPostPasses,
  REMOTION_POST_PASS_LOUDNORM_FILTER,
} from "../remotionPostPassArgs";
import type { RemotionRenderVideoWorkerInput } from "../../../shared/workerRuntime";

const BASE_PAYLOAD: RemotionRenderVideoWorkerInput = {
  kind: "remotion_render_video",
  schemaVersion: 1,
  platformContractVersion: "2026-07-12",
  rendererPolicyVersion: "remotion-1",
  videoProjectId: "vproj_1",
  projectRevision: 1,
  traceId: "trace_1",
  renderProfile: {
    profile: "final",
    width: 1080,
    height: 1920,
    fps: 30,
    codec: "h264",
    loudnessNormalize: true,
    burnInAssCaptions: false,
  },
  remotionTemplate: {
    id: "tpl_1",
    name: "Template",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 900,
    layers: [],
  },
  compositionId: "GenericTemplate",
  assetManifest: { sources: [] },
  postPasses: [],
  segmentPlan: null,
  remotionTemplateHash: "hash_1",
  durationInFrames: 900,
};

describe("remotionPostPassArgs", () => {
  it("buildLoudnormPassArgs emits loudnorm=I=-16:TP=-1.5:LRA=11", () => {
    const argv = buildLoudnormPassArgs("/tmp/in.mp4", "/tmp/out.mp4");
    expect(REMOTION_POST_PASS_LOUDNORM_FILTER).toBe("loudnorm=I=-16:TP=-1.5:LRA=11");
    const afIndex = argv.indexOf("-af");
    expect(afIndex).toBeGreaterThan(-1);
    expect(argv[afIndex + 1]).toBe("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(argv[argv.indexOf("-i") + 1]).toBe("/tmp/in.mp4");
    expect(argv[argv.length - 1]).toBe("/tmp/out.mp4");
  });

  it("ass_burn argv references the built .ass file and subtitle filter", () => {
    const argv = buildAssBurnPassArgs("/tmp/in.mp4", "/tmp/captions.ass", "/tmp/out.mp4");
    const vfIndex = argv.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    const filterValue = argv[vfIndex + 1]!;
    expect(filterValue.startsWith("subtitles=filename=")).toBe(true);
    expect(filterValue).toContain("/tmp/captions.ass");
    expect(argv[argv.indexOf("-i") + 1]).toBe("/tmp/in.mp4");
    expect(argv[argv.length - 1]).toBe("/tmp/out.mp4");
  });

  it("segment_concat reuses buildConcatFfmpegArgs for the segmentPlan (byte-identical no-op lock)", () => {
    const payload: RemotionRenderVideoWorkerInput = {
      ...BASE_PAYLOAD,
      postPasses: ["segment_concat"],
      segmentPlan: {
        parts: [
          { index: 0, durationInFrames: 300 },
          { index: 1, durationInFrames: 600 },
        ],
      },
    };
    const steps = planPostPasses(payload, {
      renderedMp4Path: "/tmp/render.mp4",
      workspaceDir: "/tmp/workspace",
      segmentInputPaths: ["/tmp/seg0.mp4", "/tmp/seg1.mp4"],
      concatListPath: "/tmp/concat.txt",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.code).toBe("segment_concat");
    expect(steps[0]!.argv).toEqual(
      buildConcatFfmpegArgs({
        inputPaths: ["/tmp/seg0.mp4", "/tmp/seg1.mp4"],
        concatListPath: "/tmp/concat.txt",
        outputPath: steps[0]!.outputPath,
      }),
    );
  });

  it("no post-passes → passthrough (no ffmpeg args)", () => {
    const steps = planPostPasses(BASE_PAYLOAD, {
      renderedMp4Path: "/tmp/render.mp4",
      workspaceDir: "/tmp/workspace",
    });
    expect(steps).toEqual([]);
  });

  it("planPostPasses threads loudnorm output into ass_burn input, in declared order", () => {
    const payload: RemotionRenderVideoWorkerInput = {
      ...BASE_PAYLOAD,
      postPasses: ["loudnorm", "ass_burn"],
    };
    const steps = planPostPasses(payload, {
      renderedMp4Path: "/tmp/render.mp4",
      workspaceDir: "/tmp/workspace",
      assFilePath: "/tmp/captions.ass",
    });
    expect(steps.map(s => s.code)).toEqual(["loudnorm", "ass_burn"]);
    expect(steps[0]!.argv[steps[0]!.argv.indexOf("-i") + 1]).toBe("/tmp/render.mp4");
    expect(steps[1]!.argv[steps[1]!.argv.indexOf("-i") + 1]).toBe(steps[0]!.outputPath);
  });

  it("planPostPasses throws a clear error when ass_burn is declared without an assFilePath", () => {
    const payload: RemotionRenderVideoWorkerInput = {
      ...BASE_PAYLOAD,
      postPasses: ["ass_burn"],
    };
    expect(() =>
      planPostPasses(payload, {
        renderedMp4Path: "/tmp/render.mp4",
        workspaceDir: "/tmp/workspace",
      }),
    ).toThrow(/assFilePath/);
  });
});
