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
export type MigrationEngineeringRpc = (path: string, input: unknown, mutation?: boolean) => Promise<unknown>;

/** Uses the existing authenticated workspace start: Runner readiness, input
 * staging, canonical agent.external_task/outbox, policy and budget admission.
 * This is engineering work; it never derives provider authority from M2. */
export async function startCloudflareMigrationEngineering(raw: MigrationEngineeringInput, rpc: MigrationEngineeringRpc) {
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
export function createMigrationEngineeringRpc(baseUrl: string, bearer: string | undefined, request: typeof fetch = fetch): MigrationEngineeringRpc {
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


/** Existing owner-authorized workspace binding only; no inferred conversation,
 * Runner identity, repository SHA or direct database writes. */
export async function prepareMigrationEngineeringWorkspace(input: {
  tenantId: string; conversationId: number; runnerId?: string; workspaceId?: string; expectedRevision?: string;
}, rpc: MigrationEngineeringRpc) {
  z.object({ tenantId: z.string().min(1), conversationId: z.number().int().positive(),
    runnerId: z.string().min(1).optional(), workspaceId: z.string().min(1).optional(),
    expectedRevision: z.string().regex(/^[a-f0-9]{40,64}$/).optional() }).strict().parse(input);
  if (Boolean(input.runnerId) !== Boolean(input.workspaceId)) throw new Error("MIGRATION_RUNNER_AND_WORKSPACE_REQUIRED");
  type Binding = { workspace: { tenantId: string; conversationId: number; runnerId: string; workspaceId: string }; availability: { available: boolean } };
  const query = { conversationId: input.conversationId };
  let binding = await rpc("spec226DevelopmentControl.getConversationWorkspace", query) as Binding | null;
  if (binding && (binding.workspace.tenantId !== input.tenantId || binding.workspace.conversationId !== input.conversationId))
    throw new Error("MIGRATION_WORKSPACE_SCOPE_MISMATCH");
  if (input.runnerId && input.workspaceId) {
    if (!input.expectedRevision) throw new Error("MIGRATION_WORKSPACE_REVISION_REQUIRED");
    const inventory = await rpc("spec226DevelopmentControl.availableWorkspaces", {}) as { workspaces: Array<{ runnerId: string; workspaceId: string; gitHead: string | null }> };
    const selected = inventory.workspaces.find(item => item.runnerId === input.runnerId && item.workspaceId === input.workspaceId);
    if (!selected || selected.gitHead !== input.expectedRevision) throw new Error("MIGRATION_TRUSTED_WORKSPACE_REVISION_MISMATCH");
    if (!binding || binding.workspace.runnerId !== input.runnerId || binding.workspace.workspaceId !== input.workspaceId || !binding.availability.available) {
      await rpc("spec226DevelopmentControl.bindConversationWorkspace", { ...query, runnerId: input.runnerId, workspaceId: input.workspaceId }, true);
      binding = await rpc("spec226DevelopmentControl.getConversationWorkspace", query) as Binding | null;
    }
  }
  if (!binding || binding.workspace.tenantId !== input.tenantId || binding.workspace.conversationId !== input.conversationId || !binding.availability.available)
    throw new Error("MIGRATION_AUTHENTICATED_WORKSPACE_BINDING_REQUIRED");
  if (input.runnerId && (binding.workspace.runnerId !== input.runnerId || binding.workspace.workspaceId !== input.workspaceId))
    throw new Error("MIGRATION_WORKSPACE_BINDING_READBACK_MISMATCH");
  const readiness = await rpc("spec226DevelopmentControl.workspaceRunnerReadiness", query) as { ready?: boolean; code?: string } | null;
  if (!readiness?.ready) throw new Error(`MIGRATION_RUNNER_NOT_READY:${/^[A-Z0-9_]{1,100}$/.test(readiness?.code ?? "") ? readiness!.code : "UNAVAILABLE"}`);
  return { workspace: binding.workspace, readiness };
}

/** Uses the already registered first-party device flow. Tokens stay in memory;
 * neither bearer nor refresh token is written or printed. Owner approval is
 * performed by the normal authenticated /auth/device page. */
export async function authenticateMigrationEngineeringDevice(baseUrl: string,
  notify: (verification: { verificationUrl: string; userCode: string; expiresIn: number }) => void,
  ports: { request?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("MIGRATION_ENGINEERING_HTTPS_ENDPOINT_REQUIRED");
  const request = ports.request ?? fetch;
  const now = ports.now ?? Date.now;
  const sleep = ports.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  async function post(path: string, body: unknown) {
    const response = await request(new URL(path, base.origin), { method: "POST", redirect: "error",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    let data: Record<string, unknown>;
    try { data = await response.json() as Record<string, unknown>; } catch { throw new Error("MIGRATION_DEVICE_RESPONSE_INVALID"); }
    return { response, data };
  }
  // Existing mcp:read consent is discovery only. It must never be treated
  // as permission to bind a workspace or start a development run.
  const { response, data } = await post("/auth/device/code", { scopes: ["mcp:read"] });
  if (!response.ok || typeof data.device_code !== "string" || typeof data.user_code !== "string" ||
      typeof data.expires_in !== "number" || data.expires_in <= 0 || data.expires_in > 3600)
    throw new Error("MIGRATION_DEVICE_AUTH_START_FAILED");
  const verificationUrl = new URL("/auth/device", base.origin);
  verificationUrl.searchParams.set("user_code", data.user_code);
  notify({ verificationUrl: verificationUrl.href, userCode: data.user_code, expiresIn: data.expires_in });
  const deadline = now() + data.expires_in * 1000;
  let interval = Math.max(5, typeof data.interval === "number" ? Math.min(data.interval, 60) : 5);
  while (now() < deadline) {
    await sleep(Math.min(interval * 1000, deadline - now()));
    if (now() >= deadline) break;
    const poll = await post("/auth/device/token", { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: data.device_code });
    if (poll.response.ok && typeof poll.data.access_token === "string" && poll.data.token_type === "Bearer") {
      const scopes = Array.isArray(poll.data.scope) ? poll.data.scope : typeof poll.data.scope === "string" ? poll.data.scope.split(" ") : [];
      if (!scopes.includes("development:run")) throw new Error("MIGRATION_DEVELOPMENT_CONSENT_REQUIRED");
      return poll.data.access_token;
    }
    if (poll.data.error === "authorization_pending") continue;
    if (poll.data.error === "slow_down") { interval = Math.min(interval + 5, 60); continue; }
    throw new Error("MIGRATION_DEVICE_AUTH_DENIED_OR_EXPIRED");
  }
  throw new Error("MIGRATION_DEVICE_AUTH_EXPIRED");
}
