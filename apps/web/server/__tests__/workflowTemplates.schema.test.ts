/**
 * Static schema introspection tests for Feature 017 column additions.
 * These verify the Drizzle schema definition object — not live DB state.
 */
import { describe, it, expect } from "vitest";
import { workflowTemplates } from "../../drizzle/schema";

describe("workflowTemplates schema — Feature 017 columns", () => {
  it("includes 'previewSvg' text column", () => {
    expect(workflowTemplates.previewSvg).toBeDefined();
  });

  it("includes 'industry' json column typed as string[]", () => {
    expect(workflowTemplates.industry).toBeDefined();
  });

  it("includes 'stepCount' integer column", () => {
    expect(workflowTemplates.stepCount).toBeDefined();
  });

  it("includes 'estimatedSetupMinutes' integer column", () => {
    expect(workflowTemplates.estimatedSetupMinutes).toBeDefined();
  });

  it("includes 'templateKey' varchar(50) column with unique constraint", () => {
    expect(workflowTemplates.templateKey).toBeDefined();
  });

  it("does NOT define 'usageCount' (correct name is downloadCount)", () => {
    expect(Object.keys(workflowTemplates)).not.toContain("usageCount");
  });

  it("retains existing 'tags' json column (not duplicated)", () => {
    expect(workflowTemplates.tags).toBeDefined();
  });

  it("retains existing 'downloadCount' column", () => {
    expect(workflowTemplates.downloadCount).toBeDefined();
  });
});
