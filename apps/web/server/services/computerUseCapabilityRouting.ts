export type ComputerUseRoute =
  "structured" | "semantic" | "localRunner" | "visual";

export type BrowserEngine = "chromium" | "moli";

export type MoliFeatureFlags = {
  moli_enabled: boolean;
  moli_shadow_mode: boolean;
  moli_production_enabled: boolean;
};

export const DEFAULT_MOLI_FEATURE_FLAGS: MoliFeatureFlags = {
  moli_enabled: false,
  moli_shadow_mode: true,
  moli_production_enabled: false,
};

export function readMoliFeatureFlags(
  env: Record<string, string | undefined> = process.env,
): MoliFeatureFlags {
  const enabled = (name: string, fallback: boolean) => {
    const value = env[name];
    if (value === undefined) return fallback;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  };

  return {
    moli_enabled: enabled("moli_enabled", DEFAULT_MOLI_FEATURE_FLAGS.moli_enabled),
    moli_shadow_mode: enabled("moli_shadow_mode", DEFAULT_MOLI_FEATURE_FLAGS.moli_shadow_mode),
    moli_production_enabled: enabled("moli_production_enabled", DEFAULT_MOLI_FEATURE_FLAGS.moli_production_enabled),
  };
}

/**
 * Pure engine selection for the experimental Runner adapter. Dispatch remains
 * Chromium unless the caller supplies a capability-certified Moli candidate
 * and every rollout gate explicitly permits execution.
 */
export function selectBrowserEngine(input: {
  moliEligible: boolean;
  flags?: MoliFeatureFlags;
  environment?: string;
}): { engine: BrowserEngine; shadowCandidate?: BrowserEngine; reason: string } {
  const flags = input.flags ?? DEFAULT_MOLI_FEATURE_FLAGS;
  if ((input.environment ?? process.env.NODE_ENV) === "production") {
    return { engine: "chromium", reason: "MOLI_PRODUCTION_DISABLED_PHASE1" };
  }
  const candidate = input.moliEligible && flags.moli_enabled;
  if (candidate && flags.moli_shadow_mode) {
    return { engine: "chromium", shadowCandidate: "moli", reason: "MOLI_SHADOW_ONLY" };
  }
  if (candidate && flags.moli_production_enabled) {
    return { engine: "moli", reason: "MOLI_EXPLICITLY_ENABLED" };
  }
  return {
    engine: "chromium",
    reason: input.moliEligible ? "MOLI_ROLLOUT_DISABLED" : "MOLI_CAPABILITY_NOT_CERTIFIED",
  };
}

export type ComputerUseCapabilitySnapshot = Record<
  ComputerUseRoute,
  { ready: boolean; reasonCode: string; costClass: "low" | "medium" | "high" }
>;

export function resolveComputerUseRoute(input: {
  snapshot: ComputerUseCapabilitySnapshot;
  policy: "allowed" | "denied" | "approval_required";
  required: "click" | "type" | "submit";
}): {
  decision: "routed" | "denied" | "blocked";
  route?: ComputerUseRoute;
  reasonCode: string;
  candidates: ComputerUseRoute[];
} {
  const candidates: ComputerUseRoute[] = [
    "structured",
    "semantic",
    "localRunner",
    "visual",
  ];
  if (input.policy === "denied")
    return { decision: "denied", reasonCode: "POLICY_DENIED", candidates: [] };
  if (input.policy === "approval_required")
    return {
      decision: "blocked",
      reasonCode: "APPROVAL_REQUIRED",
      candidates: [],
    };
  for (const route of candidates)
    if (input.snapshot[route].ready)
      return {
        decision: "routed",
        route,
        reasonCode: input.snapshot[route].reasonCode,
        candidates,
      };
  return { decision: "blocked", reasonCode: "NO_CAPABILITY_READY", candidates };
}
