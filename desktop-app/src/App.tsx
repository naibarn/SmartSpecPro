import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import { FactoryPanel } from "./components/FactoryPanel";
import KiloCliPage from "./pages/KiloCli";
import KiloPtyPage from "./pages/KiloPty";
import LLMChatPage from "./pages/LLMChat";
import TestPage from "./pages/TestPage";
import Login from "./pages/Login";
import WebLogin from "./pages/WebLogin";
import { initializeAuth, getAuthToken, isTokenExpired } from "./services/authService";
import { initializeWebAuth } from "./services/webAuthService";

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getAuthToken();

  // Check if token exists and not expired
  if (!token || isTokenExpired()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  console.log("App component rendering");

  // Initialize auth on app start
  useEffect(() => {
    initializeAuth().catch(console.error);
    initializeWebAuth().catch(console.error);
  }, []);

  return (
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
