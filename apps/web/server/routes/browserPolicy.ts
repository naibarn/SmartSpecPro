import crypto from "crypto";

import { Router } from "express";
import type { Request, Response } from "express";

import { getPreferredInternalToken } from "../services/appRuntimeConfig";
import {
  evaluateAndPersistBrowserPolicyRuntime,
  persistBrowserPolicyOutcomeRuntime,
} from "../services/browserPolicyRuntime";

const router = Router();

async function verifyInternalToken(req: Request): Promise<boolean> {
  const expected = await getPreferredInternalToken();
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
  if (!(await verifyInternalToken(req))) {
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

router.post("/api/internal/browser-policy/outcome", async (req: Request, res: Response) => {
  if (!(await verifyInternalToken(req))) {
    res.status(401).json({ error: "Unauthorized.", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const result = await persistBrowserPolicyOutcomeRuntime(req.body as never);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser policy outcome persistence failed.";
    res.status(400).json({
      error: message,
      code: "BROWSER_POLICY_OUTCOME_FAILED",
    });
  }
});

export default router;
