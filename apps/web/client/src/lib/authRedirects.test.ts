/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingOAuthTwoFactor,
  consumeAuthReturnUrl,
  getPendingOAuthTwoFactor,
  getRequestedAuthReturnUrl,
  rememberAuthReturnUrl,
  resolveSafeAuthReturnUrl,
  setPendingOAuthTwoFactor,
} from "./authRedirects";

describe("authRedirects", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/login");
  });

  it("accepts relative return paths used by device auth", () => {
    expect(resolveSafeAuthReturnUrl("/auth/device?user_code=ABCD1234")).toBe(
      "/auth/device?user_code=ABCD1234",
    );
  });

  it("reads both returnUrl and redirect query params", () => {
    window.history.replaceState({}, "", "/login?redirect=%2Fworkflows%2Fgallery");
    expect(getRequestedAuthReturnUrl()).toBe("/workflows/gallery");

    window.history.replaceState({}, "", "/login?returnUrl=%2Fauth%2Fdevice%3Fuser_code%3DABCD1234");
    expect(getRequestedAuthReturnUrl()).toBe("/auth/device?user_code=ABCD1234");
  });

  it("rejects unsafe external redirect targets", () => {
    expect(resolveSafeAuthReturnUrl("https://evil.example.com/phish")).toBeNull();
  });

  it("stores and consumes a remembered return url", () => {
    rememberAuthReturnUrl("/auth/device?user_code=ABCD1234");

    expect(consumeAuthReturnUrl()).toBe("/auth/device?user_code=ABCD1234");
    expect(consumeAuthReturnUrl()).toBe("/dashboard");
  });

  it("stores and clears pending oauth 2fa state", () => {
    setPendingOAuthTwoFactor({
      email: "user@example.com",
      hasBackupEmail: true,
      hasPhone: false,
    });

    expect(getPendingOAuthTwoFactor()).toEqual({
      email: "user@example.com",
      hasBackupEmail: true,
      hasPhone: false,
    });

    clearPendingOAuthTwoFactor();
    expect(getPendingOAuthTwoFactor()).toBeNull();
  });
});
