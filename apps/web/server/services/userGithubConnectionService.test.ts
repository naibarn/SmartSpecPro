import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, "")),
  auditLog: vi.fn(),
  fetch: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./crypto", () => ({ encrypt: mocks.encrypt, decrypt: mocks.decrypt }));
vi.mock("./auditLogger", () => ({ auditLogger: { log: mocks.auditLog } }));

import { connectUserGitHub, getGitHubMiniAppOAuthConfig, validateGitHubToken } from "./userGithubConnectionService";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockResolvedValue({
    insert: () => ({
      values: () => ({ onConflictDoUpdate: mocks.upsert }),
    }),
  });
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => vi.unstubAllEnvs());

describe("user GitHub Mini-App connection", () => {
  it("uses the configured OAuth app and the dedicated Mini-App callback", async () => {
    mocks.getDb.mockResolvedValueOnce(null);
    vi.stubEnv("GITHUB_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv("GITHUB_MINIAPP_REDIRECT_URI", "https://smartaihub.app/api/oauth/github/miniapp/callback");
    await expect(getGitHubMiniAppOAuthConfig()).resolves.toEqual({
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
      redirectUri: "https://smartaihub.app/api/oauth/github/miniapp/callback",
    });
  });

  it("verifies and encrypts the OAuth access token without writing it to the audit record", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ login: "miniapp-owner" }), { status: 200 }));
    await expect(connectUserGitHub({ userId: 12, tenantId: "tenant-a", token: "github-oauth-test-access-token-1234567890" }))
      .resolves.toEqual({ githubLogin: "miniapp-owner" });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.anything(),
      set: expect.objectContaining({
        githubLogin: "miniapp-owner",
        tokenEncrypted: "encrypted:github-oauth-test-access-token-1234567890",
      }),
    }));
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain("github-oauth-test-access-token-1234567890");
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain("7890");
  });

  it("rejects a token GitHub does not recognize", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await expect(validateGitHubToken("github-invalid-test-access-token-1234567890")).rejects.toThrow("GITHUB_TOKEN_INVALID");
  });
});
