import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { agencyRunArtifacts } from "../../drizzle/schema";
import { getBuiltInPreset } from "../../shared/presentation/aiStylePresets";
import type { AgencyPreview } from "./agencyPreviewService";
import {
  AgencyPreviewCommitError,
  type AgencyPreviewArtifactRecord,
  type AgencyPreviewCommitResult,
} from "./agencyCommitService";
import {
  createLibraryItem,
  getLibraryItemById,
  getUserEffectivePermission,
  type LibraryActor,
} from "./libraryService";
import { generateSlide } from "./aiPresentationLayoutEngine";
import {
  addSlideToDeck,
  createPresentationDeckForLibraryItem,
  listSlidesForDeck,
  updateSlideInDeck,
} from "./presentationService";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface AgencyDeckCommitResult extends AgencyPreviewCommitResult {
  deckId: number;
  libraryItemId: number;
}

function serializeDeckTargetId(deckId: number, libraryItemId: number): string {
  return JSON.stringify({ deckId, libraryItemId });
}

function parseDeckTargetId(targetId: string): { deckId: number; libraryItemId: number } | null {
  try {
    const parsed = JSON.parse(targetId);
    if (
      parsed
      && typeof parsed === "object"
      && Number.isInteger((parsed as Record<string, unknown>).deckId)
      && Number.isInteger((parsed as Record<string, unknown>).libraryItemId)
    ) {
      return {
        deckId: Number((parsed as Record<string, unknown>).deckId),
        libraryItemId: Number((parsed as Record<string, unknown>).libraryItemId),
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function validateReadableProvenance(
  preview: Extract<AgencyPreview, { previewType: "deck" }>,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<void> {
  for (const entry of preview.provenance) {
    if (!entry.documentId || !/^\d+$/.test(entry.documentId)) {
      continue;
    }
    const documentId = Number(entry.documentId);
    const item = await getLibraryItemById(documentId, actor, dbClient);
    if (!item) {
      throw new AgencyPreviewCommitError(
        "PERMISSION_DENIED",
        `Source document ${entry.documentId} is no longer readable`,
      );
    }
    const permission = await getUserEffectivePermission(documentId, actor, dbClient);
    if (!permission.effectivePermissionLevel) {
      throw new AgencyPreviewCommitError(
        "PERMISSION_DENIED",
        `Source document ${entry.documentId} is no longer readable`,
      );
    }
  }
}

function ensureDeckPreviewCanCommit(
  preview: AgencyPreview | null,
  artifactRecord: AgencyPreviewArtifactRecord,
  commitToken: string,
): asserts preview is Extract<AgencyPreview, { previewType: "deck" }> {
  if (!preview) {
    throw new AgencyPreviewCommitError("ARTIFACT_NOT_FOUND", "Preview not found");
  }
  if (artifactRecord.commitToken !== commitToken) {
    throw new AgencyPreviewCommitError("INVALID_COMMIT_TOKEN", "Commit token does not match preview");
  }
  if (preview.previewType !== "deck") {
    throw new AgencyPreviewCommitError("UNSUPPORTED_PREVIEW", "Preview is not a deck commit");
  }
  if (preview.lifecycleState === "expired_preview") {
    throw new AgencyPreviewCommitError("STALE_PREVIEW", "Preview has expired and must be regenerated");
  }
}

export async function commitPresentationPreview(params: {
  actor: LibraryActor;
  artifactRecord: AgencyPreviewArtifactRecord;
  commitToken: string;
  dbClient?: DbClient;
  preview: AgencyPreview | null;
}): Promise<AgencyDeckCommitResult> {
  const { actor, artifactRecord, commitToken, preview } = params;
  ensureDeckPreviewCanCommit(preview, artifactRecord, commitToken);

  if (
    artifactRecord.commitStatus === "committed"
    && artifactRecord.targetType === "presentation_deck"
    && artifactRecord.targetId
  ) {
    const parsed = parseDeckTargetId(artifactRecord.targetId);
    if (parsed) {
      return {
        artifactId: artifactRecord.id,
        runId: artifactRecord.runId,
        commitToken,
        status: "committed",
        targetType: "presentation_deck",
        targetId: artifactRecord.targetId,
        deckId: parsed.deckId,
        libraryItemId: parsed.libraryItemId,
      };
    }
  }

  const db = params.dbClient ?? await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await validateReadableProvenance(preview, actor, db);

  const stylePreset = getBuiltInPreset(preview.data.stylePreset ?? "editorial-clean");
  if (!stylePreset) {
    throw new AgencyPreviewCommitError("UNSUPPORTED_PREVIEW", "Unknown deck style preset");
  }

  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      await tx
        .update(agencyRunArtifacts)
        .set({
          commitStatus: "commit_pending",
          state: "commit_pending",
          updatedAt: now,
        })
        .where(eq(agencyRunArtifacts.id, artifactRecord.id));

      const libraryItem = await createLibraryItem(
        {
          itemType: "presentation",
          source: "agency_generated",
          title: preview.data.title,
          description: preview.data.description ?? preview.summaryText,
          status: "ready",
          visibility: "private",
          metadata: {
            source_type: "agency_presentation_deck",
            agency_artifact_id: artifactRecord.id,
            agency_run_id: artifactRecord.runId,
            agency_intent: preview.intent,
            preview_type: preview.previewType,
            provenance: preview.provenance,
          },
          sourceLink: {
            linkType: "agency_run_artifact",
            linkId: artifactRecord.id,
          },
        },
        actor,
        tx,
      );

      const deckResult = await createPresentationDeckForLibraryItem(
        {
          libraryItemId: libraryItem.item.id,
          title: preview.data.title,
          description: preview.data.description,
        },
        actor,
        tx,
      );

      const existingSlides = await listSlidesForDeck(deckResult.deck.id, actor, tx);
      const [firstSlide] = existingSlides;
      if (!firstSlide) {
        throw new Error("Expected initial deck slide to exist");
      }

      const renderedSlides = preview.data.slides.map((slide, index) => {
        const layout = generateSlide({
          slideData: slide,
          imageUrl: null,
          svgGraphic: null,
          stylePreset,
          deckTitle: preview.data.title,
          slideIndex: index,
          totalSlides: preview.data.slides.length,
        });
        return {
          title: slide.title,
          notes: slide.notes,
          slideContent: layout.slideContent,
        };
      });

      const [firstRendered, ...remainingSlides] = renderedSlides;
      if (!firstRendered) {
        throw new Error("Deck preview did not contain any slides");
      }

      await updateSlideInDeck(
        {
          deckId: deckResult.deck.id,
          slideId: firstSlide.id,
          expectedVersion: firstSlide.version,
          title: firstRendered.title,
          slideContent: firstRendered.slideContent as Record<string, unknown>,
          notes: firstRendered.notes,
        },
        actor,
        tx,
      );

      let expectedVersion = deckResult.deck.version + 1;
      for (const slide of remainingSlides) {
        await addSlideToDeck(
          {
            deckId: deckResult.deck.id,
            expectedVersion,
            title: slide.title,
            slideContent: slide.slideContent as Record<string, unknown>,
            notes: slide.notes,
          },
          actor,
          tx,
        );
        expectedVersion += 1;
      }

      const targetId = serializeDeckTargetId(deckResult.deck.id, libraryItem.item.id);

      await tx
        .update(agencyRunArtifacts)
        .set({
          commitStatus: "committed",
          state: "committed",
          targetType: "presentation_deck",
          targetId,
          committedAt: now,
          updatedAt: now,
        })
        .where(eq(agencyRunArtifacts.id, artifactRecord.id));

      return {
        artifactId: artifactRecord.id,
        runId: artifactRecord.runId,
        commitToken,
        status: "committed",
        targetType: "presentation_deck",
        targetId,
        deckId: deckResult.deck.id,
        libraryItemId: libraryItem.item.id,
      };
    });
  } catch (error) {
    await db
      .update(agencyRunArtifacts)
      .set({
        commitStatus: "commit_failed",
        state: "commit_failed",
        updatedAt: new Date(),
      })
      .where(eq(agencyRunArtifacts.id, artifactRecord.id));
    throw error;
  }
}
