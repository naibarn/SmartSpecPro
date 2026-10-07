import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
  canonicalProjects,
  miniAppProjectWikiPages,
} from "../../drizzle/schema";
import { getDb } from "../db";

export interface ProjectWikiPagesScope {
  readonly tenantId: string;
  readonly principalId: string;
  readonly appId: string;
}

export class ProjectWikiPagesError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "PROJECT_NOT_FOUND" | "PAGE_NOT_FOUND" | "APP_NOT_ACTIVE" | "PATH_ALREADY_EXISTS") {
    super(code);
    this.name = "ProjectWikiPagesError";
  }
}

function db() {
  return getDb() as any;
}

function requireScope(scope: ProjectWikiPagesScope) {
  if (!scope.tenantId || !scope.principalId || !scope.appId) throw new ProjectWikiPagesError("INVALID_INPUT");
}

function validatePage(input: { title: unknown; path: unknown; content: unknown }) {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 200) throw new ProjectWikiPagesError("INVALID_INPUT");
  if (typeof input.path !== "string" || input.path.length > 512) throw new ProjectWikiPagesError("INVALID_INPUT");
  const path = input.path.trim().toLowerCase();
  if (!path || !path.split("/").every((part) => /^[a-z0-9][a-z0-9_-]*$/.test(part))) throw new ProjectWikiPagesError("INVALID_INPUT");
  if (typeof input.content !== "string" || Buffer.byteLength(input.content, "utf8") > 262_144) throw new ProjectWikiPagesError("INVALID_INPUT");
  return { title: input.title.trim(), path, content: input.content };
}

function contentHash(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function mapDatabaseError(error: unknown): never {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505" && candidate.constraint === "mini_app_project_wiki_pages_active_path_unique") {
      throw new ProjectWikiPagesError("PATH_ALREADY_EXISTS");
    }
    current = candidate.cause;
  }
  throw error;
}

async function projectRole(scope: ProjectWikiPagesScope, projectId: string, query: any = db()) {
  const [row] = await query.select({ role: canonicalProjectMemberships.role })
    .from(canonicalProjects)
    .innerJoin(canonicalProjectMemberships, and(
      eq(canonicalProjectMemberships.tenantId, canonicalProjects.tenantId),
      eq(canonicalProjectMemberships.projectId, canonicalProjects.projectId),
    ))
    .innerJoin(canonicalProjectAppBindings, and(
      eq(canonicalProjectAppBindings.tenantId, canonicalProjects.tenantId),
      eq(canonicalProjectAppBindings.projectId, canonicalProjects.projectId),
    ))
    .innerJoin(appIdentities, and(
      eq(appIdentities.tenantId, canonicalProjectAppBindings.tenantId),
      eq(appIdentities.appId, canonicalProjectAppBindings.appId),
    ))
    .where(and(
      eq(canonicalProjects.tenantId, scope.tenantId),
      eq(canonicalProjects.projectId, projectId),
      eq(canonicalProjects.lifecycle, "ACTIVE"),
      eq(canonicalProjectMemberships.principalId, scope.principalId),
      eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
      eq(canonicalProjectAppBindings.appId, scope.appId),
      eq(canonicalProjectAppBindings.lifecycle, "ACTIVE"),
      eq(appIdentities.lifecycle, "active"),
    ))
    .for("share")
    .limit(1);
  return row?.role as string | undefined;
}

async function requireProjectRole(scope: ProjectWikiPagesScope, projectId: string, write: boolean, query: any = db()) {
  const role = await projectRole(scope, projectId, query);
  if (!role || (write && role === "viewer")) throw new ProjectWikiPagesError("PROJECT_NOT_FOUND");
}

export async function listProjectWikiPages(input: ProjectWikiPagesScope & { projectId: string }) {
  requireScope(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, false, tx);
    return tx.select().from(miniAppProjectWikiPages).where(and(
      eq(miniAppProjectWikiPages.tenantId, input.tenantId),
      eq(miniAppProjectWikiPages.projectId, input.projectId),
      eq(miniAppProjectWikiPages.appId, input.appId),
      eq(miniAppProjectWikiPages.lifecycle, "ACTIVE"),
    )).orderBy(asc(miniAppProjectWikiPages.path), asc(miniAppProjectWikiPages.pageId));
  }).catch(mapDatabaseError);
}

