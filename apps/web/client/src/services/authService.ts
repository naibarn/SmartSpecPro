/**
 * Authentication Service
 * Handles token validation, auto-logout, and auth state
 *
 * Browser context uses the httpOnly session cookie.
 * Tauri context stores desktop access/refresh tokens in the native secure store.
 */

import { getSmartSpecWebEndpoint, hasTauriRuntime } from "@/lib/webRuntime";
import { clearProtectedSurfaceAccessToken } from "@/lib/protectedSurface";

function hasTauri(): boolean {
  return hasTauriRuntime();
}

async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
}

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
}

type AuthUserPayload = {
  id?: string | number | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

type DesktopTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: AuthUserPayload | null;
  error?: string | { message?: string };
  error_description?: string;
};

type AuthCheckResult = {
  ok: boolean;
  status: number;
  user: AuthUserPayload | null;
};

const BASE_URL = import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartaihub.app";
const BASE_URL_HOST = (() => {
  try {
    return new URL(BASE_URL).hostname;
  } catch {
    return "smartaihub.app";
  }
})();

function getRequestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  if (input instanceof URL) return input.href;
  return input.toString();
}

function isInternalSmartAiHubUrl(url: string): boolean {
  if (url.startsWith("/")) return true;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.origin === new URL(BASE_URL).origin ||
      host === BASE_URL_HOST ||
      host.endsWith(`.${BASE_URL_HOST}`) ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function shouldSkipAuthInjection(url: string): boolean {
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/desktop/login") ||
    url.includes("/auth/device/code") ||
    url.includes("/auth/device/token") ||
    url.includes("/auth/device/revoke") ||
    url.includes("/auth/device/verify") ||
    url.includes("/auth/device/authorize")
  );
}

function shouldSkipAuthLogout(url: string): boolean {
  return (
    shouldSkipAuthInjection(url) ||
    url.includes("/trpc/auth.logout")
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch (error) {
    console.error("Failed to decode token:", error);
    return null;
  }
}

function isJwtExpiredOrNearExpiry(token: string): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp === "number") {
    return Date.now() / 1000 > exp - 300;
  }
  return false;
}

function toStoredUser(user: AuthUserPayload): User {
  const email = user.email ?? "";
  return {
    id: String(user.id ?? email),
    email,
    full_name: user.name ?? email.split("@")[0] ?? "",
    is_admin: user.role === "admin" || user.role === "system_agent",
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function extractTrpcUser(payload: any): AuthUserPayload | null {
  const user = payload?.result?.data?.json;
  return user && user.id != null ? user : null;
}

function withAuthorizationHeader(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string,
): [RequestInfo | URL, RequestInit | undefined] {
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const nextInit = {
    ...(init || {}),
    headers,
  };

  if (input instanceof Request) {
    return [new Request(input, nextInit), undefined];
  }

  return [input, nextInit];
}

// Cache for user data to avoid repeated secure store calls
let cachedUser: User | null = null;
let cachedToken: string | null = null;
let cachedRefreshToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let refreshOperationActive = false;
let originalFetch: typeof window.fetch | null = null;

function clearDesktopAuthCache(): void {
  cachedToken = null;
  cachedRefreshToken = null;
  cachedUser = null;
}

async function revokeDesktopAuthSession(fetchImpl: typeof fetch = window.fetch.bind(window)): Promise<void> {
  if (!hasTauri()) return;

  const [accessToken, refreshToken] = await Promise.all([
    getAuthToken(),
    getAuthRefreshToken(),
  ]);

  if (!accessToken && !refreshToken) {
    return;
  }

  try {
    const response = await fetchImpl(getSmartSpecWebEndpoint("/auth/device/revoke"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(accessToken ? { access_token: accessToken } : {}),
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
      }),
      credentials: "omit",
    });

    if (!response || !response.ok) {
      return;
    }
  } catch (error) {
    console.warn("Failed to revoke desktop auth session:", error);
  }
}

/**
 * Get stored auth token from secure store.
 * Browser context: returns null (httpOnly cookie handles auth automatically).
 * Tauri context: reads from native secure store.
 */
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  try {
    if (hasTauri()) {
      const token = await safeInvoke<string | null>("get_auth_token");
      cachedToken = token;
      return token;
    }
  } catch { /* fallback */ }

  // Browser: httpOnly cookie handles auth. No client-side token needed.
  return null;
}

/**
 * Get stored auth token synchronously (uses cache)
 */
export function getAuthTokenSync(): string | null {
  return cachedToken;
}

/**
 * Set auth token in secure store.
 * Browser context: no-op (server sets httpOnly cookie via Set-Cookie header).
 * Tauri context: writes to native secure store.
 */
