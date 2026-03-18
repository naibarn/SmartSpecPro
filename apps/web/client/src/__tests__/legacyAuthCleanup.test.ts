// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanupLegacyAuth } from "../lib/cleanupLegacyAuth";

const LEGACY_KEYS = [
  "smartspec_auth_token",
  "smartspec_user_data",
  "smartspec_web_refresh_token",
  "smartspec_web_token_expiry",
  "smartspec_web_user",
];

describe("cleanupLegacyAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    delete (window as any).__TAURI__;
  });

  it("removes smartspec_auth_token from localStorage in browser context", () => {
    localStorage.setItem("smartspec_auth_token", "old-jwt");
    cleanupLegacyAuth();
    expect(localStorage.getItem("smartspec_auth_token")).toBeNull();
  });

  it("removes all 5 legacy keys from localStorage", () => {
    for (const key of LEGACY_KEYS) {
      localStorage.setItem(key, "value");
    }
    cleanupLegacyAuth();
    for (const key of LEGACY_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it("does NOT run in Tauri context", () => {
    (window as any).__TAURI__ = {};
    localStorage.setItem("smartspec_auth_token", "old-jwt");
    cleanupLegacyAuth();
    expect(localStorage.getItem("smartspec_auth_token")).toBe("old-jwt");
  });

  it("is idempotent (safe to call multiple times)", () => {
    localStorage.setItem("smartspec_auth_token", "old-jwt");
    cleanupLegacyAuth();
    cleanupLegacyAuth();
    expect(localStorage.getItem("smartspec_auth_token")).toBeNull();
  });

  it("does not affect other localStorage keys", () => {
    localStorage.setItem("some_unrelated_key", "value");
    localStorage.setItem("smartspec_auth_token", "old-jwt");
    cleanupLegacyAuth();
    expect(localStorage.getItem("some_unrelated_key")).toBe("value");
    expect(localStorage.getItem("smartspec_auth_token")).toBeNull();
  });
});
