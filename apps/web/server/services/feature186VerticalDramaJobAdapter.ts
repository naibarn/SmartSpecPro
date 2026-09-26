import { createControlPlaneJob } from "./jobControlPlaneGateway";
export { isFeature186HardCutoverEnabled } from "./cloudflareRuntimeTarget";

export const FEATURE_186_CONTRACT_VERSION = "feature-186-v1";

/**
 * TypeScript optional properties are represented as `undefined` in memory,
 * while the canonical job contract is JSON-only. Omit those object
 * properties at the adapter boundary so domain records can be passed through
 * without making every producer hand-build a second payload shape.
 *
 * Arrays intentionally retain undefined elements: an undefined array item is
 * not an optional object property and must still be rejected by the strict
 * canonicalizer. Unsupported values and circular references are also left for
 * the canonicalizer to reject rather than being silently coerced.
 */
export function omitUndefinedJobPayloadProperties(value: unknown): unknown {
  const ancestors = new WeakSet<object>();

  const visit = (current: unknown): unknown => {
    if (current === null || typeof current !== "object") return current;
    if (ancestors.has(current)) return current;

    ancestors.add(current);
    try {
      if (Array.isArray(current)) return current.map(visit);

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) return current;

      const normalized: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(
        current as Record<string, unknown>
      )) {
        if (child !== undefined) {
          // defineProperty keeps JSON keys such as "__proto__" as data
          // properties instead of invoking Object.prototype's setter.
          Object.defineProperty(normalized, key, {
            configurable: true,
            enumerable: true,
            value: visit(child),
            writable: true,
          });
        }
      }
      return normalized;
    } finally {
      ancestors.delete(current);
    }
  };

  return visit(value);
}

/**
 * Bind an existing producer UUID to the canonical worker_jobs row. In the
 * hard-cutover path, dispatch, lifecycle, retry, fencing, and result are all
 * owned by the control plane. Legacy domain projections may still exist only
 * for compatibility callers with the hard cutover flag disabled.
 */
export async function createFeature186VerticalDramaJob(input: {
  jobId: string;
  tenantId: string;
  userId?: number;
  jobType: string;
  executionClass: "short" | "long" | "external" | "cpu";
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<string> {
  const job = await createControlPlaneJob({
    context: {
      tenantId: input.tenantId,
      actorType: input.userId ? "user" : "system",
      ...(input.userId ? { actorId: input.userId } : {}),
      authorizationScope: `feature-186:${input.jobType}`,
      correlationId: `feature-186:${input.jobType}:${input.jobId}`,
      idempotencyKey:
        input.idempotencyKey ?? `feature-186:${input.jobType}:${input.jobId}`,
    },
    definition: {
      contractVersion: FEATURE_186_CONTRACT_VERSION,
      jobType: input.jobType,
      executionClass: input.executionClass,
      input: omitUndefinedJobPayloadProperties(input.payload) as Record<
        string,
        unknown
      >,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 5_000,
        maxDelayMs: 5 * 60_000,
        jitter: "bounded",
        deadlineMs: 6 * 60 * 60_000,
        allowedErrorClasses: ["retryable", "timeout", "unavailable"],
      },
      timeoutPolicy: {
        softTimeoutMs: 10 * 60_000,
        hardTimeoutMs: 60 * 60_000,
      },
    },
    createOptions: {
      canonicalJobId: input.jobId,
      runtimeType: "node_job_worker",
      // Vertical Drama jobs are provider-backed authoring/generation work.
      // Accept them into the durable canonical queue even when the provider
      // or this tenant has no submission slot yet. Provider scheduling must
      // happen at execution/submission time, never by rejecting this create.
      admissionMode: "durable_queue",
    },
  });
  return job.jobId;
}
