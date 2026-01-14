/**
 * Login Page
 * 
 * SECURITY FIX (CRIT-002): Uses secure store instead of localStorage
 */

import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { setAuthToken, setUser } from "../services/authService";

const API_BASE_URL = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        let errorMessage = "Login failed";
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map((err: { msg: string }) => err.msg).join(", ");
          } else if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // SECURITY FIX: Store auth token and user info in secure store
      await setAuthToken(data.access_token);
      await setUser(data.user);

      // Redirect to dashboard
      navigate("/");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to login";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    width: "100%",
  };

  const buttonStyle = {
    padding: "10px 16px",
    borderRadius: "6px",
    border: "none",
    background: "#3b82f6",
    color: "#ffffff",
    cursor: loading ? "not-allowed" : "pointer",
    fontSize: "14px",
    fontWeight: 600,
    width: "100%",
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 32,
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 8px 0", fontSize: 28, fontWeight: 700 }}>SmartSpec Pro</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Sign in to access admin features
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              background: "#fee2e2",
              border: "1px solid #f87171",
              borderRadius: 8,
              marginBottom: 16,
              color: "#991b1b",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 16 }}>
          <div>
            <label
              htmlFor="email"
              style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div
          style={{
            marginTop: 24,
            paddingTop: 24,
            borderTop: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Don't have an account?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate("/register");
              }}
              style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 500 }}
            >
              Register here
            </a>
          </p>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#f9fafb",
            borderRadius: 8,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          <strong>Default admin:</strong>
          <br />
          Email: admin@example.com
          <br />
          Password: Admin123!@#
        </div>
      </div>
    </div>
  );
}
