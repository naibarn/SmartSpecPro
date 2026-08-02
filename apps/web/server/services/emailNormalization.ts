import { z } from "zod";

/**
 * Canonical form used for authentication and recovery email addresses.
 * Do not apply provider-specific alias rules here: dots and plus tags can be
 * meaningful for non-Gmail providers and are not needed for case-insensitive
 * login matching.
 */
export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Zod input schema that canonicalizes before validating the email format. */
export const authEmailSchema = z
  .string()
  .transform(normalizeAuthEmail)
  .pipe(z.string().email());
