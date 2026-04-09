import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";

import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";

const PENDING_TWO_FACTOR_COOKIE_NAME = "pending_2fa_challenge";
const PENDING_TWO_FACTOR_TTL_MS = 10 * 60 * 1000;

export type PendingTwoFactorPayload = {
  email: string;
  openId: string;
  name: string;
  provider: "password" | "google" | "github";
};

function getPendingTwoFactorSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function signPendingTwoFactorToken(payload: PendingTwoFactorPayload) {
  const secretKey = getPendingTwoFactorSecret();
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor(
    (issuedAt + PENDING_TWO_FACTOR_TTL_MS) / 1000,
  );

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(Math.floor(issuedAt / 1000))
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function setPendingTwoFactorCookie(
  req: Request,
  res: Response,
  payload: PendingTwoFactorPayload,
) {
  const token = await signPendingTwoFactorToken(payload);
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(PENDING_TWO_FACTOR_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: PENDING_TWO_FACTOR_TTL_MS,
  });
}

export async function readPendingTwoFactorCookie(
  req: Request,
): Promise<PendingTwoFactorPayload | null> {
  const token = req.cookies?.[PENDING_TWO_FACTOR_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getPendingTwoFactorSecret(), {
      algorithms: ["HS256"],
    });

    const email = typeof payload.email === "string" ? payload.email : null;
    const openId = typeof payload.openId === "string" ? payload.openId : null;
    const name = typeof payload.name === "string" ? payload.name : "";
    const provider =
      payload.provider === "google" ||
      payload.provider === "github" ||
      payload.provider === "password"
        ? payload.provider
        : null;

    if (!email || !openId || !provider) {
      return null;
    }

    return {
      email,
      openId,
      name,
      provider,
    };
  } catch {
    return null;
  }
}

export function clearPendingTwoFactorCookie(req: Request, res: Response) {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(PENDING_TWO_FACTOR_COOKIE_NAME, {
    ...cookieOptions,
    maxAge: -1,
  });
}
