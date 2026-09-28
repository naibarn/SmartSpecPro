import { describe, expect, it } from "vitest";
import * as schema from "../schema.js";

describe("Feature 207/209 runtime schema parity", () => {
  it("keeps generated JavaScript schema exports aligned with TypeScript additions", () => {
    for (const exportName of [
      "economicIntents",
      "economicBudgets",
      "economicHolds",
      "economicLedgerAccounts",
      "economicJournalEntries",
      "economicJournalLines",
      "economicEvents",
      "economicReconciliations",
      "workflowStudioDefinitions",
      "workflowStudioVersions",
      "workflowStudioViews",
      "workflowStudioApps",
      "workflowStudioRuns",
      "workflowStudioRunEvents",
      "workflowStudioCheckpoints",
    ]) {
      expect(schema[exportName as keyof typeof schema]).toBeDefined();
    }
  });
});
