export const PROTECTED_SURFACE_TOKEN_STORAGE_KEY = "smartspec.protectedSurface.accessToken";

export function getProtectedSurfaceAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(PROTECTED_SURFACE_TOKEN_STORAGE_KEY);
  return token && token.trim() ? token.trim() : null;
}

export function setProtectedSurfaceAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  const normalized = token.trim();
  if (!normalized) {
    window.localStorage.removeItem(PROTECTED_SURFACE_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(PROTECTED_SURFACE_TOKEN_STORAGE_KEY, normalized);
}

export function clearProtectedSurfaceAccessToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROTECTED_SURFACE_TOKEN_STORAGE_KEY);
}

export function hasProtectedSurfaceAccessToken(): boolean {
  return Boolean(getProtectedSurfaceAccessToken());
}
