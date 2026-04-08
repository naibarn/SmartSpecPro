/**
 * Pricing Calculator Service
 * Calculates credit costs based on model's configJson pricing tiers
 * and user-selected parameters from pricing-affecting input fields.
 */

import {
  buildPricingTierKey,
  getSelectionValueByPath,
  type MediaModelPricingConfig,
} from "../../shared/mediaModelPricing";

export interface UserSelections {
  resolution?: string;
  duration?: string | number;
  quality?: string;
  generateType?: string;
  numImages?: number;
  [key: string]: any;
}

interface PricingConfig extends MediaModelPricingConfig {
  pricingUnitMetric?: "characters" | "items";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  pricingIgnoreWhitespace?: boolean;
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

  const tierKey = buildPricingTierKey(config, selections);
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
