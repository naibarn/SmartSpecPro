import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
  canonicalProjects,
  miniAppResearchNotes,
  workerJobs,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { buildResearchNotesSummaryJobDefinition, researchNoteSourceVersionHash } from "./researchNotesSummaryContract";

export interface ResearchNotesScope {
  readonly tenantId: string;
  readonly principalId: string;
  readonly appId: string;
}

export class ResearchNotesError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "PROJECT_NOT_FOUND" | "NOTE_NOT_FOUND" | "APP_NOT_ACTIVE" | "SUMMARY_JOB_NOT_FOUND" | "SUMMARY_SOURCE_CHANGED") {
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

async function projectRole(scope: ResearchNotesScope, projectId: string, query: any = db()) {
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

function requireScope(scope: ResearchNotesScope) {
  if (!scope.tenantId || !scope.principalId || !scope.appId) throw new ResearchNotesError("INVALID_INPUT");
}

async function requireProjectRole(scope: ResearchNotesScope, projectId: string, write: boolean, query: any = db()) {
  const role = await projectRole(scope, projectId, query);
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
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, false, tx);
    return tx.select().from(miniAppResearchNotes).where(and(
      eq(miniAppResearchNotes.tenantId, input.tenantId),
      eq(miniAppResearchNotes.projectId, input.projectId),
      eq(miniAppResearchNotes.appId, input.appId),
      eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
    )).orderBy(desc(miniAppResearchNotes.updatedAt), asc(miniAppResearchNotes.noteId));
  });
}

export async function createResearchNote(input: ResearchNotesScope & { projectId: string; title: string; content: string }) {
  requireScope(input);
  const title = validateText(input.title, 200, "INVALID_INPUT");
  if (typeof input.content !== "string" || Buffer.byteLength(input.content, "utf8") > 262_144) throw new ResearchNotesError("INVALID_INPUT");
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [note] = await tx.insert(miniAppResearchNotes).values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      appId: input.appId,
      ownerPrincipalId: input.principalId,
      title,
      content: input.content,
    }).returning();
    if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
    return note;
  });
}

export async function updateResearchNote(input: ResearchNotesScope & { projectId: string; noteId: string; title: string; content: string }) {
  requireScope(input);
  const title = validateText(input.title, 200, "INVALID_INPUT");
  if (typeof input.content !== "string" || Buffer.byteLength(input.content, "utf8") > 262_144) throw new ResearchNotesError("INVALID_INPUT");
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [note] = await tx.update(miniAppResearchNotes).set({ title, content: input.content, aiSummary: null, updatedAt: new Date() })
      .where(and(
        eq(miniAppResearchNotes.noteId, input.noteId),
        eq(miniAppResearchNotes.tenantId, input.tenantId),
        eq(miniAppResearchNotes.projectId, input.projectId),
        eq(miniAppResearchNotes.appId, input.appId),
        eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
      )).returning();
    if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
    return note;
  });
}

export async function requestResearchNoteSummary(input: ResearchNotesScope & {
  userId: number;
  projectId: string;
  noteId: string;
}) {
  requireScope(input);
  const { createCanonicalJobInTransaction } = await import("./jobControlPlane");
  const database = db();
  return database.transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [note] = await tx.select({ title: miniAppResearchNotes.title, content: miniAppResearchNotes.content })
      .from(miniAppResearchNotes)
      .where(and(
        eq(miniAppResearchNotes.noteId, input.noteId),
        eq(miniAppResearchNotes.tenantId, input.tenantId),
        eq(miniAppResearchNotes.projectId, input.projectId),
        eq(miniAppResearchNotes.appId, input.appId),
        eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
      ))
      .limit(1);
    if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
    const definition = buildResearchNotesSummaryJobDefinition({
      tenantId: input.tenantId,
      userId: input.userId,
      appId: input.appId,
      projectId: input.projectId,
      noteId: input.noteId,
      sourceVersionHash: researchNoteSourceVersionHash(note.title, note.content),
    });
    return createCanonicalJobInTransaction({
      query: tx,
      definition,
      options: { runtimeType: "node_job_worker" },
      createdPayload: { source: "mini_app_research_notes" },
      queuedPayload: { source: "mini_app_research_notes" },
    });
  });
}

