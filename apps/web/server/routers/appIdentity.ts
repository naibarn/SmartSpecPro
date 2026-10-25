import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createPrivateMiniAppIdentity,
  resolveActiveAppByPublicId,
  resolveMiniAppForViewer,
  resolveAppRouteForTenant,
  setMiniAppVisibility,
  recordMiniAppRuntimeMigrationVerification,
  confirmMiniAppRuntimeMigration,
  resolveOwnedPrivateMiniAppIdentity,
} from "../services/appIdentityRepository";
import { provisionMiniAppRepositoryFromSnapshot, resolvePersonalMiniAppFactoryHome, resolvePersonalMiniAppPreview } from "../services/personalMiniAppPreview";
import { loadMiniAppFactoryPipeline } from "../services/miniAppFactoryPipeline";
import { MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "../services/miniAppFactoryDurableState";
import { isAutoRecoverableMiniAppFactoryError, scheduleMiniAppFactoryStageRetry } from "../services/miniAppFactoryStageWorker";
import { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } from "../services/spec224DevelopmentRunPersistence";
import { createMiniAppRuntimeReadyMarker, createMiniAppRuntimeStorageToken, migrateMiniAppRuntimeValues, parseMiniAppRuntimeEntries } from "../services/miniAppRuntime";

const developmentRunService = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);

type AppIdentityService = Pick<typeof import("../services/appIdentityRepository"), "resolveAppRouteForTenant" | "resolveActiveAppByPublicId" | "createPrivateMiniAppIdentity" | "resolveMiniAppForViewer" | "setMiniAppVisibility" | "recordMiniAppRuntimeMigrationVerification" | "confirmMiniAppRuntimeMigration" | "resolveOwnedPrivateMiniAppIdentity"> & {
  resolvePersonalMiniAppFactoryHome: typeof resolvePersonalMiniAppFactoryHome;
  provisionMiniAppRepositoryFromSnapshot: typeof provisionMiniAppRepositoryFromSnapshot;
  resolvePersonalMiniAppPreview?: typeof resolvePersonalMiniAppPreview;
};

function authenticatedTenant(ctx: { user: { currentTenantId?: string | number | null } }) {
  const tenantId = String(ctx.user.currentTenantId ?? "").trim();
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tenantId;
}