export async function setAuthToken(token: string): Promise<void> {
  try {
    if (hasTauri()) {
      cachedToken = token;
      await safeInvoke("set_auth_token", { token });
      return;
    }
  } catch { /* fallback */ }

  // Browser: no-op. Server sets httpOnly cookie via Set-Cookie header.
}

/**
 * Get stored desktop refresh token from secure store.
 */
export async function getAuthRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken) return cachedRefreshToken;

  try {
    if (hasTauri()) {
      const token = await safeInvoke<string | null>("get_auth_refresh_token");
      cachedRefreshToken = token;
      return token;
    }
  } catch { /* fallback */ }

  return null;
}

/**
 * Set desktop refresh token in secure store.
 */
export async function setAuthRefreshToken(refreshToken: string): Promise<void> {
  try {
    if (hasTauri()) {
      cachedRefreshToken = refreshToken;
      await safeInvoke("set_auth_refresh_token", { refreshToken });
    }
  } catch { /* fallback */ }
}

/**
 * Get stored user info.
 * Browser context: uses in-memory cache only (populated by verifyToken).
 * Tauri context: reads from native secure store.
 */
export async function getUser(): Promise<User | null> {
  if (cachedUser) return cachedUser;

  try {
    if (hasTauri()) {
      const userJson = await safeInvoke<string | null>("get_user_data");
      if (!userJson) return null;
      cachedUser = JSON.parse(userJson);
      return cachedUser;
    }
  } catch { /* fallback */ }

  // Browser: rely on in-memory cache (set by verifyToken/setUser).
  // Do NOT read from localStorage to avoid exposing is_admin to XSS.
  return null;
}

/**
 * Get stored user info synchronously (uses cache)
 */
export function getUserSync(): User | null {
  return cachedUser;
}

/**
 * Set user data.
 * Browser context: in-memory cache only (no localStorage — avoids XSS exposure of is_admin).
 * Tauri context: writes to native secure store.
 */
export async function setUser(user: User): Promise<void> {
  cachedUser = user;
  try {
    if (hasTauri()) {
      await safeInvoke("set_user_data", { userJson: JSON.stringify(user) });
      return;
    }
  } catch { /* fallback */ }

  // Browser: in-memory only. verifyToken() refreshes this on page load.
}

async function persistDesktopTokenPayload(payload: DesktopTokenResponse): Promise<boolean> {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id) {
    return false;
  }

  await setAuthToken(payload.access_token);
  await setAuthRefreshToken(payload.refresh_token);
  await setUser(toStoredUser(payload.user));
  return true;
}

async function refreshDesktopAuthSession(fetchImpl: typeof fetch = window.fetch.bind(window)): Promise<boolean> {
  if (!hasTauri()) return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      refreshOperationActive = true;

      const refreshToken = await getAuthRefreshToken();
      if (!refreshToken) {
        const storedUser = await getUser().catch(() => null);
        if (cachedToken || cachedRefreshToken || cachedUser || storedUser) {
          await logout();
        }
        return false;
      }

      const response = await fetchImpl(getSmartSpecWebEndpoint("/auth/device/token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        credentials: "omit",
      }) as Response | undefined;

      if (!response) {
        return false;
      }

      const payload = await parseJsonResponse<DesktopTokenResponse>(response);
      if (!response.ok || !payload) {
        const error = typeof payload?.error === "string"
          ? payload.error
          : payload?.error?.message;
        if (response.status === 400 && error === "invalid_grant") {
          await logout();
        }
        return false;
      }
      return persistDesktopTokenPayload(payload);
    } catch (error) {
      console.error("Failed to refresh desktop auth token:", error);
      return false;
    } finally {
      refreshOperationActive = false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function getFreshDesktopAuthToken(fetchImpl: typeof fetch = window.fetch.bind(window)): Promise<string | null> {
  let token = await getAuthToken();
  if (!token || isJwtExpiredOrNearExpiry(token)) {
    const refreshed = await refreshDesktopAuthSession(fetchImpl);
    if (refreshed) {
      token = await getAuthToken();
    }
  }
  return token;
}

async function fetchDesktopAuthMe(fetchImpl: typeof fetch = window.fetch.bind(window)): Promise<AuthCheckResult> {
  const token = await getFreshDesktopAuthToken(fetchImpl);
  if (!token) {
    return { ok: false, status: 0, user: null };
  }

  const request = async () => {
    const response = await fetchImpl(getSmartSpecWebEndpoint("/auth/me"), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
    });
    const user = response.ok ? await parseJsonResponse<AuthUserPayload>(response) : null;
    return {
      response,
      user: user && user.id != null ? user : null,
    };
  };

  let { response, user } = await request();
  if ((response.status === 401 || response.status === 403) && await refreshDesktopAuthSession(fetchImpl)) {
    const retryToken = await getAuthToken();
    if (retryToken) {
      const retryResponse = await fetchImpl(getSmartSpecWebEndpoint("/auth/me"), {
        method: "GET",
        headers: { Authorization: `Bearer ${retryToken}` },
        credentials: "omit",
      });
      response = retryResponse;
      user = retryResponse.ok ? await parseJsonResponse<AuthUserPayload>(retryResponse) : null;
    }
  }

  return {
    ok: response.ok && user?.id != null,
    status: response.status,
    user,
  };
}

