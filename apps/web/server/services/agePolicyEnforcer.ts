import type { AgeSafetyDecision, SafetyAction, SafetyActorContext, SafetySurface } from "../../shared/ageSafetyPolicy";
import { evaluateAgeSafetyAccess, type AgeSafetyPolicyModeInput } from "./ageSafetyPolicyService";
import { logAgeSafetyDecision } from "./agePolicyAudit";

export type AgePolicyEnforcementResult = {
  decision: AgeSafetyDecision;
  response?: {
    code: string;
    message: string;
    missingFields?: string[];
    nextAllowedRoute?: string;
    actualAgeBand?: string;
    enforcementAgeBand?: string;
    jurisdictionPresetId?: string;
  };
};

export function enforceAgePolicy(input: {
  actor: SafetyActorContext;
  surface: SafetySurface;
  action: SafetyAction;
  now?: Date;
  flags?: AgeSafetyPolicyModeInput["flags"];
  policy?: AgeSafetyPolicyModeInput["policy"];
  protectedSurfaceScope?: string;
  audit?: boolean;
}): AgePolicyEnforcementResult {
  const decision = evaluateAgeSafetyAccess({
    actor: input.actor,
    surface: input.surface,
    action: input.action,
    now: input.now ?? new Date(),
    flags: input.flags,
    policy: input.policy,
    protectedSurfaceScope: input.protectedSurfaceScope,
  });
  if (input.audit) {
    logAgeSafetyDecision({
      userId: input.actor.actorUserId ?? input.actor.ownerUserId ?? null,
      tenantId: input.actor.tenantId == null ? null : String(input.actor.tenantId),
      decision,
    });
  }
  if (decision.allowed) return { decision };
  const response = decision.effect === "require_profile"
    ? {
        code: decision.reasonCode.includes("country") || decision.jurisdictionPresetId === "STRICT_UNKNOWN_COUNTRY"
          ? "country_profile_invalid"
          : "safety_profile_required",
        message: "Safety profile is required before using this feature.",
        missingFields: decision.actualAgeBand === "unknown" ? ["dateOfBirth", "countryOfResidence"] : undefined,
        nextAllowedRoute: "/settings/security",
        actualAgeBand: decision.actualAgeBand,
        enforcementAgeBand: decision.enforcementAgeBand,
        jurisdictionPresetId: decision.jurisdictionPresetId,
      }
    : {
        code: decision.reasonCode,
        message: decision.enforcementAgeBand === "adult"
          ? "This action is restricted by age-safety policy."
          : "This action requires an adult safety profile.",
        actualAgeBand: decision.actualAgeBand,
        enforcementAgeBand: decision.enforcementAgeBand,
        jurisdictionPresetId: decision.jurisdictionPresetId,
      };
  return { decision, response };
}

export function buildProviderAgePolicyInstruction(decision: AgeSafetyDecision): string {
  return [
    "Apply SmartSpecPro age-safety policy.",
    `Effective age band: ${decision.enforcementAgeBand}.`,
    `Surface: ${decision.metadata.surface}.`,
    "Do not produce content outside the allowed policy for this age band.",
    "Do not reveal or infer date of birth, exact age, country, PIN state, consent state, or internal policy JSON.",
  ].join(" ");
}

export function assertProviderInstructionRedacted(instruction: string): boolean {
  return !/(dateOfBirth|exact age|countryOfResidence|pinHash|guardianConsent|policy JSON:)/i.test(instruction);
}
