import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // NEW: Check if we have access token in localStorage (JWT auth)
      const accessToken = localStorage.getItem('docker_status_access_token');
      const storedUser = localStorage.getItem('docker_status_user');

      if (accessToken && storedUser) {
        // We have JWT token, parse stored user
        try {
          const userData = JSON.parse(storedUser);

          if (userData && userData.id && userData.role === 'admin') {
            setUser({
              id: String(userData.id),
              email: userData.email || '',
              name: userData.name || userData.email?.split('@')[0] || 'Admin',
              role: userData.role,
            });
            setIsLoading(false);
            console.log('[Auth] Loaded user from localStorage (JWT auth)');
            return;
          }
        } catch (parseError) {
          console.error('[Auth] Failed to parse stored user:', parseError);
          // Clear invalid data
          localStorage.removeItem('docker_status_access_token');
          localStorage.removeItem('docker_status_user');
        }
      }

      // Fallback: try session cookie auth (old method, for compatibility)
      const response = await fetch('/api/trpc/auth.me', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        const userData = data.result?.data?.json;

        if (userData && userData.id && userData.role === 'admin') {
          setUser({
            id: String(userData.id),
            email: userData.email || '',
            name: userData.name || userData.email?.split('@')[0] || 'Admin',
            role: userData.role,
          });
          console.log('[Auth] Loaded user from session cookie');
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('[Auth] Check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Clear JWT token and user data from localStorage
      localStorage.removeItem('docker_status_access_token');
      localStorage.removeItem('docker_status_user');

      await fetch('/api/trpc/auth.logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        credentials: 'include',
      });

      setUser(null);

      // Redirect to main site after logout
      const hostname = window.location.hostname;
      let mainSiteUrl: string;
      if (hostname === 'docker.smartaihub.app') {
        mainSiteUrl = 'https://smartaihub.app';
      } else if (hostname === 'docker.smartspec.local') {
        mainSiteUrl = 'https://smartspec.local';
      } else if (hostname === 'docker.localhost') {
        mainSiteUrl = 'https://localhost';
      } else {
        mainSiteUrl = 'https://localhost';
      }
      window.location.href = mainSiteUrl;
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
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
