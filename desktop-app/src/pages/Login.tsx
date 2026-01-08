import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";

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

    console.log("🔐 Attempting login...");
    console.log("API URL:", `${API_BASE_URL}/api/auth/login`);
    console.log("Email:", email);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        console.error("Login error response:", errorData);

        // Handle different error formats
        let errorMessage = "Login failed";
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            // FastAPI validation error format
            errorMessage = errorData.detail.map((err: any) => err.msg).join(", ");
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
      console.log("Login success!", data);

      // Store auth token and user info
      localStorage.setItem("auth_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      console.log("✅ Stored token and user, redirecting...");

      // Redirect based on admin status
      if (data.user.is_admin) {
        console.log("Redirecting to /admin/settings");
        navigate("/admin/settings");
      } else {
        console.log("Redirecting to /");
        navigate("/");
      }
    } catch (err: any) {
      console.error("❌ Login error:", err);
      console.error("Error stack:", err.stack);
      setError(err.message || "Failed to login. Check console for details.");
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
