export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  // When VITE env vars are not set (embedded mode), don't redirect to OAuth
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // If OAuth not configured, return a safe fallback (main site login)
  if (!oauthPortalUrl || !appId) {
    console.warn('[Docker Status] OAuth not configured, using fallback login');
    return '/login'; // Fallback to parent site login
  }

  // Detect base path (e.g., /docker/)
  const basePath = window.location.pathname.startsWith('/docker/') ? '/docker' : '';
  const redirectUri = `${window.location.origin}${basePath}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
