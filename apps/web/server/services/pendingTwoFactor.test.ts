import type { Request, Response } from "express";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/env", () => ({ ENV: { cookieSecret: "fixture-secret-at-least-thirty-two-characters" } }));
import { isPendingTwoFactorUserAllowed, readPendingTwoFactorCookie, setPendingTwoFactorCookie } from "./pendingTwoFactor";

const challenge = { email: "fixture@example.com", openId: "fixture-user", name: "Fixture", provider: "google" as const };
const req = { protocol: "https", hostname: "staging.account.workers.dev", headers: {} } as Request;
const user = { openId: challenge.openId, isDisabled: false, twoFactorEnabled: true, twoFactorSecret: "encrypted", sessionRevokedAt: null };

describe("pending second-factor boundary", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps the real challenge cookie host-only, secure and short-lived on staging", async () => {
    const cookie = vi.fn();
    await setPendingTwoFactorCookie(req, { cookie } as unknown as Response, challenge);
    const [name, token, options] = cookie.mock.calls[0]!;
    expect(name).toBe("pending_2fa_challenge");
    expect(options).toMatchObject({ httpOnly: true, secure: true, maxAge: 600000 });
    expect(options.domain).toBeUndefined();
    const pending = await readPendingTwoFactorCookie({ ...req, cookies: { [name]: token } } as Request);
    expect(pending).toMatchObject(challenge);
    expect(pending?.issuedAt).toBeGreaterThan(0);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 601000);
    expect(await readPendingTwoFactorCookie({ ...req, cookies: { [name]: token } } as Request)).toBeNull();
  });

  it("rejects an ordinary session token even when signed with the same key", async () => {
    const token = await new SignJWT(challenge).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
      .sign(new TextEncoder().encode("fixture-secret-at-least-thirty-two-characters"));
    expect(await readPendingTwoFactorCookie({ ...req, cookies: { pending_2fa_challenge: token } } as Request)).toBeNull();
  });

  it("rechecks account disablement, revocation and factor enrollment before issuing a session", () => {
    const pending = { ...challenge, issuedAt: 1000 };
    expect(isPendingTwoFactorUserAllowed(pending, user)).toBe(true);
    for (const changed of [null, { ...user, isDisabled: true }, { ...user, openId: "other-user" },
      { ...user, twoFactorEnabled: false }, { ...user, twoFactorSecret: null },
      { ...user, sessionRevokedAt: new Date(1000000) }, { ...user, sessionRevokedAt: new Date(1001000) }]) {
      expect(isPendingTwoFactorUserAllowed(pending, changed)).toBe(false);
    }
    expect(isPendingTwoFactorUserAllowed(pending, { ...user, sessionRevokedAt: new Date(999000) })).toBe(true);
  });
});
