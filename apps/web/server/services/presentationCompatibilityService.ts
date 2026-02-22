import {
  createLibraryItem,
  getLibraryItemById,
  type LibraryItemDto,
} from "./libraryService";
import {
  createPresentationDeckForLibraryItem,
  PresentationServiceError,
  type PresentationActor,
} from "./presentationService";
import { upsertPresentationSourceAttachment } from "./presentationPersistence";
import {
  PRESENTATION_COMPATIBILITY_SCHEMA_VERSION,
  PRESENTATION_CONVERSION_SCHEMA_VERSION,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ITEM_TYPE,
} from "@shared/presentation/constants";
import {
  presentationCompatibilityResultSchema,
  presentationConversionResultSchema,
  type PresentationCompatibilityResult,
  type PresentationConversionResult,
  type PresentationSourceFormat,
} from "@shared/presentation/contracts";

interface ConversionRecord {
  sourceKey: string;
  sourceItemId: number;
  sourceFormat: "pptx" | "ppt";
  deckLibraryItemId: number;
  deckId: number;
  partialFidelity: boolean;
  fidelityWarnings: string[];
}

const conversionBySource = new Map<string, ConversionRecord>();
const conversionByIdempotencyKey = new Map<string, ConversionRecord>();
const conversionLocks = new Set<string>();

export interface PresentationConversionDependencies {
  getLibraryItemById: typeof getLibraryItemById;
  createLibraryItem: typeof createLibraryItem;
  createPresentationDeckForLibraryItem: typeof createPresentationDeckForLibraryItem;
  upsertSourceAttachment: typeof upsertPresentationSourceAttachment;
}

const defaultDependencies: PresentationConversionDependencies = {
  getLibraryItemById,
  createLibraryItem,
  createPresentationDeckForLibraryItem,
  upsertSourceAttachment: upsertPresentationSourceAttachment,
};

function normalizeSourceExtension(item: Pick<LibraryItemDto, "metadata" | "sourceUrl" | "title">): string {
  const metadata = item.metadata && typeof item.metadata === "object"
    ? item.metadata
    : {};

  const metadataExtension = typeof (metadata as any).extension === "string"
    ? (metadata as any).extension
    : "";
  if (metadataExtension) {
    return metadataExtension.toLowerCase().replace(/^\./, "");
  }

  const sourceUrl = String(item.sourceUrl || "").split("?")[0];
  if (sourceUrl.includes(".")) {
    return sourceUrl.split(".").pop()!.toLowerCase();
  }

  if (item.title.includes(".")) {
    return item.title.split(".").pop()!.toLowerCase();
  }

  return "";
}

function inferPresentationSourceFormat(item: Pick<LibraryItemDto, "itemType" | "metadata" | "sourceUrl" | "title">): PresentationSourceFormat {
  if (item.itemType === PRESENTATION_ITEM_TYPE) {
    return "presentation";
  }

  const ext = normalizeSourceExtension(item);
  if (ext === "pptx") {
    return "pptx";
  }
  if (ext === "ppt") {
    return "ppt";
  }

  return "unknown";
}

function collectFidelityWarnings(metadata: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const rawUnsupported = Array.isArray((metadata as any).unsupportedConstructs)
    ? (metadata as any).unsupportedConstructs
    : [];

  for (const entry of rawUnsupported) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized) continue;
    warnings.push(`Unsupported construct: ${normalized}`);
  }

  if ((metadata as any).partialFidelity === true && warnings.length === 0) {
    warnings.push("Source includes constructs that may not fully match editable rendering.");
  }

  return warnings.slice(0, 25);
}

function buildSourceKey(actor: PresentationActor, sourceItemId: number): string {
  return `${actor.tenantId}:${sourceItemId}`;
}

function toBasePresentationTitle(sourceTitle: string): string {
  const base = sourceTitle.replace(/\.(pptx?|PPTX?)$/, "");
  const trimmed = base.trim();
  return trimmed || "Converted presentation";
}

function toCompatibilityReadOnly(
  itemId: number,
  sourceFormat: "pptx" | "ppt" | "unknown",
  canConvert: boolean,
  guidance: string,
  fidelityWarnings: string[],
): PresentationCompatibilityResult {
  return presentationCompatibilityResultSchema.parse({
    schemaVersion: PRESENTATION_COMPATIBILITY_SCHEMA_VERSION,
    mode: "read_only",
    itemId,
    sourceFormat,
    canConvert,
    guidance,
    partialFidelity: fidelityWarnings.length > 0,
    fidelityWarnings,
  });
}

