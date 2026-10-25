import { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } from "./spec224DevelopmentRunPersistence";
import { loadMiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { createMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerStageAdapter";
import type { MiniAppFactoryStageWorkerRuntime } from "./miniAppFactoryStageWorker";
import { MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { buildAndStorePersonalMiniApp, bindPersonalMiniAppArtifact, provisionMiniAppRepositoryFromSnapshot, resolvePersonalMiniAppPreview } from "./personalMiniAppPreview";

/** Personal apps use hosted Skill Execution -> Gateway; platform development stays Runner-admitted. */
export function createMiniAppFactoryStageWorkerRuntime(): MiniAppFactoryStageWorkerRuntime {
  const service = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);
  return {
    pipeline: loadMiniAppFactoryPipeline(),
    service,
    createRunnerStage: input => createMiniAppFactoryRunnerStage({
      ...input,
      service,
    }),
    allowHostedPersonalExecution: true,
    executeStage: async (stageId, context) => {
      const runScope = { runId: context.runId, tenantId: context.tenantId, actorId: context.actorId };
      const { run } = await service.get(runScope);
      const state = parseMiniAppFactoryDurableState(run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
      if (state.profile !== "PERSONAL_MINIAPP") throw new Error("FACTORY_HOSTED_PROFILE_FORBIDDEN");
      const baseRef = `miniapp:${state.miniAppId}`;
      if (stageId === "ui_implementation") {
        const previousSourceRef = context.artifacts.find(value => value.startsWith("app-source:r2://"))?.slice("app-source:".length);
        const previousCandidateRef = state.artifacts.find(value => value.startsWith("app-candidate:r2://"))?.slice("app-candidate:".length);
        const artifact = await buildAndStorePersonalMiniApp({
          userId: context.actorId,
          tenantId: context.tenantId,
          appId: state.miniAppId,
          runId: context.runId,
          prompt: run.goal,
          previousSourceRef,
          previousCandidateRef,
          candidateOnly: state.candidateRepairAttempted,
        });
        const repositoryState = artifact.repository
          ? "BOUND"
          : context.artifacts.includes("app-repository-state:AUTH_REQUIRED")
            ? "AUTH_REQUIRED"
            : artifact.repositoryState;
        return { artifacts: [
          `app-artifact:${artifact.artifactRef}`,
          `app-artifact-digest:${artifact.artifactDigest}`,
          `app-artifact-bytes:${artifact.bytes}`,
          `app-source:${artifact.sourceRef}`,
          `app-source-digest:${artifact.sourceDigest}`,
          ...(artifact.candidateRef ? [`app-candidate:${artifact.candidateRef}`] : []),
          ...(artifact.candidateDigest ? [`app-candidate-digest:${artifact.candidateDigest}`] : []),
          ...(artifact.repairedFields?.length ? [`app-repaired-fields:${artifact.repairedFields.join(",")}`] : []),
          `app-repository-state:${repositoryState}`,
          ...(artifact.repository ? [`app-repository:${artifact.repository.mode === "USER_OWNED" ? "user" : "managed"}:${artifact.repository.owner}/${artifact.repository.name}@${artifact.repository.revision}`] : []),
        ] };
      }
      if (stageId === "package") {
        const artifact = context.artifacts.find(value => value.startsWith("app-artifact:r2://"));
        if (!artifact) throw new Error("MINI_APP_ARTIFACT_NOT_BUILT");
        return { artifacts: [`package-verified:${artifact.slice("app-artifact:".length)}`] };
      }
      if (stageId === "deploy") {
        const artifactRef = context.artifacts.find(value => value.startsWith("app-artifact:r2://"))?.slice("app-artifact:".length);
        const artifactDigest = context.artifacts.find(value => value.startsWith("app-artifact-digest:"))?.slice("app-artifact-digest:".length);
        if (!artifactRef || !artifactDigest) throw new Error("MINI_APP_ARTIFACT_BINDING_MISSING");
        const bound = await bindPersonalMiniAppArtifact({ tenantId: context.tenantId, ownerUserId: context.actorId, appId: state.miniAppId, artifactRef, artifactDigest });
        return { artifacts: [`deployment:${baseRef}:v${bound.deploymentVersion}`, `deployment-artifact:${artifactRef}`] };
      }
      if (stageId === "smoke") {
        const preview = await resolvePersonalMiniAppPreview({ appId: state.miniAppId, tenantId: context.tenantId, userId: context.actorId });
        if (!preview?.html || !preview.artifactDigest || !preview.html.includes("Content-Security-Policy")) throw new Error("MINI_APP_PRIVATE_PREVIEW_SMOKE_FAILED");
        const unauthorized = await resolvePersonalMiniAppPreview({ appId: state.miniAppId, tenantId: context.tenantId, userId: context.actorId + 1 });
        if (unauthorized) throw new Error("MINI_APP_PRIVATE_PREVIEW_AUTHORIZATION_FAILED");
        return { artifacts: [`private-preview-smoke:${preview.artifactDigest}`, `private-preview-owner-access:${state.miniAppId}`, `private-preview-unauthorized-denied:${state.miniAppId}`] };
      }
      if (stageId === "source_repository") {
        const sourceRef = context.artifacts.find(value => value.startsWith("app-source:r2://"))?.slice("app-source:".length);
        const sourceDigest = context.artifacts.find(value => value.startsWith("app-source-digest:"))?.slice("app-source-digest:".length);
        if (!sourceRef || !sourceDigest) throw new Error("MINI_APP_SOURCE_SNAPSHOT_MISSING");
        const repository = await provisionMiniAppRepositoryFromSnapshot({ userId: context.actorId, appId: state.miniAppId, sourceRef, sourceDigest });
        if (!repository) throw new Error("MINI_APP_GITHUB_AUTHORITY_NOT_CONFIGURED");
        return { artifacts: [
          "app-repository-state:BOUND",
          `app-repository:${repository.mode === "USER_OWNED" ? "user" : "managed"}:${repository.owner}/${repository.name}@${repository.revision}`,
        ] };
      }
      throw new Error("PERSONAL_MINIAPP_FACTORY_STAGE_UNSUPPORTED:" + stageId);
    },
  };
}
