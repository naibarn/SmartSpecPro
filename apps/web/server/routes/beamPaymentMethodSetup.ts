import express from "express";
import { z } from "zod";

import {
  reconcilePaymentMethodSetupSession,
  verifyPaymentMethodSetupCallbackSignature,
} from "../services/billing/paymentMethodSetup";

const callbackSchema = z.object({
  setupSessionId: z.string().trim().min(1),
  status: z.enum(["confirmed", "abandoned", "failed"]),
  providerCustomerId: z.string().trim().max(128).optional().nullable(),
  providerPaymentMethodId: z.string().trim().max(128).optional().nullable(),
  errorMessage: z.string().trim().max(2000).optional().nullable(),
});

export function createBeamPaymentMethodSetupRouter() {
  const router = express.Router();

  router.get("/beam/payment-method-setup/callback", async (req, res) => {
    const signatureCheck = await verifyPaymentMethodSetupCallbackSignature({
      rawQuery: req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1) : "",
      headers: req.headers,
    });
    if (!signatureCheck.valid) {
      return res.status(401).json({ ok: false, error: signatureCheck.reason });
    }

    const parsed = callbackSchema.safeParse({
      setupSessionId: req.query.setupSessionId,
      status: req.query.status,
      providerCustomerId: req.query.providerCustomerId,
      providerPaymentMethodId: req.query.providerPaymentMethodId,
      errorMessage: req.query.errorMessage,
    });

    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_callback_query" });
    }

    const session = await reconcilePaymentMethodSetupSession({
      setupSessionId: parsed.data.setupSessionId,
      status: parsed.data.status,
      providerCustomerId: parsed.data.providerCustomerId ?? null,
      providerPaymentMethodId: parsed.data.providerPaymentMethodId ?? null,
      errorMessage: parsed.data.errorMessage ?? null,
      payloadJson: {
        callbackQuery: req.query,
      },
    });

    return res.status(200).json({
      ok: true,
      sessionId: session?.id ?? null,
      status: session?.status ?? parsed.data.status,
    });
  });

  return router;
}
