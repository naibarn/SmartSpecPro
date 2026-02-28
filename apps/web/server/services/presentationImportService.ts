import { eq } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryItems,
  presentationConversionRecords,
  presentationSourceAttachments,
} from "../../drizzle/schema";
import {
  createPresentationDeckForLibraryItem,
  addSlideToDeck,
  type PresentationActor,
} from "./presentationService";
import { debugLog, debugError } from "../_core/logger";

export interface CreateDeckFromImportResultParams {
  conversionId: number;
  tenantId: string; // varchar(36), matches presentationConversionRecords.tenantId
  userId: number;
  slides: Record<string, unknown>[]; // raw PresentationSlideContent objects from Python
  title: string;
  fidelityWarnings: string[];
  sourceFormat: string; // e.g. "pptx" or "google_slides"
  sourceLibraryItemId?: number | null;
}

export async function createDeckFromImportResult(
  params: CreateDeckFromImportResultParams,
): Promise<{ deckLibraryItemId: number }> {
  // Step 1: Build actor from stored DB values (never from callback request body)
  const actor: PresentationActor = {
    userId: params.userId,
    tenantId: params.tenantId,
    role: "user",
  };

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Wrap all writes in a transaction so a mid-flight failure (e.g., addSlideToDeck
  // throwing on slide 3) rolls everything back. The idempotency check in the
  // callback handler only guards against record.status === 'done'; without a
  // transaction, a partial failure leaves a dangling libraryItems row and would
  // cause duplicate deck creation on Celery retry.
  return db.transaction(async (tx) => {
    // Step 2: Insert library item with itemType='presentation', source='import'
    const [libraryItem] = await tx
      .insert(libraryItems)
      .values({
        tenantId: params.tenantId,
        ownerUserId: params.userId,
        itemType: "presentation",
        source: "import",
        title: params.title,
        status: "ready",
        visibility: "private",
        metadata: {},
      })
      .returning({ id: libraryItems.id });
    const libraryItemId = libraryItem.id;

    // Step 3: Create the presentation deck (calls resolveReadableLibraryItem internally,
    // so the library item must already exist with status='ready' and visibility='private').
    // Pass tx so the deck creation runs inside the same transaction.
    // Cast: PgTransaction is operationally identical to DbClient but lacks the $client
    // property that TypeScript requires. All operations used here are supported by both.
    const { deck } = await createPresentationDeckForLibraryItem(
      { libraryItemId, title: params.title },
      actor,
      tx as any,
    );
    const deckId = deck.id;

    // Step 4: Enforce slide limit — truncate silently, log warning
    const slides =
      params.slides.length > 200 ? params.slides.slice(0, 200) : params.slides;
    if (params.slides.length > 200) {
      debugLog("presentationImportService", "slides truncated", {
        conversionId: params.conversionId,
        original: params.slides.length,
        truncated: 200,
      });
    }

    // Step 5: Add slides sequentially (NOT parallel — addSlideToDeck uses optimistic
    // locking via expectedVersion; each successful call increments the deck version).
    // Pass tx so slide writes run inside the same transaction.
    let expectedVersion = 0;
    for (const slideContent of slides) {
      await addSlideToDeck({ deckId, expectedVersion, slideContent }, actor, tx as any);
      expectedVersion++;
    }

    // Step 6: Insert source attachment to record provenance
    await tx.insert(presentationSourceAttachments).values({
      deckId,
      sourceLibraryItemId: params.sourceLibraryItemId ?? null,
      sourceFormat: params.sourceFormat,
      conversionStatus: "done",
      partialFidelity: params.fidelityWarnings.length > 0,
      fidelityWarnings: params.fidelityWarnings,
    });

    // Step 7: Update conversion record to mark the job done with full FK pointers
    await tx
      .update(presentationConversionRecords)
      .set({
        deckId,
        deckLibraryItemId: libraryItemId,
        status: "done",
        progress: 100,
        fidelityWarnings: params.fidelityWarnings,
        updatedAt: new Date(),
      })
      .where(eq(presentationConversionRecords.id, params.conversionId));

    return { deckLibraryItemId: libraryItemId };
  });
}
