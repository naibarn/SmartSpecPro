/**
 * Authentication Service
 * Handles token validation, auto-logout, and auth state
 *
 * Supports both Tauri secure store and localStorage (browser dev mode)
 */

function hasTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
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

const BASE_URL = import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartaihub.app";

// Cache for user data to avoid repeated secure store calls
let cachedUser: User | null = null;
let cachedToken: string | null = null;

/**
 * Get stored auth token from secure store.
 * Browser context: returns null (httpOnly cookie handles auth automatically).
 * Tauri context: reads from native secure store.
 */
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  try {
    if (hasTauri()) {
      const token = await safeInvoke<string | null>('get_auth_token');
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
      await safeInvoke('set_auth_token', { token });
      return;
    }
  } catch { /* fallback */ }

  // Browser: no-op. Server sets httpOnly cookie via Set-Cookie header.
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
      const userJson = await safeInvoke<string | null>('get_user_data');
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
      await safeInvoke('set_user_data', { userJson: JSON.stringify(user) });
      return;
    }
  } catch { /* fallback */ }

  // Browser: in-memory only. verifyToken() refreshes this on page load.
}

/**
 * Check if token is expired.
 * Browser context: server ping (cannot decode httpOnly cookie).
 * Tauri context: decodes JWT from secure store.
 */
export async function isTokenExpired(): Promise<boolean> {
  if (hasTauri()) {
    const token = await getAuthToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp;
      if (exp && typeof exp === 'number') {
        return Date.now() / 1000 > (exp - 300);
      }
    } catch (e) {
      console.error('Failed to decode token:', e);
    }
    return false;
  }

  // Browser: server ping to check session validity
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.status === 401;
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
      await safeInvoke('clear_all_credentials');
    }
  } catch { /* ignore */ }

  // Clear localStorage fallback keys
  localStorage.removeItem('smartspec_auth_token');
  localStorage.removeItem('smartspec_user_data');
  localStorage.removeItem('smartspec_web_refresh_token');
  localStorage.removeItem('smartspec_web_token_expiry');
  localStorage.removeItem('smartspec_web_user');

  cachedToken = null;
  cachedUser = null;

  if (navigate) {
    navigate("/login");
  } else {
    window.location.href = "/login";
  }
}

/**
 * Verify token with backend.
 * Browser context: uses credentials:'include' (httpOnly cookie).
 * Tauri context: sends Bearer token header.
 */
export async function verifyToken(): Promise<boolean> {
  try {
    let response: Response;

    if (hasTauri()) {
      const token = await getAuthToken();
      if (!token) return false;
      response = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } else {
      response = await fetch('/api/auth/me', { credentials: 'include' });
    }

    if (response.ok) {
      const user = await response.json();
      await setUser(user);
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      await logout();
      return false;
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

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response.status === 401 || response.status === 403) {
      const url = args[0] instanceof Request ? args[0].url : args[0].toString();

      if (!url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/desktop/login')) {
        const onLoginPage = window.location.pathname === '/login';
        if (!onLoginPage) {
          if (hasTauri()) {
            const hasToken = !!(await getAuthToken());
            if (hasToken) {
              console.warn('Auth error detected, logging out...');
              await logout();
            }
          } else {
            // Browser: cookie auth — if server says 401, session is invalid
            console.warn('Auth error detected, logging out...');
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
 * Tauri context: checks native secure store.
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    if (hasTauri()) {
      return await safeInvoke<boolean>('is_authenticated');
    }
  } catch { /* fallback */ }

  // Browser: check session via server ping
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Initialize auth on app start.
 * Browser: skips local token check, goes straight to server verify.
 * Tauri: checks local token first, then verifies with server.
 */
export async function initializeAuth(): Promise<void> {
  setupAuthInterceptor();

  if (hasTauri()) {
    const token = await getAuthToken();
    if (!token) return;
    if (await isTokenExpired()) {
      await logout();
      return;
    }
  }

  // Both paths: verify with server
  await verifyToken();
}

