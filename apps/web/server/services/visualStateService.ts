/**
 * Visual State Service (Section 05: Visual State Service)
 *
 * Manages the per-conversation "visual working set" — the set of images
 * currently relevant to an ongoing conversation. Backed by the
 * conversation_visual_state table as the source of truth.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { conversationVisualState, conversations } from "../../drizzle/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECENT_ASSETS = 12;
const MAX_ACTIVE_ASSETS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisualState {
  conversationId: number;
  recentAssetIds: number[];
  activeAssetIds: number[];
  comparedAssetIds: number[];
  namedSets: Record<string, number[]>;
  updatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helper: row → VisualState
// ---------------------------------------------------------------------------

function rowToState(row: typeof conversationVisualState.$inferSelect): VisualState {
  return {
    conversationId: row.conversationId,
    recentAssetIds: (row.recentAssetIds as number[]) ?? [],
    activeAssetIds: (row.activeAssetIds as number[]) ?? [],
    comparedAssetIds: (row.comparedAssetIds as number[]) ?? [],
    namedSets: (row.namedSets as Record<string, number[]>) ?? {},
    updatedAt: row.updatedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get or create the visual state for a conversation.
 * Reads the authoritative row directly from PostgreSQL.
 */
export async function getOrCreateState(conversationId: number): Promise<VisualState> {
  const db = await getDb();
  if (!db) {
    return {
      conversationId,
      recentAssetIds: [],
      activeAssetIds: [],
      comparedAssetIds: [],
      namedSets: {},
      updatedAt: null,
    };
  }

  // Fetch existing row
  const rows = await db
    .select()
    .from(conversationVisualState)
    .where(eq(conversationVisualState.conversationId, conversationId))
    .limit(1);

  if (rows.length > 0) {
    return rowToState(rows[0]);
  }

  // Insert default row (handle concurrent inserts with onConflictDoNothing)
  const [conversation] = await db
    .select({ tenantId: conversations.tenantId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const inserted = await db
    .insert(conversationVisualState)
    .values({
      tenantId: conversation?.tenantId ?? "",
      conversationId,
      recentAssetIds: [],
      activeAssetIds: [],
      comparedAssetIds: [],
      namedSets: {},
    })
    .onConflictDoNothing()
    .returning();

  const state: VisualState =
    inserted.length > 0
      ? rowToState(inserted[0])
      : {
          conversationId,
          recentAssetIds: [],
          activeAssetIds: [],
          comparedAssetIds: [],
          namedSets: {},
          updatedAt: null,
        };

  return state;
}

/**
 * Atomically append an assetId to the recent list (FIFO, max 12).
 * Uses PostgreSQL JSONB operations to prevent lost updates under concurrency.
 * If the assetId already exists, it is moved to the end (MRU behavior).
 */
export async function addRecentAsset(conversationId: number, assetId: number): Promise<void> {
  // Ensure the row exists first
  await getOrCreateState(conversationId);

  const db = await getDb();
  if (!db) return;

  // Atomic JSONB operation:
  // 1. Remove assetId if already present (dedup/MRU)
  // 2. Append assetId to end
  // 3. Trim from front if length exceeds MAX_RECENT_ASSETS
  await db
    .update(conversationVisualState)
    .set({
      recentAssetIds: sql`(
        SELECT jsonb_agg(elem)
        FROM (
          SELECT elem
          FROM jsonb_array_elements(
            COALESCE("recentAssetIds", '[]'::jsonb) - ${String(assetId)}
          ) AS elem
          UNION ALL
          SELECT to_jsonb(${assetId}::int)
        ) sub
        OFFSET GREATEST(0,
          (SELECT count(*) FROM jsonb_array_elements(
            COALESCE("recentAssetIds", '[]'::jsonb) - ${String(assetId)}
          )) + 1 - ${MAX_RECENT_ASSETS}
        )
      )`,
      updatedAt: new Date(),
    })
    .where(eq(conversationVisualState.conversationId, conversationId));

}

/**
 * Replace the active asset set (capped at MAX_ACTIVE_ASSETS = 5).
 */
export async function setActiveAssets(conversationId: number, assetIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const capped = assetIds.slice(0, MAX_ACTIVE_ASSETS);
  await db
    .update(conversationVisualState)
    .set({ activeAssetIds: capped, updatedAt: new Date() })
    .where(eq(conversationVisualState.conversationId, conversationId));

}

/**
 * Replace the compared asset set.
 */
export async function setComparedAssets(conversationId: number, assetIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(conversationVisualState)
    .set({ comparedAssetIds: assetIds, updatedAt: new Date() })
    .where(eq(conversationVisualState.conversationId, conversationId));

}

/**
 * Create or overwrite a named set of asset IDs.
 * Name must be alphanumeric + underscore/dash, max 64 chars.
 */
export async function createNamedSet(
  conversationId: number,
  name: string,
  assetIds: number[]
): Promise<void> {
  // Sanitize name to prevent JSONB path injection
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!safeName) throw new Error("Named set name must be alphanumeric");

  await getOrCreateState(conversationId);

  const db = await getDb();
  if (!db) return;

  await db
    .update(conversationVisualState)
    .set({
      namedSets: sql`jsonb_set(
        COALESCE("namedSets", '{}'::jsonb),
        ${sql.raw(`'{${safeName}}'`)},
        ${JSON.stringify(assetIds)}::jsonb
      )`,
      updatedAt: new Date(),
    })
    .where(eq(conversationVisualState.conversationId, conversationId));

}

/**
 * Retrieve asset IDs for a named set. Returns [] if not found.
 */
export async function resolveNamedSet(
  conversationId: number,
  name: string
): Promise<number[]> {
  const state = await getOrCreateState(conversationId);
  return state.namedSets[name] ?? [];
}

/**
 * Remove an assetId from all lists (recent, active, compared) and all named sets.
 */
export async function removeAssetFromState(
  conversationId: number,
  assetId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Remove from array columns using JSONB subtraction operator
  await db
    .update(conversationVisualState)
    .set({
      recentAssetIds: sql`COALESCE("recentAssetIds", '[]'::jsonb) - ${String(assetId)}`,
      activeAssetIds: sql`COALESCE("activeAssetIds", '[]'::jsonb) - ${String(assetId)}`,
      comparedAssetIds: sql`COALESCE("comparedAssetIds", '[]'::jsonb) - ${String(assetId)}`,
      updatedAt: new Date(),
    })
    .where(eq(conversationVisualState.conversationId, conversationId));

  // For namedSets: read-modify-write (low-frequency operation)
  const state = await getOrCreateState(conversationId);
  const updatedSets: Record<string, number[]> = {};
  for (const [name, ids] of Object.entries(state.namedSets)) {
    updatedSets[name] = (ids as number[]).filter((id) => id !== assetId);
  }

  await db
    .update(conversationVisualState)
    .set({ namedSets: updatedSets, updatedAt: new Date() })
    .where(eq(conversationVisualState.conversationId, conversationId));

}
