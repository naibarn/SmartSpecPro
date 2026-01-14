import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import { FactoryPanel } from "./components/FactoryPanel";
import KiloCliPage from "./pages/KiloCli";
import KiloPtyPage from "./pages/KiloPty";
import LLMChatPage from "./pages/LLMChat";
import TestPage from "./pages/TestPage";
import DockerSandbox from "./pages/DockerSandbox";
import Login from "./pages/Login";
import WebLogin from "./pages/WebLogin";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import { initializeAuth, getAuthToken, isTokenExpired } from "./services/authService";
import { initializeWebAuth } from "./services/webAuthService";

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
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
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
  const token = getAuthToken();

  // Check if token exists and not expired
  if (!token || isTokenExpired()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Loading Component
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  console.log("App component rendering");

  // Initialize auth on app start
  useEffect(() => {
    initializeAuth().catch(console.error);
    initializeWebAuth().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/web-login" element={<WebLogin />} />

          {/* Protected routes with sidebar */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div style={{ display: "flex", height: "100vh", background: "#111827" }}>
                  <Sidebar />
                  <div style={{ flex: 1, overflow: "auto" }}>
                    <ErrorBoundary>
                      <Routes>
                        {/* Main Pages */}
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/factory" element={<FactoryPanel />} />
                        <Route path="/chat" element={<LLMChatPage />} />
                        <Route path="/terminal" element={<KiloPtyPage />} />
                        <Route path="/kilo" element={<KiloCliPage />} />
                        <Route path="/test" element={<TestPage />} />
                        <Route path="/docker" element={<DockerSandbox />} />
                        
                        {/* Settings & Profile */}
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/profile" element={<Profile />} />
                        
                        {/* 404 Not Found */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </ErrorBoundary>
                  </div>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

// Export components for use elsewhere
export { ErrorBoundary, LoadingScreen };
