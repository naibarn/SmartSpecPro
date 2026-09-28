import { describe, expect, it } from "vitest";
import { validateEditorAssetInput } from "./videoEditorAssetSecurity";

describe("Feature 184 managed asset boundary", () => {
  const base = { tenantId: "t1", ownerTenantId: "t1", mimeType: "video/mp4" };
  it("rejects cross-tenant, remote URL, traversal and unsupported MIME", () => {
    expect(validateEditorAssetInput({ ...base, ownerTenantId: "t2" })).toEqual({ ok: false, code: "TENANT_MISMATCH" });
    expect(validateEditorAssetInput({ ...base, sourceUrl: "https://example.invalid/video.mp4" })).toEqual({ ok: false, code: "URL_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, selectedPath: "media/../secret" })).toEqual({ ok: false, code: "PATH_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, selectedPath: "/workspace/clip.mp4" })).toEqual({ ok: false, code: "PATH_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, sourceUrl: "data:video/mp4;base64,abc" })).toEqual({ ok: false, code: "URL_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, sourceUrl: "javascript:alert(1)" })).toEqual({ ok: false, code: "URL_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, sourceUrl: "//remote.example/video.mp4" })).toEqual({ ok: false, code: "URL_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, sourceUrl: " https://remote.example/video.mp4 " })).toEqual({ ok: false, code: "URL_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, selectedPath: "\\workspace\\clip.mp4" })).toEqual({ ok: false, code: "PATH_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, selectedPath: "~/clip.mp4" })).toEqual({ ok: false, code: "PATH_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, selectedPath: " /workspace/clip.mp4 " })).toEqual({ ok: false, code: "PATH_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, mimeType: "application/x-sh" })).toEqual({ ok: false, code: "MIME_NOT_ALLOWED" });
    expect(validateEditorAssetInput({ ...base, mimeType: "video/" })).toEqual({ ok: false, code: "MIME_NOT_ALLOWED" });
  });
  it("accepts a tenant-owned managed-media selection", () => {
    expect(validateEditorAssetInput({ ...base, selectedPath: "imports/clip.mp4" })).toEqual({ ok: true });
  });
});
