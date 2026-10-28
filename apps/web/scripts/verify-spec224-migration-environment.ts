import { pathToFileURL } from "node:url";

type EnvironmentProtectionRule = {
  type?: string;
  prevent_self_review?: boolean;
  reviewers?: Array<{ type?: string; reviewer?: { id?: number | string } }>;
};

type GitHubEnvironment = {
  name?: string;
  protection_rules?: EnvironmentProtectionRule[];
  deployment_branch_policy?: { custom_branch_policies?: boolean } | null;
};

type BranchPolicies = {
  total_count?: number;
  branch_policies?: Array<{ name?: string; type?: string }>;
};

export type Spec224MigrationEnvironmentGate =
  { status: "READY" } | { status: "BLOCKED"; reasons: string[] };

export function evaluateSpec224MigrationEnvironmentGate(input: {
  environment: GitHubEnvironment;
  branchPolicies: BranchPolicies;
  expectedOwnerTeamId: string;
  expectedOwnerUserId: string;
}): Spec224MigrationEnvironmentGate {
  const reasons: string[] = [];
  const expectedTeamId = input.expectedOwnerTeamId.trim();
  const expectedUserId = input.expectedOwnerUserId.trim();
  const teamConfigured = expectedTeamId.length > 0;
  const userConfigured = expectedUserId.length > 0;
  const oneIdentityConfigured = Number(teamConfigured) + Number(userConfigured) === 1;
  const teamIdValid = teamConfigured && /^[1-9]\d*$/.test(expectedTeamId);
  const userIdValid = userConfigured && /^[1-9]\d*$/.test(expectedUserId);
  if (!oneIdentityConfigured || (!teamIdValid && !userIdValid)) {
    reasons.push("database_owner_identity_missing_ambiguous_or_invalid");
  }
  if (input.environment.name !== "production")
    reasons.push("production_environment_missing");
  if (
    input.environment.deployment_branch_policy?.custom_branch_policies !== true
  ) {
    reasons.push("production_branch_policy_not_restricted");
  }

  const reviewerRules = (input.environment.protection_rules ?? []).filter(
    rule => rule.type === "required_reviewers"
  );
  if (reviewerRules.length !== 1) {
    reasons.push("production_required_reviewer_rule_missing_or_ambiguous");
  } else {
    const rule = reviewerRules[0];
    if (rule.prevent_self_review !== true)
      reasons.push("production_self_review_not_prevented");
    const reviewers = rule.reviewers ?? [];
    const expectedReviewerType = teamConfigured ? "Team" : userConfigured ? "User" : "";
    const expectedReviewerId = teamConfigured ? expectedTeamId : expectedUserId;
    if (
      reviewers.length !== 1 ||
      reviewers[0]?.type !== expectedReviewerType ||
      String(reviewers[0]?.reviewer?.id ?? "") !== expectedReviewerId
    ) {
      reasons.push("production_reviewer_does_not_match_database_owner_identity");
    }
  }

  const policies = input.branchPolicies.branch_policies ?? [];
  if (
    input.branchPolicies.total_count !== 1 ||
    policies.length !== 1 ||
    policies[0]?.name !== "main" ||
    (policies[0]?.type != null && policies[0].type !== "branch")
  ) {
    reasons.push("production_branch_allowlist_must_be_main_only");
  }

  return reasons.length ? { status: "BLOCKED", reasons } : { status: "READY" };
}

function parseRequiredJson<T>(name: string, value: string | undefined): T {
  if (!value) throw new Error(`MIGRATION_ENVIRONMENT_CONTEXT_MISSING_${name}`);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`MIGRATION_ENVIRONMENT_CONTEXT_INVALID_${name}`);
  }
}

function runFromWorkflow(): void {
  const expectedOwnerTeamId = process.argv[2] ?? "";
  const expectedOwnerUserId = process.argv[3] ?? "";
  const environment = parseRequiredJson<GitHubEnvironment>(
    "GITHUB_ENVIRONMENT_JSON",
    process.env.SPEC224_GITHUB_ENVIRONMENT_JSON
  );
  const branchPolicies = parseRequiredJson<BranchPolicies>(
    "GITHUB_BRANCH_POLICIES_JSON",
    process.env.SPEC224_GITHUB_BRANCH_POLICIES_JSON
  );
  const result = evaluateSpec224MigrationEnvironmentGate({
    environment,
    branchPolicies,
    expectedOwnerTeamId,
    expectedOwnerUserId,
  });
  if (result.status === "BLOCKED") {
    console.error(
      `SPEC224_PRODUCTION_ENVIRONMENT_BLOCKED:${result.reasons.join(",")}`
    );
    process.exitCode = 1;
    return;
  }
  console.log("SPEC224_PRODUCTION_ENVIRONMENT_AUTHORITY_READY");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) runFromWorkflow();
