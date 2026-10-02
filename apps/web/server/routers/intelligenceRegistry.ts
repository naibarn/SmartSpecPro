import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as persistence from "../services/intelligenceFabric/registryPersistence";
import { getThailandProviderPack } from "../services/geoSources/thailand/manifest";

const rowId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,35}$/);
const tenantRead = protectedProcedure;
const tenantWrite = protectedProcedure.use(createRateLimitMiddleware({ namespace: "intelligence-registry-write", limit: 30, windowMs: 60_000 }));

type RegistryService = Pick<typeof persistence,
  "admitPendingReviewSource" | "admitPendingReviewDataset" | "getPendingReviewSource" |
  "listPendingReviewSources" | "listPendingReviewDatasets" | "listEvidence"
>;

function tenantScope(ctx: { user: { currentTenantId?: string | number | null } }) {
  const tenantId = resolveTenantIdVarchar(null, ctx.user.currentTenantId);
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return { tenantId };
}

function mapError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof persistence.RegistryPersistenceError) {
    if (error.code === "REGISTRY_INVALID" || error.code === "REGISTRY_UNKNOWN_FIELD" || error.code === "REGISTRY_PAYLOAD_TOO_LARGE" || error.code === "REGISTRY_PAYLOAD_SECRET") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Registry input is invalid" });
    }
    if (error.code === "REGISTRY_SCOPE_MISMATCH" || error.code === "REGISTRY_DATASET_SOURCE_MISMATCH") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Registry record not found" });
    }
    throw new TRPCError({ code: "CONFLICT", message: "Registry record conflicts with an existing record" });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registry service unavailable" });
}

export function createIntelligenceRegistryRouter(service: RegistryService = persistence) {
  return router({
    listCandidateCatalog: adminProcedure.query(() => getThailandProviderPack()),

    listPendingSources: tenantRead.query(async ({ ctx }) => {
      try { return await service.listPendingReviewSources({ scope: tenantScope(ctx) }); }
      catch (error) { return mapError(error); }
    }),

    getPendingSource: tenantRead.input(z.object({ sourceId: rowId }).strict()).query(async ({ ctx, input }) => {
      try { return await service.getPendingReviewSource({ scope: tenantScope(ctx), sourceId: input.sourceId }) ?? null; }
      catch (error) { return mapError(error); }
    }),

    submitSourceForReview: tenantWrite.input(z.object({ source: z.unknown() }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.admitPendingReviewSource({ scope: tenantScope(ctx), source: input.source }); }
      catch (error) { return mapError(error); }
    }),

    listPendingDatasets: tenantRead.input(z.object({ sourceId: rowId }).strict()).query(async ({ ctx, input }) => {
      try { return await service.listPendingReviewDatasets({ scope: tenantScope(ctx), sourceId: input.sourceId }); }
      catch (error) { return mapError(error); }
    }),

    submitDatasetForReview: tenantWrite.input(z.object({ dataset: z.unknown() }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.admitPendingReviewDataset({ scope: tenantScope(ctx), dataset: input.dataset }); }
      catch (error) { return mapError(error); }
    }),

    listEvidence: tenantRead.input(z.object({ sourceId: rowId }).strict()).query(async ({ ctx, input }) => {
      try { return await service.listEvidence({ scope: tenantScope(ctx), sourceId: input.sourceId }); }
      catch (error) { return mapError(error); }
    }),
  });
}

export const intelligenceRegistryRouter = createIntelligenceRegistryRouter();
