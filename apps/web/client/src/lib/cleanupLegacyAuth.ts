/**
 * Remove legacy localStorage auth keys left over from pre-hardening builds.
 * Only runs in browser context (not Tauri). Safe to call multiple times.
 */

const LEGACY_AUTH_KEYS = [
  "smartspec_auth_token",
  "smartspec_user_data",
  "smartspec_web_refresh_token",
  "smartspec_web_token_expiry",
  "smartspec_web_user",
] as const;

export function cleanupLegacyAuth(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__TAURI__ != null) return;

  for (const key of LEGACY_AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}
