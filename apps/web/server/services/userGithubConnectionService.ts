import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings, userGithubConnections } from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";
import { encrypt, decrypt } from "./crypto";

export type GitHubMiniAppOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export async function getGitHubMiniAppOAuthConfig(): Promise<GitHubMiniAppOAuthConfig | null> {
  const values: Record<string, string> = {
    githubClientId: process.env.GITHUB_CLIENT_ID?.trim() ?? "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET?.trim() ?? "",
    githubMiniAppRedirectUri: process.env.GITHUB_MINIAPP_REDIRECT_URI?.trim() ?? "https://smartaihub.app/api/oauth/github/miniapp/callback",
  };
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select({ key: systemSettings.key, value: systemSettings.value, isSensitive: systemSettings.isSensitive })
        .from(systemSettings).where(eq(systemSettings.category, "oauth"));
      for (const row of rows) {
        if (!["githubClientId", "githubClientSecret", "githubMiniAppRedirectUri"].includes(row.key)) continue;
        const value = row.isSensitive && row.value ? decrypt(row.value) : row.value;
        if (value) values[row.key] = value.trim();
      }
    }
  } catch {
    // Environment configuration remains usable when settings storage is unavailable.
  }
  try {
    const uri = new URL(values.githubMiniAppRedirectUri);
    if (!values.githubClientId || !values.githubClientSecret || uri.protocol !== "https:" || uri.username || uri.password || uri.pathname !== "/api/oauth/github/miniapp/callback" || uri.search || uri.hash) return null;
  } catch { return null; }
  return { clientId: values.githubClientId, clientSecret: values.githubClientSecret, redirectUri: values.githubMiniAppRedirectUri };
}

async function verifyGitHubToken(token: string): Promise<string> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "GITHUB_TOKEN_INVALID" : "GITHUB_VALIDATION_FAILED");
  const payload = await response.json() as { login?: unknown };
  if (typeof payload.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(payload.login)) {
    throw new Error("GITHUB_ACCOUNT_INVALID");
  }
  return payload.login;
}

export async function connectUserGitHub(input: {
  userId: number;
  tenantId: string | null;
  token: string;
}) {
  const token = input.token.trim();
  if (token.length < 20 || token.length > 500 || /\s/.test(token)) throw new Error("GITHUB_TOKEN_INVALID");
  const githubLogin = await verifyGitHubToken(token);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_INITIALIZED");
  await db.insert(userGithubConnections).values({
    userId: input.userId,
    tenantId: input.tenantId,
    githubLogin,
    tokenEncrypted: encrypt(token),
  }).onConflictDoUpdate({
    target: userGithubConnections.userId,
    set: { tenantId: input.tenantId, githubLogin, tokenEncrypted: encrypt(token), updatedAt: new Date() },
  });
  auditLogger.log({
    eventType: "user_github_connection_set",
    userId: input.userId,
    endpoint: "userGithubConnectionService.connectUserGitHub",
    requestPayload: { tenantId: input.tenantId, githubLogin, connectionMethod: "oauth" },
  });
  return { githubLogin };
}

export async function getUserGitHubConnection(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_INITIALIZED");
  const [row] = await db.select({ githubLogin: userGithubConnections.githubLogin })
    .from(userGithubConnections).where(eq(userGithubConnections.userId, userId)).limit(1);
  return row ? { ...row, configured: true as const } : { githubLogin: null, configured: false as const };
}

export async function deleteUserGitHubConnection(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_INITIALIZED");
  await db.delete(userGithubConnections).where(eq(userGithubConnections.userId, userId));
  auditLogger.log({
    eventType: "user_github_connection_deleted",
    userId,
    endpoint: "userGithubConnectionService.deleteUserGitHubConnection",
    requestPayload: {},
  });
}

/** Internal worker-only access. Raw credentials never leave server code. */
export async function getUserGitHubToken(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_NOT_INITIALIZED");
  const [row] = await db.select({ tokenEncrypted: userGithubConnections.tokenEncrypted })
    .from(userGithubConnections).where(eq(userGithubConnections.userId, userId)).limit(1);
  return row ? decrypt(row.tokenEncrypted) : null;
}

export async function validateGitHubToken(token: string): Promise<string> {
  return verifyGitHubToken(token);
}