export function createAppIdentityRouter(service: AppIdentityService = {
  resolveAppRouteForTenant,
  resolveActiveAppByPublicId,
  createPrivateMiniAppIdentity,
  resolveMiniAppForViewer,
  setMiniAppVisibility,
  recordMiniAppRuntimeMigrationVerification,
  confirmMiniAppRuntimeMigration,
  resolveOwnedPrivateMiniAppIdentity,
  resolvePersonalMiniAppFactoryHome,
  provisionMiniAppRepositoryFromSnapshot,
  resolvePersonalMiniAppPreview,
}) {
  return router({
    createMiniApp: protectedProcedure
      .input(z.object({ idempotencyKey: z.string().trim().min(16).max(160).regex(/^[A-Za-z0-9._:-]+$/) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const ownerUserId = Number(ctx.user.id);
        if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        return service.createPrivateMiniAppIdentity({ tenantId, ownerUserId, idempotencyKey: input.idempotencyKey });
      }),
    publishMiniApp: protectedProcedure
      .input(z.object({ appId: z.string().trim().min(1).max(128) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const ownerUserId = Number(ctx.user.id);
        if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const result = await service.setMiniAppVisibility({ appId: input.appId, tenantId, ownerUserId, visibility: "public" });
        if (!result) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Mini App is not owned or has no verified preview artifact" });
        return result;
      }),
    unpublishMiniApp: protectedProcedure
      .input(z.object({ appId: z.string().trim().min(1).max(128) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const ownerUserId = Number(ctx.user.id);
        if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const result = await service.setMiniAppVisibility({ appId: input.appId, tenantId, ownerUserId, visibility: "private" });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        return result;
      }),
    prepareMiniAppRuntime: protectedProcedure
      .input(z.object({
        appId: z.string().trim().regex(/^app_[A-Za-z0-9_-]{1,120}$/),
        legacyEntries: z.array(z.object({ key: z.string(), value: z.unknown() }).strict()).max(100),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const userId = Number(ctx.user.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const app = await service.resolveMiniAppForViewer({ appId: input.appId, tenantId, userId });
        if (!app || app.visibility !== "private" || app.ownerUserId !== userId || !app.lastKnownGoodArtifactRef) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        }
        const legacyEntries = parseMiniAppRuntimeEntries(input.legacyEntries);
        const migrated = await migrateMiniAppRuntimeValues({ appId: app.appId, tenantId, userId }, legacyEntries);
        if (migrated.verified !== legacyEntries.length) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Mini App data migration could not be verified" });
        }
        const recorded = await service.recordMiniAppRuntimeMigrationVerification({
          appId: app.appId,
          tenantId,
          ownerUserId: userId,
          imported: migrated.imported,
          preserved: migrated.preserved,
        });
        if (!recorded) throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        ctx.res.cookie("miniapp_runtime_ready", createMiniAppRuntimeReadyMarker({ appId: app.appId, tenantId, userId }), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: `/miniapp/${app.appId}`,
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });
        return {
          appId: app.appId,
          deploymentVersion: app.deploymentVersion,
          migrationStatus: recorded.runtimeDataMigrationStatus as "VERIFIED" | "OWNER_CONFIRMED",
          storageToken: createMiniAppRuntimeStorageToken({ appId: app.appId, tenantId, userId }),
          ...migrated,
        };
      }),
    confirmRuntimeDataMigration: protectedProcedure
      .input(z.object({ appId: z.string().trim().regex(/^app_[A-Za-z0-9_-]{1,120}$/) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const userId = Number(ctx.user.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const confirmed = await service.confirmMiniAppRuntimeMigration({ appId: input.appId, tenantId, ownerUserId: userId });
        if (!confirmed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Open the private app once and verify its migrated data before continuing development" });
        return { appId: input.appId, migrationStatus: "OWNER_CONFIRMED" as const };
      }),
    provisionMiniAppRepository: protectedProcedure
      .input(z.object({ appId: z.string().trim().regex(/^app_[A-Za-z0-9_-]{1,120}$/) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const userId = Number(ctx.user.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const app = await service.resolveOwnedPrivateMiniAppIdentity({ appId: input.appId, tenantId, ownerUserId: userId });
        if (!app || !app.lastKnownGoodArtifactRef) throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        const factory = await service.resolvePersonalMiniAppFactoryHome({ tenantId, userId }, input.appId, true);
        if (!factory?.runId || !factory.sourceSnapshotRef || !factory.appSourceDigest) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No retained Mini-App source snapshot is available to provision" });
        }
        if (factory.isInProgress) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Wait for the current Mini-App stage to finish before provisioning its repository" });
        if (factory.repository) return { appId: input.appId, repository: factory.repository, alreadyProvisioned: true };
        const repository = await service.provisionMiniAppRepositoryFromSnapshot({
          userId,
          appId: input.appId,
          sourceRef: factory.sourceSnapshotRef,
          sourceDigest: factory.appSourceDigest,
        });
        if (!repository) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect GitHub in Settings → Integrations, then provision this saved source again" });

        const record = await developmentRunService.get({ runId: factory.runId, tenantId, actorId: userId });
        const metadata = record.run.metadata as Record<string, unknown>;
        const currentState = parseMiniAppFactoryDurableState(metadata[MINI_APP_FACTORY_STATE_KEY]);
        if (currentState.miniAppId !== input.appId) throw new TRPCError({ code: "CONFLICT", message: "Mini-App run binding changed; refresh and retry" });
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
          runId: factory.runId,
          tenantId,
          actorId: userId,
          idempotencyKey: `miniapp-repository:${input.appId}:${repository.revision}`,
          type: "VERIFICATION_OUTCOME",
          payload: { profile: "PERSONAL_MINIAPP", outcome: "REPOSITORY_PROVISIONED", repository: `${repository.owner}/${repository.name}` },
          runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: nextState },
        });
        return { appId: input.appId, repository, alreadyProvisioned: false };
      }),
    resolveMiniApp: publicProcedure
      .input(z.object({ appId: z.string().trim().min(1).max(128) }).strict())
      .query(async ({ ctx, input }) => {
        const user = ctx.user;
        const viewer = {
          appId: input.appId,
          tenantId: user?.currentTenantId == null ? null : String(user.currentTenantId),
          userId: user?.id == null ? null : Number(user.id),
        };
        let app = service.resolvePersonalMiniAppPreview
          ? await service.resolvePersonalMiniAppPreview(viewer)
          : await service.resolveMiniAppForViewer(viewer);
        if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        const preview = app as unknown as {
          app?: { appId: string; ownerUserId: number | null; visibility: string };
          factory?: { recoveryNeeded?: boolean; runId?: string | null; currentStage?: string | null; error?: { code?: string | null } | null; latestStageCheckpointed?: boolean } | null;
        };
        const recovery = preview.factory;
        const recoveryAllowed = isAutoRecoverableMiniAppFactoryError(recovery?.error?.code) || recovery?.latestStageCheckpointed === true;
        if (
          service.resolvePersonalMiniAppPreview && preview.app?.visibility === "private" &&
          preview.app.ownerUserId === viewer.userId && viewer.tenantId && viewer.userId &&
          recovery?.recoveryNeeded && recoveryAllowed && recovery.runId && recovery.currentStage
        ) {
          try {
            await scheduleMiniAppFactoryStageRetry({
              pipeline: loadMiniAppFactoryPipeline(),
              service: developmentRunService,
              run: { runId: recovery.runId, tenantId: viewer.tenantId, actorId: viewer.userId },
              appId: preview.app.appId,
              stageId: recovery.currentStage,
            });
            app = await service.resolvePersonalMiniAppPreview(viewer) ?? app;
          } catch (error) {
            // Keep the durable App Home readable if queue recovery itself needs a later retry.
            console.warn("[MiniAppFactory] App Home recovery enqueue deferred", {
              appId: preview.app.appId,
              code: error instanceof Error ? error.message.slice(0, 120) : "FACTORY_AUTO_RECOVERY_FAILED",
            });
          }
        }
        return app;
      }),
    resolveRoute: protectedProcedure
      .input(z.object({
        kind: z.enum(["slug", "custom-domain"]),
        value: z.string().trim().min(1).max(253),
      }).strict())
      .query(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        return service.resolveAppRouteForTenant({ ...input, tenantId });
      }),
    resolvePublicApp: protectedProcedure
      .input(z.object({ publicAppId: z.string().trim().min(1).max(128) }).strict())
      .query(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        return service.resolveActiveAppByPublicId({ ...input, tenantId });
      }),
  });
}

export const appIdentityRouter = createAppIdentityRouter();
