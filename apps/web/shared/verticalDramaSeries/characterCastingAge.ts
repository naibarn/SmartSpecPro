export type CharacterCastingAgeProfileSource =
  | "story_fact"
  | "approved_dna"
  | "age_stage"
  | "role_context";

export type CharacterCastingAgeProfile = {
  min: number;
  max: number;
  label: string;
  source: CharacterCastingAgeProfileSource;
  confidence: "explicit" | "structured" | "inferred";
  rationale: string;
  isMinor: boolean;
};

export type CharacterCastingAgeProfileInput = {
  age?: unknown;
  ageMin?: unknown;
  ageMax?: unknown;
  ageRange?: unknown;
  ageStage?: unknown;
  approvedDnaAgeRange?: unknown;
  role?: unknown;
  narrativeRole?: unknown;
  roleTier?: unknown;
  occupation?: unknown;
  description?: unknown;
};

const AGE_RANGE_PATTERN = /(?:อายุ|age)?\s*(\d{1,2})\s*(?:-|–|—|ถึง|to)\s*(\d{1,2})/i;
const AGE_PATTERN = /(?:อายุ|age)\s*[:\-]?\s*(\d{1,2})|\b(\d{1,2})\s*(?:ปี|ขวบ|years?\s*old)\b/i;

function finiteAge(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return undefined;
  return parsed;
}

export function parseCharacterCastingAgeRange(value: unknown): { min: number; max: number } | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (!text) return undefined;

  const range = text.match(AGE_RANGE_PATTERN);
  if (range) {
    const min = finiteAge(range[1]);
    const max = finiteAge(range[2]);
    if (min !== undefined && max !== undefined && min <= max) return { min, max };
  }

  const decade = text.match(/\b(early|mid|late)\s+(1[0-9]|[2-9]0)s\b/);
  if (decade) {
    const base = Number(decade[2]);
    if (decade[1] === "early") return { min: base, max: base + 3 };
    if (decade[1] === "late") return { min: base + 7, max: base + 9 };
    return { min: base + 3, max: base + 6 };
  }

  const thaiDecade = text.match(/(?:วัย|อายุ)?\s*(ต้น|กลาง|ปลาย)\s*(สิบ|ยี่สิบ|สามสิบ|สี่สิบ|ห้าสิบ)/);
  if (thaiDecade) {
    const baseByWord: Record<string, number> = {
      สิบ: 10,
      ยี่สิบ: 20,
      สามสิบ: 30,
      สี่สิบ: 40,
      ห้าสิบ: 50,
    };
    const base = baseByWord[thaiDecade[2]];
    if (base !== undefined) {
      if (thaiDecade[1] === "ต้น") return { min: base, max: base + 3 };
      if (thaiDecade[1] === "ปลาย") return { min: base + 7, max: base + 9 };
      return { min: base + 3, max: base + 6 };
    }
  }

  const exact = text.match(AGE_PATTERN);
  const age = finiteAge(exact?.[1] ?? exact?.[2]);
  return age === undefined ? undefined : { min: age, max: age };
}

function rangeFromNumbers(ageMin: unknown, ageMax: unknown, age: unknown): { min: number; max: number } | undefined {
  const min = finiteAge(ageMin);
  const max = finiteAge(ageMax);
  if (min !== undefined && max !== undefined && min <= max) return { min, max };
  const exact = finiteAge(age);
  if (exact !== undefined) return { min: exact, max: exact };
  if (min !== undefined) return { min, max: min };
  if (max !== undefined) return { min: max, max };
  return undefined;
}

function asText(...values: unknown[]): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim()
    .toLowerCase();
}

function profile(
  range: { min: number; max: number },
  source: CharacterCastingAgeProfileSource,
  confidence: CharacterCastingAgeProfile["confidence"],
  rationale: string,
): CharacterCastingAgeProfile {
  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  return {
    min,
    max,
    label: `${min}–${max}`,
    source,
    confidence,
    rationale: rationale.slice(0, 240),
    isMinor: min < 18,
  };
}

