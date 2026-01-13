import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { getUser, logout, isTokenExpired } from "../services/authService";
import { isWebAuthenticated, getWebUrl, getCachedUser } from "../services/webAuthService";

export default function Sidebar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());
  const [webUser, setWebUser] = useState(getCachedUser());
  const [webConnected, setWebConnected] = useState(isWebAuthenticated());

  // Check token expiry periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isTokenExpired()) {
        console.log("Token expired, logging out...");
        logout(navigate);
      }
      // Update web auth status
      setWebConnected(isWebAuthenticated());
      setWebUser(getCachedUser());
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = () => {
    logout(navigate);
  };

  const openWebAdmin = () => {
    const webUrl = getWebUrl();
    window.open(`${webUrl}/admin/llm-providers`, "_blank");
  };

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    display: "block",
    padding: "10px 12px",
    borderRadius: 10,
    textDecoration: "none",
    color: isActive ? "#111827" : "#374151",
    background: isActive ? "#e5e7eb" : "transparent",
    fontWeight: 600,
  });

  return (
    <div style={{ width: 240, padding: 12, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>SmartSpec</div>

      {user && (
        <div style={{ padding: 8, marginBottom: 12, background: "#f9fafb", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{user.full_name || user.email}</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>
            {user.is_admin ? "👑 Admin" : "User"}
          </div>
          {webConnected && webUser && (
            <div style={{ color: "#059669", fontSize: 11, marginTop: 4 }}>
              ✓ Web: {webUser.credits} credits
            </div>
          )}
        </div>
      )}

      <nav style={{ display: "grid", gap: 6, flex: 1 }}>
        <NavLink to="/" style={linkStyle}>Dashboard</NavLink>
        <NavLink to="/factory" style={linkStyle}>SaaS Factory</NavLink>
        <NavLink to="/chat" style={linkStyle}>LLM Chat (Vision)</NavLink>
        <NavLink to="/terminal" style={linkStyle}>Terminal (PTY)</NavLink>
        <NavLink to="/kilo" style={linkStyle}>CLI (Terminal)</NavLink>
        <NavLink to="/docker" style={linkStyle}>🐳 Docker Sandbox</NavLink>

        {/* SmartSpecWeb Admin Link */}
        {webConnected && webUser?.plan !== "free" && (
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, paddingLeft: 12 }}>
              SMARTSPEC WEB
            </div>
            <button
              onClick={openWebAdmin}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                textDecoration: "none",
                color: "#374151",
                background: "transparent",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              ⚙️ LLM Providers
            </button>
          </div>
        )}
      </nav>

      <button
        onClick={handleLogout}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          marginTop: "auto",
        }}
      >
        🚪 Logout
      </button>
    </div>
  );
}
