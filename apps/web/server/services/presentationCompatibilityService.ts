import crypto from "crypto";

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
import {
  cleanupExpiredPresentationConversionState,
  getActivePresentationConversionByIdempotency,
  getActivePresentationConversionBySource,
  releasePresentationConversionLock,
  tryAcquirePresentationConversionLock,
  upsertPresentationConversionRecord,
  upsertPresentationSourceAttachment,
  type StoredPresentationConversionRecord,
} from "./presentationPersistence";
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
import {
  incrementPresentationMetric,
  recordPresentationFailureMetric,
  recordPresentationLog,
} from "./presentationObservability";

interface ConversionRecord {
  sourceItemId: number | null;
  sourceFormat: "pptx" | "ppt" | "google_slides";
  deckLibraryItemId: number | null;
  deckId: number | null;
  partialFidelity: boolean;
  fidelityWarnings: string[];
}

interface ConversionStateRecord extends ConversionRecord {
  idempotencyKey: string;
  expiresAtMs: number;
}

const CONVERSION_LOCK_TTL_MS = 3 * 60_000;
const CONVERSION_RECORD_TTL_MS = 24 * 60 * 60_000;

const fallbackConversionBySource = new Map<string, ConversionStateRecord>();
const fallbackConversionByIdempotency = new Map<string, ConversionStateRecord>();
const fallbackConversionLocks = new Map<string, { lockToken: string; expiresAtMs: number }>();

export interface PresentationConversionDependencies {
  useInMemoryStateFallback?: boolean;
  getLibraryItemById: typeof getLibraryItemById;
  createLibraryItem: typeof createLibraryItem;
  createPresentationDeckForLibraryItem: typeof createPresentationDeckForLibraryItem;
  upsertSourceAttachment: typeof upsertPresentationSourceAttachment;
  cleanupExpiredConversionState: (input: { now: Date }) => Promise<void>;
  getStoredConversionBySource: (input: {
    tenantId: string;
    sourceItemId: number;
    now: Date;
  }) => Promise<StoredPresentationConversionRecord | null>;
  getStoredConversionByIdempotency: (input: {
    tenantId: string;
    sourceItemId: number;
    idempotencyKey: string;
    now: Date;
  }) => Promise<StoredPresentationConversionRecord | null>;
  upsertStoredConversionRecord: (input: {
    tenantId: string;
    userId: number;
    sourceItemId: number | null;
    sourceFormat: "pptx" | "ppt" | "google_slides";
    idempotencyKey: string;
    deckLibraryItemId: number;
    deckId: number;
    partialFidelity: boolean;
    fidelityWarnings: string[];
    now: Date;
    expiresAt: Date;
  }) => Promise<StoredPresentationConversionRecord>;
  acquireConversionLock: (input: {
    tenantId: string;
    sourceItemId: number;
    lockToken: string;
    now: Date;
    expiresAt: Date;
  }) => Promise<boolean>;
  releaseConversionLock: (input: {
    tenantId: string;
    sourceItemId: number;
    lockToken: string;
  }) => Promise<void>;
  now: () => number;
  conversionLockTtlMs: number;
  conversionRecordTtlMs: number;
}

const durableStateDependencies = {
  cleanupExpiredConversionState: cleanupExpiredPresentationConversionState,
  getStoredConversionBySource: getActivePresentationConversionBySource,
  getStoredConversionByIdempotency: getActivePresentationConversionByIdempotency,
  upsertStoredConversionRecord: upsertPresentationConversionRecord,
  acquireConversionLock: tryAcquirePresentationConversionLock,
  releaseConversionLock: releasePresentationConversionLock,
};

const defaultDependencies: PresentationConversionDependencies = {
  getLibraryItemById,
  createLibraryItem,
  createPresentationDeckForLibraryItem,
  upsertSourceAttachment: upsertPresentationSourceAttachment,
  ...durableStateDependencies,
  now: Date.now,
  conversionLockTtlMs: CONVERSION_LOCK_TTL_MS,
  conversionRecordTtlMs: CONVERSION_RECORD_TTL_MS,
};

function buildSourceKey(actor: Pick<PresentationActor, "tenantId">, sourceItemId: number | null): string {
  return `${actor.tenantId}:${sourceItemId}`;
}

function buildIdempotencyCacheKey(sourceKey: string, idempotencyKey: string): string {
  return `${sourceKey}:${idempotencyKey}`;
}

function pruneFallbackConversionState(nowMs: number): void {
  for (const [sourceKey, record] of fallbackConversionBySource.entries()) {
    if (record.expiresAtMs <= nowMs) {
      fallbackConversionBySource.delete(sourceKey);
      fallbackConversionByIdempotency.delete(buildIdempotencyCacheKey(sourceKey, record.idempotencyKey));
    }
  }

  for (const [sourceKey, lockState] of fallbackConversionLocks.entries()) {
    if (lockState.expiresAtMs <= nowMs) {
      fallbackConversionLocks.delete(sourceKey);
    }
  }
}

