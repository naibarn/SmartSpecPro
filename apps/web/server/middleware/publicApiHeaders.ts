import type { Request, Response, NextFunction } from "express";
import type { ApiErrorCode } from "../../shared/publicApiTypes";

/**
 * Sets X-Request-Id header from correlationIdMiddleware's req.requestId.
 */
export function publicApiHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = (req as any).requestId;
  if (requestId) {
    res.setHeader("X-Request-Id", requestId);
  }
  next();
}

/**
 * Error type mapping for consistent API error responses.
 */
const ERROR_TYPE_MAP: Record<string, string> = {
  invalid_api_key: "auth_error",
  insufficient_scopes: "auth_error",
  feature_disabled: "auth_error",
  rate_limit_exceeded: "rate_limit_error",
  daily_credit_limit_exceeded: "billing_error",
  key_suspended: "auth_error",
  insufficient_credits: "billing_error",
  invalid_request: "invalid_request_error",
  not_found: "not_found_error",
  internal_error: "internal_error",
  idempotency_conflict: "invalid_request_error",
  credit_overflow: "invalid_request_error",
  invalid_job_type: "invalid_request_error",
};

/**
 * Format a standard API error response.
 */
export function formatApiError(
  code: ApiErrorCode | string,
  message: string,
  type?: string,
) {
  return {
    error: {
      code,
      message,
      type: type ?? ERROR_TYPE_MAP[code] ?? "internal_error",
    },
  };
}

/**
 * Send a standard API error response.
 */
export function sendApiError(
  res: Response,
  statusCode: number,
  code: ApiErrorCode | string,
  message: string,
  type?: string,
) {
  res.status(statusCode).json(formatApiError(code, message, type));
}
