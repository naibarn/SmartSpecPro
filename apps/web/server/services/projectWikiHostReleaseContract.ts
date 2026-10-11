import { PROJECT_WIKI_CANDIDATE, PROJECT_WIKI_MIGRATION_PLAN } from "./projectWikiReleaseCandidate";

export type ProjectWikiHostReleaseEvidence = Readonly<{
  tenantId: string;
  projectId: string;
  appId: string;
  sourceRevision: string;
  frontendRevision: string;
  trpcRevision: string;
  hostImage: string;
  packageDigest: string;
  archiveSha256: string;
  target: Readonly<{ id: string; environment: string; provider: string; containerApplicationRef: string }>;
  database: Readonly<{ id: string; identity: string; dedicated: boolean; credentialRef: string }>;
  migration: Readonly<{ tag: string; sha256: string; eligible: boolean }>;
  recovery: Readonly<{ strategyId: string; evidenceRef: string; rollbackImage: string; dataBackwardCompatible: boolean }>;
}>;

export type ProjectWikiHostReleaseContract = Readonly<{
  contract: "smartspec-web-project-wiki-host-release/v1";
  status: "eligible" | "blocked";
  blockers: readonly string[];
  bindings: Readonly<{
    tenantId: string;
    projectId: string;
    appId: string;
    sourceRevision: string;
    frontendRevision: string;
    trpcRevision: string;
    hostImage: string;
    packageDigest: string;
    archiveSha256: string;
    targetId: string;
    databaseId: string;
    migrationTag: string;
  }>;
  mutationAllowed: false;
}>;

/** Evaluates compatibility evidence only; it never talks to Cloudflare or deploys. */
export function evaluateProjectWikiHostReleaseContract(evidence: ProjectWikiHostReleaseEvidence): ProjectWikiHostReleaseContract {
  const blockers: string[] = [];
  if (evidence.appId !== PROJECT_WIKI_CANDIDATE.appId) blockers.push("APP_BINDING_MISMATCH");
  if (evidence.sourceRevision !== PROJECT_WIKI_CANDIDATE.sourceRevision) blockers.push("PACKAGE_SOURCE_MISMATCH");
  if (!/^[a-f0-9]{40}$/i.test(evidence.frontendRevision) || evidence.frontendRevision !== evidence.trpcRevision) blockers.push("HOST_REVISION_MISMATCH");
  if (!/^.+@sha256:[a-f0-9]{64}$/i.test(evidence.hostImage)) blockers.push("HOST_IMAGE_NOT_IMMUTABLE");
  if (evidence.packageDigest !== PROJECT_WIKI_CANDIDATE.packageDigest || evidence.archiveSha256 !== PROJECT_WIKI_CANDIDATE.archiveSha256) blockers.push("PACKAGE_IDENTITY_MISMATCH");
  if (!evidence.tenantId || !evidence.projectId) blockers.push("PROJECT_IDENTITY_MISSING");
  if (evidence.target.environment !== "staging" || evidence.target.provider !== "cloudflare" || !evidence.target.id || !evidence.target.containerApplicationRef) blockers.push("STAGING_TARGET_INVALID");
  if (!evidence.database.dedicated || !evidence.database.id || !evidence.database.identity || !evidence.database.credentialRef) blockers.push("DEDICATED_DATABASE_UNVERIFIED");
  const migration = PROJECT_WIKI_MIGRATION_PLAN.find(item => item.tag === evidence.migration.tag);
  if (!migration || migration.sha256 !== evidence.migration.sha256 || !evidence.migration.eligible) blockers.push("MIGRATION_0394_NOT_ELIGIBLE");
  if (!evidence.recovery.strategyId || !evidence.recovery.evidenceRef || !/^.+@sha256:[a-f0-9]{64}$/i.test(evidence.recovery.rollbackImage)) blockers.push("RECOVERY_EVIDENCE_INCOMPLETE");
  if (!evidence.recovery.dataBackwardCompatible) blockers.push("ROLLBACK_DATA_INCOMPATIBLE");
  return {
    contract: "smartspec-web-project-wiki-host-release/v1",
    status: blockers.length ? "blocked" : "eligible",
    blockers,
    bindings: {
      tenantId: evidence.tenantId, projectId: evidence.projectId, appId: evidence.appId,
      sourceRevision: evidence.sourceRevision, frontendRevision: evidence.frontendRevision,
      trpcRevision: evidence.trpcRevision, hostImage: evidence.hostImage,
      packageDigest: evidence.packageDigest, archiveSha256: evidence.archiveSha256,
      targetId: evidence.target.id, databaseId: evidence.database.id, migrationTag: evidence.migration.tag,
    },
    mutationAllowed: false,
  };
}
