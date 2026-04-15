import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { getWorkpackDetail, resetWorkpackStore, updateWorkpackRun } from "../workpackPersistence";
import { replayWorkpackRun } from "../workpackReplayService";
import { simulateWorkpack } from "../workpackSimulationService";

const supportConnectorMetadata = {
  crm: {
    availableFields: ["record_id", "status", "summary", "account_id", "opportunity_stage"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      account_id: "string",
      opportunity_stage: "string",
    },
    grantedScopes: ["crm:read", "crm:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
  email: {
    availableFields: ["record_id", "status", "summary", "recipient", "subject"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      recipient: "string",
      subject: "string",
    },
    grantedScopes: ["email:read", "email:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
  calendar: {
    availableFields: ["record_id", "status", "summary", "event_id", "start_at"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      event_id: "string",
      start_at: "date",
    },
    grantedScopes: ["calendar:read", "calendar:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
};

const procurementConnectorMetadata = {
  erp: {
    availableFields: ["record_id", "status", "summary", "amount", "currency", "approval_state"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      amount: "number",
      currency: "string",
      approval_state: "string",
    },
    grantedScopes: ["erp:read", "erp:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
  vendor_portal: {
    availableFields: ["record_id", "status", "summary", "quote_total", "vendor_name"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      quote_total: "number",
      vendor_name: "string",
    },
    grantedScopes: ["vendor_portal:read", "vendor_portal:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
  email: {
    availableFields: ["record_id", "status", "summary", "recipient", "subject"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      recipient: "string",
      subject: "string",
    },
    grantedScopes: ["email:read", "email:write"],
    supportsIdempotency: true,
    status: "healthy" as const,
  },
};

describe("workpackReplayService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("keeps replay inspection-only for stable runs", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Sales qualification",
      goal: "Review lead and prepare follow-up",
      domainPack: "sales_ops",
      sources: [
        {
          type: "document",
          title: "Lead SOP",
          sourceText: "Review lead quality, update CRM, and prepare follow-up.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: supportConnectorMetadata,
    });
    const simulation = await simulateWorkpack({ workpackId: draft.workpack.id });

    const replay = await replayWorkpackRun({
      workpackId: draft.workpack.id,
      simulationRunId: simulation.simulationRun.id,
    });

    expect(replay.inspectionMode).toBe("inspection_only");
    expect(replay.canReemitSideEffects).toBe(false);
    expect(replay.gateStatus).toBe("clean");
  });

  it("classifies drift categories separately", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Procurement compare",
      goal: "Compare supplier options and prepare approval packet",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "RFQ",
          sourceText: "Compare suppliers and prepare approval packet.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: procurementConnectorMetadata,
    });
    const simulation = await simulateWorkpack({ workpackId: draft.workpack.id });
    const detail = await getWorkpackDetail(draft.workpack.id);
    const runId = simulation.ledgerRunId;

    await updateWorkpackRun(runId, (run) => ({
      ...run,
      actualSteps: [
        ...run.actualSteps.slice(1),
        run.actualSteps[0]!,
      ].map((step, index) => index === 0
        ? {
            ...step,
            outputSummary: "layout changed and output no longer matches",
          }
        : step),
      connectorSummaries: [
        ...run.connectorSummaries.map((summary, index) => index === 0 ? { ...summary, status: "blocked" as const } : summary),
      ],
    }));

    const replay = await replayWorkpackRun({
      workpackId: draft.workpack.id,
      runId,
    });

    expect(replay.gateStatus).toBe("blocked");
    expect(replay.diffs.some((diff) => diff.category === "step_order_drift")).toBe(true);
    expect(replay.diffs.some((diff) => diff.category === "browser_layout_instability")).toBe(true);
    expect(replay.diffs.some((diff) => diff.category === "connector_auth_mismatch")).toBe(true);
    expect(detail?.workpack.id).toBe(draft.workpack.id);
  });
});
