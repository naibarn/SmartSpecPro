import { sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { createCloudflareProductionDatabaseRuntime, CLOUDFLARE_PRODUCTION_DATABASE_JOB, CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT } from "./cloudflareProductionDatabaseExecutor";
import { readProductionDatabaseReadbackObservation } from "./cloudflareProductionDatabaseReconciliation";
import { inspectProductionDatabaseRecovery } from "./cloudflareProductionDatabaseRecovery";

/** Reuse independently accepted M1 resources. Old grant/checkpoint identifies
 * them for GET-only reconciliation; it never authorizes another provider write.
 * Native drivers keep their own app role, not M1's narrow intake identity. */
export async function readHttpDatabaseNetwork(db: DrizzleDB, scope: { tenantId: string; projectId: string; actorUserId: number }) {
  const jobs = await db.execute(sql`SELECT id,"requestedByUserId","inputJson" FROM worker_jobs WHERE "tenantId"=${scope.tenantId}
    AND "jobType"=${CLOUDFLARE_PRODUCTION_DATABASE_JOB} AND "contractVersion"=${CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT}
    AND "inputJson"->>'projectId'=${scope.projectId} AND "requestedByUserId"=${scope.actorUserId} ORDER BY "createdAt" DESC LIMIT 20`);
  const runtime = createCloudflareProductionDatabaseRuntime({ db });
  for (const job of jobs) {
    const definition = job.inputJson as Record<string, any>;
    if (typeof definition.planDigest !== "string") continue;
    const exact = { jobId: String(job.id), tenantId: scope.tenantId, projectId: scope.projectId, planDigest: definition.planDigest };
    const accepted = await readProductionDatabaseReadbackObservation(db, exact);
    if (accepted?.acceptance !== "M1_ACCEPTED" || !accepted.tenantIsolationVerified || !accepted.databaseConnectionVerified) continue;
    const secure = await runtime.resolveGrant(exact.jobId);
    if (!secure || secure.grant.requesterUserId !== scope.actorUserId) throw Error("HTTP_RUNTIME_DATABASE_SCOPE_DENIED");
    const readback = await inspectProductionDatabaseRecovery({ runtime, ...exact, requesterUserId: scope.actorUserId });
    const plan = secure.grant.plan;
    if (readback.vpcServiceId !== accepted.vpcServiceId || readback.hyperdriveId !== accepted.hyperdriveId ||
        plan.databaseHostname !== "db.smartaihub.app" || plan.vpcTcpPort !== 5433 || plan.tlsVerification !== "verify_full")
      throw Error("HTTP_RUNTIME_DATABASE_RESOURCE_CHANGED");
    return { transport: "private-vpc-websocket-v1" as const, canonicalJobId: exact.jobId, vpcServiceId: accepted.vpcServiceId,
      hyperdriveId: accepted.hyperdriveId, tunnelId: plan.tunnelId, hostname: plan.databaseHostname, port: plan.vpcTcpPort,
      databaseName: plan.databaseName, providerReadbackVerified: true as const, m1Preserved: true as const,
      applicationRoleRequired: true as const, dnsRequired: false as const, accessApplicationRequired: false as const };
  }
  throw Error("HTTP_RUNTIME_ACCEPTED_DATABASE_REQUIRED");
}
