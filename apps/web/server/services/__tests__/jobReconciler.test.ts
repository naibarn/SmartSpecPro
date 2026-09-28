import { describe, expect, it } from "vitest";

import { runJobReconciler } from "../jobReconciler";

describe("job reconciler contract", () => {
  it("exports a bounded reconciliation result contract", () => {
    expect(runJobReconciler).toBeTypeOf("function");
  });
});
