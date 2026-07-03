import {
  DEFAULT_AGE_SAFETY_POLICY,
  STRICT_UNKNOWN_COUNTRY_PRESET,
  evaluateAgeSafetyPolicy,
  resolveJurisdictionPreset,
  type AgeSafetyDecision,
  type AgeSafetyPolicy,
  type SafetyAction,
  type SafetyActorContext,
  type SafetySurface,
} from "../../shared/ageSafetyPolicy";

export type AgeSafetyPolicyModeInput = {
  flags?: Partial<{
    ageSafetyPolicyEnabled: boolean;
    ageSafetyObserveMode: boolean;
    ageSafetyEmergencyChildSafeMode: boolean;
  }> | null;
  policy?: AgeSafetyPolicy | null;
};

export function resolveActiveAgeSafetyPolicy(input: AgeSafetyPolicyModeInput = {}): AgeSafetyPolicy {
  const policy = input.policy ?? DEFAULT_AGE_SAFETY_POLICY;
  if (input.flags?.ageSafetyEmergencyChildSafeMode) {
    return { ...policy, rolloutMode: "emergency_child_safe" };
  }
  if (!input.flags?.ageSafetyPolicyEnabled) {
    return { ...policy, rolloutMode: "off" };
  }
  if (input.flags?.ageSafetyObserveMode) {
    return { ...policy, rolloutMode: "observe" };
  }
  return policy.rolloutMode === "off" ? { ...policy, rolloutMode: "enforce_sensitive_surfaces" } : policy;
}

export function evaluateAgeSafetyAccess(input: {
  actor: SafetyActorContext;
  surface: SafetySurface;
  action: SafetyAction;
  now: Date;
  flags?: AgeSafetyPolicyModeInput["flags"];
  policy?: AgeSafetyPolicy | null;
  protectedSurfaceScope?: string;
}): AgeSafetyDecision {
  const policy = resolveActiveAgeSafetyPolicy({ flags: input.flags, policy: input.policy });
  const preset = resolveJurisdictionPreset(input.actor.countryCode, undefined, input.now);
  return evaluateAgeSafetyPolicy({
    actor: input.actor,
    surface: input.surface,
    action: input.action,
    now: input.now,
    policy,
    jurisdictionPreset: preset.id === "STRICT_UNKNOWN_COUNTRY" ? STRICT_UNKNOWN_COUNTRY_PRESET : preset,
    protectedSurfaceScope: input.protectedSurfaceScope,
  });
}

export function isAgeSafetyDecisionBlocking(decision: AgeSafetyDecision): boolean {
  return decision.allowed === false || decision.effect === "require_profile" || decision.effect === "require_pin" || decision.effect === "require_review";
}
