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
