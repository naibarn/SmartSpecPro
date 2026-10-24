import { describe, expect, it } from "vitest";
import { classifyCloudflareArtifactPublishFailure } from "../cloudflareArtifactPublishDiagnostics";

describe("Cloudflare artifact publish diagnostics", () => {
  it("classifies provider timeout and preserves only safe provider fields", () => {
    const error = Object.assign(new Error("request https://user:secret@r2.example/?token=private timed out"), {
      name: "TimeoutError",
      code: "ETIMEDOUT",
      $metadata: { httpStatusCode: 503, requestId: "req_123", attempts: 3, totalRetryDelay: 1200 },
    });
    expect(classifyCloudflareArtifactPublishFailure(error, "asset_uploads")).toEqual({
      phase: "asset_uploads",
      rootErrorCategory: "timeout",
      diagnosticCode: "ETIMEDOUT",
      retryable: true,
      timeoutResource: { kind: "timeout", code: "ETIMEDOUT" },
      providerDiagnostics: {
        errorName: "TimeoutError",
        errorCode: "ETIMEDOUT",
        httpStatus: 503,
        requestId: "req_123",
        attempts: 3,
        retryDelayMs: 1200,
      },
    });
  });

  it("reports internal artifact codes without exposing arbitrary provider messages", () => {
    const error = Object.assign(new Error("CLOUDFLARE_ARTIFACT_BUILD_DIGEST_MISMATCH"), {
      name: "Error",
      $metadata: { httpStatusCode: 400, requestId: "secret token=hidden" },
    });
    const result = classifyCloudflareArtifactPublishFailure(error, "bundle_validation");
    expect(result.rootErrorCategory).toBe("artifact_validation_or_integrity");
    expect(result.diagnosticCode).toBe("CLOUDFLARE_ARTIFACT_BUILD_DIGEST_MISMATCH");
    expect(JSON.stringify(result)).not.toMatch(/secret|token=hidden/);
  });

  it("classifies resource exhaustion without retrying permanent authorization failures", () => {
    expect(classifyCloudflareArtifactPublishFailure(Object.assign(new Error("disk full"), { code: "ENOSPC" }), "readback_verification"))
      .toMatchObject({ rootErrorCategory: "resource_exhaustion", retryable: false, timeoutResource: { kind: "resource_exhaustion", code: "ENOSPC" } });
    expect(classifyCloudflareArtifactPublishFailure(Object.assign(new Error("forbidden"), { $metadata: { httpStatusCode: 403 } }), "manifest_commit"))
      .toMatchObject({ rootErrorCategory: "provider_authorization", retryable: false, providerDiagnostics: { httpStatus: 403 } });
  });
});
