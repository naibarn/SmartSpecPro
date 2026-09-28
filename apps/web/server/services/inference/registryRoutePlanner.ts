import type { InferenceIntentV2 } from "./contracts";
import type { InferenceAuthoritySnapshot } from "./policyResolver";
import { loadInferenceProfileRegistry } from "./profileRegistry";
import {
  resolveInferenceRoute,
  type RoutePlanningResult,
} from "./routePlanner";

export type RegistryRoutePlanningResult =
  | {
      status: "registry_unavailable";
      reasonCode: "PROFILE_REGISTRY_UNAVAILABLE" | "PROFILE_REGISTRY_INVALID";
    }
  | {
      status: "planned";
      registryRevision: string;
      invalidProfileIds: string[];
      route: RoutePlanningResult;
    };

/**
 * Route only from the current PostgreSQL profile heads. The registry snapshot
 * revision travels with the plan result so callers can persist and audit which
 * qualification catalog was used.
 */
export async function planInferenceRouteFromRegistry(input: {
  intent: InferenceIntentV2;
  authority: InferenceAuthoritySnapshot;
  nowMs: number;
}): Promise<RegistryRoutePlanningResult> {
  const registry = await loadInferenceProfileRegistry(
    new Date(input.nowMs)
  );
  if (!registry.ok) {
    return {
      status: "registry_unavailable",
      reasonCode: registry.code,
    };
  }
  return {
    status: "planned",
    registryRevision: registry.registryRevision,
    invalidProfileIds: registry.invalidProfileIds,
    route: resolveInferenceRoute(
      input.intent,
      registry.profiles.map(profile => ({
        model: profile.model,
        deployment: profile.deployment,
      })),
      input.authority,
      input.nowMs
    ),
  };
}
