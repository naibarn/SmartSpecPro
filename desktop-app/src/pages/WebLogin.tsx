/**
 * Web Login Page
 * 
 * Handles OAuth Device Flow authentication with SmartSpecWeb
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  initiateDeviceAuth,
  pollForToken,
  openVerificationUrl,
  getWebUrl,
  DeviceCodeResponse,
  WebUser,
} from "../services/webAuthService";

type AuthState = "idle" | "loading" | "waiting" | "success" | "error";

export default function WebLogin() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [user, setUser] = useState<WebUser | null>(null);
  const [error, setError] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // Start device auth flow
  const startAuth = useCallback(async () => {
    setAuthState("loading");
    setError("");

    try {
      const response = await initiateDeviceAuth();
      setDeviceCode(response);
      setCountdown(response.expires_in);
      setAuthState("waiting");

      // Open verification URL in browser
      openVerificationUrl(response.verification_uri_complete);
    } catch (err: any) {
      setError(err.message || "Failed to start authentication");
      setAuthState("error");
    }
  }, []);

  // Poll for token
  useEffect(() => {
    if (authState !== "waiting" || !deviceCode) return;

    let cancelled = false;
    const interval = (deviceCode.interval || 5) * 1000;

    const poll = async () => {
      if (cancelled) return;

      try {
        const result = await pollForToken(deviceCode.device_code);
        if (result) {
          setUser(result.user);
          setAuthState("success");
          return;
        }
      } catch (err: any) {
        if (err.message.includes("expired")) {
          setError("Authentication timed out. Please try again.");
          setAuthState("error");
          return;
        }
        // Other errors - keep polling
        console.warn("[WebLogin] Poll error:", err.message);
      }

      // Continue polling
      if (!cancelled && authState === "waiting") {
        setTimeout(poll, interval);
      }
    };

    // Start polling after a short delay
    const timeout = setTimeout(poll, interval);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [authState, deviceCode]);

  // Countdown timer
  useEffect(() => {
    if (authState !== "waiting" || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setError("Authentication timed out. Please try again.");
          setAuthState("error");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [authState, countdown]);

  // Copy user code to clipboard
  const copyCode = useCallback(() => {
    if (deviceCode?.user_code) {
      navigator.clipboard.writeText(deviceCode.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [deviceCode]);

  // Format countdown as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Redirect after success
  useEffect(() => {
    if (authState === "success") {
      const timer = setTimeout(() => {
        navigate("/");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [authState, navigate]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 450,
          padding: 32,
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 16px",
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 700, color: "#111827" }}>
            Connect to SmartSpec Web
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Sign in to access AI features with credits
          </p>
        </div>

        {/* Idle State */}
        {authState === "idle" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#4b5563", marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
              Connect your SmartSpec Web account to use AI-powered features.
              Your usage will be tracked with credits.
            </p>
            <button
              onClick={startAuth}
              style={{
                width: "100%",
                padding: "14px 24px",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 10px 20px -5px rgba(59, 130, 246, 0.4)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Sign in with SmartSpec Web
            </button>
          </div>
        )}

        {/* Loading State */}
        {authState === "loading" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                width: 48,
                height: 48,
                margin: "0 auto 16px",
                border: "4px solid #e5e7eb",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ color: "#6b7280", margin: 0 }}>Starting authentication...</p>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {/* Waiting State */}
        {authState === "waiting" && deviceCode && (
          <div>
            <div
              style={{
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              <p style={{ color: "#0369a1", fontSize: 13, margin: "0 0 12px 0" }}>
                Enter this code on the website:
              </p>
              <div
                onClick={copyCode}
                style={{
                  fontFamily: "monospace",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: 4,
                  color: "#0c4a6e",
                  padding: "12px 20px",
                  background: "#ffffff",
                  borderRadius: 8,
                  cursor: "pointer",
                  border: "2px dashed #7dd3fc",
                  transition: "border-color 0.2s",
                }}
                title="Click to copy"
              >
                {deviceCode.user_code}
              </div>
              {copied && (
                <p style={{ color: "#059669", fontSize: 12, margin: "8px 0 0 0" }}>
                  ✓ Copied to clipboard
                </p>
              )}
            </div>

            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 8px 0" }}>
                A browser window should have opened. If not:
              </p>
              <button
                onClick={() => openVerificationUrl(deviceCode.verification_uri_complete)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#3b82f6",
                  fontSize: 14,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Open verification page
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 16px",
                background: "#fef3c7",
                borderRadius: 8,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d97706"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              <span style={{ color: "#92400e", fontSize: 14 }}>
                Expires in {formatTime(countdown)}
              </span>
            </div>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  margin: "0 auto",
                  border: "3px solid #e5e7eb",
                  borderTopColor: "#3b82f6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>
                Waiting for authorization...
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
        {authState === "success" && user && (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 16px",
                background: "#dcfce7",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="3"
              >
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </div>
            <h2 style={{ margin: "0 0 8px 0", color: "#111827", fontSize: 20 }}>
              Welcome, {user.name || user.email}!
            </h2>
            <p style={{ color: "#6b7280", margin: "0 0 16px 0", fontSize: 14 }}>
              Successfully connected to SmartSpec Web
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                background: "#f0fdf4",
                borderRadius: 8,
                border: "1px solid #bbf7d0",
              }}
            >
              <span style={{ color: "#166534", fontWeight: 600 }}>
                {user.credits.toLocaleString()} credits
              </span>
              <span style={{ color: "#6b7280" }}>•</span>
              <span style={{ color: "#6b7280", textTransform: "capitalize" }}>
                {user.plan} plan
              </span>
            </div>
            <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 16 }}>
              Redirecting to dashboard...
            </p>
          </div>
        )}

        {/* Error State */}
        {authState === "error" && (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 16px",
                background: "#fee2e2",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 style={{ margin: "0 0 8px 0", color: "#111827", fontSize: 20 }}>
              Authentication Failed
            </h2>
            <p style={{ color: "#dc2626", margin: "0 0 24px 0", fontSize: 14 }}>
              {error}
            </p>
            <button
              onClick={() => {
                setAuthState("idle");
                setError("");
                setDeviceCode(null);
              }}
              style={{
                padding: "12px 24px",
                background: "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
            Don't have an account?{" "}
            <a
              href={getWebUrl()}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#3b82f6", textDecoration: "none" }}
            >
              Sign up on SmartSpec Web
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
