/**
 * Web Authentication Service
 * 
 * Handles OAuth Device Flow authentication with SmartSpecWeb
 * for credit-based LLM access
 */

import { setProxyToken, getProxyToken, loadProxyToken } from "./authStore";

// SmartSpecWeb URL (configurable via env)
const WEB_URL = import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartspec.example.com";

// Token storage keys
const REFRESH_TOKEN_KEY = "smartspec_web_refresh_token";
const USER_INFO_KEY = "smartspec_web_user";
const TOKEN_EXPIRY_KEY = "smartspec_web_token_expiry";

export interface WebUser {
  id: number;
  openId: string;
  name: string;
  email: string;
  credits: number;
  plan: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: WebUser;
}

export interface DeviceAuthError {
  error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | "invalid_grant";
  error_description?: string;
}

/**
 * Check if response is an error
 */
function isAuthError(data: any): data is DeviceAuthError {
  return typeof data?.error === "string";
}

/**
 * Start device authorization flow
 * Returns device code and user code for display
 */
export async function initiateDeviceAuth(scopes?: string[]): Promise<DeviceCodeResponse> {
  const response = await fetch(`${WEB_URL}/api/auth/device/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scopes: scopes || ["llm:chat", "mcp:read"],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Failed to initiate device auth: ${response.status}`);
  }

  return response.json();
}

/**
 * Poll for token after user authorizes
 * Returns null if still pending, throws on error
 */
export async function pollForToken(deviceCode: string): Promise<TokenResponse | null> {
  const response = await fetch(`${WEB_URL}/api/auth/device/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
    }),
  });

  const data = await response.json();

  if (isAuthError(data)) {
    if (data.error === "authorization_pending") {
      return null; // Keep polling
    }
    if (data.error === "slow_down") {
      // Increase polling interval
      return null;
    }
    throw new Error(data.error_description || data.error);
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `Token request failed: ${response.status}`);
  }

  // Store tokens
  await storeTokens(data);

  return data;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<TokenResponse | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${WEB_URL}/api/auth/device/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      // Refresh token invalid/expired - clear tokens
      await clearTokens();
      return null;
    }

    const data = await response.json();
    await storeTokens(data);
    return data;
  } catch (error) {
    console.error("[WebAuth] Failed to refresh token:", error);
    return null;
  }
}

/**
 * Get current user info from server
 */
export async function getCurrentUser(): Promise<WebUser | null> {
  const token = getProxyToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${WEB_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Try to refresh token
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return refreshed.user;
        }
      }
      return null;
    }

    const user = await response.json();
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    return user;
  } catch (error) {
    console.error("[WebAuth] Failed to get user:", error);
    return null;
  }
}

/**
 * Get cached user info
 */
export function getCachedUser(): WebUser | null {
  try {
    const userStr = localStorage.getItem(USER_INFO_KEY);
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

/**
 * Get credit balance
 */
export async function getCreditBalance(): Promise<{ credits: number; plan: string } | null> {
  const token = getProxyToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${WEB_URL}/v1/credits`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("[WebAuth] Failed to get credits:", error);
    return null;
  }
}

/**
 * Store tokens securely
 */
async function storeTokens(data: TokenResponse): Promise<void> {
  // Store access token (used for API calls)
  await setProxyToken(data.access_token);

  // Store refresh token
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  } catch {
    // Ignore storage errors
  }

  // Store expiry time
  const expiryTime = Date.now() + data.expires_in * 1000;
  try {
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryTime));
  } catch {
    // Ignore
  }

  // Store user info
  try {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.user));
  } catch {
    // Ignore
  }
}

/**
 * Get refresh token
 */
function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Check if access token is expired (with 1 min buffer)
 */
export function isAccessTokenExpired(): boolean {
  try {
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiryStr) return true;
    const expiry = parseInt(expiryStr, 10);
    return Date.now() > expiry - 60000; // 1 minute buffer
  } catch {
    return true;
  }
}

/**
 * Clear all tokens (logout)
 */
export async function clearTokens(): Promise<void> {
  await setProxyToken("");
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_INFO_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Check if user is authenticated with SmartSpecWeb
 */
export function isWebAuthenticated(): boolean {
  return !!getProxyToken() && !!getRefreshToken();
}

/**
 * Initialize web auth on app start
 * Refreshes token if expired
 */
export async function initializeWebAuth(): Promise<WebUser | null> {
  // Load token from secure storage
  await loadProxyToken();

  const token = getProxyToken();
  if (!token) {
    return null;
  }

  // Check if token is expired
  if (isAccessTokenExpired()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return null;
    }
    return refreshed.user;
  }

  // Get fresh user info
  return getCurrentUser();
}

/**
 * Logout from SmartSpecWeb
 */
export async function webLogout(): Promise<void> {
  await clearTokens();
}

/**
 * Get SmartSpecWeb URL for opening in browser
 */
export function getWebUrl(): string {
  return WEB_URL;
}

/**
 * Open verification URL in browser
 */
export function openVerificationUrl(url: string): void {
  // Try to use Tauri's shell.open if available
  if (typeof window !== "undefined" && (window as any).__TAURI__) {
    import("@tauri-apps/api/shell").then((shell) => {
      shell.open(url);
    }).catch(() => {
      // Fallback to window.open
      window.open(url, "_blank");
    });
  } else {
    window.open(url, "_blank");
  }
}
