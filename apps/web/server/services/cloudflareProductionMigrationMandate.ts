import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { workerJobs } from "../../drizzle/schema";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { probeCloudflareProductionProviderInventory } from "./cloudflareProductionProviderInventory";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { assertHttpCandidateOwner } from "./cloudflareHttpCandidatePreparation";
import { HTTP_CANDIDATE_CONTRACT, HTTP_CANDIDATE_JOB } from "./cloudflareHttpCandidateContract";
import { httpCandidateReceiptSchema } from "./cloudflareHttpCandidateReadback";
import { cloudflareMigrationMandateEnvelopeSchema, cloudflareMigrationMissionId,
  cloudflareMigrationMandateEnrollmentPayload, cloudflareCanonicalJson, cloudflarePlanDigest } from "./cloudflareMigrationMandateContract";

const API_BASE = "/api/v1/approvals/cloudflare-migration-mandates";
// One complete rollout needs four Worker deployments (candidate/canary,
// promotion, native activation and the reserved rollback). Reserve one full
// recovery pass as well; these are operation quotas, not a monetary cap.
const RESOURCE_BUDGET = Object.freeze({ maxProviderWrites: 20, maxWorkerDeployments: 8, maxContainerStarts: 4,
  maxContainerReservedSeconds: 1800, maxQueueMessages: 100, maxSyntheticCredits: 60, syntheticFinancialMinorUnits: 0 as const });
const ROLLBACK_POLICY = Object.freeze({ preserveM2Ingress: true as const, preserveLinuxFallback: true as const,
  containersOnDemand: true as const, rollbackOnFailedAcceptance: true as const, requireOwnerForOutOfScopeAction: true as const });
const ACTIONS = ["rotate_origin_configuration", "deploy_worker", "worker_canary", "synthetic_credit_billing",
  "synthetic_queue_recovery", "native_runtime_activation", "rollback"] as const;
// The durable quota reservation and executor revalidation are currently wired
// only for the two synthetic M3 acceptance operations. Never offer a broader
// Owner mandate until the remaining provider/runtime actions use the same gate.
const FULL_MANDATE_ADMISSION_ENFORCEMENT_READY = false;

