import { beforeEach, describe, expect, it } from "vitest";

import { validateConnectorMaps } from "../workpackConnectorService";
import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore } from "../workpackPersistence";

describe("workpackConnectorService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("creates and validates typed connector maps", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support triage",
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
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const result = validateConnectorMaps({ workpackId: draft.workpack.id, emitExceptions: false });

    expect(result.blocked).toBe(false);
    expect(result.connectorMaps.length).toBeGreaterThan(0);
    expect(result.connectorMaps[0]?.validationStatus).toBe("validated");
  });

  it("fails closed when connector scopes are missing", () => {
    const draft = createDraftWorkpack({
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
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const result = validateConnectorMaps({
      workpackId: draft.workpack.id,
      metadataByFamily: {
        crm: {
          grantedScopes: ["crm:read"],
        },
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.connectorMaps.some((map) => map.validationStatus === "blocked")).toBe(true);
  });
});
