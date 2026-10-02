import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as persistence from "../services/decisionIntelligence/decisionProjectPersistence";

const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const refs = z.array(ref).max(128).refine(values => new Set(values).size === values.length);
const projectJson = z.object({
  version: z.literal("decision-project-v1"),
  domainRefs: z.array(ref).min(1).max(128).refine(values => new Set(values).size === values.length),
  geographyRefs: refs.optional(),
  geometryRefs: refs.optional(),
  goal: z.string().trim().min(1).max(4_000),
}).strict();

type DecisionProjectRouterService = Pick<typeof persistence,
  "createDecisionProject" | "listDecisionProjects" | "getDecisionProject" |
  "listDecisionAnalysisRuns"
>;

function authorityFromContext(ctx: { tenantId: string | null; user: { id: number; currentTenantId?: string | number | null } }) {
  // Public host/request tenant is branding context, never project authorization.
  const tenantId = resolveTenantIdVarchar(null, ctx.user.currentTenantId);
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return { tenantId, ownerPrincipalId: String(ctx.user.id) };
}

function mapPersistenceError(error: unknown): never {
  if (error instanceof TRPCError && error.code === "FORBIDDEN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  if (error instanceof TRPCError && error.code === "NOT_FOUND") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision project not found" });
  }
  const code = error instanceof Error ? error.message : "";
  if (code.endsWith("_INVALID") || code.endsWith("_TOO_LARGE")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Decision project input is invalid" });
  }
  if (code === "DECISION_PROJECT_NOT_FOUND") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision project not found" });
  }
  // Do not return database/driver details to authenticated clients.
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Decision project service unavailable" });
}

export function createDecisionIntelligenceRouter(service: DecisionProjectRouterService = persistence) {
  return router({
    listProjects: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await service.listDecisionProjects({ authority: authorityFromContext(ctx) });
      } catch (error) { return mapPersistenceError(error); }
    }),

    createProject: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), projectJson }).strict()).mutation(async ({ ctx, input }) => {
      try {
        return await service.createDecisionProject({ authority: authorityFromContext(ctx), title: input.title, projectJson: input.projectJson });
      } catch (error) { return mapPersistenceError(error); }
    }),

    getProject: protectedProcedure.input(z.object({ projectId: ref }).strict()).query(async ({ ctx, input }) => {
      try {
        const project = await service.getDecisionProject({ authority: authorityFromContext(ctx), projectId: input.projectId });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Decision project not found" });
        return project;
      } catch (error) { return mapPersistenceError(error); }
    }),

    listAnalysisRuns: protectedProcedure.input(z.object({ projectId: ref }).strict()).query(async ({ ctx, input }) => {
      try {
        return await service.listDecisionAnalysisRuns({ authority: authorityFromContext(ctx), projectId: input.projectId });
      } catch (error) { return mapPersistenceError(error); }
    }),
  });
}

export const decisionIntelligenceRouter = createDecisionIntelligenceRouter();
