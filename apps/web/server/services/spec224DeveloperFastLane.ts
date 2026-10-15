import { createHash } from "node:crypto";

import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { DEVELOPER_FAST_LANE_CONTRACT, DEVELOPER_FAST_LANE_JOB, type DeveloperFastLaneRequest } from "./spec224DeveloperFastLaneContract";

export { DEVELOPER_FAST_LANE_CONTRACT, DEVELOPER_FAST_LANE_JOB } from "./spec224DeveloperFastLaneContract";
export type { DeveloperFastLaneRequest } from "./spec224DeveloperFastLaneContract";

const DEVELOPER_FAST_LANE_DEADLINE_MS = 7 * 24 * 60 * 60 * 1_000;

function stableHex(material: string): string {
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

function stableRunId(material: string): string {
  const hex = stableHex(material);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function validateRequest(request: DeveloperFastLaneRequest): void {
  const pathList = (value: unknown, label: string): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every(path =>
    typeof path === "string" && path.length > 0 && path.length <= 500 && !path.startsWith("/") && !path.includes("..") && !path.includes("\\") && !path.split("/").includes("."),
  );
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(request.developerLogin) || !/^[a-f0-9]{40}$/i.test(request.sourceRevision)) throw new Error("DEVELOPER_FAST_LANE_IDENTITY_OR_REVISION_INVALID");
  if (!request.task.trim() || request.task.length > 12_000 || !pathList(request.allowedFiles, "allowedFiles") || !pathList(request.writableFiles, "writableFiles") || !request.writableFiles.every(path => request.allowedFiles.includes(path))) throw new Error("DEVELOPER_FAST_LANE_SCOPE_INVALID");
  if (request.patchableFiles && (!Array.isArray(request.patchableFiles) || !request.patchableFiles.every(path => request.writableFiles.includes(path)))) throw new Error("DEVELOPER_FAST_LANE_PATCH_SCOPE_INVALID");
  if (!request.tests || !["pytest", "vitest"].includes(request.tests.runner) || !pathList(request.tests.paths, "tests.paths") || request.tests.cwd !== (request.tests.runner === "vitest" ? "apps/web" : request.tests.cwd === "python-backend" ? "python-backend" : ".") || !request.tests.paths.every(path => request.allowedFiles.includes(path))) throw new Error("DEVELOPER_FAST_LANE_TEST_SCOPE_INVALID");
  if (request.tests.databaseMode !== undefined && !["none", "isolated_local"].includes(request.tests.databaseMode)) throw new Error("DEVELOPER_FAST_LANE_DATABASE_SCOPE_INVALID");
  if (!Array.isArray(request.acceptanceCriteria) || request.acceptanceCriteria.length === 0 || request.acceptanceCriteria.length > 80 || request.acceptanceCriteria.some(item => typeof item !== "string" || !item.trim() || item.length > 2_000)) throw new Error("DEVELOPER_FAST_LANE_ACCEPTANCE_INVALID");
  const budget = request.budget ?? { implementationMaxTurns: 12, planMaxTurns: 4, reviewMaxTurns: 4 };
  for (const [key, max] of [["implementationMaxTurns", 30], ["planMaxTurns", 8], ["reviewMaxTurns", 8]] as const) {
    const value = budget[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error("DEVELOPER_FAST_LANE_TURN_BUDGET_INVALID");
  }
  const ttl = request.scopeTtlSeconds ?? 8 * 60 * 60;
  if (!Number.isSafeInteger(ttl) || ttl < 300 || ttl > 86_400) throw new Error("DEVELOPER_FAST_LANE_SCOPE_TTL_INVALID");
}

/** Called only from an authenticated Developer procedure; identity is never read from request input. */
export async function createDeveloperFastLaneJob(input: {
  tenantId: string;
  actorId: number;
  idempotencyKey: string;
  request: DeveloperFastLaneRequest;
}) {
  validateRequest(input.request);
  if (!input.tenantId.trim() || !Number.isSafeInteger(input.actorId) || input.actorId <= 0 || input.idempotencyKey.trim().length < 16 || input.idempotencyKey.length > 160) throw new Error("DEVELOPER_FAST_LANE_AUTHORITY_INVALID");
  const operation = `${input.tenantId}:${input.actorId}:${input.idempotencyKey}`;
  const runId = stableRunId(operation);
  const workerJobId = stableHex(`spec224-worker-job:developer-fast-lane:${runId}`);
  const request = Object.fromEntries(Object.entries(input.request).filter(([, value]) => value !== undefined)) as DeveloperFastLaneRequest;
  const job = await createControlPlaneJob({
    context: {
      tenantId: input.tenantId,
      actorType: "user",
      actorId: input.actorId,
      authorizationScope: "spec224.developer.fast_lane",
      correlationId: `developer-fast-lane:${runId}`,
      idempotencyKey: `developer-fast-lane:${stableHex(operation)}`,
    },
    definition: {
      contractVersion: DEVELOPER_FAST_LANE_CONTRACT,
      jobType: DEVELOPER_FAST_LANE_JOB,
      executionClass: "long",
      priority: 100,
      input: { developerWorkUnit: { contractVersion: DEVELOPER_FAST_LANE_CONTRACT, runId, workerJobId, tenantId: input.tenantId, actorId: input.actorId, request } },
      retryPolicy: { maxAttempts: 8, baseDelayMs: 2_000, maxDelayMs: 300_000, jitter: "bounded", deadlineMs: DEVELOPER_FAST_LANE_DEADLINE_MS, deadlineMode: "fixed", allowedErrorClasses: ["timeout", "unavailable", "retryable"] },
      timeoutPolicy: { softTimeoutMs: 300_000, hardTimeoutMs: 8 * 60 * 60_000 },
    },
    createOptions: { runtimeType: "node_job_worker", canonicalJobId: workerJobId },
  });
  return { ...job, runId, workerJobId };
}
