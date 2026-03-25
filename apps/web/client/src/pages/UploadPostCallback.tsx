/**
 * Minimal Upload-Post callback page for popup flow.
 *
 * Completes the nonce handshake, then closes the popup.
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export default function UploadPostCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const completeMutation = trpc.uploadPost.completeConnection.useMutation({
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
    const connectionId = params.get("connectionId");
    const nonce = params.get("nonce");

    if (!connectionId || !nonce) {
      setStatus("error");
      setErrorMsg("Missing connectionId or nonce");
      return;
    }

    const parsed = Number(connectionId);
    if (!Number.isFinite(parsed)) {
      setStatus("error");
      setErrorMsg("Invalid connectionId");
      return;
    }

    completeMutation.mutate({ connectionId: parsed, nonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-50">
      <div className="text-center p-8">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="text-slate-600">Completing Upload-Post connection...</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium text-emerald-700">Connected. This window will close automatically.</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="mb-2 font-medium text-red-700">Connection failed</p>
            <p className="text-sm text-slate-500">{errorMsg}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 rounded bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
