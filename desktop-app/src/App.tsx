import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import { FactoryPanel } from "./components/FactoryPanel";
import KiloCliPage from "./pages/KiloCli";
import KiloPtyPage from "./pages/KiloPty";
import LLMChatPage from "./pages/LLMChat";
import TestPage from "./pages/TestPage";
import AdminSettings from "./pages/AdminSettings";
import Login from "./pages/Login";
import { initializeAuth, getAuthToken, isAdmin, isTokenExpired } from "./services/authService";

// Protected Route wrapper
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const token = getAuthToken();

  // Check if token exists and not expired
  if (!token || isTokenExpired()) {
    return <Navigate to="/login" replace />;
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin()) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Access Denied</h2>
        <p>You need admin privileges to access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  console.log("App component rendering");

  // Initialize auth on app start
  useEffect(() => {
    initializeAuth().catch(console.error);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes with sidebar */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div style={{ display: "flex", height: "100vh", background: "#fff" }}>
                <Sidebar />
                <div style={{ flex: 1, overflow: "auto" }}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/factory" element={<FactoryPanel />} />
                    <Route path="/chat" element={<LLMChatPage />} />
                    <Route path="/terminal" element={<KiloPtyPage />} />
                    <Route path="/kilo" element={<KiloCliPage />} />
                    <Route path="/test" element={<TestPage />} />

                    {/* Admin-only routes */}
                    <Route
                      path="/admin/settings"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminSettings />
                        </ProtectedRoute>
                      }
                    />
                  </Routes>
                </div>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
