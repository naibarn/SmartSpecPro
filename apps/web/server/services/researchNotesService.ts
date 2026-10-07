import { and, asc, desc, eq } from "drizzle-orm";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
  canonicalProjects,
  miniAppResearchNotes,
} from "../../drizzle/schema";
import { getDb } from "../db";

export interface ResearchNotesScope {
  readonly tenantId: string;
  readonly principalId: string;
  readonly appId: string;
}

export class ResearchNotesError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "PROJECT_NOT_FOUND" | "NOTE_NOT_FOUND" | "APP_NOT_ACTIVE") {
    super(code);
    this.name = "ResearchNotesError";
  }
}

function validateText(value: unknown, max: number, code: "INVALID_INPUT"): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ResearchNotesError(code);
  return value.trim();
}

function db() {
  return getDb() as any;
}

async function projectRole(scope: ResearchNotesScope, projectId: string) {
  const [row] = await db().select({ role: canonicalProjectMemberships.role })
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
    .limit(1);
  return row?.role as string | undefined;
}

function requireScope(scope: ResearchNotesScope) {
  if (!scope.tenantId || !scope.principalId || !scope.appId) throw new ResearchNotesError("INVALID_INPUT");
}

async function requireProjectRole(scope: ResearchNotesScope, projectId: string, write: boolean) {
  const role = await projectRole(scope, projectId);
  if (!role || (write && role === "viewer")) throw new ResearchNotesError("PROJECT_NOT_FOUND");
}

export async function createResearchProject(input: ResearchNotesScope & { title: string }) {
  requireScope(input);
  const title = validateText(input.title, 200, "INVALID_INPUT");
  const database = db();
  return database.transaction(async (tx: any) => {
    const [app] = await tx.select({ appId: appIdentities.appId }).from(appIdentities)
      .where(and(eq(appIdentities.appId, input.appId), eq(appIdentities.tenantId, input.tenantId), eq(appIdentities.lifecycle, "active")))
      .limit(1);
    if (!app) throw new ResearchNotesError("APP_NOT_ACTIVE");
    const [project] = await tx.insert(canonicalProjects).values({
      tenantId: input.tenantId,
      projectType: "research-notes",
      title,
      ownerPrincipalId: input.principalId,
    }).returning();
    if (!project) throw new ResearchNotesError("PROJECT_NOT_FOUND");
    await tx.insert(canonicalProjectMemberships).values({
      tenantId: input.tenantId,
      projectId: project.projectId,
      principalId: input.principalId,
      role: "owner",
    });
    await tx.insert(canonicalProjectAppBindings).values({
      tenantId: input.tenantId,
      projectId: project.projectId,
      appId: input.appId,
    });
    return project;
  });
}

export async function listResearchProjects(scope: ResearchNotesScope) {
  requireScope(scope);
  return db().select({
    projectId: canonicalProjects.projectId,
    tenantId: canonicalProjects.tenantId,
    title: canonicalProjects.title,
    lifecycle: canonicalProjects.lifecycle,
    updatedAt: canonicalProjects.updatedAt,
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

export async function listResearchNotes(input: ResearchNotesScope & { projectId: string }) {
  requireScope(input);
  await requireProjectRole(input, input.projectId, false);
  return db().select().from(miniAppResearchNotes).where(and(
    eq(miniAppResearchNotes.tenantId, input.tenantId),
    eq(miniAppResearchNotes.projectId, input.projectId),
    eq(miniAppResearchNotes.appId, input.appId),
    eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
  )).orderBy(desc(miniAppResearchNotes.updatedAt), asc(miniAppResearchNotes.noteId));
}

export async function createResearchNote(input: ResearchNotesScope & { projectId: string; title: string; content: string }) {
  requireScope(input);
  const title = validateText(input.title, 200, "INVALID_INPUT");
  if (typeof input.content !== "string" || Buffer.byteLength(input.content, "utf8") > 262_144) throw new ResearchNotesError("INVALID_INPUT");
  await requireProjectRole(input, input.projectId, true);
  const [note] = await db().insert(miniAppResearchNotes).values({
    tenantId: input.tenantId,
    projectId: input.projectId,
    appId: input.appId,
    ownerPrincipalId: input.principalId,
    title,
    content: input.content,
  }).returning();
  if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
  return note;
}

export async function updateResearchNote(input: ResearchNotesScope & { projectId: string; noteId: string; title: string; content: string }) {
  requireScope(input);
  const title = validateText(input.title, 200, "INVALID_INPUT");
  if (typeof input.content !== "string" || Buffer.byteLength(input.content, "utf8") > 262_144) throw new ResearchNotesError("INVALID_INPUT");
  await requireProjectRole(input, input.projectId, true);
  const [note] = await db().update(miniAppResearchNotes).set({ title, content: input.content, updatedAt: new Date() })
    .where(and(
      eq(miniAppResearchNotes.noteId, input.noteId),
      eq(miniAppResearchNotes.tenantId, input.tenantId),
      eq(miniAppResearchNotes.projectId, input.projectId),
      eq(miniAppResearchNotes.appId, input.appId),
      eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
    )).returning();
  if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
  return note;
}

export async function archiveResearchNote(input: ResearchNotesScope & { projectId: string; noteId: string }) {
  requireScope(input);
  await requireProjectRole(input, input.projectId, true);
  const [note] = await db().update(miniAppResearchNotes).set({ lifecycle: "ARCHIVED", updatedAt: new Date() })
    .where(and(
      eq(miniAppResearchNotes.noteId, input.noteId),
      eq(miniAppResearchNotes.tenantId, input.tenantId),
      eq(miniAppResearchNotes.projectId, input.projectId),
      eq(miniAppResearchNotes.appId, input.appId),
      eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
    )).returning();
  if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
  return note;
}
