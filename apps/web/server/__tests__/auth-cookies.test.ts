import { describe, it, expect } from "vitest";
import { getSessionCookieOptions } from "../_core/cookies";
import type { Request } from "express";

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    protocol: "https",
    hostname: "smartaihub.app",
    headers: { "x-forwarded-proto": "https" },
    ...overrides,
  } as unknown as Request;
}

describe("Cookie Configuration", () => {
  it("should set cookie domain to .smartaihub.app for production domain", () => {
    const req = mockRequest({ hostname: "smartaihub.app" });
    const options = getSessionCookieOptions(req);

    expect(options.domain).toBe(".smartaihub.app");
  });

  it("should set cookie domain to .smartaihub.app for subdomains", () => {
    const req = mockRequest({ hostname: "app.smartaihub.app" });
    const options = getSessionCookieOptions(req);

    expect(options.domain).toBe(".smartaihub.app");
  });

  it("should set httpOnly to true", () => {
    const req = mockRequest();
    const options = getSessionCookieOptions(req);

    expect(options.httpOnly).toBe(true);
  });

  it("should set secure=true for HTTPS requests", () => {
    const req = mockRequest({
      protocol: "https",
      headers: { "x-forwarded-proto": "https" },
    });
    const options = getSessionCookieOptions(req);

    expect(options.secure).toBe(true);
  });

  it("should set secure=false for HTTP requests", () => {
    const req = mockRequest({
      protocol: "http",
      hostname: "localhost",
      headers: {},
    });
    const options = getSessionCookieOptions(req);

    expect(options.secure).toBe(false);
  });

  it("should not set cookie domain for localhost", () => {
    const req = mockRequest({
      protocol: "http",
      hostname: "localhost",
      headers: {},
    });
    const options = getSessionCookieOptions(req);

    expect(options.domain).toBeUndefined();
  });

  it("should not set cookie domain for IP addresses", () => {
    const req = mockRequest({
      protocol: "http",
      hostname: "127.0.0.1",
      headers: {},
    });
    const options = getSessionCookieOptions(req);

    expect(options.domain).toBeUndefined();
  });

  it("should set SameSite=lax for HTTP development", () => {
    const req = mockRequest({
      protocol: "http",
      hostname: "localhost",
      headers: {},
    });
    const options = getSessionCookieOptions(req);

    expect(options.sameSite).toBe("lax");
  });

  it("should set path to /", () => {
    const req = mockRequest();
    const options = getSessionCookieOptions(req);

    expect(options.path).toBe("/");
  });
});
