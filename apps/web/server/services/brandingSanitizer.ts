const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/SmartAIHub/g, "SmartAIHub"],
  [/Smart AI Hub/g, "SmartAIHub"],
  [/SmartSpecWeb/g, "SmartAIHubWeb"],
  [/SmartSpec Web/g, "SmartAIHub Web"],
  [/\bSmartSpec\b/g, "SmartAIHub"],
  [/smartspecpro\.com/gi, "smartaihub.app"],
  [/smartspec\.pro/gi, "smartaihub.app"],
  [/smartspecpro/gi, "smartaihub"],
  [/\bsmartspec\b/gi, "smartaihub"],
];

export function sanitizeBrandText(value: string): string {
  let sanitized = value;
  for (const [pattern, replacement] of BRAND_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

export function sanitizeBrandingDeep<T>(value: T): T {
  if (value == null) return value;

  if (typeof value === "string") {
    return sanitizeBrandText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBrandingDeep(item)) as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeBrandingDeep(fieldValue);
    }
    return out as T;
  }

  return value;
}
