import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../server/db";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
} from "../drizzle/schema";
import {
  archiveResearchNote,
  createResearchNote,
  createResearchProject,
  listResearchNotes,
  listResearchProjects,
  ResearchNotesError,
  updateResearchNote,
} from "../server/services/researchNotesService";

const owner = { tenantId: "tenant-a", principalId: "user:1", appId: "app-a" };

async function rejectsAsProjectNotFound(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) => error instanceof ResearchNotesError && error.code === "PROJECT_NOT_FOUND");
}

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "temporary DATABASE_URL must be supplied by the disposable migration runner");
  const database = getDb();
  try {
    const project = await createResearchProject({ ...owner, title: "Disposable integration project" });
    const note = await createResearchNote({
      ...owner,
      projectId: project.projectId,
      title: "Synthetic note",
      content: "Disposable PostgreSQL authorization fixture.",
    });
    assert.equal((await listResearchProjects(owner)).length, 2);
    assert.equal((await listResearchNotes({ ...owner, projectId: project.projectId })).length, 1);

    await database.insert(canonicalProjectMemberships).values({
      tenantId: owner.tenantId,
      projectId: project.projectId,
      principalId: "user:2",
      role: "viewer",
    });
    const viewer = { ...owner, principalId: "user:2" };
    assert.equal((await listResearchNotes({ ...viewer, projectId: project.projectId })).length, 1);
    await rejectsAsProjectNotFound(() => createResearchNote({
      ...viewer,
      projectId: project.projectId,
      title: "Viewer write must fail",
      content: "synthetic",
    }));

    const crossTenant = { tenantId: "tenant-b", principalId: "user:1", appId: "app-b" };
    assert.equal((await listResearchProjects(crossTenant)).length, 0);
    await rejectsAsProjectNotFound(() => listResearchNotes({ ...crossTenant, projectId: project.projectId }));

    await database.insert(canonicalProjectMemberships).values({
      tenantId: owner.tenantId,
      projectId: project.projectId,
      principalId: "user:3",
      role: "editor",
      lifecycle: "REVOKED",
      revokedAt: new Date(),
    });
    await rejectsAsProjectNotFound(() => listResearchNotes({ ...owner, principalId: "user:3", projectId: project.projectId }));

    await database.update(canonicalProjectAppBindings)
      .set({ lifecycle: "REVOKED" })
      .where(and(
        eq(canonicalProjectAppBindings.tenantId, owner.tenantId),
        eq(canonicalProjectAppBindings.projectId, project.projectId),
        eq(canonicalProjectAppBindings.appId, owner.appId),
      ));
    await rejectsAsProjectNotFound(() => listResearchNotes({ ...owner, projectId: project.projectId }));
    await database.update(canonicalProjectAppBindings)
      .set({ lifecycle: "ACTIVE" })
      .where(and(
        eq(canonicalProjectAppBindings.tenantId, owner.tenantId),
        eq(canonicalProjectAppBindings.projectId, project.projectId),
        eq(canonicalProjectAppBindings.appId, owner.appId),
      ));

    await database.update(appIdentities)
      .set({ lifecycle: "inactive" })
      .where(and(
        eq(appIdentities.tenantId, owner.tenantId),
        eq(appIdentities.appId, owner.appId),
      ));
    assert.equal((await listResearchProjects(owner)).length, 0);
    await rejectsAsProjectNotFound(() => listResearchNotes({ ...owner, projectId: project.projectId }));

    await database.update(appIdentities)
      .set({ lifecycle: "active" })
      .where(and(
        eq(appIdentities.tenantId, owner.tenantId),
        eq(appIdentities.appId, owner.appId),
      ));
    const updated = await updateResearchNote({
      ...owner,
      projectId: project.projectId,
      noteId: note.noteId,
      title: "Updated synthetic note",
      content: "Summary should be invalidated after edit.",
    });
    assert.equal(updated.aiSummary, null);
    await archiveResearchNote({ ...owner, projectId: project.projectId, noteId: note.noteId });
    assert.equal((await listResearchNotes({ ...owner, projectId: project.projectId })).length, 0);

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      serviceChecks: ["owner CRUD", "viewer read/editor-write denial", "tenant isolation", "revoked membership", "revoked App binding", "inactive App", "summary invalidation", "archive lifecycle"],
    })}\n`);
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error instanceof ResearchNotesError ? error.code : error instanceof Error ? error.message : "SERVICE_INTEGRATION_FAILED" })}\n`);
  process.exitCode = 1;
});
