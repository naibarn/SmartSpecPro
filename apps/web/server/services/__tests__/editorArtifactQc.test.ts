import { describe, expect, it } from "vitest";
import { prepareEditorArtifactCommit } from "../editorArtifactCommitService";
import { evaluateEditorArtifactQc } from "../editorQcService";

describe("editor artifact QC and commit", () => {
  const base = {
    artifactId: "artifact-1",
    role: "final_video",
    expectedRole: "final_video",
    mediaHash: "sha256:abcdef1234",
    expectedMediaHash: "sha256:abcdef1234",
    durationMs: 10_000,
    expectedDurationMs: 10_002,
    width: 1080,
    height: 1920,
    expectedWidth: 1080,
    expectedHeight: 1920,
    hasAudio: true,
    audioRequired: true,
    snapshotId: "snapshot-1",
    revisionId: "revision-1",
    tenantId: "tenant-1",
  } as const;

  it("passes matching manifest data and returns a committed record", () => {
    const qc = evaluateEditorArtifactQc(base);
    expect(qc.status).toBe("passed");
    expect(prepareEditorArtifactCommit(base, qc).status).toBe("committed");
  });

  it("keeps warnings visible and blocks role/hash/required QC failures", () => {
    expect(
      evaluateEditorArtifactQc({ ...base, durationMs: 10_200 }).status
    ).toBe("warning");
    expect(() =>
      prepareEditorArtifactCommit(
        { ...base, role: "preview" },
        evaluateEditorArtifactQc({ ...base, role: "preview" })
      )
    ).toThrow("ARTIFACT_ROLE_MISMATCH");
    expect(() =>
      prepareEditorArtifactCommit(
        { ...base, mediaHash: "sha256:other1234" },
        evaluateEditorArtifactQc({ ...base, mediaHash: "sha256:other1234" })
      )
    ).toThrow("ARTIFACT_HASH_MISMATCH");
  });
});
