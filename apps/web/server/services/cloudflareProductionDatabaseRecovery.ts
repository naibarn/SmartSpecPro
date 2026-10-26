import { createHash } from "node:crypto";
import type { CloudflareProductionDatabaseRuntime } from "./cloudflareProductionDatabaseExecutor";
import { productionVPCHyperdriveReadbackMatches } from "./cloudflareProductionDatabaseProvision";

export function productionDatabaseRecoveryActionId(jobId: string, planDigest: string, nextAttempt?: number) {
  const recoveryKey = nextAttempt === undefined
    ? `production-database-provider:${jobId}:${planDigest}`
    : `production-database-provider:${jobId}:${planDigest}:attempt:${nextAttempt}`;
  const hash = createHash("sha256").update(recoveryKey).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

/** Read-only reconciliation of the ORIGINAL job's encrypted checkpoint. An
 * expired grant can identify resources, but never authorize provider writes. */
export async function inspectProductionDatabaseRecovery(input: {
  runtime: CloudflareProductionDatabaseRuntime;
  jobId: string;
  tenantId: string;
  projectId: string;
  requesterUserId: number;
  planDigest: string;
}) {
  const deny = (code: string): never => { throw new Error(code); };
  const { runtime } = input;
  const secure = await runtime.resolveGrant(input.jobId);
  const grant = secure?.grant;
  if (!secure || !grant || grant.jobId !== input.jobId || grant.tenantId !== input.tenantId ||
      grant.projectId !== input.projectId || grant.requesterUserId !== input.requesterUserId ||
      grant.planDigest !== input.planDigest || grant.revokedAt || grant.environment !== "production" ||
      grant.targetId !== "smartspec-cloudflare-runtime") deny("CLOUDFLARE_PRODUCTION_DATABASE_RECOVERY_SCOPE_MISMATCH");
  const verified = secure!;
  const checkpoint = await runtime.checkpoint(input.jobId, input.requesterUserId, input.planDigest);
  const retryBeforeHyperdrive = checkpoint?.pending === "hyperdrive" && Boolean(checkpoint.vpcServiceId) && !checkpoint.hyperdriveId;
  const reconcileCreatedHyperdrive = checkpoint?.pending == null && Boolean(checkpoint.vpcServiceId && checkpoint.hyperdriveId);
  if (!checkpoint || checkpoint.jobId !== input.jobId || checkpoint.planDigest !== input.planDigest ||
      checkpoint.databasePasswordDigest !== createHash("sha256").update(verified.databasePassword).digest("hex") ||
      (!retryBeforeHyperdrive && !reconcileCreatedHyperdrive))
    deny("CLOUDFLARE_PRODUCTION_DATABASE_RECOVERY_CHECKPOINT_INVALID");
  const target = await runtime.resolveTarget(input.tenantId, input.projectId);
  if (!target || target.targetId !== verified.grant.targetId || target.accountRef !== verified.grant.accountRef)
    deny("CLOUDFLARE_PRODUCTION_TARGET_SCOPE_CHANGED");
  return runtime.withCredential(input.projectId, input.tenantId, target!.credentialRef, async token => {
    const read = async (path: string) => {
      const response = await (runtime.fetchImpl ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${verified.grant.accountRef}${path}`,
        { method: "GET", redirect: "error", cache: "no-store", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      const body = await response.json() as { success?: boolean; result?: any; result_info?: { total_pages?: number } };
      if (!response.ok || body.success !== true) deny(`CLOUDFLARE_PRODUCTION_DATABASE_RECOVERY_READ_HTTP_${response.status}`);
      return body;
    };
    const plan = verified.grant.plan;
    const tunnel = (await read(`/cfd_tunnel/${plan.tunnelId}`)).result;
    if (tunnel?.id !== plan.tunnelId || tunnel.status !== "healthy") deny("CLOUDFLARE_PRODUCTION_DATABASE_TUNNEL_NOT_HEALTHY");
    const service = (await read(`/connectivity/directory/services/${checkpoint!.vpcServiceId}`)).result;
    if (service?.service_id !== checkpoint!.vpcServiceId || service.name !== `smartspec-production-postgres-${input.planDigest.slice(0, 12)}` ||
        service.type !== "tcp" || service.app_protocol !== "postgresql" || service.tcp_port !== plan.vpcTcpPort ||
        service.host?.hostname !== plan.databaseHostname || service.host?.resolver_network?.tunnel_id !== plan.tunnelId ||
        service.tls_settings?.cert_verification_mode !== plan.tlsVerification)
      deny("CLOUDFLARE_PRODUCTION_VPC_SERVICE_READBACK_MISMATCH");
    const inventory = await read("/hyperdrive/configs?per_page=100");
    if (!Array.isArray(inventory.result) || inventory.result.length >= 100 || (inventory.result_info?.total_pages ?? 1) > 1)
      deny("CLOUDFLARE_PRODUCTION_DATABASE_INVENTORY_INCOMPLETE");
    const hyperdriveName = `smartspec-production-database-${input.planDigest.slice(0, 12)}`;
    if (retryBeforeHyperdrive) {
      // An uncertain prior create must be reconciled separately, never retried
      // as absent. The original CF2015 path is recoverable only when no
      // Hyperdrive for this operation or VPC exists. This path performs no POST.
      if (inventory.result.some((row: any) => row?.name === hyperdriveName || row?.origin?.service_id === checkpoint!.vpcServiceId))
        deny("CLOUDFLARE_PRODUCTION_DATABASE_RECOVERY_PROVIDER_OUTCOME_REQUIRES_RECONCILIATION");
    } else {
      const candidates = inventory.result.filter((row: any) => row?.id === checkpoint!.hyperdriveId);
      if (candidates.length !== 1 || candidates[0]?.name !== hyperdriveName || candidates[0]?.origin?.service_id !== checkpoint!.vpcServiceId)
        deny("CLOUDFLARE_PRODUCTION_HYPERDRIVE_CHECKPOINT_MISMATCH");
      const hyperdrive = (await read(`/hyperdrive/configs/${encodeURIComponent(checkpoint!.hyperdriveId!)}`)).result;
      if (!productionVPCHyperdriveReadbackMatches({ resource: hyperdrive, id: checkpoint!.hyperdriveId!, name: hyperdriveName,
        vpcServiceId: checkpoint!.vpcServiceId!, plan })) deny("CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH");
    }
    return { jobId: input.jobId, planDigest: input.planDigest, vpcServiceId: checkpoint!.vpcServiceId!,
      ...(checkpoint!.hyperdriveId ? { hyperdriveId: checkpoint!.hyperdriveId } : {}),
      tunnelId: plan.tunnelId, providerReadbackVerified: true as const, databaseConnectionVerified: false as const };
  });
}
