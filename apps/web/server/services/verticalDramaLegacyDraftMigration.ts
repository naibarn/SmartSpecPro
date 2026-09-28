import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  verticalDramaDraftLedgers,
  verticalDramaSeries,
  verticalDramaSourcePackSessions,
  verticalDramaSourcePacks,
} from "../../drizzle/schema";
import {
  buildVerticalDramaPlanningState,
  readVerticalDramaPlanningState,
  type VerticalDramaPlanningState,
} from "@shared/verticalDramaSeries/planningState";
import type { VerticalDramaDraftLedgerOwner } from "./verticalDramaDraftLedger";

export interface VerticalDramaLegacyDraftMigrationResult {
  processed: number;
  migrated: number;
  createdSeries: number;
  linkedExistingSeries: number;
  skipped: number;
  failed: number;
  /** True when the deploy is ahead of the Draft integrity migrations; retry after migration. */
  deferred?: boolean;
}

type DraftMigrationSnapshot = {
  id: string;
  jobCode: number;
  tenantId: string;
  userId: number;
  seriesId: number | null;
  draftSessionId: string;
  jobStatus: string;
  qcRunId: string | null;
  currentVersion: number;
  currentJson: unknown;
  requestJson: unknown;
  archivedAt: Date | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Keeps a rolling deploy safe when the app process starts before migration
 * The Draft compatibility/integrity migrations have been applied. Only schema-missing errors are deferred; real query
 * or ownership failures must still surface to the caller/logs.
 */
export function isLegacyDraftMigrationSchemaUnavailable(
  error: unknown
): boolean {
  const record = objectValue(error);
  const directCode =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  const code =
    typeof directCode === "string"
      ? directCode
      : typeof record.code === "string"
        ? record.code
        : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof record.message === "string"
        ? record.message
        : String(error);
  return (
    code === "42703" ||
    (code === "42P01" &&
      /vertical_drama_(draft_ledgers|source_packs|source_pack_sessions)/i.test(
        message
      ))
  );
}

function deferredMigrationResult(): VerticalDramaLegacyDraftMigrationResult {
  return {
    processed: 0,
    migrated: 0,
    createdSeries: 0,
    linkedExistingSeries: 0,
    skipped: 0,
    failed: 0,
    deferred: true,
  };
}

function nestedString(
  value: Record<string, unknown>,
  ...path: string[]
): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim()
    ? current.trim()
    : undefined;
}

function nestedNumber(
  value: Record<string, unknown>,
  ...path: string[]
): number | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" && Number.isInteger(current)
    ? current
    : undefined;
}

function draftRecoveryState(
  draft: Pick<
    DraftMigrationSnapshot,
    "id" | "draftSessionId" | "jobStatus" | "qcRunId" | "currentVersion"
  >,
  now: string
) {
  return {
    draftId: draft.id,
    draftSessionId: draft.draftSessionId,
    status: draft.jobStatus,
    ...(draft.qcRunId ? { qcRunId: draft.qcRunId } : {}),
    currentVersion: draft.currentVersion,
    migratedAt: now,
  };
}

/** Pure metadata extraction used by the migrator and unit tests. */
export function buildLegacyDraftSeriesMetadata(draft: {
  jobCode: number;
  currentJson: unknown;
  requestJson: unknown;
}) {
  const current = objectValue(draft.currentJson);
  const synthesis = objectValue(objectValue(draft.requestJson).synthesis);
  const title =
    nestedString(current, "title") ??
    nestedString(synthesis, "seriesTitleHint") ??
    `กู้คืนงาน Draft #${draft.jobCode}`;
  const locale = nestedString(synthesis, "locale")
    ?.toLowerCase()
    .startsWith("en")
    ? "en"
    : "th";
  const targetEpisodeCount = Math.min(
    1000,
    Math.max(1, nestedNumber(synthesis, "targetEpisodeCount") ?? 10)
  );
  return {
    title: title.slice(0, 255),
    locale,
    targetEpisodeCount,
    seriesProfileId: nestedString(synthesis, "seriesProfileId"),
  };
}

function isDraftReadyForPlanning(status: string): boolean {
  return ["ready_for_qc", "passed", "applied"].includes(status);
}

