import type { MigrationEvidence } from "./drizzleMigrationEvidence";

export type ProjectWikiHostedRouteOutcome =
  | "HOST_COMPATIBILITY_VERIFIED"
  | "TARGET_AUTHORITY_REQUIRED"
  | "TARGET_INCOMPATIBLE"
  | "DATABASE_AUTHORITY_REQUIRED"
  | "MIGRATION_RECOVERY_REQUIRED"
  | "TRUSTED_EVIDENCE_REQUIRED"
  | "READY_FOR_AUTHORIZED_STAGING";

export type ProjectWikiHostedRoutePreflight = {
  schemaVersion: "project-wiki-hosted-route-preflight.v1";
  appId: "app_project_wiki_pages";
  sourceRevision: string | null;
  hostRequirement: "smartspec-web";
  localHostCompatibility: "VERIFIED" | "UNKNOWN";
  stagingTarget: "AUTHORIZED" | "REQUIRED" | "INCOMPATIBLE";
  dedicatedDatabase: "AUTHORIZED" | "REQUIRED";
  migration: {
    sourcePath: "apps/web/drizzle/0394_project_wiki_pages_mini_app.sql";
    expectedSha256: string;
    prerequisites: readonly ["0392_spec304_app_identity_and_route_aliases", "0393_spec302_canonical_project_identity"];
    evidenceStatus: MigrationEvidence["status"] | "UNKNOWN";
    migration0394: "APPLIED" | "PENDING" | "UNKNOWN";
    reverseSqlMigration: "UNSUPPORTED";
    stagingRecoveryPolicy: "AUTHORIZED" | "REQUIRED";
  };
  trustedEvidenceVerifier: "AVAILABLE" | "REQUIRED";
  provenance: {
    sourceRevision: "runtime.release_or_commit_sha" | "UNAVAILABLE";
    localHostCompatibility: "local_host_acceptance" | "NOT_OBSERVED";
    stagingTargets: "provider_deployment_targets" | "NOT_OBSERVED";
    stagingDatabase: "NOT_OBSERVED";
    trustedEvidenceVerifier: "NOT_OBSERVED" | "authorized_verifier_registry";
  };
  outcomes: ProjectWikiHostedRouteOutcome[];
};

const SOURCE_SHA = /^[a-f0-9]{40}$/;
export const PROJECT_WIKI_MIGRATION_0394 = {
  sourcePath: "apps/web/drizzle/0394_project_wiki_pages_mini_app.sql" as const,
  expectedSha256: "a49d23e221cdd2efac1ed426530e4d8643dc7446224c3959ab1f97ffa792afc7",
  prerequisites: ["0392_spec304_app_identity_and_route_aliases", "0393_spec302_canonical_project_identity"] as const,
};

/**
 * Summarize existing SmartAIHub evidence for Project Wiki's hosted-route deployment.
 * This is intentionally a preflight only: it never creates a target or authorizes a deploy.
 */
