import { describe, expect, it } from "vitest";
import {
  boundedEditorRetry,
  redactEditorEvent,
  validateEditorReference,
} from "../editorSecurityObservability";

describe("editor security and observability", () => {
  it("rejects SSRF/path references and redacts secrets", () => {
    expect(() => validateEditorReference("http://127.0.0.1/private")).toThrow(
      "EDITOR_REFERENCE_UNSAFE"
    );
    expect(() => validateEditorReference("../secret.mp4")).toThrow(
      "EDITOR_REFERENCE_UNSAFE"
    );
    expect(
      redactEditorEvent({
        tenantId: "tenant-1",
        token: "secret",
        objectKey: "managed://asset-1",
        password: "hidden",
      })
    ).toEqual({
      tenantId: "tenant-1",
      token: "[REDACTED]",
      objectKey: "managed://asset-1",
      password: "[REDACTED]",
    });
  });

  it("caps retries and exposes terminal exhaustion", () => {
    expect(boundedEditorRetry(1, 3)).toEqual({ retry: true, delayMs: 500 });
    expect(boundedEditorRetry(3, 3)).toEqual({ retry: false, delayMs: 0 });
  });
});
