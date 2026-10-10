import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AgentRuntimeResponseSchema,
  AgentRuntimeStepLinkSchema,
} from "../../../shared/agentRuntime/types";
import { projectTeamRuntimeResponse } from "../agentRuntime/teamProjection";
import type { AgentProgressInput } from "../agentRuntime/progressIntelligence";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, "fixtures", "agentRuntime");

function readJsonFixture<T>(filename: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, filename), "utf8"),
  ) as T;
}

describe("projectTeamRuntimeResponse", () => {
  it("shared fixtures parse in TypeScript", () => {
    const passResponse = AgentRuntimeResponseSchema.parse(
      readJsonFixture("pass-verdict-response.json"),
    );
    const needsRepairResponse = AgentRuntimeResponseSchema.parse(
      readJsonFixture("needs-repair-response.json"),
    );
    const stepLinks = readJsonFixture<unknown[]>("step-links.json").map(link =>
      AgentRuntimeStepLinkSchema.parse(link),
    );

    expect(passResponse.status).toBe("completed");
    expect(needsRepairResponse.reviewVerdict?.status).toBe("needs_repair");
    expect(stepLinks).toHaveLength(4);
  });

  it("projects a pass verdict into execution, review, and final-result records", () => {
    const projection = projectTeamRuntimeResponse({
      requestId: "req-pass-1",
      response: AgentRuntimeResponseSchema.parse(
        readJsonFixture("pass-verdict-response.json"),
      ),
    });

    expect(projection.executionStage).toMatchObject({
      stepKey: "plan-decompose",
      stageStatus: "approved",
      ownerMemberId: "member-owner",
      reviewerMemberId: "member-reviewer",
    });
    expect(projection.reviewRecord).toMatchObject({
      verdict: "pass",
      recommendation: "Proceed to the next step.",
    });
    expect(projection.finalResult).toMatchObject({
      status: "completed",
      terminalReason: "plan_completed",
      evidenceRefs: ["artifact://plan/approved"],
    });
  });

  it("keeps runtime completion partial until task-bound required evidence is verified", () => {
    const response = AgentRuntimeResponseSchema.parse(
      readJsonFixture("pass-verdict-response.json"),
    );
    const progressInput: Omit<AgentProgressInput, "executionStatus"> = {
      tenantId: "tenant-a",
      taskId: "run-a",
      recoveryStatus: "none",
      taskProfile: "standard",
      nowMs: 1_000,
      lastHeartbeatAtMs: 900,
      lastMeaningfulProgressAtMs: 900,
      stallWindowMsByTaskProfile: {
        interactive: 60_000,
        standard: 300_000,
        long_running: 1_800_000,
        provider_job: 900_000,
      },
      loopDetectionMinRepeats: 3,
      previousPeakProgress: 0,
      requiredCriteria: [
        {
          criterionId: "artifact-accepted",
          required: true,
          weight: 1,
          status: "verified",
          evidenceRefs: ["receipt:artifact-a"],
        },
      ],
      evidence: [],
      previousVerifiedEvidenceRefs: [],
      invalidatedEvidenceRefs: [],
      toolCalls: [],
    };

    const projection = projectTeamRuntimeResponse({
      requestId: "req-pass-1",
      response,
      progressInput,
    });

    expect(projection.finalResult?.status).toBe("completed");
    expect(projection.progressAssessment).toMatchObject({
      status: "PARTIAL",
      progress: 0,
      reasonCodes: ["outcome_evidence_missing"],
    });
  });

  it("marks completion only when the projected required criterion has verified evidence", () => {
    const response = AgentRuntimeResponseSchema.parse(
      readJsonFixture("pass-verdict-response.json"),
    );
    const projection = projectTeamRuntimeResponse({
      requestId: "req-pass-evidence-1",
      response,
      progressInput: {
        tenantId: "tenant-a",
        recoveryStatus: "none",
        taskProfile: "standard",
        nowMs: 1_000,
        lastHeartbeatAtMs: 900,
        lastMeaningfulProgressAtMs: 900,
        stallWindowMsByTaskProfile: {
          interactive: 60_000,
          standard: 300_000,
          long_running: 1_800_000,
          provider_job: 900_000,
        },
        loopDetectionMinRepeats: 3,
        previousPeakProgress: 0,
        requiredCriteria: [
          {
            criterionId: "artifact-accepted",
            required: true,
            weight: 1,
            status: "verified",
            evidenceRefs: ["receipt:artifact-a"],
          },
        ],
        evidence: [
          {
            tenantId: "tenant-a",
            evidenceRef: "receipt:artifact-a",
            kind: "accepted_receipt",
            status: "verified",
          },
        ],
        previousVerifiedEvidenceRefs: [],
        invalidatedEvidenceRefs: [],
        toolCalls: [],
      },
    });

    expect(projection.progressAssessment?.status).toBe("COMPLETED");
  });

  it("projects a needs-repair verdict without collapsing explicit repair links", () => {
    const projection = projectTeamRuntimeResponse({
      requestId: "req-repair-1",
      response: AgentRuntimeResponseSchema.parse(
        readJsonFixture("needs-repair-response.json"),
      ),
    });

    expect(projection.executionStage).toMatchObject({
      stepKey: "research-context",
      stageStatus: "needs_repair",
    });
    expect(projection.reviewRecord).toMatchObject({
      verdict: "needs_repair",
      issues: [
        "Need stronger evidence for the modern-vs-traditional comparison.",
      ],
    });
    expect(
      projection.messageMetadata?.stepLinks.map(link => link.linkType),
    ).toEqual(["review_result", "repair_result"]);
  });

  it("preserves step-link detail instead of collapsing everything into a plan summary link", () => {
    const response = AgentRuntimeResponseSchema.parse({
      ...readJsonFixture<Record<string, unknown>>("pass-verdict-response.json"),
      stepLinks: readJsonFixture("step-links.json"),
      stepId: "visual-direction",
      attemptId: "attempt-visual-1",
      status: "paused",
      reviewVerdict: null,
      terminalReason: null,
    });

    const projection = projectTeamRuntimeResponse({
      requestId: "req-step-links-1",
      response,
    });

    expect(
      projection.messageMetadata?.stepLinks.map(link => link.linkType),
    ).toEqual([
      "plan_step",
      "owner_result",
      "review_result",
      "repair_result",
    ]);
  });
});
