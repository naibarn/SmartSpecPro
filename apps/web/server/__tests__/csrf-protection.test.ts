import { describe, it, expect } from "vitest";

/**
 * CSRF protection logic tests.
 *
 * The actual CSRF middleware is defined inline in _core/index.ts.
 * These tests validate the origin-checking logic separately
 * to ensure the CSRF rules are correct for production deployment.
 */

// Replicate the origin-checking logic from _core/index.ts
const ALLOWED_SUFFIXES = [
  ".smartspec.local",
  ".smartspec.pro",
  ".localhost",
  ".smartaihub.app",
];
const ALLOWED_EXACT = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

function isAllowedOrigin(
  origin: string | undefined,
  isProduction = false,
): boolean {
  if (!origin) return false;
  let originHost = "";
  try {
    originHost = new URL(origin).hostname;
  } catch {
    return false;
  }
  return (
    ALLOWED_EXACT.includes(origin) ||
    originHost === "localhost" ||
    (!isProduction &&
      /^(\d{1,3}\.){3}\d{1,3}$/.test(originHost)) ||
    ALLOWED_SUFFIXES.some(
      (suffix) =>
        originHost === suffix.slice(1) || originHost.endsWith(suffix),
    )
  );
}

describe("CSRF Origin Validation", () => {
  it("should accept requests from smartaihub.app", () => {
    expect(isAllowedOrigin("https://smartaihub.app")).toBe(true);
  });

  it("should accept requests from app.smartaihub.app subdomain", () => {
    expect(isAllowedOrigin("https://app.smartaihub.app")).toBe(true);
  });

  it("should accept requests from smartspec.pro", () => {
    expect(isAllowedOrigin("https://smartspec.pro")).toBe(true);
  });

  it("should accept requests from localhost", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
  });

  it("should accept requests from tauri", () => {
    expect(isAllowedOrigin("tauri://localhost")).toBe(true);
    expect(isAllowedOrigin("http://tauri.localhost")).toBe(true);
    expect(isAllowedOrigin("https://tauri.localhost")).toBe(true);
  });

  it("should reject requests from unknown domains", () => {
    expect(isAllowedOrigin("https://evil.com")).toBe(false);
    expect(isAllowedOrigin("https://attacker.io")).toBe(false);
  });

  it("should reject requests from similar-looking domains", () => {
    expect(isAllowedOrigin("https://fakesmartaihub.app")).toBe(false);
    expect(isAllowedOrigin("https://smartaihub.app.evil.com")).toBe(false);
  });

  it("should reject undefined origin", () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
  });

  it("should reject empty string origin", () => {
    expect(isAllowedOrigin("")).toBe(false);
  });

  it("should reject malformed URLs", () => {
    expect(isAllowedOrigin("not-a-url")).toBe(false);
    expect(isAllowedOrigin("://missing-scheme")).toBe(false);
  });

  it("should accept IP addresses in development mode", () => {
    expect(isAllowedOrigin("http://192.168.1.100:3000", false)).toBe(true);
    expect(isAllowedOrigin("http://10.0.0.1:8080", false)).toBe(true);
  });

  it("should reject IP addresses in production mode", () => {
    expect(isAllowedOrigin("http://192.168.1.100:3000", true)).toBe(false);
    expect(isAllowedOrigin("http://45.33.99.100", true)).toBe(false);
  });
});

describe("CSRF Safe Methods", () => {
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

  it("should identify GET, HEAD, OPTIONS as safe methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(SAFE_METHODS.has(method)).toBe(true);
    }
  });

  it("should identify POST, PUT, PATCH, DELETE as unsafe methods", () => {
    for (const method of UNSAFE_METHODS) {
      expect(SAFE_METHODS.has(method)).toBe(false);
    }
  });
});