export function buildProjectWikiHostedRoutePreflight(input: {
  sourceRevision?: string | null;
  localHostCompatibilityVerified: boolean;
  targetInventoryObserved?: boolean;
  targetCompatibility?: "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";
  targetAuthorized: boolean;
  dedicatedDatabaseAuthorized: boolean;
  migration?: MigrationEvidence;
  stagingRecoveryPolicyAuthorized: boolean;
  trustedEvidenceVerifierAvailable: boolean;
}): ProjectWikiHostedRoutePreflight {
  const sourceRevision = input.sourceRevision && SOURCE_SHA.test(input.sourceRevision)
    ? input.sourceRevision
    : null;
  const appliedMigration = input.migration?.value?.observedAppliedHead;
  const pendingMigration = input.migration?.value?.pendingMigrations.find(item => item.tag === "0394_project_wiki_pages_mini_app");
  let migration0394: "APPLIED" | "PENDING" | "UNKNOWN" = "UNKNOWN";
  if (input.migration?.status === "OBSERVED") {
    if (appliedMigration?.tag === "0394_project_wiki_pages_mini_app" && appliedMigration.hash === PROJECT_WIKI_MIGRATION_0394.expectedSha256) {
      migration0394 = "APPLIED";
    } else if (pendingMigration?.hash === PROJECT_WIKI_MIGRATION_0394.expectedSha256) {
      migration0394 = "PENDING";
    } else if (!pendingMigration && ["APPLIED", "PARTIALLY_APPLIED"].includes(input.migration.value?.currentState ?? "UNKNOWN")) {
      migration0394 = "APPLIED";
    }
  }
  const targetCompatibility = input.targetCompatibility ?? "UNKNOWN";
  const stagingTarget = targetCompatibility === "INCOMPATIBLE"
    ? "INCOMPATIBLE" as const
    : input.targetAuthorized && targetCompatibility === "COMPATIBLE"
      ? "AUTHORIZED" as const
      : "REQUIRED" as const;
  const outcomes: ProjectWikiHostedRouteOutcome[] = [];

  if (input.localHostCompatibilityVerified && sourceRevision) outcomes.push("HOST_COMPATIBILITY_VERIFIED");
  if (!sourceRevision) outcomes.push("TRUSTED_EVIDENCE_REQUIRED");
  if (stagingTarget === "INCOMPATIBLE") outcomes.push("TARGET_INCOMPATIBLE");
  else if (stagingTarget === "REQUIRED") outcomes.push("TARGET_AUTHORITY_REQUIRED");
  if (!input.dedicatedDatabaseAuthorized) outcomes.push("DATABASE_AUTHORITY_REQUIRED");
  if (migration0394 !== "APPLIED" || !input.stagingRecoveryPolicyAuthorized) outcomes.push("MIGRATION_RECOVERY_REQUIRED");
  if (!input.trustedEvidenceVerifierAvailable && !outcomes.includes("TRUSTED_EVIDENCE_REQUIRED")) outcomes.push("TRUSTED_EVIDENCE_REQUIRED");

  const ready = outcomes.length === 1 && outcomes[0] === "HOST_COMPATIBILITY_VERIFIED" &&
    input.targetAuthorized && stagingTarget === "AUTHORIZED" && input.dedicatedDatabaseAuthorized &&
    migration0394 === "APPLIED" && input.stagingRecoveryPolicyAuthorized && input.trustedEvidenceVerifierAvailable;
  if (ready) outcomes.push("READY_FOR_AUTHORIZED_STAGING");

  return {
    schemaVersion: "project-wiki-hosted-route-preflight.v1",
    appId: "app_project_wiki_pages",
    sourceRevision,
    hostRequirement: "smartspec-web",
    localHostCompatibility: input.localHostCompatibilityVerified && sourceRevision ? "VERIFIED" : "UNKNOWN",
    stagingTarget,
    dedicatedDatabase: input.dedicatedDatabaseAuthorized ? "AUTHORIZED" : "REQUIRED",
    migration: {
      ...PROJECT_WIKI_MIGRATION_0394,
      evidenceStatus: input.migration?.status ?? "UNKNOWN",
      migration0394,
      reverseSqlMigration: "UNSUPPORTED",
      stagingRecoveryPolicy: input.stagingRecoveryPolicyAuthorized ? "AUTHORIZED" : "REQUIRED",
    },
    trustedEvidenceVerifier: input.trustedEvidenceVerifierAvailable ? "AVAILABLE" : "REQUIRED",
    provenance: {
      sourceRevision: sourceRevision ? "runtime.release_or_commit_sha" : "UNAVAILABLE",
      localHostCompatibility: input.localHostCompatibilityVerified ? "local_host_acceptance" : "NOT_OBSERVED",
      stagingTargets: input.targetInventoryObserved ? "provider_deployment_targets" : "NOT_OBSERVED",
      stagingDatabase: "NOT_OBSERVED",
      trustedEvidenceVerifier: input.trustedEvidenceVerifierAvailable ? "authorized_verifier_registry" : "NOT_OBSERVED",
    },
    outcomes,
  };
}
