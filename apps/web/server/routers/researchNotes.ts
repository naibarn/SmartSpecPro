import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { protectedProcedure, router } from "../_core/trpc";
import * as persistence from "../services/researchNotesService";

type ResearchNotesService = Pick<typeof persistence,
  "createResearchProject" | "listResearchProjects" | "listResearchNotes" |
  "createResearchNote" | "updateResearchNote" | "archiveResearchNote" |
  "requestResearchNoteSummary" | "getResearchNoteSummaryJob"
>;

const id = z.string().trim().min(1).max(128);
const appId = z.string().trim().min(1).max(128);
const writeProcedure = protectedProcedure.use(createRateLimitMiddleware({
  namespace: "research-notes-write",
  limit: 30,
  windowMs: 60_000,
}));

function scope(ctx: { user: { id: number; currentTenantId?: string | number | null } }, targetAppId: string) {
  const tenantId = String(ctx.user.currentTenantId ?? "").trim();
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return { tenantId, principalId: `user:${ctx.user.id}`, appId: targetAppId };
}

function mapError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof persistence.ResearchNotesError) {
    if (error.code === "INVALID_INPUT") throw new TRPCError({ code: "BAD_REQUEST", message: "Research Notes input is invalid" });
    if (error.code === "APP_NOT_ACTIVE") throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });
    if (error.code === "SUMMARY_SOURCE_CHANGED") throw new TRPCError({ code: "CONFLICT", message: "Note changed while its summary was being generated" });
    throw new TRPCError({ code: "NOT_FOUND", message: "Project or note not found" });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Research Notes service unavailable" });
}

export function createResearchNotesRouter(service: ResearchNotesService = persistence) {
  return router({
    listProjects: protectedProcedure.input(z.object({ appId }).strict()).query(async ({ ctx, input }) => {
      try { return await service.listResearchProjects(scope(ctx, input.appId)); }
      catch (error) { return mapError(error); }
    }),
    createProject: writeProcedure.input(z.object({ appId, title: z.string().trim().min(1).max(200) }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.createResearchProject({ ...scope(ctx, input.appId), title: input.title }); }
      catch (error) { return mapError(error); }
    }),
    listNotes: protectedProcedure.input(z.object({ appId, projectId: id }).strict()).query(async ({ ctx, input }) => {
      try { return await service.listResearchNotes({ ...scope(ctx, input.appId), projectId: input.projectId }); }
      catch (error) { return mapError(error); }
    }),
    createNote: writeProcedure.input(z.object({ appId, projectId: id, title: z.string().trim().min(1).max(200), content: z.string().max(262_144) }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.createResearchNote({ ...scope(ctx, input.appId), ...input }); }
      catch (error) { return mapError(error); }
    }),
    updateNote: writeProcedure.input(z.object({ appId, projectId: id, noteId: id, title: z.string().trim().min(1).max(200), content: z.string().max(262_144) }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.updateResearchNote({ ...scope(ctx, input.appId), ...input }); }
      catch (error) { return mapError(error); }
    }),
    archiveNote: writeProcedure.input(z.object({ appId, projectId: id, noteId: id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.archiveResearchNote({ ...scope(ctx, input.appId), ...input }); }
      catch (error) { return mapError(error); }
    }),
    requestSummary: writeProcedure.input(z.object({ appId, projectId: id, noteId: id }).strict()).mutation(async ({ ctx, input }) => {
      try {
        return await service.requestResearchNoteSummary({
          ...scope(ctx, input.appId),
          ...input,
          userId: ctx.user.id,
        });
      } catch (error) { return mapError(error); }
    }),
    summaryJob: protectedProcedure.input(z.object({ appId, projectId: id, noteId: id, jobId: id }).strict()).query(async ({ ctx, input }) => {
      try { return await service.getResearchNoteSummaryJob({ ...scope(ctx, input.appId), ...input }); }
      catch (error) { return mapError(error); }
    }),
  });
}

export const researchNotesRouter = createResearchNotesRouter();
