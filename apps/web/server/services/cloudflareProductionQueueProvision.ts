import { getDb } from "../db";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import type { JobExecutor } from "./jobExecutor";

export const CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT = "cloudflare-production-queue-provision-v1" as const;
export const CLOUDFLARE_PRODUCTION_QUEUE_JOB = "cloudflare.production.queue.provision" as const;
export const CLOUDFLARE_PRODUCTION_QUEUE_NAME = "smartspec-canonical-job-queue-production" as const;
export const CLOUDFLARE_PRODUCTION_QUEUE_DLQ_NAME = "smartspec-canonical-job-queue-production-dlq" as const;

export class CloudflareProductionQueueError extends Error {
  readonly class: "retryable" | "permanent" | "unknown";
  constructor(readonly diagnosticCode: string, errorClass: "retryable" | "permanent" | "unknown" = "permanent", readonly httpStatus?: number) {
    super(diagnosticCode);
    this.name = "CloudflareProductionQueueError";
    this.class = errorClass;
  }
}

export function productionQueueName(tenantId: string, projectId: string) {
  if (!tenantId || !projectId) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_SCOPE_INVALID");
  // This single production control-plane queue is intentionally shared across
  // application tenants. Keep its name in sync with wrangler.production.jsonc;
  // tenant/project scope is still enforced by the canonical job and DB rows.
  return CLOUDFLARE_PRODUCTION_QUEUE_NAME;
}

type Envelope = { success?: boolean; result?: unknown; result_info?: { total_pages?: number }; errors?: Array<{ code?: number | string }> };

/** Creates the deterministic Production Queue pair and verifies provider readback.
 * It cannot bind a Worker, change routes, or shift traffic. */
