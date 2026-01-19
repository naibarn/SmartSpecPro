/**
 * Frontend CSRF Integration Example
 *
 * This example shows how to integrate CSRF protection in a React/TypeScript application
 */

import { useState, useEffect } from 'react';
import axios from 'axios';

// ============================================================================
// 1. CSRF Service (create in src/services/csrf.ts)
// ============================================================================

interface CSRFTokenResponse {
  csrf_token: string;
  header_name: string;
  cookie_name: string;
  instructions: {
    message: string;
    example: string;
    cookie: string;
  };
}

class CSRFService {
  private static instance: CSRFService;
  private token: string | null = null;
  private readonly TOKEN_KEY = 'csrf_token';
  private readonly API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  private constructor() {
    // Load token from sessionStorage on init
    this.token = sessionStorage.getItem(this.TOKEN_KEY);
  }

  static getInstance(): CSRFService {
    if (!CSRFService.instance) {
      CSRFService.instance = new CSRFService();
    }
    return CSRFService.instance;
  }

  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/api/csrf/token`, {
        credentials: 'include', // Important: include cookies
      });

      if (!response.ok) {
        throw new Error('Failed to fetch CSRF token');
      }

      const data: CSRFTokenResponse = await response.json();
      this.token = data.csrf_token;

      // Store in sessionStorage
      sessionStorage.setItem(this.TOKEN_KEY, this.token);

      console.log('[CSRF] Token initialized successfully');
    } catch (error) {
      console.error('[CSRF] Failed to initialize token:', error);
      throw error;
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async refreshToken(): Promise<void> {
    console.log('[CSRF] Refreshing token...');
    await this.initialize();
  }

  clearToken(): void {
    this.token = null;
    sessionStorage.removeItem(this.TOKEN_KEY);
  }

  async checkStatus(): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE}/api/csrf/status`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      console.error('[CSRF] Status check failed:', error);
      return false;
    }
  }
}

export const csrfService = CSRFService.getInstance();

// ============================================================================
// 2. Axios Configuration (create in src/config/axios.ts)
// ============================================================================

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { csrfService } from '../services/csrf';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  withCredentials: true, // Important: include cookies for CSRF
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add CSRF token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Add CSRF token for state-changing requests
    const method = config.method?.toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method || '')) {
      const csrfToken = csrfService.getToken();
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      } else {
        console.warn('[CSRF] Token not found for state-changing request');
      }
    }

    // Add JWT token if available
    const jwtToken = localStorage.getItem('access_token');
    if (jwtToken) {
      config.headers.Authorization = `Bearer ${jwtToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle CSRF errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<any>) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Handle CSRF token errors
    if (error.response?.status === 403) {
      const errorCode = error.response.data?.error;

      if (
        errorCode === 'CSRF_TOKEN_MISSING' ||
        errorCode === 'CSRF_TOKEN_INVALID' ||
        errorCode === 'CSRF_TOKEN_MISMATCH'
      ) {
        // Refresh CSRF token and retry once
        if (!originalRequest._retry) {
          originalRequest._retry = true;

          try {
            console.log('[CSRF] Token error, refreshing...');
            await csrfService.refreshToken();

            // Retry original request
            return api(originalRequest);
          } catch (refreshError) {
            console.error('[CSRF] Failed to refresh token:', refreshError);
            return Promise.reject(error);
          }
        }
      }
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const resetTime = error.response.headers['x-ratelimit-reset'];

      console.warn('[Rate Limit] Too many requests', {
        retryAfter: retryAfter ? `${retryAfter}s` : 'unknown',
        resetTime: resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleString() : 'unknown',
      });

      // You can implement retry logic here or show a user-friendly message
    }

    return Promise.reject(error);
  }
);

export default api;

// ============================================================================
// 3. React Hook for CSRF (create in src/hooks/useCSRF.ts)
// ============================================================================

export function useCSRF() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function initCSRF() {
      try {
        await csrfService.initialize();
        const valid = await csrfService.checkStatus();
        setIsValid(valid);
        setIsInitialized(true);
      } catch (err) {
        setError(err as Error);
        setIsInitialized(true);
      }
    }

    initCSRF();
  }, []);

  const refresh = async () => {
    try {
      setError(null);
      await csrfService.refreshToken();
      const valid = await csrfService.checkStatus();
      setIsValid(valid);
    } catch (err) {
      setError(err as Error);
    }
  };

  return {
    isInitialized,
    isValid,
    error,
    refresh,
  };
}

// ============================================================================
// 4. App Component Integration (in src/App.tsx)
// ============================================================================

function App() {
  const { isInitialized, isValid, error } = useCSRF();

  useEffect(() => {
    if (isInitialized && !isValid) {
      console.warn('[App] CSRF token is not valid');
    }
  }, [isInitialized, isValid]);

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <p>Initializing security...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <p>Failed to initialize security: {error.message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Your app content */}
    </div>
  );
}

export default App;

// ============================================================================
// 5. Usage Examples
// ============================================================================

// Example 1: Simple POST request
async function createUser(userData: any) {
  try {
    const response = await api.post('/api/users', userData);
    return response.data;
  } catch (error) {
    console.error('Failed to create user:', error);
    throw error;
  }
}

// Example 2: Update request with automatic CSRF handling
async function updateProfile(userId: string, profileData: any) {
  try {
    const response = await api.put(`/api/users/${userId}`, profileData);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      // Handle rate limiting
      const retryAfter = error.response.headers['retry-after'];
      alert(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
    }
    throw error;
  }
}

// Example 3: Delete request
async function deleteItem(itemId: string) {
  try {
    const response = await api.delete(`/api/items/${itemId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to delete item:', error);
    throw error;
  }
}

