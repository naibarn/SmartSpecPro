import { describe, expect, it } from "vitest";

import {
  buildBrowserApprovalPayload,
  getBrowserApprovalCorrelationKey,
} from "../../services/browserApprovalPayload";

describe("browser policy approvals", () => {
  it("builds a stable correlation key for idempotent retries", () => {
    const payload = buildBrowserApprovalPayload({
      actionDescription: "Upload report.csv",
      executionId: "exec-1",
      targetOrigin: "https://example.com",
      reasonCodes: ["restricted_action"],
      normalizedAction: { action: "upload", file: "report.csv" },
      payloadPreview: { fileName: "report.csv" },
      domFingerprint: "dom-123",
      approvalTtlSeconds: 300,
    });

    expect(getBrowserApprovalCorrelationKey(payload)).toBe(
      getBrowserApprovalCorrelationKey(payload),
    );
  });

  it("changes the correlation key when the logical browser action changes", () => {
    const firstPayload = buildBrowserApprovalPayload({
      actionDescription: "Upload report.csv",
      executionId: "exec-1",
      targetOrigin: "https://example.com",
      reasonCodes: ["restricted_action"],
      normalizedAction: { action: "upload", file: "report.csv" },
      payloadPreview: { fileName: "report.csv" },
      domFingerprint: "dom-123",
      approvalTtlSeconds: 300,
    });
    const secondPayload = buildBrowserApprovalPayload({
      actionDescription: "Upload other.csv",
      executionId: "exec-1",
      targetOrigin: "https://example.com",
      reasonCodes: ["restricted_action"],
      normalizedAction: { action: "upload", file: "other.csv" },
      payloadPreview: { fileName: "other.csv" },
      domFingerprint: "dom-123",
      approvalTtlSeconds: 300,
    });

    expect(getBrowserApprovalCorrelationKey(firstPayload)).not.toBe(
      getBrowserApprovalCorrelationKey(secondPayload),
    );
  });
});
