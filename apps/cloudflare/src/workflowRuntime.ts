import type { WorkflowStep } from "cloudflare:workers";
import type { CanonicalJobEnvelope, CanonicalJobHandler, CloudflareEnvironment, CloudflareWorkflowInstance } from "./contracts";
import { assertBindingSubset } from "./bindings";
import { parseCanonicalEnvelope } from "./queueConsumer";
import { createCanonicalControlPlaneHandler } from "./controlPlaneHandler";
import { assertCanonicalControlPlaneConfiguration, createCanonicalControlPlaneProxyRepository } from "./canonicalControlPlaneProxy";
import { executeCanonicalJob } from "./canonicalExecution";

const canonicalHandler = createCanonicalControlPlaneHandler({ repository: createCanonicalControlPlaneProxyRepository, execute: executeCanonicalJob });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

export function isCanonicalWorkflowEnabled(env: CloudflareEnvironment): boolean {
  return env.CLOUDFLARE_ACTIVATION === "enabled" && env.CLOUDFLARE_JOB_TRANSPORT === "workflows" &&
    Boolean(env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim()) &&
    Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now();
}

export async function canonicalWorkflowInstanceId(dedupeKey: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dedupeKey));
  return `cfw-${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** One bounded durable step: lease tokens, context and business output never
 * become step outputs. Canonical retries remain owned by worker_jobs/outbox. */
export async function runCanonicalWorkflow(
  payload: unknown, env: CloudflareEnvironment, step: Pick<WorkflowStep, "do">, handler: CanonicalJobHandler = canonicalHandler,
) {
  if (!isCanonicalWorkflowEnabled(env)) throw new Error("CLOUDFLARE_WORKFLOW_DISABLED");
  assertCanonicalControlPlaneConfiguration(env);
  const envelope = parseCanonicalEnvelope(payload);
  if (envelope.contract_version !== "feature-186-v1") throw new Error("UNSUPPORTED_CONTRACT_VERSION");
  return step.do("canonical-delivery", { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" }, async () => ({
    jobId: envelope.job_id, businessAttempt: envelope.business_attempt, disposition: await handler(envelope, env),
  }));
}

function assertInstance(instance: CloudflareWorkflowInstance, expectedId: string): void {
  if (!instance || instance.id !== expectedId || typeof instance.status !== "function" || typeof instance.terminate !== "function") {
    throw new Error("CLOUDFLARE_WORKFLOW_ID_MISMATCH");
  }
}

/** Native instance methods differ from the normalized server adapter port.
 * Create first, then inspect on failure: never infer 'missing' from an opaque
 * provider exception or suppress permission/network failures as absence. */
export async function handleCanonicalWorkflowRequest(request: Request, env: CloudflareEnvironment): Promise<Response> {
  if (!isCanonicalWorkflowEnabled(env)) return json({ error: "CLOUDFLARE_WORKFLOW_DISABLED" }, 503);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!env.CLOUDFLARE_RUNTIME_TOKEN?.trim() || provided !== env.CLOUDFLARE_RUNTIME_TOKEN.trim()) return json({ error: "UNAUTHORIZED" }, 401);
  const action = new URL(request.url).pathname.split("/").at(-1);
  if (request.method !== "POST" || !["publish", "inspect", "cancel"].includes(action ?? "")) return json({ error: "NOT_FOUND" }, 404);
  let envelope: CanonicalJobEnvelope | undefined;
  let dedupeKey: string;
  let expectedInstanceId: string | undefined;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > 16 * 1024) return json({ error: "CANONICAL_ENVELOPE_TOO_LARGE" }, 413);
    const input: unknown = JSON.parse(new TextDecoder().decode(body));
    if (action === "publish") {
      envelope = parseCanonicalEnvelope(input);
      if (envelope.contract_version !== "feature-186-v1") return json({ error: "UNSUPPORTED_CONTRACT_VERSION" }, 400);
      dedupeKey = envelope.dedupe_key;
    } else {
      const ref = input as Record<string, unknown> | null;
      if (!ref || typeof ref !== "object" || Array.isArray(ref) || Object.keys(ref).some(key => key !== "dedupe_key" && key !== "workflow_instance_id") ||
          typeof ref.dedupe_key !== "string" || !ref.dedupe_key || ref.dedupe_key.length > 512 ||
          (ref.workflow_instance_id !== undefined && (typeof ref.workflow_instance_id !== "string" || !/^cfw-[a-f0-9]{64}$/.test(ref.workflow_instance_id)))) {
        return json({ error: "CANONICAL_WORKFLOW_REFERENCE_INVALID" }, 400);
      }
      dedupeKey = ref.dedupe_key;
      expectedInstanceId = ref.workflow_instance_id as string | undefined;
    }
  } catch { return json({ error: "CANONICAL_ENVELOPE_INVALID" }, 400); }
  try {
    assertBindingSubset(env, ["HYPERDRIVE", "JOB_WORKFLOW"]);
    assertCanonicalControlPlaneConfiguration(env);
    const id = await canonicalWorkflowInstanceId(dedupeKey);
    if (expectedInstanceId && expectedInstanceId !== id) return json({ error: "CANONICAL_WORKFLOW_REFERENCE_INVALID" }, 400);
    const binding = env.JOB_WORKFLOW!;
    if (action === "publish") {
      let instance: CloudflareWorkflowInstance;
      let duplicate = false;
      try { instance = await binding.create({ id, params: envelope! }); }
      catch {
        instance = await binding.get(id);
        assertInstance(instance, id);
        const observation = await instance.status();
        if (!observation || !observation.status || observation.status === "unknown") throw new Error("CLOUDFLARE_WORKFLOW_UNAVAILABLE");
        duplicate = true;
      }
      assertInstance(instance, id);
      return json({ accepted: true, duplicate, workflowInstanceId: id, dispatchId: envelope!.dispatch_id }, duplicate ? 200 : 202);
    }
    const instance = await binding.get(id);
    assertInstance(instance, id);
    if (action === "cancel") {
      await instance.terminate();
      return json({ workflowInstanceId: id, terminated: true });
    }
    const observation = await instance.status();
    return json({ workflowInstanceId: id, status: observation.status });
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "CLOUDFLARE_WORKFLOW_ID_MISMATCH"
      ? "CLOUDFLARE_WORKFLOW_ID_MISMATCH" : "CLOUDFLARE_WORKFLOW_UNAVAILABLE" },
    error instanceof Error && error.message === "CLOUDFLARE_WORKFLOW_ID_MISMATCH" ? 502 : 503);
  }
}
