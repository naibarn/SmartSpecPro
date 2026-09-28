import { describe, expect, it } from "vitest";
import { planCharacterRoleBackfill } from "../backfill-vertical-drama-character-roles";

describe("planCharacterRoleBackfill", () => {
  it("maps explicit narrative labels but leaves occupation-only roles for review", () => {
    const repairs = planCharacterRoleBackfill([
      {
        id: 1,
        seriesId: 7,
        characterKey: "heroine",
        role: "นางเอก",
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleProvenance: null,
        roleReviewStatus: null,
      },
      {
        id: 2,
        seriesId: 7,
        characterKey: "ceo",
        role: "ซีอีโอหญิง",
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleProvenance: null,
        roleReviewStatus: null,
      },
    ]);

    expect(repairs[0]?.after).toMatchObject({
      narrativeRole: "protagonist",
      roleTier: "lead_female",
      roleProvenance: "migrated",
      roleReviewStatus: "ready",
    });
    expect(repairs[1]?.after).toMatchObject({
      narrativeRole: null,
      roleTier: null,
      occupation: "ซีอีโอหญิง",
      roleReviewStatus: "needs_role_review",
    });
  });

  it("never overwrites a user-confirmed role", () => {
    expect(planCharacterRoleBackfill([
      {
        id: 3,
        seriesId: 7,
        characterKey: "lead",
        role: "ซีอีโอหญิง",
        narrativeRole: "protagonist",
        roleTier: "lead_female",
        occupation: "ซีอีโอหญิง",
        roleProvenance: "user_confirmed",
        roleReviewStatus: "ready",
      },
    ])).toEqual([]);
  });
});