/** Resolve apparent casting age from authorized character facts only. */
export function resolveCharacterCastingAgeProfile(
  input: CharacterCastingAgeProfileInput,
): CharacterCastingAgeProfile | null {
  const storyRange =
    rangeFromNumbers(input.ageMin, input.ageMax, input.age) ??
    parseCharacterCastingAgeRange(input.ageRange);
  if (storyRange) {
    return profile(storyRange, "story_fact", "explicit", "ช่วงอายุจากข้อมูลตัวละครของเรื่อง");
  }

  const dnaRange = parseCharacterCastingAgeRange(input.approvedDnaAgeRange);
  if (dnaRange) {
    return profile(dnaRange, "approved_dna", "structured", "ช่วงอายุจาก Character DNA ที่อนุมัติแล้ว");
  }

  const stageText = asText(input.ageStage, input.description);
  const stageRange = parseCharacterCastingAgeRange(input.ageStage);
  if (stageRange) {
    return profile(stageRange, "age_stage", "structured", "ช่วงอายุจาก age-stage ของตัวละคร");
  }
  const roleStageText = asText(input.role, input.narrativeRole, input.roleTier);
  if (
    input.roleTier === "child" ||
    /(เด็ก|เด็กชาย|เด็กหญิง|child|kid|elementary|ประถม)/i.test(`${stageText} ${roleStageText}`)
  ) {
    return profile({ min: 8, max: 14 }, "age_stage", "inferred", "ตัวละครอยู่ในช่วงวัยเด็กตามบทบาท/คำอธิบาย");
  }

  const facts = asText(
    input.role,
    input.narrativeRole,
    input.roleTier,
    input.occupation,
    input.description,
  );
  const describedAge = parseCharacterCastingAgeRange(input.description);
  if (describedAge) {
    return profile(describedAge, "story_fact", "explicit", "ช่วงอายุที่ระบุในคำอธิบายตัวละคร");
  }
  if (/(มัธยม|นักเรียน|นักศึกษา|มหาวิทยาลัย|high school|student|university|college)/i.test(facts)) {
    return profile({ min: 17, max: 19 }, "role_context", "inferred", "บทบาทนักเรียน/นักศึกษาของตัวละคร");
  }
  if (/(วัยทำงาน|พนักงาน|ออฟฟิศ|เริ่มทำงาน|young professional|entry[- ]level|working adult|intern)/i.test(facts)) {
    return profile({ min: 22, max: 25 }, "role_context", "inferred", "บทบาทวัยทำงานช่วงต้นของตัวละคร");
  }
  if (/(สูงวัย|ผู้สูงอายุ|วัยชรา|older adult|elderly|seventies|เจ็ดสิบ)/i.test(facts)) {
    return profile({ min: 60, max: 100 }, "role_context", "inferred", "คำอธิบายระบุว่าตัวละครเป็นผู้สูงวัย");
  }
  if (/(ผู้ใหญ่|อาวุโส|หัวหน้า|ผู้บริหาร|พ่อ|แม่|mentor|senior|parent|ceo|established|older|อายุมากกว่า)/i.test(facts)) {
    return profile({ min: 30, max: 35 }, "role_context", "inferred", "บทบาทผู้ใหญ่/อาวุโสของตัวละคร");
  }
  if (/(พระเอก|นางเอก|ตัวเอก|protagonist|heroine|hero|lead|main character)/i.test(facts)) {
    return profile({ min: 22, max: 35 }, "role_context", "inferred", "บทบาทตัวละครหลักโดยยังไม่มีช่วงอายุเฉพาะในบท");
  }

  return null;
}

export function isCharacterCastingAgeRangeCompatible(
  value: unknown,
  expected: Pick<CharacterCastingAgeProfile, "min" | "max">,
): boolean {
  const actual = parseCharacterCastingAgeRange(value);
  return Boolean(actual && actual.min >= expected.min && actual.max <= expected.max);
}
