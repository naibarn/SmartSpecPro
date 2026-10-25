import { and, eq } from "drizzle-orm";
import { appIdentities } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveOwnedPrivateMiniAppIdentity } from "./appIdentityRepository";
import { MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { provisionMiniAppRepositoryFromSnapshot, resolvePersonalMiniAppFactoryHome } from "./personalMiniAppPreview";
import { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } from "./spec224DevelopmentRunPersistence";

const developmentRunService = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);

export async function provisionOwnedMiniAppRepository(input: {
  appId: string;
  tenantId: string;
  ownerUserId: number;
}) {
  const app = await resolveOwnedPrivateMiniAppIdentity({
    appId: input.appId,
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
  });
  if (!app?.lastKnownGoodArtifactRef) throw new Error("MINI_APP_UNAVAILABLE");

  const factory = await resolvePersonalMiniAppFactoryHome({ tenantId: input.tenantId, userId: input.ownerUserId }, input.appId, true);
  if (!factory?.runId || !factory.sourceSnapshotRef || !factory.appSourceDigest) {
    throw new Error("MINI_APP_SOURCE_SNAPSHOT_MISSING");
  }
  if (factory.isInProgress) throw new Error("MINI_APP_STAGE_IN_PROGRESS");
  if (factory.repository) return { appId: input.appId, repository: factory.repository, alreadyProvisioned: true };

  const repository = await provisionMiniAppRepositoryFromSnapshot({
    userId: input.ownerUserId,
    tenantId: input.tenantId,
    appId: input.appId,
    sourceRef: factory.sourceSnapshotRef,
    sourceDigest: factory.appSourceDigest,
  });
  if (!repository) throw new Error("MINI_APP_GITHUB_CONNECTION_REQUIRED");

  const scope = { runId: factory.runId, tenantId: input.tenantId, actorId: input.ownerUserId };
  const record = await developmentRunService.get(scope);
  const currentState = parseMiniAppFactoryDurableState(record.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
  if (currentState.miniAppId !== input.appId) throw new Error("MINI_APP_RUN_BINDING_MISMATCH");
  if (currentState.repository) return { appId: input.appId, repository: currentState.repository, alreadyProvisioned: true };

  const repoKind = repository.mode === "SMARTAIHUB_MANAGED" ? "managed" : "user";
  const repositoryArtifact = `app-repository:${repoKind}:${repository.owner}/${repository.name}@${repository.revision}`;
  const nextState = {
    ...currentState,
    repository,
    artifacts: [...new Set([
      ...currentState.artifacts.filter(value => value !== "app-repository-state:AUTH_REQUIRED"),
      repositoryArtifact,
      "app-repository-state:BOUND",
    ])],
    nextEligibleStages: currentState.nextEligibleStages.filter(stage => stage !== "source_repository"),
    blockerState: currentState.blockerState.code === "MINI_APP_GITHUB_AUTHORITY_NOT_CONFIGURED"
      ? { status: "NONE" as const, code: null }
      : currentState.blockerState,
  };
  await developmentRunService.recordVerificationEvent({
    ...scope,
    idempotencyKey: `miniapp-repository:${input.appId}:${repository.revision}`,
    type: "VERIFICATION_OUTCOME",
    payload: { profile: "PERSONAL_MINIAPP", outcome: "REPOSITORY_PROVISIONED", repository: `${repository.owner}/${repository.name}` },
    runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: nextState },
  });
  return { appId: input.appId, repository, alreadyProvisioned: false };
}

export async function reconcilePendingMiniAppRepositoriesForOwner(input: {
  tenantId: string;
  ownerUserId: number;
}) {
  const rows = await getDb().select({ appId: appIdentities.appId })
    .from(appIdentities)
    .where(and(
      eq(appIdentities.tenantId, input.tenantId),
      eq(appIdentities.ownerUserId, input.ownerUserId),
      eq(appIdentities.visibility, "private"),
    ));
  let provisioned = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const factory = await resolvePersonalMiniAppFactoryHome({ tenantId: input.tenantId, userId: input.ownerUserId }, row.appId, true);
    const state = factory?.repositoryState === "AUTH_REQUIRED" || (
      factory?.repositoryState !== "BOUND" && factory?.error?.code === "MINI_APP_GITHUB_AUTHORITY_NOT_CONFIGURED"
    );
    if (!state || !factory?.sourceSnapshotRef || !factory.appSourceDigest || factory.isInProgress || factory.repository) {
      skipped += 1;
      continue;
    }
    try {
      const result = await provisionOwnedMiniAppRepository({
        appId: row.appId,
        tenantId: input.tenantId,
        ownerUserId: input.ownerUserId,
      });
      if (!result.alreadyProvisioned) provisioned += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.warn("[MiniAppGitHub] pending repository reconciliation deferred", {
        appId: row.appId,
        code: error instanceof Error ? error.message.slice(0, 120) : "MINI_APP_REPOSITORY_RECONCILIATION_FAILED",
      });
    }
  }
  return { scanned: rows.length, provisioned, skipped, failed };
}
