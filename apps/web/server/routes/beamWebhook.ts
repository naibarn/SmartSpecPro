import express, { Router } from "express";

import { auditLogger } from "../services/auditLogger";
import {
  createBeamProvider,
  type BeamNormalizedWebhookEvent,
  type BeamWebhookVerificationResult,
} from "../services/billing/beamProvider";

export interface BeamWebhookEnvelope {
  verification: BeamWebhookVerificationResult;
  normalizedEvent: BeamNormalizedWebhookEvent;
  payload: Record<string, any>;
}

export function createBeamWebhookRouter(options?: {
  processEvent?: (event: BeamWebhookEnvelope) => Promise<unknown>;
}) {
  const router = Router();

  router.post(
    "/beam/webhook",
    express.json({
      limit: "1mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
    async (req: any, res) => {
      const outcome = await handleBeamWebhookRequest({
        headers: req.headers ?? {},
        rawBody: req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8"),
        body: (req.body ?? {}) as Record<string, any>,
        processEvent: options?.processEvent,
      });

      return res.status(outcome.status).json(outcome.body);
    },
  );

  return router;
}

export async function handleBeamWebhookRequest(params: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | string;
  body: Record<string, any>;
  processEvent?: (event: BeamWebhookEnvelope) => Promise<unknown>;
}) {
  const provider = await createBeamProvider();
  const verification = provider.verifyWebhook(params.rawBody, params.headers);
  if (!verification.valid) {
    auditLogger.log({
      eventType: "error",
      userId: null,
      metadata: {
        channel: "beam_webhook",
        verificationReason: verification.reason,
      },
    });
    return {
      status: 401,
      body: {
        ok: false,
        error: verification.reason ?? "invalid_signature",
      },
    };
  }

  const normalizedEvent = provider.normalizeWebhookEvent(params.body);
  if (!normalizedEvent.eventType || normalizedEvent.eventType === "unknown") {
    auditLogger.log({
      eventType: "error",
      userId: null,
      metadata: {
        channel: "beam_webhook",
        verificationReason: "schema_invalid",
      },
    });
    return {
      status: 422,
      body: {
        ok: false,
        error: "schema_invalid",
      },
    };
  }

  if (params.processEvent) {
    await params.processEvent({
      verification,
      normalizedEvent,
      payload: params.body,
    });
  }

  return {
    status: 202,
    body: {
      ok: true,
      eventId: normalizedEvent.eventId,
      status: normalizedEvent.paymentStatus,
    },
  };
}
