const PRODUCTION_RUNTIME_READY_URL = "https://runtime.smartaihub.app/readyz";
const REQUIRED_BINDINGS = new Set([
  "HYPERDRIVE",
  "JOB_QUEUE",
  "JOB_WORKFLOW",
  "JOB_CONTAINERS",
  "WORKER_APP",
  "MEDIA_BUCKET",
  "VECTOR_INDEX",
]);
const PRODUCTION_QUEUE_BINDINGS = new Set(["HYPERDRIVE", "JOB_QUEUE"]);

export type CloudflareProductionRuntimeReadiness = Readonly<{
  status: "READY" | "NOT_READY" | "UNAVAILABLE";
  checkedAt: string;
  environment: "production" | "unknown";
  activation?: string;
  transport?: string;
  /** Bindings blocking the currently selected job transport. */
  missing: string[];
  /** Full binding inventory; may include capabilities outside the selected transport. */
  unconfigured: string[];
  jobHandlerConfigured?: boolean;
  controlPlaneConfigured?: boolean;
  httpStatus?: number;
  reason?: string;
}>;

/** Read-only check of the fixed production Worker hostname; never accepts a caller URL. */
export async function probeCloudflareProductionRuntimeReadiness(input: {
  fetchImpl?: typeof fetch;
  now?: () => Date;
} = {}): Promise<CloudflareProductionRuntimeReadiness> {
  const checkedAt = (input.now?.() ?? new Date()).toISOString();
  try {
    const response = await (input.fetchImpl ?? fetch)(PRODUCTION_RUNTIME_READY_URL, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      return { status: "UNAVAILABLE", checkedAt, environment: "unknown", missing: [], unconfigured: [],
        httpStatus: response.status, reason: "PRODUCTION_READINESS_RESPONSE_INVALID" };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { status: "UNAVAILABLE", checkedAt, environment: "unknown", missing: [], unconfigured: [],
        httpStatus: response.status, reason: "PRODUCTION_READINESS_RESPONSE_INVALID" };
    }
    const record = body as Record<string, unknown>;
    // Cloudflare's edge can reject this server-side probe before it reaches the
    // Worker (for example, Error 1010 when Browser Integrity Check classifies
    // the probe's client signature). Keep that distinct from a Worker binding
    // failure so operators do not infer runtime readiness from an edge denial.
    if (response.status === 403 && record.error_code === 1010 && record.error_name === "browser_signature_banned") {
      return { status: "UNAVAILABLE", checkedAt, environment: "unknown", missing: [], unconfigured: [],
        httpStatus: response.status, reason: "PRODUCTION_READINESS_EDGE_BROWSER_SIGNATURE_BLOCKED" };
    }
    const readiness = record.readiness && typeof record.readiness === "object" && !Array.isArray(record.readiness)
      ? record.readiness as Record<string, unknown>
      : record;
    const rawUnconfigured = Array.isArray(readiness.missing) ? readiness.missing
      : Array.isArray(readiness.selectedMissing) ? readiness.selectedMissing : null;
    // Older production Worker versions report only the complete binding inventory.
    // The checked production profile is pinned to Queues in wrangler.production.jsonc,
    // so infer its blockers from that profile while preserving the full inventory
    // separately. This avoids treating unused Workflows, Containers, R2, or Vectorize
    // as blockers for the selected Queue runtime.
    const transport = typeof readiness.transport === "string" ? readiness.transport : "queues";
    const requiredForTransport = transport === "queues" ? PRODUCTION_QUEUE_BINDINGS
      : transport === "workflows" ? new Set(["HYPERDRIVE", "JOB_WORKFLOW"])
        : transport === "retention" ? new Set<string>() : REQUIRED_BINDINGS;
    const rawMissing = Array.isArray(readiness.selectedMissing) ? readiness.selectedMissing
      : rawUnconfigured === null ? null
        : rawUnconfigured.filter((value): value is string => typeof value === "string" && requiredForTransport.has(value));
    const environment = readiness.environment ?? record.environment;
    if (environment !== "production" || typeof record.ok !== "boolean" || rawMissing === null) {
      return { status: "UNAVAILABLE", checkedAt, environment: "unknown", missing: [], unconfigured: [],
        httpStatus: response.status, reason: "PRODUCTION_READINESS_RESPONSE_INVALID" };
    }
    const missing = [...new Set(rawMissing.filter((value): value is string =>
      typeof value === "string" && REQUIRED_BINDINGS.has(value)))];
    const unconfigured = [...new Set((rawUnconfigured ?? rawMissing).filter((value): value is string =>
      typeof value === "string" && REQUIRED_BINDINGS.has(value)))];
    const ready = response.status === 200 && record.ok === true && missing.length === 0;
    return {
      status: ready ? "READY" : "NOT_READY",
      checkedAt,
      environment,
      activation: typeof readiness.activation === "string" ? readiness.activation : undefined,
      transport,
      missing,
      unconfigured,
      jobHandlerConfigured: typeof readiness.jobHandlerConfigured === "boolean" ? readiness.jobHandlerConfigured : undefined,
      controlPlaneConfigured: typeof readiness.controlPlaneConfigured === "boolean" ? readiness.controlPlaneConfigured : undefined,
      httpStatus: response.status,
      ...(!ready ? { reason: "CLOUDFLARE_PRODUCTION_WORKER_RUNTIME_NOT_READY" } : {}),
    };
  } catch {
    return { status: "UNAVAILABLE", checkedAt, environment: "unknown", missing: [], unconfigured: [],
      reason: "PRODUCTION_READINESS_PROBE_UNAVAILABLE" };
  }
}
