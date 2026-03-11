import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";

import { ENV } from "../_core/env";
import { signBearerToken } from "../_core/tokens";
import type { TokenClaims } from "../_core/tokens";
import { getDb } from "../db";
import { users, presentationSlides } from "../../drizzle/schema";
import { generateAIDraft } from "../services/aiPresentationService";
import { getSkillByIdAsync } from "../services/skillRegistry";
import { getRedisClient } from "../services/redis";
import { auditLogger } from "../services/auditLogger";
import type { AuditEventType } from "../services/auditLogger";
import { createLibraryItem } from "../services/libraryService";
import { createPresentationDeckForLibraryItem } from "../services/presentationService";
import type { PresentationActor } from "../services/presentationService";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { checkHourlyRate } from "../services/contentAutomationRateLimit";
import {
  AutoDraftRequestSchema,
  canvasPresetToSize,
} from "@shared/contentAutomation/types";

const FALLBACK_ARTICLE_SKILL = "general-article-writer";

function emitAuditLog(eventType: string, metadata: Record<string, unknown>, userId: number, tenantId: string): void {
  auditLogger.log({
    eventType: eventType as AuditEventType,
    userId,
    metadata: { tenantId, ...metadata },
  });
}

export async function autoDraftToolHandler(req: Request, res: Response): Promise<void> {
  const startMs = Date.now();

  // 1. Authenticate via gateway token
  const authHeader = (req.headers.authorization as string) ?? "";
  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  if (token !== ENV.webGatewayToken) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // 2. Validate request body
  const parseResult = AutoDraftRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: "Invalid request body",
      details: parseResult.error.flatten(),
    });
    return;
  }
  const input = parseResult.data;

  // Extract userId / tenantId from body (set by Python agent)
  const bodyRecord = req.body as Record<string, unknown>;
  const userId = bodyRecord.userId as number | undefined;
  const tenantId = bodyRecord.tenantId as string | undefined;
  const agencyRunId = bodyRecord.agency_run_id as string | undefined;

  if (typeof userId !== "number" || !tenantId || typeof tenantId !== "string") {
    res.status(400).json({ success: false, error: "userId and tenantId are required" });
    return;
  }

  // 3. Verify user is active
  const db = await getDb();
  if (!db) {
    res.status(503).json({ success: false, error: "Database unavailable" });
    return;
  }

  const userRows = await db
    .select({ id: users.id, isDisabled: users.isDisabled, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const userRow = userRows[0];
  if (!userRow) {
    res.status(403).json({ success: false, error: "User not found" });
    return;
  }
  if (userRow.isDisabled) {
    res.status(403).json({ success: false, error: "User account is deactivated" });
    return;
  }

  // 4. Check rate limit
  const rateResult = await checkHourlyRate(userId, "batch");
  if (!rateResult.allowed) {
    res.status(429).json({
      success: false,
      error: "Rate limit exceeded",
      resetIn: rateResult.resetIn,
    });
    return;
  }

  const warnings: string[] = [];

  // 5. Resolve article_skill_slug
  let articleSkillId: string;
  if (input.article_skill_slug) {
    const found = await getSkillByIdAsync(input.article_skill_slug);
    if (found) {
      articleSkillId = found.id;
    } else {
      articleSkillId = FALLBACK_ARTICLE_SKILL;
      warnings.push(
        `article_skill_slug '${input.article_skill_slug}' not found; falling back to general-article-writer`,
      );
    }
  } else {
    articleSkillId = FALLBACK_ARTICLE_SKILL;
  }

  // 6. Resolve media_skill_slug
  let imageSkillId: string | undefined;
  if (input.media_skill_slug) {
    const found = await getSkillByIdAsync(input.media_skill_slug);
    if (found) {
      imageSkillId = found.id;
    }
  }

  // 7. Map canvas_preset to pixel dimensions
  const canvasPreset = input.canvas_preset ?? "16:9";
  const canvasDims = canvasPresetToSize(canvasPreset);
  if (!canvasDims) {
    res.status(400).json({ success: false, error: `Unknown canvas_preset: ${canvasPreset}` });
    return;
  }

  // 8. Emit auto_draft.started audit log
  emitAuditLog("auto_draft.started", { topic: input.topic, canvas_preset: canvasPreset }, userId, tenantId);

  // 9. Mint scoped JWT (synchronous)
  const jwtClaims: TokenClaims & { origin: string } = {
    sub: String(userId),
    type: "access",
    scopes: ["auto-draft:execute"],
    origin: "auto-draft-agent",
  };
  const jwt = signBearerToken(jwtClaims as TokenClaims, "15m");

  // 10. Construct PresentationActor
  const actor: PresentationActor = {
    userId,
    tenantId,
    role: userRow.role ?? "user",
  };

  // 11. Create library item + deck
  const libraryItemResult = await createLibraryItem(
    {
      itemType: "presentation",
      source: "auto_draft",
      title: input.topic.slice(0, 200),
    },
    actor,
  );
  const libraryItemId = libraryItemResult.item.id;

  const deckResult = await createPresentationDeckForLibraryItem(
    { libraryItemId, title: input.topic.slice(0, 200) },
    actor,
  );
  const deckId = deckResult.deck.id;
  const taskId = crypto.randomUUID();

  // 12. Initialize Redis progress
  const redis = getRedisClient();
  const progressKey = `ai_draft_progress:${taskId}`;
  const lockKey = `ai_draft_lock:auto:${userId}`;

  const initialProgress = {
    userId,
    phase: 0,
    phaseLabel: "Starting...",
    slidesCompleted: 0,
    totalSlides: input.num_slides ?? 5,
    slidePreview: [],
    completed: false,
  };
  await redis.set(progressKey, JSON.stringify(initialProgress), "EX", 300);

  // 13. Acquire auto-draft lock (distinct from manual ai_draft_lock:{userId})
  const lockResult = await redis.set(lockKey, taskId, "EX", 300, "NX");
  if (lockResult === null) {
    res.status(409).json({ success: false, error: "Auto-draft already in progress for this user" });
    return;
  }

  try {
    // 14. Build GenerateAIDraftInput and await generateAIDraft (blocking)
    const draftInput = {
      deckId,
      expectedVersion: 0,
      prompt: input.topic,
      numSlides: input.num_slides ?? 5,
      language: (input.language as "auto" | "en" | "th") ?? "auto",
      articleSkillId,
      imageSkillId,
      imageModel: input.image_model_id,
      canvasWidth: canvasDims.width,
      canvasHeight: canvasDims.height,
      stylePresetId: (input.style_preset ?? "dark-professional") as never,
      referenceImageUrls: input.reference_image_urls as never[] | undefined,
      useCustomArticle: false as const,
      hideTextOnSlides: false as const,
      generateAudio: false as const,
    };

    await generateAIDraft(draftInput as never, actor, jwt, taskId);

    // 15. Post-completion data gathering
    const progressJson = await redis.get(progressKey);
    const progressData: Record<string, unknown> = progressJson ? JSON.parse(progressJson) : {};
    if (Array.isArray(progressData.warnings)) {
      warnings.push(...(progressData.warnings as string[]));
    }

    // Count slides in deck
    const db2 = await getDb();
    let slideCount = (progressData.slidesCompleted as number) ?? 0;
    if (db2) {
      const slideRows = await db2
        .select({ id: presentationSlides.id })
        .from(presentationSlides)
        .where(eq(presentationSlides.deckId, deckId));
      slideCount = slideRows.length;
    }

    // 16. Release lock
    await redis.del(lockKey);

    // 17. Override source attribution
    const source = agencyRunId ? `agency_auto_draft:${agencyRunId}` : "agency_auto_draft";

    // 18. Emit auto_draft.completed audit log
    const durationMs = Date.now() - startMs;
    emitAuditLog("auto_draft.completed", { deck_id: deckId, slide_count: slideCount, duration_ms: durationMs, source }, userId, tenantId);

    // 19. Return AutoDraftResponse
    res.json({
      success: true,
      deck_id: deckId,
      slide_count: slideCount,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    // Release lock on error
    try {
      const owner = await redis.get(lockKey);
      if (owner === taskId) {
        await redis.del(lockKey);
      }
    } catch {
      // best-effort cleanup
    }

    // Sanitize error message
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    const safeMsg = errMsg.replace(/https?:\/\/[^\s]+/g, "[redacted]").slice(0, 200);

    // Emit auto_draft.failed audit log
    emitAuditLog("auto_draft.failed", { error: safeMsg, duration_ms: Date.now() - startMs }, userId, tenantId);

    res.status(500).json({
      success: false,
      error: safeMsg,
    });
  }
}

export function registerAutoDraftToolRoute(app: Express): void {
  app.post("/api/internal/tools/auto-draft", contentAutomationGate, autoDraftToolHandler);
}
