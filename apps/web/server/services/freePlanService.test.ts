import { describe, expect, it } from "vitest";

import {
  addOneMonth,
  getDueMonthlyCycles,
  isSystemManagedUser,
  shouldPreservePaidEntitlement,
} from "./freePlanService";

describe("freePlanService", () => {
  it("excludes system admins and agents from Free plan assignment", () => {
    expect(isSystemManagedUser({ role: "admin", isSystemUser: false })).toBe(
      true
    );
    expect(
      isSystemManagedUser({ role: "system_agent", isSystemUser: false })
    ).toBe(true);
    expect(isSystemManagedUser({ role: "user", isSystemUser: true })).toBe(
      true
    );
    expect(isSystemManagedUser({ role: "user", isSystemUser: false })).toBe(
      false
    );
  });

  it("preserves an existing paid plan", () => {
    expect(shouldPreservePaidEntitlement({ plan: "pro" })).toBe(true);
    expect(shouldPreservePaidEntitlement({ plan: "enterprise" })).toBe(true);
    expect(shouldPreservePaidEntitlement({ plan: "free" })).toBe(false);
  });

  it("calculates monthly cycles without granting before the period ends", () => {
    const periodEnd = new Date("2026-02-15T00:00:00.000Z");
    expect(
      getDueMonthlyCycles(periodEnd, new Date("2026-02-14T23:59:59.999Z"))
    ).toEqual([]);

    const expiredPeriodEnd = new Date("2026-01-15T00:00:00.000Z");
    const cycles = getDueMonthlyCycles(
      expiredPeriodEnd,
      new Date("2026-03-14T23:59:59.999Z")
    );
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toEqual({
      cycleStart: expiredPeriodEnd,
      cycleEnd: new Date("2026-02-15T00:00:00.000Z"),
    });
    expect(cycles[1]).toEqual({
      cycleStart: new Date("2026-02-15T00:00:00.000Z"),
      cycleEnd: new Date("2026-03-15T00:00:00.000Z"),
    });
  });

  it("adds one month in UTC", () => {
    expect(addOneMonth(new Date("2026-01-31T12:00:00.000Z"))).toEqual(
      new Date("2026-02-28T12:00:00.000Z")
    );
  });
});
