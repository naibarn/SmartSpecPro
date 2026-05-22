export type PricingFormula = "flat" | "per_duration" | "matrix" | "per_unit";

export interface MediaModelPricingInputField {
  key: string;
  affectsPricing?: boolean;
  default?: string | number | boolean;
  pricingAliases?: string[];
  pricingPresenceLabels?: {
    present: string;
    absent: string;
  };
  hidden?: boolean;
  advancedOnly?: boolean;
  managedBySuite?: boolean;
  assetType?: string;
  assetCapability?: string;
  referenceUnitWeight?: number;
  maxItems?: number;
  providerPayloadKey?: string;
}

export interface MediaModelPricingConfig {
  pricingTiers?: Record<string, number>;
  pricingFormula?: PricingFormula;
  inputFields?: MediaModelPricingInputField[];
  maxPromptLength?: number;
}

export function getSelectionValueByPath(
  selections: Record<string, unknown>,
  path: string | undefined,
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

function getPricingFields(config: MediaModelPricingConfig): MediaModelPricingInputField[] {
  const fields = Array.isArray(config.inputFields) ? config.inputFields : [];
  return fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => Boolean(field?.affectsPricing))
    .sort((a, b) => {
      const order: Record<string, number> = { resolution: 0, quality: 1, duration: 2 };
      const aOrder = order[a.field.key] ?? 99;
      const bOrder = order[b.field.key] ?? 99;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.index - b.index;
    })
    .map(({ field }) => field);
}

function formatDurationTierKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const str = String(value);
  return str.endsWith("s") ? str : `${str}s`;
}

function hasPricingPresenceValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function getPricingFieldValue(
  field: MediaModelPricingInputField,
  selections: Record<string, unknown>,
): unknown {
  const keys = [
    field.key,
    ...(Array.isArray(field.pricingAliases) ? field.pricingAliases : []),
  ];
  for (const key of keys) {
    const value = getSelectionValueByPath(selections, key);
    if (value !== undefined) {
      return value;
    }
  }
  return field.default;
}

export function buildPricingTierKey(
  config: MediaModelPricingConfig,
  selections: Record<string, unknown> = {},
): string {
  const formula = config.pricingFormula || "flat";
  const pricingFields = getPricingFields(config);

  if (formula === "per_unit") {
    return "default";
  }

  if (formula === "per_duration") {
    const duration = selections.duration ?? pricingFields.find((field) => field.key === "duration")?.default;
    const durationKey = formatDurationTierKey(duration);
    return durationKey || "default";
  }

  if (formula === "matrix") {
    const parts: string[] = [];
    for (const field of pricingFields) {
      const value = getPricingFieldValue(field, selections);
      if (field.pricingPresenceLabels) {
        parts.push(
          hasPricingPresenceValue(value)
            ? field.pricingPresenceLabels.present
            : field.pricingPresenceLabels.absent,
        );
        continue;
      }
      if (value === undefined || value === null || value === "") {
        continue;
      }
      const strValue = String(value);
      if (field.key === "duration") {
        const durationKey = formatDurationTierKey(strValue);
        if (durationKey) {
          parts.push(durationKey);
        }
        continue;
      }
      parts.push(strValue);
    }
    return parts.length > 0 ? parts.join("-") : "default";
  }

  if (pricingFields.length === 1) {
    const field = pricingFields[0];
    const value = getPricingFieldValue(field, selections);
    if (field.pricingPresenceLabels) {
      return hasPricingPresenceValue(value)
        ? field.pricingPresenceLabels.present
        : field.pricingPresenceLabels.absent;
    }
    if (value === undefined || value === null || value === "") {
      return "default";
    }
    if (field.key === "duration") {
      return formatDurationTierKey(value) || "default";
    }
    return String(value);
  }

  if (formula === "flat") {
    const resolution = selections.resolution;
    if (resolution && config.pricingTiers?.[String(resolution)] !== undefined) {
      return String(resolution);
    }
  }

  return "default";
}