export async function getResearchNoteSummaryJob(input: ResearchNotesScope & {
  projectId: string;
  noteId: string;
  jobId: string;
}) {
  requireScope(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, false, tx);
    const [job] = await tx.select({
      id: workerJobs.id,
      status: workerJobs.status,
      outputJson: workerJobs.outputJson,
      errorCode: workerJobs.errorCode,
    }).from(workerJobs).where(and(
      eq(workerJobs.id, input.jobId),
      eq(workerJobs.tenantId, input.tenantId),
      eq(workerJobs.jobType, "research_notes.summarize"),
      sql`${workerJobs.inputJson}->>'appId' = ${input.appId}`,
      sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`,
      sql`${workerJobs.inputJson}->>'noteId' = ${input.noteId}`,
    )).limit(1);
    if (!job) throw new ResearchNotesError("SUMMARY_JOB_NOT_FOUND");
    const output = job.outputJson && typeof job.outputJson === "object" && !Array.isArray(job.outputJson)
      ? job.outputJson as Record<string, unknown>
      : {};
    return {
      jobId: job.id,
      status: job.status,
      summary: typeof output.summary === "string" ? output.summary : null,
      errorCode: job.errorCode,
    };
  });
}

export async function loadResearchNoteForSummary(input: ResearchNotesScope & {
  projectId: string;
  noteId: string;
}) {
  requireScope(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [note] = await tx.select({
      noteId: miniAppResearchNotes.noteId,
      title: miniAppResearchNotes.title,
      content: miniAppResearchNotes.content,
      aiSummary: miniAppResearchNotes.aiSummary,
    }).from(miniAppResearchNotes).where(and(
      eq(miniAppResearchNotes.noteId, input.noteId),
      eq(miniAppResearchNotes.tenantId, input.tenantId),
      eq(miniAppResearchNotes.projectId, input.projectId),
      eq(miniAppResearchNotes.appId, input.appId),
      eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
    )).limit(1);
    if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
    return note;
  });
}

export async function saveResearchNoteSummary(input: ResearchNotesScope & {
  projectId: string;
  noteId: string;
  sourceVersionHash: string;
  summary: string;
}) {
  requireScope(input);
  const summary = validateText(input.summary, 4_000, "INVALID_INPUT");
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [note] = await tx.select({
      title: miniAppResearchNotes.title,
      content: miniAppResearchNotes.content,
      aiSummary: miniAppResearchNotes.aiSummary,
    }).from(miniAppResearchNotes).where(and(
      eq(miniAppResearchNotes.noteId, input.noteId),
      eq(miniAppResearchNotes.tenantId, input.tenantId),
      eq(miniAppResearchNotes.projectId, input.projectId),
      eq(miniAppResearchNotes.appId, input.appId),
      eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
    )).for("update").limit(1);
    if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
    if (researchNoteSourceVersionHash(note.title, note.content) !== input.sourceVersionHash) {
      throw new ResearchNotesError("SUMMARY_SOURCE_CHANGED");
    }
    if (note.aiSummary) return note.aiSummary;
    const [updated] = await tx.update(miniAppResearchNotes).set({ aiSummary: summary, updatedAt: new Date() })
      .where(and(
        eq(miniAppResearchNotes.noteId, input.noteId),
        eq(miniAppResearchNotes.tenantId, input.tenantId),
        eq(miniAppResearchNotes.projectId, input.projectId),
        eq(miniAppResearchNotes.appId, input.appId),
        eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
      )).returning({ aiSummary: miniAppResearchNotes.aiSummary });
    if (!updated) throw new ResearchNotesError("NOTE_NOT_FOUND");
    return updated.aiSummary ?? summary;
  });
}

export async function archiveResearchNote(input: ResearchNotesScope & { projectId: string; noteId: string }) {
  requireScope(input);
  return db().transaction(async (tx: any) => {
    await requireProjectRole(input, input.projectId, true, tx);
    const [note] = await tx.update(miniAppResearchNotes).set({ lifecycle: "ARCHIVED", updatedAt: new Date() })
      .where(and(
        eq(miniAppResearchNotes.noteId, input.noteId),
        eq(miniAppResearchNotes.tenantId, input.tenantId),
        eq(miniAppResearchNotes.projectId, input.projectId),
        eq(miniAppResearchNotes.appId, input.appId),
        eq(miniAppResearchNotes.lifecycle, "ACTIVE"),
      )).returning();
    if (!note) throw new ResearchNotesError("NOTE_NOT_FOUND");
    return note;
  });
}
