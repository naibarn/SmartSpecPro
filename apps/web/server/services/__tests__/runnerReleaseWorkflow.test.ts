import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.resolve(process.cwd(), "../../.github/workflows/runner-release.yml");

describe("runner release workflow contract", () => {
  it("selects the native matrix before the matrix job is evaluated", () => {
    const workflow = fs.readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("native_matrix");
    expect(workflow).toContain("fromJSON(needs.plan.outputs.native_matrix)");
    expect(workflow).not.toMatch(/if:.*matrix\.platform/);
  });
});
