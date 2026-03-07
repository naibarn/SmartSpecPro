/**
 * Pricing Calculator Service
 * Calculates credit costs based on model's configJson pricing tiers
 * and user-selected parameters (resolution, duration, quality, etc.)
 */

export interface UserSelections {
  resolution?: string;
  duration?: string | number;
  quality?: string;
  generateType?: string;
  numImages?: number;
  [key: string]: any;
}

interface PricingConfig {
  pricingTiers?: Record<string, number>;
  pricingFormula?: "flat" | "per_duration" | "matrix" | "per_unit";
  pricingUnitMetric?: "characters" | "items";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  pricingIgnoreWhitespace?: boolean;
  inputFields?: Array<{
    key: string;
    affectsPricing?: boolean;
    default?: string | number | boolean;
  }>;
}

function getSelectionValueByPath(
  selections: UserSelections,
  path: string | undefined
): unknown {
  if (!path) return undefined;
  if (!path.includes(".")) return selections[path];
  const segments = path.split(".").filter(Boolean);
  let current: unknown = selections;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function countCharacters(value: unknown, ignoreWhitespace = false): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") {
    return ignoreWhitespace ? value.replace(/\s+/g, "").length : value.length;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item: unknown) => sum + countCharacters(item, ignoreWhitespace), 0);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      // Dialogue-like objects should charge by text only, not voice metadata.
      return ignoreWhitespace ? record.text.replace(/\s+/g, "").length : record.text.length;
    }
    return Object.values(record).reduce((sum: number, item: unknown) => sum + countCharacters(item, ignoreWhitespace), 0);
  }
  return 0;
}

function countItems(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") return value.trim().length > 0 ? 1 : 0;
  return 1;
}

function applyRounding(value: number, mode: "ceil" | "floor" | "round"): number {
  if (!Number.isFinite(value)) return 0;
  if (mode === "floor") return Math.floor(value);
  if (mode === "round") return Math.round(value);
  return Math.ceil(value);
}

/**
 * Build a pricing tier key from user selections based on which input fields affect pricing.
 * For "matrix" formula: joins pricing-affecting field values with "-" (e.g., "720p-5s", "1080p-10s")
 * For "per_duration" formula: uses duration value as key (e.g., "5s", "10s")
 * For "flat" formula: uses resolution or "default"
 */
function buildTierKey(config: PricingConfig, selections: UserSelections): string {
  const formula = config.pricingFormula || "flat";
  const fields = config.inputFields || [];

  // Get fields that affect pricing, sorted by key for consistency
  const pricingFields = fields
    .filter(f => f.affectsPricing)
    .sort((a, b) => {
      // resolution before duration for consistent key ordering
      const order: Record<string, number> = { resolution: 0, quality: 1, duration: 2 };
      return (order[a.key] ?? 99) - (order[b.key] ?? 99);
    });

  if (pricingFields.length === 0) {
    return "default";
  }

  if (formula === "per_unit") {
    return "default";
  }

  if (formula === "per_duration") {
    const duration = selections.duration ?? pricingFields.find(f => f.key === "duration")?.default;
    return duration ? `${duration}s` : "default";
  }

  if (formula === "matrix") {
    const parts: string[] = [];
    for (const field of pricingFields) {
      const value = selections[field.key] ?? field.default;
      if (value !== undefined && value !== null) {
        const strVal = String(value);
        // For duration, append "s" suffix if not already there
        if (field.key === "duration" && !strVal.endsWith("s")) {
          parts.push(`${strVal}s`);
        } else {
          parts.push(strVal);
        }
      }
    }
    return parts.length > 0 ? parts.join("-") : "default";
  }

  // flat formula — try resolution key, then "default"
  if (formula === "flat") {
    const resolution = selections.resolution;
    if (resolution && config.pricingTiers?.[resolution] !== undefined) {
      return resolution;
    }
    return "default";
  }

  return "default";
}

/**
 * Calculate credit cost for a generation request.
 *
 * @param model - The model with creditCost and optional configJson
 * @param selections - User's parameter selections
 * @returns Total credit cost
 */
export function calculateCreditCost(
  model: { creditCost: number; configJson?: Record<string, any> | null },
  selections: UserSelections = {}
): number {
  const config = model.configJson as PricingConfig | undefined;
  const multiplier = selections.numImages || 1;

  if (!config?.pricingTiers) {
    // Legacy fallback: flat creditCost
    return model.creditCost * multiplier;
  }

  const tierKey = buildTierKey(config, selections);
  const baseCost = config.pricingTiers[tierKey] ?? model.creditCost;

  if (config.pricingFormula === "per_unit") {
    const metric = config.pricingUnitMetric || "characters";
    const unitField = config.pricingUnitField || "text";
    const rounding = config.pricingUnitRounding || "ceil";
    const ignoreWhitespace = config.pricingIgnoreWhitespace === true;
    const unitSize = Number(config.pricingUnitSize);
    const normalizedUnitSize = Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1;
    const minUnitsCfg = Number(config.pricingMinUnits);
    const minUnits = Number.isFinite(minUnitsCfg) && minUnitsCfg >= 0 ? minUnitsCfg : 0;

    let sourceValue = getSelectionValueByPath(selections, unitField);
    if (sourceValue === undefined && unitField === "text") {
      sourceValue = selections.prompt ?? selections.text;
    }

    const measured = metric === "items"
      ? countItems(sourceValue)
      : countCharacters(sourceValue, ignoreWhitespace);

    const rawUnits = measured / normalizedUnitSize;
    const roundedUnits = measured > 0 ? applyRounding(rawUnits, rounding) : 0;
    const finalUnits = Math.max(minUnits, roundedUnits);

    return baseCost * finalUnits * multiplier;
  }

  return baseCost * multiplier;
}

/**
 * Get all available pricing tiers for a model (for UI display).
 */
export function getAvailableTiers(
  model: { creditCost: number; configJson?: Record<string, any> | null }
): Record<string, number> | null {
  const config = model.configJson as PricingConfig | undefined;
  if (!config?.pricingTiers) return null;
  return config.pricingTiers;
}
