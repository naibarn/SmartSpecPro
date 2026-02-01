import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, useMemo } from "react";
import Dashboard from "./pages/Dashboard";
import { FactoryPanel } from "./components/FactoryPanel";
import KiloCliPage from "./pages/KiloCli";
import KiloPtyPage from "./pages/KiloPty";
import LLMChatPage from "./pages/LLMChat";
import TestPage from "./pages/TestPage";
import DockerSandbox from "./pages/DockerSandbox";
import MediaStudioPage from "./pages/MediaStudioPage";
import Login from "./pages/Login";
import WebLogin from "./pages/WebLogin";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import SkillsPage from "./pages/SkillsPage";
import { initializeAuth, getAuthToken, setAuthToken, setUser as setStoredUser, isTokenExpired, getUser as getStoredUser, logout as authLogout } from "./services/authService";
import { setProxyToken } from "./services/authStore";
import { initializeWebAuth } from "./services/webAuthService";
import { getVisibleMenuItems } from "@smartspec/shared";
import { DashboardLayout, AuthContext, type AuthUser, type AuthContextType } from "@smartspec/ui";

// Error Boundary Component
import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    async function checkAuth() {
      const token = await getAuthToken();
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      const expired = await isTokenExpired();
      if (!expired) {
        setIsAuthenticated(true);
        return;
      }

      // Token expired — try refresh
      const refreshToken = localStorage.getItem("smartspec_web_refresh_token");
      if (!refreshToken) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const WEB_URL = import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartaihub.app";
        const res = await fetch(`${WEB_URL}/auth/device/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          await setAuthToken(data.access_token);
          await setProxyToken(data.access_token);
          if (data.user) await setStoredUser(data.user);
          if (data.refresh_token) localStorage.setItem("smartspec_web_refresh_token", data.refresh_token);
          localStorage.setItem("smartspec_web_token_expiry", String(Date.now() + (data.expires_in || 900) * 1000));
          setIsAuthenticated(true);
          return;
        }
      } catch {
        // refresh failed
      }
      setIsAuthenticated(false);
    }
    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// Auth provider that bridges desktop authService to shared AuthContext
function DesktopAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadUser = React.useCallback(async () => {
    try {
      const stored = await getStoredUser();
      if (stored) {
        setUser({
          id: stored.id || '',
          email: stored.email || '',
          name: stored.full_name || stored.email || '',
          role: stored.is_admin ? 'admin' : 'user',
        });
      }
    } catch {
      // no user
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Re-load user when login completes (fires custom event)
  useEffect(() => {
    const handler = () => { loadUser(); };
    window.addEventListener('smartspec:auth-changed', handler);
    return () => window.removeEventListener('smartspec:auth-changed', handler);
  }, [loadUser]);

  const ctx: AuthContextType = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    logout: async () => {
      await authLogout();
      setUser(null);
      window.location.href = '/login';
    },
    refreshUser: async () => {
      const stored = await getStoredUser();
      if (stored) {
        setUser({
          id: stored.id || '',
          email: stored.email || '',
          name: stored.full_name || stored.email || '',
          role: stored.is_admin ? 'admin' : 'user',
        });
      }
    },
  }), [user, isLoading]);

  return (
    <AuthContext.Provider value={ctx}>
      {children}
    </AuthContext.Provider>
  );
}

// Inner layout that uses router hooks
function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = useMemo(() => {
    // TODO: use actual user role when available
    return getVisibleMenuItems('desktop', 'user');
  }, []);

  return (
    <DashboardLayout
      menuItems={menuItems}
      currentPath={location.pathname}
      onNavigate={(path) => navigate(path)}
      onSignIn={() => navigate('/login')}
      appName="SmartSpec Pro"
    >
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/factory" element={<FactoryPanel />} />
          <Route path="/chat" element={<LLMChatPage />} />
          <Route path="/terminal" element={<KiloPtyPage />} />
          <Route path="/kilo" element={<KiloCliPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/docker" element={<DockerSandbox />} />
          <Route path="/media" element={<MediaStudioPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </DashboardLayout>
  );
}

export default function App() {
  useEffect(() => {
    initializeAuth().catch(console.error);
    initializeWebAuth().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <DesktopAuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/web-login" element={<WebLogin />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </DesktopAuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export { ErrorBoundary, LoadingScreen };