function mergeLegacyRecoveryState(
  bible: unknown,
  draft: DraftMigrationSnapshot,
  now: string
): Record<string, unknown> {
  const existingBible = objectValue(bible);
  const existingState = readVerticalDramaPlanningState(existingBible);
  const recovery = draftRecoveryState(draft, now);
  const nextState: VerticalDramaPlanningState = existingState
    ? { ...existingState, legacyRecovery: recovery }
    : buildVerticalDramaPlanningState({
        now,
        status: isDraftReadyForPlanning(draft.jobStatus)
          ? "draft_ready"
          : "planning",
        activeStep: "draft",
        draftSessionId: draft.draftSessionId,
      });
  if (!existingState) nextState.legacyRecovery = recovery;
  return { ...existingBible, planningState: nextState };
}

function matchesExistingSeries(
  series: { id: number; bible: unknown },
  draft: DraftMigrationSnapshot
): boolean {
  const state = readVerticalDramaPlanningState(series.bible);
  return Boolean(
    state &&
    (state.draftSessionId === draft.draftSessionId ||
      state.finalizedDraftSessionId === draft.draftSessionId ||
      state.activeDraft?.draftId === draft.id ||
      state.legacyRecovery?.draftId === draft.id)
  );
}

/**
 * Idempotently moves old Draft ledger rows into the Series-first workspace.
 * No ledger/version is deleted. A high-confidence existing Series is reused;
 * otherwise a free planning shell is created so the old Draft has one durable
 * Series URL and remains explicitly recoverable from the Planning tab.
 */
