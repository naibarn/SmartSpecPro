import { beforeEach, describe, expect, it } from "vitest";

import { listWorkpackExceptionInbox, normalizeWorkpackException, resolveWorkpackException } from "../workpackExceptionService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore } from "../workpackPersistence";

describe("workpackExceptionService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("normalizes raw failures into a unified workpack exception shape", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Store keeper daily count",
      goal: "Count inventory discrepancies",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "Inventory SOP",
          sourceText: "Compare inventory movement and reconcile variances.",
        },
      ],
    });

    const exceptionRecord = await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "schema_mismatch",
      reasonCode: "field_drift",
      title: "Schema drift",
      summary: "Vendor portal field names changed",
      remediationPointer: "/workpacks/test/connectors",
      nextAction: "Refresh field mappings",
      mismatchCategory: "schema_mismatch",
    });

    expect(exceptionRecord.reasonCode).toBe("field_drift");
    expect(exceptionRecord.mismatchCategory).toBe("schema_mismatch");
  });

  it("groups open exceptions into an inbox and supports resolution", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "HR onboarding",
      goal: "Prepare onboarding packet",
      domainPack: "hr_ops",
      sources: [
        {
          type: "document",
          title: "Onboarding SOP",
          sourceText: "Create onboarding checklist and HRIS record.",
        },
      ],
    });

    const first = await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "ambiguity",
      reasonCode: "needs_clarification",
      title: "Clarification required",
      summary: "Missing start date",
      remediationPointer: "/workpacks/test",
      nextAction: "Request start date",
    });
    await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "ambiguity",
      reasonCode: "needs_clarification",
      title: "Clarification required",
      summary: "Manager name missing",
      remediationPointer: "/workpacks/test",
      nextAction: "Request manager name",
    });

    const inbox = await listWorkpackExceptionInbox(draft.workpack.id);
    expect(inbox[0]?.count).toBe(2);

    const resolved = await resolveWorkpackException(first.id);
    expect(resolved.resolvedAt).not.toBeNull();
  });
});