function toStoredRecord(record: ConversionStateRecord): StoredPresentationConversionRecord {
  return {
    sourceItemId: record.sourceItemId,
    sourceFormat: record.sourceFormat,
    deckLibraryItemId: record.deckLibraryItemId,
    deckId: record.deckId,
    partialFidelity: record.partialFidelity,
    fidelityWarnings: record.fidelityWarnings,
  };
}

const fallbackStateDependencies = {
  async cleanupExpiredConversionState(): Promise<void> {
    return;
  },

  async getStoredConversionBySource(input: {
    tenantId: string;
    sourceItemId: number;
    now: Date;
  }): Promise<StoredPresentationConversionRecord | null> {
    const nowMs = input.now.getTime();
    pruneFallbackConversionState(nowMs);
    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
    const record = fallbackConversionBySource.get(sourceKey);
    return record ? toStoredRecord(record) : null;
  },

  async getStoredConversionByIdempotency(input: {
    tenantId: string;
    sourceItemId: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<StoredPresentationConversionRecord | null> {
    const nowMs = input.now.getTime();
    pruneFallbackConversionState(nowMs);
    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
    const record = fallbackConversionByIdempotency.get(
      buildIdempotencyCacheKey(sourceKey, input.idempotencyKey),
    );
    return record ? toStoredRecord(record) : null;
  },

  async upsertStoredConversionRecord(input: {
    tenantId: string;
    userId: number;
    sourceItemId: number | null;
    sourceFormat: "pptx" | "ppt" | "google_slides";
    idempotencyKey: string;
    deckLibraryItemId: number;
    deckId: number;
    partialFidelity: boolean;
    fidelityWarnings: string[];
    now: Date;
    expiresAt: Date;
  }): Promise<StoredPresentationConversionRecord> {
    const nowMs = input.now.getTime();
    pruneFallbackConversionState(nowMs);
    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
    const record: ConversionStateRecord = {
      sourceItemId: input.sourceItemId,
      sourceFormat: input.sourceFormat,
      deckLibraryItemId: input.deckLibraryItemId,
      deckId: input.deckId,
      partialFidelity: input.partialFidelity,
      fidelityWarnings: input.fidelityWarnings,
      idempotencyKey: input.idempotencyKey,
      expiresAtMs: input.expiresAt.getTime(),
    };
    fallbackConversionBySource.set(sourceKey, record);
    fallbackConversionByIdempotency.set(
      buildIdempotencyCacheKey(sourceKey, input.idempotencyKey),
      record,
    );
    return toStoredRecord(record);
  },

  async acquireConversionLock(input: {
    tenantId: string;
    sourceItemId: number;
    lockToken: string;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    const nowMs = input.now.getTime();
    pruneFallbackConversionState(nowMs);
    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
    const existing = fallbackConversionLocks.get(sourceKey);
    if (existing && existing.expiresAtMs > nowMs) {
      return false;
    }
    fallbackConversionLocks.set(sourceKey, {
      lockToken: input.lockToken,
      expiresAtMs: input.expiresAt.getTime(),
    });
    return true;
  },

  async releaseConversionLock(input: {
    tenantId: string;
    sourceItemId: number;
    lockToken: string;
  }): Promise<void> {
    const sourceKey = buildSourceKey({ tenantId: input.tenantId }, input.sourceItemId);
    const existing = fallbackConversionLocks.get(sourceKey);
    if (existing?.lockToken === input.lockToken) {
      fallbackConversionLocks.delete(sourceKey);
    }
  },
};

function resolveDependencies(
  deps?: Partial<PresentationConversionDependencies>,
): PresentationConversionDependencies {
  const useFallbackState = deps?.useInMemoryStateFallback === true;
  const stateDependencies = useFallbackState ? fallbackStateDependencies : durableStateDependencies;

  return {
    getLibraryItemById: deps?.getLibraryItemById ?? defaultDependencies.getLibraryItemById,
    createLibraryItem: deps?.createLibraryItem ?? defaultDependencies.createLibraryItem,
    createPresentationDeckForLibraryItem:
      deps?.createPresentationDeckForLibraryItem ?? defaultDependencies.createPresentationDeckForLibraryItem,
    upsertSourceAttachment: deps?.upsertSourceAttachment ?? defaultDependencies.upsertSourceAttachment,
    cleanupExpiredConversionState:
      deps?.cleanupExpiredConversionState ?? stateDependencies.cleanupExpiredConversionState,
    getStoredConversionBySource: deps?.getStoredConversionBySource ?? stateDependencies.getStoredConversionBySource,
    getStoredConversionByIdempotency:
      deps?.getStoredConversionByIdempotency ?? stateDependencies.getStoredConversionByIdempotency,
    upsertStoredConversionRecord:
      deps?.upsertStoredConversionRecord ?? stateDependencies.upsertStoredConversionRecord,
    acquireConversionLock: deps?.acquireConversionLock ?? stateDependencies.acquireConversionLock,
    releaseConversionLock: deps?.releaseConversionLock ?? stateDependencies.releaseConversionLock,
    now: deps?.now ?? defaultDependencies.now,
    conversionLockTtlMs: deps?.conversionLockTtlMs ?? defaultDependencies.conversionLockTtlMs,
    conversionRecordTtlMs: deps?.conversionRecordTtlMs ?? defaultDependencies.conversionRecordTtlMs,
  };
}

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
  deps?: Partial<PresentationConversionDependencies>,
): Promise<PresentationCompatibilityResult> {
  const resolved = resolveDependencies(deps);
  const item = await resolved.getLibraryItemById(itemId, actor);
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

function recordConversionOutcome(
  actor: PresentationActor,
  sourceFormat: string,
  conversionStatus: string,
): void {
  incrementPresentationMetric(`presentation.conversion.${conversionStatus}.total`);
  recordPresentationLog("presentation_conversion_outcome", {
    tenantId: actor.tenantId,
    userId: actor.userId,
    sourceFormat,
    conversionStatus,
  });
}

export async function convertOfficeSourceToPresentation(
  input: { sourceItemId: number; idempotencyKey: string },
  actor: PresentationActor,
  deps?: Partial<PresentationConversionDependencies>,
): Promise<PresentationConversionResult> {
  const resolved = resolveDependencies(deps);

  try {
    const sourceItem = await resolved.getLibraryItemById(input.sourceItemId, actor);
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
      recordConversionOutcome(actor, sourceFormat, "unsupported");
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

    const nowMs = resolved.now();
    const now = new Date(nowMs);
    const sourceKey = buildSourceKey(actor, sourceItem.id);
    await resolved.cleanupExpiredConversionState({ now });

    const existingBySource = await resolved.getStoredConversionBySource({
      tenantId: actor.tenantId,
      sourceItemId: sourceItem.id,
      now,
    });
    if (existingBySource) {
      recordConversionOutcome(actor, existingBySource.sourceFormat, "existing");
      return toConversionResult("existing", existingBySource);
    }

    const existingByIdempotency = await resolved.getStoredConversionByIdempotency({
      tenantId: actor.tenantId,
      sourceItemId: sourceItem.id,
      idempotencyKey: normalizedIdempotencyKey,
      now,
    });
    if (existingByIdempotency) {
      recordConversionOutcome(actor, existingByIdempotency.sourceFormat, "existing");
      return toConversionResult("existing", existingByIdempotency);
    }

    const lockToken = `presentation-conversion-lock-${crypto.randomUUID()}`;
    const lockAcquired = await resolved.acquireConversionLock({
      tenantId: actor.tenantId,
      sourceItemId: sourceItem.id,
      lockToken,
      now,
      expiresAt: new Date(nowMs + resolved.conversionLockTtlMs),
    });
    if (!lockAcquired) {
      recordConversionOutcome(actor, sourceFormat, "locked");
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

    try {
      const convertedItem = await resolved.createLibraryItem(
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

      const createdDeck = await resolved.createPresentationDeckForLibraryItem(
        {
          libraryItemId: convertedItem.item.id,
          title: toBasePresentationTitle(sourceItem.title),
          description: sourceItem.description,
        },
        actor,
      );

      await resolved.upsertSourceAttachment({
        deckId: createdDeck.deck.id,
        sourceLibraryItemId: sourceItem.id,
        sourceFormat,
        conversionStatus: "converted",
        partialFidelity: fidelityWarnings.length > 0,
        fidelityWarnings,
      });

      const persistedAtMs = resolved.now();
      const persistedRecord = await resolved.upsertStoredConversionRecord({
        tenantId: actor.tenantId,
        userId: actor.userId,
        sourceItemId: sourceItem.id,
        sourceFormat,
        idempotencyKey: normalizedIdempotencyKey,
        deckLibraryItemId: convertedItem.item.id,
        deckId: createdDeck.deck.id,
        partialFidelity: fidelityWarnings.length > 0,
        fidelityWarnings,
        now: new Date(persistedAtMs),
        expiresAt: new Date(persistedAtMs + resolved.conversionRecordTtlMs),
      });

      recordConversionOutcome(actor, sourceFormat, "created");
      return toConversionResult("created", persistedRecord);
    } finally {
      try {
        await resolved.releaseConversionLock({
          tenantId: actor.tenantId,
          sourceItemId: sourceItem.id,
          lockToken,
        });
      } catch (releaseError) {
        recordPresentationLog("presentation_conversion_lock_release_failed", {
          tenantId: actor.tenantId,
          userId: actor.userId,
          sourceKey,
          error: releaseError instanceof Error ? releaseError.message : String(releaseError),
        });
      }
    }
  } catch (error) {
    if (error instanceof PresentationServiceError) {
      recordPresentationFailureMetric(error.code);
      recordPresentationLog("presentation_conversion_failed", {
        tenantId: actor.tenantId,
        userId: actor.userId,
        errorCode: error.code,
      });
    }
    throw error;
  }
}

export function resetPresentationConversionStateForTests(): void {
  fallbackConversionBySource.clear();
  fallbackConversionByIdempotency.clear();
  fallbackConversionLocks.clear();
}
