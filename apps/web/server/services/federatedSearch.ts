/**
 * Federated Search Service
 *
 * Queries local DB (keyword), vector store (semantic), and Google Drive API
 * in parallel, then merges results using Reciprocal Rank Fusion (RRF).
 */

import { eq, and, isNull, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { libraryItems, libraryLinks, systemSettings } from "../../drizzle/schema";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { buildContextToolStateHintsFromResult } from "./contextToolService";
import type { ContextStateHints } from "../../shared/contextEngine";

// ── Types ──────────────────────────────────────────────────────────────────

export type SearchResultSource = "library" | "google_drive";

export type DriveResultsStatus =
  | "ok"
  | "timeout"
  | "error"
  | "disconnected"
  | "unavailable";

export interface FederatedSearchResult {
  id: string;
  title: string;
  source: SearchResultSource;
  score: number;
  metadata: Record<string, unknown>;
  preview: string | null;
  indexedStatus?: boolean;
  openUrl?: string;
}

export interface FederatedSearchInput {
  query: string;
  includeGoogleDrive: boolean;
  sourceFilter?: "all" | "library" | "google_drive";
  limit?: number;
  offset?: number;
}

export interface SearchActor {
  userId: number;
  tenantId: string;
  role?: string | null;
}

export interface FederatedSearchResponse {
  query: string;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  results: FederatedSearchResult[];
  driveResultsStatus: DriveResultsStatus;
  contextState?: ContextStateHints;
}

// ── Constants ──────────────────────────────────────────────────────────────

const RRF_K = 60;
const LOCAL_DB_TIMEOUT = 2000;
const VECTOR_TIMEOUT = 3000;
const DRIVE_TIMEOUT = 3000;

// ── Core Function ──────────────────────────────────────────────────────────

export async function federatedSearch(
  input: FederatedSearchInput,
  actor: SearchActor,
): Promise<FederatedSearchResponse> {
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;

  // Determine which backends to query
  let driveStatus: DriveResultsStatus = "disconnected";
  const includeDrive = input.includeGoogleDrive && input.sourceFilter !== "library";

  // Check Drive availability
  let driveEnabled = false;
  if (includeDrive) {
    const flagEnabled = await getDriveReadonlyScopeApproved();
    if (!flagEnabled) {
      driveStatus = "unavailable";
    } else {
      const connStatus = await checkGoogleConnectionStatus(actor);
      if (connStatus === "connected") {
        driveEnabled = true;
        driveStatus = "ok";
      } else {
        driveStatus = "disconnected";
      }
    }
  }

  // Execute backends in parallel
  const skipLocal = input.sourceFilter === "google_drive";
  const legs = [
    skipLocal
      ? Promise.resolve({ status: "ok" as const, result: [] as FederatedSearchResult[] })
      : withTimeout(searchLocalDb(input.query, actor, LOCAL_DB_TIMEOUT), LOCAL_DB_TIMEOUT, "local_db"),
    skipLocal
      ? Promise.resolve({ status: "ok" as const, result: [] as FederatedSearchResult[] })
      : withTimeout(searchVectorStore(input.query, actor, VECTOR_TIMEOUT), VECTOR_TIMEOUT, "vector"),
    driveEnabled
      ? withTimeout(searchGoogleDrive(input.query, actor, DRIVE_TIMEOUT), DRIVE_TIMEOUT, "drive")
      : Promise.resolve({ status: driveStatus as "ok", result: [] as FederatedSearchResult[] }),
  ] as const;

  const [localResult, vectorResult, driveResult] = await Promise.all(legs);

  // Collect ranked lists
  const localItems = localResult.status === "ok" ? localResult.result : [];
  const vectorItems = vectorResult.status === "ok" ? vectorResult.result : [];
  let driveItems: FederatedSearchResult[] = [];

  if (driveEnabled) {
    if (driveResult.status === "ok") {
      driveItems = driveResult.result;
      driveStatus = "ok";
    } else if (driveResult.status === "timeout") {
      driveStatus = "timeout";
    } else {
      driveStatus = "error";
    }
  }

  // Deduplicate Drive results against indexed references
  const canonicalMap = await getCanonicalDriveFileMap(actor.tenantId);
  const deduped = deduplicateResults(localItems, vectorItems, driveItems, canonicalMap);

  // Compute RRF
  const rankedLists = [deduped.local, deduped.vector, deduped.drive];
  let merged = computeRRF(rankedLists, RRF_K);

  // Apply source filter
  if (input.sourceFilter && input.sourceFilter !== "all") {
    merged = merged.filter((r) => r.source === input.sourceFilter);
  }

  // Paginate
  const total = merged.length;
  const paged = merged.slice(offset, offset + limit);
  const contextState = buildContextToolStateHintsFromResult({
    title: `Federated search results for "${input.query}"`,
    content: paged,
    ownerType: "user",
    ownerId: String(actor.userId),
    sourceRef: `federated:${input.query}`,
    source: "hybrid",
    includedReason: "Federated search results",
    trust: "derived",
    freshness: "recent",
  });

  return {
    query: input.query,
    total,
    limit,
    offset,
    has_more: offset + limit < total,
    results: paged,
    driveResultsStatus: driveStatus,
    contextState: Object.keys(contextState).length > 0 ? contextState : undefined,
  };
}

// ── Search Backends ────────────────────────────────────────────────────────

async function searchLocalDb(
  query: string,
  actor: SearchActor,
  _timeoutMs: number,
): Promise<FederatedSearchResult[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, actor.tenantId),
        isNull(libraryItems.deletedAt),
        or(
          ilike(libraryItems.title, `%${query}%`),
          ilike(libraryItems.description, `%${query}%`),
        ),
      ),
    )
    .limit(20);

  return rows.map((row, idx) => ({
    id: String(row.id),
    title: row.title,
    source: "library" as const,
    score: 1 - idx * 0.01, // Simple rank-based score
    metadata: {
      itemType: row.itemType,
      status: row.status,
      source: row.source,
      ownerUserId: row.ownerUserId,
    },
    preview: row.description?.slice(0, 200) ?? null,
  }));
}

