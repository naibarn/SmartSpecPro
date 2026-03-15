import type { Request, Response, NextFunction } from "express";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

/**
 * Express middleware that checks the tenant `publicApi` feature flag.
 * Only applies to API key auth — session and bearer auth bypass this check.
 */
export async function publicApiFeatureGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = req.auth;
  if (!auth) {
    res.setHeader("X-Api-Error-Code", "invalid_api_key");
    res.status(401).json({
      error: {
        code: "invalid_api_key",
        message: "Authentication required",
        type: "auth_error",
      },
    });
    return;
  }

  // Session and bearer auth bypass feature flag check
  if (auth.mode === "session" || auth.mode === "bearer") {
    next();
    return;
  }

  // API key auth: check tenant publicApi flag
  if (auth.mode === "api_key") {
    try {
      const flags = await getTenantFeatureFlags(auth.tenantId);
      if (!flags.publicApi) {
        res.setHeader("X-Api-Error-Code", "feature_disabled");
        res.status(403).json({
          error: {
            code: "feature_disabled",
            message: "Public API access is not enabled for this tenant",
            type: "auth_error",
          },
        });
        return;
      }
    } catch {
      res.setHeader("X-Api-Error-Code", "internal_error");
      res.status(500).json({
        error: {
          code: "internal_error",
          message: "Failed to verify feature access",
          type: "internal_error",
        },
      });
      return;
    }
  }

  next();
}
