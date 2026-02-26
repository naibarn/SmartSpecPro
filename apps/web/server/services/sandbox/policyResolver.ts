/**
 * Resolves sandbox profiles and checks tenant policy limits.
 */

import { db } from "../../db";
import {
  sandboxProfiles,
  tenantSandboxPolicies,
  sandboxJobs,
  type SandboxProfile,
} from "../../../drizzle/schema";
import { eq, and, inArray, count, sql, gte } from "drizzle-orm";

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  profileSlug?: string;
  profileConfig?: {
    cpuLimit: string;
    memoryLimitMb: number;
    timeoutSeconds: number;
    networkDefaultAction: string;
  };
}

const FEATURE_PROFILE_MAP: Record<string, string> = {
  media: "media-processing",
  presentation: "media-processing",
  skill: "code-default",
  chat: "code-default",
  workflow: "code-default",
  library: "file-parser",
  connector: "code-default",
};

const NON_TERMINAL_STATUSES = [
  "accepted",
  "policy_resolved",
  "queued",
  "provisioning",
  "staging_inputs",
  "executing",
  "collecting_outputs",
  "persisting",
] as const;

/**
 * Resolve the sandbox profile for a given feature type.
 */
export async function resolveProfile(
  featureType: string,
  _tenantId?: string,
): Promise<SandboxProfile | null> {
  const slug = FEATURE_PROFILE_MAP[featureType] ?? "code-default";

  const rows = await db
    .select()
    .from(sandboxProfiles)
    .where(and(eq(sandboxProfiles.slug, slug), eq(sandboxProfiles.isActive, true)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Check whether a tenant is allowed to create a new sandbox job.
 */
export async function checkTenantPolicy(
  tenantId: string,
): Promise<PolicyCheckResult> {
  // Get tenant policy (or use defaults)
  const policyRows = await db
    .select()
    .from(tenantSandboxPolicies)
    .where(eq(tenantSandboxPolicies.tenantId, tenantId))
    .limit(1);

  const maxConcurrent = policyRows[0]?.maxConcurrentSandboxes ?? 5;
  const maxDailySeconds = policyRows[0]?.maxDailyRuntimeSeconds ?? 36000;

  // Count active (non-terminal) jobs using COUNT (no full row fetch)
  const [countResult] = await db
    .select({ value: count() })
    .from(sandboxJobs)
    .where(
      and(
        eq(sandboxJobs.tenantId, tenantId),
        inArray(sandboxJobs.status, [...NON_TERMINAL_STATUSES]),
      ),
    );

  const activeCount = countResult?.value ?? 0;

  if (activeCount >= maxConcurrent) {
    return {
      allowed: false,
      reason: `Max concurrent sandbox limit reached (${activeCount}/${maxConcurrent})`,
    };
  }

  // Check daily runtime: sum runtime of jobs started today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [runtimeResult] = await db
    .select({
      totalSeconds: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(${sandboxJobs.finishedAt}, NOW()) - ${sandboxJobs.startedAt}))), 0)`,
    })
    .from(sandboxJobs)
    .where(
      and(
        eq(sandboxJobs.tenantId, tenantId),
        gte(sandboxJobs.createdAt, todayStart),
      ),
    );

  const dailyRuntime = Math.floor(Number(runtimeResult?.totalSeconds ?? 0));

  if (dailyRuntime >= maxDailySeconds) {
    return {
      allowed: false,
      reason: `Daily runtime limit reached (${dailyRuntime}s/${maxDailySeconds}s)`,
    };
  }

  return { allowed: true };
}
