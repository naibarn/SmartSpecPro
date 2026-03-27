import crypto from "node:crypto";
import { Router } from "express";
import type { Express, Request, Response } from "express";
import { z } from "zod";

import { ENV } from "../_core/env";
import { listPlannedSocialProviderScaffolds } from "../services/social/providerCatalog";
import {
  executeSocialAction,
  listSocialProviders,
  SocialBackgroundError,
  SOCIAL_ACTIONS,
} from "../services/socialBackgroundFacade";

const SOCIAL_ACTION_SCHEMA = z.object({
  provider: z.string().trim().min(1).default("meta"),
  action: z.enum(SOCIAL_ACTIONS),
  tenantId: z.string().trim().min(1),
  pageId: z.number().int().positive(),
  conversationId: z.number().int().positive().optional(),
  messageBody: z.string().trim().min(1).optional(),
  contentText: z.string().trim().min(1).optional(),
  contentLink: z.string().trim().min(1).optional(),
  mediaRefs: z.array(z.string().trim().min(1)).max(10).optional(),
  commentId: z.number().int().positive().optional(),
  query: z.string().trim().optional(),
});

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest();
    const expectedHash = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(tokenHash, expectedHash);
  } catch {
    return false;
  }
}

function getHeaderValue(req: Request, name: string): string | null {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function normalizeRequestBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return {};
  }
  const record = { ...(body as Record<string, unknown>) };
  if (typeof record.query === "string") {
    try {
      const parsed = JSON.parse(record.query);
      if (parsed && typeof parsed === "object") {
        return { ...record, ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // leave as-is
    }
  }
  return record;
}

function sendJsonError(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error });
}

export async function handleInternalSocialActions(req: Request, res: Response): Promise<void> {
  if (!verifyInternalToken(req)) {
    sendJsonError(res, 401, "Unauthorized");
    return;
  }

  const agentId = getHeaderValue(req, "x-agent-id");
  const toolId = getHeaderValue(req, "x-agent-tool-id");
  if (!agentId || !toolId) {
    sendJsonError(res, 400, "Missing X-Agent-Id or X-Agent-Tool-Id header");
    return;
  }

  const normalizedBody = normalizeRequestBody(req.body);
  const parsed = SOCIAL_ACTION_SCHEMA.safeParse(normalizedBody);
  if (!parsed.success) {
    sendJsonError(res, 400, "Invalid request body");
    return;
  }

  try {
    const dataInput = { ...parsed.data };
    const queryText = typeof normalizedBody.query === "string" ? normalizedBody.query.trim() : "";
    if (queryText) {
      if ((dataInput.action === "send_reply" || dataInput.action === "reply_comment") && !dataInput.messageBody) {
        dataInput.messageBody = queryText;
      }
      if (dataInput.action === "publish_post" && !dataInput.contentText) {
        dataInput.contentText = queryText;
      }
    }

    const data = await executeSocialAction(dataInput);
    res.json({
      success: true,
      provider: dataInput.provider,
      action: dataInput.action,
      data,
    });
  } catch (error) {
    if (error instanceof SocialBackgroundError) {
      sendJsonError(res, error.status, error.message);
      return;
    }
    sendJsonError(res, 500, error instanceof Error ? error.message : "Social action failed");
  }
}

export async function handleListInternalSocialProviders(req: Request, res: Response): Promise<void> {
  if (!verifyInternalToken(req)) {
    sendJsonError(res, 401, "Unauthorized");
    return;
  }

  res.json({
    success: true,
    data: {
      providers: listSocialProviders(),
      plannedProviders: listPlannedSocialProviderScaffolds(),
    },
  });
}

export const internalSocialActionsRouter = Router();
internalSocialActionsRouter.get("/api/internal/tools/social-actions/providers", handleListInternalSocialProviders);
internalSocialActionsRouter.post("/api/internal/tools/social-actions", handleInternalSocialActions);

export function registerInternalSocialActionsRoute(app: Express): void {
  app.use(internalSocialActionsRouter);
}
