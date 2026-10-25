import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { sdk } from "./sdk";
import { signBearerToken, verifyBearerToken } from "./tokens";
import { connectUserGitHub, getGitHubMiniAppOAuthConfig } from "../services/userGithubConnectionService";
import { reconcilePendingMiniAppRepositoriesForOwner } from "../services/miniAppRepositoryReconciliation";

const STATE_COOKIE = "miniapp_github_oauth_state";
const CALLBACK_PATH = "/api/oauth/github/miniapp/callback";

function cookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: CALLBACK_PATH, maxAge: 10 * 60 * 1000 };
}

function settingsRedirect(result: "connected" | "error") {
  return `/settings?github=${result}`;
}

export function registerMiniAppGitHubOAuthRoutes(app: Express) {
  app.get("/api/oauth/github/miniapp/connect", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const config = await getGitHubMiniAppOAuthConfig();
      if (!config) {
        res.redirect(302, settingsRedirect("error"));
        return;
      }
      const nonce = crypto.randomBytes(24).toString("base64url");
      const state = signBearerToken({
        userId: user.id,
        tenantId: user.currentTenantId ?? undefined,
        tokenUse: "miniapp-github-connect",
        jti: nonce,
      }, "10m");
      res.cookie(STATE_COOKIE, nonce, cookieOptions());
      const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: "repo",
        state,
      });
      res.redirect(302, `https://github.com/login/oauth/authorize?${query.toString()}`);
    } catch {
      res.redirect(302, "/login?returnTo=%2Fsettings");
    }
  });

  app.get(CALLBACK_PATH, async (req: Request, res: Response) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const nonce = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { ...cookieOptions(), maxAge: undefined });
    try {
      const claims = await verifyBearerToken(state);
      if (claims.tokenUse !== "miniapp-github-connect" || !claims.userId || !claims.jti || !nonce || claims.jti !== nonce || !code) {
        throw new Error("INVALID_OAUTH_STATE");
      }
      const config = await getGitHubMiniAppOAuthConfig();
      if (!config) throw new Error("GITHUB_OAUTH_NOT_CONFIGURED");
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenResponse.ok) throw new Error("GITHUB_TOKEN_EXCHANGE_FAILED");
      const tokenPayload = await tokenResponse.json() as { access_token?: unknown; scope?: unknown; error?: unknown };
      if (typeof tokenPayload.access_token !== "string") throw new Error("GITHUB_TOKEN_EXCHANGE_FAILED");
      if (typeof tokenPayload.scope !== "string" || !tokenPayload.scope.split(/[ ,]+/).includes("repo")) {
        throw new Error("GITHUB_REPOSITORY_SCOPE_NOT_GRANTED");
      }
      await connectUserGitHub({
        userId: claims.userId,
        tenantId: typeof claims.tenantId === "string" ? claims.tenantId : null,
        token: tokenPayload.access_token,
      });
      if (typeof claims.tenantId === "string") {
        try {
          const result = await reconcilePendingMiniAppRepositoriesForOwner({
            tenantId: claims.tenantId,
            ownerUserId: claims.userId,
          });
          if (result.failed) {
            console.warn("[MiniAppGitHub] OAuth completed with pending repository reconciliation", {
              userId: claims.userId,
              failed: result.failed,
            });
          }
        } catch (error) {
          console.warn("[MiniAppGitHub] OAuth completed; repository reconciliation will be retried separately", {
            userId: claims.userId,
            code: error instanceof Error ? error.message.slice(0, 120) : "MINI_APP_REPOSITORY_RECONCILIATION_FAILED",
          });
        }
      }
      res.redirect(302, settingsRedirect("connected"));
    } catch {
      res.redirect(302, settingsRedirect("error"));
    }
  });
}
