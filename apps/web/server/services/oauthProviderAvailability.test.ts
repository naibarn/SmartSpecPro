import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOAuthProviderAvailability } from "./oauthProviderAvailability";

describe("buildOAuthProviderAvailability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks Google as not ready when only the client id exists", () => {
    const result = buildOAuthProviderAvailability({
      googleClientId: "client-id.apps.googleusercontent.com",
    });

    expect(result.google).toBe(false);
    expect(result.details.google.missing).toEqual(["clientSecret"]);
  });

  it("marks Google as ready when the required settings exist", () => {
    const result = buildOAuthProviderAvailability({
      googleClientId: "client-id.apps.googleusercontent.com",
      googleClientSecret: "encrypted-secret",
      googleRedirectUri: "https://smartaihub.app/auth/callback/google",
    });

    expect(result.google).toBe(true);
    expect(result.details.google.missing).toEqual([]);
  });

  it("uses environment fallback when DB settings are absent", () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "github-secret");
    vi.stubEnv("GITHUB_REDIRECT_URI", "https://smartaihub.app/auth/callback/github");

    const result = buildOAuthProviderAvailability({});

    expect(result.github).toBe(true);
    expect(result.details.github.missing).toEqual([]);
  });
});
