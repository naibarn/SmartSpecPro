import { describe, expect, it } from "vitest";
import { PROJECT_WIKI_CANDIDATE, PROJECT_WIKI_MIGRATION_PLAN } from "./projectWikiReleaseCandidate";
import { evaluateProjectWikiHostReleaseContract, type ProjectWikiHostReleaseEvidence } from "./projectWikiHostReleaseContract";

const evidence: ProjectWikiHostReleaseEvidence = {
  tenantId: "5dfd9884-8a9c-4af7-9996-48a3f45e976f", projectId: "025fecc2-b251-48c7-a261-2e5f440ace70", appId: PROJECT_WIKI_CANDIDATE.appId,
  sourceRevision: PROJECT_WIKI_CANDIDATE.sourceRevision, frontendRevision: "f".repeat(40), trpcRevision: "f".repeat(40),
  hostImage: `registry.example/smartspec-web@sha256:${"b".repeat(64)}`, packageDigest: PROJECT_WIKI_CANDIDATE.packageDigest,
  archiveSha256: PROJECT_WIKI_CANDIDATE.archiveSha256,
  target: { id: "wiki-staging", environment: "staging", provider: "cloudflare", containerApplicationRef: "smartspec-web-staging" },
  database: { id: "wiki-db", identity: "wiki-staging", dedicated: true, credentialRef: "secret-ref:wiki-db" },
  migration: { ...PROJECT_WIKI_MIGRATION_PLAN[2]!, eligible: true },
  recovery: { strategyId: "recovery-1", evidenceRef: "backup-1", rollbackImage: `registry.example/smartspec-web@sha256:${"c".repeat(64)}`, dataBackwardCompatible: true },
};

describe("Project Wiki host release contract", () => {
  it("binds the exact package to compatible host, target, dedicated DB, migration and rollback evidence", () => {
    expect(evaluateProjectWikiHostReleaseContract(evidence)).toMatchObject({ status: "eligible", mutationAllowed: false,
      bindings: { packageDigest: PROJECT_WIKI_CANDIDATE.packageDigest, archiveSha256: PROJECT_WIKI_CANDIDATE.archiveSha256, migrationTag: "0394_project_wiki_pages_mini_app" } });
  });

  it("fails closed when host compatibility, scope, target, DB, migration or rollback evidence differs", () => {
    const result = evaluateProjectWikiHostReleaseContract({ ...evidence, trpcRevision: "e".repeat(40), archiveSha256: "d".repeat(64),
      target: { ...evidence.target, environment: "production" }, database: { ...evidence.database, dedicated: false },
      migration: { ...evidence.migration, sha256: "a".repeat(64) }, recovery: { ...evidence.recovery, dataBackwardCompatible: false } });
    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining(["HOST_REVISION_MISMATCH", "PACKAGE_IDENTITY_MISMATCH", "STAGING_TARGET_INVALID", "DEDICATED_DATABASE_UNVERIFIED", "MIGRATION_0394_NOT_ELIGIBLE", "ROLLBACK_DATA_INCOMPATIBLE"]));
    expect(result.mutationAllowed).toBe(false);
  });
});
