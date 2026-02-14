/**
 * Google Drive integration tRPC router.
 *
 * Proxies requests to the Python backend's Drive OAuth endpoints.
 * Follows the same pattern as media.ts for Python backend communication.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { protectedProcedure, router } from "../_core/trpc";
import { signBearerToken } from "../_core/tokens";

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL ||
  process.env.VITE_PYTHON_BACKEND_URL ||
  "http://localhost:8000";

function createDriveToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["drive:manage"],
      jti: randomUUID(),
    },
    "15m",
  );
}

export const googleDriveRouter = router({
  /**
   * Get the user's Google Drive connection status.
   */
  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const token = createDriveToken(ctx.user.id);
    const resp = await fetch(
      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to get connection status");
    }
    return resp.json() as Promise<{
      status: "not_connected" | "connected" | "expired";
      email: string | null;
      scopes: string[];
      connectedAt: string | null;
    }>;
  }),

  /**
   * Get the Google OAuth authorization URL with Drive scopes.
   */
  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
    const token = createDriveToken(ctx.user.id);
    const resp = await fetch(
      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/authorize`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to get auth URL");
    }
    return resp.json() as Promise<{
      authorization_url: string;
      state: string;
    }>;
  }),

  /**
   * Complete the OAuth flow by exchanging the code for tokens.
   */
  completeOAuth: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = createDriveToken(ctx.user.id);
      const resp = await fetch(
        `${PYTHON_BACKEND_URL}/api/oauth/google/drive/callback`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: input.code,
            state: input.state,
          }),
        },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "OAuth exchange failed");
      }
      return resp.json() as Promise<{
        email: string;
        scopes: string[];
        status: string;
      }>;
    }),

  /**
   * Disconnect Google Drive for the current user.
   */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const token = createDriveToken(ctx.user.id);
    const resp = await fetch(
      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/disconnect`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Disconnect failed");
    }
    return resp.json() as Promise<{ success: boolean }>;
  }),
});
