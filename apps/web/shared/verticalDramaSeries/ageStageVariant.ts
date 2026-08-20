/** Stable wire marker for a recoverable request that needs an age-stage look. */
export const AGE_STAGE_VARIANT_REQUIRED_MARKER = "[VD_AGE_STAGE_VARIANT_REQUIRED]";

export function buildAgeStageVariantRequiredMessage(age?: number): string {
  const ageFact = Number.isFinite(age) && age !== undefined ? ` age=${Math.trunc(age)}` : "";
  return `${AGE_STAGE_VARIANT_REQUIRED_MARKER}${ageFact} This request describes a child life-stage for an adult character. Create an age-stage variant before generating the image.`;
}

export function parseAgeStageVariantRequiredMessage(
  message: string | null | undefined,
): { age?: number } | null {
  if (!message?.includes(AGE_STAGE_VARIANT_REQUIRED_MARKER)) return null;
  const match = message.match(/\bage=(\d{1,3})\b/);
  return match ? { age: Number(match[1]) } : {};
}
