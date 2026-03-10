import { describe, expect, it } from "vitest";

import {
  buildBrowserApprovalPayload,
  validateBrowserApprovalContext,
} from "../browserApprovalPayload";

describe("browser approval payload", () => {
  it("includes the browser-specific approval contract fields", () => {
    const payload = buildBrowserApprovalPayload({
      actionDescription: "Upload report.csv",
      executionId: "exec-1",
      targetOrigin: "https://example.com",
      reasonCodes: ["restricted_action"],
      normalizedAction: { action: "upload", file: "report.csv" },
      payloadPreview: { fileName: "report.csv" },
      domFingerprint: "dom-123",
      screenshotHash: "shot-123",
      approvalTtlSeconds: 300,
    });

    expect(payload).toMatchObject({
      actionDescription: "Upload report.csv",
      executionId: "exec-1",
      targetOrigin: "https://example.com",
      domFingerprint: "dom-123",
      screenshotHash: "shot-123",
      approvalTtlSeconds: 300,
    });
    expect(payload.actionDigest).toHaveLength(64);
    expect(payload.payloadPreviewHash).toHaveLength(64);
  });

  it("rejects approval TTL values outside the approved bounds", () => {
    expect(() =>
      buildBrowserApprovalPayload({
        actionDescription: "Upload report.csv",
        executionId: "exec-1",
        targetOrigin: "https://example.com",
        reasonCodes: ["restricted_action"],
        normalizedAction: { action: "upload", file: "report.csv" },
        payloadPreview: { fileName: "report.csv" },
        domFingerprint: "dom-123",
        approvalTtlSeconds: 59,
      }),
    ).toThrow();
  });

  it("invalidates approvals when context-bound checks fail", () => {
    expect(
      validateBrowserApprovalContext({
        stored: {
          actionDigest: "digest-1",
          domFingerprint: "dom-1",
          targetOrigin: "https://example.com",
        },
        observed: {
          actionDigest: "digest-2",
          domFingerprint: "dom-2",
          targetOrigin: "https://example.com",
        },
        domDrift: 0.3,
      }),
    ).toEqual({
      valid: false,
      reasonCode: "approval_context_changed",
    });
  });

  it("fails closed when a revocation is observed", () => {
    expect(
      validateBrowserApprovalContext({
        stored: {
          actionDigest: "digest-1",
          domFingerprint: "dom-1",
          targetOrigin: "https://example.com",
        },
        observed: {
          actionDigest: "digest-1",
          domFingerprint: "dom-1",
          targetOrigin: "https://example.com",
        },
        domDrift: 0,
        revoked: true,
      }),
    ).toEqual({
      valid: false,
      reasonCode: "approval_revoked",
    });
  });
});
