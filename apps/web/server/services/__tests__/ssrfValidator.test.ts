import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn(async () => ({ smartspecInternalUrl: "http://localhost:3000" })),
  getCachedInternalNodeUrl: vi.fn(() => process.env.SMARTSPEC_INTERNAL_URL || "http://localhost:3000"),
}));

import { validateSsrfUrl } from "../ssrfValidator";

describe("ssrfValidator", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SMARTSPEC_INTERNAL_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects private IP 10.x.x.x", () => {
    expect(() => validateSsrfUrl("http://10.0.0.5/api")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://10.255.255.255/api")).toThrow("SSRF");
  });

  it("rejects private IP 172.16.x.x - 172.31.x.x", () => {
    expect(() => validateSsrfUrl("http://172.16.0.1/api")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://172.31.255.255/api")).toThrow("SSRF");
  });

  it("rejects private IP 192.168.x.x", () => {
    expect(() => validateSsrfUrl("http://192.168.1.1/api")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://192.168.0.100/api")).toThrow("SSRF");
  });

  it("rejects localhost (127.0.0.1, localhost, ::1)", () => {
    expect(() => validateSsrfUrl("http://localhost:8080/hook")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://127.0.0.1/hook")).toThrow("SSRF");
    expect(() => validateSsrfUrl("http://[::1]/hook")).toThrow("SSRF");
  });

  it("rejects cloud metadata 169.254.169.254", () => {
    expect(() => validateSsrfUrl("http://169.254.169.254/latest/meta-data/")).toThrow("SSRF");
  });

  it("rejects non-http/https schemes", () => {
    expect(() => validateSsrfUrl("ftp://example.com/file")).toThrow("SSRF");
    expect(() => validateSsrfUrl("file:///etc/passwd")).toThrow("SSRF");
  });

  it("allows SMARTSPEC_INTERNAL_URL explicitly", () => {
    process.env.SMARTSPEC_INTERNAL_URL = "http://127.0.0.1:3000";
    expect(() => validateSsrfUrl("http://127.0.0.1:3000/api/tools")).not.toThrow();
  });

  it("allows valid public HTTPS URLs", () => {
    expect(() => validateSsrfUrl("https://api.openai.com/v1/chat")).not.toThrow();
    expect(() => validateSsrfUrl("https://hooks.slack.com/services/abc")).not.toThrow();
    expect(() => validateSsrfUrl("http://example.com/webhook")).not.toThrow();
  });

  it("rejects empty or malformed URLs", () => {
    expect(() => validateSsrfUrl("")).toThrow("SSRF");
    expect(() => validateSsrfUrl("not-a-url")).toThrow("SSRF");
    expect(() => validateSsrfUrl("://missing-scheme")).toThrow("SSRF");
  });
});
