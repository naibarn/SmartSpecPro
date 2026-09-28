/**
 * Device Authorization Flow for Desktop App
 * 
 * Implements OAuth 2.0 Device Authorization Grant (RFC 8628)
 * Allows desktop apps to authenticate users via browser login
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { SignJWT, jwtVerify, compactVerify } from "jose";
import { ENV } from "./env";
import { authorizeRequest } from "./authz";
import { rateLimit } from "./limits";
import { revokeJti } from "./revocation";
import {
  authorizeDeviceByUserCode,
  consumeDeviceAuthorization,
  findDeviceAuthorizationByDeviceCode,
  findDeviceAuthorizationByUserCode,
  issueDeviceAuthorization,
} from "../services/deviceAuthorizationStore";
import { getUserByOpenId, getDb } from "../db";
import { getCreditBalance } from "../services/creditService";
import { normalizeAuthEmail } from "../services/emailNormalization";
import {
  clearFailedLoginCounter,
  isAccountLocked,
  recordFailedLogin,
} from "../services/loginFailureCounterStore";

// Configuration
const DEVICE_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const POLLING_INTERVAL = 5; // seconds
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

// User code characters (no ambiguous chars: 0/O, 1/l/I)
const USER_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a random device code
 */
function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a user-friendly code (e.g., "ABCD-1234")
 */
function generateUserCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[crypto.randomInt(USER_CODE_CHARS.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Get JWT signing key
 */
function getSigningKey() {
  const secret = ENV.cookieSecret;
  if (!secret) {
    throw new Error("FATAL: JWT_SECRET (cookieSecret) not configured for device auth");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Mint an access token for desktop app
 */
async function mintAccessToken(params: {
  userId: number;
  openId: string;
  scopes: string[];
}): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_EXPIRY;

  const token = await new SignJWT({
    sub: params.openId,
    userId: params.userId,
    scopes: params.scopes,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(getSigningKey());

  return { token, expiresAt: exp * 1000 };
}

/**
 * Mint a refresh token for desktop app
 */
async function mintRefreshToken(params: {
  userId: number;
  openId: string;
  scopes: string[];
}): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + REFRESH_TOKEN_EXPIRY;

  const token = await new SignJWT({
    sub: params.openId,
    userId: params.userId,
    scopes: params.scopes,
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(getSigningKey());

  return { token, expiresAt: exp * 1000 };
}

/**
 * Verify a refresh token
 */
async function verifyRefreshToken(token: string): Promise<{
  userId: number;
  openId: string;
  scopes: string[];
  jti?: string;
  issuedAt?: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      algorithms: ["HS256"],
    });

    if (payload.type !== "refresh") {
      return null;
    }

    // Check if JTI has been revoked (rotation protection)
    const jti = payload.jti as string | undefined;
    if (jti) {
      const { isJtiRevoked } = await import("./revocation");
      if (await isJtiRevoked(jti)) {
        return null; // Token was already rotated/revoked
      }
    }

    return {
      userId: payload.userId as number,
      openId: payload.sub as string,
      scopes: payload.scopes as string[],
      jti,
      issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

async function revokeDesktopToken(token: string): Promise<boolean> {
  try {
    const { payload } = await compactVerify(token, getSigningKey());
    const claims = JSON.parse(Buffer.from(payload).toString("utf8")) as Record<string, unknown>;
    const tokenType = typeof claims.type === "string" ? claims.type.toLowerCase() : "";
    if (tokenType !== "access" && tokenType !== "refresh") {
      return false;
    }

    const jti = typeof claims.jti === "string" ? claims.jti.trim() : "";
    if (!jti) {
      return false;
    }

    const expiresAtMs = typeof claims.exp === "number" && Number.isFinite(claims.exp)
      ? Math.max(Date.now(), claims.exp * 1000)
      : Date.now();
    await revokeJti(jti, expiresAtMs);
    return true;
  } catch {
    return false;
  }
}

export function registerDeviceAuthRoutes(app: Express) {
  const codeLimiter = rateLimit("device_code", { rpm: 10 });
  const tokenLimiter = rateLimit("device_token", { rpm: 60 });
  const verifyLimiter = rateLimit("device_verify", { rpm: 30 });
  const loginLimiter = rateLimit("desktop_login", { rpm: 10 });

  /**
   * Desktop direct login — email/password → JWT tokens
   * POST /auth/desktop/login
   *
   * Same user database as SmartAIHubWeb, returns JWT (not cookie).
   */
  app.post("/auth/desktop/login", loginLimiter, async (req: Request, res: Response) => {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
      res.status(400).json({ error: { message: "Email and password are required" } });
      return;
    }

    const normalizedEmail = normalizeAuthEmail(email);

    try {
      // Account lockout check
      if (await isAccountLocked(normalizedEmail)) {
        res.status(429).json({ error: { message: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes." } });
        return;
      }

      const { getUserByEmail } = await import("../db");
      const bcrypt = await import("bcrypt");
      const argon2 = await import("argon2");

      const user = await getUserByEmail(normalizedEmail);
      if (!user) {
        await recordFailedLogin(normalizedEmail);
        res.status(401).json({ error: { message: "Invalid email or password" } });
        return;
      }

      // Verify password
      if (!user.password) {
        res.status(409).json({
          error: {
            message:
              "Desktop direct login is not available for Google or other social-login accounts. Use 'Sign in via browser' instead.",
          },
          requiresBrowserSignIn: true,
          reason: "social_login_requires_browser",
        });
        return;
      }

      // Support both argon2 and bcrypt password hashes
      let valid = false;
      if (user.password.startsWith("$argon2")) {
        valid = await argon2.verify(user.password, password);
      } else {
        valid = await bcrypt.compare(password, user.password);
      }
      if (!valid) {
        await recordFailedLogin(normalizedEmail);
        res.status(401).json({ error: { message: "Invalid email or password" } });
        return;
      }

      // Check if email is verified
      if (user.isDisabled && user.loginMethod === "email") {
        res.status(403).json({ error: { message: "Please verify your email before logging in" } });
        return;
      }

      // Check 2FA
      if (user.twoFactorEnabled) {
        res.status(409).json({
          error: {
            message:
              "Desktop direct login does not yet support 2FA verification. Use 'Sign in via browser' to complete sign-in.",
          },
          requiresBrowserSignIn: true,
          reason: "two_factor_requires_browser",
        });
        return;
      }

      // Clear failed login counter on success
      await clearFailedLoginCounter(normalizedEmail);

      // Issue JWT tokens (same as device flow)
      const scopes = ["llm:chat", "mcp:read"];
      const balance = await getCreditBalance(user.id);

      const accessToken = await mintAccessToken({
        userId: user.id,
        openId: user.openId,
        scopes,
      });

      const refreshToken = await mintRefreshToken({
        userId: user.id,
        openId: user.openId,
        scopes,
      });

      res.json({
        access_token: accessToken.token,
        refresh_token: refreshToken.token,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_EXPIRY,
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
          credits: balance?.credits ?? 0,
          plan: balance?.plan ?? "free",
        },
      });
    } catch (err) {
      console.error("[Desktop Login] Error:", err);
      res.status(500).json({ error: { message: "Internal server error" } });
    }
  });

  /**
   * Revoke desktop access/refresh tokens during logout.
   * This is best-effort and idempotent: the client clears local state regardless.
   */
  app.post("/auth/device/revoke", tokenLimiter, async (req: Request, res: Response) => {
    const accessToken = typeof req.body?.access_token === "string" ? req.body.access_token.trim() : "";
    const refreshToken = typeof req.body?.refresh_token === "string" ? req.body.refresh_token.trim() : "";

    if (!accessToken && !refreshToken) {
      res.status(400).json({
        error: { message: "access_token or refresh_token is required" },
      });
      return;
    }

    const revoked = {
      access_token: false,
      refresh_token: false,
    };

    if (accessToken) {
      revoked.access_token = await revokeDesktopToken(accessToken);
    }
    if (refreshToken) {
      revoked.refresh_token = await revokeDesktopToken(refreshToken);
    }

    if (!revoked.access_token && !revoked.refresh_token) {
      res.status(400).json({
        error: { message: "Invalid desktop token" },
      });
      return;
    }

    res.json({
      success: true,
      revoked,
    });
  });

  /**
   * Step 1: Desktop app requests a device code
   * POST /auth/device/code
   */
  app.post("/auth/device/code", codeLimiter, async (req: Request, res: Response) => {
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = Date.now() + DEVICE_CODE_EXPIRY;

    // Get requested scopes or use defaults
    const requestedScopes = Array.isArray(req.body?.scopes)
      ? req.body.scopes.map(String)
      : ["llm:chat", "mcp:read"];

    // Filter to allowed scopes
    const allowedScopes = new Set([
      "llm:chat",
      "mcp:read",
      "mcp:write",
      "hermes:connect",
      "hermes:read",
      "hermes:write",
      "hermes:disconnect",
      "hermes:generate",
      "remotion:submit",
      "remotion:read",
      "remotion:cancel",
      "library:read",
      "library:download",
      "media:read",
      "media:download",
    ]);
    const scopes = requestedScopes.filter((s: string) => allowedScopes.has(s));

    await issueDeviceAuthorization({
      deviceCode,
      userCode,
      scopes,
      intervalSeconds: POLLING_INTERVAL,
      expiresAt: new Date(expiresAt),
    });

    // Build verification URI
    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const verificationUri = `${protocol}://${host}/auth/device`;

    res.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${userCode}`,
      expires_in: Math.floor(DEVICE_CODE_EXPIRY / 1000),
      interval: POLLING_INTERVAL,
    });
  });

  /**
   * Step 2: User verifies the device code (browser)
   * GET /auth/device/verify?user_code=xxx
   * 
   * This returns info about the device code for the UI to display
   */
  app.get("/auth/device/verify", verifyLimiter, async (req: Request, res: Response) => {
    const userCode = String(req.query.user_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    
    if (!userCode || userCode.length !== 8) {
      res.status(400).json({ error: { message: "Invalid user code format" } });
      return;
    }

    // Format user code with dash
    const formattedCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;
    const entry = await findDeviceAuthorizationByUserCode(formattedCode);

    if (!entry) {
      res.status(404).json({ error: { message: "User code not found or expired" } });
      return;
    }

    if (entry.expiresAt.getTime() <= Date.now()) {
      res.status(410).json({ error: { message: "User code expired" } });
      return;
    }

    if (entry.status === "authorized" || entry.status === "consumed") {
      res.json({
        status: "authorized",
        message: "This device has already been authorized",
      });
      return;
    }

    res.json({
      status: "pending",
      user_code: formattedCode,
      scopes: entry.scopes,
      expires_in: Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000),
    });
  });

  /**
   * Step 2b: User authorizes the device (after login)
   * POST /auth/device/authorize
   *
   * Requires session auth (user must be logged in)
   */
  app.post("/auth/device/authorize", verifyLimiter, async (req: Request, res: Response) => {
    // Require session auth
    const auth = await authorizeRequest(req, { allowBearer: false, allowSession: true });
    if (!auth.ok || !("user" in auth) || !auth.user) {
      res.status(401).json({ error: { message: "Please log in first" } });
      return;
    }

    const userCode = String(req.body?.user_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (!userCode || userCode.length !== 8) {
      res.status(400).json({ error: { message: "Invalid user code format" } });
      return;
    }

    // Format user code with dash
    const formattedCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;
    const authorizationStatus = await authorizeDeviceByUserCode({
      userCode: formattedCode,
      userId: auth.user.id,
      openId: auth.user.openId,
    });

    if (authorizationStatus === "not_found") {
      res.status(404).json({ error: { message: "User code not found or expired" } });
      return;
    }

    if (authorizationStatus === "expired") {
      res.status(410).json({ error: { message: "User code expired" } });
      return;
    }

    if (authorizationStatus === "consumed") {
      res.status(409).json({ error: { message: "This device authorization has already been used" } });
      return;
    }

    res.json({
      status: "authorized",
      message: "Device authorized successfully. You can close this window.",
    });
  });

  /**
   * Step 3: Desktop app polls for token
   * POST /auth/device/token
   */
  app.post("/auth/device/token", tokenLimiter, async (req: Request, res: Response) => {
    const grantType = req.body?.grant_type;
    
    // Handle refresh token grant (with rotation — old token revoked)
    if (grantType === "refresh_token") {
      const refreshToken = req.body?.refresh_token;
      if (!refreshToken) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "Missing refresh_token",
        });
        return;
      }

      const tokenData = await verifyRefreshToken(refreshToken);
      if (!tokenData) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired refresh token",
        });
        return;
      }

      // Revoke the old refresh token JTI to prevent reuse
      if (tokenData.jti) {
        await revokeJti(tokenData.jti, Date.now() + REFRESH_TOKEN_EXPIRY * 1000);
      }

      // Get user info
      const user = await getUserByOpenId(tokenData.openId);
      if (!user) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "User not found",
        });
        return;
      }

      if (
        user.sessionRevokedAt
        && (!tokenData.issuedAt || tokenData.issuedAt * 1000 <= user.sessionRevokedAt.getTime())
      ) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "Refresh token revoked",
        });
        return;
      }

      // Get credit balance
      const balance = await getCreditBalance(user.id);

      // Issue new tokens (rotation: new refresh token replaces old)
      const accessToken = await mintAccessToken({
        userId: user.id,
        openId: user.openId,
        scopes: tokenData.scopes,
      });

      const newRefreshToken = await mintRefreshToken({
        userId: user.id,
        openId: user.openId,
        scopes: tokenData.scopes,
      });

      res.json({
        access_token: accessToken.token,
        refresh_token: newRefreshToken.token,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_EXPIRY,
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          credits: balance?.credits ?? 0,
          plan: balance?.plan ?? "free",
        },
      });
      return;
    }

    // Handle device code grant
    if (grantType !== "urn:ietf:params:oauth:grant-type:device_code") {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Use grant_type=urn:ietf:params:oauth:grant-type:device_code",
      });
      return;
    }

    const deviceCode = req.body?.device_code;
    if (!deviceCode) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Missing device_code",
      });
      return;
    }

    const entry = await findDeviceAuthorizationByDeviceCode(deviceCode);
    if (!entry) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Device code not found",
      });
      return;
    }

    if (entry.expiresAt.getTime() <= Date.now()) {
      res.status(400).json({
        error: "expired_token",
        error_description: "Device code has expired",
      });
      return;
    }

    if (entry.status === "pending") {
      res.status(400).json({
        error: "authorization_pending",
        error_description: "User has not yet authorized this device",
      });
      return;
    }

    // Authorization successful - issue tokens
    if (entry.status === "consumed") {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Device authorization code has already been consumed",
      });
      return;
    }

    if (!entry.authorizedUserId || !entry.authorizedOpenId) {
      res.status(500).json({
        error: "server_error",
        error_description: "User info missing from authorization",
      });
      return;
    }

    // Get user info
    const user = await getUserByOpenId(entry.authorizedOpenId);
    if (!user) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "User not found",
      });
      return;
    }

    // Get credit balance
    const balance = await getCreditBalance(user.id);

    // Issue tokens
    const accessToken = await mintAccessToken({
      userId: user.id,
      openId: user.openId,
      scopes: entry.scopes,
    });

    const refreshToken = await mintRefreshToken({
      userId: user.id,
      openId: user.openId,
      scopes: entry.scopes,
    });

    // Atomically consume only after all token prerequisites succeed. Concurrent
    // pollers may prepare tokens, but exactly one can receive them.
    const consumed = await consumeDeviceAuthorization(deviceCode);
    if (consumed.status !== "authorized") {
      res.status(400).json({
        error: consumed.status === "expired" ? "expired_token" : "invalid_grant",
        error_description: "Device authorization code is expired or has already been consumed",
      });
      return;
    }

    res.json({
      access_token: accessToken.token,
      refresh_token: refreshToken.token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_EXPIRY,
      user: {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        credits: balance?.credits ?? 0,
        plan: balance?.plan ?? "free",
      },
    });
  });

  /**
   * Get current user info (for desktop app)
   * GET /auth/me
   */
  const meLimiter = rateLimit("auth_me", { rpm: 60 });
  app.get("/auth/me", meLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    
    if (!auth.ok) {
      res.status(401).json({ error: { message: "Unauthorized" } });
      return;
    }

    let user;
    if (auth.mode === "session" && auth.user) {
      user = auth.user;
    } else if (auth.mode === "bearer" && auth.sub && auth.sub !== "static") {
      user = await getUserByOpenId(auth.sub);
    }

    if (!user) {
      res.status(404).json({ error: { message: "User not found" } });
      return;
    }

    const balance = await getCreditBalance(user.id);

    res.json({
      id: user.id,
      openId: user.openId,
      name: user.name,
      email: user.email,
      role: user.role,
      credits: balance?.credits ?? 0,
      plan: balance?.plan ?? "free",
    });
  });
}
