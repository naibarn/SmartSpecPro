import { describe, expect, it, vi } from "vitest";

import {
  clearOAuthInviteCookie,
  getOAuthInviteCode,
} from "./oauthRegistration";

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
