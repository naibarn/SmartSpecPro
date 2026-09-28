import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { decrypt } from "./crypto";
import { systemSettings } from "../../drizzle/schema";

const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function isAllowedGoogleRedirectUri(value: string): boolean {
  try {
    const uri = new URL(value);
    const localHttpHost = ["localhost", "127.0.0.1", "[::1]"].includes(
      uri.hostname
    );
    return (
      (uri.protocol === "https:" ||
        (uri.protocol === "http:" && localHttpHost)) &&
      uri.pathname === "/auth/callback/google" &&
      !uri.search &&
      !uri.hash &&
      !uri.username &&
      !uri.password
    );
  } catch {
    return false;
  }
}

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleProfile = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

export function createOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

export function buildGoogleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function getGoogleOAuthConfig(
  db?: DrizzleDB
): Promise<GoogleOAuthConfig | null> {
  const values: Record<string, string> = {
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI?.trim() ??
      "https://smartaihub.app/auth/callback/google",
  };

  try {
    const database = db ?? (await getDb());
    const rows = await database
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        isSensitive: systemSettings.isSensitive,
      })
      .from(systemSettings)
      .where(eq(systemSettings.category, "oauth"));

    for (const row of rows) {
      if (
        !["googleClientId", "googleClientSecret", "googleRedirectUri"].includes(
          row.key
        )
      )
        continue;
      const value =
        row.isSensitive && row.value ? decrypt(row.value) : row.value;
      if (value) values[row.key] = value.trim();
    }
  } catch {
    // Environment configuration is a supported fallback when the DB is down.
  }

  if (
    !values.googleClientId ||
    !values.googleClientSecret ||
    !values.googleRedirectUri ||
    !isAllowedGoogleRedirectUri(values.googleRedirectUri)
  ) {
    return null;
  }

  return {
    clientId: values.googleClientId,
    clientSecret: values.googleClientSecret,
    redirectUri: values.googleRedirectUri,
  };
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string
): Promise<GoogleProfile> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Google authorization code could not be exchanged");
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
  };
  if (!tokenPayload.access_token) {
    throw new Error("Google authorization did not return an access token");
  }

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenPayload.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new Error("Google profile could not be verified");
  }

  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google account does not have a verified email");
  }

  return {
    subject: profile.sub,
    email: profile.email,
    emailVerified: true,
    name: profile.name,
    picture: profile.picture,
  };
}