export async function createProductionQueue(input: {
  tenantId: string;
  projectId: string;
  accountRef: string;
  token: string;
  assertAuthorized: () => Promise<void>;
  fetchImpl?: typeof fetch;
}) {
  if (!/^[a-f0-9]{32}$/.test(input.accountRef) || !input.token) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_CREDENTIAL_INVALID");
  const name = productionQueueName(input.tenantId, input.projectId);
  const root = `https://api.cloudflare.com/client/v4/accounts/${input.accountRef}/queues`;
  const fetchImpl = input.fetchImpl ?? fetch;
  let requests = 0;
  const request = async (url: string, method: "GET" | "POST", body?: unknown): Promise<{ status: number; result: any; totalPages: number }> => {
    await input.assertAuthorized();
    if (++requests > 16) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_REQUEST_BUDGET_EXCEEDED");
    let response: Response;
    try {
      response = await fetchImpl(url, { method, headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json", accept: "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    } catch {
      // The stable queue name makes a retry safe: every attempt inventories
      // first and reuses the exact queue if the prior POST reached Cloudflare.
      throw new CloudflareProductionQueueError(method === "POST" ? "CLOUDFLARE_PRODUCTION_QUEUE_WRITE_UNCERTAIN" : "CLOUDFLARE_PRODUCTION_QUEUE_READ_UNAVAILABLE", "retryable");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 256 * 1024) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_RESPONSE_INVALID");
    let envelope: Envelope;
    try { envelope = JSON.parse(new TextDecoder().decode(bytes)) as Envelope; }
    catch { throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_RESPONSE_INVALID"); }
    if (!response.ok || envelope.success !== true) {
      const providerCode = envelope.errors?.[0]?.code;
      const safeProviderCode = typeof providerCode === "number" && Number.isSafeInteger(providerCode) && providerCode >= 0 && providerCode <= 999_999
        ? `_CF_${providerCode}` : "";
      const diagnosticCode = `CLOUDFLARE_PRODUCTION_QUEUE_HTTP_${response.status}${safeProviderCode}`;
      if (response.status >= 500 || (method === "POST" && response.status === 409)) {
        throw new CloudflareProductionQueueError(diagnosticCode, "retryable", response.status);
      }
      throw new CloudflareProductionQueueError(diagnosticCode, "permanent", response.status);
    }
    return { status: response.status, result: envelope.result, totalPages: Number(envelope.result_info?.total_pages ?? 1) };
  };

  // The deterministic name makes creation idempotent across retries and is
  // scoped to this tenant/project. Existing Staging and unrelated queues are
  // never selected.
  const pages: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = await request(`${root}?per_page=100&page=${page}`, "GET");
    if (!Array.isArray(result.result)) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_INVENTORY_INVALID");
    pages.push(...result.result);
    const total = result.totalPages;
    if (!Number.isSafeInteger(total) || total < 1 || total > 10) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_INVENTORY_TOO_LARGE");
    if (page >= total) break;
    if (page === 10) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_INVENTORY_INCOMPLETE");
  }
  const ensureQueue = async (queueName: string) => {
    const matches = pages.filter(queue => queue?.queue_name === queueName);
    if (matches.length > 1) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_NAME_AMBIGUOUS");
    let queueId = typeof matches[0]?.queue_id === "string" ? matches[0].queue_id : null;
    if (!queueId) {
      await input.assertAuthorized();
      const created = await request(root, "POST", { queue_name: queueName });
      queueId = typeof created.result?.queue_id === "string" ? created.result.queue_id : null;
    }
    if (!queueId || !/^[a-f0-9-]{16,64}$/i.test(queueId)) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_CREATE_RESPONSE_INVALID");
    const readback = await request(`${root}/${encodeURIComponent(queueId)}`, "GET");
    // A retry after Worker binding must accept the already attached consumer;
    // the provisioning job owns queue identity, not consumer lifecycle.
    if (readback.result?.queue_id !== queueId || readback.result?.queue_name !== queueName ||
        (readback.result?.consumers_total_count !== undefined && (!Number.isSafeInteger(readback.result.consumers_total_count) || readback.result.consumers_total_count < 0))) {
      throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_READBACK_MISMATCH");
    }
    return queueId;
  };
  const queueId = await ensureQueue(name);
  const deadLetterQueueId = await ensureQueue(CLOUDFLARE_PRODUCTION_QUEUE_DLQ_NAME);
  await input.assertAuthorized();
  return { accountRef: input.accountRef, queueId, queueName: name, deadLetterQueueId, deadLetterQueueName: CLOUDFLARE_PRODUCTION_QUEUE_DLQ_NAME, environment: "production" as const,
    providerConfigurationVerified: true as const, workerBound: false as const, trafficShifted: false as const };
}

export const createCloudflareProductionQueueExecutor = (fetchImpl?: typeof fetch): JobExecutor => async ({ context, lease, reporter }) => {
  if (context.jobType !== CLOUDFLARE_PRODUCTION_QUEUE_JOB || context.contractVersion !== CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT) {
    throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_JOB_INVALID");
  }
  const input = context.input as Record<string, unknown>;
  if (!input || Object.keys(input).length !== 4 || input.contractVersion !== CLOUDFLARE_PRODUCTION_QUEUE_CONTRACT ||
      typeof input.projectId !== "string" || !input.projectId.trim() || input.targetId !== "smartspec-cloudflare-runtime" || input.environment !== "production") {
    throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_JOB_INVALID");
  }
  const db = getDb();
  if (!db) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_DATABASE_UNAVAILABLE");
  const scope = { tenantId: context.tenantId, projectId: input.projectId, provider: "cloudflare", environment: "production" } as const;
  const target = await resolveCloudflareProductionDeploymentTarget({ db, tenantId: context.tenantId, projectId: input.projectId });
  if (!target) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_TARGET_DENIED");
  const assertAuthorized = async () => {
    await reporter.assertActive(lease);
    const current = await resolveCloudflareProductionDeploymentTarget({ db, tenantId: context.tenantId, projectId: input.projectId as string });
    if (!current || current.accountRef !== target.accountRef || current.credentialRef !== target.credentialRef || current.workerRef !== target.workerRef) {
      throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_AUTHORITY_CHANGED");
    }
  };
  const result = await withCloudflareDeploymentCredential(db, { identity: scope, credentialRef: target.credentialRef }, async token =>
    createProductionQueue({ tenantId: context.tenantId, projectId: input.projectId as string,
      accountRef: target.accountRef, token, assertAuthorized, fetchImpl }));
  if (result.status !== "CONFIGURED" || !result.value) throw new CloudflareProductionQueueError("CLOUDFLARE_PRODUCTION_QUEUE_CREDENTIAL_UNAVAILABLE");
  return { output: result.value };
};
