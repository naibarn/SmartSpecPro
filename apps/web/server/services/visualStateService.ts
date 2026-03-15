/**
 * Visual State Service (Section 05: Visual State Service)
 *
 * Manages the per-conversation "visual working set" — the set of images
 * currently relevant to an ongoing conversation. Backed by the
 * conversation_visual_state table with a 30-second Redis cache.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { conversationVisualState } from "../../drizzle/schema";
import { getRedisClient, isRedisAvailable } from "./redis";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECENT_ASSETS = 12;
const MAX_ACTIVE_ASSETS = 5;
const REDIS_CACHE_PREFIX = "visual_state:";
const REDIS_CACHE_TTL = 30; // seconds

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
// Redis cache helpers
// ---------------------------------------------------------------------------

async function cacheGet(conversationId: number): Promise<VisualState | null> {
  if (!isRedisAvailable()) return null;
  try {
    const redis = getRedisClient();
    const raw = await redis.get(`${REDIS_CACHE_PREFIX}${conversationId}`);
    if (!raw) return null;
    return JSON.parse(raw) as VisualState;
  } catch {
    return null;
  }
}

async function cacheSet(conversationId: number, state: VisualState): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    const redis = getRedisClient();
    await redis.setex(
      `${REDIS_CACHE_PREFIX}${conversationId}`,
      REDIS_CACHE_TTL,
      JSON.stringify(state)
    );
  } catch {
    // ignore — cache is best-effort
  }
}

async function cacheInvalidate(conversationId: number): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    const redis = getRedisClient();
    await redis.del(`${REDIS_CACHE_PREFIX}${conversationId}`);
  } catch {
    // ignore
  }
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
 * Uses Redis cache-aside with 30-second TTL.
 */
export async function getOrCreateState(conversationId: number): Promise<VisualState> {
  // Cache hit
  const cached = await cacheGet(conversationId);
  if (cached) return cached;

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
    const state = rowToState(rows[0]);
    await cacheSet(conversationId, state);
    return state;
  }

  // Insert default row (handle concurrent inserts with onConflictDoNothing)
  const inserted = await db
    .insert(conversationVisualState)
    .values({
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

  await cacheSet(conversationId, state);
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

  await cacheInvalidate(conversationId);
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

  await cacheInvalidate(conversationId);
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

  await cacheInvalidate(conversationId);
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

  await cacheInvalidate(conversationId);
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

  await cacheInvalidate(conversationId);
}
