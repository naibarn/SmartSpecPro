import { describe, expect, it } from "vitest";
import {
  buildVideoEditorRevisionDocument,
  VideoEditorProjectRevisionConflictError,
} from "../videoEditorProjectRevisionService";

describe("video editor project revision service", () => {
  it("keeps canonical documents canonical and reports no legacy loss", () => {
    const document = {
      projectId: "project-1",
      schemaVersion: "nle.web.1",
      timebase: { numerator: 1, denominator: 1000 },
      canvas: {
        width: 1080,
        height: 1920,
        pixelAspectRatio: { numerator: 1, denominator: 1 },
      },
      tracks: [],
      markers: [],
      render: {
        profileId: "web-default",
        fps: { numerator: 30, denominator: 1 },
        outputRoles: ["final_video"],
      },
      migration: {
        sourceFormat: "nle.web",
        sourceVersion: "1",
        mappingVersion: "feature-184.2",
        unresolved: [],
        unsupported: [],
        preservedUnknown: {},
      },
    };
    const result = buildVideoEditorRevisionDocument(document, "project-1");
    expect(result.project).toEqual(document);
    expect(result.report).toBeNull();
  });

  it("migrates legacy documents without dropping unknown fields", () => {
    const result = buildVideoEditorRevisionDocument(
      {
        format: "legacy-web",
        version: "0.9",
        title: "rough cut",
        customPluginState: { keep: true },
        assets: { mediaA: { path: "managed://asset-a" } },
        tracks: [
          {
            id: "v1",
            kind: "video",
            clips: [
              {
                id: "clip-a",
                sourcePath: "managed://asset-a",
                durationMs: 1000,
              },
            ],
          },
        ],
      },
      "project-1"
    );
    expect(result.project.schemaVersion).toBe("nle.web.1");
    expect(result.project.migration.preservedUnknown).toEqual({
      customPluginState: { keep: true },
    });
    expect(result.report?.mappingVersion).toBe("feature-184.2");
  });

  it("rejects malformed canonical documents and exposes typed CAS conflicts", () => {
    expect(() =>
      buildVideoEditorRevisionDocument(
        { schemaVersion: "nle.web.1" },
        "project-1"
      )
    ).toThrow("PROJECT_VERSION_UNSUPPORTED");
    const error = new VideoEditorProjectRevisionConflictError({
      projectId: 10,
      expectedRevision: 2,
      actualRevision: 3,
      currentRevisionId: "rev-3",
    });
    expect(error.code).toBe("VIDEO_EDITOR_REVISION_CONFLICT");
    expect(error.currentRevisionId).toBe("rev-3");
  });
});
