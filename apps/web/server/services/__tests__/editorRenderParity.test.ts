import { describe, expect, it } from "vitest";
import {
  assertEditorRenderParity,
  buildEditorRenderIdentity,
} from "../editorRenderParity";

describe("editor render parity", () => {
  it("pins preview, scan, and render to the same source and plan", () => {
    const identity = buildEditorRenderIdentity({
      revisionId: "revision-1",
      snapshotId: "snapshot-1",
      sourceFingerprint: "sha256:abcdef1234",
      planHash: "plan-1",
    });
    expect(
      assertEditorRenderParity([identity, { ...identity, stage: "render" }])
    ).toBe(true);
  });

  it("rejects stale artifact identity", () => {
    const identity = buildEditorRenderIdentity({
      revisionId: "revision-1",
      snapshotId: "snapshot-1",
      sourceFingerprint: "sha256:abcdef1234",
      planHash: "plan-1",
    });
    expect(() =>
      assertEditorRenderParity([
        identity,
        { ...identity, stage: "render", revisionId: "revision-2" },
      ])
    ).toThrow("RENDER_PARITY_STALE");
  });
});
