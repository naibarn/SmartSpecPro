export type AgeBand = "unknown" | "child" | "teen" | "adult";

export type SafetyActorKind =
  | "human_user"
  | "api_key"
  | "delegated_worker"
  | "widget_visitor"
  | "system_user"
  | "system_agent"
  | "admin"
  | "domain_admin";

export type SafetySurface =
  | "route"
  | "menu"
  | "chat"
  | "media_image"
  | "media_video"
  | "media_audio"
  | "private_chat"
  | "generated_asset"
  | "public_share"
  | "admin_policy"
  | "settings_security"
  | "api"
  | "mcp"
  | "widget"
  | "worker";

export type SafetyAction =
  | "read"
  | "create"
  | "submit_prompt"
  | "receive_output"
  | "download"
  | "share"
  | "remix"
  | "reference"
  | "configure_policy"
  | "unlock"
  | "complete_profile";

export type SafetyDecisionEffect = "allow" | "block" | "require_profile" | "require_pin" | "require_review" | "transform";

export type AgeSafetyRolloutMode =
  | "off"
  | "observe"
  | "prompt_only"
  | "enforce_sensitive_surfaces"
  | "enforce_all"
  | "emergency_child_safe";

export type JurisdictionReviewStatus = "draft" | "approved" | "expired" | "blocked";

export type JurisdictionPreset = {
  id: string;
  countryCodes: string[];
  label: string;
  source: "legal_default" | "platform_conservative" | "tenant_override";
  sourceRefs: Array<{ label: string; url: string; accessedAt: string }>;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  lastReviewedAt: string;
  nextReviewDueAt: string;
  legalReviewStatus: JurisdictionReviewStatus;
  minimumServiceAge: number;
  childMaxExclusive: number;
  adultMinInclusive: number;
  childConsentAge: number;
  under18ServiceAllowed: boolean;
  guardianConsentRequiredBelowAge?: number | null;
};

export type SafetyActorContext = {
  actorKind: SafetyActorKind;
  actorUserId?: number | null;
  ownerUserId?: number | null;
  tenantId?: string | number | null;
  countryCode?: string | null;
  dateOfBirth?: string | null;
  audienceBand?: AgeBand | null;
  protectedSurfaceScopes?: string[];
};

export type SafetyRule = {
  id: string;
  surface: SafetySurface | "*";
  action: SafetyAction | "*";
  minimumAgeBand: Exclude<AgeBand, "unknown">;
  effect?: SafetyDecisionEffect;
  overridableWithPin?: boolean;
  hardBlock?: boolean;
  reasonCode: string;
};

export type AgeSafetyPolicy = {
  policyVersion: string;
  rolloutMode: AgeSafetyRolloutMode;
  adultOnlyServiceMode: boolean;
  rules: SafetyRule[];
  defaultMinimumAgeBand: Exclude<AgeBand, "unknown">;
};

export type AgeSafetyDecision = {
  effect: SafetyDecisionEffect;
  allowed: boolean;
  actualAgeBand: AgeBand;
  enforcementAgeBand: Exclude<AgeBand, "unknown">;
  reasonCode: string;
  policyVersion: string;
  jurisdictionPresetId: string;
  degradedMode?: "none" | "policy_unavailable" | "classifier_timeout" | "stale_preset";
  wouldBlock?: boolean;
  requiredScope?: string;
  metadata: {
    surface: SafetySurface;
    action: SafetyAction;
    policySnapshotHash: string;
  };
};

export type EvaluateAgeSafetyInput = {
  actor: SafetyActorContext;
  surface: SafetySurface;
  action: SafetyAction;
  now: Date;
  policy?: AgeSafetyPolicy | null;
  jurisdictionPreset?: JurisdictionPreset | null;
  protectedSurfaceScope?: string;
};

const AGE_BAND_RANK: Record<Exclude<AgeBand, "unknown">, number> = {
  child: 0,
  teen: 1,
  adult: 2,
};

const DEFAULT_REFS = [
  {
    label: "Platform default",
    url: "internal:platform-default",
    accessedAt: "2026-07-01",
  },
];