export async function listProjectWikiProjects(scope: ProjectWikiPagesScope) {
  requireScope(scope);
  return db().select({
    projectId: canonicalProjects.projectId,
    title: canonicalProjects.title,
  }).from(canonicalProjects)
    .innerJoin(canonicalProjectMemberships, and(
      eq(canonicalProjectMemberships.tenantId, canonicalProjects.tenantId),
      eq(canonicalProjectMemberships.projectId, canonicalProjects.projectId),
    ))
    .innerJoin(canonicalProjectAppBindings, and(
      eq(canonicalProjectAppBindings.tenantId, canonicalProjects.tenantId),
      eq(canonicalProjectAppBindings.projectId, canonicalProjects.projectId),
    ))
    .innerJoin(appIdentities, and(
      eq(appIdentities.tenantId, canonicalProjectAppBindings.tenantId),
      eq(appIdentities.appId, canonicalProjectAppBindings.appId),
    ))
    .where(and(
      eq(canonicalProjects.tenantId, scope.tenantId),
      eq(canonicalProjects.lifecycle, "ACTIVE"),
      eq(canonicalProjectMemberships.principalId, scope.principalId),
      eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
      eq(canonicalProjectAppBindings.appId, scope.appId),
      eq(canonicalProjectAppBindings.lifecycle, "ACTIVE"),
      eq(appIdentities.lifecycle, "active"),
    ))
    .orderBy(desc(canonicalProjects.updatedAt), asc(canonicalProjects.projectId));
}

export async function getProjectWikiPage(input: ProjectWikiPagesScope & { projectId: string; pageId: string }) {
  requireScope(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, false, tx);
    const [page] = await tx.select().from(miniAppProjectWikiPages).where(and(
      eq(miniAppProjectWikiPages.pageId, input.pageId),
      eq(miniAppProjectWikiPages.tenantId, input.tenantId),
      eq(miniAppProjectWikiPages.projectId, input.projectId),
      eq(miniAppProjectWikiPages.appId, input.appId),
      eq(miniAppProjectWikiPages.lifecycle, "ACTIVE"),
    )).limit(1);
    if (!page) throw new ProjectWikiPagesError("PAGE_NOT_FOUND");
    return page;
  }).catch(mapDatabaseError);
}

export async function createProjectWikiPage(input: ProjectWikiPagesScope & { projectId: string; title: string; path: string; content: string }) {
  requireScope(input);
  const page = validatePage(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [created] = await tx.insert(miniAppProjectWikiPages).values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      appId: input.appId,
      ownerPrincipalId: input.principalId,
      ...page,
      contentHash: contentHash(page.content),
    }).returning();
    if (!created) throw new ProjectWikiPagesError("PAGE_NOT_FOUND");
    return created;
  }).catch(mapDatabaseError);
}

export async function updateProjectWikiPage(input: ProjectWikiPagesScope & { projectId: string; pageId: string; title: string; path: string; content: string }) {
  requireScope(input);
  const page = validatePage(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [updated] = await tx.update(miniAppProjectWikiPages).set({
      ...page,
      contentHash: contentHash(page.content),
      updatedAt: new Date(),
    }).where(and(
      eq(miniAppProjectWikiPages.pageId, input.pageId),
      eq(miniAppProjectWikiPages.tenantId, input.tenantId),
      eq(miniAppProjectWikiPages.projectId, input.projectId),
      eq(miniAppProjectWikiPages.appId, input.appId),
      eq(miniAppProjectWikiPages.lifecycle, "ACTIVE"),
    )).returning();
    if (!updated) throw new ProjectWikiPagesError("PAGE_NOT_FOUND");
    return updated;
  }).catch(mapDatabaseError);
}

export async function archiveProjectWikiPage(input: ProjectWikiPagesScope & { projectId: string; pageId: string }) {
  requireScope(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [archived] = await tx.update(miniAppProjectWikiPages).set({ lifecycle: "ARCHIVED", updatedAt: new Date() }).where(and(
      eq(miniAppProjectWikiPages.pageId, input.pageId),
      eq(miniAppProjectWikiPages.tenantId, input.tenantId),
      eq(miniAppProjectWikiPages.projectId, input.projectId),
      eq(miniAppProjectWikiPages.appId, input.appId),
      eq(miniAppProjectWikiPages.lifecycle, "ACTIVE"),
    )).returning();
    if (!archived) throw new ProjectWikiPagesError("PAGE_NOT_FOUND");
    return archived;
  }).catch(mapDatabaseError);
}
