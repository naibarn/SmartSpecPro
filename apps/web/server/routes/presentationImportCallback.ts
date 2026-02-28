import crypto from "crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { libraryItems, presentationConversionRecords } from "../../drizzle/schema";
import { createDeckFromImportResult } from "../services/presentationImportService";
import { debugLog, debugError } from "../_core/logger";
import { ENV } from "../_core/env";

// Max 201 so a 200-slide payload is accepted (truncated in service); 202+ rejected at boundary
const callbackBodySchema = z.object({
  conversionId: z.number().int().positive(),
  status: z.enum(["done", "failed"]),
  slides: z.array(z.record(z.unknown())).max(201).optional(),
  fidelityWarnings: z.array(z.string()).max(25).optional(),
  error: z.string().optional(),
});

/**
 * Handler for: POST /api/internal/presentation-import/callback
 *
 * Python calls this after a Celery import task completes (success or failure).
 * Auth: Bearer token matched against ENV.webGatewayToken.
 * Security: auth check BEFORE body parsing; actor constructed from DB record,
 * never from the untrusted callback body.
 */
export async function presentationImportCallbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  // Auth check BEFORE body parsing — do not parse the body for unauthenticated requests
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
    res.status(401).end();
    return;
  }
  const token = authHeader.slice(7);
  // Timing-safe comparison to prevent side-channel leaks on token prefix bytes
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(ENV.webGatewayToken);
  if (
    tokenBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(tokenBuf, expectedBuf)
  ) {
    res.status(401).end();
    return;
  }

  // Validate body with Zod after auth passes
  const parsed = callbackBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request body" });
    return;
  }
  const body = parsed.data;

  const db = await getDb();
  if (!db) {
    // Respond 200 so Python doesn't retry endlessly on DB unavailability
    res.status(200).json({ ok: false, error: "database_unavailable" });
    return;
  }

  // Idempotency: read conversion record before doing any meaningful work
  const [record] = await db
    .select()
    .from(presentationConversionRecords)
    .where(eq(presentationConversionRecords.id, body.conversionId))
    .limit(1);

  if (!record) {
    // Unknown conversionId — respond 200 without leaking existence
    debugLog("presentation-import", "callback: unknown conversionId", {
      conversionId: body.conversionId,
    });
    res.status(200).json({ ok: true });
    return;
  }

  // Already in a terminal state — Celery retry or late callback after cancellation
  if (
    record.status === "done" ||
    record.status === "failed" ||
    record.status === "cancelled"
  ) {
    res
      .status(200)
      .json({ ok: true, deckLibraryItemId: record.deckLibraryItemId ?? null });
    return;
  }

  if (body.status === "done") {
    // Derive title from source library item or fall back to default
    let title = "Imported Presentation";
    if (record.sourceItemId) {
      const [sourceItem] = await db
        .select({ title: libraryItems.title })
        .from(libraryItems)
        .where(eq(libraryItems.id, record.sourceItemId))
        .limit(1);
      if (sourceItem?.title) {
        title = sourceItem.title;
      }
    }

    try {
      const { deckLibraryItemId } = await createDeckFromImportResult({
        conversionId: body.conversionId,
        tenantId: record.tenantId,
        userId: record.userId,
        slides: body.slides ?? [],
        title,
        fidelityWarnings: body.fidelityWarnings ?? [],
        sourceFormat: record.sourceFormat,
        sourceLibraryItemId: record.sourceItemId ?? null,
      });
      res.status(200).json({ ok: true, deckLibraryItemId });
    } catch (err) {
      debugError(
        "presentation-import",
        "callback: createDeckFromImportResult failed",
        err,
      );
      // Always respond 200 — prevent Celery from retrying endlessly on internal errors
      res.status(200).json({ ok: false, error: "internal" });
    }
    return;
  }

  // status === "failed": mark the record and respond 200
  // Wrapped in try/catch so a transient DB error never produces a 500 (which
  // would trigger Celery retry and violate the "always respond 200" contract).
  try {
    await db
      .update(presentationConversionRecords)
      .set({
        status: "failed",
        error: body.error ?? "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(presentationConversionRecords.id, body.conversionId));
  } catch (err) {
    debugError(
      "presentation-import",
      "callback: failed to update record status to failed",
      err,
    );
  }

  res.status(200).json({ ok: true });
}
