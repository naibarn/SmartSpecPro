import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(
  join(import.meta.dirname, "../WorkflowStudioPage.tsx"),
  "utf8"
);
const app = readFileSync(join(import.meta.dirname, "../../App.tsx"), "utf8");

describe("retired Workflow Studio runtime wiring", () => {
  it("keeps the three attached mockup surfaces represented", () => {
    expect(page).toContain('data-testid="workflow-studio-builder"');
    expect(page).toContain('data-testid="workflow-studio-run"');
    expect(page).toContain('aria-label="Selected node inspector"');
    expect(page).toContain('aria-label="Workflow run and debug drawer"');
    expect(page).toContain("studio.compatibleSources");
    expect(page).toContain('role="tablist"');
    expect(page).toContain("studio.errors");
    expect(page).toContain("latestPreview");
  });

  it("does not load or expose Workflow Studio in the application router", () => {
    expect(app).not.toContain("WorkflowStudioPage");
    expect(app).not.toContain('<Route path="/studio/workflow');
    expect(app).not.toContain('<Route path="/workflows"');
  });
});