export async function getCloudflareMigrationMandatePlan(db: DrizzleDB, input: {
  tenantId: string; projectId: string; ownerUserId: number;
}) {
  const blocked = (reason: string) => ({ ready: false as const, reason, plan: null });
  try { await assertHttpCandidateOwner(db, { ...input, actorUserId: input.ownerUserId }); }
  catch { return blocked("MIGRATION_MANDATE_CANONICAL_OWNER_REQUIRED"); }
  const target = await resolveCloudflareProductionDeploymentTarget({ db, tenantId: input.tenantId, projectId: input.projectId });
  if (!target || target.targetId !== "smartspec-cloudflare-runtime") return blocked("MIGRATION_MANDATE_PRODUCTION_TARGET_REQUIRED");
  const inventory = await probeCloudflareProductionProviderInventory({ db, tenantId: input.tenantId, projectId: input.projectId });
  if (!("queueResourceInventory" in inventory) || !inventory.queueInventoryComplete || !inventory.hyperdriveInventoryComplete ||
      !inventory.vpcServiceInventoryComplete || !inventory.tunnelInventoryComplete || !inventory.domainRoute.inventoryComplete)
    return blocked("MIGRATION_MANDATE_RESOURCE_INVENTORY_INCOMPLETE");
  const queue = inventory.queueResourceInventory.find(item => item.name === "smartspec-canonical-job-queue-production");
  const deadLetter = inventory.queueResourceInventory.find(item => item.name === "smartspec-canonical-job-queue-production-dlq");
  if (!queue || !deadLetter || !inventory.productionQueueConsumerInventory.complete ||
      inventory.productionQueueConsumerInventory.queueId !== queue.id ||
      inventory.productionQueueConsumerInventory.consumers.length !== 1 ||
      inventory.productionQueueConsumerInventory.consumers[0]?.deadLetterQueueName !== deadLetter.name)
    return blocked("MIGRATION_MANDATE_PRODUCTION_QUEUE_DLQ_UNVERIFIED");
  const productionVpc = inventory.vpcServices.filter(item => item.environment === "production" && item.type === "tcp" &&
    item.appProtocol === "postgresql" && item.tunnelId);
  const productionHyperdrive = inventory.hyperdrives.filter(item => item.environment === "production" && item.scheme === "postgres" &&
    item.cachingDisabled === true && productionVpc.some(vpc => vpc.id === item.vpcServiceId));
  if (productionVpc.length !== 1 || productionHyperdrive.length !== 1) return blocked("MIGRATION_MANDATE_PRODUCTION_DATABASE_RESOURCES_AMBIGUOUS");
  if (!inventory.domainRoute.attached || inventory.domainRoute.script !== target.targetId || inventory.domainRoute.conflicting ||
      !inventory.domainRoute.zoneId || !inventory.worker.activeDeploymentId)
    return blocked("MIGRATION_MANDATE_M2_ROUTE_BASELINE_UNVERIFIED");
  const [candidate] = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.jobType, HTTP_CANDIDATE_JOB), eq(workerJobs.contractVersion, HTTP_CANDIDATE_CONTRACT),
    eq(workerJobs.status, "succeeded"), sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`))
    .orderBy(desc(workerJobs.createdAt)).limit(1);
  if (!candidate?.outputJson) return blocked("MIGRATION_MANDATE_NATIVE_CANDIDATE_NOT_FOUND");
  const receipt = httpCandidateReceiptSchema.safeParse(candidate.outputJson);
  if (!receipt.success || receipt.data.accountRef !== inventory.accountRef || receipt.data.m2Preserved !== true)
    return blocked("MIGRATION_MANDATE_CANDIDATE_PROVIDER_RECEIPT_INVALID");
  const node = receipt.data.applications.find(app => app.name.endsWith("-node-http"));
  const python = receipt.data.applications.find(app => app.name.endsWith("-python-http"));
  if (!node || !python) return blocked("MIGRATION_MANDATE_CANDIDATE_APPLICATIONS_INVALID");
  if (!FULL_MANDATE_ADMISSION_ENFORCEMENT_READY)
    return blocked("MIGRATION_MANDATE_OPERATION_ENFORCEMENT_INCOMPLETE");
  const plan = cloudflareMigrationMandateEnvelopeSchema.parse({
    schemaVersion: "cloudflare.first-migration-mandate.v1",
    missionId: cloudflareMigrationMissionId(input.tenantId, input.projectId), tenantId: input.tenantId,
    ownerUserId: input.ownerUserId, projectId: input.projectId, environment: "production", targetId: target.targetId,
    accountRef: inventory.accountRef, zoneId: inventory.domainRoute.zoneId, routePattern: "smartaihub.app/*",
    resourceIds: { queueId: queue.id, deadLetterQueueId: deadLetter.id, vpcServiceId: productionVpc[0]!.id,
      hyperdriveId: productionHyperdrive[0]!.id, nodeApplicationId: node.applicationId, pythonApplicationId: python.applicationId },
    actions: [...ACTIONS], resourceBudget: RESOURCE_BUDGET, rollbackPolicy: ROLLBACK_POLICY,
  });
  return { ready: true as const, reason: null, plan, planDigest: cloudflarePlanDigest(plan),
    resourceBudget: RESOURCE_BUDGET, monetaryCap: "NONE; syntheticFinancialMinorUnits is fixed to zero", trafficPolicy: "Worker canary is bounded; native production activation is a separately listed, explicit mandate action.",
    rollbackPolicy: ROLLBACK_POLICY };
}

async function callApprovalApi(path: string, input: { userToken: string; method?: "GET" | "POST"; body?: unknown }) {
  const runtime = await getAppRuntimeConfig();
  const response = await fetch(`${runtime.pythonBackendUrl}${path}`, { method: input.method ?? "GET",
    headers: { Authorization: `Bearer ${input.userToken}`, Accept: "application/json", ...(input.body ? { "Content-Type": "application/json" } : {}) },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) {
    const detail = typeof body?.detail === "string" && /^[A-Z0-9_]{5,120}$/.test(body.detail) ? body.detail : `APPROVAL_SERVICE_HTTP_${response.status}`;
    throw new Error(detail);
  }
  return body;
}

async function callInternalApprovalApi(path: string, method: "GET" | "POST", body?: unknown) {
  const runtime = await getAppRuntimeConfig();
  if (!runtime.webGatewayToken) throw new Error("MIGRATION_MANDATE_EXECUTOR_AUTHORITY_UNAVAILABLE");
  const response = await fetch(`${runtime.pythonBackendUrl}${path}`, {
    method, headers: { "x-internal-token": runtime.webGatewayToken, Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) {
    const detail = typeof result?.detail === "string" && /^[A-Z0-9_]{5,120}$/.test(result.detail)
      ? result.detail : `MIGRATION_MANDATE_APPROVAL_HTTP_${response.status}`;
    throw new Error(detail);
  }
  return result;
}

export async function issueCloudflareMigrationOperationGrant(input: {
  mandateRef: string; tenantId: string; projectId: string; jobId: string;
  operation: "rotate_origin_configuration" | "deploy_worker" | "worker_canary" | "credit_billing_acceptance" |
    "queue_recovery_acceptance" | "native_runtime_activation" | "rollback"; planDigest: string;
}) {
  const usageByOperation = {
    rotate_origin_configuration: { providerWrites: 0, workerDeployments: 0, containerStarts: 0, containerReservedSeconds: 0, queueMessages: 0, syntheticCredits: 0, syntheticFinancialMinorUnits: 0 },
    deploy_worker: { providerWrites: 2, workerDeployments: 1, containerStarts: 0, containerReservedSeconds: 0, queueMessages: 0, syntheticCredits: 0, syntheticFinancialMinorUnits: 0 },
    worker_canary: { providerWrites: 1, workerDeployments: 1, containerStarts: 0, containerReservedSeconds: 0, queueMessages: 0, syntheticCredits: 0, syntheticFinancialMinorUnits: 0 },
    credit_billing_acceptance: { providerWrites: 0, workerDeployments: 0, containerStarts: 0, containerReservedSeconds: 0, queueMessages: 0, syntheticCredits: 30, syntheticFinancialMinorUnits: 0 },
    queue_recovery_acceptance: { providerWrites: 0, workerDeployments: 0, containerStarts: 0, containerReservedSeconds: 0, queueMessages: 4, syntheticCredits: 0, syntheticFinancialMinorUnits: 0 },
    native_runtime_activation: { providerWrites: 1, workerDeployments: 1, containerStarts: 2, containerReservedSeconds: 600, queueMessages: 0, syntheticCredits: 0, syntheticFinancialMinorUnits: 0 },
    rollback: { providerWrites: 1, workerDeployments: 1, containerStarts: 0, containerReservedSeconds: 0, queueMessages: 0, syntheticCredits: 0, syntheticFinancialMinorUnits: 0 },
  } as const;
  const usage = usageByOperation[input.operation];
  const result = await callInternalApprovalApi(`/api/v1/approvals/internal/cloudflare-migration-mandates/${encodeURIComponent(input.mandateRef)}/operation-grants`, "POST", {
    ...input, idempotencyKey: `first-migration:${input.operation}:${input.jobId}`, usage,
  });
  if (typeof result.grantRef !== "string" || !/^[0-9a-f-]{36}$/i.test(result.grantRef) || result.payload?.planDigest !== input.planDigest ||
      result.payload?.jobId !== input.jobId || result.payload?.mandateRef !== input.mandateRef)
    throw new Error("MIGRATION_MANDATE_OPERATION_GRANT_INVALID");
  return { grantRef: result.grantRef as string, expiresAt: result.expiresAt as string | null };
}

export async function renewCloudflareMigrationOperationGrant(input: { grantRef: string; tenantId: string; jobId: string }) {
  const result = await callInternalApprovalApi(`/api/v1/approvals/internal/cloudflare-migration-operation-grants/${encodeURIComponent(input.grantRef)}/renew`, "POST", {
    tenantId: input.tenantId, jobId: input.jobId,
  });
  const grant = result.grant as Record<string, any> | undefined;
  if (grant?.grantRef !== input.grantRef || grant?.tenantId !== input.tenantId || grant?.jobId !== input.jobId)
    throw new Error("MIGRATION_MANDATE_OPERATION_GRANT_INVALID");
  return grant;
}

export async function resolveCloudflareMigrationOperationGrant(input: { grantRef: string; tenantId: string }) {
  const result = await callInternalApprovalApi(`/api/v1/approvals/internal/cloudflare-migration-operation-grants/${encodeURIComponent(input.grantRef)}?tenantId=${encodeURIComponent(input.tenantId)}`, "GET");
  const grant = result.grant as Record<string, any> | undefined;
  if (grant?.grantRef !== input.grantRef || grant?.tenantId !== input.tenantId)
    throw new Error("MIGRATION_MANDATE_OPERATION_GRANT_INVALID");
  return grant;
}

export async function assertCloudflareMigrationOperationGrant(input: {
  grantRef: string; tenantId: string; projectId: string; jobId: string;
  operation: "rotate_origin_configuration" | "deploy_worker" | "worker_canary" | "credit_billing_acceptance" |
    "queue_recovery_acceptance" | "native_runtime_activation" | "rollback";
  planDigest: string; expectedAccountRef?: string; expectedZoneId?: string; expectedQueueId?: string;
  expectedDeadLetterQueueId?: string; renew?: boolean;
}) {
  const grant = input.renew
    ? await renewCloudflareMigrationOperationGrant({ grantRef: input.grantRef, tenantId: input.tenantId, jobId: input.jobId })
    : await resolveCloudflareMigrationOperationGrant({ grantRef: input.grantRef, tenantId: input.tenantId });
  const action = input.operation === "credit_billing_acceptance" ? "synthetic_credit_billing"
    : input.operation === "queue_recovery_acceptance" ? "synthetic_queue_recovery" : input.operation;
  if (grant.projectId !== input.projectId || grant.jobId !== input.jobId || grant.operation !== input.operation ||
      grant.action !== action || grant.planDigest !== input.planDigest || grant.mandateRef === "" ||
      grant.targetId !== "smartspec-cloudflare-runtime" || grant.environment !== "production" ||
      grant.routePattern !== "smartaihub.app/*" ||
      input.expectedAccountRef !== undefined && grant.accountRef !== input.expectedAccountRef ||
      input.expectedZoneId !== undefined && grant.zoneId !== input.expectedZoneId ||
      input.expectedQueueId !== undefined && grant.resourceIds?.queueId !== input.expectedQueueId ||
      input.expectedDeadLetterQueueId !== undefined && grant.resourceIds?.deadLetterQueueId !== input.expectedDeadLetterQueueId ||
      Date.parse(grant.expiresAt) <= Date.now()) throw new Error("MIGRATION_MANDATE_OPERATION_GRANT_SCOPE_DENIED");
  return grant;
}

export async function readCloudflareMigrationMandate(input: { tenantId: string; projectId: string; userToken: string }) {
  const query = new URLSearchParams({ projectId: input.projectId });
  return callApprovalApi(`${API_BASE}/current?${query}`, { userToken: input.userToken });
}

export async function enrollCloudflareMigrationMandate(input: { db: DrizzleDB; tenantId: string; projectId: string; ownerUserId: number;
  userToken: string; idempotencyKey: string; expectedPlanDigest: string; plan: Record<string, unknown> }) {
  const current = await getCloudflareMigrationMandatePlan(input.db, input);
  if (!current.ready || current.planDigest !== input.expectedPlanDigest || cloudflareCanonicalJson(current.plan) !== cloudflareCanonicalJson(input.plan))
    throw new Error(current.ready ? "MIGRATION_MANDATE_REVIEWED_PLAN_CHANGED" : current.reason);
  return callApprovalApi(API_BASE, { userToken: input.userToken, method: "POST",
    body: cloudflareMigrationMandateEnrollmentPayload(current.plan, input.idempotencyKey) });
}

export async function changeCloudflareMigrationMandate(input: { mandateRef: string; userToken: string; reason: string; state: "suspend" | "revoke" }) {
  return callApprovalApi(`${API_BASE}/${encodeURIComponent(input.mandateRef)}/${input.state}`, {
    userToken: input.userToken, method: "POST", body: { reason: input.reason },
  });
}

export async function readCloudflareMigrationMandateHistory(input: { mandateRef: string; userToken: string }) {
  return callApprovalApi(`${API_BASE}/${encodeURIComponent(input.mandateRef)}/history`, { userToken: input.userToken });
}
