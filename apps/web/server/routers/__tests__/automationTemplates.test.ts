/**
 * Tests for automationTemplates schema definition.
 */

import { describe, it, expect } from "vitest";

describe("automationTemplates schema", () => {
  it("has correct column definitions", async () => {
    const { automationTemplates } = await import("../../../drizzle/schema");

    // Verify the table object exists and has expected column names
    const columnNames = Object.keys(automationTemplates);

    // Core columns
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("tenantId");
    expect(columnNames).toContain("userId");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("description");
    expect(columnNames).toContain("intent");
    expect(columnNames).toContain("scripts");
    expect(columnNames).toContain("thumbnailUrl");
    expect(columnNames).toContain("isPublic");
    expect(columnNames).toContain("usageCount");
    expect(columnNames).toContain("lastUsedAt");
    expect(columnNames).toContain("createdAt");
    expect(columnNames).toContain("updatedAt");
  });

  it("exports inferred types", async () => {
    const schema = await import("../../../drizzle/schema");

    // Verify that the type exports exist (TypeScript compile-time check)
    type AT = typeof schema.AutomationTemplate;
    type IAT = typeof schema.InsertAutomationTemplate;

    // The table symbol should be accessible
    expect(schema.automationTemplates).toBeDefined();
  });
});
