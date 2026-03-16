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
 * Get stored auth token from secure store
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

  cachedToken = localStorage.getItem('smartspec_auth_token') || null;
  return cachedToken;
}

/**
 * Get stored auth token synchronously (uses cache)
 */
export function getAuthTokenSync(): string | null {
  return cachedToken;
}

/**
 * Set auth token in secure store
 */
export async function setAuthToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    if (hasTauri()) {
      await safeInvoke('set_auth_token', { token });
      return;
    }
  } catch { /* fallback */ }

  if (token) localStorage.setItem('smartspec_auth_token', token);
  else localStorage.removeItem('smartspec_auth_token');
}

/**
 * Get stored user info
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

  try {
    const userJson = localStorage.getItem('smartspec_user_data');
    if (userJson) {
      cachedUser = JSON.parse(userJson);
      return cachedUser;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Get stored user info synchronously (uses cache)
 */
export function getUserSync(): User | null {
  return cachedUser;
}

/**
 * Set user data
 */
export async function setUser(user: User): Promise<void> {
  cachedUser = user;
  try {
    if (hasTauri()) {
      await safeInvoke('set_user_data', { userJson: JSON.stringify(user) });
      return;
    }
  } catch { /* fallback */ }

  localStorage.setItem('smartspec_user_data', JSON.stringify(user));
}

/**
 * Check if token is expired
 */
export async function isTokenExpired(): Promise<boolean> {
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
 * Verify token with backend
 */
export async function verifyToken(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

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
        const hasToken = !!(await getAuthToken());
        const onLoginPage = window.location.pathname === '/login';

        if (hasToken && !onLoginPage) {
          console.warn('Auth error detected, logging out...');
          await logout();
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
 * Check if authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    if (hasTauri()) {
      return await safeInvoke<boolean>('is_authenticated');
    }
  } catch { /* fallback */ }

  const token = await getAuthToken();
  return !!token;
}

/**
 * Initialize auth on app start
 */
export async function initializeAuth(): Promise<void> {
  setupAuthInterceptor();

  const token = await getAuthToken();
  if (!token) {
    return;
  }

  if (await isTokenExpired()) {
    await logout();
    return;
  }

  await verifyToken();
}

// ============================================
// API Key Management
// TODO: Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)
// ============================================

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google';

export async function setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
  try {
    if (hasTauri()) {
      await safeInvoke('set_api_key', { provider, apiKey });
      return;
    }
  } catch { /* fallback */ }
  sessionStorage.setItem(`smartspec_apikey_${provider}`, apiKey);
}

export async function getApiKey(provider: LLMProvider): Promise<string | null> {
  try {
    if (hasTauri()) {
      return await safeInvoke<string | null>('get_api_key', { provider });
    }
  } catch { /* fallback */ }
  return sessionStorage.getItem(`smartspec_apikey_${provider}`);
}

export async function deleteApiKey(provider: LLMProvider): Promise<void> {
  try {
    if (hasTauri()) {
      await safeInvoke('delete_api_key', { provider });
      return;
    }
  } catch { /* fallback */ }
  sessionStorage.removeItem(`smartspec_apikey_${provider}`);
}

export async function listStoredApiKeys(): Promise<string[]> {
  try {
    if (hasTauri()) {
      return await safeInvoke<string[]>('list_stored_api_keys');
    }
  } catch { /* fallback */ }
  const providers: LLMProvider[] = ['openrouter', 'openai', 'anthropic', 'deepseek', 'google'];
  return providers.filter(p => !!sessionStorage.getItem(`smartspec_apikey_${p}`));
}

export async function hasApiKey(provider: LLMProvider): Promise<boolean> {
  const key = await getApiKey(provider);
  return key !== null && key.length > 0;
}
