import { useMemo } from "react";

import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
  resolveLocalAiSyncedPreferences,
} from "../state/localAiSettingsStore";
import type { LocalAiExecutionMode } from "../types/capability";

export interface LocalSkillExecutionContext {
  platform: "web" | "tauri";
  featureEnabled: boolean;
  forceCloudOnly: boolean;
  localAiEnabled: boolean;
  executionMode: LocalAiExecutionMode;
  preferredLocalProfileId: string | null;
}

export function useLocalSkillExecutionContext(): LocalSkillExecutionContext {
  const featureEnabled = useTenantFeatureFlag("localClientLlmMode");
  const platform =
    typeof window !== "undefined" && (window as any).__TAURI__ != null
      ? "tauri"
      : "web";
  const preferencesQuery = trpc.users.getPreferences.useQuery(undefined, {
    enabled: featureEnabled,
  });
  const preferencesLocalAi = (
    preferencesQuery.data as { localAi?: unknown } | undefined
  )?.localAi;
  const localAiCatalogQuery = trpc.localAi.getPolicyAndCatalog.useQuery(
    { platform },
    { enabled: featureEnabled },
  );

  const localAiPreferences = useMemo(
    () => (
      featureEnabled
        ? resolveLocalAiSyncedPreferences(preferencesLocalAi)
        : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES
    ),
    [featureEnabled, preferencesLocalAi],
  );

  return {
    platform,
    featureEnabled,
    forceCloudOnly: localAiCatalogQuery.data?.policy.forceCloudOnly === true,
    localAiEnabled: localAiPreferences.enabled,
    executionMode: localAiPreferences.mode,
    preferredLocalProfileId: localAiPreferences.defaultModelId,
  };
}