async function fetchBrowserAuthMe(fetchImpl: typeof fetch = window.fetch.bind(window)): Promise<AuthCheckResult> {
  const response = await fetchImpl(getSmartSpecWebEndpoint("/trpc/auth.me"), {
    method: "GET",
    credentials: "include",
  });
  const payload = response.ok ? await parseJsonResponse<any>(response) : null;
  const user = response.ok ? extractTrpcUser(payload) : null;
  return {
    ok: response.ok && user?.id != null,
    status: response.status,
    user,
  };
}

/**
 * Check if token is expired.
 * Browser context: server ping (cannot decode httpOnly cookie).
 * Tauri context: decodes JWT and refreshes with the secure refresh token when needed.
 */
export async function isTokenExpired(): Promise<boolean> {
  if (hasTauri()) {
    const token = await getAuthToken();
    if (!token) {
      return !(await refreshDesktopAuthSession());
    }
    if (!isJwtExpiredOrNearExpiry(token)) {
      return false;
    }
    return !(await refreshDesktopAuthSession());
  }

  // Browser: server ping to check session validity
  try {
    const result = await fetchBrowserAuthMe();
    return !result.ok;
  } catch {
    return true; // Network error = treat as expired
  }
}

/**
 * Logout user - clear all credentials
 */
export async function logout(navigate?: (path: string) => void): Promise<void> {
  try {
    if (hasTauri()) {
      if (refreshInFlight && !refreshOperationActive) {
        await refreshInFlight.catch(() => false);
      }
      await revokeDesktopAuthSession(originalFetch ?? window.fetch.bind(window));
      await safeInvoke("clear_all_credentials");
    }
  } catch { /* ignore */ }

  // Clear localStorage fallback keys
  localStorage.removeItem("smartspec_auth_token");
  localStorage.removeItem("smartspec_user_data");
  localStorage.removeItem("smartspec_web_refresh_token");
  localStorage.removeItem("smartspec_web_token_expiry");
  localStorage.removeItem("smartspec_web_user");
  clearProtectedSurfaceAccessToken();

  clearDesktopAuthCache();
  refreshOperationActive = false;

  if (navigate) {
    navigate("/login");
  } else {
    window.location.href = "/login";
  }
}

/**
 * Verify token with backend.
 * Browser context: uses credentials:'include' (httpOnly cookie).
 * Tauri context: sends Bearer token header and refreshes if necessary.
 */
export async function verifyToken(): Promise<boolean> {
  try {
    const result = hasTauri()
      ? await fetchDesktopAuthMe()
      : await fetchBrowserAuthMe();

    if (result.ok && result.user) {
      await setUser(toStoredUser(result.user));
      return true;
    }

    if (result.status === 401 || (hasTauri() && result.status === 404)) {
      await logout();
    }

    return false;
  } catch (error) {
    console.error("Failed to verify token:", error);
    return false;
  }
}

/**
 * Setup auth interceptor for fetch requests
 */
