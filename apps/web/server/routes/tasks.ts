/**
 * Cloud Tasks Handler Routes
 *
 * Express routes for handling Cloud Tasks HTTP callbacks on the Node.js side.
 * These endpoints are called by Cloud Tasks with OIDC auth tokens.
 *
 * Authentication:
 * - Production: Validates OIDC token from Cloud Tasks (Google-signed JWT)
 * - Development: Validates shared secret via X-Cloud-Tasks-Secret header
 */

import { Router, Request, Response, NextFunction } from "express";
import { deliverScheduledMessage, sweepUndeliveredMessages } from "../services/scheduler";

const USE_CLOUD_TASKS = () => process.env.USE_CLOUD_TASKS === "true";

/**
 * Middleware to authenticate Cloud Tasks requests.
 *
 * In production (USE_CLOUD_TASKS=true): validates OIDC token in Authorization header.
 * The token is a Google-signed JWT targeting the service URL.
 *
 * In development: validates a shared secret via X-Cloud-Tasks-Secret header,
 * or allows requests from localhost.
 */
async function validateCloudTasksAuth(req: Request, res: Response, next: NextFunction) {
  if (USE_CLOUD_TASKS()) {
    // Production: validate OIDC token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing OIDC authorization token" });
      return;
    }

    try {
      // Google Cloud Tasks sends OIDC tokens signed by Google's service account.
      // We verify the token using Google's OAuth2Client.
      const token = authHeader.slice(7);
      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client();
      const targetAudience = process.env.CLOUD_RUN_NODE_URL || "";

      await client.verifyIdToken({
        idToken: token,
        audience: targetAudience,
      });

      next();
    } catch (err) {
      console.error("[Tasks] OIDC validation failed:", err);
      res.status(401).json({ error: "Invalid OIDC token" });
    }
    return;
  }

  // Development mode: check shared secret or localhost
  const secret = req.headers["x-cloud-tasks-secret"];
  const expectedSecret = process.env.CLOUD_TASKS_SECRET;

  if (expectedSecret && secret === expectedSecret) {
    next();
    return;
  }

  // Allow localhost in dev mode
  const remoteAddr = req.ip || req.socket.remoteAddress || "";
  if (remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "::ffff:127.0.0.1") {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized: invalid or missing Cloud Tasks secret" });
}

export function createTasksRouter(): Router {
  const router = Router();

  // Apply auth middleware to all task routes
  router.use(validateCloudTasksAuth);

  /**
   * POST /tasks/deliver-scheduled-message
   *
   * Called by Cloud Tasks to deliver a single scheduled message.
   * Idempotent: if the message is already delivered, returns 200.
   */
  router.post("/deliver-scheduled-message", async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.body;

      if (!scheduleId || typeof scheduleId !== "number") {
        res.status(400).json({ error: "scheduleId is required and must be a number" });
        return;
      }

      await deliverScheduledMessage(scheduleId);
      res.status(200).json({ success: true, scheduleId });
    } catch (err: any) {
      console.error("[Tasks] deliver-scheduled-message failed:", err);
      // Return 500 so Cloud Tasks retries (transient failure)
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /tasks/deliver-scheduled-fallback
   *
   * Called by Cloud Scheduler every minute to sweep for undelivered messages.
   * Catches any scheduled messages that failed to enqueue via Cloud Tasks.
   */
  router.post("/deliver-scheduled-fallback", async (_req: Request, res: Response) => {
    try {
      const count = await sweepUndeliveredMessages();
      res.status(200).json({ success: true, enqueued: count });
    } catch (err: any) {
      console.error("[Tasks] deliver-scheduled-fallback failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /tasks/execute-skill-step
   *
   * Called by Cloud Tasks to execute a skill pipeline step.
   * Payload matches addSkillJob format from llmQueue.ts:
   *   { userId, skillId, skillName, conversationId, steps, currentStep, context }
   */
  router.post("/execute-skill-step", async (req: Request, res: Response) => {
    try {
      const { userId, skillId, skillName, conversationId, steps, currentStep, context } = req.body;

      if (!skillId || !userId) {
        res.status(400).json({ error: "skillId and userId are required" });
        return;
      }

      // Dynamic import to avoid circular dependency
      const { getSkillById } = await import("../services/skillRegistry");
      const { executeSkill } = await import("../services/skillExecutor");

      const skill = getSkillById(skillId);
      if (!skill) {
        console.warn(`[Tasks] Skill ${skillId} not found, skipping`);
        res.status(200).json({ success: false, error: "Skill not found" });
        return;
      }

      const result = await executeSkill(
        skill,
        { prompt: context?.prompt || "", conversationId, context },
        userId,
        "" // No user token available in Cloud Tasks context
      );

      console.log(`[Tasks] Skill ${skillId} step ${currentStep || 0} completed: ${result.success}`);
      res.status(200).json({ success: result.success, skillId });
    } catch (err: any) {
      console.error("[Tasks] execute-skill-step failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
