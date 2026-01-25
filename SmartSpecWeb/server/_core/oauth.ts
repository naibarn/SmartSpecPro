import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { giveSignupBonus } from "../services/creditService";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

// Credits for first user (admin) vs normal users
const FIRST_USER_BONUS_CREDITS = 10000; // 10,000 credits for first user (admin)
const NORMAL_USER_BONUS_CREDITS = 100;  // 100 credits for normal users

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

      // Check if this is the first user in the system (will become admin)
      let isFirstUser = false;
      if (isNewUser) {
        const userCount = await db.getUserCount();
        isFirstUser = userCount === 0;
        if (isFirstUser) {
          console.log(`[OAuth] First user detected! Will grant admin privileges.`);
        }
      }

      // Get hostname for registeredDomain
      const hostname = req.hostname || req.get("host")?.split(":")[0] || "localhost";

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
        // Only set registeredDomain for new users (will be ignored on update)
        registeredDomain: isNewUser ? hostname : undefined,
        // Grant admin role to first user
        role: isFirstUser ? 'admin' : undefined,
      });

      // Give signup bonus to new users
      if (isNewUser) {
        const newUser = await db.getUserByOpenId(userInfo.openId);
        if (newUser) {
          try {
            // First user (admin) gets more credits
            const bonusCredits = isFirstUser ? FIRST_USER_BONUS_CREDITS : NORMAL_USER_BONUS_CREDITS;
            await giveSignupBonus(newUser.id, bonusCredits);
            console.log(`[OAuth] Gave signup bonus (${bonusCredits} credits) to new user: ${newUser.id}${isFirstUser ? ' (ADMIN)' : ''}`);
          } catch (err) {
            console.error(`[OAuth] Failed to give signup bonus:`, err);
          }
        }
      }

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
