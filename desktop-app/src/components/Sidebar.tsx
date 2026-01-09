import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { getUser, logout, isTokenExpired } from "../services/authService";

export default function Sidebar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());

  // Check token expiry periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isTokenExpired()) {
        console.log("Token expired, logging out...");
        logout(navigate);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = () => {
    logout(navigate);
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
        </div>
      )}

      <nav style={{ display: "grid", gap: 6, flex: 1 }}>
        <NavLink to="/" style={linkStyle}>Dashboard</NavLink>
        <NavLink to="/factory" style={linkStyle}>SaaS Factory</NavLink>
        <NavLink to="/chat" style={linkStyle}>LLM Chat (Vision)</NavLink>
        <NavLink to="/terminal" style={linkStyle}>Terminal (PTY)</NavLink>
        <NavLink to="/kilo" style={linkStyle}>Kilo CLI (Compat)</NavLink>

        {user?.is_admin && (
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, paddingLeft: 12 }}>
              ADMIN
            </div>
            <NavLink to="/admin/settings" style={linkStyle}>⚙️ Provider Config</NavLink>
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
