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
    window.history.replaceState({}, "", "/login?redirect=%2Fdrama-series");
    expect(getRequestedAuthReturnUrl()).toBe("/drama-series");

    window.history.replaceState({}, "", "/login?returnUrl=%2Fauth%2Fdevice%3Fuser_code%3DABCD1234");
    expect(getRequestedAuthReturnUrl()).toBe("/auth/device?user_code=ABCD1234");
  });

  it("preserves only validated product, device-auth, and MCP OAuth return intents", () => {
    expect(resolveSafeAuthReturnUrl("/drama-series")).toBe("/drama-series");
    expect(resolveSafeAuthReturnUrl("/dashboard")).toBe("/dashboard");
    expect(resolveSafeAuthReturnUrl("/oauth/authorize?tx=550e8400-e29b-41d4-a716-446655440000"))
      .toBe("/oauth/authorize?tx=550e8400-e29b-41d4-a716-446655440000");
  });

  it.each([
    "/workflows/gallery",
    "/admin?tenantId=tenant-attacker",
    "/dashboard?taskId=private-task",
    "/auth/device?user_code=ABCD1234&tenantId=tenant-attacker",
    "/auth/device?user_code=short",
    "/oauth/authorize?tx=not-a-uuid&state=private",
  ])("rejects unapproved auth return intent %s", (target) => {
    expect(resolveSafeAuthReturnUrl(target)).toBeNull();
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
