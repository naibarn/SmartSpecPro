import { assertBindingReadiness, assertBindingSubset, inspectBindingReadiness } from "./bindings";
import { createFailClosedConsumer, CloudflareQueueConsumer, parseCanonicalEnvelope } from "./queueConsumer";
import { publishCanonicalQueueMessage } from "./nativeAdapters";
import type {
  CanonicalJobHandler,
  CanonicalControlPlaneRepository,
  CanonicalWorkerExecution,
  CanonicalPublicationRegistry,
  CloudflareEnvironment,
  ProviderPollSweepHandler,
  QueueBatch,
  QuarantineHandler,
  ScheduledController,
  ScheduledJobSweepHandler,
} from "./contracts";
import { createCanonicalControlPlaneHandler } from "./controlPlaneHandler";

const failClosedConsumer = createFailClosedConsumer();
const MAX_PUBLISH_BODY_BYTES = 16 * 1024;
const MAX_SEARCH_CACHE_BODY_BYTES = 32 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isAuthorizedDispatch(request: Request, env: CloudflareEnvironment): boolean {
  const expected = env.CLOUDFLARE_RUNTIME_TOKEN?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && provided && expected === provided);
}

function isAuthorizedSearchCache(request: Request, env: CloudflareEnvironment): boolean {
  const expected = env.CLOUDFLARE_SEARCH_CACHE_TOKEN?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && provided && expected === provided);
}

function validSearchCacheId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isCachedSearchResult(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.retrievedAt !== "string" || entry.retrievedAt.length > 64 || typeof entry.queryHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.queryHash)) return false;
  if (!Array.isArray(entry.snippets) || entry.snippets.length > 100 || !Array.isArray(entry.citations) || entry.citations.length > 100) return false;
  return entry.snippets.every((item) => item && typeof item === "object" &&
    typeof (item as Record<string, unknown>).title === "string" && ((item as Record<string, string>).title.length <= 1000) &&
    typeof (item as Record<string, unknown>).url === "string" && ((item as Record<string, string>).url.length <= 2048) &&
    typeof (item as Record<string, unknown>).text === "string" && ((item as Record<string, string>).text.length <= 12000)) &&
    entry.citations.every((item) => item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).url === "string" && ((item as Record<string, string>).url.length <= 2048));
}

function searchCacheKey(scope: "tenant" | "user", id: string, queryHash: string): string {
  return `smartspec:search:v1:${scope}:${id}:${queryHash}`;
}

