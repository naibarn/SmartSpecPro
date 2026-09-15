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
