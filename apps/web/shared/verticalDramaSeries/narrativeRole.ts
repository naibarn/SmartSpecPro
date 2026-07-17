import { z } from "zod";

/** Canonical story-level function. Occupation/status is deliberately not included. */
export const NARRATIVE_ROLE_VALUES = [
  "protagonist",
  "co_protagonist",
  "antagonist",
  "secondary_lead",
  "supporting",
  "ensemble",
  "minor",
] as const;

export type NarrativeRole = (typeof NARRATIVE_ROLE_VALUES)[number];
export const narrativeRoleSchema = z.enum(NARRATIVE_ROLE_VALUES);

/** Detailed visual-design tier; values are stable across server, UI, and skill V2. */
export const ROLE_TIER_VALUES = [
  "lead_female",
  "lead_male",
  "lead_nonbinary",
  "lead_child_female",
  "lead_child_male",
  "lead_teen_female",
  "lead_teen_male",
  "second_lead_female",
  "second_lead_male",
  "villain_female_open",
  "villain_male_open",
  "villain_female_hidden",
  "villain_male_hidden",
  "rival_female",
  "rival_male",
  "parent_mother",
  "parent_father",
  "elder_matriarch",
  "elder_patriarch",
  "grandmother",
  "grandfather",
  "great_grandmother",
  "great_grandfather",
  "student_primary_female",
  "student_primary_male",
  "student_lower_secondary_female",
  "student_lower_secondary_male",
  "student_upper_secondary_female",
  "student_upper_secondary_male",
  "university_female",
  "university_male",
  "intern_female",
  "intern_male",
  "support_memorable",
  "background_character",
  "same_person_variant",
  "age_stage_variant",
  "twin_variant",
  "other",
] as const;

export type RoleTier = (typeof ROLE_TIER_VALUES)[number];
export const roleTierSchema = z.enum(ROLE_TIER_VALUES);

function lowercaseIfString(value: unknown): unknown {
  return typeof value === "string" ? value.toLowerCase() : value;
}

/**
 * Lenient LLM-RESPONSE counterpart to `narrativeRoleSchema` (2026-07-14
 * recurring-failure fix, generalized from the preset-synthesis fix to also
 * cover story-bible generation). Every prompt that requests this field also
 * lists the allowed values verbatim, but models still sometimes title-case
 * or invent labels (e.g. "Protagonist", "Love Interest") — this schema
 * recovers pure-casing drift via a lowercase preprocess, then degrades ANY
 * still-unrecognized/missing value to `undefined` instead of failing the
 * whole response (`.catch(undefined)`). Callers are expected to backfill an
 * `undefined` result from free-text via `normalizeLegacyRole`.
 *
 * Do NOT use this for CLIENT-INPUT validation (e.g.
 * `verticalDramaCharacters.ts`'s `createCharacter`/`updateCharacter`/
 * `createCharacterTwin`, or `verticalDramaSeries.ts`'s
 * `presetCharacterProfileSchema`) — a human editing a role dropdown should
 * get a real validation error, never a silent degrade-to-unknown. Those
 * call sites keep the strict `narrativeRoleSchema`/`roleTierSchema`.
 */
export const lenientNarrativeRoleSchema = z
  .preprocess(lowercaseIfString, narrativeRoleSchema)
  .optional()
  .catch(undefined);

/** Lenient LLM-response counterpart to `roleTierSchema` — see `lenientNarrativeRoleSchema`. */
export const lenientRoleTierSchema = z
  .preprocess(lowercaseIfString, roleTierSchema)
  .optional()
  .catch(undefined);