export function createCloudflareWorker(
  handler?: CanonicalJobHandler,
  quarantine?: QuarantineHandler,
  providerPollSweep?: ProviderPollSweepHandler,
  scheduledJobSweep?: ScheduledJobSweepHandler,
  controlPlane?: { repository: CanonicalControlPlaneRepository; execute: CanonicalWorkerExecution },
  publicationRegistry?: CanonicalPublicationRegistry,
) {
  const resolvedHandler = handler ?? (controlPlane ? createCanonicalControlPlaneHandler(controlPlane) : undefined);
  const consumer = resolvedHandler ? new CloudflareQueueConsumer(resolvedHandler, quarantine) : failClosedConsumer;
  const jobHandlerConfigured = Boolean(resolvedHandler);
  return {
    async fetch(request: Request, env: CloudflareEnvironment): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/healthz") return json({ ok: true, service: "smartspec-cloudflare-runtime" });
      if (url.pathname === "/readyz") {
        const readiness = inspectBindingReadiness(env);
        const ready = readiness.ready && jobHandlerConfigured;
        return json({
          ok: ready,
          readiness: { ...readiness, required: readiness.required, jobHandlerConfigured },
        }, ready ? 200 : 503);
      }
      if (url.pathname === "/internal/cache/search" && request.method === "POST") {
        if (!isAuthorizedSearchCache(request, env)) return json({ error: "UNAUTHORIZED" }, 401);
        if (!env.SEARCH_RESULT_CACHE || typeof env.SEARCH_RESULT_CACHE.get !== "function" || typeof env.SEARCH_RESULT_CACHE.put !== "function") {
          return json({ error: "SEARCH_CACHE_BINDING_NOT_READY" }, 503);
        }
        try {
          const body = await request.arrayBuffer();
          if (body.byteLength > MAX_SEARCH_CACHE_BODY_BYTES) return json({ error: "SEARCH_CACHE_REQUEST_TOO_LARGE" }, 413);
          let input: Record<string, unknown>;
          try { input = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>; }
          catch { return json({ error: "SEARCH_CACHE_REQUEST_INVALID" }, 400); }
          if (input.operation === "probe") {
            const probeId = crypto.randomUUID();
            const probeKey = `smartspec:search:v1:probe:${probeId}`;
            await env.SEARCH_RESULT_CACHE.put(probeKey, probeId, { expirationTtl: 60 });
            if (await env.SEARCH_RESULT_CACHE.get(probeKey) !== probeId) return json({ error: "SEARCH_CACHE_PROBE_FAILED" }, 503);
            return json({ ready: true });
          }
          if ((input.operation !== "get" && input.operation !== "put") ||
              !["tenant", "user"].includes(String(input.scope)) || !validSearchCacheId(input.id) ||
              typeof input.queryHash !== "string" || !/^[a-f0-9]{64}$/.test(input.queryHash)) {
            return json({ error: "SEARCH_CACHE_REQUEST_INVALID" }, 400);
          }
          const key = searchCacheKey(input.scope as "tenant" | "user", input.id, input.queryHash);
          if (input.operation === "get") {
            const value = await env.SEARCH_RESULT_CACHE.get(key);
            if (value === null) return json({ entry: null });
            try { return json({ entry: JSON.parse(value) }); }
            catch { return json({ entry: null }); }
          }
          if (!isCachedSearchResult(input.entry) ||
              typeof input.ttlSeconds !== "number" || !Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 3600) {
            return json({ error: "SEARCH_CACHE_REQUEST_INVALID" }, 400);
          }
          await env.SEARCH_RESULT_CACHE.put(key, JSON.stringify(input.entry), { expirationTtl: input.ttlSeconds });
          return json({ stored: true });
        } catch {
          return json({ error: "SEARCH_CACHE_UNAVAILABLE" }, 503);
        }
      }
      if (url.pathname === "/internal/jobs/publish" && request.method === "POST") {
        if (env.CLOUDFLARE_ACTIVATION !== "enabled") return json({ error: "CLOUDFLARE_RUNTIME_DISABLED" }, 503);
        if (!isAuthorizedDispatch(request, env)) return json({ error: "UNAUTHORIZED" }, 401);
        try {
          assertBindingSubset(env, ["HYPERDRIVE", "JOB_QUEUE"]);
          const body = await request.arrayBuffer();
          if (body.byteLength > MAX_PUBLISH_BODY_BYTES) return json({ error: "CANONICAL_ENVELOPE_TOO_LARGE" }, 413);
          const envelope = parseCanonicalEnvelope(JSON.parse(new TextDecoder().decode(body)));
          if (publicationRegistry && await publicationRegistry.has(envelope.dedupe_key)) {
            return json({ accepted: true, duplicate: true, dispatchId: envelope.dedupe_key }, 200);
          }
          await publishCanonicalQueueMessage(env, envelope);
          await publicationRegistry?.record(envelope.dedupe_key);
          return json({ accepted: true, dispatchId: envelope.dedupe_key }, 202);
        } catch (error) {
          const reason = error instanceof Error ? error.message.slice(0, 160) : "CANONICAL_PUBLISH_REJECTED";
          const status = reason === "CANONICAL_ENVELOPE_INVALID" || reason === "CANONICAL_ENVELOPE_TOO_LARGE"
            ? 400
            : reason.startsWith("CLOUDFLARE_BINDINGS_NOT_READY") ? 503 : 502;
          return json({ error: reason }, status);
        }
      }
      return json({ error: "NOT_FOUND" }, 404);
    },

    async queue(batch: QueueBatch, env: CloudflareEnvironment): Promise<void> {
      await consumer.handleBatch(batch, env);
    },

    async scheduled(controller: ScheduledController, env: CloudflareEnvironment): Promise<void> {
      if (env.CLOUDFLARE_ACTIVATION !== "enabled") return;
      assertBindingReadiness(env);
      const input = { scheduledTime: controller.scheduledTime, maxRows: 100 };
      if (providerPollSweep) {
        const result = await providerPollSweep(input, env);
        if (result === "retry") {
          console.warn("[Cloudflare] provider poll sweep requested retry", input);
        }
      }
      if (scheduledJobSweep) {
        const result = await scheduledJobSweep(input, env);
        if (result === "retry") {
          console.warn("[Cloudflare] scheduled job sweep requested retry", input);
        }
      }
    },
  };
}

const worker = createCloudflareWorker();

export default worker;
