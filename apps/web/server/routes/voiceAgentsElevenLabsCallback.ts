import express from "express";

import {
  executeVoiceAgentToolCallback,
  reconcilePostCallTranscript,
  verifyElevenLabsSignature,
} from "../services/voiceAgents";

export function createVoiceAgentsElevenLabsCallbackRouter() {
  const router = express.Router();

  router.post("/tool-callback", async (req: any, res) => {
    if (!isSigned(req)) {
      return res.status(401).json({ error: "invalid_signature" });
    }
    try {
      const result = await executeVoiceAgentToolCallback(req.body);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "tool_callback_failed",
          message: err instanceof Error ? err.message : "Tool callback failed",
          retryable: false,
        },
      });
    }
  });

  router.post("/post-call", async (req: any, res) => {
    if (!isSigned(req)) {
      return res.status(401).json({ error: "invalid_signature" });
    }
    try {
      const result = await reconcilePostCallTranscript(req.body);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "post_call_reconciliation_failed",
          message: err instanceof Error ? err.message : "Post-call reconciliation failed",
          retryable: true,
        },
      });
    }
  });

  return router;
}

function isSigned(req: any): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  return verifyElevenLabsSignature({
    rawBody: req.rawBody ?? JSON.stringify(req.body ?? {}),
    header: req.header("ElevenLabs-Signature"),
    secret,
  });
}