export async function getPresentationCompatibilityOpen(
  itemId: number,
  actor: PresentationActor,
  deps: PresentationConversionDependencies = defaultDependencies,
): Promise<PresentationCompatibilityResult> {
  const item = await deps.getLibraryItemById(itemId, actor);
  if (!item) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: source item ${itemId} not found`,
    );
  }

  const sourceFormat = inferPresentationSourceFormat(item);
  if (sourceFormat === "presentation") {
    return presentationCompatibilityResultSchema.parse({
      schemaVersion: PRESENTATION_COMPATIBILITY_SCHEMA_VERSION,
      mode: "editable",
      itemId,
      sourceFormat: "presentation",
      canConvert: false,
    });
  }

  const fidelityWarnings = collectFidelityWarnings(item.metadata);
  if (sourceFormat === "pptx") {
    return toCompatibilityReadOnly(
      itemId,
      sourceFormat,
      true,
      "Open in read-only mode. Convert once to create an editable presentation copy.",
      fidelityWarnings,
    );
  }

  if (sourceFormat === "ppt") {
    return toCompatibilityReadOnly(
      itemId,
      sourceFormat,
      false,
      "Legacy .ppt files are read-only. Export or re-save as .pptx to convert.",
      fidelityWarnings,
    );
  }

  return toCompatibilityReadOnly(
    itemId,
    "unknown",
    false,
    "This file type is currently read-only for presentation editing.",
    fidelityWarnings,
  );
}

function toConversionResult(
  status: "created" | "existing",
  record: ConversionRecord,
): PresentationConversionResult {
  return presentationConversionResultSchema.parse({
    schemaVersion: PRESENTATION_CONVERSION_SCHEMA_VERSION,
    sourceItemId: record.sourceItemId,
    sourceFormat: record.sourceFormat,
    conversionStatus: status,
    partialFidelity: record.partialFidelity,
    fidelityWarnings: record.fidelityWarnings,
    deckLibraryItemId: record.deckLibraryItemId,
    deckId: record.deckId,
  });
}

export async function convertOfficeSourceToPresentation(
  input: { sourceItemId: number; idempotencyKey: string },
  actor: PresentationActor,
  deps: PresentationConversionDependencies = defaultDependencies,
): Promise<PresentationConversionResult> {
  const sourceItem = await deps.getLibraryItemById(input.sourceItemId, actor);
  if (!sourceItem) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: source item ${input.sourceItemId} not found`,
    );
  }

  const sourceFormat = inferPresentationSourceFormat(sourceItem);
  if (sourceFormat === "presentation" || sourceFormat === "unknown") {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.UNSUPPORTED_ITEM_TYPE,
      `${PRESENTATION_ERROR_CODE.UNSUPPORTED_ITEM_TYPE}: source format must be pptx/ppt`,
    );
  }

  const fidelityWarnings = collectFidelityWarnings(sourceItem.metadata);
  if (sourceFormat === "ppt") {
    return presentationConversionResultSchema.parse({
      schemaVersion: PRESENTATION_CONVERSION_SCHEMA_VERSION,
      sourceItemId: sourceItem.id,
      sourceFormat,
      conversionStatus: "unsupported",
      partialFidelity: fidelityWarnings.length > 0,
      fidelityWarnings,
      guidance: "Legacy .ppt files are read-only. Export or re-save as .pptx to convert.",
    });
  }

  const normalizedIdempotencyKey = input.idempotencyKey.trim().toLowerCase();
  if (!normalizedIdempotencyKey) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: idempotencyKey is required`,
    );
  }

  const sourceKey = buildSourceKey(actor, sourceItem.id);
  const existingBySource = conversionBySource.get(sourceKey);
  if (existingBySource) {
    return toConversionResult("existing", existingBySource);
  }

  const idempotencyCacheKey = `${sourceKey}:${normalizedIdempotencyKey}`;
  const existingByIdempotency = conversionByIdempotencyKey.get(idempotencyCacheKey);
  if (existingByIdempotency) {
    return toConversionResult("existing", existingByIdempotency);
  }

  if (conversionLocks.has(sourceKey)) {
    return presentationConversionResultSchema.parse({
      schemaVersion: PRESENTATION_CONVERSION_SCHEMA_VERSION,
      sourceItemId: sourceItem.id,
      sourceFormat,
      conversionStatus: "locked",
      partialFidelity: fidelityWarnings.length > 0,
      fidelityWarnings,
      guidance: "Conversion already in progress for this source item.",
    });
  }

  conversionLocks.add(sourceKey);

  try {
    const convertedItem = await deps.createLibraryItem(
      {
        itemType: PRESENTATION_ITEM_TYPE,
        source: "presentation_conversion",
        title: toBasePresentationTitle(sourceItem.title),
        description: sourceItem.description,
        metadata: {
          convertedFromItemId: sourceItem.id,
          sourceFormat,
          conversionSchemaVersion: PRESENTATION_CONVERSION_SCHEMA_VERSION,
          sourceTitle: sourceItem.title,
          fidelityWarnings,
          partialFidelity: fidelityWarnings.length > 0,
        },
        sourceUrl: sourceItem.sourceUrl,
        thumbnailUrl: sourceItem.thumbnailUrl,
      },
      actor,
    );

    const createdDeck = await deps.createPresentationDeckForLibraryItem(
      {
        libraryItemId: convertedItem.item.id,
        title: toBasePresentationTitle(sourceItem.title),
        description: sourceItem.description,
      },
      actor,
    );

    await deps.upsertSourceAttachment({
      deckId: createdDeck.deck.id,
      sourceLibraryItemId: sourceItem.id,
      sourceFormat,
      conversionStatus: "converted",
      partialFidelity: fidelityWarnings.length > 0,
      fidelityWarnings,
    });

    const record: ConversionRecord = {
      sourceKey,
      sourceItemId: sourceItem.id,
      sourceFormat,
      deckLibraryItemId: convertedItem.item.id,
      deckId: createdDeck.deck.id,
      partialFidelity: fidelityWarnings.length > 0,
      fidelityWarnings,
    };

    conversionBySource.set(sourceKey, record);
    conversionByIdempotencyKey.set(idempotencyCacheKey, record);

    return toConversionResult("created", record);
  } finally {
    conversionLocks.delete(sourceKey);
  }
}

export function resetPresentationConversionStateForTests(): void {
  conversionBySource.clear();
  conversionByIdempotencyKey.clear();
  conversionLocks.clear();
}
