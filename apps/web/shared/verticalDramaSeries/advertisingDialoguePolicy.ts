import {
  resolveCharacterCastingAgeProfile,
  type CharacterCastingAgeProfile,
} from "./characterCastingAge";
import { screenThaiAdCompliance } from "./thaiAdCompliance";

/**
 * The special tie-in is an advertisement. Spoken dialogue therefore has a
 * stricter boundary than ordinary drama dialogue: it must be modest, natural,
 * and never turn a child into a product spokesperson.
 */
export type SpecialDialogueSpeakerEligibilityInput = {
  name?: string;
  role?: unknown;
  narrativeRole?: unknown;
  roleTier?: unknown;
  occupation?: unknown;
  data?: unknown;
};

export type SpecialDialogueSpeakerEligibility = {
  eligible: boolean;
  isMinor: boolean;
  ageProfile: CharacterCastingAgeProfile | null;
  reason: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Resolve eligibility from persisted character facts only. Unknown age is not
 * treated as adult because an advertising speaker must have explicit/derived
 * adult evidence before the server allows the character to speak. */
export function resolveSpecialDialogueSpeakerEligibility(
  input: SpecialDialogueSpeakerEligibilityInput,
): SpecialDialogueSpeakerEligibility {
  const data = asRecord(input.data);
  const visualBible = asRecord(data.visualBible);
  const designDna = asRecord(visualBible.designDna);
  const lookDesign = asRecord(data.lookDesign);
  const ageEvidence = [
    data.description,
    visualBible.ageRange,
    designDna.ageRange,
    lookDesign.ageRange,
    lookDesign.visual_description,
    lookDesign.image_brief,
    lookDesign.identity_lock,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const ageProfile = resolveCharacterCastingAgeProfile({
    age: data.age,
    ageMin: data.ageMin,
    ageMax: data.ageMax,
    ageRange: visualBible.ageRange ?? data.ageRange,
    ageStage: data.ageStage ?? lookDesign.age_stage,
    approvedDnaAgeRange: designDna.ageRange,
    role: input.role,
    narrativeRole: input.narrativeRole,
    roleTier: input.roleTier,
    occupation: input.occupation ?? data.occupation,
    description: ageEvidence,
  });
  if (!ageProfile) {
    return {
      eligible: false,
      isMinor: false,
      ageProfile: null,
      reason: "speaker age is not established as adult",
    };
  }
  if (ageProfile.isMinor) {
    return {
      eligible: false,
      isMinor: true,
      ageProfile,
      reason: `speaker is under 18 (${ageProfile.label})`,
    };
  }
  return {
    eligible: true,
    isMinor: false,
    ageProfile,
    reason: `adult speaker evidence (${ageProfile.label})`,
  };
}

export const SPECIAL_DIALOGUE_HARD_SELL_PATTERNS: readonly string[] = [
  "ซื้อเลย",
  "สั่งซื้อ",
  "โปรโมชัน",
  "โปรโมชั่น",
  "ลดราคา",
  "ห้ามพลาด",
  "ดีที่สุด",
  "best ever",
  "buy now",
  "order now",
  "shop now",
  "limited time offer",
  "act now",
  "don't miss out",
];

export type SpecialDialogueComplianceViolation = {
  claim: string;
  matchedPattern: string;
};

export function screenSpecialDialogueCompliance(
  lines: readonly string[],
): {
  hasViolations: boolean;
  violations: SpecialDialogueComplianceViolation[];
} {
  const legal = screenThaiAdCompliance([...lines]);
  const violations: SpecialDialogueComplianceViolation[] = legal.violations.map(
    violation => ({
      claim: violation.claim,
      matchedPattern: violation.matchedPattern,
    }),
  );
  for (const claim of lines) {
    const lower = claim.toLocaleLowerCase();
    const matchedPattern = SPECIAL_DIALOGUE_HARD_SELL_PATTERNS.find(pattern =>
      lower.includes(pattern.toLocaleLowerCase()),
    );
    if (
      matchedPattern &&
      !violations.some(
        violation =>
          violation.claim === claim &&
          violation.matchedPattern === matchedPattern,
      )
    ) {
      violations.push({ claim, matchedPattern });
    }
  }
  return { hasViolations: violations.length > 0, violations };
}
