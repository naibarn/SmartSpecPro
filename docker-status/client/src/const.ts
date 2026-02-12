export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  // Docker Status shares session cookies with the main site (smartaihub.app)
  // Both use the same cookie name (app_session_id) and domain (.smartaihub.app)
  // So we just redirect to the main site's login page with returnUrl parameter

  const mainSiteUrl = import.meta.env.VITE_OAUTH_PORTAL_URL || 'https://smartaihub.app';
  const currentUrl = window.location.href;

  // Redirect to main site login with returnUrl pointing back here
  const url = new URL(`${mainSiteUrl}/login`);
  url.searchParams.set("returnUrl", currentUrl);

  return url.toString();
};
