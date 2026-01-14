/**
 * Authentication Service
 * Handles token validation, auto-logout, and auth state
 * 
 * SECURITY FIX (CRIT-002): Uses Tauri secure store instead of localStorage
 */

import { invoke } from '@tauri-apps/api/core';

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
}

const BASE_URL = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

// Cache for user data to avoid repeated secure store calls
let cachedUser: User | null = null;
let cachedToken: string | null = null;

/**
 * Get stored auth token from secure store
 */
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  
  try {
    const token = await invoke<string | null>('get_auth_token');
    cachedToken = token;
    return token;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

/**
 * Get stored auth token synchronously (uses cache)
 * @deprecated Use async getAuthToken() instead
 */
export function getAuthTokenSync(): string | null {
  return cachedToken;
}

/**
 * Set auth token in secure store
 */
export async function setAuthToken(token: string): Promise<void> {
  try {
    await invoke('set_auth_token', { token });
    cachedToken = token;
  } catch (error) {
    console.error('Failed to set auth token:', error);
    throw error;
  }
}

/**
 * Get stored user info from secure store
 */
export async function getUser(): Promise<User | null> {
  if (cachedUser) return cachedUser;
  
  try {
    const userJson = await invoke<string | null>('get_user_data');
    if (!userJson) return null;
    cachedUser = JSON.parse(userJson);
    return cachedUser;
  } catch (error) {
    console.error('Failed to get user data:', error);
    return null;
  }
}

/**
 * Get stored user info synchronously (uses cache)
 * @deprecated Use async getUser() instead
 */
export function getUserSync(): User | null {
  return cachedUser;
}

/**
 * Set user data in secure store
 */
export async function setUser(user: User): Promise<void> {
  try {
    await invoke('set_user_data', { userJson: JSON.stringify(user) });
    cachedUser = user;
  } catch (error) {
    console.error('Failed to set user data:', error);
    throw error;
  }
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
      // Check if expired (with 5 minute buffer)
      return Date.now() / 1000 > (exp - 300);
    }
  } catch (e) {
    console.error('Failed to decode token:', e);
  }

  return false;
}

/**
 * Logout user - clear all credentials from secure store
 */
export async function logout(navigate?: (path: string) => void): Promise<void> {
  try {
    await invoke('clear_all_credentials');
  } catch (error) {
    console.error('Failed to clear credentials:', error);
  }
  
  // Clear cache
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
    const response = await fetch(`${BASE_URL}/api/v1/auth/me`, {
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

      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
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
    return await invoke<boolean>('is_authenticated');
  } catch (error) {
    console.error('Failed to check authentication:', error);
    return false;
  }
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
// API Key Management (CRIT-003 fix)
// ============================================

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google';

/**
 * Set API key for a provider
 */
export async function setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
  try {
    await invoke('set_api_key', { provider, apiKey });
  } catch (error) {
    console.error(`Failed to set API key for ${provider}:`, error);
    throw error;
  }
}

/**
 * Get API key for a provider
 */
export async function getApiKey(provider: LLMProvider): Promise<string | null> {
  try {
    return await invoke<string | null>('get_api_key', { provider });
  } catch (error) {
    console.error(`Failed to get API key for ${provider}:`, error);
    return null;
  }
}

/**
 * Delete API key for a provider
 */
export async function deleteApiKey(provider: LLMProvider): Promise<void> {
  try {
    await invoke('delete_api_key', { provider });
  } catch (error) {
    console.error(`Failed to delete API key for ${provider}:`, error);
    throw error;
  }
}

/**
 * List all stored API key providers
 */
export async function listStoredApiKeys(): Promise<string[]> {
  try {
    return await invoke<string[]>('list_stored_api_keys');
  } catch (error) {
    console.error('Failed to list stored API keys:', error);
    return [];
  }
}

/**
 * Check if API key exists for a provider
 */
export async function hasApiKey(provider: LLMProvider): Promise<boolean> {
  const key = await getApiKey(provider);
  return key !== null && key.length > 0;
}
