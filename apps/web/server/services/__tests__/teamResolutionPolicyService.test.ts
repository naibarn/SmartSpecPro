import { describe, expect, it } from "vitest";

import { resolveTeamForAutomation } from "../teamResolutionPolicyService";

describe("teamResolutionPolicyService", () => {
  it("uses deterministic precedence before request defaults", () => {
    expect(resolveTeamForAutomation({
      caseOwnerType: "queue",
      caseOwnerId: "team-case",
      requestDefaultQueueId: "team-request",
    })).toEqual(expect.objectContaining({
      status: "resolved",
      code: "resolved_case_owner",
      teamId: "team-case",
    }));
  });

  it("uses request default owner after default queue", () => {
    expect(resolveTeamForAutomation({
      requestDefaultOwnerType: "queue",
      requestDefaultOwnerId: "team-owner",
    })).toEqual(expect.objectContaining({
      status: "resolved",
      code: "resolved_request_default_owner",
      teamId: "team-owner",
    }));
  });

  it("fails closed instead of silently returning an unresolved team", () => {
    expect(resolveTeamForAutomation({})).toEqual(expect.objectContaining({
      status: "blocked",
      code: "missing_team",
      teamId: null,
    }));
  });

  it("blocks unauthorized explicit overrides", () => {
    expect(resolveTeamForAutomation({
      explicitTeamId: "team-private",
      explicitTeamAuthorized: false,
      requestDefaultQueueId: "team-safe",
    })).toEqual(expect.objectContaining({
      status: "blocked",
      code: "unauthorized_team",
      teamId: "team-private",
    }));
  });
});
