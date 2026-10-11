import { describe, expect, it } from "vitest";
import { PROJECT_WIKI_CANDIDATE, PROJECT_WIKI_MIGRATION_PLAN } from "./projectWikiReleaseCandidate";
import { projectWikiStagingProvisioningRequestSchema } from "./projectWikiStagingProvisioning";

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
    deploymentTargetId: "wiki-staging",
    accountRef: "account-staging",
    containerApplicationRef: "smartspec-web-staging",
    hostRevision: "a".repeat(40),
    hostImage: `registry.example/smartspec-web@sha256:${"b".repeat(64)}`,
  },
  database: {
    provider: "postgresql",
    databaseId: "wiki-staging-db",
    databaseIdentity: "wiki-staging",
    region: "us-east",
    recoveryStrategyId: "wiki-staging-pitr",
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
});
