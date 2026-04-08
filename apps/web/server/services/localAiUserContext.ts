import { eq } from "drizzle-orm";

import type {
  LocalAiPlatform,
  LocalAiPolicy,
  LocalAiSyncedPreferences,
} from "../../../../packages/local-ai-core/src/index";
import { DEFAULT_LOCAL_AI_SYNCED_PREFERENCES } from "../../../../packages/local-ai-core/src/index";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveLocalAiPolicy } from "./localAiPolicy";
import { resolveLocalAiPreferences } from "./localAiPreferences";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

export interface RequesterLocalAiSurfaceContext {
  policy: LocalAiPolicy;
  syncedPreferences: LocalAiSyncedPreferences;
}

export async function getRequesterLocalAiSurfaceContext(input: {
  userId: number;
  tenantId: string | null | undefined;
  platform: LocalAiPlatform;
}): Promise<RequesterLocalAiSurfaceContext> {
  const tenantId = typeof input.tenantId === "string" ? input.tenantId.trim() : "";
  const tenantFlags = tenantId
    ? await getTenantFeatureFlags(tenantId)
    : { localClientLlmMode: false };

  const resolvedPolicy = resolveLocalAiPolicy({
    tenantFlags: {
      localClientLlmMode: tenantFlags.localClientLlmMode,
    },
    platform: input.platform,
  });

  const db = await getDb();
  if (!db) {
    return {
      policy: resolvedPolicy.policy,
      syncedPreferences: { ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES },
    };
  }

  const [userRow] = await db
    .select({ userPreferences: users.userPreferences })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const rawPreferences =
    userRow?.userPreferences &&
    typeof userRow.userPreferences === "object" &&
    !Array.isArray(userRow.userPreferences)
      ? (userRow.userPreferences as Record<string, unknown>)
      : {};

  return {
    policy: resolvedPolicy.policy,
    syncedPreferences: resolveLocalAiPreferences(rawPreferences.localAi),
  };
}
