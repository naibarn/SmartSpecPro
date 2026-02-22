export const PRESENTATION_ITEM_TYPE = "presentation";

export const PRESENTATION_EDITOR_ROUTE_BASE = "/presentation-editor";

export const PRESENTATION_LIMITS = {
  maxSlidesPerDeck: 200,
  maxAssetsPerDeck: 500,
  softDeckSizeBytes: 75 * 1024 * 1024,
  hardDeckSizeBytes: 100 * 1024 * 1024,
} as const;

export const PRESENTATION_ERROR_CODE_VALUES = [
  "PRESENTATION_FEATURE_DISABLED",
  "PRESENTATION_ITEM_TYPE_MISMATCH",
  "PRESENTATION_UNSUPPORTED_ITEM_TYPE",
  "PRESENTATION_NOT_FOUND",
] as const;

export type PresentationErrorCode = typeof PRESENTATION_ERROR_CODE_VALUES[number];

export const PRESENTATION_ERROR_CODE: Record<string, PresentationErrorCode> = {
  FEATURE_DISABLED: "PRESENTATION_FEATURE_DISABLED",
  ITEM_TYPE_MISMATCH: "PRESENTATION_ITEM_TYPE_MISMATCH",
  UNSUPPORTED_ITEM_TYPE: "PRESENTATION_UNSUPPORTED_ITEM_TYPE",
  NOT_FOUND: "PRESENTATION_NOT_FOUND",
};

export const PRESENTATION_FEATURE_FLAG_ENV = "PRESENTATION_EDITOR_ENABLED";

export function isPresentationFeatureEnabled(): boolean {
  const raw = (process.env[PRESENTATION_FEATURE_FLAG_ENV] || "").trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return !["0", "false", "off", "no", "disabled"].includes(raw);
}
