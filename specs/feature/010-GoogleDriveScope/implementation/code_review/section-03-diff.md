diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 8db595a..5602db7 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -62,6 +62,7 @@ import GroupDetailPanel from "./components/groups/GroupDetailPanel";
 import Settings from "./pages/Settings";
 import SkillBrowser from "./pages/SkillBrowser";
 import DockerRedirect from "./pages/DockerRedirect";
+import GoogleDriveCallback from "./pages/GoogleDriveCallback";
 import DocPage from "./pages/DocPage";
 import About from "./pages/About";
 import Changelog from "./pages/Changelog";
@@ -144,6 +145,7 @@ function Router() {
       <Route path="/terms" component={Terms} />
       <Route path="/privacy" component={Privacy} />
       <Route path="/verify-email" component={VerifyEmail} />
+      <Route path="/auth/callback/google-drive" component={GoogleDriveCallback} />
       <Route path="/auth/callback/:provider" component={AuthCallback} />
       <Route path="/auth/device" component={DeviceAuth} />
       <Route path="/factory" component={Factory} />
diff --git a/apps/web/client/src/components/settings/GoogleDrivePanel.tsx b/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
new file mode 100644
index 0000000..b579619
--- /dev/null
+++ b/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
@@ -0,0 +1,182 @@
+/**
+ * Google Drive connection panel for the Settings > Integrations tab.
+ *
+ * Three states: not_connected, connected, expired.
+ * Uses popup OAuth flow with window.open -> callback page -> close.
+ */
+
+import { useState, useCallback } from "react";
+import { trpc } from "@/lib/trpc";
+import { toast } from "sonner";
+
+export function GoogleDrivePanel() {
+  const [isConnecting, setIsConnecting] = useState(false);
+
+  const statusQuery = trpc.googleDrive.getConnectionStatus.useQuery(
+    undefined,
+    { retry: false },
+  );
+  const authUrlQuery = trpc.googleDrive.getAuthUrl.useQuery(undefined, {
+    enabled: false,
+  });
+  const disconnectMutation = trpc.googleDrive.disconnect.useMutation({
+    onSuccess: () => {
+      toast.success("Google Drive disconnected");
+      statusQuery.refetch();
+    },
+    onError: (err) => {
+      toast.error(`Disconnect failed: ${err.message}`);
+    },
+  });
+
+  const handleConnect = useCallback(async () => {
+    setIsConnecting(true);
+    try {
+      const data = await authUrlQuery.refetch();
+      const url = data.data?.authorization_url;
+      if (!url) {
+        toast.error("Could not get authorization URL");
+        setIsConnecting(false);
+        return;
+      }
+
+      const popup = window.open(url, "_blank", "width=600,height=700");
+
+      // Poll for popup close
+      const timer = setInterval(() => {
+        if (popup && popup.closed) {
+          clearInterval(timer);
+          setIsConnecting(false);
+          statusQuery.refetch();
+        }
+      }, 500);
+    } catch (err: any) {
+      toast.error(`Connection failed: ${err.message}`);
+      setIsConnecting(false);
+    }
+  }, [authUrlQuery, statusQuery]);
+
+  const status = statusQuery.data?.status ?? "not_connected";
+  const email = statusQuery.data?.email;
+  const scopes = statusQuery.data?.scopes ?? [];
+  const connectedAt = statusQuery.data?.connectedAt;
+
+  return (
+    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
+      <div className="flex items-center gap-3 mb-4">
+        <svg
+          className="w-8 h-8"
+          viewBox="0 0 87.3 78"
+          xmlns="http://www.w3.org/2000/svg"
+        >
+          <path
+            d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.5c0 1.55.4 3.1 1.2 4.5z"
+            fill="#0066da"
+          />
+          <path
+            d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"
+            fill="#00ac47"
+          />
+          <path
+            d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.95 10.3z"
+            fill="#ea4335"
+          />
+          <path
+            d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
+            fill="#00832d"
+          />
+          <path
+            d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.8c1.6 0 3.15-.45 4.5-1.2z"
+            fill="#2684fc"
+          />
+          <path
+            d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
+            fill="#ffba00"
+          />
+        </svg>
+        <div>
+          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
+            Google Drive & Workspace
+          </h3>
+          <p className="text-sm text-gray-500 dark:text-gray-400">
+            Edit Word/Excel in Google Docs, AI-search Drive files
+          </p>
+        </div>
+      </div>
+
+      {status === "not_connected" && (
+        <div>
+          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
+            Connect your Google account to enable editing Word and Excel files in
+            Google Docs/Sheets, and AI-powered search across your Drive files.
+          </p>
+          <button
+            onClick={handleConnect}
+            disabled={isConnecting}
+            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
+          >
+            {isConnecting ? "Connecting..." : "Connect Google Drive"}
+          </button>
+        </div>
+      )}
+
+      {status === "connected" && (
+        <div>
+          <div className="flex items-center gap-2 mb-3">
+            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
+            <span className="text-sm font-medium text-green-700 dark:text-green-400">
+              Connected
+            </span>
+          </div>
+          {email && (
+            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
+              {email}
+            </p>
+          )}
+          {connectedAt && (
+            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
+              Connected {new Date(connectedAt).toLocaleDateString()}
+            </p>
+          )}
+          {scopes.length > 0 && (
+            <div className="flex flex-wrap gap-1 mb-4">
+              {scopes.map((s) => (
+                <span
+                  key={s}
+                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300"
+                >
+                  {s.split("/").pop()}
+                </span>
+              ))}
+            </div>
+          )}
+          <button
+            onClick={() => disconnectMutation.mutate()}
+            disabled={disconnectMutation.isPending}
+            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 text-sm font-medium"
+          >
+            {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
+          </button>
+        </div>
+      )}
+
+      {status === "expired" && (
+        <div>
+          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 mb-4">
+            <p className="text-sm text-yellow-800 dark:text-yellow-300">
+              Your Google Drive connection has expired. Reconnect to continue
+              using Drive features.
+            </p>
+          </div>
+          <button
+            onClick={handleConnect}
+            disabled={isConnecting}
+            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 text-sm font-medium"
+          >
+            {isConnecting ? "Reconnecting..." : "Reconnect"}
+          </button>
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/GoogleDriveCallback.tsx b/apps/web/client/src/pages/GoogleDriveCallback.tsx
new file mode 100644
index 0000000..4af102e
--- /dev/null
+++ b/apps/web/client/src/pages/GoogleDriveCallback.tsx
@@ -0,0 +1,116 @@
+/**
+ * Minimal OAuth callback page for Google Drive popup flow.
+ *
+ * Extracts code/state from URL, exchanges for tokens, then closes the popup.
+ */
+
+import { useEffect, useState } from "react";
+import { trpc } from "@/lib/trpc";
+
+export default function GoogleDriveCallback() {
+  const [status, setStatus] = useState<"loading" | "success" | "error">(
+    "loading",
+  );
+  const [errorMsg, setErrorMsg] = useState("");
+
+  const completeMutation = trpc.googleDrive.completeOAuth.useMutation({
+    onSuccess: () => {
+      setStatus("success");
+      setTimeout(() => window.close(), 1500);
+    },
+    onError: (err) => {
+      setStatus("error");
+      setErrorMsg(err.message);
+    },
+  });
+
+  useEffect(() => {
+    const params = new URLSearchParams(window.location.search);
+    const code = params.get("code");
+    const state = params.get("state");
+    const error = params.get("error");
+
+    if (error) {
+      setStatus("error");
+      setErrorMsg(error === "access_denied" ? "Access denied by user" : error);
+      return;
+    }
+
+    if (!code || !state) {
+      setStatus("error");
+      setErrorMsg("Missing authorization code or state");
+      return;
+    }
+
+    completeMutation.mutate({ code, state });
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, []);
+
+  return (
+    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
+      <div className="text-center p-8">
+        {status === "loading" && (
+          <>
+            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
+            <p className="text-gray-600 dark:text-gray-300">
+              Connecting Google Drive...
+            </p>
+          </>
+        )}
+        {status === "success" && (
+          <>
+            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
+              <svg
+                className="w-6 h-6 text-green-600 dark:text-green-400"
+                fill="none"
+                stroke="currentColor"
+                viewBox="0 0 24 24"
+              >
+                <path
+                  strokeLinecap="round"
+                  strokeLinejoin="round"
+                  strokeWidth={2}
+                  d="M5 13l4 4L19 7"
+                />
+              </svg>
+            </div>
+            <p className="text-green-700 dark:text-green-300 font-medium">
+              Connected! This window will close automatically.
+            </p>
+          </>
+        )}
+        {status === "error" && (
+          <>
+            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
+              <svg
+                className="w-6 h-6 text-red-600 dark:text-red-400"
+                fill="none"
+                stroke="currentColor"
+                viewBox="0 0 24 24"
+              >
+                <path
+                  strokeLinecap="round"
+                  strokeLinejoin="round"
+                  strokeWidth={2}
+                  d="M6 18L18 6M6 6l12 12"
+                />
+              </svg>
+            </div>
+            <p className="text-red-700 dark:text-red-300 font-medium mb-2">
+              Connection failed
+            </p>
+            <p className="text-sm text-gray-500 dark:text-gray-400">
+              {errorMsg}
+            </p>
+            <button
+              onClick={() => window.close()}
+              className="mt-4 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
+            >
+              Close
+            </button>
+          </>
+        )}
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Settings.tsx b/apps/web/client/src/pages/Settings.tsx
index 4e3c125..ac35871 100644
--- a/apps/web/client/src/pages/Settings.tsx
+++ b/apps/web/client/src/pages/Settings.tsx
@@ -51,10 +51,12 @@ import {
   ShieldCheck,
   ShieldOff,
   Send,
+  Link2,
 } from 'lucide-react';
 import { QRCodeSVG } from 'qrcode.react';
+import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
 
-type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'api' | 'billing';
+type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'api' | 'billing' | 'integrations';
 
 type TwoFAStep = 'idle' | 'setup' | 'verify' | 'done' | 'disable' | 'regen';
 
@@ -545,6 +547,7 @@ export default function Settings() {
     { id: 'preferences', label: 'Preferences', icon: Palette },
     { id: 'api', label: 'API Keys', icon: Key },
     { id: 'billing', label: 'Billing', icon: CreditCard },
+    { id: 'integrations', label: 'Integrations', icon: Link2 },
   ];
 
   const handleSave = () => {
@@ -1461,6 +1464,17 @@ export default function Settings() {
                   </div>
                 </div>
               )}
+
+              {/* Integrations Tab */}
+              {activeTab === 'integrations' && (
+                <div className="space-y-6">
+                  <div>
+                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Integrations</h2>
+                    <p className="text-gray-600 dark:text-gray-400">Connect external services to enhance your workflow</p>
+                  </div>
+                  <GoogleDrivePanel />
+                </div>
+              )}
             </div>
           </motion.div>
         </div>
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index e5fc624..80d76b4 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -56,6 +56,7 @@ import { libraryRouter } from "./routers/library";
 import { libraryOpsRouter } from "./routers/libraryOps";
 import { factoryRouter } from "./routers/factory";
 import { groupsRouter } from "./routers/groups";
+import { googleDriveRouter } from "./routers/googleDrive";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1218,6 +1219,9 @@ export const appRouter = router({
   // Factory workflow/settings API
   factory: factoryRouter,
 
+  // Google Drive integration (OAuth, sync, editing)
+  googleDrive: googleDriveRouter,
+
   // Skills management and prompt enhancement
   skills: skillsRouter,
 
diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
new file mode 100644
index 0000000..1d36c95
--- /dev/null
+++ b/apps/web/server/routers/googleDrive.ts
@@ -0,0 +1,123 @@
+/**
+ * Google Drive integration tRPC router.
+ *
+ * Proxies requests to the Python backend's Drive OAuth endpoints.
+ * Follows the same pattern as media.ts for Python backend communication.
+ */
+
+import { z } from "zod";
+import { protectedProcedure, router } from "../_core/trpc";
+import { signBearerToken } from "../_core/tokens";
+
+const PYTHON_BACKEND_URL =
+  process.env.PYTHON_BACKEND_URL ||
+  process.env.VITE_PYTHON_BACKEND_URL ||
+  "http://localhost:8000";
+
+function createDriveToken(userId: number): string {
+  return signBearerToken(
+    {
+      sub: String(userId),
+      type: "access",
+      scopes: ["drive:manage"],
+    },
+    "15m",
+  );
+}
+
+export const googleDriveRouter = router({
+  /**
+   * Get the user's Google Drive connection status.
+   */
+  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
+    const token = createDriveToken(ctx.user.id);
+    const resp = await fetch(
+      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`,
+      {
+        headers: { Authorization: `Bearer ${token}` },
+      },
+    );
+    if (!resp.ok) {
+      const err = await resp.json().catch(() => ({}));
+      throw new Error(err.detail || "Failed to get connection status");
+    }
+    return resp.json() as Promise<{
+      status: "not_connected" | "connected" | "expired";
+      email: string | null;
+      scopes: string[];
+      connectedAt: string | null;
+    }>;
+  }),
+
+  /**
+   * Get the Google OAuth authorization URL with Drive scopes.
+   */
+  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
+    const token = createDriveToken(ctx.user.id);
+    const resp = await fetch(
+      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/authorize`,
+      {
+        headers: { Authorization: `Bearer ${token}` },
+      },
+    );
+    if (!resp.ok) {
+      const err = await resp.json().catch(() => ({}));
+      throw new Error(err.detail || "Failed to get auth URL");
+    }
+    return resp.json() as Promise<{
+      authorization_url: string;
+      state: string;
+    }>;
+  }),
+
+  /**
+   * Complete the OAuth flow by exchanging the code for tokens.
+   */
+  completeOAuth: protectedProcedure
+    .input(z.object({ code: z.string(), state: z.string() }))
+    .mutation(async ({ ctx, input }) => {
+      const token = createDriveToken(ctx.user.id);
+      const resp = await fetch(
+        `${PYTHON_BACKEND_URL}/api/oauth/google/drive/callback`,
+        {
+          method: "POST",
+          headers: {
+            Authorization: `Bearer ${token}`,
+            "Content-Type": "application/json",
+          },
+          body: JSON.stringify({
+            code: input.code,
+            state: input.state,
+          }),
+        },
+      );
+      if (!resp.ok) {
+        const err = await resp.json().catch(() => ({}));
+        throw new Error(err.detail || "OAuth exchange failed");
+      }
+      return resp.json() as Promise<{
+        email: string;
+        scopes: string[];
+        status: string;
+      }>;
+    }),
+
+  /**
+   * Disconnect Google Drive for the current user.
+   */
+  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
+    const token = createDriveToken(ctx.user.id);
+    const resp = await fetch(
+      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/disconnect`,
+      {
+        method: "DELETE",
+        headers: { Authorization: `Bearer ${token}` },
+      },
+    );
+    if (!resp.ok) {
+      const err = await resp.json().catch(() => ({}));
+      throw new Error(err.detail || "Disconnect failed");
+    }
+    return resp.json() as Promise<{ success: boolean }>;
+  }),
+});
diff --git a/python-backend/app/api/oauth.py b/python-backend/app/api/oauth.py
index 8c56611..3fbbf81 100644
--- a/python-backend/app/api/oauth.py
+++ b/python-backend/app/api/oauth.py
@@ -15,6 +15,7 @@ from app.core.database import get_db
 from app.core.auth import get_current_user
 from app.core.oauth_config import get_oauth_config
 from app.services.oauth_service import OAuthService
+from app.services.google_token_service import GoogleTokenService, InvalidGrantError
 from app.models.user import User
 
 router = APIRouter(prefix="/api/oauth", tags=["oauth"])
@@ -360,3 +361,75 @@ async def get_oauth_connections(
             for conn in connections
         ]
     }
+
+
+# ─── Google Drive OAuth (per-user incremental consent) ───
+
+
+class DriveCallbackRequest(BaseModel):
+    code: str
+    state: str
+
+
+@router.get("/google/drive/authorize")
+async def drive_authorize(
+    current_user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+):
+    """Get Google OAuth URL with Drive scopes for an authenticated user."""
+    try:
+        svc = GoogleTokenService(db)
+        return await svc.build_drive_auth_url(user_id=current_user.id)
+    except ValueError as e:
+        raise HTTPException(
+            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+            detail=str(e),
+        )
+
+
+@router.post("/google/drive/callback")
+async def drive_callback(
+    request: DriveCallbackRequest,
+    current_user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+):
+    """Exchange Drive OAuth code for tokens and store them."""
+    try:
+        svc = GoogleTokenService(db)
+        result = await svc.exchange_drive_code(
+            user_id=current_user.id,
+            code=request.code,
+            state=request.state,
+        )
+        return result
+    except ValueError as e:
+        raise HTTPException(
+            status_code=status.HTTP_400_BAD_REQUEST,
+            detail=str(e),
+        )
+
+
+@router.get("/google/drive/status")
+async def drive_status(
+    current_user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+):
+    """Get the current user's Google Drive connection status."""
+    svc = GoogleTokenService(db)
+    return await svc.get_connection_status(user_id=current_user.id)
+
+
+@router.delete("/google/drive/disconnect")
+async def drive_disconnect(
+    current_user: User = Depends(get_current_user),
+    db: AsyncSession = Depends(get_db),
+):
+    """Disconnect Google Drive for the current user."""
+    svc = GoogleTokenService(db)
+    success = await svc.disconnect(user_id=current_user.id)
+    if not success:
+        raise HTTPException(
+            status_code=status.HTTP_404_NOT_FOUND,
+            detail="No Google Drive connection found",
+        )
+    return {"success": True}
diff --git a/python-backend/app/services/google_token_service.py b/python-backend/app/services/google_token_service.py
new file mode 100644
index 0000000..4c8e3b3
--- /dev/null
+++ b/python-backend/app/services/google_token_service.py
@@ -0,0 +1,269 @@
+"""
+GoogleTokenService -- manages per-user Google OAuth token lifecycle for Drive integration.
+
+Separate from the login OAuth flow (which creates/authenticates users).
+This manages tokens for authenticated users who connect Google Drive.
+"""
+
+import logging
+from datetime import datetime, timedelta, timezone
+from typing import Optional
+from urllib.parse import quote
+
+import httpx
+from sqlalchemy import select
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.core.oauth_config import get_oauth_config
+from app.models.oauth import OAuthConnection
+from app.services.oauth_service import OAuthService
+
+logger = logging.getLogger(__name__)
+
+# Drive scopes for incremental consent
+DRIVE_SCOPES = [
+    "https://www.googleapis.com/auth/drive.readonly",
+    "https://www.googleapis.com/auth/drive.file",
+    "https://www.googleapis.com/auth/documents.readonly",
+    "https://www.googleapis.com/auth/spreadsheets.readonly",
+]
+
+GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
+GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
+
+# Refresh buffer: refresh if token expires within this window
+REFRESH_BUFFER = timedelta(minutes=5)
+
+
+class InvalidGrantError(Exception):
+    """Raised when Google returns invalid_grant during token refresh."""
+    pass
+
+
+class GoogleTokenService:
+    """Manages Google OAuth tokens for Drive integration."""
+
+    def __init__(self, db: AsyncSession):
+        self.db = db
+
+    async def _get_connection(self, user_id: int) -> Optional[OAuthConnection]:
+        """Get the user's Google OAuth connection."""
+        result = await self.db.execute(
+            select(OAuthConnection).where(
+                OAuthConnection.user_id == str(user_id),
+                OAuthConnection.provider == "google",
+            )
+        )
+        return result.scalar_one_or_none()
+
+    async def get_valid_access_token(self, user_id: int) -> str:
+        """
+        Returns a valid access token, refreshing if near expiry.
+        Raises InvalidGrantError if refresh fails with invalid_grant.
+        """
+        conn = await self._get_connection(user_id)
+        if not conn:
+            raise ValueError("No Google connection found for this user")
+
+        now = datetime.now(timezone.utc)
+        expires_at = conn.token_expires_at
+        if expires_at and expires_at.tzinfo is None:
+            expires_at = expires_at.replace(tzinfo=timezone.utc)
+
+        # Return cached token if not near expiry
+        if expires_at and (expires_at - now) > REFRESH_BUFFER:
+            return conn.access_token
+
+        # Refresh the token
+        return await self._refresh_token(conn)
+
+    async def _refresh_token(self, conn: OAuthConnection) -> str:
+        """Refresh the access token using the stored refresh_token."""
+        if not conn.refresh_token:
+            conn.status = "expired"
+            await self.db.commit()
+            raise InvalidGrantError("No refresh token available")
+
+        cfg = await get_oauth_config(self.db)
+        client_id = cfg.get("googleClientId", "")
+        client_secret = cfg.get("googleClientSecret", "")
+
+        async with httpx.AsyncClient() as client:
+            resp = await client.post(
+                GOOGLE_TOKEN_URL,
+                data={
+                    "client_id": client_id,
+                    "client_secret": client_secret,
+                    "refresh_token": conn.refresh_token,
+                    "grant_type": "refresh_token",
+                },
+            )
+
+        data = resp.json()
+
+        if resp.status_code != 200 or "error" in data:
+            error = data.get("error", "unknown_error")
+            if error == "invalid_grant":
+                conn.status = "expired"
+                await self.db.commit()
+                raise InvalidGrantError(f"Google token refresh failed: {error}")
+            raise ValueError(f"Token refresh failed: {error}")
+
+        # Update stored tokens
+        conn.access_token = data["access_token"]
+        if "refresh_token" in data:
+            conn.refresh_token = data["refresh_token"]
+        conn.token_expires_at = datetime.now(timezone.utc) + timedelta(
+            seconds=data.get("expires_in", 3600)
+        )
+        conn.status = "active"
+        await self.db.commit()
+
+        logger.info("Refreshed Google access token for user %s", conn.user_id)
+        return conn.access_token
+
+    async def build_drive_auth_url(self, user_id: int) -> dict:
+        """Build Google OAuth URL with Drive scopes for incremental consent."""
+        cfg = await get_oauth_config(self.db)
+        client_id = cfg.get("googleClientId", "")
+        redirect_uri = cfg.get(
+            "googleRedirectUri",
+            "https://smartaihub.app/auth/callback/google-drive",
+        )
+
+        if not client_id:
+            raise ValueError("Google OAuth is not configured")
+
+        oauth_service = OAuthService(self.db)
+        state = oauth_service.generate_oauth_state()
+
+        scope = " ".join(DRIVE_SCOPES)
+
+        auth_url = (
+            f"https://accounts.google.com/o/oauth2/v2/auth"
+            f"?client_id={quote(client_id, safe='')}"
+            f"&redirect_uri={quote(redirect_uri, safe='')}"
+            f"&response_type=code"
+            f"&scope={quote(scope, safe='')}"
+            f"&include_granted_scopes=true"
+            f"&access_type=offline"
+            f"&prompt=consent"
+            f"&state={quote(state, safe='')}"
+        )
+
+        return {"authorization_url": auth_url, "state": state}
+
+    async def exchange_drive_code(
+        self, user_id: int, code: str, state: str
+    ) -> dict:
+        """Exchange authorization code for tokens and store them."""
+        cfg = await get_oauth_config(self.db)
+        client_id = cfg.get("googleClientId", "")
+        client_secret = cfg.get("googleClientSecret", "")
+        redirect_uri = cfg.get(
+            "googleRedirectUri",
+            "https://smartaihub.app/auth/callback/google-drive",
+        )
+
+        # Exchange code for tokens
+        async with httpx.AsyncClient() as client:
+            token_resp = await client.post(
+                GOOGLE_TOKEN_URL,
+                data={
+                    "client_id": client_id,
+                    "client_secret": client_secret,
+                    "code": code,
+                    "redirect_uri": redirect_uri,
+                    "grant_type": "authorization_code",
+                },
+            )
+
+        token_data = token_resp.json()
+        if token_resp.status_code != 200 or "error" in token_data:
+            error = token_data.get("error_description", token_data.get("error", "unknown"))
+            raise ValueError(f"Token exchange failed: {error}")
+
+        access_token = token_data["access_token"]
+        refresh_token = token_data.get("refresh_token")
+        expires_in = token_data.get("expires_in", 3600)
+        granted_scopes = token_data.get("scope", "").split()
+
+        # Fetch user email from Google
+        async with httpx.AsyncClient() as client:
+            userinfo_resp = await client.get(
+                GOOGLE_USERINFO_URL,
+                headers={"Authorization": f"Bearer {access_token}"},
+            )
+
+        email = None
+        if userinfo_resp.status_code == 200:
+            email = userinfo_resp.json().get("email")
+
+        # Upsert oauth_connections
+        existing = await self._get_connection(user_id)
+        if existing:
+            existing.access_token = access_token
+            if refresh_token:
+                existing.refresh_token = refresh_token
+            existing.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
+            existing.status = "active"
+            existing.scopes = ",".join(granted_scopes)
+        else:
+            new_conn = OAuthConnection(
+                user_id=str(user_id),
+                provider="google",
+                provider_user_id=email or str(user_id),
+                access_token=access_token,
+                refresh_token=refresh_token,
+                token_expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
+                status="active",
+                scopes=",".join(granted_scopes),
+            )
+            self.db.add(new_conn)
+
+        await self.db.commit()
+
+        return {
+            "email": email,
+            "scopes": granted_scopes,
+            "status": "connected",
+        }
+
+    async def get_connection_status(self, user_id: int) -> dict:
+        """Get current Google Drive connection status."""
+        conn = await self._get_connection(user_id)
+        if not conn:
+            return {
+                "status": "not_connected",
+                "email": None,
+                "scopes": [],
+                "connectedAt": None,
+            }
+
+        email = await self._get_email_from_connection(conn)
+        scopes = conn.scopes.split(",") if conn.scopes else []
+
+        status = "connected" if conn.status == "active" else conn.status
+
+        return {
+            "status": status,
+            "email": email,
+            "scopes": scopes,
+            "connectedAt": conn.created_at.isoformat() if conn.created_at else None,
+        }
+
+    async def _get_email_from_connection(self, conn: OAuthConnection) -> Optional[str]:
+        """Extract email from connection (provider_user_id stores email for Google)."""
+        pid = conn.provider_user_id
+        if pid and "@" in pid:
+            return pid
+        return None
+
+    async def disconnect(self, user_id: int) -> bool:
+        """Remove the Google Drive connection (simple version)."""
+        conn = await self._get_connection(user_id)
+        if not conn:
+            return False
+        await self.db.delete(conn)
+        await self.db.commit()
+        return True
diff --git a/python-backend/tests/test_google_token_service.py b/python-backend/tests/test_google_token_service.py
new file mode 100644
index 0000000..22602ed
--- /dev/null
+++ b/python-backend/tests/test_google_token_service.py
@@ -0,0 +1,242 @@
+"""
+Tests for GoogleTokenService -- token lifecycle management for per-user Google Drive OAuth.
+"""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from datetime import datetime, timedelta, timezone
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+class TestGoogleTokenService:
+    """Tests for GoogleTokenService token lifecycle management."""
+
+    async def test_get_valid_access_token_returns_cached_when_not_expired(self):
+        """Token returned directly when not within 5 min of expiry."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        future_expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
+        mock_conn = MagicMock(
+            access_token="valid-access-token",
+            refresh_token="refresh-tok",
+            token_expires_at=future_expiry,
+            status="active",
+        )
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = mock_conn
+        mock_db.execute.return_value = mock_result
+
+        svc = GoogleTokenService(mock_db)
+        token = await svc.get_valid_access_token(user_id=1)
+        assert token == "valid-access-token"
+
+    async def test_get_valid_access_token_refreshes_when_near_expiry(self):
+        """Token refreshed when within 5 minutes of expiry."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        near_expiry = datetime.now(timezone.utc) + timedelta(minutes=3)
+        mock_conn = MagicMock(
+            access_token="old-token",
+            refresh_token="refresh-tok",
+            token_expires_at=near_expiry,
+            status="active",
+            user_id=1,
+            provider="google",
+        )
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = mock_conn
+        mock_db.execute.return_value = mock_result
+
+        svc = GoogleTokenService(mock_db)
+
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {
+            "access_token": "new-access-token",
+            "expires_in": 3600,
+        }
+
+        with patch("app.services.google_token_service.httpx") as mock_httpx, \
+             patch("app.services.google_token_service.get_oauth_config") as mock_cfg:
+            mock_cfg.return_value = {
+                "googleClientId": "test-id.apps.googleusercontent.com",
+                "googleClientSecret": "test-secret",
+            }
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=None)
+            mock_client.post.return_value = mock_response
+            mock_httpx.AsyncClient.return_value = mock_client
+
+            token = await svc.get_valid_access_token(user_id=1)
+            assert token == "new-access-token"
+            mock_client.post.assert_called_once()
+
+    async def test_get_valid_access_token_raises_invalid_grant(self):
+        """InvalidGrantError raised and status set to 'expired' on invalid_grant."""
+        from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+
+        mock_db = AsyncMock()
+        expired = datetime.now(timezone.utc) - timedelta(minutes=10)
+        mock_conn = MagicMock(
+            access_token="expired-token",
+            refresh_token="refresh-tok",
+            token_expires_at=expired,
+            status="active",
+            user_id=1,
+            provider="google",
+        )
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = mock_conn
+        mock_db.execute.return_value = mock_result
+
+        svc = GoogleTokenService(mock_db)
+
+        mock_response = MagicMock()
+        mock_response.status_code = 400
+        mock_response.json.return_value = {"error": "invalid_grant"}
+
+        with patch("app.services.google_token_service.httpx") as mock_httpx, \
+             patch("app.services.google_token_service.get_oauth_config") as mock_cfg:
+            mock_cfg.return_value = {
+                "googleClientId": "test-id.apps.googleusercontent.com",
+                "googleClientSecret": "test-secret",
+            }
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=None)
+            mock_client.post.return_value = mock_response
+            mock_httpx.AsyncClient.return_value = mock_client
+
+            with pytest.raises(InvalidGrantError):
+                await svc.get_valid_access_token(user_id=1)
+            assert mock_conn.status == "expired"
+
+    async def test_build_drive_auth_url_includes_correct_scopes(self):
+        """Auth URL contains Drive scopes and incremental consent params."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        svc = GoogleTokenService(mock_db)
+
+        with patch("app.services.google_token_service.get_oauth_config") as mock_cfg, \
+             patch("app.services.google_token_service.OAuthService") as mock_oauth_svc_cls:
+            mock_cfg.return_value = {
+                "googleClientId": "test.apps.googleusercontent.com",
+                "googleClientSecret": "secret",
+                "googleRedirectUri": "https://smartaihub.app/auth/callback/google-drive",
+            }
+            mock_oauth_svc = MagicMock()
+            mock_oauth_svc.generate_oauth_state.return_value = "test-state"
+            mock_oauth_svc_cls.return_value = mock_oauth_svc
+
+            result = await svc.build_drive_auth_url(user_id=1)
+            url = result["authorization_url"]
+            assert "drive.readonly" in url
+            assert "drive.file" in url
+            assert "include_granted_scopes=true" in url
+            assert "access_type=offline" in url
+            assert "prompt=consent" in url
+            assert result["state"] == "test-state"
+
+    async def test_exchange_drive_code_stores_tokens(self):
+        """exchange_drive_code stores tokens and returns email + scopes."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        # No existing connection
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = None
+        mock_db.execute.return_value = mock_result
+
+        svc = GoogleTokenService(mock_db)
+
+        token_response = MagicMock()
+        token_response.status_code = 200
+        token_response.json.return_value = {
+            "access_token": "new-access",
+            "refresh_token": "new-refresh",
+            "expires_in": 3600,
+            "scope": "https://www.googleapis.com/auth/drive.readonly openid email",
+        }
+
+        userinfo_response = MagicMock()
+        userinfo_response.status_code = 200
+        userinfo_response.json.return_value = {
+            "email": "user@example.com",
+        }
+
+        with patch("app.services.google_token_service.httpx") as mock_httpx, \
+             patch("app.services.google_token_service.get_oauth_config") as mock_cfg, \
+             patch("app.services.google_token_service.OAuthService") as mock_oauth_svc_cls:
+            mock_cfg.return_value = {
+                "googleClientId": "test.apps.googleusercontent.com",
+                "googleClientSecret": "secret",
+                "googleRedirectUri": "https://smartaihub.app/auth/callback/google-drive",
+            }
+            mock_oauth_svc = MagicMock()
+            mock_oauth_svc_cls.return_value = mock_oauth_svc
+
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=None)
+            mock_client.post.return_value = token_response
+            mock_client.get.return_value = userinfo_response
+            mock_httpx.AsyncClient.return_value = mock_client
+
+            result = await svc.exchange_drive_code(user_id=1, code="auth-code", state="state")
+            assert result["email"] == "user@example.com"
+            assert any("drive.readonly" in s for s in result["scopes"])
+            mock_db.add.assert_called_once()
+
+    async def test_get_connection_status_not_connected(self):
+        """Returns not_connected when no OAuth connection exists."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = None
+        mock_db.execute.return_value = mock_result
+
+        svc = GoogleTokenService(mock_db)
+        status = await svc.get_connection_status(user_id=1)
+        assert status["status"] == "not_connected"
+
+    async def test_get_connection_status_connected(self):
+        """Returns connected with email and scopes when connection exists."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        mock_conn = MagicMock(
+            status="active",
+            scopes="openid,email,drive.readonly",
+            created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
+        )
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = mock_conn
+        mock_db.execute.return_value = mock_result
+
+        with patch("app.services.google_token_service.GoogleTokenService._get_email_from_connection") as mock_email:
+            mock_email.return_value = "user@example.com"
+            svc = GoogleTokenService(mock_db)
+            result = await svc.get_connection_status(user_id=1)
+            assert result["status"] == "connected"
+            assert result["email"] == "user@example.com"
+            assert any("drive.readonly" in s for s in result["scopes"])
+
+    async def test_disconnect_deletes_connection(self):
+        """disconnect removes the oauth_connections row."""
+        from app.services.google_token_service import GoogleTokenService
+
+        mock_db = AsyncMock()
+        mock_conn = MagicMock()
+        mock_result = MagicMock()
+        mock_result.scalar_one_or_none.return_value = mock_conn
+        mock_db.execute.return_value = mock_result
+
+        svc = GoogleTokenService(mock_db)
+        result = await svc.disconnect(user_id=1)
+        assert result is True
+        mock_db.delete.assert_called_once_with(mock_conn)
