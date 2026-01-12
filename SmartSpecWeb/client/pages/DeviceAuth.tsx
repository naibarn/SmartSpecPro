/**
 * Device Authorization Page
 * 
 * Allows users to authorize desktop app by entering user code
 */

import { useState, useEffect, FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { trpc } from "../trpc";

type AuthState = "input" | "loading" | "confirming" | "success" | "error";

interface DeviceInfo {
  status: string;
  user_code: string;
  scopes: string[];
  expires_in: number;
}

export default function DeviceAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("input");
  const [userCode, setUserCode] = useState(searchParams.get("user_code") || "");
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState("");

  // Check if user is logged in
  const { data: currentUser, isLoading: userLoading } = trpc.auth.me.useQuery();

  // Auto-verify if code is in URL
  useEffect(() => {
    const code = searchParams.get("user_code");
    if (code && code.length >= 8) {
      verifyCode(code);
    }
  }, [searchParams]);

  // Verify user code
  const verifyCode = async (code: string) => {
    setAuthState("loading");
    setError("");

    try {
      const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const response = await fetch(`/api/auth/device/verify?user_code=${cleanCode}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Invalid code");
      }

      if (data.status === "authorized") {
        setAuthState("success");
        return;
      }

      setDeviceInfo(data);
      setAuthState("confirming");
    } catch (err: any) {
      setError(err.message || "Failed to verify code");
      setAuthState("error");
    }
  };

  // Authorize device
  const authorizeDevice = async () => {
    if (!currentUser) {
      // Redirect to login with return URL
      const returnUrl = `/auth/device?user_code=${userCode}`;
      navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }

    setAuthState("loading");
    setError("");

    try {
      const response = await fetch("/api/auth/device/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_code: userCode }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Authorization failed");
      }

      setAuthState("success");
    } catch (err: any) {
      setError(err.message || "Failed to authorize device");
      setAuthState("error");
    }
  };

  // Handle form submit
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (userCode.length >= 8) {
      verifyCode(userCode);
    }
  };

  // Format user code input
  const handleCodeChange = (value: string) => {
    // Remove non-alphanumeric and format
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length <= 8) {
      // Add dash after 4 characters
      if (clean.length > 4) {
        setUserCode(`${clean.slice(0, 4)}-${clean.slice(4)}`);
      } else {
        setUserCode(clean);
      }
    }
  };

  // Scope descriptions
  const scopeDescriptions: Record<string, string> = {
    "llm:chat": "Use AI chat features",
    "mcp:read": "Read workspace files",
    "mcp:write": "Write workspace files",
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Authorize Desktop App
          </h1>
          <p className="text-gray-500 mt-2">
            Enter the code shown in SmartSpec Pro
          </p>
        </div>

        {/* Input State */}
        {authState === "input" && (
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Device Code
              </label>
              <input
                type="text"
                value={userCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="XXXX-XXXX"
                className="w-full px-4 py-3 text-2xl text-center font-mono tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={userCode.replace(/-/g, "").length < 8}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Continue
            </button>
          </form>
        )}

        {/* Loading State */}
        {authState === "loading" && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Verifying code...</p>
          </div>
        )}

        {/* Confirming State */}
        {authState === "confirming" && deviceInfo && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 mb-2">
                A desktop application is requesting access to your account:
              </p>
              <div className="font-mono text-lg text-center py-2 bg-white rounded border border-blue-200">
                {deviceInfo.user_code}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Requested permissions:
              </h3>
              <ul className="space-y-2">
                {deviceInfo.scopes.map((scope) => (
                  <li key={scope} className="flex items-center text-sm text-gray-600">
                    <svg
                      className="w-4 h-4 text-green-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {scopeDescriptions[scope] || scope}
                  </li>
                ))}
              </ul>
            </div>

            {!currentUser && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800">
                  You need to sign in to authorize this device.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setAuthState("input");
                  setDeviceInfo(null);
                }}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={authorizeDevice}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                {currentUser ? "Authorize" : "Sign in & Authorize"}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center mt-4">
              Expires in {Math.floor(deviceInfo.expires_in / 60)}:{(deviceInfo.expires_in % 60).toString().padStart(2, "0")}
            </p>
          </div>
        )}

        {/* Success State */}
        {authState === "success" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Device Authorized!
            </h2>
            <p className="text-gray-500">
              You can now close this window and return to the desktop app.
            </p>
          </div>
        )}

        {/* Error State */}
        {authState === "error" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Authorization Failed
            </h2>
            <p className="text-red-600 mb-6">{error}</p>
            <button
              onClick={() => {
                setAuthState("input");
                setError("");
                setUserCode("");
              }}
              className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            Make sure you're authorizing a device you trust.
            <br />
            SmartSpec Pro will have access to your credits.
          </p>
        </div>
      </div>
    </div>
  );
}
