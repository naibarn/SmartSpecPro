/**
 * Correlation ID Middleware
 *
 * Generates or propagates X-Request-ID headers across service boundaries.
 * Sets the ID as a Sentry tag for cross-service error correlation.
 */
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Express middleware that reads or generates a correlation ID.
 * - Reads X-Request-ID from incoming headers
 * - Generates a UUID if not present
 * - Attaches to req.requestId
 * - Sets X-Request-ID response header
 * - Sets Sentry tag for correlation
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.length > 0
      ? incoming
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  // Set Sentry isolation scope tags (v10: isolation scope prevents bleed between concurrent requests)
  Sentry.getIsolationScope().setTag("request_id", requestId);

  next();
}
