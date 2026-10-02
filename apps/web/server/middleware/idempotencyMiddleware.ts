import type { Request, Response, NextFunction } from "express";
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyClaim,
} from "../services/postgresIdempotencyStore";
import { sendApiError } from "./publicApiHeaders";

const MAX_KEY_LENGTH = 64;
const MAX_CACHE_SIZE = 1_048_576; // 1MB
const LARGE_RESPONSE_SIZE = 102_400; // 100KB

/** Idempotency middleware for POST requests, backed by shared PostgreSQL state. */
export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") return next();

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (!idempotencyKey) return next();

    if (idempotencyKey.length > MAX_KEY_LENGTH) {
      return sendApiError(
        res,
        400,
        "invalid_request",
        `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
      );
    }

    const tenantId = (req.auth as any)?.tenantId ?? "unknown";
    let claimId: string | null = null;
    try {
      const claim = await claimIdempotencyKey(tenantId, idempotencyKey);
      if (claim.kind === "processing") {
        return sendApiError(
          res,
          409,
          "idempotency_conflict",
          "A request with this Idempotency-Key is already being processed",
        );
      }
      if (claim.kind === "complete") {
        if (claim.response.contentType) res.setHeader("Content-Type", claim.response.contentType);
        return res.status(claim.response.statusCode).send(claim.response.body);
      }
      claimId = claim.claimId;
    } catch {
      return sendApiError(res, 503, "idempotency_store_unavailable", "Request safety storage is unavailable. Please retry.");
    }

    let capturedBody: string | null = null;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const persistResponse = () => {
      if (!claimId) return;
      const currentClaim = claimId;
      claimId = null;
      if (capturedBody === null || Buffer.byteLength(capturedBody, "utf8") > MAX_CACHE_SIZE) {
        void releaseIdempotencyClaim(tenantId, idempotencyKey, currentClaim).catch(() => {});
        return;
      }
      const ttlSeconds = Buffer.byteLength(capturedBody, "utf8") > LARGE_RESPONSE_SIZE ? 3600 : 86400;
      void completeIdempotencyKey(
        tenantId,
        idempotencyKey,
        currentClaim,
        {
          statusCode: res.statusCode,
          body: capturedBody,
          contentType: res.getHeader("content-type")?.toString(),
        },
        ttlSeconds,
      ).catch(() => releaseIdempotencyClaim(tenantId, idempotencyKey, currentClaim).catch(() => {}));
    };

    res.json = ((body: any) => {
      try {
        capturedBody = JSON.stringify(body) ?? "";
      } catch {
        capturedBody = null;
      }
      return originalJson(body);
    }) as any;
    res.send = ((body: any) => {
      if (capturedBody === null) {
        capturedBody = Buffer.isBuffer(body)
          ? body.toString("utf8")
          : typeof body === "string"
            ? body
            : JSON.stringify(body) ?? "";
      }
      return originalSend(body);
    }) as any;
    res.once("finish", persistResponse);
    res.once("close", () => {
      if (!res.writableFinished && claimId) {
        const currentClaim = claimId;
        claimId = null;
        void releaseIdempotencyClaim(tenantId, idempotencyKey, currentClaim).catch(() => {});
      }
    });

    next();
  };
}