export function setupAuthInterceptor() {
  if ((window as unknown as { __authInterceptorSetup?: boolean }).__authInterceptorSetup) {
    return;
  }
  (window as unknown as { __authInterceptorSetup?: boolean }).__authInterceptorSetup = true;

  originalFetch = window.fetch;

  async function hasValidAuthSession(): Promise<boolean> {
    const fetchImpl = originalFetch ?? window.fetch.bind(window);

    try {
      const result = hasTauri()
        ? await fetchDesktopAuthMe(fetchImpl)
        : await fetchBrowserAuthMe(fetchImpl);
      return result.ok;
    } catch {
      return false;
    }
  }

  window.fetch = async (...args) => {
    const [input, init] = args;
    const requestUrl = getRequestUrl(input);
    const fetchImpl = originalFetch ?? window.fetch.bind(window);

    let finalInput = input;
    let finalInit = init;
    const shouldAttachDesktopAuth =
      hasTauri() &&
      isInternalSmartAiHubUrl(requestUrl) &&
      !shouldSkipAuthInjection(requestUrl);

    if (shouldAttachDesktopAuth) {
      const token = await getFreshDesktopAuthToken(fetchImpl);
      if (token) {
        [finalInput, finalInit] = withAuthorizationHeader(input, init, token);
      }
    }

    let response = await fetchImpl(finalInput as RequestInfo | URL, finalInit);

    if (shouldAttachDesktopAuth && response.status === 401 && await refreshDesktopAuthSession(fetchImpl)) {
      const retryToken = await getAuthToken();
      if (retryToken) {
        const [retryInput, retryInit] = withAuthorizationHeader(input, init, retryToken);
        response = await fetchImpl(retryInput as RequestInfo | URL, retryInit);
      }
    }

    if (response.status === 401 || response.status === 403) {
      const url = requestUrl;

      if (!shouldSkipAuthLogout(url)) {
        const onLoginPage = window.location.pathname === "/login";
        if (!onLoginPage) {
          // Tenant-scoped and desktop-host routes can legitimately return 403 when
          // the user is signed in but lacks a feature/tenant entitlement.
          // Only force a sign-out when we can confirm the auth session itself is gone.
          const sessionAlive = await hasValidAuthSession();
          if (!sessionAlive) {
            console.warn("Auth error detected, logging out...");
            await logout();
          }
        }
      }
    }

    return response;
  };
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getUser();
  return user?.is_admin === true;
}

/**
 * Check if authenticated.
 * Browser context: server ping (httpOnly cookie sent automatically).
 * Tauri context: verifies the secure-store token against the server.
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const result = hasTauri()
      ? await fetchDesktopAuthMe()
      : await fetchBrowserAuthMe();
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Initialize auth on app start.
 */
export async function initializeAuth(): Promise<void> {
  setupAuthInterceptor();
  await verifyToken();
}

export async function openExternalAuthUrl(url: string): Promise<void> {
  if (hasTauri()) {
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(url);
      return;
    } catch (error) {
      console.warn("Tauri opener failed, falling back to window.open:", error);
    }
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function signInDesktopWithBrowser(options: {
  onUserCode?: (userCode: string) => void;
  openUrl?: (url: string) => Promise<void> | void;
  fetchImpl?: typeof fetch;
} = {}): Promise<User> {
  if (!hasTauri()) {
    throw new Error("Desktop browser sign-in is only available in the Tauri app.");
  }

  const fetchImpl = options.fetchImpl ?? window.fetch.bind(window);
  const codeResponse = await fetchImpl(getSmartSpecWebEndpoint("/auth/device/code"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes: ["llm:chat", "mcp:read", "mcp:write"] }),
    credentials: "omit",
  });
  const codePayload = await parseJsonResponse<{
    device_code?: string;
    user_code?: string;
    verification_uri_complete?: string;
    verification_uri?: string;
    interval?: number;
    expires_in?: number;
  }>(codeResponse);

  if (!codeResponse.ok || !codePayload?.device_code) {
    throw new Error("Unable to start desktop browser sign-in.");
  }

  const verificationUrl = codePayload.verification_uri_complete ?? codePayload.verification_uri;
  if (!verificationUrl) {
    throw new Error("Desktop browser sign-in did not return a verification URL.");
  }

  if (codePayload.user_code) {
    options.onUserCode?.(codePayload.user_code);
  }

  await (options.openUrl ?? openExternalAuthUrl)(verificationUrl);

  const expiresAt = Date.now() + (Math.max(1, codePayload.expires_in ?? 600) * 1000);
  let intervalMs = Math.max(1, codePayload.interval ?? 5) * 1000;

  while (Date.now() < expiresAt) {
    await sleep(intervalMs);

    const tokenResponse = await fetchImpl(getSmartSpecWebEndpoint("/auth/device/token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: codePayload.device_code,
      }),
      credentials: "omit",
    });
    const tokenPayload = await parseJsonResponse<DesktopTokenResponse>(tokenResponse);

    if (tokenResponse.ok && tokenPayload && await persistDesktopTokenPayload(tokenPayload)) {
      return toStoredUser(tokenPayload.user!);
    }

    const error = typeof tokenPayload?.error === "string"
      ? tokenPayload.error
      : tokenPayload?.error?.message;
    if (error === "authorization_pending") {
      continue;
    }
    if (error === "slow_down") {
      intervalMs += 5_000;
      continue;
    }
    if (error === "expired_token") {
      break;
    }

    throw new Error(tokenPayload?.error_description || error || "Desktop browser sign-in failed.");
  }

  throw new Error("Desktop browser sign-in expired before authorization completed.");
}
