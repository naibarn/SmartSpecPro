import { describe, expect, it } from "vitest";

import { assertSafetyActorContext, buildSafetyActorContext } from "./safetyActorContextService";

describe("safetyActorContextService", () => {
  it("builds human context from profile preferences", () => {
    const actor = buildSafetyActorContext({
      userId: 7,
      tenantId: 42,
      userPreferences: {
        safetyProfile: {
          dateOfBirth: "2000-01-01",
          countryOfResidence: "TH",
          profileVersion: 1,
        },
      },
    }, new Date("2026-07-02T00:00:00.000Z"));
    expect(actor.actorKind).toBe("human_user");
    expect(actor.tenantId).toBe("42");
    expect(actor.countryCode).toBe("TH");
    expect(assertSafetyActorContext(actor)).toEqual({ ok: true });
  });

  it("resolves delegated workers without fake DOBs when no owner profile is present", () => {
    const actor = buildSafetyActorContext({
      authMode: "delegated_worker",
      userId: 11,
      ownerUserId: 7,
      tenantId: "tenant-1",
      workerId: "worker-1",
      workerJobId: "job-1",
    }, new Date("2026-07-02T00:00:00.000Z"));
    expect(actor.actorKind).toBe("delegated_worker");
    expect(actor.ownerUserId).toBe(7);
    expect(actor.dateOfBirth).toBeNull();
  });
});
