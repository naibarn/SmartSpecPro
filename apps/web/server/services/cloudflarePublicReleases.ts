/** Backend-local copy of the public release SQL contract. Keep aligned with
 * packages/shared/src/cloudflarePublicReleases.ts; this file must ship inside
 * the standalone Node runtime artifact. */
export const PUBLIC_RUNNER_RELEASE_COLUMNS = [
  "id", "version", "platform", "architecture", "profile", "channel", "assetKind", "fileName", "contentType", "fileSizeBytes",
  "fileSha256", "signature", "contractVersion", "manifestJson", "validationStatus", "validationChecksJson", "provenanceJson",
  "releaseNotes", "isPublished", "publishedAt", "withdrawnAt", "uploadedAt", "updatedAt",
] as const;
export const PUBLIC_RUNNER_RELEASE_SELECT = PUBLIC_RUNNER_RELEASE_COLUMNS.map(column => `"${column}"`).join(",");
export const PUBLIC_RUNNER_RELEASE_PREDICATE = '"isPublished" = true AND "withdrawnAt" IS NULL AND "validationStatus" = \'valid\'';
export function publicRunnerReleaseView(namespace: string): string {
  if (!/^smartspec-staging-[a-f0-9]{12}$/.test(namespace)) throw new Error("PUBLIC_RUNNER_RELEASE_NAMESPACE_INVALID");
  return `sah_cf_releases_${namespace.slice(-12)}`;
}
