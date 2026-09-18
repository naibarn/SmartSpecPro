import { describe, expect, it } from "vitest";
import {
  adaptEditorRuntimeEnvelope,
  selectEditorRuntime,
} from "../editorRuntimeAdapter";

describe("editor runtime adapter", () => {
  it("uses managed references and exact capability tokens", () => {
    const adapted = adaptEditorRuntimeEnvelope({
      operation: "media.composition_scan",
      contractVersion: "feature-191.v1",
      tenantId: "tenant-1",
      projectId: "project-1",
      revisionId: "revision-1",
      assets: [{ namespace: "media_asset", id: 10 }],
    });
    expect(adapted.runtime).toBe("node");
    expect(adapted.claim).toBe("editor-media-operation-media-composition_scan");
    expect(adapted.assetRefs[0]).toEqual({ namespace: "media_asset", id: 10 });
  });

  it("rejects local paths and makes unsupported Worker parity explicit", () => {
    expect(() =>
      adaptEditorRuntimeEnvelope({
        operation: "video.render",
        contractVersion: "1.0",
        tenantId: "tenant-1",
        projectId: "project-1",
        revisionId: "revision-1",
        assets: [{ namespace: "media_asset", id: "/tmp/video.mp4" }],
      })
    ).toThrow("ASSET_LOCALITY_INVALID");
    expect(
      selectEditorRuntime("media.composition_scan", "windows")
    ).toMatchObject({
      state: "capability_blocked",
      reason: "node_adapter_required",
    });
    expect(selectEditorRuntime("video.render", "windows")).toMatchObject({
      state: "eligible",
      runtime: "windows",
    });
  });
});
