/**
 * Authentication Context
 * Manages user authentication state and provides auth methods
 *
 * Uses tRPC session-cookie based authentication (app_session_id cookie)
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  company?: string;
  registeredDomain?: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  credits?: number;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (userOrEmail: User | string, password?: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGitHub: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

interface SignupData {
  name: string;
  email: string;
  password: string;
  company?: string;
  plan: 'free' | 'pro';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// API base URL for legacy Python backend (for OAuth flows)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Call tRPC auth.me endpoint with credentials to include session cookie
      const response = await fetch('/trpc/auth.me', {
        method: 'GET',
        credentials: 'include', // Include cookies for session auth
      });

      if (response.ok) {
        const data = await response.json();
        // tRPC response structure: { result: { data: { json: user } } }
        const userData = data.result?.data?.json;
        
        if (userData && userData.id) {
          // Transform to match User interface
          setUser({
            id: String(userData.id),
            email: userData.email || '',
            name: userData.name || userData.email?.split('@')[0] || 'User',
            avatar: userData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.email}`,
            plan: userData.role === 'admin' ? 'enterprise' : 'free',
            credits: userData.credits ?? 100,
            role: userData.role,
          });
        } else {
          // No valid session
          setUser(null);
        }
      } else {
        // Session invalid or expired
        setUser(null);
      }
    } catch (error) {
      console.error('[AuthContext] Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userOrEmail: User | string, password?: string) => {
    setIsLoading(true);
    try {
      // If userOrEmail is a User object (from OAuth callback)
      if (typeof userOrEmail === 'object') {
        setUser(userOrEmail);
        return;
      }

      // Otherwise, it's email/password login via tRPC
      const email = userOrEmail;
      const response = await fetch('/trpc/auth.login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          json: { email, password }
        }),
        credentials: 'include', // Important: include cookies
      });

      const data = await response.json();
      // tRPC response structure: { result: { data: { json: {...} } } }
      const result = data.result?.data?.json;

      if (result?.success && result.user) {
        // Transform to match User interface
        setUser({
          id: String(result.user.id),
          email: result.user.email || '',
          name: result.user.name || result.user.email?.split('@')[0] || 'User',
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${result.user.email}`,
          plan: 'free',
          credits: 100,
        });
      } else {
        const errorMessage = result?.message || data.error?.json?.message || 'Login failed';
        throw new Error(errorMessage);
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (signupData: SignupData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/trpc/auth.register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            name: signupData.name,
            email: signupData.email,
            password: signupData.password,
            company: signupData.company || undefined,
            plan: signupData.plan,
          },
        }),
        credentials: 'include',
      });

      const data = await response.json();
      const result = data.result?.data?.json;
      const errorMsg = data.error?.json?.message;

      if (result?.success) {
        // Don't set user — must verify email first
        // Caller should redirect to /verify-email
        return;
      } else {
        throw new Error(errorMsg || 'Registration failed');
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Call tRPC logout endpoint to clear session cookie
      await fetch('/trpc/auth.logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  };

  const loginWithGoogle = async () => {
    // Store state for CSRF protection
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_provider', 'google');
    
    // Redirect to Google OAuth
    const redirectUri = `${window.location.origin}/auth/callback/google`;
    const googleAuthUrl = `${API_BASE_URL}/api/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    window.location.href = googleAuthUrl;
  };

  const loginWithGitHub = async () => {
    // Store state for CSRF protection
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_provider', 'github');
    
    // Redirect to GitHub OAuth
    const redirectUri = `${window.location.origin}/auth/callback/github`;
    const githubAuthUrl = `${API_BASE_URL}/api/auth/github?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    window.location.href = githubAuthUrl;
  };

  const refreshUser = async () => {
    // Use tRPC auth.me to refresh user from session cookie
    try {
      const response = await fetch('/trpc/auth.me', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        const userData = data.result?.data?.json;
        
        if (userData && userData.id) {
          setUser({
            id: String(userData.id),
            email: userData.email || '',
            name: userData.name || userData.email?.split('@')[0] || 'User',
            avatar: userData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.email}`,
            plan: userData.role === 'admin' ? 'enterprise' : 'free',
            credits: userData.credits ?? 100,
            role: userData.role,
          });
        }
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        loginWithGoogle,
        loginWithGitHub,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
