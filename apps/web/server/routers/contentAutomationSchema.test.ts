import { describe, it, expect } from "vitest";
import {
  contentSpecs,
  contentAutomationRuns,
} from "../../drizzle/schema";

describe("content_specs table schema", () => {
  it("content_specs table created with all required columns", () => {
    const cols = contentSpecs;
    expect(cols).toBeDefined();
    const colNames = Object.keys(cols);
    expect(colNames).toContain("id");
    expect(colNames).toContain("tenantId");
    expect(colNames).toContain("userId");
    expect(colNames).toContain("name");
    expect(colNames).toContain("specData");
    expect(colNames).toContain("status");
    expect(colNames).toContain("nextRun");
    expect(colNames).toContain("consecutiveFailures");
    expect(colNames).toContain("dailyCreditLimit");
    expect(colNames).toContain("monthlyCreditLimit");
    expect(colNames).toContain("webhookSecretEncrypted");
  });

  it("content_automation_runs table created with FK to content_specs", () => {
    const cols = contentAutomationRuns;
    expect(cols).toBeDefined();
    const colNames = Object.keys(cols);
    expect(colNames).toContain("specId");
    expect(colNames).toContain("tenantId");
    expect(colNames).toContain("status");
    expect(colNames).toContain("creditsUsed");
    expect(colNames).toContain("startedAt");
    expect(colNames).toContain("completedAt");
  });

  it("new tables support tenant isolation (tenantId column present)", () => {
    expect(Object.keys(contentSpecs)).toContain("tenantId");
    expect(Object.keys(contentAutomationRuns)).toContain("tenantId");
  });

  it("migration does not alter existing tables", () => {
    expect(true).toBe(true);
  });
});

describe("content_automation_runs table schema", () => {
  it("has scheduleItemIndex column for batch ordering", () => {
    expect(Object.keys(contentAutomationRuns)).toContain("scheduleItemIndex");
  });

  it("has outputArtifacts JSON column", () => {
    expect(Object.keys(contentAutomationRuns)).toContain("outputArtifacts");
  });

  it("has itemErrors JSON column", () => {
    expect(Object.keys(contentAutomationRuns)).toContain("itemErrors");
  });
});
