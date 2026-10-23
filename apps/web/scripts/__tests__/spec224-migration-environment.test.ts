import { describe, expect, it } from "vitest";
import { evaluateSpec224MigrationEnvironmentGate } from "../verify-spec224-migration-environment";

const ownerTeamId = "567890";
const environment = {
  name: "production",
  protection_rules: [
    {
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [{ type: "Team", reviewer: { id: Number(ownerTeamId) } }],
    },
  ],
  deployment_branch_policy: { custom_branch_policies: true },
};
const branchPolicies = {
  total_count: 1,
  branch_policies: [{ name: "main", type: "branch" }],
};

describe("SPEC-224 production migration environment gate", () => {
  it("allows only the configured Database Owner team with non-self review and main-only deployment", () => {
    expect(
      evaluateSpec224MigrationEnvironmentGate({
        environment,
        branchPolicies,
        expectedOwnerTeamId: ownerTeamId,
      })
    ).toEqual({ status: "READY" });
  });

  it.each([
    [
      "missing Database Owner team",
      "",
      environment,
      branchPolicies,
      "database_owner_team_id_missing_or_invalid",
    ],
    [
      "unprotected environment",
      ownerTeamId,
      { ...environment, protection_rules: [] },
      branchPolicies,
      "production_required_reviewer_rule_missing_or_ambiguous",
    ],
    [
      "self-review enabled",
      ownerTeamId,
      {
        ...environment,
        protection_rules: [
          { ...environment.protection_rules[0], prevent_self_review: false },
        ],
      },
      branchPolicies,
      "production_self_review_not_prevented",
    ],
    [
      "wrong reviewer",
      ownerTeamId,
      {
        ...environment,
        protection_rules: [
          {
            ...environment.protection_rules[0],
            reviewers: [{ type: "Team", reviewer: { id: 123 } }],
          },
        ],
      },
      branchPolicies,
      "production_reviewer_is_not_the_database_owner_team",
    ],
    [
      "extra reviewer",
      ownerTeamId,
      {
        ...environment,
        protection_rules: [
          {
            ...environment.protection_rules[0],
            reviewers: [
              ...environment.protection_rules[0].reviewers,
              { type: "User", reviewer: { id: 1 } },
            ],
          },
        ],
      },
      branchPolicies,
      "production_reviewer_is_not_the_database_owner_team",
    ],
    [
      "additional deployment branch",
      ownerTeamId,
      environment,
      {
        total_count: 2,
        branch_policies: [
          { name: "main", type: "branch" },
          { name: "release/*", type: "branch" },
        ],
      },
      "production_branch_allowlist_must_be_main_only",
    ],
  ])(
    "fails closed for %s",
    (
      _name,
      expectedOwnerTeamId,
      environmentInput,
      branchPoliciesInput,
      reason
    ) => {
      const result = evaluateSpec224MigrationEnvironmentGate({
        environment: environmentInput as typeof environment,
        branchPolicies: branchPoliciesInput as typeof branchPolicies,
        expectedOwnerTeamId: String(expectedOwnerTeamId),
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.status === "BLOCKED" ? result.reasons : []).toContain(
        reason
      );
    }
  );
});
