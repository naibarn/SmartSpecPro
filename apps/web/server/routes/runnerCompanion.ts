import type { Express, Request, Response } from "express";
import { authorizeRequest, type AuthResult } from "../_core/authz";
import { hashJti } from "../_core/revocation";
import {
  RUNNER_COMPANION_CLIENT_ID,
  RUNNER_COMPANION_CHAT_SCOPE,
  RUNNER_COMPANION_SCOPE,
} from "../_core/deviceAuthRoutes";
import { getRunnerCompanionState } from "../services/runnerCompanionViewState";

const DEVICE_HEADER = "x-runner-companion-device-id";

function headerValue(req: Request, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value.trim() : "";
}

export function isValidRunnerCompanionBinding(
  auth: Extract<AuthResult, { ok: true; mode: "bearer" }>,
  deviceId: string
): boolean {
  const tenantId = auth.tenantId?.trim() ?? "";
  const deviceIdHash = auth.deviceIdHash?.trim() ?? "";
  return Boolean(
    auth.clientId === RUNNER_COMPANION_CLIENT_ID &&
    auth.audience === RUNNER_COMPANION_CLIENT_ID &&
    auth.tokenUse === "desktop_session" &&
    auth.userId &&
    tenantId &&
    auth.sessionId &&
    deviceIdHash &&
    deviceId &&
    hashJti(deviceId) === deviceIdHash &&
    (
      (auth.scopes.length === 1 && auth.scopes[0] === RUNNER_COMPANION_SCOPE) ||
      (auth.scopes.length === 2 &&
        auth.scopes.includes(RUNNER_COMPANION_SCOPE) &&
        auth.scopes.includes(RUNNER_COMPANION_CHAT_SCOPE))
    )
  );
}

/**
 * Authenticated, read-only transport for the canonical runner-companion.v1
 * projection. Runner control credentials are intentionally not accepted here.
 */
export function registerRunnerCompanionRoutes(app: Express) {
  app.get(
    "/api/runner-companion/v1/state",
    async (req: Request, res: Response) => {
      const auth = await authorizeRequest(req, {
        allowBearer: true,
        allowSession: false,
      });
      if (!auth.ok || auth.mode !== "bearer") {
        res.status(401).json({ error: "runner_companion_auth_required" });
        return;
      }

      const deviceId = headerValue(req, DEVICE_HEADER);
      if (!isValidRunnerCompanionBinding(auth, deviceId)) {
        res
          .status(403)
          .json({ error: "runner_companion_scope_or_binding_invalid" });
        return;
      }

      try {
        const state = await getRunnerCompanionState({
          tenantId: auth.tenantId!,
          userId: auth.userId!,
        });
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Vary", "Authorization, X-Runner-Companion-Device-Id");
        res.json(state);
      } catch (error) {
        const code =
          error instanceof Error
            ? error.message
            : "RUNNER_COMPANION_PROJECTION_FAILED";
        if (code === "RUNNER_COMPANION_SCOPE_REQUIRED") {
          res.status(403).json({ error: code });
          return;
        }
        res
          .status(503)
          .json({ error: "runner_companion_projection_unavailable" });
      }
    }
  );
}
