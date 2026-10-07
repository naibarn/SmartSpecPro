import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { protectedProcedure, router } from "../_core/trpc";
import * as persistence from "../services/projectWikiPagesService";

type ProjectWikiPagesService = Pick<typeof persistence,
  "listProjectWikiProjects" | "listProjectWikiPages" | "getProjectWikiPage" | "createProjectWikiPage" | "updateProjectWikiPage" | "archiveProjectWikiPage"
>;

const PROJECT_WIKI_PAGES_APP_ID = "app_project_wiki_pages";
const appId = z.literal(PROJECT_WIKI_PAGES_APP_ID);
const id = z.string().trim().min(1).max(128);
const title = z.string().trim().min(1).max(200);
const path = z.string().trim().min(1).max(512);
const content = z.string().max(262_144);
const writeProcedure = protectedProcedure.use(createRateLimitMiddleware({
  namespace: "project-wiki-pages-write",
  limit: 30,
  windowMs: 60_000,
}));

function scope(ctx: { user: { id: number; currentTenantId?: string | number | null } }) {
  const tenantId = String(ctx.user.currentTenantId ?? "").trim();
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return { tenantId, principalId: `user:${ctx.user.id}`, appId: PROJECT_WIKI_PAGES_APP_ID };
}

function mapError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof persistence.ProjectWikiPagesError) {
    if (error.code === "INVALID_INPUT") throw new TRPCError({ code: "BAD_REQUEST", message: "Project Wiki Pages input is invalid" });
    if (error.code === "APP_NOT_ACTIVE") throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });
    if (error.code === "PATH_ALREADY_EXISTS") throw new TRPCError({ code: "CONFLICT", message: "A page already uses this path in the selected project" });
    throw new TRPCError({ code: "NOT_FOUND", message: "Project or page not found" });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Project Wiki Pages service unavailable" });
}

export function createProjectWikiPagesRouter(service: ProjectWikiPagesService = persistence) {
  return router({
    listProjects: protectedProcedure.input(z.object({ appId }).strict()).query(async ({ ctx }) => {
      try { return await service.listProjectWikiProjects(scope(ctx)); }
      catch (error) { return mapError(error); }
    }),
    listPages: protectedProcedure.input(z.object({ appId, projectId: id }).strict()).query(async ({ ctx, input }) => {
      try { return await service.listProjectWikiPages({ ...scope(ctx), projectId: input.projectId }); }
      catch (error) { return mapError(error); }
    }),
    getPage: protectedProcedure.input(z.object({ appId, projectId: id, pageId: id }).strict()).query(async ({ ctx, input }) => {
      try { return await service.getProjectWikiPage({ ...scope(ctx), projectId: input.projectId, pageId: input.pageId }); }
      catch (error) { return mapError(error); }
    }),
    createPage: writeProcedure.input(z.object({ appId, projectId: id, title, path, content }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.createProjectWikiPage({ ...scope(ctx), ...input }); }
      catch (error) { return mapError(error); }
    }),
    updatePage: writeProcedure.input(z.object({ appId, projectId: id, pageId: id, title, path, content }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.updateProjectWikiPage({ ...scope(ctx), ...input }); }
      catch (error) { return mapError(error); }
    }),
    archivePage: writeProcedure.input(z.object({ appId, projectId: id, pageId: id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service.archiveProjectWikiPage({ ...scope(ctx), ...input }); }
      catch (error) { return mapError(error); }
    }),
  });
}

export const projectWikiPagesRouter = createProjectWikiPagesRouter();
