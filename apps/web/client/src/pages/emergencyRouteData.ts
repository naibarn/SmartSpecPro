type EmergencyRouteItem = Record<string, unknown>;

const detailRouteIds = new Set([
  "public.event",
  "public.supportPool",
  "public.supportFunding",
  "dashboard.case",
]);

export function selectEmergencyRouteItems(
  pageId: string,
  item: EmergencyRouteItem | null,
  items: EmergencyRouteItem[],
): EmergencyRouteItem[] {
  return detailRouteIds.has(pageId) && item ? [item] : items;
}
