import { describe, expect, it } from "vitest";
import { evaluateSpec224MigrationEnvironmentGate } from "../verify-spec224-migration-environment";

const ownerTeamId = "567890";
const ownerUserId = "214854693";
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
        expectedOwnerUserId: "",
      })
    ).toEqual({ status: "READY" });
  });

  it("allows the configured individual Database Owner while retaining non-self review and main-only deployment", () => {
    const userEnvironment = {
      ...environment,
      protection_rules: [{
        ...environment.protection_rules[0],
        reviewers: [{ type: "User", reviewer: { id: Number(ownerUserId) } }],
      }],
    };
    expect(evaluateSpec224MigrationEnvironmentGate({
      environment: userEnvironment,
      branchPolicies,
      expectedOwnerTeamId: "",
      expectedOwnerUserId: ownerUserId,
    })).toEqual({ status: "READY" });
  });

  it.each([
    [
      "missing Database Owner identity",
      "",
      "",
      environment,
      branchPolicies,
      "database_owner_identity_missing_ambiguous_or_invalid",
    ],
    [
      "ambiguous Database Owner identity",
      ownerTeamId,
      ownerUserId,
      environment,
      branchPolicies,
      "database_owner_identity_missing_ambiguous_or_invalid",
    ],
    [
      "unprotected environment",
      ownerTeamId,
      "",
      { ...environment, protection_rules: [] },
      branchPolicies,
      "production_required_reviewer_rule_missing_or_ambiguous",
    ],
    [
      "self-review enabled",
      ownerTeamId,
      "",
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
      "",
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
      "production_reviewer_does_not_match_database_owner_identity",
    ],
    [
      "extra reviewer",
      ownerTeamId,
      "",
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
      "production_reviewer_does_not_match_database_owner_identity",
    ],
    [
      "individual owner configured but environment names a different user",
      "",
      ownerUserId,
      {
        ...environment,
        protection_rules: [{
          ...environment.protection_rules[0],
          reviewers: [{ type: "User", reviewer: { id: 1 } }],
        }],
      },
      branchPolicies,
      "production_reviewer_does_not_match_database_owner_identity",
    ],
    [
      "additional deployment branch",
      ownerTeamId,
      "",
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
      expectedOwnerUserId,
      environmentInput,
      branchPoliciesInput,
      reason
    ) => {
      const result = evaluateSpec224MigrationEnvironmentGate({
        environment: environmentInput as typeof environment,
        branchPolicies: branchPoliciesInput as typeof branchPolicies,
        expectedOwnerTeamId: String(expectedOwnerTeamId),
        expectedOwnerUserId: String(expectedOwnerUserId),
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.status === "BLOCKED" ? result.reasons : []).toContain(
        reason
      );
    }
  );
});
