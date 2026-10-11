import { describe, expect, it } from "vitest";
import { PROJECT_WIKI_CANDIDATE, PROJECT_WIKI_MIGRATION_PLAN } from "./projectWikiReleaseCandidate";
import { projectWikiProvisioningIntentMatchesTenant, projectWikiStagingProvisioningRequestSchema } from "./projectWikiStagingProvisioning";

const request = {
  schemaVersion: "project-wiki-staging-provisioning/v1",
  environment: "staging",
  provider: "cloudflare",
  identity: {
    tenantId: "5dfd9884-8a9c-4af7-9996-48a3f45e976f",
    projectId: "025fecc2-b251-48c7-a261-2e5f440ace70",
    appId: PROJECT_WIKI_CANDIDATE.appId,
  },
  target: {
    accountScope: "smartaihub-staging",
    deploymentTargetName: "wiki-staging",
    containerApplicationName: "smartspec-web-staging",
    hostRevision: "a".repeat(40),
    hostImage: `registry.example/smartspec-web@sha256:${"b".repeat(64)}`,
    isolation: "dedicated-staging",
  },
  database: {
    provider: "postgresql",
    desiredName: "wiki_staging_db",
    desiredRegion: "us-east",
    recoveryPolicy: "encrypted-backup-and-restore-rehearsal",
    migrationPlan: PROJECT_WIKI_MIGRATION_PLAN,
  },
};

describe("Project Wiki staging provisioning approval contract", () => {
  it("accepts exact isolated staging scope and migration plan", () => {
    expect(projectWikiStagingProvisioningRequestSchema.parse(request)).toEqual(request);
  });

  it("rejects non-staging scope, non-pinned images, and changed migrations", () => {
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, environment: "production" }).success).toBe(false);
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, target: { ...request.target, hostImage: "registry.example/latest" } }).success).toBe(false);
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, database: { ...request.database, migrationPlan: request.database.migrationPlan.map((item, index) => index ? item : { ...item, sha256: "0".repeat(64) }) } }).success).toBe(false);
  });

  it("uses desired resource names instead of pre-provisioning provider IDs", () => {
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, target: { ...request.target, deploymentTargetId: "not-yet-created" } }).success).toBe(false);
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, database: { ...request.database, databaseId: "not-yet-created" } }).success).toBe(false);
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, target: { ...request.target, accountScope: "" } }).success).toBe(false);
    expect(projectWikiStagingProvisioningRequestSchema.safeParse({ ...request, database: { ...request.database, password: "secret" } }).success).toBe(false);
  });

  it("matches approval scope to the authenticated tenant", () => {
    const parsed = projectWikiStagingProvisioningRequestSchema.parse(request);
    expect(projectWikiProvisioningIntentMatchesTenant(parsed, parsed.identity.tenantId)).toBe(true);
    expect(projectWikiProvisioningIntentMatchesTenant(parsed, "different-tenant")).toBe(false);
    expect(projectWikiProvisioningIntentMatchesTenant(parsed, null)).toBe(false);
  });
});
