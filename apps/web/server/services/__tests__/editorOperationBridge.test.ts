import { describe, expect, it } from "vitest";
import {
  bridgeEditorOperation,
  projectEditorOperationStatus,
} from "../editorOperationBridge";

describe("editor operation bridge", () => {
  it("routes Full Scan to the Node adapter and keeps Worker claims exact", () => {
    expect(
      bridgeEditorOperation({
        operation: "media.composition_scan",
        revisionId: "revision-1",
        snapshotId: "snapshot-1",
      })
    ).toMatchObject({ runtime: "node", requiresReview: true });
    expect(
      bridgeEditorOperation({
        operation: "video.render",
        revisionId: "revision-1",
        snapshotId: "snapshot-1",
      })
    ).toMatchObject({
      runtime: "windows",
      claim: "editor-media-operation-video-render",
    });
  });

  it("projects degraded and canonical machine states without collapsing them", () => {
    expect(projectEditorOperationStatus("completed", "degraded")).toMatchObject(
      { machineState: "degraded", label: "review-required" }
    );
    expect(projectEditorOperationStatus("queued", null)).toMatchObject({
      machineState: "queued",
    });
    expect(
      projectEditorOperationStatus("waiting_external", null)
    ).toMatchObject({ machineState: "waiting_agent", label: "waiting-agent" });
  });
});
