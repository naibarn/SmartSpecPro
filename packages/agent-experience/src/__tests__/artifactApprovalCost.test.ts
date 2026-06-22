import { describe, expect, it } from "vitest";
import {
  approvalRecordToAgentEvents,
  artifactRecordToAgentEvents,
  costRecordToAgentEvents,
} from "../index";

describe("artifact, approval, and cost adapters", () => {
  it("maps artifact records as pointers only", () => {
    const result = artifactRecordToAgentEvents({
      artifactId: "artifact-1",
      tenantId: "tenant-1",
      title: "Draft",
      format: "markdown",
      version: 2,
      preview: "Short summary",
    });

    expect(result.dropped).toEqual([]);
    expect(result.events[0]?.payload).toMatchObject({
      kind: "artifact",
      artifact: { artifactId: "artifact-1", title: "Draft", format: "markdown" },
    });

    expect(artifactRecordToAgentEvents({
      artifactId: "artifact-1",
      tenantId: "tenant-1",
      content: "<script>alert(1)</script>",
    }).dropped[0]?.reason).toBe("unsafe_payload");
  });

  it("normalizes rejected approvals to denied and requires backend confirmation", () => {
    expect(approvalRecordToAgentEvents({
      approvalId: "approval-1",
      tenantId: "tenant-1",
      decision: "rejected",
      backendConfirmed: true,
    }).events[0]?.payload).toMatchObject({
      kind: "approval",
      approval: { status: "denied", sourceDecision: "rejected" },
    });

    expect(approvalRecordToAgentEvents({
      approvalId: "approval-2",
      tenantId: "tenant-1",
      decision: "approved",
      backendConfirmed: false,
    }).dropped[0]?.message).toMatch(/backend confirmation/i);
  });

  it("keeps cost estimates advisory and finalized cost server-owned", () => {
    expect(costRecordToAgentEvents({
      costId: "cost-1",
      tenantId: "tenant-1",
      amount: 0.25,
      currency: "USD",
      approximate: true,
    }).events[0]?.type).toBe("cost.estimate");

    expect(costRecordToAgentEvents({
      costId: "cost-2",
      tenantId: "tenant-1",
      amount: 0.25,
      currency: "USD",
      finalized: true,
      serverOwned: false,
    }).dropped[0]?.reason).toBe("unsafe_payload");

    expect(costRecordToAgentEvents({
      costId: "cost-3",
      tenantId: "tenant-1",
      amount: 0.25,
      currency: "USD",
      finalized: true,
      serverOwned: true,
    }).events[0]?.type).toBe("cost.finalized");
  });
});