// Example 4: Manual CSRF token usage (if not using axios)
async function manualFetchExample() {
  const csrfToken = csrfService.getToken();

  const response = await fetch('http://localhost:8000/api/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken || '',
    },
    credentials: 'include',
    body: JSON.stringify({ name: 'New Item' }),
  });

  if (!response.ok) {
    throw new Error('Request failed');
  }

  return response.json();
}

// ============================================================================
// 6. Testing Component
// ============================================================================

function CSRFTestComponent() {
  const [status, setStatus] = useState<string>('');

  const testCSRF = async () => {
    try {
      // Test 1: Check status
      const isValid = await csrfService.checkStatus();
      console.log('CSRF Valid:', isValid);

      // Test 2: Try a protected endpoint
      const response = await api.post('/api/test', { test: 'data' });
      setStatus('✅ CSRF protection working! Response: ' + JSON.stringify(response.data));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setStatus(`❌ CSRF Error: ${error.response?.data?.message || error.message}`);
      }
    }
  };

  const testRateLimit = async () => {
    try {
      // Make multiple requests to test rate limiting
      const requests = Array.from({ length: 70 }, (_, i) =>
        api.get('/health').then(() => console.log(`Request ${i + 1} succeeded`))
      );

      await Promise.all(requests);
      setStatus('✅ All requests succeeded (within rate limit)');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        setStatus(`⚠️ Rate limit exceeded! Retry after: ${error.response.headers['retry-after']}s`);
      }
    }
  };

  return (
    <div className="csrf-test">
      <h2>Security Testing</h2>
      <div className="buttons">
        <button onClick={testCSRF}>Test CSRF Protection</button>
        <button onClick={testRateLimit}>Test Rate Limiting</button>
      </div>
      {status && (
        <div className="status">
          <pre>{status}</pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. Environment Variables (.env)
// ============================================================================

/*
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENABLE_CSRF=true
*/

// ============================================================================
// Notes:
// ============================================================================

/*
1. CSRF Token Lifecycle:
   - Token is fetched on app initialization
   - Token is stored in sessionStorage
   - Token is automatically added to all POST/PUT/PATCH/DELETE requests
   - Token is refreshed on 403 CSRF errors
   - Token is cleared on logout

2. Rate Limiting:
   - Anonymous: 60 req/min
   - Authenticated: 120 req/min
   - Rate limit info in X-RateLimit-* headers
   - 429 status code when exceeded
   - Retry-After header indicates wait time

3. CORS:
   - withCredentials: true required for CSRF cookies
   - Origin must be in CORS_ORIGINS whitelist
   - Cookies are automatically sent with credentials

4. Error Handling:
   - 403 + CSRF error → auto-refresh token and retry
   - 429 → show rate limit message to user
   - Other errors → propagate to caller

5. Security Best Practices:
   - Never expose CSRF token in URL
   - Always use HTTPS in production
   - Store JWT in httpOnly cookie (recommended) or localStorage
   - Implement proper logout to clear tokens
   - Use environment variables for API URLs
*/