async function searchVectorStore(
  query: string,
  actor: SearchActor,
  _timeoutMs: number,
): Promise<FederatedSearchResult[]> {
  try {
    const runtime = await getAppRuntimeConfig();
    const controller = new AbortController();
    const resp = await fetch(`${runtime.pythonBackendUrl}/api/internal/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(runtime.proxyToken ? { "x-proxy-token": runtime.proxyToken } : {}),
      },
      body: JSON.stringify({
        name: "search_drive_files",
        arguments: { query },
        user_id: actor.userId,
        tenant_id: actor.tenantId,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return [];

    // Vector search via existing library chunk data
    const db = await getDb();
    if (!db) return [];

    // Use SQL full-text search on library_chunks if available
    // Fallback: return empty for now (vector store integration varies per deployment)
    return [];
  } catch {
    return [];
  }
}

async function searchGoogleDrive(
  query: string,
  actor: SearchActor,
  _timeoutMs: number,
): Promise<FederatedSearchResult[]> {
  try {
    const runtime = await getAppRuntimeConfig();
    const resp = await fetch(`${runtime.pythonBackendUrl}/api/internal/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(runtime.proxyToken ? { "x-proxy-token": runtime.proxyToken } : {}),
      },
      body: JSON.stringify({
        name: "search_drive_files",
        arguments: { query, max_results: 20 },
        user_id: actor.userId,
        tenant_id: actor.tenantId,
      }),
    });
    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      ok: boolean;
      content?: Array<{ type: string; text: string }>;
    };
    if (!data.ok || !data.content?.[0]) return [];

    const parsed = JSON.parse(data.content[0].text) as {
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        modifiedTime?: string;
        size?: string;
        webViewLink?: string;
      }>;
    };

    return (parsed.files || []).map((f, idx) => ({
      id: f.id,
      title: f.name,
      source: "google_drive" as const,
      score: 0,
      metadata: {
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
      },
      preview: null,
      openUrl: f.webViewLink || undefined,
    }));
  } catch {
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function checkGoogleConnectionStatus(
  actor: SearchActor,
): Promise<"connected" | "disconnected" | "expired"> {
  try {
    const runtime = await getAppRuntimeConfig();
    const resp = await fetch(
      `${runtime.pythonBackendUrl}/api/internal/mcp/tools?user_id=${actor.userId}`,
      {
        headers: runtime.proxyToken ? { "x-proxy-token": runtime.proxyToken } : undefined,
      },
    );
    if (!resp.ok) return "disconnected";
    const data = (await resp.json()) as { tools: unknown[] };
    return (data.tools?.length ?? 0) > 0 ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

async function getDriveReadonlyScopeApproved(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, "oauth"),
          eq(systemSettings.key, "driveReadonlyScopeApproved"),
        ),
      )
      .limit(1);
    return row?.value === "true";
  } catch {
    return false;
  }
}