export async function migrateLegacyVerticalDramaDrafts(
  owner: VerticalDramaDraftLedgerOwner,
  limit = 50
): Promise<VerticalDramaLegacyDraftMigrationResult> {
  const db = getDb();
  let candidates: DraftMigrationSnapshot[];
  try {
    candidates = await db
      .select({
        id: verticalDramaDraftLedgers.id,
        jobCode: verticalDramaDraftLedgers.jobCode,
        tenantId: verticalDramaDraftLedgers.tenantId,
        userId: verticalDramaDraftLedgers.userId,
        seriesId: verticalDramaDraftLedgers.seriesId,
        draftSessionId: verticalDramaDraftLedgers.draftSessionId,
        jobStatus: verticalDramaDraftLedgers.jobStatus,
        qcRunId: verticalDramaDraftLedgers.qcRunId,
        currentVersion: verticalDramaDraftLedgers.currentVersion,
        currentJson: verticalDramaDraftLedgers.currentJson,
        requestJson: verticalDramaDraftLedgers.requestJson,
        archivedAt: verticalDramaDraftLedgers.archivedAt,
      })
      .from(verticalDramaDraftLedgers)
      .where(
        and(
          eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
          eq(verticalDramaDraftLedgers.userId, owner.userId),
          isNull(verticalDramaDraftLedgers.seriesId),
          isNull(verticalDramaDraftLedgers.seriesDeletedAt),
          isNull(verticalDramaDraftLedgers.archivedAt)
        )
      )
      .orderBy(desc(verticalDramaDraftLedgers.updatedAt))
      .limit(Math.max(1, Math.min(limit, 100)));
  } catch (error) {
    if (isLegacyDraftMigrationSchemaUnavailable(error)) {
      console.warn(
        "[verticalDramaLegacyDraftMigration] Draft integrity migration is not applied; deferring legacy Draft migration"
      );
      return deferredMigrationResult();
    }
    throw error;
  }

  const result: VerticalDramaLegacyDraftMigrationResult = {
    processed: candidates.length,
    migrated: 0,
    createdSeries: 0,
    linkedExistingSeries: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      const migrated = await db.transaction(async tx => {
        const [draft] = await tx
          .select()
          .from(verticalDramaDraftLedgers)
          .where(
            and(
              eq(verticalDramaDraftLedgers.id, candidate.id),
              eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
              eq(verticalDramaDraftLedgers.userId, owner.userId),
              isNull(verticalDramaDraftLedgers.seriesId),
              isNull(verticalDramaDraftLedgers.seriesDeletedAt),
              isNull(verticalDramaDraftLedgers.archivedAt)
            )
          )
          .for("update")
          .limit(1);
        if (!draft) return { kind: "skipped" as const };

        const [sourcePack] = await tx
          .select({
            id: verticalDramaSourcePacks.id,
            seriesId: verticalDramaSourcePacks.seriesId,
          })
          .from(verticalDramaSourcePacks)
          .where(
            and(
              eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
              eq(verticalDramaSourcePacks.userId, owner.userId),
              eq(verticalDramaSourcePacks.draftSessionId, draft.draftSessionId),
              isNull(verticalDramaSourcePacks.deletedAt)
            )
          )
          .orderBy(desc(verticalDramaSourcePacks.updatedAt))
          .limit(1);

        const existingSeries = await tx
          .select({
            id: verticalDramaSeries.id,
            bible: verticalDramaSeries.bible,
          })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.tenantId, owner.tenantId),
              eq(verticalDramaSeries.userId, owner.userId)
            )
          );
        const matchedSeries = existingSeries.find(series =>
          matchesExistingSeries(series, draft)
        );
        let seriesId = sourcePack?.seriesId ?? matchedSeries?.id ?? null;
        let createdSeries = false;

        if (seriesId == null) {
          const metadata = buildLegacyDraftSeriesMetadata(draft);
          const now = new Date().toISOString();
          const bible: Record<string, unknown> = {
            planningState: {
              ...buildVerticalDramaPlanningState({
                now,
                status: isDraftReadyForPlanning(draft.jobStatus)
                  ? "draft_ready"
                  : "planning",
                activeStep: "draft",
                draftSessionId: draft.draftSessionId,
              }),
              legacyRecovery: draftRecoveryState(draft, now),
            },
            ...(metadata.seriesProfileId
              ? { seriesProfile: { profileId: metadata.seriesProfileId } }
              : {}),
          };
          const [created] = await tx
            .insert(verticalDramaSeries)
            .values({
              tenantId: owner.tenantId,
              userId: owner.userId,
              title: metadata.title,
              locale: metadata.locale,
              aspectRatio: "9:16",
              status: "planning",
              targetEpisodeCount: metadata.targetEpisodeCount,
              defaultEpisodeDurationSeconds: 60,
              bible,
            })
            .returning({ id: verticalDramaSeries.id });
          if (!created)
            throw new Error("legacy Draft Series shell was not created");
          seriesId = created.id;
          createdSeries = true;
        } else {
          const [series] = await tx
            .select({
              id: verticalDramaSeries.id,
              bible: verticalDramaSeries.bible,
            })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, Number(seriesId)),
                eq(verticalDramaSeries.tenantId, owner.tenantId),
                eq(verticalDramaSeries.userId, owner.userId)
              )
            )
            .for("update")
            .limit(1);
          if (!series) throw new Error("legacy Draft Series owner mismatch");
          await tx
            .update(verticalDramaSeries)
            .set({
              bible: mergeLegacyRecoveryState(
                series.bible,
                draft,
                new Date().toISOString()
              ),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(verticalDramaSeries.id, series.id),
                eq(verticalDramaSeries.tenantId, owner.tenantId),
                eq(verticalDramaSeries.userId, owner.userId)
              )
            );
        }

        if (sourcePack && sourcePack.seriesId == null) {
          await tx
            .update(verticalDramaSourcePacks)
            .set({
              seriesId: Number(seriesId),
              draftSessionId: null,
              attachedAt: new Date(),
              status: "draft",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(verticalDramaSourcePacks.id, sourcePack.id),
                eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
                eq(verticalDramaSourcePacks.userId, owner.userId),
                isNull(verticalDramaSourcePacks.seriesId),
                isNull(verticalDramaSourcePacks.deletedAt)
              )
            );
          await tx
            .update(verticalDramaSourcePackSessions)
            .set({
              status: "claimed",
              claimedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(
                  verticalDramaSourcePackSessions.draftSessionId,
                  draft.draftSessionId
                ),
                eq(verticalDramaSourcePackSessions.tenantId, owner.tenantId),
                eq(verticalDramaSourcePackSessions.userId, owner.userId)
              )
            );
        }

        const [linked] = await tx
          .update(verticalDramaDraftLedgers)
          .set({ seriesId: Number(seriesId), updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaDraftLedgers.id, draft.id),
              eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
              eq(verticalDramaDraftLedgers.userId, owner.userId),
              isNull(verticalDramaDraftLedgers.seriesId),
              isNull(verticalDramaDraftLedgers.seriesDeletedAt)
            )
          )
          .returning({ id: verticalDramaDraftLedgers.id });
        if (!linked) return { kind: "skipped" as const };
        return {
          kind: "migrated" as const,
          createdSeries,
          linkedExisting: !createdSeries,
        };
      });
      if (migrated.kind === "skipped") result.skipped += 1;
      else {
        result.migrated += 1;
        if (migrated.createdSeries) result.createdSeries += 1;
        if (migrated.linkedExisting) result.linkedExistingSeries += 1;
      }
    } catch (error) {
      result.failed += 1;
      console.warn(
        `[verticalDramaLegacyDraftMigration] failed for ${candidate.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return result;
}
