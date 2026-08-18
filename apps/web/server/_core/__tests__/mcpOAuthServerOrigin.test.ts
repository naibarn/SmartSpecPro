import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createMcpOAuthConsentFormToken,
  isTrustedMcpOAuthConsentOrigin,
  verifyMcpOAuthConsentFormToken,
} from "../mcpOAuthServer";

const savedJwtSecret = process.env.JWT_SECRET;

beforeEach(() => {
  process.env.JWT_SECRET = "test-jwt-secret-32-chars-minimum-1234567890";
});

afterEach(() => {
  if (savedJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedJwtSecret;
});

describe("MCP OAuth consent browser origin", () => {
  it("accepts the canonical origin from Origin", () => {
    expect(
      isTrustedMcpOAuthConsentOrigin(
        "https://smartaihub.app",
        undefined,
        "https://smartaihub.app",
      ),
    ).toBe(true);
  });

  it("accepts a same-origin Referer when browsers send null Origin", () => {
    expect(
      isTrustedMcpOAuthConsentOrigin(
        "null",
        "https://smartaihub.app/oauth/authorize?tx=tx_123",
        "https://smartaihub.app",
      ),
    ).toBe(true);
  });

  it("rejects a foreign Origin even when Referer is trusted", () => {
    expect(
      isTrustedMcpOAuthConsentOrigin(
        "https://evil.example",
        "https://smartaihub.app/oauth/authorize?tx=tx_123",
        "https://smartaihub.app",
      ),
    ).toBe(false);
  });

  it("rejects a malformed Origin even when Referer is trusted", () => {
    expect(
      isTrustedMcpOAuthConsentOrigin(
        "not-an-origin",
        "https://smartaihub.app/oauth/authorize?tx=tx_123",
        "https://smartaihub.app",
      ),
    ).toBe(false);
  });

  it("rejects missing browser provenance", () => {
    expect(
      isTrustedMcpOAuthConsentOrigin(undefined, undefined, "https://smartaihub.app"),
    ).toBe(false);
  });

  it("uses a server-signed form token for null-origin browser flows", () => {
    const transactionId = "tx_test_123";
    const token = createMcpOAuthConsentFormToken(transactionId);
    expect(token).toBeTruthy();
    expect(verifyMcpOAuthConsentFormToken(transactionId, token ?? undefined)).toBe(true);
    expect(verifyMcpOAuthConsentFormToken("tx_other", token ?? undefined)).toBe(false);
  });
});
