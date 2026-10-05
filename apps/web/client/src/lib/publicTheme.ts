import { isSmartAIHubPublicSite } from "./publicSiteTenant";

const SMARTAIHUB_LIGHT_ONLY_PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/blog",
  "/careers",
  "/changelog",
  "/community",
  "/contact",
  "/docs",
  "/features",
  "/gallery",
  "/help",
  "/marketplace",
  "/pricing",
  "/privacy",
  "/resources",
  "/security",
  "/status",
  "/support",
  "/terms",
]);

const SMARTAIHUB_LIGHT_ONLY_PUBLIC_PATH_PREFIXES = [
  "/blog/",
  "/docs/",
  "/help/",
  "/marketplace/",
];

/** Public SmartAIHub currently ships a light-only marketing design. */
export function isSmartAIHubLightOnlyPublicPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    SMARTAIHUB_LIGHT_ONLY_PUBLIC_PATHS.has(normalized) ||
    SMARTAIHUB_LIGHT_ONLY_PUBLIC_PATH_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    )
  );
}

export function resolvePublicThemeMode(
  selectedTheme: "light" | "dark",
  platformPublicLightOnly: boolean,
): "light" | "dark" {
  return platformPublicLightOnly ? "light" : selectedTheme;
}

export function isPlatformLightOnlyPublicRoute(
  tenant: Parameters<typeof isSmartAIHubPublicSite>[0],
  path: string,
): boolean {
  return isSmartAIHubPublicSite(tenant) && isSmartAIHubLightOnlyPublicPath(path);
}

/** Apply the route-specific theme while retaining the user's stored preference. */
export function applyPublicThemeBoundary(
  root: Pick<HTMLElement, "dataset" | "classList">,
  theme: "light" | "dark",
  platformPublicLightOnly: boolean,
): void {
  if (platformPublicLightOnly) {
    root.dataset.smartaihubPublicTheme = "light";
    root.classList.remove("dark");
    return;
  }

  delete root.dataset.smartaihubPublicTheme;
  root.classList.toggle("dark", theme === "dark");
}
