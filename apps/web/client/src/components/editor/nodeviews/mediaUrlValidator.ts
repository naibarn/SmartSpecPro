/**
 * Thin re-export of sanitizeMediaSrc for node view components.
 * The core validation logic lives in mediaSerializationRules.ts.
 */
export { sanitizeMediaSrc as sanitizeMediaUrl } from "../extensions/mediaSerializationRules";
import { sanitizeMediaSrc } from "../extensions/mediaSerializationRules";

/**
 * Returns true if the URL is safe for use in media src/poster attributes.
 */
export function isSafeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return sanitizeMediaSrc(url) !== "";
}
