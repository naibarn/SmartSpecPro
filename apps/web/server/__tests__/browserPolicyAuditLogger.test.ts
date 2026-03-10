import { describe, expect, it } from "vitest";

import {
  buildBrowserPolicyAuditArtifacts,
  verifyBrowserPolicyAuditChain,
} from "../services/browserPolicyAuditLogger";

const decision = {
  version: "2026-03-10",
  tenantId: "tenant-1",
  userId: 7,
  workflowId: 42,
  executionId: "exec-1",
  traceId: "trace-1",
  actionType: "upload",
  actionClass: "restricted",
  pageSensitivity: "sensitive_data",
  decision: "require_approval",
  reasonCodes: ["external_upload"],
  confidence: 0.92,
  riskScore: 88,
  evidence: {
    actionDigest: "digest-1",
    payloadPreviewHash: "preview-1",
    domFingerprint: "dom-1",
    screenshotHash: "shot-hash-1",
  },
  approval: {
    required: true,
    approvalTtlSeconds: 300,
  },
} as const;

describe("browser policy audit logger", () => {
  it("builds aligned JSONL and DB audit artifacts without raw DOM or screenshot blobs", () => {
    const artifacts = buildBrowserPolicyAuditArtifacts({
      decision: decision as any,
      previousEventHash: "prev-hash",
      approvalState: "pending",
      outcome: "blocked",
      rawDomSnippet: "<form>Password</form>",
      fullScreenshotBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    });

    expect(artifacts.jsonlEvent.eventType).toBe("browser_policy_decision");
    expect(artifacts.jsonlEvent.reasonCodes).toEqual(["external_upload"]);
    expect(artifacts.dbRecord.reasonCodes).toEqual(["external_upload"]);
    expect(artifacts.dbRecord.evidence.screenshotHash).toBe("shot-hash-1");
    expect(JSON.stringify(artifacts.jsonlEvent)).not.toContain("Password");
    expect(JSON.stringify(artifacts.jsonlEvent)).not.toContain("iVBORw0KGgo");
    expect(artifacts.jsonlEvent.integrity.previousEventHash).toBe("prev-hash");
  });

  it("generates a verifiable tamper-evident hash chain", () => {
    const first = buildBrowserPolicyAuditArtifacts({
      decision: decision as any,
      approvalState: "pending",
      outcome: "blocked",
    });
    const second = buildBrowserPolicyAuditArtifacts({
      decision: {
        ...decision,
        traceId: "trace-2",
        executionId: "exec-2",
        reasonCodes: ["approval_context_changed"],
      } as any,
      previousEventHash: first.jsonlEvent.integrity.eventHash,
      approvalState: "context_changed",
      outcome: "blocked",
    });

    expect(
      verifyBrowserPolicyAuditChain([first.jsonlEvent, second.jsonlEvent]),
    ).toEqual({
      valid: true,
      failedAtTraceId: null,
    });
  });

  it("preserves distinct approval-state reason codes for incident review", () => {
    const states = [
      { approvalState: "context_changed", reasonCode: "approval_context_changed" },
      { approvalState: "revoked", reasonCode: "approval_revoked" },
      { approvalState: "expired", reasonCode: "approval_expired" },
      { approvalState: "rejected", reasonCode: "approval_rejected" },
    ] as const;

    const actual = states.map((entry) =>
      buildBrowserPolicyAuditArtifacts({
        decision: {
          ...decision,
          traceId: `trace-${entry.approvalState}`,
          reasonCodes: [entry.reasonCode],
        } as any,
        approvalState: entry.approvalState,
        outcome: "blocked",
      }).dbRecord.reasonCodes[0],
    );

    expect(actual).toEqual(states.map((entry) => entry.reasonCode));
  });
});
