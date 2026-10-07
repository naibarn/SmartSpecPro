import { createTRPCProxyClient, httpLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";

const SUMMARY_FLAG = "--with-summary";
let smokePhase = "startup";

function usage(): void {
  process.stdout.write(
    "Research Notes non-production smoke runner\n" +
      "Required: RESEARCH_NOTES_BASE_URL, RESEARCH_NOTES_ENVIRONMENT, RESEARCH_NOTES_APP_ID, RESEARCH_NOTES_PROJECT_ID, and either RESEARCH_NOTES_SESSION_COOKIE or RESEARCH_NOTES_AUTH_BEARER\n" +
      `Optional: RESEARCH_NOTES_CROSS_TENANT_SESSION_COOKIE or RESEARCH_NOTES_CROSS_TENANT_AUTH_BEARER for isolation checks; ${SUMMARY_FLAG} requires RESEARCH_NOTES_ALLOW_PROVIDER_COST=true\n`,
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${name}`);
  return value;
}

function safeError(error: unknown): string {
  if (error instanceof TRPCClientError) return error.data?.code ?? "TRPC_REQUEST_FAILED";
  if (error instanceof Error && error.name === "AbortError") return "REQUEST_TIMEOUT";
  if (error instanceof Error && error.message === "PROVIDER_COST_GATE_REQUIRED") return error.message;
  return "REQUEST_FAILED";
}

async function main(): Promise<void> {
  smokePhase = "configuration";
  if (process.argv.includes("--help")) return usage();

  const environment = requiredEnv("RESEARCH_NOTES_ENVIRONMENT").toLowerCase();
  if (!["development", "test", "staging"].includes(environment)) {
    throw new Error("Smoke runner refuses environments other than development, test, or staging");
  }
  const baseUrl = new URL(requiredEnv("RESEARCH_NOTES_BASE_URL"));
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost" && baseUrl.hostname !== "127.0.0.1") {
    throw new Error("Base URL must use HTTPS unless it is loopback");
  }
  const appId = requiredEnv("RESEARCH_NOTES_APP_ID");
  const projectId = requiredEnv("RESEARCH_NOTES_PROJECT_ID");
  const cookie = process.env.RESEARCH_NOTES_SESSION_COOKIE?.trim();
  const bearer = process.env.RESEARCH_NOTES_AUTH_BEARER?.trim();
  if (!cookie && !bearer) throw new Error("Provide an authenticated platform session cookie or user Bearer credential");
  const crossTenantCookie = process.env.RESEARCH_NOTES_CROSS_TENANT_SESSION_COOKIE?.trim();
  const crossTenantBearer = process.env.RESEARCH_NOTES_CROSS_TENANT_AUTH_BEARER?.trim();
  const includeSummary = process.argv.includes(SUMMARY_FLAG);
  if (includeSummary && process.env.RESEARCH_NOTES_ALLOW_PROVIDER_COST !== "true") {
    throw new Error("PROVIDER_COST_GATE_REQUIRED");
  }

  const makeClient = (authBearer?: string, sessionCookie?: string) => createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [httpLink({
      url: new URL("/trpc", baseUrl).toString(),
      transformer: superjson,
      headers: {
        ...(authBearer ? { authorization: `Bearer ${authBearer}` } : { cookie: sessionCookie }),
        origin: baseUrl.origin,
      },
    })],
  });
  const client = makeClient(bearer, cookie);
  const crossTenantClient = crossTenantBearer || crossTenantCookie
    ? makeClient(crossTenantBearer, crossTenantCookie)
    : undefined;
  smokePhase = "health_check";
  const health = await fetch(new URL("/healthz", baseUrl), { signal: AbortSignal.timeout(5_000) });
  if (!health.ok) throw new Error(`Liveness probe returned HTTP ${health.status}`);
  const healthBody = await health.json() as { status?: string };
  if (healthBody.status !== "ok") throw new Error("Liveness probe payload is not healthy");

  smokePhase = "list_projects";
  const projects = await client.researchNotes.listProjects.query({ appId });
  if (!projects.some((project) => project.projectId === projectId)) {
    throw new Error("Configured project is not visible to the authenticated principal");
  }

  smokePhase = "create_note";
  const runId = crypto.randomUUID();
  const created = await client.researchNotes.createNote.mutate({
    appId,
    projectId,
    title: `Research Notes smoke ${runId}`,
    content: `Synthetic smoke-test note ${runId}. No customer data.`,
  });
  let archived = false;
  try {
    smokePhase = "list_created_note";
    const visible = await client.researchNotes.listNotes.query({ appId, projectId });
    if (!visible.some((note) => note.noteId === created.noteId)) throw new Error("Created note is not visible to its author");
    if (crossTenantClient) {
      let leaked = false;
      try {
        const otherTenantNotes = await crossTenantClient.researchNotes.listNotes.query({ appId, projectId });
        leaked = otherTenantNotes.some((note) => note.noteId === created.noteId);
      } catch {
        // A denial or hidden resource is the expected isolation result.
      }
      if (leaked) throw new Error("Cross-tenant principal could read the smoke note");
    }
    smokePhase = "update_note";
    const updated = await client.researchNotes.updateNote.mutate({
      appId,
      projectId,
      noteId: created.noteId,
      title: `Research Notes smoke ${runId}`,
      content: `Updated synthetic smoke-test note ${runId}.`,
    });
    if (updated.aiSummary) throw new Error("Editing a note retained a stale summary");

    let summaryStatus: string | undefined;
    if (includeSummary) {
      smokePhase = "request_summary";
      const job = await client.researchNotes.requestSummary.mutate({ appId, projectId, noteId: created.noteId });
      if (crossTenantClient) {
        let visibleToOtherTenant = false;
        try {
          await crossTenantClient.researchNotes.summaryJob.query({ appId, projectId, noteId: created.noteId, jobId: job.jobId });
          visibleToOtherTenant = true;
        } catch {
          // A denial or hidden job is the expected isolation result.
        }
        if (visibleToOtherTenant) throw new Error("Cross-tenant principal could read the summary job");
      }
      const deadline = Date.now() + 120_000;
      do {
        const current = await client.researchNotes.summaryJob.query({ appId, projectId, noteId: created.noteId, jobId: job.jobId });
        summaryStatus = current.status;
        if (["completed", "succeeded", "failed", "cancelled", "canceled", "expired"].includes(summaryStatus)) break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      } while (Date.now() < deadline);
      if (!summaryStatus || !["completed", "succeeded"].includes(summaryStatus)) {
        throw new Error(`Summary job did not complete successfully: ${summaryStatus ?? "timeout"}`);
      }
    }

    smokePhase = "archive_note";
    await client.researchNotes.archiveNote.mutate({ appId, projectId, noteId: created.noteId });
    archived = true;
    process.stdout.write(`${JSON.stringify({ status: "PASS", scope: "non-production Research Notes CRUD", summaryStatus: summaryStatus ?? "NOT_RUN", noteId: created.noteId })}\n`);
  } finally {
    if (!archived) {
      smokePhase = "cleanup_archive";
      try { await client.researchNotes.archiveNote.mutate({ appId, projectId, noteId: created.noteId }); }
      catch { process.stderr.write("Cleanup archive failed; inspect only the synthetic note identified by this run.\n"); }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "FAIL", errorCode: `${smokePhase}:${safeError(error)}` })}\n`);
  process.exitCode = 1;
});
