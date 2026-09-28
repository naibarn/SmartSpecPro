import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  createOpaqueToken,
  escapeHtml,
  getGoogleOAuthConfig,
  hashOpaqueToken,
} from "./accountAuthService";

describe("accountAuthService security helpers", () => {
  it("creates non-reversible opaque tokens and stable hashes", () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashOpaqueToken(token)).toHaveLength(64);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toBe(token);
  });

  it("escapes email-link HTML values", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"
    );
  });

  it("builds a Google authorization URL with an opaque state", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl(
        {
          clientId: "client-id",
          clientSecret: "secret",
          redirectUri: "https://smartaihub.app/auth/callback/google",
        },
        "state-value"
      )
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://smartaihub.app/auth/callback/google"
    );
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("access_type")).toBe("online");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("rejects an unsafe Google callback redirect", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [
            { key: "googleClientId", value: "client-id", isSensitive: false },
            { key: "googleClientSecret", value: "secret", isSensitive: false },
            {
              key: "googleRedirectUri",
              value: "https://evil.example/callback",
              isSensitive: false,
            },
          ],
        }),
      }),
    } as any;

    await expect(getGoogleOAuthConfig(db)).resolves.toBeNull();
  });
});