export const ROLE_TIER_LABELS: Record<RoleTier, { th: string; en: string }> = {
  lead_female: { th: "นางเอก", en: "Female lead" },
  lead_male: { th: "พระเอก", en: "Male lead" },
  lead_nonbinary: { th: "ตัวเอก", en: "Non-binary lead" },
  lead_child_female: { th: "นางเอกวัยเด็ก", en: "Female child lead" },
  lead_child_male: { th: "พระเอกวัยเด็ก", en: "Male child lead" },
  lead_teen_female: { th: "นางเอกวัยรุ่น", en: "Female teen lead" },
  lead_teen_male: { th: "พระเอกวัยรุ่น", en: "Male teen lead" },
  second_lead_female: { th: "นางรอง", en: "Female second lead" },
  second_lead_male: { th: "พระรอง", en: "Male second lead" },
  villain_female_open: { th: "นางร้าย", en: "Open female villain" },
  villain_male_open: { th: "ตัวร้ายชาย", en: "Open male villain" },
  villain_female_hidden: { th: "นางร้ายแฝงตัว", en: "Hidden female villain" },
  villain_male_hidden: { th: "ตัวร้ายชายแฝงตัว", en: "Hidden male villain" },
  rival_female: { th: "คู่แข่งหญิง", en: "Female rival" },
  rival_male: { th: "คู่แข่งชาย", en: "Male rival" },
  parent_mother: { th: "แม่", en: "Mother" },
  parent_father: { th: "พ่อ", en: "Father" },
  elder_matriarch: { th: "ผู้อาวุโสหญิง", en: "Elder matriarch" },
  elder_patriarch: { th: "ผู้อาวุโสชาย", en: "Elder patriarch" },
  grandmother: { th: "คุณย่า/คุณยาย", en: "Grandmother" },
  grandfather: { th: "คุณปู่/คุณตา", en: "Grandfather" },
  great_grandmother: { th: "ทวดหญิง", en: "Great-grandmother" },
  great_grandfather: { th: "ทวดชาย", en: "Great-grandfather" },
  student_primary_female: { th: "นักเรียนหญิงประถม", en: "Primary-school girl" },
  student_primary_male: { th: "นักเรียนชายประถม", en: "Primary-school boy" },
  student_lower_secondary_female: { th: "นักเรียนหญิงมัธยมต้น", en: "Lower-secondary girl" },
  student_lower_secondary_male: { th: "นักเรียนชายมัธยมต้น", en: "Lower-secondary boy" },
  student_upper_secondary_female: { th: "นักเรียนหญิงมัธยมปลาย", en: "Upper-secondary girl" },
  student_upper_secondary_male: { th: "นักเรียนชายมัธยมปลาย", en: "Upper-secondary boy" },
  university_female: { th: "นักศึกษาหญิง", en: "Female university student" },
  university_male: { th: "นักศึกษาชาย", en: "Male university student" },
  intern_female: { th: "เด็กฝึกงานหญิง", en: "Female intern" },
  intern_male: { th: "เด็กฝึกงานชาย", en: "Male intern" },
  support_memorable: { th: "ตัวประกอบเด่น", en: "Memorable supporting" },
  background_character: { th: "ตัวประกอบ", en: "Background character" },
  same_person_variant: { th: "ตัวละครเดิมต่างลุค", en: "Same-person variant" },
  age_stage_variant: { th: "ตัวละครเดิมต่างวัย", en: "Age-stage variant" },
  twin_variant: { th: "ฝาแฝด", en: "Twin variant" },
  other: { th: "ต้องตรวจสอบบทบาท", en: "Role review required" },
};

export const ROLE_TIER_GROUPS = {
  leads: [
    "lead_female",
    "lead_male",
    "lead_nonbinary",
    "lead_child_female",
    "lead_child_male",
    "lead_teen_female",
    "lead_teen_male",
  ],
  secondLeads: ["second_lead_female", "second_lead_male"],
  antagonists: [
    "villain_female_open",
    "villain_male_open",
    "villain_female_hidden",
    "villain_male_hidden",
    "rival_female",
    "rival_male",
  ],
  familyAndElders: [
    "parent_mother",
    "parent_father",
    "elder_matriarch",
    "elder_patriarch",
    "grandmother",
    "grandfather",
    "great_grandmother",
    "great_grandfather",
  ],
  education: [
    "student_primary_female",
    "student_primary_male",
    "student_lower_secondary_female",
    "student_lower_secondary_male",
    "student_upper_secondary_female",
    "student_upper_secondary_male",
    "university_female",
    "university_male",
    "intern_female",
    "intern_male",
  ],
  supporting: ["support_memorable", "background_character"],
  variants: ["same_person_variant", "age_stage_variant", "twin_variant"],
  review: ["other"],
} as const satisfies Record<string, readonly RoleTier[]>;

