import { DEFAULT_VALIDATION_LIMITS, type SpaasValidationLimitOverrides, type SpaasValidationLimits } from "./model";

export type LimitResolutionResult =
  | Readonly<{ ok: true; limits: Readonly<SpaasValidationLimits> }>
  | Readonly<{ ok: false; invalidFields: readonly string[] }>;

/** Runtime policy owned by the parser/consumers: positive safe integers up to the documented ceilings. */
export function resolveValidationLimits(overrides: SpaasValidationLimitOverrides = {}): LimitResolutionResult {
  if(overrides===null||typeof overrides!=="object"||Array.isArray(overrides))return Object.freeze({ok:false,invalidFields:Object.freeze(["overrides"])});
  const invalidFields: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in DEFAULT_VALIDATION_LIMITS)) {
      invalidFields.push(key);
      continue;
    }
    const ceiling = DEFAULT_VALIDATION_LIMITS[key as keyof SpaasValidationLimits];
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > ceiling) {
      invalidFields.push(key);
    }
  }
  if (invalidFields.length) return Object.freeze({ ok: false, invalidFields: Object.freeze(invalidFields.sort()) });
  return Object.freeze({
    ok: true,
    limits: Object.freeze({ ...DEFAULT_VALIDATION_LIMITS, ...overrides }),
  });
}
