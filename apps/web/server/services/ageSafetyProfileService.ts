import type { User } from "../../drizzle/schema";
import {
  STRICT_UNKNOWN_COUNTRY_PRESET,
  calculateAgeOnDate,
  classifyAgeBand,
  normalizeCountryCode,
  resolveJurisdictionPreset,
  type AgeBand,
  type JurisdictionPreset,
} from "../../shared/ageSafetyPolicy";

export type SafetyProfilePrefs = {
  dateOfBirth?: string;
  dateOfBirthUpdatedAt?: string;
  dateOfBirthChangeCount?: number;
  countryOfResidence?: string;
  countryOfResidenceUpdatedAt?: string;
  countryOfResidenceChangeCount?: number;
  jurisdictionPresetId?: string;
  profileVersion?: number;
  completedAt?: string;
};

export type UserPreferencesWithSafetyProfile = Record<string, unknown> & {
  safetyProfile?: SafetyProfilePrefs;
};

export type SafetyProfileInput = {
  dateOfBirth: string;
  countryOfResidence: string;
};

export type SafetyProfileValidationResult =
  | { ok: true; normalized: SafetyProfileInput; preset: JurisdictionPreset }
  | { ok: false; code: "invalid_date_of_birth" | "future_date_of_birth" | "country_profile_invalid"; missingFields?: string[] };

