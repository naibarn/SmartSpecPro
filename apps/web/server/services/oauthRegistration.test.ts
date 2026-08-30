import { describe, expect, it, vi } from "vitest";
import {
  clearOAuthInviteCookie,
  getOAuthInviteCode,
  isOAuthRegistrationPending,
  requiresOAuthOnboarding,
} from "./oauthRegistration";
import { throwRegistrationDenied } from "./authRegistrationPolicy";

describe("OAuth registration invite context", () => {
  it("normalizes the invite code from the OAuth handoff cookie", () => {
    expect(
      getOAuthInviteCode({ cookies: { invite_code: " arwhsu96 " } } as any)
    ).toBe("ARWHSU96");
  });

  it("ignores malformed or oversized invite cookie values", () => {
    expect(
      getOAuthInviteCode({ cookies: { invite_code: "bad code" } } as any)
    ).toBeUndefined();
    expect(
      getOAuthInviteCode({ cookies: { invite_code: "A".repeat(33) } } as any)
    ).toBeUndefined();
  });

  it("clears the short-lived invite handoff cookie", () => {
    const clearCookie = vi.fn();
    clearOAuthInviteCookie({ clearCookie } as any);
    expect(clearCookie).toHaveBeenCalledWith("invite_code", { path: "/" });
  });
});

describe("OAuth registration admission state", () => {
  it("marks a pre-created OAuth row without domain or tenant as pending", () => {
    expect(
      isOAuthRegistrationPending({
        loginMethod: "google",
        registeredDomain: null,
        currentTenantId: null,
      })
    ).toBe(true);
  });

  it.each([
    {
      name: "missing registered domain",
      registeredDomain: null,
      currentTenantId: "tenant-ZCSKEM9s",
    },
    {
      name: "missing tenant",
      registeredDomain: "smartaihub.app",
      currentTenantId: null,
    },
  ])(
    "keeps onboarding fail-closed when $name",
    ({ registeredDomain, currentTenantId }) => {
      expect(
        isOAuthRegistrationPending({
          loginMethod: "google",
          registeredDomain,
          currentTenantId,
        })
      ).toBe(true);
    }
  );

  it("does not mark a completed OAuth user as pending", () => {
    expect(
      isOAuthRegistrationPending({
        loginMethod: "google",
        registeredDomain: "smartaihub.app",
        currentTenantId: "tenant-ZCSKEM9s",
      })
    ).toBe(false);
  });

  it("requires onboarding for a pending OAuth row regardless of callback claim", () => {
    expect(requiresOAuthOnboarding({ loginMethod: "google" })).toBe(true);
  });

  it("requires onboarding on a retry even when the signed new-user claim is false", () => {
    expect(
      requiresOAuthOnboarding({
        loginMethod: "google",
        registeredDomain: null,
        currentTenantId: null,
      })
    ).toBe(true);
  });

  it("does not re-enter onboarding for a completed OAuth row", () => {
    expect(
      requiresOAuthOnboarding({
        loginMethod: "google",
        registeredDomain: "smartaihub.app",
        currentTenantId: "tenant-ZCSKEM9s",
      })
    ).toBe(false);
  });
});

describe("registration policy errors", () => {
  it("uses a user-facing non-internal tRPC code", () => {
    expect(() =>
      throwRegistrationDenied("Registration requires an invite code")
    ).toThrow("Registration requires an invite code");

    try {
      throwRegistrationDenied("Registration requires an invite code");
    } catch (error) {
      expect(error).toMatchObject({
        code: "FORBIDDEN",
        message: "Registration requires an invite code",
      });
    }
  });
});
