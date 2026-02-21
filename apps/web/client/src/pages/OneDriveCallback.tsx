/**
 * Minimal OAuth callback page for OneDrive popup flow.
 *
 * Extracts code/state from URL, exchanges for tokens, then closes the popup.
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export default function OneDriveCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState("");

  const completeMutation = trpc.oneDrive.completeOAuth.useMutation({
    onSuccess: () => {
      setStatus("success");
      setTimeout(() => window.close(), 1500);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMsg(err.message);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg(error === "access_denied" ? "Access denied by user" : error);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing authorization code or state");
      return;
    }

    completeMutation.mutate({ code, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-8">
        {status === "loading" && (
          <>
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">
              Connecting OneDrive...
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-green-600 dark:text-green-400"
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
            <p className="text-green-700 dark:text-green-300 font-medium">
              Connected! This window will close automatically.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-red-600 dark:text-red-400"
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
            <p className="text-red-700 dark:text-red-300 font-medium mb-2">
              Connection failed
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {errorMsg}
            </p>
            <button
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
