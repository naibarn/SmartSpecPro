import { assertBindingSubset } from "./bindings";
import type {
  CanonicalJobEnvelope,
  CanonicalJobHandler,
  CloudflareEnvironment,
  QueueBatch,
  QueueMessage,
  QuarantineHandler,
} from "./contracts";

const MAX_ENVELOPE_STRING_BYTES = 512;
const MAX_ROUTING_BYTES = 4_096;
const ALLOWED_ROUTING_KEYS = new Set(["queue", "region", "workflowName", "containerClass", "workerApp", "requiredCapabilities"]);
const FORBIDDEN_ROUTING_VALUE = /(?:https?:|data:|file:|postgres(?:ql)?:|signed.?url)/i;
const FORBIDDEN_ROUTING_KEY = /(?:secret|token|password|credential|authorization|private.?key)/i;
const TRANSIENT_CONTROL_PLANE_ERROR = /(?:DATABASE|HYPERDRIVE|POSTGRES|SERIALIZATION|DEADLOCK|TIMEOUT|NETWORK|UNAVAILABLE|CONNECTION|PUBLISH_HTTP_5\d\d)/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).byteLength <= MAX_ENVELOPE_STRING_BYTES;
}

function assertSafeRoutingValue(value: unknown, depth = 0): void {
  if (depth > 4) throw new Error("CANONICAL_ENVELOPE_INVALID");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CANONICAL_ENVELOPE_INVALID");
    return;
  }
  if (typeof value === "string") {
    if (!boundedString(value) || FORBIDDEN_ROUTING_VALUE.test(value)) throw new Error("CANONICAL_ENVELOPE_INVALID");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) throw new Error("CANONICAL_ENVELOPE_TOO_LARGE");
    value.forEach(item => assertSafeRoutingValue(item, depth + 1));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.length > 80 || FORBIDDEN_ROUTING_KEY.test(key)) throw new Error("CANONICAL_ENVELOPE_INVALID");
      assertSafeRoutingValue(child, depth + 1);
    }
    return;
  }
  throw new Error("CANONICAL_ENVELOPE_INVALID");
}

export function parseCanonicalEnvelope(body: unknown): CanonicalJobEnvelope {
  if (!isObject(body)) throw new Error("CANONICAL_ENVELOPE_INVALID");
  const envelope = body as Partial<CanonicalJobEnvelope>;
  if (!boundedString(envelope.job_id) || !boundedString(envelope.contract_version) || !boundedString(envelope.dispatch_id) || !boundedString(envelope.dedupe_key)) {
    throw new Error("CANONICAL_ENVELOPE_INVALID");
  }
  const businessAttempt = envelope.business_attempt;
  if (typeof businessAttempt !== "number" || !Number.isInteger(businessAttempt) || businessAttempt < 1) throw new Error("CANONICAL_ENVELOPE_INVALID");
  if (envelope.attempt_id !== null && envelope.attempt_id !== undefined && !boundedString(envelope.attempt_id)) {
    throw new Error("CANONICAL_ENVELOPE_INVALID");
  }
  if (!isObject(envelope.routing_metadata)) throw new Error("CANONICAL_ENVELOPE_INVALID");
  for (const [key, value] of Object.entries(envelope.routing_metadata)) {
    if (!ALLOWED_ROUTING_KEYS.has(key) || FORBIDDEN_ROUTING_KEY.test(key)) {
      throw new Error("CANONICAL_ENVELOPE_INVALID");
    }
    assertSafeRoutingValue(value);
  }
  const serialized = JSON.stringify(envelope.routing_metadata);
  if (new TextEncoder().encode(serialized).byteLength > MAX_ROUTING_BYTES) throw new Error("CANONICAL_ENVELOPE_TOO_LARGE");
  return {
    job_id: envelope.job_id,
    business_attempt: businessAttempt,
    attempt_id: envelope.attempt_id ?? null,
    contract_version: envelope.contract_version,
    dispatch_id: envelope.dispatch_id,
    dedupe_key: envelope.dedupe_key,
    routing_metadata: JSON.parse(serialized) as Record<string, unknown>,
  };
}

export type QueueMessageDisposition = "ack" | "retry";

export async function processCanonicalQueueMessage(
  message: QueueMessage,
  env: CloudflareEnvironment,
  handler: CanonicalJobHandler,
  quarantine: QuarantineHandler,
): Promise<QueueMessageDisposition> {
  let envelope: CanonicalJobEnvelope | null = null;
  try {
    envelope = parseCanonicalEnvelope(message.body);
    if (envelope.contract_version !== "feature-186-v1") throw new Error("UNSUPPORTED_CONTRACT_VERSION");
    const result = await handler(envelope, env);
    if (result === "completed" || result === "quarantined") return "ack";
    return "retry";
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 160) : "CANONICAL_HANDLER_FAILED";
    // A control-plane outage is not poison input. Retrying the Queue message
    // preserves the durable job/outbox contract; quarantining here would turn
    // a transient database incident into an operator-review record.
    if (TRANSIENT_CONTROL_PLANE_ERROR.test(reason)) return "retry";
    const quarantined = await quarantine({ envelope, reason }, env);
    return quarantined ? "ack" : "retry";
  }
}

export class CloudflareQueueConsumer {
  constructor(
    private readonly handler: CanonicalJobHandler,
    private readonly quarantine: QuarantineHandler = async () => false,
  ) {}

  async handleBatch(batch: QueueBatch, env: CloudflareEnvironment): Promise<void> {
    if (env.CLOUDFLARE_ACTIVATION !== "enabled") {
      for (const message of batch.messages) message.retry({ delaySeconds: 60 });
      return;
    }
    assertBindingSubset(env, ["HYPERDRIVE", "JOB_QUEUE"]);
    for (const message of batch.messages) {
      const disposition = await processCanonicalQueueMessage(message, env, this.handler, this.quarantine);
      if (disposition === "ack") message.ack();
      else message.retry({ delaySeconds: 30 });
    }
  }
}

export function createFailClosedConsumer(): CloudflareQueueConsumer {
  return new CloudflareQueueConsumer(async () => {
    throw new Error("CANONICAL_CONTROL_PLANE_HANDLER_NOT_CONFIGURED");
  });
}
