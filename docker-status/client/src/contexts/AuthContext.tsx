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
      await fetch('/api/trpc/auth.logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        credentials: 'include',
      });

      // Redirect to main site after logout
      const hostname = window.location.hostname;
      let mainSiteUrl: string;
      if (hostname === 'docker.smartspec.pro') {
        mainSiteUrl = 'http://smartspec.pro';
      } else if (hostname === 'docker.smartspec.local') {
        mainSiteUrl = 'http://smartspec.local';
      } else if (hostname === 'docker.localhost') {
        mainSiteUrl = 'http://localhost';
      } else {
        mainSiteUrl = 'http://localhost';
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
