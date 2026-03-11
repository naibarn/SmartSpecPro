import type { Request, Response, NextFunction } from "express";
import { getFeatureFlag } from "../services/featureFlags";

export async function contentAutomationGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const enabled = await getFeatureFlag("ENABLE_CONTENT_AUTOMATION");
  if (!enabled) {
    res.status(503).json({ error: "Content automation is not enabled" });
    return;
  }
  next();
}
