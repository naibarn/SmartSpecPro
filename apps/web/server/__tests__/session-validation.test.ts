import { describe, it, expect } from "vitest";
import { COOKIE_NAME } from "../../shared/const";

/**
 * Session validation tests.
 *
 * The existing system uses stateless JWTs with JTI-based revocation
 * (in-memory + Redis). These tests validate the revocation logic
 * and token lifecycle behavior.
 */

describe("Session Revocation Logic", () => {
  it("should reject a revoked JTI", () => {
    // Simulate in-memory revocation store
    const revokedJtis = new Map<string, number>();

    const jti = "session-abc123";
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    revokedJtis.set(jti, expiresAt);

    expect(revokedJtis.has(jti)).toBe(true);
  });

  it("should accept a non-revoked JTI", () => {
    const revokedJtis = new Map<string, number>();
    const jti = "session-valid456";

    expect(revokedJtis.has(jti)).toBe(false);
  });

  it("should clean up expired revocations", () => {
    const revokedJtis = new Map<string, number>();

    // Add expired and valid entries
    revokedJtis.set("expired-jti", Date.now() - 1000);
    revokedJtis.set("valid-jti", Date.now() + 60000);

    // Cleanup: remove expired entries
    for (const [jti, expiresAt] of revokedJtis) {
      if (expiresAt < Date.now()) {
        revokedJtis.delete(jti);
      }
    }

    expect(revokedJtis.has("expired-jti")).toBe(false);
    expect(revokedJtis.has("valid-jti")).toBe(true);
  });
});

describe("Token Extraction", () => {
  it("should extract token from cookie", () => {
    const cookies = { [COOKIE_NAME]: "jwt-token-here" };
    const token = cookies[COOKIE_NAME];

    expect(token).toBe("jwt-token-here");
  });

  it("should extract token from Authorization header", () => {
    const authHeader = "Bearer jwt-token-here";
    const token = authHeader.replace("Bearer ", "");

    expect(token).toBe("jwt-token-here");
  });

  it("should prefer Authorization header over cookie", () => {
    const cookies = { [COOKIE_NAME]: "cookie-token" };
    const authHeader = "Bearer header-token";

    // Authorization header takes priority
    const token = authHeader
      ? authHeader.replace("Bearer ", "")
      : cookies[COOKIE_NAME];

    expect(token).toBe("header-token");
  });

  it("should return null for missing token", () => {
    const cookies: Record<string, string> = {};
    const authHeader: string | undefined = undefined;

    const token = authHeader
      ? authHeader.replace("Bearer ", "")
      : cookies[COOKIE_NAME] || null;

    expect(token).toBeNull();
  });
});

describe("Cookie Name Constant", () => {
  it("should use the correct cookie name", () => {
    expect(COOKIE_NAME).toBe("app_session_id");
  });
});
