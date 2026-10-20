import { describe, it, expect } from "vitest";

import { createAllowedBrowserOrigin } from "../_core/browserOriginPolicy";

// Exercise the same origin policy used by the production CORS/CSRF middleware.
function isAllowedOrigin(origin: string | undefined, isProduction = false): boolean {
  return createAllowedBrowserOrigin({ production: isProduction })(origin);
}

describe("CSRF Origin Validation", () => {
  it("restricts production fallback domains when the runtime public URL is configured", () => {
    const allowed = createAllowedBrowserOrigin({
      production: true,
      getPublicAppUrl: () => "https://smartaihub.app",
    });
    expect(allowed("https://smartaihub.app")).toBe(true);
    expect(allowed("https://unconfigured.smartaihub.app")).toBe(false);
    expect(allowed("https://smartspec.pro")).toBe(false);
  });

  it.each(["https://smartaihub.app/path", "https://user@smartaihub.app", "javascript:alert(1)"])("does not trust malformed runtime public URL %s", publicUrl => {
    const allowed = createAllowedBrowserOrigin({
      production: true,
      allowedOrigins: "https://staging.account.workers.dev",
      getPublicAppUrl: () => publicUrl,
    });
    expect(allowed(publicUrl)).toBe(false);
    expect(allowed("https://smartaihub.app")).toBe(false);
  });

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