export const STRICT_UNKNOWN_COUNTRY_PRESET: JurisdictionPreset = {
  id: "STRICT_UNKNOWN_COUNTRY",
  countryCodes: [],
  label: "Strict unsupported or unknown country fallback",
  source: "platform_conservative",
  sourceRefs: DEFAULT_REFS,
  effectiveFrom: "2026-07-01",
  lastReviewedAt: "2026-07-01",
  nextReviewDueAt: "2027-01-01",
  legalReviewStatus: "approved",
  minimumServiceAge: 18,
  childMaxExclusive: 13,
  adultMinInclusive: 18,
  childConsentAge: 16,
  under18ServiceAllowed: false,
  guardianConsentRequiredBelowAge: 18,
};

export const DEFAULT_JURISDICTION_PRESETS: readonly JurisdictionPreset[] = [
  {
    id: "US_COPPA_DEFAULT",
    countryCodes: ["US"],
    label: "United States default",
    source: "legal_default",
    sourceRefs: DEFAULT_REFS,
    effectiveFrom: "2026-07-01",
    lastReviewedAt: "2026-07-01",
    nextReviewDueAt: "2027-01-01",
    legalReviewStatus: "approved",
    minimumServiceAge: 18,
    childMaxExclusive: 13,
    adultMinInclusive: 18,
    childConsentAge: 13,
    under18ServiceAllowed: false,
    guardianConsentRequiredBelowAge: 13,
  },
  {
    id: "TH_DEFAULT",
    countryCodes: ["TH"],
    label: "Thailand default",
    source: "legal_default",
    sourceRefs: DEFAULT_REFS,
    effectiveFrom: "2026-07-01",
    lastReviewedAt: "2026-07-01",
    nextReviewDueAt: "2027-01-01",
    legalReviewStatus: "approved",
    minimumServiceAge: 18,
    childMaxExclusive: 13,
    adultMinInclusive: 18,
    childConsentAge: 20,
    under18ServiceAllowed: false,
    guardianConsentRequiredBelowAge: 20,
  },
  {
    id: "GB_AADC_DEFAULT",
    countryCodes: ["GB"],
    label: "United Kingdom default",
    source: "legal_default",
    sourceRefs: DEFAULT_REFS,
    effectiveFrom: "2026-07-01",
    lastReviewedAt: "2026-07-01",
    nextReviewDueAt: "2027-01-01",
    legalReviewStatus: "approved",
    minimumServiceAge: 18,
    childMaxExclusive: 13,
    adultMinInclusive: 18,
    childConsentAge: 13,
    under18ServiceAllowed: false,
    guardianConsentRequiredBelowAge: 13,
  },
  {
    id: "EU_EEA_DEFAULT",
    countryCodes: [
      "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
      "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO",
      "SK", "SI", "ES", "SE",
    ],
    label: "EU/EEA default",
    source: "legal_default",
    sourceRefs: DEFAULT_REFS,
    effectiveFrom: "2026-07-01",
    lastReviewedAt: "2026-07-01",
    nextReviewDueAt: "2027-01-01",
    legalReviewStatus: "approved",
    minimumServiceAge: 18,
    childMaxExclusive: 13,
    adultMinInclusive: 18,
    childConsentAge: 16,
    under18ServiceAllowed: false,
    guardianConsentRequiredBelowAge: 16,
  },
];

