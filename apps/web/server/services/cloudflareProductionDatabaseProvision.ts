import { createHash } from "node:crypto";
import { z } from "zod";

const resourceId = z.string().regex(/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const account = z.string().regex(/^[a-f0-9]{32}$/);
const tunnel = z.string().uuid();
const postgresRole = z.string().regex(/^sah_cf_prod_[a-f0-9]{12}$/);
const job = z.string().uuid();

export const productionDatabaseProvisionCheckpointSchema = z.object({
  jobId: job,
  planDigest: digest,
  databasePasswordDigest: digest,
  pending: z.enum(["vpc_service", "hyperdrive"]).nullable().optional(),
  vpcServiceId: resourceId.optional(),
  hyperdriveId: resourceId.optional(),
}).strict();
export type ProductionDatabaseProvisionCheckpoint = z.infer<typeof productionDatabaseProvisionCheckpointSchema>;

/** Non-secret, immutable identity for one production PostgreSQL connection plan. */
export const productionDatabaseResourcePlanSchema = z.object({
  tunnelId: tunnel,
  databaseHostname: z.literal("db.smartaihub.app"),
  databaseName: z.string().regex(/^[a-zA-Z0-9_]{1,63}$/),
  databaseUser: postgresRole,
  vpcTcpPort: z.literal(5433),
  connectionLimit: z.literal(5),
  tlsVerification: z.literal("verify_full"),
}).strict();
export type ProductionDatabaseResourcePlan = z.infer<typeof productionDatabaseResourcePlanSchema>;

export function productionDatabaseResourcePlanDigest(plan: ProductionDatabaseResourcePlan) {
  const canonical = Object.fromEntries(Object.entries(productionDatabaseResourcePlanSchema.parse(plan)).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function productionVPCHyperdriveReadbackMatches(input: {
  resource: Resource | undefined;
  id: string;
  name: string;
  vpcServiceId: string;
  plan: ProductionDatabaseResourcePlan;
}) {
  const { resource, id, name, vpcServiceId, plan } = input;
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) return false;
  const hasDirectOriginMtls = resource.mtls != null &&
    (typeof resource.mtls !== "object" || Array.isArray(resource.mtls) || Object.keys(resource.mtls).length > 0);
  return resource.id === id && resource.name === name && resource.origin?.service_id === vpcServiceId &&
    resource.origin?.database === plan.databaseName && resource.origin?.user === plan.databaseUser &&
    resource.origin?.scheme === "postgres" && resource.caching?.disabled === true &&
    resource.origin_connection_limit === plan.connectionLimit && !hasDirectOriginMtls;
}

export class ProductionDatabaseProvisionError extends Error {
  readonly class: "permanent" | "retryable" | "unknown";
  constructor(readonly diagnosticCode: string, readonly errorClass: "permanent" | "retryable" | "unknown" = "permanent", readonly providerMessage?: string,
    readonly providerDiagnostic?: { method: "GET" | "POST"; path: string; status: number; timestamp: string; cfRay: string | null }) {
    super([diagnosticCode, providerMessage, providerDiagnostic ? `provider=${JSON.stringify(providerDiagnostic)}` : undefined].filter(Boolean).join(": "));
    this.name = "ProductionDatabaseProvisionError";
    this.class = errorClass;
  }
}
function fail(code: string, kind: "permanent" | "retryable" | "unknown" = "permanent"): never {
  throw new ProductionDatabaseProvisionError(code, kind);
}

type Envelope = { success?: boolean; result?: unknown; result_info?: { total_pages?: number }; errors?: Array<{ code?: number | string; message?: string }> };
type Resource = Record<string, any>;

/**
 * Idempotently creates and verifies the Production TCP VPC Service and
 * Hyperdrive config. Caller must be a canonical leased production job and
 * assert its exact grant/target on every request. This function never binds a
 * Worker, changes activation, or changes production traffic.
 */
export async function provisionCloudflareProductionDatabase(input: {
  jobId: string;
  accountRef: string;
  token: string;
  plan: ProductionDatabaseResourcePlan;
  planDigest: string;
  databasePassword: string;
  checkpoint?: ProductionDatabaseProvisionCheckpoint;
  saveCheckpoint(checkpoint: ProductionDatabaseProvisionCheckpoint): Promise<void>;
  assertAuthorized(): Promise<void>;
  fetchImpl?: typeof fetch;
}) {
  const plan = productionDatabaseResourcePlanSchema.parse(input.plan);
  if (!job.safeParse(input.jobId).success || !account.safeParse(input.accountRef).success || input.planDigest !== productionDatabaseResourcePlanDigest(plan) ||
      typeof input.token !== "string" || input.token.length < 20 || input.token.length > 4096 ||
      typeof input.databasePassword !== "string" || input.databasePassword.length < 32 || input.databasePassword.length > 1024) {
    fail("CLOUDFLARE_PRODUCTION_DATABASE_PLAN_INVALID");
  }
  const passwordDigest = createHash("sha256").update(input.databasePassword).digest("hex");
  let checkpoint = input.checkpoint
    ? productionDatabaseProvisionCheckpointSchema.parse(input.checkpoint)
    : { jobId: input.jobId, planDigest: input.planDigest, databasePasswordDigest: passwordDigest };
  if (checkpoint.jobId !== input.jobId || checkpoint.planDigest !== input.planDigest || checkpoint.databasePasswordDigest !== passwordDigest) {
    fail("CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_MISMATCH", "unknown");
  }
  const saveCheckpoint = async (next: ProductionDatabaseProvisionCheckpoint) => {
    await input.assertAuthorized();
    checkpoint = productionDatabaseProvisionCheckpointSchema.parse(next);
    await input.saveCheckpoint(checkpoint);
  };
  if (!input.checkpoint) await saveCheckpoint(checkpoint);
  const accountPath = `/accounts/${encodeURIComponent(input.accountRef)}`;
  // Keep provider names stable across a newly authorized recovery job for the
  // same immutable database plan. Ownership still comes from the encrypted
  // checkpoint, so a fresh job can detect but cannot silently adopt old state.
  const operationId = input.planDigest.slice(0, 12);
  const serviceName = `smartspec-production-postgres-${operationId}`;
  const hyperdriveName = `smartspec-production-database-${operationId}`;
  const fetchImpl = input.fetchImpl ?? fetch;
  let requestCount = 0;

  async function request(path: string, method: "GET" | "POST", body?: unknown): Promise<Envelope> {
    await input.assertAuthorized();
    if (++requestCount > 16) fail("CLOUDFLARE_PRODUCTION_DATABASE_REQUEST_BUDGET_EXCEEDED");
    let response: Response;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
        method,
        headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json", accept: "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail(method === "POST" ? "CLOUDFLARE_PRODUCTION_DATABASE_WRITE_UNCERTAIN" : "CLOUDFLARE_PRODUCTION_DATABASE_READ_UNAVAILABLE",
        method === "POST" ? "unknown" : "retryable");
    }
    let envelope: Envelope;
    try {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 512 * 1024) fail("CLOUDFLARE_PRODUCTION_DATABASE_RESPONSE_INVALID");
      envelope = JSON.parse(new TextDecoder().decode(bytes)) as Envelope;
    } catch (error) {
      if (error instanceof ProductionDatabaseProvisionError) throw error;
      fail("CLOUDFLARE_PRODUCTION_DATABASE_RESPONSE_INVALID");
    }
    if (!response.ok || envelope.success !== true || !envelope.result || typeof envelope.result !== "object") {
      const providerCode = envelope.errors?.[0]?.code;
      const code = typeof providerCode === "number" && Number.isSafeInteger(providerCode) && providerCode >= 0 && providerCode <= 999_999
        ? `_CF_${providerCode}` : "";
      let message = String(envelope.errors?.[0]?.message ?? "");
      for (const secret of [input.token, input.databasePassword]) message = message.split(secret).join("[REDACTED]");
      message = message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@").replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 400);
      // Keep the provider correlation evidence in the canonical failure, not
      // only transient stdout. No request body, headers or credential is kept.
      const ray = response.headers.get("cf-ray");
      const cfRay = ray && /^[a-f0-9]{16,32}(?:-[a-z]{3})?$/i.test(ray) ? ray : null;
      throw new ProductionDatabaseProvisionError(`CLOUDFLARE_PRODUCTION_DATABASE_HTTP_${response.status}${code}`,
        response.status >= 500 ? "retryable" : "permanent", message || undefined,
        { method, path, status: response.status, timestamp: new Date().toISOString(), cfRay });
    }
    return envelope;
  }

  async function list(path: string): Promise<Resource[]> {
    const envelope = await request(path, "GET");
    const result = envelope.result;
    if (!Array.isArray(result) || result.length >= 100 || (envelope.result_info?.total_pages ?? 1) > 1) {
      fail("CLOUDFLARE_PRODUCTION_DATABASE_INVENTORY_INCOMPLETE");
    }
    return result as Resource[];
  }

  const servicesPath = `${accountPath}/connectivity/directory/services`;
  // Validate the existing private network before creating provider resources.
  // A selected tunnel ID alone does not prove that the tunnel is still live.
  const tunnelEnvelope = await request(
    `${accountPath}/cfd_tunnel/${encodeURIComponent(plan.tunnelId)}`,
    "GET"
  );
  const tunnel = tunnelEnvelope.result as Resource | undefined;
  if (tunnel.id !== plan.tunnelId || tunnel.status !== "healthy") {
    fail("CLOUDFLARE_PRODUCTION_DATABASE_TUNNEL_NOT_HEALTHY");
  }
  const vpcCandidates = (await list(`${servicesPath}?per_page=100`)).filter(row => row?.name === serviceName);
  if (vpcCandidates.length > 1) fail("CLOUDFLARE_PRODUCTION_VPC_SERVICE_NAME_AMBIGUOUS", "unknown");
  let vpcServiceId = vpcCandidates[0]?.service_id;
  if (vpcServiceId !== undefined) {
    resourceId.parse(vpcServiceId);
    if (checkpoint.vpcServiceId && checkpoint.vpcServiceId !== vpcServiceId) fail("CLOUDFLARE_PRODUCTION_VPC_SERVICE_CHECKPOINT_MISMATCH", "unknown");
    if (!checkpoint.vpcServiceId && checkpoint.pending !== "vpc_service") fail("CLOUDFLARE_PRODUCTION_VPC_SERVICE_OWNERSHIP_UNVERIFIED", "unknown");
  }
  else {
    // Never replace a resource already owned by this checkpoint when inventory
    // disappears or becomes inconsistent between preflight and execution.
    if (checkpoint.vpcServiceId) fail("CLOUDFLARE_PRODUCTION_VPC_SERVICE_CHECKPOINT_RESOURCE_MISSING", "unknown");
    await saveCheckpoint({ ...checkpoint, pending: "vpc_service" });
    const created = await request(servicesPath, "POST", {
      name: serviceName,
      type: "tcp",
      app_protocol: "postgresql",
      tcp_port: plan.vpcTcpPort,
      host: { hostname: plan.databaseHostname, resolver_network: { tunnel_id: plan.tunnelId } },
      tls_settings: { cert_verification_mode: plan.tlsVerification },
    });
    vpcServiceId = resourceId.parse((created.result as Resource | undefined)?.service_id);
    await saveCheckpoint({ ...checkpoint, pending: null, vpcServiceId });
  }
  const vpcServiceEnvelope = await request(`${servicesPath}/${encodeURIComponent(vpcServiceId)}`, "GET");
  const vpcService = vpcServiceEnvelope.result as Resource | undefined;
  if (vpcService.service_id !== vpcServiceId || vpcService.name !== serviceName || vpcService.type !== "tcp" ||
      vpcService.app_protocol !== "postgresql" || vpcService.tcp_port !== plan.vpcTcpPort ||
      vpcService.host?.hostname !== plan.databaseHostname || vpcService.host?.resolver_network?.tunnel_id !== plan.tunnelId ||
      vpcService.tls_settings?.cert_verification_mode !== plan.tlsVerification) {
    fail("CLOUDFLARE_PRODUCTION_VPC_SERVICE_READBACK_MISMATCH", "unknown");
  }

  const hyperdrivePath = `${accountPath}/hyperdrive/configs`;
  const hyperdriveCandidates = (await list(`${hyperdrivePath}?per_page=100`)).filter(row => row?.name === hyperdriveName);
  if (hyperdriveCandidates.length > 1) fail("CLOUDFLARE_PRODUCTION_HYPERDRIVE_NAME_AMBIGUOUS", "unknown");
  let hyperdriveId = hyperdriveCandidates[0]?.id;
  if (hyperdriveId !== undefined) {
    resourceId.parse(hyperdriveId);
    if (checkpoint.hyperdriveId && checkpoint.hyperdriveId !== hyperdriveId) fail("CLOUDFLARE_PRODUCTION_HYPERDRIVE_CHECKPOINT_MISMATCH", "unknown");
    if (!checkpoint.hyperdriveId && checkpoint.pending !== "hyperdrive") fail("CLOUDFLARE_PRODUCTION_HYPERDRIVE_OWNERSHIP_UNVERIFIED", "unknown");
  }
  else {
    if (checkpoint.hyperdriveId) fail("CLOUDFLARE_PRODUCTION_HYPERDRIVE_CHECKPOINT_RESOURCE_MISSING", "unknown");
    await saveCheckpoint({ ...checkpoint, pending: "hyperdrive" });
    const created = await request(hyperdrivePath, "POST", {
      name: hyperdriveName,
      origin: { service_id: vpcServiceId, database: plan.databaseName, user: plan.databaseUser,
        password: input.databasePassword, scheme: "postgres" },
      caching: { disabled: true },
      origin_connection_limit: plan.connectionLimit,
    });
    hyperdriveId = resourceId.parse((created.result as Resource | undefined)?.id);
    await saveCheckpoint({ ...checkpoint, pending: null, hyperdriveId });
  }
  const hyperdriveEnvelope = await request(`${hyperdrivePath}/${encodeURIComponent(hyperdriveId)}`, "GET");
  const hyperdrive = hyperdriveEnvelope.result as Resource | undefined;
  if (!productionVPCHyperdriveReadbackMatches({ resource: hyperdrive, id: hyperdriveId, name: hyperdriveName, vpcServiceId, plan })) {
    fail("CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH", "unknown");
  }
  await input.assertAuthorized();
  if (checkpoint.pending || checkpoint.vpcServiceId !== vpcServiceId || checkpoint.hyperdriveId !== hyperdriveId) {
    await saveCheckpoint({ ...checkpoint, pending: null, vpcServiceId, hyperdriveId });
  }
  return {
    accountRef: input.accountRef,
    planDigest: input.planDigest,
    vpcService: { id: vpcServiceId, name: serviceName, tunnelId: plan.tunnelId, hostname: plan.databaseHostname,
      port: plan.vpcTcpPort, type: "tcp", appProtocol: "postgresql", tlsVerification: plan.tlsVerification },
    hyperdrive: { id: hyperdriveId, name: hyperdriveName, databaseName: plan.databaseName, databaseUser: plan.databaseUser,
      connectionLimit: plan.connectionLimit, cachingDisabled: true },
    providerConfigurationVerified: true as const,
    databaseConnectionVerified: false as const,
    runtimeRolePrepared: false as const,
    workerBound: false as const,
    activation: "disabled" as const,
  };
}
