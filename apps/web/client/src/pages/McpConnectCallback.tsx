import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export default function McpConnectCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const complete = trpc.mcpConnections.completeOAuth.useMutation({
    onSuccess: () => {
      setStatus("success");
      window.opener?.postMessage({ type: "mcp-connect:success" }, window.location.origin);
      setTimeout(() => window.close(), 1200);
    },
    onError: (error) => {
      setStatus("error");
      setErrorMsg(error.message);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const providerKey = params.get("provider") ?? params.get("providerKey");
    const error = params.get("error");
    if (error) {
      setStatus("error");
      setErrorMsg(error);
      return;
    }
    if (!code || !state || (providerKey !== "magnific" && providerKey !== "higgsfield")) {
      setStatus("error");
      setErrorMsg("Missing MCP authorization data");
      return;
    }
    complete.mutate({ code, state, providerKey });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="text-center">
        {status === "loading" && <p className="text-gray-600">Connecting MCP provider...</p>}
        {status === "success" && <p className="font-medium text-green-700">Connected. This window will close automatically.</p>}
        {status === "error" && (
          <>
            <p className="font-medium text-red-700">Connection failed</p>
            <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
            <button className="mt-4 rounded bg-gray-100 px-4 py-2 text-sm" onClick={() => window.close()}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
