import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { COOKIE_NAME } from "@shared/const";
import { createContext } from "../server/_core/context";
import { sdk } from "../server/_core/sdk";
import { router } from "../server/_core/trpc";
import { closeDb } from "../server/db";
import { researchNotesRouter } from "../server/routers/researchNotes";

const appId = "app_research_notes";
const projectId = "miniapp-runtime-project";
const openId = "miniapp-runtime-user";
const otherOpenId = "miniapp-runtime-other-user";
const otherProjectId = "miniapp-runtime-other-project";

async function main() {
  if (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error("FOCUSED_RUNTIME_REQUIRES_TEST_DATABASE_AND_SYNTHETIC_SESSION_SECRET");
  }
  const app = express();
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.use("/trpc", createExpressMiddleware({
    router: router({ researchNotes: researchNotesRouter }),
    createContext,
  }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("LOOPBACK_LISTENER_FAILED");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const client = (cookie?: string) => createTRPCProxyClient<any>({
      transformer: superjson,
      links: [httpLink({
        url: `${baseUrl}/trpc`,
        transformer: superjson,
        headers: { origin: baseUrl, ...(cookie ? { cookie } : {}) },
      })],
    });
    const health = await fetch(`${baseUrl}/healthz`);
    if (!health.ok || (await health.json() as { status?: string }).status !== "ok") throw new Error("LOOPBACK_HEALTH_FAILED");

    let unauthenticatedDenied = false;
    try { await client().researchNotes.listProjects.query({ appId }); }
    catch { unauthenticatedDenied = true; }
    if (!unauthenticatedDenied) throw new Error("UNAUTHENTICATED_REQUEST_ACCEPTED");

    const cookie = `${COOKIE_NAME}=${await sdk.createSessionToken(openId, { name: "Synthetic Runtime User" })}`;
    const authenticated = client(cookie);
    const projects = await authenticated.researchNotes.listProjects.query({ appId });
    if (!projects.some((project: { projectId: string }) => project.projectId === projectId)) throw new Error("AUTHENTICATED_PROJECT_NOT_VISIBLE");

    let otherProjectDenied = false;
    try { await authenticated.researchNotes.listNotes.query({ appId, projectId: otherProjectId }); }
    catch { otherProjectDenied = true; }
    if (!otherProjectDenied) throw new Error("UNMEMBERED_PROJECT_ACCESS_ACCEPTED");

    const otherTenantCookie = `${COOKIE_NAME}=${await sdk.createSessionToken(otherOpenId, { name: "Synthetic Other Tenant User" })}`;
    let otherTenantDenied = false;
    try { await client(otherTenantCookie).researchNotes.listNotes.query({ appId, projectId }); }
    catch { otherTenantDenied = true; }
    if (!otherTenantDenied) throw new Error("CROSS_TENANT_PROJECT_ACCESS_ACCEPTED");

    const runId = crypto.randomUUID();
    const created = await authenticated.researchNotes.createNote.mutate({
      appId, projectId, title: `Runtime ${runId}`, content: `Synthetic authenticated runtime ${runId}`,
    });
    const listed = await authenticated.researchNotes.listNotes.query({ appId, projectId });
    if (!listed.some((note: { noteId: string }) => note.noteId === created.noteId)) throw new Error("CREATED_NOTE_NOT_VISIBLE");
    const updated = await authenticated.researchNotes.updateNote.mutate({
      appId, projectId, noteId: created.noteId, title: `Updated ${runId}`, content: `Updated synthetic runtime ${runId}`,
    });
    if (updated.title !== `Updated ${runId}`) throw new Error("NOTE_UPDATE_NOT_VISIBLE");
    await authenticated.researchNotes.archiveNote.mutate({ appId, projectId, noteId: created.noteId });
    const afterArchive = await authenticated.researchNotes.listNotes.query({ appId, projectId });
    if (afterArchive.some((note: { noteId: string }) => note.noteId === created.noteId)) throw new Error("ARCHIVED_NOTE_STILL_VISIBLE");

    process.stdout.write(`${JSON.stringify({ status: "PASS", scope: "loopback Research Notes API with real session-cookie authentication", health: health.status, unauthenticatedDenied, otherProjectDenied, otherTenantDenied, projectContext: true, operations: ["create", "list", "update", "archive"] })}\n`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDb();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "FAIL", errorCode: error instanceof Error ? error.message : "UNKNOWN" })}\n`);
  process.exitCode = 1;
});