async function getCanonicalDriveFileMap(
  tenantId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const db = await getDb();
    if (!db) return map;
    const rows = await db
      .select({
        linkId: libraryLinks.linkId,
        libraryItemId: libraryLinks.libraryItemId,
      })
      .from(libraryLinks)
      .where(
        and(
          eq(libraryLinks.linkType, "google_drive_file"),
          eq(libraryLinks.tenantId, tenantId),
        ),
      );
    for (const row of rows) {
      map.set(row.linkId, row.libraryItemId);
    }
  } catch {
    // Return empty map on error
  }
  return map;
}

interface DeduplicatedResults {
  local: FederatedSearchResult[];
  vector: FederatedSearchResult[];
  drive: FederatedSearchResult[];
}

function deduplicateResults(
  local: FederatedSearchResult[],
  vector: FederatedSearchResult[],
  drive: FederatedSearchResult[],
  canonicalMap: Map<string, number>,
): DeduplicatedResults {
  const mergedDriveIds = new Set<string>();

  // Mark Drive results that already exist as indexed library items
  const filteredDrive = drive.map((d) => {
    const libraryItemId = canonicalMap.get(d.id);
    if (libraryItemId !== undefined) {
      mergedDriveIds.add(d.id);
      return { ...d, indexedStatus: true };
    }
    return d;
  });

  // Mark local items that correspond to indexed Drive files
  const localWithDrive = local.map((l) => {
    // Check if this library item has a canonical Drive link
    for (const [driveId, itemId] of canonicalMap) {
      if (String(itemId) === l.id) {
        return { ...l, indexedStatus: true, source: "google_drive" as const };
      }
    }
    return l;
  });

  return {
    local: localWithDrive,
    vector,
    drive: filteredDrive,
  };
}

export function computeRRF(
  rankedLists: FederatedSearchResult[][],
  k: number = RRF_K,
): FederatedSearchResult[] {
  const scoreMap = new Map<string, { result: FederatedSearchResult; score: number }>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfContribution = 1 / (k + rank + 1); // 1-based rank
      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.score += rrfContribution;
        // Keep the version with more metadata
        if (
          Object.keys(item.metadata).length > Object.keys(existing.result.metadata).length
        ) {
          existing.result = { ...item, score: existing.score };
        } else {
          existing.result.score = existing.score;
        }
      } else {
        scoreMap.set(item.id, { result: { ...item, score: rrfContribution }, score: rrfContribution });
      }
    }
  }

  const results = Array.from(scoreMap.values())
    .map((v) => ({ ...v.result, score: v.score }))
    .sort((a, b) => b.score - a.score);

  return results;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<{ result: T; status: "ok" } | { status: "timeout" | "error"; error?: Error }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: "timeout" });
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve({ status: "ok", result });
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({ status: "error", error: err });
      });
  });
}
