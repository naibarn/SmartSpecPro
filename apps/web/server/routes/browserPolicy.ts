import crypto from "crypto";

import { Router } from "express";
import type { Request, Response } from "express";

import { ENV } from "../_core/env";
import { evaluateAndPersistBrowserPolicyRuntime } from "../services/browserPolicyRuntime";

const router = Router();

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken || process.env.SMARTSPEC_PROXY_TOKEN || "";
  if (!expected) {
    return false;
  }

  const tokenHeader = req.headers["x-internal-token"] ?? req.headers["x-proxy-token"];
  const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
  if (!token) {
    return false;
  }

  if (token.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

router.post("/api/internal/browser-policy/evaluate", async (req: Request, res: Response) => {
  if (!verifyInternalToken(req)) {
    res.status(401).json({ error: "Unauthorized.", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const result = await evaluateAndPersistBrowserPolicyRuntime(req.body as never);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser policy evaluation failed.";
    res.status(400).json({
      error: message,
      code: "BROWSER_POLICY_EVALUATION_FAILED",
    });
  }
});

export default router;
