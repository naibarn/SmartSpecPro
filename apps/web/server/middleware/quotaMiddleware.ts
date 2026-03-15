/**
 * Quota enforcement middleware for the /v1 public API.
 *
 * Runs after rateLimitMiddleware. Checks per-key hourly/daily/weekly/monthly
 * request-count quotas. Only active for api_key auth mode.
 * Passes through immediately if no quotas are configured on the key.
 */

import type { Request, Response, NextFunction } from "express";
import { checkAndIncrementQuota } from "../services/apiKeyQuotaService";
import { sendApiError } from "./publicApiHeaders";

export function quotaMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = req.auth;
    if (!auth || auth.mode !== "api_key") {
      next();
      return;
    }

    const result = await checkAndIncrementQuota(auth.apiKeyId, auth.tenantId, {
      quotaHourly: auth.quotaHourly ?? null,
      quotaDaily: auth.quotaDaily ?? null,
      quotaWeekly: auth.quotaWeekly ?? null,
      quotaMonthly: auth.quotaMonthly ?? null,
    });

    // Always set quota headers so clients can see their usage
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }

    if (!result.allowed) {
      const windowLabel = result.blockedWindow ?? "quota";
      if (result.retryAfterSeconds) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
      }
      sendApiError(
        res,
        429,
        "quota_exceeded",
        `${windowLabel.charAt(0).toUpperCase() + windowLabel.slice(1)} quota exceeded. Try again later.`,
      );
      return;
    }

    next();
  };
}
