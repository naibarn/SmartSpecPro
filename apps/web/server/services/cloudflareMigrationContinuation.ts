import { createHash } from "node:crypto";
import superjson from "superjson";
import { z } from "zod";
import { migrationMissionId } from "./cloudflareMigrationLifecycle";

export const CLOUDFLARE_MIGRATION_HANDOFF = "orchestra/tasks/cloudflare-delegated-staging-20261017/origin-completion/production-cutover/implementation/HANDOFF.md";
const inputSchema = z.object({
  tenantId: z.string().trim().min(1), projectId: z.string().uuid(),
  conversationId: z.number().int().positive(),
  checkpoint: z.enum(["M1_DATABASE_REPAIR", "M3_NATIVE_RUNTIME"]),
  budgetCapMinorUnits: z.number().int().positive().max(10_000_000),
}).strict();
export type MigrationEngineeringInput = z.infer<typeof inputSchema>;
type Rpc = (path: string, input: unknown, mutation?: boolean) => Promise<unknown>;

/** Uses the existing authenticated workspace start: Runner readiness, input
 * staging, canonical agent.external_task/outbox, policy and budget admission.
 * This is engineering work; it never derives provider authority from M2. */
export async function startCloudflareMigrationEngineering(raw: MigrationEngineeringInput, rpc: Rpc) {
  const input = inputSchema.parse(raw);
  const mission = await rpc("infrastructure.getCloudflareMigrationMission", {
    tenantId: input.tenantId, projectId: input.projectId, environment: "production",
  }) as { campaignId?: string; migrationMode?: string; handoffRef?: string };
  const campaignId = migrationMissionId(input);
  if (mission.campaignId !== campaignId || mission.migrationMode !== "FIRST_MIGRATION" || mission.handoffRef !== CLOUDFLARE_MIGRATION_HANDOFF)
    throw new Error("MIGRATION_EXISTING_FIRST_MIGRATION_REQUIRED");
  // Budget is deliberately excluded: a retry with changed budget must hit the
  // existing start digest conflict rather than silently mint another job.
  const idempotencyKey = `cf-engineering:${createHash("sha256").update(`${campaignId}|${input.conversationId}|${input.checkpoint}|v1`).digest("hex")}`;
  const prompt = [
    `Continue FIRST_MIGRATION ${campaignId}, checkpoint ${input.checkpoint}.`,
    `Read and update the existing authoritative HandOff: ${CLOUDFLARE_MIGRATION_HANDOFF}.`,
    `Exact tenant ${input.tenantId}; project ${input.projectId}; target smartspec-cloudflare-runtime.`,
    "Preserve accepted M2 HYBRID_INGRESS, Linux origin/rollback, existing VPC, Queues and encrypted checkpoints. No new SPEC or orchestrator.",
    input.checkpoint === "M1_DATABASE_REPAIR"
      ? "Diagnose CF2015 and implement checkpoint-preserving canonical database recovery; verify scoped SQL and tenant-isolation acceptance when valid operation authority exists."
      : "Implement and verify the minimum selected native Node/Python HTTP/API/auth/billing/jobs/database runtime candidate and production/dev separation in isolation.",
    "Perform development implementation, focused tests, integration and durable evidence under existing workspace policy. Do not fabricate Owner identity, grants or jobs, extend expired grants, or directly mutate production traffic/resources. Production operations require their existing independently valid scoped authority.",
    "Continue independently executable engineering until complete or a precise external authority/capacity boundary. Report actual canonical job and acceptance evidence; never claim native migration from ingress health alone.",
  ].join("\n");
  const admitted = await rpc("spec226DevelopmentControl.startWorkspaceRun", {
    conversationId: input.conversationId, mode: "prompt", prompt, idempotencyKey,
    budgetCapMinorUnits: input.budgetCapMinorUnits, provider: "codex",
  }, true) as { runId?: string; jobId?: string; dispatchStatus?: string; authorization?: unknown };
  if (!admitted.runId || !admitted.jobId) throw new Error("MIGRATION_ENGINEERING_CANONICAL_JOB_REQUIRED");
  const canonical = await rpc("spec226DevelopmentControl.get", { runId: admitted.runId }) as { runId?: string; workerJobId?: string; state?: string };
  if (canonical.runId !== admitted.runId || canonical.workerJobId !== admitted.jobId)
    throw new Error("MIGRATION_ENGINEERING_ADMISSION_UNKNOWN");
  return { campaignId, checkpoint: input.checkpoint, handoffRef: CLOUDFLARE_MIGRATION_HANDOFF,
    runId: admitted.runId, jobId: admitted.jobId, dispatchStatus: admitted.dispatchStatus,
    authorization: admitted.authorization, canonicalState: canonical.state,
    // Admission is not proof that the Runner claimed or resumed execution.
    executionVerified: false, idempotencyKey };
}

/** Normal user authentication only. Never reads browser cookies, environment
 * application secrets, or the database to manufacture a request identity. */
export function createMigrationEngineeringRpc(baseUrl: string, bearer: string | undefined, request: typeof fetch = fetch): Rpc {
  if (!bearer?.trim()) throw new Error("MIGRATION_ENGINEERING_AUTHENTICATION_REQUIRED");
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("MIGRATION_ENGINEERING_HTTPS_ENDPOINT_REQUIRED");
  return async (path, input, mutation = false) => {
    const url = new URL(`/trpc/${path}`, base.origin);
    const payload = JSON.stringify(superjson.serialize(input));
    if (!mutation) url.searchParams.set("input", payload);
    const response = await request(url, { method: mutation ? "POST" : "GET", redirect: "error",
      headers: { authorization: `Bearer ${bearer.trim()}`, "content-type": "application/json" },
      ...(mutation ? { body: payload } : {}), signal: AbortSignal.timeout(30_000) });
    const envelope = await response.json() as { result?: { data?: ReturnType<typeof superjson.serialize> }; error?: { json?: { data?: { code?: string } } } };
    if (!response.ok || !envelope.result?.data)
      throw new Error(`MIGRATION_ENGINEERING_RPC_HTTP_${response.status}:${envelope.error?.json?.data?.code ?? "REQUEST_FAILED"}`);
    return superjson.deserialize(envelope.result.data);
  };
}
