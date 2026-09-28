import { describe, expect, it } from "vitest";
import { publicationKey, verifyEditorArtifactManifest, verifyEditorArtifactSet } from "../editorArtifactVerification";

const manifest = { jobId: "j1", attemptId: "a1", leaseToken: "l1", role: "final_video", artifactId: "art1", checksum: "sha256:abc", sizeBytes: 42, mimeType: "video/mp4" };

describe("editor artifact verification", () => {
  it("requires server-observed checksum, size and tenant before publication", () => {
    expect(verifyEditorArtifactManifest(manifest, { checksum: "sha256:abc", sizeBytes: 42, tenantId: "t1" }, "t1").verified).toBe(true);
    expect(() => verifyEditorArtifactManifest(manifest, { checksum: "sha256:bad", sizeBytes: 42, tenantId: "t1" }, "t1")).toThrow("ARTIFACT_INTEGRITY_MISMATCH");
    expect(() => verifyEditorArtifactManifest(manifest, { checksum: "sha256:abc", sizeBytes: 42, tenantId: "t2" }, "t1")).toThrow("ARTIFACT_TENANT_MISMATCH");
  });
  it("has an idempotent publication key", () => expect(publicationKey(manifest)).toBe("j1:final_video:sha256:abc"));
  it("rejects unsafe publication identity fields", () => {
    expect(() => publicationKey({ ...manifest, role: "../final" })).toThrow("ARTIFACT_MANIFEST_INVALID");
    expect(() => verifyEditorArtifactManifest({ ...manifest, leaseToken: "../lease" }, { checksum: "sha256:abc", sizeBytes: 42, tenantId: "t1" }, "t1")).toThrow("ARTIFACT_MANIFEST_INVALID");
  });
  it("rejects duplicate or undeclared output roles", () => {
    expect(() => verifyEditorArtifactSet([manifest, { ...manifest, role: "preview" }], ["final_video"])).toThrow("ARTIFACT_ROLE_UNDECLARED");
    expect(() => verifyEditorArtifactSet([manifest, manifest], ["final_video"])).toThrow("ARTIFACT_ROLE_DUPLICATE");
    expect(() => verifyEditorArtifactSet([], ["final_video"])).toThrow("ARTIFACT_ROLE_MISSING");
    expect(() => verifyEditorArtifactSet([manifest, { ...manifest, role: "preview", attemptId: "a2" }], ["final_video", "preview"])).toThrow("ARTIFACT_CONTEXT_MISMATCH");
    expect(() => verifyEditorArtifactSet([manifest], ["final_video", "final_video"])).toThrow("ARTIFACT_ROLE_DECLARATION_INVALID");
  });
});
