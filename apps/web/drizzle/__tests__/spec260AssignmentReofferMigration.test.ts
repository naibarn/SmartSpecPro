import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Spec 260 assignment re-offer migration", () => {
  it("replaces lifetime uniqueness with active assignment uniqueness", () => {
    const migration = readFileSync(new URL("../0370_spec260_assignment_reoffer_invariants.sql", import.meta.url), "utf8");
    expect(migration).toContain('DROP INDEX IF EXISTS "emergency_assignments_active_scope_unique"');
    expect(migration).toContain('"emergency_assignments_active_task_responder_unique"');
    expect(migration).toContain('"emergency_assignments_active_need_responder_unique"');
    expect(migration).toContain("'offered', 'accepted', 'en_route', 'working'");
  });
});
