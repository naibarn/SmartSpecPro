import { describe, expect, it } from "vitest";

import { reconcileFeature192Migrations } from "../verify-feature-192-migrations";

describe("Feature 192 migration reconciliation", () => {
  it("uses the journal as authority and reports unjournaled SQL without treating it as applied", () => {
    const result = reconcileFeature192Migrations();
    expect(result.authority).toBe("drizzle-journal");
    expect(result.journalEntries.length).toBeGreaterThan(0);
    expect(result.journalFilesPresent.length).toBe(result.journalEntries.length);
    expect(result.mutatesDatabase).toBe(false);
    expect(result.callsExternalProvider).toBe(false);
    expect(result.ok).toBe(true);
  });
});
