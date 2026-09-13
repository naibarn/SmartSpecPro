import { describe, expect, it } from "vitest";
import { resolveVideoEditorMode, validateVideoEditorRetentionConfig } from "../videoEditorRollout";

describe("Feature 184 rollout controls", () => {
  it("applies emergency rollback precedence then user/tenant/global", () => {
    expect(resolveVideoEditorMode({ global: "web_default", tenant: "web_beta", user: "web_default", emergencyRollback: true })).toBe("legacy_worker");
    expect(resolveVideoEditorMode({ global: "legacy_worker", tenant: "web_beta", user: null, emergencyRollback: false })).toBe("web_beta");
    expect(() => resolveVideoEditorMode({ global: "invalid" as never, emergencyRollback: false })).toThrow("VIDEO_EDITOR_MODE_INVALID");
  });
  it("requires auditable non-negative retention values", () => {
    expect(validateVideoEditorRetentionConfig({ sourceRetention: 1, artifactRetention: 2, diagnosticRetention: 3, replayWindow: 4, orphanUploadTtl: 5 }).replayWindow).toBe(4);
    expect(() => validateVideoEditorRetentionConfig({ sourceRetention: -1, artifactRetention: 2, diagnosticRetention: 3, replayWindow: 4, orphanUploadTtl: 5 })).toThrow("RETENTION_CONFIG_INVALID");
    expect(() => validateVideoEditorRetentionConfig({ sourceRetention: 1.5, artifactRetention: 2, diagnosticRetention: 3, replayWindow: 4, orphanUploadTtl: 5 })).toThrow("RETENTION_CONFIG_INVALID");
  });
});
