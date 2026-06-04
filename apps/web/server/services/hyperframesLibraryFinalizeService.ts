import {
  HyperframesLibraryFinalizeMetadataSchema,
  buildHyperframesLibraryIdempotencyKey,
  createDefaultHyperframesPollingGuidance,
  type HyperframesArtifactRef,
  type HyperframesLibraryFinalizeMetadata,
  type HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";
import { createLibraryItem, type LibraryActor } from "./libraryService";
import {
  buildHyperframesRenderProjection,
  type HyperframesRenderJobPayload,
} from "./hyperframesRenderService";
import type { HyperframesAuthContext } from "./hyperframesFeatureAccessService";

export interface HyperframesFinalizeInput {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  payload: HyperframesRenderJobPayload;
  outputArtifactRef: HyperframesArtifactRef;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnailRef?: HyperframesArtifactRef | null;
  qaStatus: "passed" | "passed_with_warnings";
  title?: string;
  idempotencyKey?: string;
}

export const HYPERFRAMES_LIBRARY_SOURCE =
  "marketplace_auto_review_hyperframes_render" as const;
export const HYPERFRAMES_LIBRARY_SOURCE_LABEL =
  "HyperFrames Marketplace Auto Review";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildHyperframesLibrarySurfaceProjection(input: {
  libraryItem: Record<string, unknown>;
  metadata?: Partial<HyperframesLibraryFinalizeMetadata> | Record<string, unknown>;
}) {
  const item = input.libraryItem;
  const metadata = recordValue(input.metadata ?? item.metadata);
  const itemId = item.id ?? item.itemId ?? null;
  const productId = textValue(metadata.productId);
  const runId = textValue(metadata.runId);
  const renderJobId = textValue(metadata.renderJobId);
  const source = textValue(item.source) ?? textValue(metadata.source);
  const itemType = textValue(item.itemType) ?? textValue(item.item_type);
  const sourceUrl = textValue(item.sourceUrl) ?? textValue(item.source_url);
  const thumbnailUrl =
    textValue(item.thumbnailUrl) ?? textValue(item.thumbnail_url);
  const title =
    textValue(item.title) ?? "Marketplace Auto Review HyperFrames video";
  const isHyperframes =
    source === HYPERFRAMES_LIBRARY_SOURCE ||
    textValue(metadata.source) === HYPERFRAMES_LIBRARY_SOURCE;
  const isVideo = itemType === "video";
  const discoverable = Boolean(isHyperframes && isVideo && itemId != null);

  return {
    discoverable,
    source: HYPERFRAMES_LIBRARY_SOURCE,
    sourceLabel: HYPERFRAMES_LIBRARY_SOURCE_LABEL,
    itemType: "video" as const,
    libraryCard: {
      itemId,
      title,
      sourceUrl,
      thumbnailUrl,
      sourceBadge: HYPERFRAMES_LIBRARY_SOURCE_LABEL,
      playable: Boolean(discoverable && sourceUrl),
      accessibleLabel: `${HYPERFRAMES_LIBRARY_SOURCE_LABEL} video: ${title}`,
    },
    mediaHistoryFilter: {
      source: HYPERFRAMES_LIBRARY_SOURCE,
      productId,
      runId,
      mediaKind: "video" as const,
    },
    productDetailMediaPanel: {
      productId,
      runId,
      renderJobId,
      visible: Boolean(discoverable && productId),
      outputLabel: "HyperFrames final video",
    },
    videoEditorHandoff: {
      itemId,
      routePath:
        itemId == null
          ? "/video-editor"
          : `/video-editor?libraryItemId=${encodeURIComponent(String(itemId))}`,
      mediaKind: "video" as const,
      sourceUrl,
      thumbnailUrl,
      title,
      provenance: {
        productId,
        runId,
        renderJobId,
        templateId: textValue(metadata.templateId),
        platformPresetId: textValue(metadata.platformPresetId),
      },
    },
  };
}

export function hyperframesLibraryItemMatchesDiscovery(input: {
  libraryItem: Record<string, unknown>;
  productId?: string | null;
  runId?: string | null;
}) {
  const projection = buildHyperframesLibrarySurfaceProjection({
    libraryItem: input.libraryItem,
  });
  if (!projection.discoverable) return false;
  if (input.productId && projection.mediaHistoryFilter.productId !== input.productId) {
    return false;
  }
  if (input.runId && projection.mediaHistoryFilter.runId !== input.runId) {
    return false;
  }
  return true;
}

export function buildHyperframesLibraryFinalizeMetadata(
  input: HyperframesFinalizeInput
): HyperframesLibraryFinalizeMetadata {
  const tenantId = input.auth.tenantId ?? "default";
  const expectedKey = buildHyperframesLibraryIdempotencyKey({
    tenantId,
    runId: input.runId,
    renderIntent: input.payload.renderIntent as never,
    compositionInputHash: input.payload.compositionInputHash,
    outputHash: input.outputArtifactRef.contentHash,
  });
  if (input.idempotencyKey && input.idempotencyKey !== expectedKey) {
    throw new Error("HyperFrames Library idempotency key mismatch");
  }
  return HyperframesLibraryFinalizeMetadataSchema.parse({
    source: HYPERFRAMES_LIBRARY_SOURCE,
    tenantId,
    userId: input.auth.userId,
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    templateId: input.payload.templateId,
    templateVersion: input.payload.templateVersion,
    platformPresetId: input.payload.platformPresetId,
    platformPresetVersion: input.payload.platformPresetVersion,
    renderIntent: input.payload.renderIntent,
    compositionInputHash: input.payload.compositionInputHash,
    compositionHtmlHash: input.payload.compositionHtmlHash,
    outputHash: input.outputArtifactRef.contentHash,
    outputArtifactRef: input.outputArtifactRef,
    thumbnailRef: input.thumbnailRef ?? null,
    subtitleRefs: [],
    qaStatus: input.qaStatus,
    idempotencyKey: expectedKey,
    creditRefs: {},
    trace: {
      traceId: input.payload.traceId,
      correlationId: input.payload.correlationId,
    },
  });
}

export async function finalizeHyperframesRenderToLibrary(input: HyperframesFinalizeInput): Promise<{
  created: boolean;
  libraryItem: Record<string, unknown>;
  metadata: HyperframesLibraryFinalizeMetadata;
  render: HyperframesRenderStatusProjection;
}> {
  const metadata = buildHyperframesLibraryFinalizeMetadata(input);
  const actor: LibraryActor = {
    userId: input.auth.userId,
    tenantId: input.auth.tenantId ?? "default",
  };
  const result = await createLibraryItem(
    {
      itemType: "video",
      source: HYPERFRAMES_LIBRARY_SOURCE,
      title: input.title ?? "Marketplace Auto Review video",
      description: "Finalized HyperFrames Marketplace Auto Review render",
      status: "ready",
      visibility: "private",
      sourceUrl: input.outputUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      metadata: metadata as unknown as Record<string, unknown>,
      sourceLink: {
        linkType: "hyperframes_library_idempotency",
        linkId: metadata.idempotencyKey,
        providerTaskId: input.renderJobId,
      },
    },
    actor
  );
  const libraryItem = result.item as unknown as Record<string, unknown>;
  const libraryItemId = (libraryItem.id as string | number | undefined) ?? null;
  const render = buildHyperframesRenderProjection({
    tenantId: metadata.tenantId,
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    status: "saved_to_library",
    payload: input.payload,
    outputUrl: input.outputUrl ?? null,
    libraryItemId,
    artifactRefs: [input.outputArtifactRef],
    outputRefs: [
      {
        outputId:
          input.outputArtifactRef.artifactId || `${input.renderJobId}_library`,
        kind: "library_item",
        url: input.outputUrl ?? null,
        storageRef: input.outputArtifactRef.storageRef,
        thumbnailUrl: input.thumbnailUrl ?? null,
        contentHash: input.outputArtifactRef.contentHash,
        libraryItemId,
        accessibleLabel: "HyperFrames Library video",
      },
    ],
  });
  return {
    created: !result.idempotent,
    libraryItem,
    metadata,
    render: {
      ...render,
      polling: createDefaultHyperframesPollingGuidance("saved_to_library"),
    },
  };
}
