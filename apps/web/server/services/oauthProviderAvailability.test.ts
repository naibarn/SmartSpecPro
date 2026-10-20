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
    vi.stubEnv(
      "GITHUB_REDIRECT_URI",
      "https://smartaihub.app/auth/callback/github"
    );

    const result = buildOAuthProviderAvailability({});

    expect(result.github).toBe(true);
    expect(result.details.github.missing).toEqual([]);
  });

  it("does not report Google ready when the redirect URI points to Drive callback", () => {
    const result = buildOAuthProviderAvailability({
      googleClientId: "client-id.apps.googleusercontent.com",
      googleClientSecret: "google-secret",
      googleRedirectUri: "https://smartaihub.app/auth/callback/google-drive",
    });

    expect(result.google).toBe(false);
    expect(result.details.google.invalid).toEqual(["redirectUri"]);
  });

  it("does not advertise production login callbacks on a verified staging public origin", () => {
    const values = {
      googleClientId: "google-client", googleClientSecret: "google-secret",
      googleRedirectUri: "https://smartaihub.app/auth/callback/google",
      githubClientId: "github-client", githubClientSecret: "github-secret",
      githubRedirectUri: "https://smartaihub.app/auth/callback/github",
    };
    expect(buildOAuthProviderAvailability(values)).toMatchObject({ google: true, github: true });
    const staged = buildOAuthProviderAvailability(values, "https://staging.account.workers.dev");
    expect(staged).toMatchObject({ google: false, github: false });
    expect(staged.details.google.invalid).toEqual(["redirectUri"]);
    expect(staged.details.github.invalid).toEqual(["redirectUri"]);
  });

  it("accepts an explicitly configured callback for that verified origin", () => {
    const publicOrigin = "https://staging.account.workers.dev";
    const result = buildOAuthProviderAvailability({ googleClientId: "google-client", googleClientSecret: "google-secret",
      googleRedirectUri: `${publicOrigin}/auth/callback/google` }, publicOrigin);
    expect(result.google).toBe(true);
  });
});
