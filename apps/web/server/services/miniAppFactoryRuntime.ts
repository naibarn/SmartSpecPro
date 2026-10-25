import { createHash } from "node:crypto";
import { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } from "./spec224DevelopmentRunPersistence";
import { loadMiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { createMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerStageAdapter";
import type { MiniAppFactoryStageWorkerRuntime } from "./miniAppFactoryStageWorker";
import { MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { buildAndStorePersonalMiniApp, bindPersonalMiniAppArtifact, packagePreparedMiniAppCandidate, promoteMiniAppArtifactAfterVerification, provisionMiniAppRepositoryFromSnapshot, resolvePersonalMiniAppPreview, verifyPersonalMiniAppArtifactForPromotion } from "./personalMiniAppPreview";
import { storageReadBuffer } from "../storage";
import { buildMiniAppRuntimeDocument, createMiniAppRuntimeStorageToken } from "./miniAppRuntime";

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
      const preparedCandidate = state.artifacts.find(value => value.startsWith("prepared-miniapp-git:"));
      if (preparedCandidate) {
        if (!/^prepared-miniapp-git:pruksacharttk\/smartaihub-app-e6f0be051fd22e09bc4c5dff@1d7273d719ff9b034cd304920c1ef76efdd86e76$/.test(preparedCandidate)) throw new Error("MINI_APP_CANDIDATE_REVISION_MISMATCH");
        const sourceRef = [...context.artifacts].reverse().find(value => value.startsWith("app-source:r2://"))?.slice("app-source:".length);
        const sourceDigest = [...context.artifacts].reverse().find(value => value.startsWith("app-source-digest:"))?.slice("app-source-digest:".length);
        if (!sourceRef || !sourceDigest) throw new Error("MINI_APP_CANDIDATE_SOURCE_MISSING");
        if (stageId === "package") {
          const packaged = await packagePreparedMiniAppCandidate({ tenantId: context.tenantId, appId: state.miniAppId, sourceRef, sourceDigest });
          return { artifacts: [`app-artifact:${packaged.artifactRef}`, `app-artifact-digest:${packaged.artifactDigest}`, `app-artifact-bytes:${packaged.bytes}`, `package-verified:${packaged.artifactRef}`, `package-digest:spaas-package-v1:sha256:${packaged.artifactDigest}`] };
        }
        const artifactRef = [...context.artifacts].reverse().find(value => value.startsWith("app-artifact:r2://"))?.slice("app-artifact:".length);
        const artifactDigest = [...context.artifacts].reverse().find(value => value.startsWith("app-artifact-digest:"))?.slice("app-artifact-digest:".length);
        if (!artifactRef || !artifactDigest) throw new Error("MINI_APP_CANDIDATE_ARTIFACT_MISSING");
        if (stageId === "deploy") {
          const artifact = await storageReadBuffer(artifactRef.slice("r2://".length));
          if (artifact.byteLength < 1 || createHash("sha256").update(artifact).digest("hex") !== artifactDigest) throw new Error("MINI_APP_CANDIDATE_ARTIFACT_DIGEST_MISMATCH");
          return { artifacts: [`deployment-candidate:${baseRef}:${artifactDigest}`, `deployment-artifact:${artifactRef}`] };
        }
        if (stageId === "smoke") {
          if (!context.artifacts.includes(`deployment-candidate:${baseRef}:${artifactDigest}`)) throw new Error("MINI_APP_CANDIDATE_DEPLOYMENT_RECEIPT_MISSING");
          const binding = { tenantId: context.tenantId, ownerUserId: context.actorId, appId: state.miniAppId, developmentRunId: context.runId, sourceRef, sourceDigest, artifactRef, artifactDigest };
          const bound = await promoteMiniAppArtifactAfterVerification({
            verify: async () => {
              const previous = await resolvePersonalMiniAppPreview({ appId: state.miniAppId, tenantId: context.tenantId, userId: context.actorId });
              if (!previous?.html || !previous.artifactDigest) throw new Error("MINI_APP_PREVIOUS_VERSION_NOT_SERVABLE");
              const unauthorized = await resolvePersonalMiniAppPreview({ appId: state.miniAppId, tenantId: context.tenantId, userId: context.actorId + 1 });
              if (unauthorized) throw new Error("MINI_APP_PRIVATE_PREVIEW_AUTHORIZATION_FAILED");
              const candidateHtml = await verifyPersonalMiniAppArtifactForPromotion(binding);
              const rendered = buildMiniAppRuntimeDocument({
                html: candidateHtml,
                appId: state.miniAppId,
                statusUrl: `/miniapp/${state.miniAppId}/status`,
                storageToken: createMiniAppRuntimeStorageToken({ appId: state.miniAppId, tenantId: context.tenantId, userId: context.actorId }),
                storageApiOrigin: "https://smartaihub.app",
              });
              if (!rendered.html.includes("Back to Development") || rendered.html.includes("<iframe") ||
                  !rendered.contentSecurityPolicy.includes("sandbox allow-scripts") || rendered.contentSecurityPolicy.includes("allow-same-origin")) {
                throw new Error("MINI_APP_CANDIDATE_PRIVATE_PREVIEW_SMOKE_FAILED");
              }
            },
            promote: () => bindPersonalMiniAppArtifact(binding),
          });
          return { artifacts: [`deployment:${baseRef}:v${bound.deploymentVersion}`, `private-preview-smoke:${artifactDigest}`, `private-preview-owner-access:${state.miniAppId}`, `private-preview-unauthorized-denied:${state.miniAppId}`, `miniapp-version-source-git:${state.miniAppId}@1d7273d719ff9b034cd304920c1ef76efdd86e76`] };
        }
        throw new Error("MINI_APP_CANDIDATE_STAGE_UNSUPPORTED:" + stageId);
      }
      if (stageId === "ui_implementation") {
        const previousSourceRef = [...context.artifacts].reverse().find(value => value.startsWith("app-source:r2://"))?.slice("app-source:".length);
        const previousCandidateRef = state.artifacts.find(value => value.startsWith("app-candidate:r2://"))?.slice("app-candidate:".length);
        const artifact = await buildAndStorePersonalMiniApp({
          userId: context.actorId,
          tenantId: context.tenantId,
          appId: state.miniAppId,
          runId: context.runId,
          prompt: run.goal,
          previousSourceRef,
          previousCandidateRef,
          candidateOnly: state.candidateRepairAttempts > 0,
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
          ...(artifact.repairedFields?.map(field => `app-repaired-field:${field}`) ?? []),
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
        const sourceRef = [...context.artifacts].reverse().find(value => value.startsWith("app-source:r2://"))?.slice("app-source:".length);
        const sourceDigest = [...context.artifacts].reverse().find(value => value.startsWith("app-source-digest:"))?.slice("app-source-digest:".length);
        if (!artifactRef || !artifactDigest || !sourceRef || !sourceDigest) throw new Error("MINI_APP_ARTIFACT_BINDING_MISSING");
        const bound = await bindPersonalMiniAppArtifact({
          tenantId: context.tenantId,
          ownerUserId: context.actorId,
          appId: state.miniAppId,
          developmentRunId: context.runId,
          sourceRef,
          sourceDigest,
          artifactRef,
          artifactDigest,
        });
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
        const sourceRef = [...context.artifacts].reverse().find(value => value.startsWith("app-source:r2://"))?.slice("app-source:".length);
        const sourceDigest = [...context.artifacts].reverse().find(value => value.startsWith("app-source-digest:"))?.slice("app-source-digest:".length);
        if (!sourceRef || !sourceDigest) throw new Error("MINI_APP_SOURCE_SNAPSHOT_MISSING");
        const repository = await provisionMiniAppRepositoryFromSnapshot({ userId: context.actorId, tenantId: context.tenantId, appId: state.miniAppId, sourceRef, sourceDigest });
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
