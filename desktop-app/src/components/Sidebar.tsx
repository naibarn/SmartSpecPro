import { NavLink } from "react-router-dom";

export default function Sidebar() {
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
    <div style={{ width: 240, padding: 12, borderRight: "1px solid #e5e7eb" }}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>SmartSpec</div>
      <nav style={{ display: "grid", gap: 6 }}>
        <NavLink to="/" style={linkStyle}>Dashboard</NavLink>
        <NavLink to="/factory" style={linkStyle}>SaaS Factory</NavLink>
        <NavLink to="/chat" style={linkStyle}>LLM Chat (Vision)</NavLink>
        <NavLink to="/terminal" style={linkStyle}>Terminal (PTY)</NavLink>
        <NavLink to="/kilo" style={linkStyle}>Kilo CLI (Compat)</NavLink>
      </nav>
    </div>
  );
}
