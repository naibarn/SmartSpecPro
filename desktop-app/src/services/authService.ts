/**
 * Authentication Service
 * Handles token validation, auto-logout, and auth state
 */

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
}

interface AuthToken {
  token: string;
  expiresAt: number; // timestamp in ms
}

const BASE_URL = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

/**
 * Get stored auth token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

/**
 * Get stored user info
 */
export function getUser(): User | null {
  const userStr = localStorage.getItem("user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(): boolean {
  const token = getAuthToken();
  if (!token) return true;

  // Decode JWT to check expiry (simplified - just check structure)
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

  // If can't decode, assume not expired (will be caught by API call)
  return false;
}

/**
 * Logout user
 */
export function logout(navigate?: (path: string) => void) {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user");
  
  if (navigate) {
    navigate("/login");
  } else {
    // Fallback: redirect via window
    window.location.href = "/login";
  }
}

/**
 * Verify token with backend
 */
export async function verifyToken(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const user = await response.json();
      localStorage.setItem("user", JSON.stringify(user));
      return true;
    }

    // Token invalid or expired
    if (response.status === 401 || response.status === 403) {
      logout();
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
 * Auto-logout on 401/403 responses
 */
export function setupAuthInterceptor() {
  // Prevent duplicate setup
  if ((window as any).__authInterceptorSetup) {
    return;
  }
  (window as any).__authInterceptorSetup = true;

  // Store original fetch
  const originalFetch = window.fetch;

  // Override fetch
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    // Check for auth errors
    if (response.status === 401 || response.status === 403) {
      // Check if this is an auth-related endpoint
      const url = args[0] instanceof Request ? args[0].url : args[0].toString();

      // Only logout if:
      // 1. Not a login endpoint
      // 2. User has a token (not first time visitor)
      // 3. Not already on login page
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        const hasToken = !!getAuthToken();
        const onLoginPage = window.location.pathname === '/login';

        if (hasToken && !onLoginPage) {
          console.warn('Auth error detected, logging out...');
          logout();
        }
      }
    }

    return response;
  };
}

/**
 * Check if user is admin
 */
export function isAdmin(): boolean {
  const user = getUser();
  return user?.is_admin === true;
}

/**
 * Initialize auth on app start
 */
export async function initializeAuth(): Promise<void> {
  // Setup interceptor
  setupAuthInterceptor();

  // Only check token if it exists
  const token = getAuthToken();
  if (!token) {
    // No token, don't do anything (let routes handle redirect)
    return;
  }

  // Check if token is expired
  if (isTokenExpired()) {
    logout();
    return;
  }

  // Verify token with backend
  await verifyToken();
}
