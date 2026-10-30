import { describe, expect, it } from "vitest";
import { selectInspectorRun } from "./UnifiedWorkspaceInspector";

describe("selectInspectorRun", () => {
  const runs = [
    { id: "old-run", status: "succeeded" },
    { id: "active-run", status: "running" },
  ];

  it("selects only the explicitly requested Run", () => {
    expect(selectInspectorRun(runs, "old-run")?.id).toBe("old-run");
    expect(selectInspectorRun(runs, "missing-run")).toBeNull();
  });

  it("shows the active Run in the selected conversation when no Run is requested", () => {
    expect(selectInspectorRun(runs)?.id).toBe("active-run");
    expect(selectInspectorRun([])).toBeNull();
  });
});
