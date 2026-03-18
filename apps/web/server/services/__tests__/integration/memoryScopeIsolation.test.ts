/**
 * Integration Test: Memory Scope Isolation
 *
 * Tests that scoped memories respect visibility and owner isolation.
 */

import { describe, it, expect } from "vitest";
import { SCOPE_PRIORITY, getDefaultVisibility, computeRecencyFactor } from "../../scopedMemoryService";

describe("Memory Scope Isolation (integration)", () => {
  it("SCOPE_PRIORITY gives agent highest priority", () => {
    expect(SCOPE_PRIORITY.agent).toBeGreaterThan(SCOPE_PRIORITY.team);
    expect(SCOPE_PRIORITY.team).toBeGreaterThan(SCOPE_PRIORITY.user);
  });

  it("getDefaultVisibility returns private for agent owner type", () => {
    expect(getDefaultVisibility("agent")).toBe("private");
  });

  it("getDefaultVisibility returns shared_team for team owner type", () => {
    expect(getDefaultVisibility("team")).toBe("shared_team");
  });

  it("computeRecencyFactor decays over time", () => {
    const recent = computeRecencyFactor(new Date());
    const old = computeRecencyFactor(new Date(Date.now() - 30 * 86_400_000));
    expect(recent).toBeGreaterThan(old);
  });
});
