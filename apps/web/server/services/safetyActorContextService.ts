import {
  normalizeCountryCode,
  normalizeTenantId,
  type AgeBand,
  type SafetyActorContext,
  type SafetyActorKind,
} from "../../shared/ageSafetyPolicy";
import { getEffectiveSafetyProfileFromPrefs } from "./ageSafetyProfileService";

export type SafetyActorInput = {
  authMode?: string | null;
  actorKind?: SafetyActorKind;
  userId?: number | null;
  ownerUserId?: number | null;
  tenantId?: string | number | null;
  countryCode?: string | null;
  userPreferences?: unknown;
  audienceBand?: AgeBand | null;
  protectedSurfaceScopes?: string[];
  workerId?: string | null;
  workerJobId?: string | null;
  delegatedSessionId?: string | null;
};

export function resolveSafetyActorKind(input: SafetyActorInput): SafetyActorKind {
  if (input.actorKind) return input.actorKind;
  if (input.authMode === "api_key") return "api_key";
  if (input.authMode === "delegated_worker") return "delegated_worker";
  if (input.authMode === "system" || input.authMode === "internal") return "system_agent";
  return "human_user";
}

export function buildSafetyActorContext(input: SafetyActorInput, now: Date): SafetyActorContext {
  const actorKind = resolveSafetyActorKind(input);
  const profile = getEffectiveSafetyProfileFromPrefs(input.userPreferences, now);
  const countryCode = normalizeCountryCode(input.countryCode) ?? profile.countryOfResidence;
  return {
    actorKind,
    actorUserId: input.userId ?? null,
    ownerUserId: input.ownerUserId ?? (actorKind === "human_user" ? input.userId ?? null : null),
    tenantId: normalizeTenantId(input.tenantId),
    countryCode,
    dateOfBirth: actorKind === "human_user" || actorKind === "api_key" || actorKind === "delegated_worker"
      ? profile.dateOfBirth
      : null,
    audienceBand: input.audienceBand ?? null,
    protectedSurfaceScopes: input.protectedSurfaceScopes ?? [],
  };
}

export function assertSafetyActorContext(input: SafetyActorContext): { ok: true } | { ok: false; code: "missing_actor_context"; missingFields: string[] } {
  const missingFields: string[] = [];
  if (!input.actorKind) missingFields.push("actorKind");
  if (!normalizeTenantId(input.tenantId)) missingFields.push("tenantId");
  if (input.actorKind !== "system_agent" && !input.actorUserId && !input.ownerUserId) {
    missingFields.push("actorUserId");
  }
  return missingFields.length === 0 ? { ok: true } : { ok: false, code: "missing_actor_context", missingFields };
}
