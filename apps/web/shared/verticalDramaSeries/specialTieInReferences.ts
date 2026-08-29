export type SpecialReferenceSource = "upload" | "marketplace_capture" | "series_asset";

export type ConfirmedSpecialReference = {
  mediaAssetId: string;
  source: SpecialReferenceSource;
  label?: string;
  provenance?: Record<string, unknown>;
};

export function toggleSpecialReference(
  current: ConfirmedSpecialReference[],
  next: ConfirmedSpecialReference,
  max = 3,
): { value: ConfirmedSpecialReference[]; rejected: boolean } {
  const existingIndex = current.findIndex(item => item.mediaAssetId === next.mediaAssetId);
  if (existingIndex >= 0) return { value: current.filter((_, index) => index !== existingIndex), rejected: false };
  if (current.length >= max) return { value: current, rejected: true };
  return { value: [...current, next], rejected: false };
}

export function replacePendingMarketplaceSelection(
  confirmed: ConfirmedSpecialReference[],
  pending: ConfirmedSpecialReference[],
  max = 3,
): { confirmed: ConfirmedSpecialReference[]; pending: ConfirmedSpecialReference[]; remaining: number } {
  const unique = Array.from(new Map(confirmed.map(item => [item.mediaAssetId, item])).values());
  const available = Math.max(0, max - unique.length);
  return { confirmed: unique, pending: pending.slice(0, available), remaining: Math.max(0, available - pending.length) };
}
