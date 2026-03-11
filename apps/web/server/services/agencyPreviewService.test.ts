import { describe, it, expect } from "vitest";
import { buildAgencyPreview, type PreviewArtifactLifecycleState } from "./agencyPreviewService";
import type { RunResult } from "./agencyBridge";

function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: "run-1",
    status: "completed",
    response: "Research preview ready.",
    creditsUsed: 0,
    durationMs: 500,
    stepAttemptSnapshots: [],
    structuredResult: {
      version: "1.0",
      intent: "research_report",
      summary: "Research preview ready.",
      payload: {
        title: "Market scan",
        executive_summary: "The market is moving quickly.",
        sections: [
          {
            heading: "Overview",
            content: "Demand continues to rise.",
            sources: ["doc-1"],
          },
        ],
        key_findings: ["Demand is rising"],
        recommendations: ["Expand distribution"],
      },
      artifacts: [{ artifact_type: "report", title: "Market scan" }],
      references: [
        {
          document_id: "doc-1",
          chunk_id: "chunk-1",
          title: "Quarterly demand report",
          url: "https://example.com/report",
        },
      ],
      metrics: {},
    },
    previewArtifacts: [
      {
        id: "artifact-1",
        intent: "research_report",
        artifact_type: "report",
        state: "preview_generated",
        summary: "Research preview ready.",
        commit_status: "not_committed",
        commit_token: "commit-token-1",
        payload_json: {
          title: "Market scan",
          executive_summary: "The market is moving quickly.",
          sections: [
            {
              heading: "Overview",
              content: "Demand continues to rise.",
              sources: ["doc-1"],
            },
          ],
          key_findings: ["Demand is rising"],
          recommendations: ["Expand distribution"],
        },
        provenance_json: [
          {
            document_id: "doc-1",
            chunk_id: "chunk-1",
            title: "Quarterly demand report",
            url: "https://example.com/report",
          },
        ],
        payload_storage_key: null,
        committed_at: null,
        expired_at: null,
      },
    ],
    ...overrides,
  };
}

describe("agencyPreviewService", () => {
  it("maps research previews into a stable DTO with lifecycle and provenance", () => {
    const preview = buildAgencyPreview(makeRunResult());

    expect(preview).not.toBeNull();
    expect(preview?.previewType).toBe("research");
    expect(preview?.lifecycleState).toBe<PreviewArtifactLifecycleState>("preview_generated");
    expect(preview?.summaryText).toBe("Research preview ready.");
    expect(preview?.commit.available).toBe(true);
    expect(preview?.provenance).toEqual([
      expect.objectContaining({
        documentId: "doc-1",
        chunkId: "chunk-1",
        title: "Quarterly demand report",
        url: "https://example.com/report",
      }),
    ]);
    expect(preview?.data).toEqual(
      expect.objectContaining({
        title: "Market scan",
        keyFindings: ["Demand is rising"],
      }),
    );
  });

  it("treats expired previews as readable but non-committable", () => {
    const preview = buildAgencyPreview(
      makeRunResult({
        previewArtifacts: [
          {
            ...makeRunResult().previewArtifacts[0]!,
            expired_at: "2026-03-10T00:00:00.000Z",
          },
        ],
      }),
      new Date("2026-03-11T00:00:00.000Z"),
    );

    expect(preview?.lifecycleState).toBe<PreviewArtifactLifecycleState>("expired_preview");
    expect(preview?.commit.available).toBe(false);
  });

  it("resolves oversized payload indirection through the run structured result", () => {
    const preview = buildAgencyPreview(
      makeRunResult({
        previewArtifacts: [
          {
            ...makeRunResult().previewArtifacts[0]!,
            payload_json: null,
            payload_storage_key: "run_structured_result_payload",
          },
        ],
      }),
    );

    expect(preview?.audit.payloadMode).toBe("run_structured_result");
    expect(preview?.data).toEqual(
      expect.objectContaining({
        title: "Market scan",
      }),
    );
  });
});
