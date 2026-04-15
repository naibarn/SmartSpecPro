import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { agencyRunArtifacts, libraryChunks, libraryItems } from "../../drizzle/schema";
import type { AgencyPreview } from "./agencyPreviewService";
import {
  createLibraryItem,
  getLibraryItemById,
  getUserEffectivePermission,
  resolveLibraryVectorIndexName,
  type LibraryActor,
} from "./libraryService";

type DbClient = any;

export type AgencyCommitStatus = "committed";

export interface AgencyPreviewArtifactRecord {
  id: string;
  runId: string;
  tenantId: string;
  commitToken: string;
  commitStatus: string;
  targetType: string | null;
  targetId: string | null;
}

export interface AgencyPreviewCommitResult {
  artifactId: string;
  runId: string;
  commitToken: string;
  status: AgencyCommitStatus;
  targetType: string;
  targetId: string;
}

type AgencyPreviewCommitErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "INVALID_COMMIT_TOKEN"
  | "PERMISSION_DENIED"
  | "STALE_PREVIEW"
  | "UNSUPPORTED_PREVIEW";

export class AgencyPreviewCommitError extends Error {
  constructor(
    public readonly code: AgencyPreviewCommitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgencyPreviewCommitError";
  }
}

function getCommitTitle(preview: AgencyPreview): string {
  const data = preview.data as { title?: string };
  return data.title?.trim() || preview.summaryText.trim() || `Committed ${preview.previewType}`;
}

function getLibrarySourceType(preview: AgencyPreview): string {
  if (preview.previewType === "research") return "agency_research_report";
  if (preview.previewType === "comparison") return "agency_comparison_report";
  return "agency_storyboard";
}

