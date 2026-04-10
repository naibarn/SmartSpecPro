import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { refreshConnectorIntrospections, validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore } from "../workpackPersistence";

describe("workpackConnectorService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("auto-discovers tenant connector posture from existing tenant evidence", async () => {
    const source = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support triage source",
      goal: "Route support tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route each support request.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: source.workpack.id });
    await refreshConnectorIntrospections({
      workpackId: source.workpack.id,
      metadataByFamily: {
        helpdesk: {
          availableFields: ["record_id", "status", "summary", "ticket_id", "priority"],
          fieldTypes: {
            record_id: "string",
            status: "string",
            summary: "string",
            ticket_id: "string",
            priority: "string",
          },
          grantedScopes: ["helpdesk:read", "helpdesk:write"],
          supportsIdempotency: true,
          status: "healthy",
        },
        knowledge_base: {
          availableFields: ["record_id", "status", "summary", "article_id"],
          fieldTypes: {
            record_id: "string",
            status: "string",
            summary: "string",
            article_id: "string",
          },
          grantedScopes: ["knowledge_base:read", "knowledge_base:write"],
          supportsIdempotency: true,
          status: "healthy",
        },
        chat: {
          availableFields: ["record_id", "status", "summary", "thread_id"],
          fieldTypes: {
            record_id: "string",
            status: "string",
            summary: "string",
            thread_id: "string",
          },
          grantedScopes: ["chat:read", "chat:write"],
          supportsIdempotency: true,
          status: "healthy",
        },
      },
    });

    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support triage reuse",
      goal: "Route support tickets from another queue",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP 2",
          sourceText: "Classify and route each support request with the same connector posture.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const result = await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
    });

    expect(result.blocked).toBe(false);
    expect(result.connectorMaps.length).toBeGreaterThan(0);
    expect(result.connectorMaps.every((connectorMap) => connectorMap.validationStatus === "validated")).toBe(true);
  });

  it("fails closed when discovery cannot recover required scopes", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Sales follow-up",
      goal: "Update CRM after inbound lead",
      domainPack: "sales_ops",
      sources: [
        {
          type: "document",
          title: "CRM flow",
          sourceText: "Update CRM and send follow-up.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const result = await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.connectorMaps.some((connectorMap) => connectorMap.validationStatus === "blocked")).toBe(true);
  });
});
