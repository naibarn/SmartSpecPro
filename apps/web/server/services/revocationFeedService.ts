import { z } from "zod";

export const desktopRevocationFeedSnapshotSchema = z.object({
  generatedAt: z.string().datetime(),
  revokedPackageIds: z.array(z.string().min(1)).default([]),
  revokedSignerIds: z.array(z.string().min(1)).default([]),
});

export type DesktopRevocationFeedSnapshot = z.infer<
  typeof desktopRevocationFeedSnapshotSchema
>;

export function buildRevocationFeedSnapshot(
  input: z.input<typeof desktopRevocationFeedSnapshotSchema>,
): DesktopRevocationFeedSnapshot {
  return desktopRevocationFeedSnapshotSchema.parse(input);
}

export function isDesktopPackageOrSignerRevoked(input: {
  packageId: string;
  signerId: string;
  revocationFeed: DesktopRevocationFeedSnapshot;
}): boolean {
  return input.revocationFeed.revokedPackageIds.includes(input.packageId)
    || input.revocationFeed.revokedSignerIds.includes(input.signerId);
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveConfiguredDesktopRevocationFeed(
  generatedAt = new Date().toISOString(),
): DesktopRevocationFeedSnapshot {
  return buildRevocationFeedSnapshot({
    generatedAt,
    revokedPackageIds: parseCsvList(process.env.DESKTOP_REVOKED_PACKAGE_IDS),
    revokedSignerIds: parseCsvList(process.env.DESKTOP_REVOKED_SIGNER_IDS),
  });
}
