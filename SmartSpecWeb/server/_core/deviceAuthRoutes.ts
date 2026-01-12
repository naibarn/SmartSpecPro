/**
 * Device Authorization Flow for Desktop App
 * 
 * Implements OAuth 2.0 Device Authorization Grant (RFC 8628)
 * Allows desktop apps to authenticate users via browser login
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import { authorizeRequest } from "./authz";
import { rateLimit } from "./limits";
import { getUserByOpenId, getDb } from "../db";
import { getCreditBalance, giveSignupBonus } from "../services/creditService";

// In-memory store for device codes (use Redis in production)
interface DeviceCodeEntry {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  interval: number;
  authorized: boolean;
  userId?: number;
  openId?: string;
  scopes: string[];
}

const deviceCodes = new Map<string, DeviceCodeEntry>();

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
  const secret = ENV.cookieSecret || "default-secret-change-me";
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
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      algorithms: ["HS256"],
    });

    if (payload.type !== "refresh") {
      return null;
    }

    return {
      userId: payload.userId as number,
      openId: payload.sub as string,
      scopes: payload.scopes as string[],
    };
  } catch {
    return null;
  }
}

/**
 * Clean up expired device codes
 */
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of deviceCodes.entries()) {
    if (entry.expiresAt < now) {
      deviceCodes.delete(code);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredCodes, 60 * 1000);

export function registerDeviceAuthRoutes(app: Express) {
  const codeLimiter = rateLimit("device_code", { rpm: 10 });
  const tokenLimiter = rateLimit("device_token", { rpm: 60 });
  const verifyLimiter = rateLimit("device_verify", { rpm: 30 });

  /**
   * Step 1: Desktop app requests a device code
   * POST /api/auth/device/code
   */
  app.post("/api/auth/device/code", codeLimiter, async (req: Request, res: Response) => {
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = Date.now() + DEVICE_CODE_EXPIRY;

    // Get requested scopes or use defaults
    const requestedScopes = Array.isArray(req.body?.scopes)
      ? req.body.scopes.map(String)
      : ["llm:chat", "mcp:read"];

    // Filter to allowed scopes
    const allowedScopes = new Set(["llm:chat", "mcp:read", "mcp:write"]);
    const scopes = requestedScopes.filter((s: string) => allowedScopes.has(s));

    // Store device code
    deviceCodes.set(deviceCode, {
      deviceCode,
      userCode,
      expiresAt,
      interval: POLLING_INTERVAL,
      authorized: false,
      scopes,
    });

    // Also index by user code for verification
    deviceCodes.set(userCode, deviceCodes.get(deviceCode)!);

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
   * GET /api/auth/device/verify?user_code=xxx
   * 
   * This returns info about the device code for the UI to display
   */
  app.get("/api/auth/device/verify", verifyLimiter, async (req: Request, res: Response) => {
    const userCode = String(req.query.user_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    
    if (!userCode || userCode.length !== 8) {
      res.status(400).json({ error: { message: "Invalid user code format" } });
      return;
    }

    // Format user code with dash
    const formattedCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;
    const entry = deviceCodes.get(formattedCode);

    if (!entry) {
      res.status(404).json({ error: { message: "User code not found or expired" } });
      return;
    }

    if (entry.expiresAt < Date.now()) {
      deviceCodes.delete(formattedCode);
      deviceCodes.delete(entry.deviceCode);
      res.status(410).json({ error: { message: "User code expired" } });
      return;
    }

    if (entry.authorized) {
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
      expires_in: Math.floor((entry.expiresAt - Date.now()) / 1000),
    });
  });

  /**
   * Step 2b: User authorizes the device (after login)
   * POST /api/auth/device/authorize
   * 
   * Requires session auth (user must be logged in)
   */
  app.post("/api/auth/device/authorize", verifyLimiter, async (req: Request, res: Response) => {
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
    const entry = deviceCodes.get(formattedCode);

    if (!entry) {
      res.status(404).json({ error: { message: "User code not found or expired" } });
      return;
    }

    if (entry.expiresAt < Date.now()) {
      deviceCodes.delete(formattedCode);
      deviceCodes.delete(entry.deviceCode);
      res.status(410).json({ error: { message: "User code expired" } });
      return;
    }

    // Mark as authorized with user info
    entry.authorized = true;
    entry.userId = auth.user.id;
    entry.openId = auth.user.openId;

    res.json({
      status: "authorized",
      message: "Device authorized successfully. You can close this window.",
    });
  });

  /**
   * Step 3: Desktop app polls for token
   * POST /api/auth/device/token
   */
  app.post("/api/auth/device/token", tokenLimiter, async (req: Request, res: Response) => {
    const grantType = req.body?.grant_type;
    
    // Handle refresh token grant
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

      // Get user info
      const user = await getUserByOpenId(tokenData.openId);
      if (!user) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "User not found",
        });
        return;
      }

      // Get credit balance
      const balance = await getCreditBalance(user.id);

      // Issue new tokens
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

    const entry = deviceCodes.get(deviceCode);
    if (!entry) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Device code not found",
      });
      return;
    }

    if (entry.expiresAt < Date.now()) {
      deviceCodes.delete(deviceCode);
      deviceCodes.delete(entry.userCode);
      res.status(400).json({
        error: "expired_token",
        error_description: "Device code has expired",
      });
      return;
    }

    if (!entry.authorized) {
      res.status(400).json({
        error: "authorization_pending",
        error_description: "User has not yet authorized this device",
      });
      return;
    }

    // Authorization successful - issue tokens
    if (!entry.userId || !entry.openId) {
      res.status(500).json({
        error: "server_error",
        error_description: "User info missing from authorization",
      });
      return;
    }

    // Get user info
    const user = await getUserByOpenId(entry.openId);
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

    // Clean up device code (single use)
    deviceCodes.delete(deviceCode);
    deviceCodes.delete(entry.userCode);

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
   * GET /api/auth/me
   */
  app.get("/api/auth/me", async (req: Request, res: Response) => {
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