export const DEFAULT_AGE_SAFETY_POLICY: AgeSafetyPolicy = {
  policyVersion: "age-safety-v1",
  rolloutMode: "off",
  adultOnlyServiceMode: false,
  defaultMinimumAgeBand: "adult",
  rules: [
    {
      id: "chat-submit-general",
      surface: "chat",
      action: "submit_prompt",
      minimumAgeBand: "child",
      reasonCode: "age_policy_chat_general_allowed",
    },
    {
      id: "chat-output-general",
      surface: "chat",
      action: "receive_output",
      minimumAgeBand: "child",
      reasonCode: "age_policy_chat_output_general_allowed",
    },
    {
      id: "media-image-submit-general",
      surface: "media_image",
      action: "submit_prompt",
      minimumAgeBand: "teen",
      reasonCode: "age_policy_media_general_teen",
      overridableWithPin: true,
    },
    {
      id: "media-video-submit-general",
      surface: "media_video",
      action: "submit_prompt",
      minimumAgeBand: "teen",
      reasonCode: "age_policy_media_general_teen",
      overridableWithPin: true,
    },
    {
      id: "media-audio-submit-general",
      surface: "media_audio",
      action: "submit_prompt",
      minimumAgeBand: "teen",
      reasonCode: "age_policy_media_general_teen",
      overridableWithPin: true,
    },
    {
      id: "private-chat-pin",
      surface: "private_chat",
      action: "read",
      minimumAgeBand: "adult",
      effect: "require_pin",
      reasonCode: "age_policy_private_chat_pin_required",
      overridableWithPin: true,
    },
  ],
};

export function normalizeCountryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const normalized = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function normalizeTenantId(tenantId: string | number | null | undefined): string | null {
  if (tenantId === null || tenantId === undefined) return null;
  const normalized = String(tenantId).trim();
  return normalized.length > 0 ? normalized : null;
}

export function calculateAgeOnDate(dateOfBirth: string | null | undefined, now: Date): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const dob = new Date(Date.UTC(year, month - 1, day));
  if (
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day ||
    dob.getTime() > now.getTime()
  ) {
    return null;
  }
  let age = now.getUTCFullYear() - year;
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();
  if (nowMonth < month || (nowMonth === month && nowDay < day)) {
    age -= 1;
  }
  return age;
}

export function classifyAgeBand(
  dateOfBirth: string | null | undefined,
  now: Date,
  preset: JurisdictionPreset = STRICT_UNKNOWN_COUNTRY_PRESET,
): AgeBand {
  const age = calculateAgeOnDate(dateOfBirth, now);
  if (age === null) return "unknown";
  if (age < preset.childMaxExclusive) return "child";
  if (age < preset.adultMinInclusive) return "teen";
  return "adult";
}

export function enforcementBandFor(ageBand: AgeBand): Exclude<AgeBand, "unknown"> {
  return ageBand === "unknown" ? "child" : ageBand;
}

export function resolveJurisdictionPreset(
  countryCode: string | null | undefined,
  presets: readonly JurisdictionPreset[] = DEFAULT_JURISDICTION_PRESETS,
  now: Date = new Date(),
): JurisdictionPreset {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return STRICT_UNKNOWN_COUNTRY_PRESET;
  const matched = presets.find((preset) => preset.countryCodes.includes(normalized));
  if (!matched || !isPresetApproved(matched, now)) return STRICT_UNKNOWN_COUNTRY_PRESET;
  return matched;
}

export function isPresetApproved(preset: JurisdictionPreset, now: Date): boolean {
  if (preset.legalReviewStatus !== "approved") return false;
  if (preset.effectiveUntil && new Date(preset.effectiveUntil).getTime() < now.getTime()) return false;
  return new Date(preset.nextReviewDueAt).getTime() >= now.getTime();
}

export function ageBandMeetsMinimum(
  actual: Exclude<AgeBand, "unknown">,
  minimum: Exclude<AgeBand, "unknown">,
): boolean {
  return AGE_BAND_RANK[actual] >= AGE_BAND_RANK[minimum];
}

