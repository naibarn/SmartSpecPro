import { timingSafeEqual } from "node:crypto";

/** Compare the Worker-to-origin credential without a content-dependent exit. */
export function isValidCloudflareOriginAttestation(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}
