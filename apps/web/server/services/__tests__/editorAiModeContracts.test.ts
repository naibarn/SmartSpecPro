import { describe, expect, it } from "vitest";
import {
  buildTranscriptTimelineAnchor,
  transitionEditorAiMode,
} from "../editorAiModeContracts";

describe("editor AI mode contracts", () => {
  it("keeps Suggest, Draft, and Apply distinct and review-gated", () => {
    expect(transitionEditorAiMode("suggest", "apply", false)).toMatchObject({
      mode: "apply",
      reviewRequired: true,
      allowed: false,
    });
    expect(transitionEditorAiMode("draft", "apply", true)).toMatchObject({
      mode: "apply",
      reviewRequired: true,
      allowed: true,
    });
  });

  it("maps transcript time into canonical timeline milliseconds", () => {
    expect(
      buildTranscriptTimelineAnchor({
        segmentId: "seg-1",
        startSeconds: 1.25,
        endSeconds: 2.5,
        sourceFingerprint: "sha256:abcdef1234",
      })
    ).toEqual({
      segmentId: "seg-1",
      startMs: 1250,
      endMs: 2500,
      sourceFingerprint: "sha256:abcdef1234",
    });
  });
});