export function getPolicySnapshotHash(policy: AgeSafetyPolicy, preset: JurisdictionPreset): string {
  const payload = JSON.stringify({
    policyVersion: policy.policyVersion,
    rolloutMode: policy.rolloutMode,
    adultOnlyServiceMode: policy.adultOnlyServiceMode,
    rules: policy.rules.map((rule) => [rule.id, rule.surface, rule.action, rule.minimumAgeBand, rule.effect, rule.reasonCode]),
    presetId: preset.id,
    presetReview: preset.legalReviewStatus,
    presetNextReview: preset.nextReviewDueAt,
  });
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function evaluateAgeSafetyPolicy(input: EvaluateAgeSafetyInput): AgeSafetyDecision {
  const policy = input.policy ?? DEFAULT_AGE_SAFETY_POLICY;
  const preset = input.jurisdictionPreset ?? resolveJurisdictionPreset(input.actor.countryCode, undefined, input.now);
  const actualAgeBand = input.actor.audienceBand ?? classifyAgeBand(input.actor.dateOfBirth, input.now, preset);
  const hasTemporaryAdultUnlock = input.actor.protectedSurfaceScopes?.includes("age-policy:temporary-adult") === true;
  const enforcementAgeBand = policy.rolloutMode === "emergency_child_safe"
    ? "child"
    : hasTemporaryAdultUnlock
      ? "adult"
      : enforcementBandFor(actualAgeBand);
  const snapshotHash = getPolicySnapshotHash(policy, preset);

  const base = {
    actualAgeBand,
    enforcementAgeBand,
    policyVersion: policy.policyVersion,
    jurisdictionPresetId: preset.id,
    degradedMode: "none" as const,
    metadata: {
      surface: input.surface,
      action: input.action,
      policySnapshotHash: snapshotHash,
    },
  };
  const rule = policy.rules.find((candidate) =>
    (candidate.surface === "*" || candidate.surface === input.surface) &&
    (candidate.action === "*" || candidate.action === input.action)
  );
  const minimum = rule?.minimumAgeBand ?? policy.defaultMinimumAgeBand;
  const reasonCode = rule?.reasonCode ?? "age_policy_minimum_age";

  if (policy.rolloutMode === "off") {
    return {
      ...base,
      effect: "allow",
      allowed: true,
      reasonCode: "age_policy_disabled",
    };
  }

  if (actualAgeBand === "unknown") {
    return policy.rolloutMode === "observe"
      ? {
          ...base,
          effect: "allow",
          allowed: true,
          wouldBlock: true,
          reasonCode: "safety_profile_required_observe",
        }
      : {
          ...base,
          effect: "require_profile",
          allowed: false,
          reasonCode: "safety_profile_required",
        };
  }

  if (policy.adultOnlyServiceMode && enforcementAgeBand !== "adult") {
    return policy.rolloutMode === "observe"
      ? {
          ...base,
          effect: "allow",
          allowed: true,
          wouldBlock: true,
          reasonCode: `${reasonCode}_observe`,
        }
      : {
          ...base,
          effect: "block",
          allowed: false,
          reasonCode,
        };
  }

  if (!ageBandMeetsMinimum(enforcementAgeBand, minimum)) {
    if (rule?.overridableWithPin && input.protectedSurfaceScope && input.actor.protectedSurfaceScopes?.includes(input.protectedSurfaceScope)) {
      return {
        ...base,
        effect: "allow",
        allowed: true,
        reasonCode: `${reasonCode}_pin_unlocked`,
      };
    }
    return policy.rolloutMode === "observe"
      ? {
          ...base,
          effect: "allow",
          allowed: true,
          wouldBlock: true,
          reasonCode: `${reasonCode}_observe`,
          requiredScope: rule?.overridableWithPin ? input.protectedSurfaceScope : undefined,
        }
      : {
          ...base,
          effect: rule?.effect === "require_pin" || rule?.overridableWithPin ? "require_pin" : "block",
          allowed: false,
          reasonCode,
          requiredScope: rule?.overridableWithPin ? input.protectedSurfaceScope : undefined,
        };
  }

  if (rule?.effect === "require_pin" && !input.actor.protectedSurfaceScopes?.includes(input.protectedSurfaceScope ?? "")) {
    return {
      ...base,
      effect: "require_pin",
      allowed: false,
      reasonCode,
      requiredScope: input.protectedSurfaceScope,
    };
  }

  if (
    hasTemporaryAdultUnlock &&
    actualAgeBand !== "adult" &&
    rule?.overridableWithPin &&
    input.protectedSurfaceScope &&
    input.actor.protectedSurfaceScopes?.includes(input.protectedSurfaceScope)
  ) {
    return {
      ...base,
      effect: "allow",
      allowed: true,
      reasonCode: `${reasonCode}_pin_unlocked`,
    };
  }

  return {
    ...base,
    effect: "allow",
    allowed: true,
    reasonCode: "age_policy_allowed",
  };
}
