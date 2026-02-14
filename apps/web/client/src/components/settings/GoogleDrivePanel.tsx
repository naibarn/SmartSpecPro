/**
 * Google Drive connection panel for the Settings > Integrations tab.
 *
 * Three states: not_connected, connected, expired.
 * Uses popup OAuth flow with window.open -> callback page -> close.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function GoogleDrivePanel() {
  const [isConnecting, setIsConnecting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const statusQuery = trpc.googleDrive.getConnectionStatus.useQuery(
    undefined,
    { retry: false },
  );
  const authUrlQuery = trpc.googleDrive.getAuthUrl.useQuery(undefined, {
    enabled: false,
  });
  const disconnectMutation = trpc.googleDrive.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google Drive disconnected");
      statusQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Disconnect failed: ${err.message}`);
    },
  });

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const data = await authUrlQuery.refetch();
      const url = data.data?.authorization_url;
      if (!url) {
        toast.error("Could not get authorization URL");
        setIsConnecting(false);
        return;
      }

      const popup = window.open(url, "_blank", "width=600,height=700");

      // Poll for popup close, with cleanup via ref
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (popup && popup.closed) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setIsConnecting(false);
          statusQuery.refetch();
        }
      }, 500);
    } catch (err: any) {
      toast.error(`Connection failed: ${err.message}`);
      setIsConnecting(false);
    }
  }, [authUrlQuery, statusQuery]);

  const status = statusQuery.data?.status ?? "not_connected";
  const email = statusQuery.data?.email;
  const scopes = statusQuery.data?.scopes ?? [];
  const connectedAt = statusQuery.data?.connectedAt;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center gap-3 mb-4">
        <svg
          className="w-8 h-8"
          viewBox="0 0 87.3 78"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.5c0 1.55.4 3.1 1.2 4.5z"
            fill="#0066da"
          />
          <path
            d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
            fill="#00ac47"
          />
          <path
            d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.95 10.3z"
            fill="#ea4335"
          />
          <path
            d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
            fill="#00832d"
          />
          <path
            d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.8c1.6 0 3.15-.45 4.5-1.2z"
            fill="#2684fc"
          />
          <path
            d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
            fill="#ffba00"
          />
        </svg>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Google Drive & Workspace
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Edit Word/Excel in Google Docs, AI-search Drive files
          </p>
        </div>
      </div>

      {status === "not_connected" && (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Connect your Google account to enable editing Word and Excel files in
            Google Docs/Sheets, and AI-powered search across your Drive files.
          </p>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {isConnecting ? "Connecting..." : "Connect Google Drive"}
          </button>
        </div>
      )}

      {status === "connected" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Connected
            </span>
          </div>
          {email && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {email}
            </p>
          )}
          {connectedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Connected {new Date(connectedAt).toLocaleDateString()}
            </p>
          )}
          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {scopes.map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300"
                >
                  {s.split("/").pop()}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 text-sm font-medium"
          >
            {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      )}

      {status === "expired" && (
        <div>
          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Your Google Drive connection has expired. Reconnect to continue
              using Drive features.
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 text-sm font-medium"
          >
            {isConnecting ? "Reconnecting..." : "Reconnect"}
          </button>
        </div>
      )}
    </div>
  );
}