export const roleProvenanceSchema = z.enum(["ai_assigned", "user_confirmed", "migrated"]);
export type RoleProvenance = z.infer<typeof roleProvenanceSchema>;
export const roleReviewStatusSchema = z.enum(["ready", "needs_role_review"]);
export type RoleReviewStatus = z.infer<typeof roleReviewStatusSchema>;

export const roleVisualIntentSchema = z
  .object({
    firstImpression: z.string().trim().max(500).optional(),
    audienceShouldFeel: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    mustNotReadAs: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    visualWarningLevel: z.number().int().min(0).max(10).optional(),
    screenPresenceLevel: z.number().int().min(0).max(10).optional(),
    emotionalAccessLevel: z.number().int().min(0).max(10).optional(),
  })
  .strict();
export type RoleVisualIntent = z.infer<typeof roleVisualIntentSchema>;

export function isLeadRoleTier(roleTier: RoleTier | null | undefined): boolean {
  return roleTier != null && (ROLE_TIER_GROUPS.leads as readonly RoleTier[]).includes(roleTier);
}

export function isChildRoleTier(roleTier: RoleTier | null | undefined): boolean {
  return roleTier != null && (
    roleTier === "lead_child_female" ||
    roleTier === "lead_child_male" ||
    roleTier.startsWith("student_primary_")
  );
}

export function roleTierToNarrativeRole(roleTier: RoleTier): NarrativeRole {
  if (isLeadRoleTier(roleTier)) return "protagonist";
  if (roleTier.startsWith("villain_") || roleTier.startsWith("rival_")) return "antagonist";
  if (roleTier.startsWith("second_lead_")) return "secondary_lead";
  if (roleTier === "background_character") return "minor";
  if (roleTier === "other") return "ensemble";
  return "supporting";
}

export type LegacyRoleNormalization = {
  narrativeRole: NarrativeRole | null;
  roleTier: RoleTier | null;
  confidence: "high" | "medium" | "low";
  reviewStatus: RoleReviewStatus;
  reason: string;
};

/** Explicit narrative words only; occupations never qualify as lead evidence. */
export function normalizeLegacyRole(role: string | null | undefined): LegacyRoleNormalization {
  const value = role?.trim().toLocaleLowerCase("th-TH") ?? "";
  if (!value) {
    return { narrativeRole: null, roleTier: null, confidence: "low", reviewStatus: "needs_role_review", reason: "missing_role" };
  }
  const rules: Array<[RegExp, RoleTier, string]> = [
    [/นางเอก|female lead|heroine/, "lead_female", "explicit_female_lead"],
    [/พระเอก|male lead|hero(?!ine)/, "lead_male", "explicit_male_lead"],
    [/ตัวเอก|protagonist|co-protagonist/, "lead_nonbinary", "explicit_protagonist"],
    [/ตัวร้าย.*แฝง|แฝง.*ตัวร้าย|hidden villain/, "villain_male_hidden", "explicit_hidden_villain"],
    [/นางร้าย|female villain/, "villain_female_open", "explicit_female_villain"],
    [/ตัวร้าย|antagonist|villain/, "villain_male_open", "explicit_villain"],
    [/พระรอง|second lead|male second/, "second_lead_male", "explicit_second_lead"],
    [/นางรอง|female second/, "second_lead_female", "explicit_second_lead"],
    [/ตัวประกอบเด่น|memorable support/, "support_memorable", "explicit_memorable_support"],
    [/ตัวประกอบ|supporting|background|extra/, "background_character", "explicit_support"],
  ];
  const match = rules.find(([pattern]) => pattern.test(value));
  if (!match) {
    return { narrativeRole: null, roleTier: null, confidence: "low", reviewStatus: "needs_role_review", reason: "occupation_or_unstructured_role" };
  }
  const roleTier = match[1];
  return {
    narrativeRole: roleTierToNarrativeRole(roleTier),
    roleTier,
    confidence: "high",
    reviewStatus: "ready",
    reason: match[2],
  };
}
