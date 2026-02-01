/**
 * Login Page
 *
 * Authenticates against SmartSpecWeb API (same user database as web app).
 * Supports direct email/password login + link to device flow.
 */

import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { setAuthToken, setUser } from "../services/authService";
import { setProxyToken } from "../services/authStore";

const WEB_URL = import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartaihub.app";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${WEB_URL}/auth/desktop/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error?.message || `HTTP ${response.status}`);
      }

      // Handle 2FA challenge
      if (data.requires2FA) {
        setError("This account has 2FA enabled. Please use 'Sign in via browser' instead.");
        return;
      }

      // Store tokens in secure store
      await setAuthToken(data.access_token);
      await setProxyToken(data.access_token);
      await setUser(data.user);

      // Store refresh token & expiry
      if (data.refresh_token) {
        localStorage.setItem("smartspec_web_refresh_token", data.refresh_token);
      }
      localStorage.setItem(
        "smartspec_web_token_expiry",
        String(Date.now() + data.expires_in * 1000)
      );

      // Notify auth provider that user data changed
      window.dispatchEvent(new Event('smartspec:auth-changed'));
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
    fontWeight: 600 as const,
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
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 8px 0", fontSize: 28, fontWeight: 700 }}>SmartSpec Pro</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Sign in with your SmartSpec account
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
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ ...inputStyle, paddingRight: 40 }}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  color: "#6b7280",
                }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px 0" }}>
            Or sign in via your browser
          </p>
          <button
            onClick={() => navigate("/web-login")}
            style={{
              ...buttonStyle,
              background: "transparent",
              color: "#3b82f6",
              border: "1px solid #3b82f6",
              opacity: 1,
              cursor: "pointer",
            }}
          >
            Sign in with Browser (Device Flow)
          </button>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#f9fafb",
            borderRadius: 8,
            fontSize: 12,
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          Connected to: {WEB_URL}
        </div>
      </div>
    </div>
  );
}
