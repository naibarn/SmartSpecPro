import { z } from "zod";
import { PROJECT_WIKI_CANDIDATE, PROJECT_WIKI_MIGRATION_PLAN } from "./projectWikiReleaseCandidate";

/** Approval request only; this contract never provisions Cloudflare or database resources. */
export const projectWikiStagingProvisioningRequestSchema = z.object({
  schemaVersion: z.literal("project-wiki-staging-provisioning/v1"),
  environment: z.literal("staging"),
  provider: z.literal("cloudflare"),
  identity: z.object({
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    appId: z.literal(PROJECT_WIKI_CANDIDATE.appId),
  }).strict(),
  target: z.object({
    /** Desired names are intent; provider-generated resource IDs are not known yet. */
    accountScope: z.string().trim().min(1).max(120),
    deploymentTargetName: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    containerApplicationName: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    hostRevision: z.string().trim().regex(/^[a-f0-9]{40}$/i),
    hostImage: z.string().trim().regex(/^.+@sha256:[a-f0-9]{64}$/i),
    isolation: z.literal("dedicated-staging"),
  }).strict(),
  database: z.object({
    provider: z.literal("postgresql"),
    desiredName: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,62}$/),
    desiredRegion: z.string().trim().min(1).max(100),
    recoveryPolicy: z.literal("encrypted-backup-and-restore-rehearsal"),
    migrationPlan: z.array(z.object({ tag: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(3),
  }).strict(),
}).strict().superRefine((request, context) => {
  request.database.migrationPlan.forEach((migration, index) => {
    const expected = PROJECT_WIKI_MIGRATION_PLAN[index];
    if (!expected || migration.tag !== expected.tag || migration.sha256 !== expected.sha256) {
      context.addIssue({ code: "custom", path: ["database", "migrationPlan", index], message: "Migration plan does not match the reviewed Project Wiki plan" });
    }
  });
});

export type ProjectWikiStagingProvisioningRequest = z.infer<typeof projectWikiStagingProvisioningRequestSchema>;

/** Enforce the authenticated tenant boundary before an intent reaches Approval. */
export function projectWikiProvisioningIntentMatchesTenant(
  request: ProjectWikiStagingProvisioningRequest,
  authenticatedTenantId: string | null | undefined,
): boolean {
  return Boolean(authenticatedTenantId && request.identity.tenantId === authenticatedTenantId);
}
