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
  pricingFormula?: "flat" | "per_duration" | "matrix";
  inputFields?: Array<{
    key: string;
    affectsPricing?: boolean;
    default?: string | number | boolean;
  }>;
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
