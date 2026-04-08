import type { LocalAiCatalogEntry } from "../types/capability";

export function listAvailableLocalAiProfiles(
  catalog: LocalAiCatalogEntry[] | null | undefined,
): LocalAiCatalogEntry[] {
  return (catalog ?? []).filter((entry) => entry.status === "allowed");
}

export function findLocalAiProfileById(
  catalog: LocalAiCatalogEntry[] | null | undefined,
  profileId: string | null | undefined,
): LocalAiCatalogEntry | null {
  if (!profileId) {
    return null;
  }
  return (catalog ?? []).find((entry) => entry.id === profileId) ?? null;
}
