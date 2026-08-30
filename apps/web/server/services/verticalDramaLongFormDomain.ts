import {
  resolveCapability,
  validateCharacterAdmission,
  validateLookCue,
  type CapabilityResolution,
  type CastAdmissionInput,
  type LookCueInput,
} from "@shared/verticalDramaSeries/longFormContracts";

export type CastExpansionPolicy = {
  version: string;
  maxActiveCharacters: number;
  maxIntroductionsPerBlock: number;
  maxGuestsPerSeason: number;
  minMeaningfulActionsBeforeExit: number;
};

export type CastExpansionState = {
  activeCharacterKeys: string[];
  introductionsInBlock: number;
  guestCount: number;
};

export function validateCastExpansion(
  policy: CastExpansionPolicy,
  state: CastExpansionState,
  admission: CastAdmissionInput
): string[] {
  const errors = validateCharacterAdmission(admission);
  if (
    !state.activeCharacterKeys.includes(admission.characterKey) &&
    state.activeCharacterKeys.length >= policy.maxActiveCharacters
  )
    errors.push("cast_density_limit");
  if (
    !state.activeCharacterKeys.includes(admission.characterKey) &&
    state.introductionsInBlock >= policy.maxIntroductionsPerBlock
  )
    errors.push("block_introduction_limit");
  if (
    admission.role === "guest" &&
    state.guestCount >= policy.maxGuestsPerSeason
  )
    errors.push("guest_frequency_limit");
  return [...new Set(errors)];
}

export type WorldRule = {
  ruleId: string;
  genre: "fantasy" | "sci_fi" | "future" | "cartoon" | "realistic";
  origin: string;
  limit: string;
  cost: string;
  userScope: string[];
  escalation: string;
  visualSignature: string;
};

export function validateWorldRule(rule: WorldRule): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(rule)) {
    if (key !== "userScope" && typeof value === "string" && !value.trim())
      errors.push(`world_rule_missing_${key}`);
  }
  if (!rule.userScope.length) errors.push("world_rule_missing_user_scope");
  return errors;
}

export function resolveWorldCapability(
  rule: WorldRule,
  policy: { supported: boolean; fallback?: string; blocked?: boolean }
): { ruleId: string; resolution: CapabilityResolution } {
  return {
    ruleId: rule.ruleId,
    resolution: resolveCapability(rule.ruleId, policy),
  };
}

export type LookLedgerEntry = LookCueInput & {
  variantType: "outfit";
  state: "clean" | "wet" | "dirty" | "injured" | "repaired";
  firstUseEpisode: number;
  lastUseEpisode: number;
};

export function createLookLedgerEntry(input: LookLedgerEntry): LookLedgerEntry {
  const errors = validateLookCue(input);
  if (errors.length) throw new Error(errors.join(","));
  if (input.lastUseEpisode < input.firstUseEpisode)
    throw new Error("look_timeline_invalid");
  return { ...input, variantType: "outfit" };
}

export function validateLookContinuity(
  previous: LookLedgerEntry | null,
  next: LookLedgerEntry
): string[] {
  if (!previous || previous.characterKey !== next.characterKey) return [];
  if (
    next.episodeNumber === previous.episodeNumber &&
    next.lookId !== previous.lookId &&
    next.cueType !== "continuity"
  )
    return ["uncued_same_episode_look_change"];
  if (
    previous.state !== "clean" &&
    next.state === "clean" &&
    next.cueType !== "continuity" &&
    next.cueType !== "event"
  )
    return ["unexplained_state_reset"];
  return [];
}
