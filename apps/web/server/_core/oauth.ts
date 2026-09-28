import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ensureFreePlanForUser } from "../services/freePlanService";
import { analyzeEmail } from "../services/emailAnalysis";
import { ENABLE_FUNNEL_TRACKING, trackSignupCompleted } from "../services/funnelMilestones";
import {
  checkRegistrationAllowed,
  checkDeviceFraudLimit,
  processInviteCodeUsage,
  giveInviteCodeBonuses,
  getAuthMethodsConfig,
} from "../services/inviteCodeService";
import { registrationLimiter } from "../services/rateLimiter";
import { evaluateRegistration, logRegistrationEvent, recordDeviceFingerprint } from "../services/trustScoring";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // Check if this is a new user
      const existingUser = await db.getUserByOpenId(userInfo.openId);
      const isNewUser = !existingUser;

      // Shared request info (hoisted to avoid duplicate declarations)
      const hostname = req.hostname || req.get("host")?.split(":")[0] || "localhost";
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      const fingerprintHash = req.cookies?.["__fp"] || undefined;

      // For new users: check auth methods and invite code
      let inviteCodeId: number | undefined;
      if (isNewUser) {
        // Check if this OAuth provider is allowed
        const provider = userInfo.loginMethod ?? userInfo.platform ?? "oauth";
        const authMethods = await getAuthMethodsConfig();
        if (provider === "google" && !authMethods.google) {
          res.redirect(302, "/?error=google_auth_disabled");
          return;
        }
        if (provider === "github" && !authMethods.github) {
          res.redirect(302, "/?error=github_auth_disabled");
          return;
        }

        // Check invite code from cookie (set by frontend before OAuth redirect)
        const inviteCodeValue = req.cookies?.["invite_code"];
        const tenantId = (req as any).tenantId || (req as any).tenant?.id || null;
        const regCheck = await checkRegistrationAllowed(inviteCodeValue, tenantId);
        if (!regCheck.allowed) {
          res.clearCookie("invite_code", { path: "/", secure: true, sameSite: "lax" });
          res.redirect(302, `/?error=registration_not_allowed`);
          return;
        }
        inviteCodeId = regCheck.codeId;

        // Check device fraud limit
        const fraudCheck = await checkDeviceFraudLimit(fingerprintHash, ipAddress);
        if (!fraudCheck.allowed) {
          res.redirect(302, "/?error=device_limit_reached");
          return;
        }
      }

      // Check if this is the first user in the system (will become admin)
      let isFirstUser = false;
      if (isNewUser) {
        const userCount = await db.getUserCount();
        isFirstUser = userCount === 0;
        if (isFirstUser) {
          console.log(`[OAuth] First user detected! Will grant admin privileges.`);
        }
      }

      // Email analysis for normalized email
      const emailAnalysis = userInfo.email ? analyzeEmail(userInfo.email) : null;

      // Trust evaluation for new users
      let trustScore = 100;
      let trustOutcome: "allowed" | "flagged" | "blocked" = "allowed";

      if (isNewUser && userInfo.email) {
        // Rate limit check
        const rateLimited = !registrationLimiter.isAllowed(ipAddress);
        if (rateLimited) {
          console.warn(`[OAuth] Registration rate limited for IP: ${ipAddress}`);
          res.redirect(302, "/?error=rate_limited");
          return;
        }

        const trustResult = await evaluateRegistration({
          email: userInfo.email,
          ipAddress,
          fingerprintHash,
        });
        trustScore = trustResult.score;
        trustOutcome = trustResult.outcome;
        console.log(`[OAuth] Trust score for ${userInfo.email}: ${trustScore} (${trustOutcome})`);
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
        registeredDomain: isNewUser ? hostname : undefined,
        role: isFirstUser ? 'admin' : undefined,
        normalizedEmail: isNewUser && emailAnalysis ? emailAnalysis.normalized : undefined,
        registrationIp: isNewUser ? ipAddress : undefined,
        trustScore: isNewUser ? trustScore : undefined,
      });

      // Assign the configured monthly Free package to every new user. The
      // assignment service excludes the first system admin automatically.
      if (isNewUser) {
        const newUser = await db.getUserByOpenId(userInfo.openId);
        if (newUser) {
          // Log the registration event
          try {
            await logRegistrationEvent({
              userId: newUser.id,
              email: userInfo.email || "",
              normalizedEmail: emailAnalysis?.normalized || "",
              ipAddress,
              fingerprintHash,
              userAgent: req.headers["user-agent"],
              loginMethod: userInfo.loginMethod ?? userInfo.platform ?? undefined,
              trustScore,
              outcome: trustOutcome,
            });
            if (fingerprintHash) {
              await recordDeviceFingerprint(newUser.id, fingerprintHash);
            }
          } catch (err) {
            console.error(`[OAuth] Failed to log registration event:`, err);
          }

          const freePlanResult = await ensureFreePlanForUser(newUser.id, {
            reason: "oauth_signup",
          });
          console.log(`[OAuth] Free plan assignment for user ${newUser.id}: ${freePlanResult.status}`);

          // Process invite code if provided
          if (inviteCodeId) {
            try {
              const usageResult = await processInviteCodeUsage(inviteCodeId, newUser.id);
              if (usageResult.success) {
                await giveInviteCodeBonuses(inviteCodeId, newUser.id);
                console.log(`[OAuth] Processed invite code ${inviteCodeId} for user ${newUser.id}`);
              } else {
                console.error(`[OAuth] Invite code ${inviteCodeId} was not consumed for user ${newUser.id}: ${usageResult.error || "unknown error"}`);
              }
            } catch (err) {
              console.error(`[OAuth] Failed to process invite code:`, err);
            }
          }

          // Track signup milestone (non-blocking, behind feature flag)
          if (ENABLE_FUNNEL_TRACKING) {
            trackSignupCompleted({
              tenantId: hostname,
              domain: hostname,
              userId: newUser.id,
              source: "oauth.callback",
              plan: "free",
              channel: userInfo.loginMethod ?? userInfo.platform ?? "oauth",
              attribution: { isFirstUser, trustScore },
            }).catch((err) => {
              console.warn("[Funnel] trackSignupCompleted failed:", err);
            });
          }
        }
      }

      // Clear invite code cookie regardless
      res.clearCookie("invite_code", { path: "/", secure: true, sameSite: "lax" });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
