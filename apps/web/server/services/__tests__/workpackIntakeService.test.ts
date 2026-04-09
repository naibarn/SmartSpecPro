import { beforeEach, describe, expect, it } from "vitest";

import { createDraftWorkpack } from "../workpackIntakeService";
import { getWorkpackDetail, resetWorkpackStore } from "../workpackPersistence";

describe("createDraftWorkpack", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("creates traceable playbook and workpack drafts from structured sources", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Daily Ticket Triage",
      goal: "Classify tickets and route them automatically",
      sources: [
        {
          type: "sop",
          title: "Support SOP",
          sourceText: "Review inbound support tickets, classify urgency, route to the correct queue, and notify the requester.",
        },
      ],
    });

    expect(draft.workpack.domainPack).toBe("support_ops");
    expect(draft.playbook.steps.length).toBeGreaterThan(0);
    expect(getWorkpackDetail(draft.workpack.id)?.caseSources).toHaveLength(1);
  });

  it("marks low-confidence drafts as clarification-needed", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Unclear Draft",
      goal: "Help",
      sources: [
        {
          type: "chat_thread",
          title: "Short note",
          sourceText: "todo",
        },
      ],
    });

    expect(draft.workpack.lifecycleState).toBe("clarification_needed");
  });
});
