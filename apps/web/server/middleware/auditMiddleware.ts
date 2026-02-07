/**
 * Express middleware that creates a trace context for every incoming request.
 * Sets X-Trace-Id response header for client-side correlation.
 */
import type { RequestHandler } from "express";
import { auditLogger } from "../services/auditLogger";
import { runWithTrace } from "../services/traceContext";

export function auditMiddleware(): RequestHandler {
  return (req, res, next) => {
    const traceId = auditLogger.createTrace();

    // Set response header so clients/devtools can see the trace ID
    res.setHeader("X-Trace-Id", traceId);

    // Run the rest of the request inside a trace context
    runWithTrace(traceId, null, () => {
      next();
    });
  };
}
