import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { verticalDramaDraftLedgers } from "../../drizzle/schema";
import { getDb } from "../db";
import type { VerticalDramaDraftLedgerOwner } from "./verticalDramaDraftLedger";

export const VERTICAL_DRAMA_STALE_DRAFT_DAY_OPTIONS = [5, 7, 10] as const;
export type VerticalDramaStaleDraftDays =
  (typeof VERTICAL_DRAMA_STALE_DRAFT_DAY_OPTIONS)[number];
const [stale5Days, stale7Days, stale10Days] =
  VERTICAL_DRAMA_STALE_DRAFT_DAY_OPTIONS;
export const verticalDramaStaleDraftDaysSchema = z.union([
  z.literal(stale5Days),
  z.literal(stale7Days),
  z.literal(stale10Days),
]);

export const VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES = [
  "ready_for_qc",
  "passed",
  "failed",
  "cancelled",
] as const;

export interface VerticalDramaStaleDraftCounts {
  5: number;
  7: number;
  10: number;
}

export function verticalDramaStaleDraftCutoff(
  olderThanDays: VerticalDramaStaleDraftDays,
  now = new Date()
): Date {
  return new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1_000);
}

export async function getVerticalDramaStaleDraftCounts(
  owner: VerticalDramaDraftLedgerOwner,
  now = new Date()
): Promise<VerticalDramaStaleDraftCounts> {
  const db = await getDb();
  const cutoff5 = verticalDramaStaleDraftCutoff(5, now);
  const cutoff7 = verticalDramaStaleDraftCutoff(7, now);
  const cutoff10 = verticalDramaStaleDraftCutoff(10, now);
  const [row] = await db
    .select({
      olderThan5Days: sql<number>`count(*) filter (where ${lt(verticalDramaDraftLedgers.updatedAt, cutoff5)})`,
      olderThan7Days: sql<number>`count(*) filter (where ${lt(verticalDramaDraftLedgers.updatedAt, cutoff7)})`,
      olderThan10Days: sql<number>`count(*) filter (where ${lt(verticalDramaDraftLedgers.updatedAt, cutoff10)})`,
    })
    .from(verticalDramaDraftLedgers)
    .where(
      and(
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId),
        isNull(verticalDramaDraftLedgers.archivedAt),
        lt(verticalDramaDraftLedgers.updatedAt, cutoff5),
        inArray(
          verticalDramaDraftLedgers.jobStatus,
          VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES
        )
      )
    );

  return {
    5: Number(row?.olderThan5Days ?? 0),
    7: Number(row?.olderThan7Days ?? 0),
    10: Number(row?.olderThan10Days ?? 0),
  };
}

export async function archiveVerticalDramaStaleDraftJobs(
  owner: VerticalDramaDraftLedgerOwner,
  olderThanDays: VerticalDramaStaleDraftDays,
  now = new Date()
): Promise<number> {
  const db = await getDb();
  const cutoff = verticalDramaStaleDraftCutoff(olderThanDays, now);
  const predicate = and(
    eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
    eq(verticalDramaDraftLedgers.userId, owner.userId),
    isNull(verticalDramaDraftLedgers.archivedAt),
    inArray(
      verticalDramaDraftLedgers.jobStatus,
      VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES
    ),
    lt(verticalDramaDraftLedgers.updatedAt, cutoff)
  );
  const rows = (await db.execute(sql`
    WITH archived AS (
      UPDATE ${verticalDramaDraftLedgers}
      SET "jobStatus" = 'archived',
          "archivedAt" = ${now},
          "updatedAt" = ${now}
      WHERE ${predicate}
      RETURNING 1
    )
    SELECT count(*)::int AS "archivedCount" FROM archived
  `)) as unknown as Array<{ archivedCount: number | string | bigint }>;

  return Number(rows[0]?.archivedCount ?? 0);
}