function renderResearchMarkdown(preview: Extract<AgencyPreview, { previewType: "research" }>): string {
  const lines: string[] = [
    `# ${preview.data.title}`,
    "",
    "## Executive Summary",
    preview.data.executiveSummary,
  ];

  if (preview.data.keyFindings.length > 0) {
    lines.push("", "## Key Findings");
    for (const finding of preview.data.keyFindings) {
      lines.push(`- ${finding}`);
    }
  }

  if (preview.data.sections.length > 0) {
    lines.push("", "## Sections");
    for (const section of preview.data.sections) {
      lines.push("", `### ${section.heading}`, "", section.content);
      if (section.sources.length > 0) {
        lines.push("", `Sources: ${section.sources.join(", ")}`);
      }
    }
  }

  if (preview.data.recommendations.length > 0) {
    lines.push("", "## Recommendations");
    for (const recommendation of preview.data.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  return lines.join("\n");
}

function renderStoryboardMarkdown(preview: Extract<AgencyPreview, { previewType: "storyboard" }>): string {
  const lines: string[] = [
    `# ${preview.data.title}`,
    "",
    `Style: ${preview.data.style}`,
    `Total duration: ${preview.data.totalDurationSeconds}s`,
  ];

  for (const scene of preview.data.scenes) {
    lines.push(
      "",
      `## Scene ${scene.sceneNumber}`,
      `Duration: ${scene.durationSeconds}s`,
      "",
      scene.description,
      "",
      `Camera: ${scene.camera}`,
      `Lighting: ${scene.lighting}`,
      "",
      "### Video Prompt",
      scene.videoPrompt,
    );
    if (scene.dialogue) {
      lines.push("", "### Dialogue", scene.dialogue);
    }
    if (scene.audioPrompt) {
      lines.push("", "### Audio Prompt", scene.audioPrompt);
    }
  }

  return lines.join("\n");
}

function renderComparisonMarkdown(preview: Extract<AgencyPreview, { previewType: "comparison" }>): string {
  const formatPrice = (option: typeof preview.data.options[number]): string | null => {
    if (option.priceLabel) return option.priceLabel;
    if (option.price == null) return null;
    const formattedAmount = new Intl.NumberFormat("en-US").format(option.price);
    return [option.currency, formattedAmount].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
  };

  const lines: string[] = [
    `# ${preview.data.title}`,
  ];

  if (preview.data.summary) {
    lines.push("", preview.data.summary);
  }

  if (preview.data.locationSummary) {
    lines.push("", `Location focus: ${preview.data.locationSummary}`);
  }

  if (preview.data.sortHint) {
    lines.push("", `Sort hint: ${preview.data.sortHint}`);
  }

  if (preview.data.recommendations.length > 0) {
    lines.push("", "## Recommendations");
    for (const recommendation of preview.data.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  lines.push("", "## Options");
  preview.data.options.forEach((option, index) => {
    lines.push("", `### ${index + 1}. ${option.vendor} - ${option.optionTitle}`);

    const formattedPrice = formatPrice(option);
    if (formattedPrice) {
      lines.push(`- Price: ${formattedPrice}`);
    }

    if (option.availabilityState !== "unknown") {
      lines.push(`- Availability: ${option.availabilityState}`);
    }

    if (option.refundable != null) {
      lines.push(`- Refundable: ${option.refundable ? "yes" : "no"}`);
    }

    if (option.distanceLabel || option.distance != null) {
      lines.push(`- Distance: ${option.distanceLabel ?? `${option.distance} ${option.distanceUnit ?? ""}`.trim()}`);
    }

    if (option.locationSummary) {
      lines.push(`- Location: ${option.locationSummary}`);
    }

    if (option.bookingLink) {
      lines.push(`- Booking: ${option.bookingLink}`);
    }

    if (option.notes) {
      lines.push(`- Notes: ${option.notes}`);
    }

    if (option.evidence.length > 0) {
      lines.push("- Evidence:");
      for (const evidence of option.evidence) {
        const parts = [evidence.label, evidence.url, evidence.snippet]
          .filter((value): value is string => typeof value === "string" && value.length > 0);
        lines.push(`  - ${parts.join(" | ")}`);
      }
    }
  });

  return lines.join("\n");
}

function renderProvenanceMarkdown(preview: AgencyPreview): string {
  if (preview.provenance.length === 0) {
    return "";
  }

  const lines = ["", "## Provenance"];
  for (const entry of preview.provenance) {
    const parts = [
      entry.title,
      entry.documentId ? `doc:${entry.documentId}` : null,
      entry.chunkId ? `chunk:${entry.chunkId}` : null,
      entry.url,
    ].filter((value): value is string => Boolean(value));
    lines.push(`- ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

function renderLibraryMarkdown(preview: AgencyPreview): string {
  if (preview.previewType === "research") {
    return `${renderResearchMarkdown(preview)}${renderProvenanceMarkdown(preview)}\n`;
  }
  if (preview.previewType === "comparison") {
    return `${renderComparisonMarkdown(preview)}${renderProvenanceMarkdown(preview)}\n`;
  }
  if (preview.previewType === "storyboard") {
    return `${renderStoryboardMarkdown(preview)}${renderProvenanceMarkdown(preview)}\n`;
  }
  throw new AgencyPreviewCommitError(
    "UNSUPPORTED_PREVIEW",
    `Unsupported preview type: ${preview.previewType}`,
  );
}

async function validateReadableProvenance(
  preview: AgencyPreview,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<void> {
  for (const entry of preview.provenance) {
    if (!entry.documentId || !/^\d+$/.test(entry.documentId)) {
      continue;
    }
    const documentId = Number(entry.documentId);
    const item = await getLibraryItemById(documentId, actor as any, dbClient);
    if (!item) {
      throw new AgencyPreviewCommitError(
        "PERMISSION_DENIED",
        `Source document ${entry.documentId} is no longer readable`,
      );
    }
    const permission = await getUserEffectivePermission(documentId, actor as any, dbClient);
    if (!permission.effectivePermissionLevel) {
      throw new AgencyPreviewCommitError(
        "PERMISSION_DENIED",
        `Source document ${entry.documentId} is no longer readable`,
      );
    }
  }
}

function ensurePreviewCanCommit(
  preview: AgencyPreview | null,
  artifactRecord: AgencyPreviewArtifactRecord,
  commitToken: string,
): asserts preview is Exclude<AgencyPreview, { previewType: "deck" }> {
  if (!preview) {
    throw new AgencyPreviewCommitError("ARTIFACT_NOT_FOUND", "Preview not found");
  }
  if (artifactRecord.commitToken !== commitToken) {
    throw new AgencyPreviewCommitError("INVALID_COMMIT_TOKEN", "Commit token does not match preview");
  }
  if (preview.previewType === "deck") {
    throw new AgencyPreviewCommitError("UNSUPPORTED_PREVIEW", "Deck commits are handled separately");
  }
  if (preview.lifecycleState === "expired_preview") {
    throw new AgencyPreviewCommitError("STALE_PREVIEW", "Preview has expired and must be regenerated");
  }
}

export async function commitLibraryBackedPreview(params: {
  actor: LibraryActor;
  artifactRecord: AgencyPreviewArtifactRecord;
  commitToken: string;
  dbClient?: DbClient;
  preview: AgencyPreview | null;
}): Promise<AgencyPreviewCommitResult> {
  const { actor, artifactRecord, commitToken, preview } = params;
  ensurePreviewCanCommit(preview, artifactRecord, commitToken);

  if (
    artifactRecord.commitStatus === "committed"
    && artifactRecord.targetType === "library_item"
    && artifactRecord.targetId
  ) {
    return {
      artifactId: artifactRecord.id,
      runId: artifactRecord.runId,
      commitToken,
      status: "committed",
      targetType: artifactRecord.targetType,
      targetId: artifactRecord.targetId,
    };
  }

  const db = params.dbClient ?? await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await validateReadableProvenance(preview, actor, db);

  const now = new Date();
  const title = getCommitTitle(preview);
  const markdown = renderLibraryMarkdown(preview);
  const metadata = {
    source_type: getLibrarySourceType(preview),
    agency_artifact_id: artifactRecord.id,
    agency_run_id: artifactRecord.runId,
    agency_intent: preview.intent,
    preview_type: preview.previewType,
    rag_default_excluded: true,
    viewer_path: "library_markdown",
    provenance: preview.provenance,
  };

  try {
    return await db.transaction(async (tx: DbClient) => {
      await tx
        .update(agencyRunArtifacts)
        .set({
          commitStatus: "commit_pending",
          state: "commit_pending",
          updatedAt: now,
        })
        .where(eq(agencyRunArtifacts.id, artifactRecord.id));

      const createdItem = await createLibraryItem(
        {
          itemType: "md",
          source: "agency_generated",
          title,
          description: preview.summaryText,
          status: "ready",
          visibility: "private",
          metadata,
          sourceLink: {
            linkType: "agency_run_artifact",
            linkId: artifactRecord.id,
          },
        },
        actor,
        tx,
      );

      await tx
        .insert(libraryChunks)
        .values({
          tenantId: String(actor.tenantId),
          libraryItemId: createdItem.item.id,
          chunkIndex: 0,
          content: markdown,
          contentType: "markdown_source",
          tokenCount: null,
          vectorRefId: null,
          vectorIndexName: resolveLibraryVectorIndexName(),
          metadata: {
            source: "agency_commit_preview",
            rag_excluded: true,
          },
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [libraryChunks.libraryItemId, libraryChunks.chunkIndex],
          set: {
            content: markdown,
            contentType: "markdown_source",
            tokenCount: null,
            vectorRefId: null,
            vectorIndexName: resolveLibraryVectorIndexName(),
            metadata: {
              source: "agency_commit_preview",
              rag_excluded: true,
            },
          },
        });

      await tx
        .update(libraryItems)
        .set({
          status: "ready",
          metadata,
          updatedAt: now,
        })
        .where(
          and(
            eq(libraryItems.id, createdItem.item.id),
            eq(libraryItems.tenantId, String(actor.tenantId)),
          ),
        );

      await tx
        .update(agencyRunArtifacts)
        .set({
          commitStatus: "committed",
          state: "committed",
          targetType: "library_item",
          targetId: String(createdItem.item.id),
          committedAt: now,
          updatedAt: now,
        })
        .where(eq(agencyRunArtifacts.id, artifactRecord.id));

      return {
        artifactId: artifactRecord.id,
        runId: artifactRecord.runId,
        commitToken,
        status: "committed",
        targetType: "library_item",
        targetId: String(createdItem.item.id),
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
