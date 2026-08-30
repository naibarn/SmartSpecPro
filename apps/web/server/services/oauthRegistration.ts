import type { Request, Response } from "express";

export const OAUTH_INVITE_COOKIE = "invite_code";

export function getOAuthInviteCode(req: Request): string | undefined {
  const raw = req.cookies?.[OAUTH_INVITE_COOKIE];
  if (typeof raw !== "string") return undefined;

  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{1,32}$/.test(code) ? code : undefined;
}

export function clearOAuthInviteCookie(res: Response): void {
  res.clearCookie(OAUTH_INVITE_COOKIE, { path: "/" });
}

export type OAuthOnboardingUser = {
  loginMethod?: string | null;
  registeredDomain?: string | null;
  currentTenantId?: string | number | null;
};

/**
 * Python persists OAuth identities before the Node registration gate runs.
 * Such rows are not approved accounts until both registration markers exist.
 */
export function isOAuthRegistrationPending(user: OAuthOnboardingUser): boolean {
  const isOAuthUser =
    user.loginMethod === "google" || user.loginMethod === "github";
  const hasRegisteredDomain = Boolean(user.registeredDomain?.trim());
  const hasTenant =
    user.currentTenantId !== null &&
    user.currentTenantId !== undefined &&
    String(user.currentTenantId).trim().length > 0;

  return isOAuthUser && (!hasRegisteredDomain || !hasTenant);
}

/**
 * Registration admission must be based on persisted account state. The
 * callback's new-user claim is useful for narrowly-scoped cleanup, but it
 * must not override a completed user's domain and tenant markers or force a
 * repeat invite flow on login.
 */
export function requiresOAuthOnboarding(user: OAuthOnboardingUser): boolean {
  return isOAuthRegistrationPending(user);
}
