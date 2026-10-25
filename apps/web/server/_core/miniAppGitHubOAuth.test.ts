import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  connectUserGitHub: vi.fn(),
  getConfig: vi.fn(),
  signBearerToken: vi.fn(() => "signed-state"),
  verifyBearerToken: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("./sdk", () => ({ sdk: { authenticateRequest: (...args: unknown[]) => mocks.authenticateRequest(...args) } }));
vi.mock("./tokens", () => ({
  signBearerToken: (...args: unknown[]) => mocks.signBearerToken(...args),
  verifyBearerToken: (...args: unknown[]) => mocks.verifyBearerToken(...args),
}));
vi.mock("../services/userGithubConnectionService", () => ({
  connectUserGitHub: (...args: unknown[]) => mocks.connectUserGitHub(...args),
  getGitHubMiniAppOAuthConfig: (...args: unknown[]) => mocks.getConfig(...args),
}));
vi.mock("../services/miniAppRepositoryReconciliation", () => ({
  reconcilePendingMiniAppRepositoriesForOwner: (...args: unknown[]) => mocks.reconcile(...args),
}));

import { registerMiniAppGitHubOAuthRoutes } from "./miniAppGitHubOAuth";

function registeredRoutes() {
  const routes = new Map<string, (req: any, res: any) => Promise<void>>();
  registerMiniAppGitHubOAuthRoutes({ get: (path: string, handler: any) => routes.set(path, handler) } as any);
  return routes;
}

function response() {
  return { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfig.mockResolvedValue({ clientId: "client-id", clientSecret: "secret", redirectUri: "https://smartaihub.app/api/oauth/github/miniapp/callback" });
  mocks.verifyBearerToken.mockResolvedValue({
    userId: 23,
    tenantId: "tenant-owner",
    tokenUse: "miniapp-github-connect",
    jti: "nonce",
  });
  mocks.reconcile.mockResolvedValue({ scanned: 1, provisioned: 1, skipped: 0, failed: 0 });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "opaque-token", scope: "repo" }), { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe("Mini-App GitHub OAuth callback reconciliation", () => {
  it("reconciles pending private repositories after storing the owner's OAuth connection", async () => {
    const callback = registeredRoutes().get("/api/oauth/github/miniapp/callback")!;
    const res = response();

    await callback({ query: { state: "signed-state", code: "oauth-code" }, cookies: { miniapp_github_oauth_state: "nonce" } }, res);

    expect(mocks.connectUserGitHub).toHaveBeenCalledWith({ userId: 23, tenantId: "tenant-owner", token: "opaque-token" });
    expect(mocks.reconcile).toHaveBeenCalledWith({ tenantId: "tenant-owner", ownerUserId: 23 });
    expect(res.redirect).toHaveBeenCalledWith(302, "/settings?github=connected");
  });

  it("keeps OAuth successful when repository reconciliation needs a later retry", async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error("GITHUB_HTTP_503"));
    const callback = registeredRoutes().get("/api/oauth/github/miniapp/callback")!;
    const res = response();

    await callback({ query: { state: "signed-state", code: "oauth-code" }, cookies: { miniapp_github_oauth_state: "nonce" } }, res);

    expect(mocks.connectUserGitHub).toHaveBeenCalledOnce();
    expect(res.redirect).toHaveBeenCalledWith(302, "/settings?github=connected");
  });
});