export type EffectiveSafetyProfile = {
  complete: boolean;
  missingFields: Array<"dateOfBirth" | "countryOfResidence">;
  dateOfBirth: string | null;
  countryOfResidence: string | null;
  actualAge: number | null;
  actualAgeBand: AgeBand;
  enforcementAgeBand: Exclude<AgeBand, "unknown">;
  jurisdictionPresetId: string;
  profileVersion: number;
  completedAt: string | null;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSafetyProfilePrefs(prefs: unknown): SafetyProfilePrefs {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return {};
  const raw = prefs as UserPreferencesWithSafetyProfile;
  const profile = raw.safetyProfile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  return {
    dateOfBirth: typeof profile.dateOfBirth === "string" ? profile.dateOfBirth : undefined,
    dateOfBirthUpdatedAt: typeof profile.dateOfBirthUpdatedAt === "string" ? profile.dateOfBirthUpdatedAt : undefined,
    dateOfBirthChangeCount: Number.isFinite(Number(profile.dateOfBirthChangeCount)) ? Number(profile.dateOfBirthChangeCount) : undefined,
    countryOfResidence: typeof profile.countryOfResidence === "string" ? profile.countryOfResidence : undefined,
    countryOfResidenceUpdatedAt: typeof profile.countryOfResidenceUpdatedAt === "string" ? profile.countryOfResidenceUpdatedAt : undefined,
    countryOfResidenceChangeCount: Number.isFinite(Number(profile.countryOfResidenceChangeCount)) ? Number(profile.countryOfResidenceChangeCount) : undefined,
    jurisdictionPresetId: typeof profile.jurisdictionPresetId === "string" ? profile.jurisdictionPresetId : undefined,
    profileVersion: Number.isFinite(Number(profile.profileVersion)) ? Number(profile.profileVersion) : undefined,
    completedAt: typeof profile.completedAt === "string" ? profile.completedAt : undefined,
  };
}

export function validateSafetyProfileInput(input: SafetyProfileInput, now: Date): SafetyProfileValidationResult {
  const normalizedDob = input.dateOfBirth.trim();
  if (!DATE_ONLY_RE.test(normalizedDob) || calculateAgeOnDate(normalizedDob, now) === null) {
    return { ok: false, code: "invalid_date_of_birth" };
  }
  if (new Date(`${normalizedDob}T00:00:00.000Z`).getTime() > now.getTime()) {
    return { ok: false, code: "future_date_of_birth" };
  }
  const normalizedCountry = normalizeCountryCode(input.countryOfResidence);
  const preset = resolveJurisdictionPreset(normalizedCountry, undefined, now);
  if (!normalizedCountry || preset.id === STRICT_UNKNOWN_COUNTRY_PRESET.id) {
    return { ok: false, code: "country_profile_invalid", missingFields: normalizedCountry ? [] : ["countryOfResidence"] };
  }
  return {
    ok: true,
    normalized: {
      dateOfBirth: normalizedDob,
      countryOfResidence: normalizedCountry,
    },
    preset,
  };
}

export function buildSafetyProfilePreferences(
  currentPrefs: unknown,
  input: SafetyProfileInput,
  now: Date,
): UserPreferencesWithSafetyProfile {
  const existing = normalizeSafetyProfilePrefs(currentPrefs);
  const normalizedCountry = normalizeCountryCode(input.countryOfResidence);
  if (!normalizedCountry) {
    throw new Error("country_profile_invalid");
  }
  const preset = resolveJurisdictionPreset(normalizedCountry, undefined, now);
  if (preset.id === STRICT_UNKNOWN_COUNTRY_PRESET.id) {
    throw new Error("country_profile_invalid");
  }
  const current = currentPrefs && typeof currentPrefs === "object" && !Array.isArray(currentPrefs)
    ? currentPrefs as Record<string, unknown>
    : {};
  const dobChanged = existing.dateOfBirth !== input.dateOfBirth;
  const countryChanged = existing.countryOfResidence !== normalizedCountry;
  const nextVersion = (existing.profileVersion ?? 0) + (dobChanged || countryChanged ? 1 : 0);
  return {
    ...current,
    safetyProfile: {
      ...existing,
      dateOfBirth: input.dateOfBirth,
      dateOfBirthUpdatedAt: dobChanged ? now.toISOString() : existing.dateOfBirthUpdatedAt,
      dateOfBirthChangeCount: (existing.dateOfBirthChangeCount ?? 0) + (dobChanged ? 1 : 0),
      countryOfResidence: normalizedCountry,
      countryOfResidenceUpdatedAt: countryChanged ? now.toISOString() : existing.countryOfResidenceUpdatedAt,
      countryOfResidenceChangeCount: (existing.countryOfResidenceChangeCount ?? 0) + (countryChanged ? 1 : 0),
      jurisdictionPresetId: preset.id,
      profileVersion: nextVersion,
      completedAt: existing.completedAt ?? now.toISOString(),
    },
  };
}

export function getEffectiveSafetyProfileFromPrefs(
  prefs: unknown,
  now: Date,
): EffectiveSafetyProfile {
  const profile = normalizeSafetyProfilePrefs(prefs);
  const country = normalizeCountryCode(profile.countryOfResidence);
  const preset = resolveJurisdictionPreset(country, undefined, now);
  const actualAge = calculateAgeOnDate(profile.dateOfBirth, now);
  const actualAgeBand = classifyAgeBand(profile.dateOfBirth, now, preset);
  const missingFields: EffectiveSafetyProfile["missingFields"] = [];
  if (!profile.dateOfBirth || actualAge === null) missingFields.push("dateOfBirth");
  if (!country || preset.id === STRICT_UNKNOWN_COUNTRY_PRESET.id) missingFields.push("countryOfResidence");
  return {
    complete: missingFields.length === 0,
    missingFields,
    dateOfBirth: profile.dateOfBirth ?? null,
    countryOfResidence: country,
    actualAge,
    actualAgeBand,
    enforcementAgeBand: actualAgeBand === "unknown" ? "child" : actualAgeBand,
    jurisdictionPresetId: preset.id,
    profileVersion: profile.profileVersion ?? 0,
    completedAt: profile.completedAt ?? null,
  };
}

export function getEffectiveSafetyProfileForUser(user: Pick<User, "userPreferences">, now: Date): EffectiveSafetyProfile {
  return getEffectiveSafetyProfileFromPrefs(user.userPreferences, now);
}

export function buildSafetyProfileRequiredError(profile: EffectiveSafetyProfile): {
  code: "safety_profile_required" | "country_profile_invalid";
  missingFields: string[];
  nextAllowedRoute: string;
  profileVersion: number;
  jurisdictionPresetId: string;
} {
  return {
    code: profile.missingFields.includes("countryOfResidence") ? "country_profile_invalid" : "safety_profile_required",
    missingFields: profile.missingFields,
    nextAllowedRoute: "/settings/security",
    profileVersion: profile.profileVersion,
    jurisdictionPresetId: profile.jurisdictionPresetId,
  };
}
