import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function TokenExchange() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const generateToken = trpc.auth.generateAccessToken.useMutation();

  const tryGenerateFromMainSite = async () => {
    const response = await fetch("https://smartaihub.app/trpc/auth.generateAccessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ json: {} }),
    });

    const data = await response.json();
    const payload = data?.result?.data?.json;
    if (!response.ok || !payload?.accessToken || !payload?.user) {
      throw new Error(data?.error?.json?.message || "Main-site token exchange failed");
    }
    return payload as { accessToken: string; user: Record<string, unknown> };
  };

  useEffect(() => {
    const run = async () => {
      try {
        const result = await generateToken.mutateAsync();
        localStorage.setItem("docker_status_access_token", result.accessToken);
        localStorage.setItem("docker_status_user", JSON.stringify(result.user));
        setLocation("/");
      } catch (e) {
        console.warn("[TokenExchange] Local token exchange failed, trying main site:", e);
        try {
          const result = await tryGenerateFromMainSite();
          localStorage.setItem("docker_status_access_token", result.accessToken);
          localStorage.setItem("docker_status_user", JSON.stringify(result.user));
          setLocation("/");
        } catch (mainErr) {
          console.error("[TokenExchange] Main-site token exchange failed:", mainErr);
          setError("Unable to complete sign-in. Please login again with an admin account.");
        }
      }
    };

    void run();
  }, [generateToken, setLocation]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="w-full max-w-md bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20 mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Authentication failed</h1>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => setLocation("/login")}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 mb-4">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Signing in to Docker Status...</h1>
        <p className="text-gray-400 text-sm">Please wait</p>
      </div>
    </div>
  );
}
