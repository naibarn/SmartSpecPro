export type MediaAspectRatio = "1:1" | "9:16" | "16:9";

/**
 * Converts a media's real dimensions into one of the gallery's supported
 * presentation ratios. The thresholds match the server-side gallery import
 * rules so newly imported and legacy media render consistently.
 */
export function inferMediaAspectRatio(
  width: number,
  height: number
): MediaAspectRatio | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const ratio = width / height;
  if (ratio <= 0.75) return "9:16";
  if (ratio >= 1.4) return "16:9";
  return "1:1";
}

/** Accepts persisted ratio values while safely handling legacy/invalid data. */
export function parseMediaAspectRatio(value: unknown): MediaAspectRatio | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase().replace(/\s/g, "");
  switch (normalized) {
    case "1:1":
    case "1/1":
    case "square":
      return "1:1";
    case "9:16":
    case "9/16":
    case "portrait":
    case "vertical":
      return "9:16";
    case "16:9":
    case "16/9":
    case "landscape":
    case "horizontal":
      return "16:9";
    default:
      return null;
  }
}
