import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PoolConfig } from "pg";

import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { decrypt } from "./crypto";

export type VectorProvider = "chromadb" | "pgvector" | "cloudflare_vectorize";
export type VectorOperation = "index" | "delete" | "search";
export type VectorErrorClassification = "transient" | "permanent";

export interface VectorMetadata {
  tenantId: string;
  type: string;
  createdAt: number;
  title: string;
  sourceUrl: string;
  description?: string;
}

export interface VectorEntry {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export interface VectorSearchMatch {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorProviderCapabilities {
  provider: VectorProvider;
  minTopK: number;
  maxTopK: number;
  supportsMetadataFilter: boolean;
  supportedDimensions: number[];
}

export interface VectorProviderConfig {
  provider?: string;
  currentReadProvider?: string;
  targetProvider?: string;
  mirrorWrites?: boolean;
  chromaPersistDir?: string;
  pgvectorHost?: string;
  pgvectorPort?: string;
  pgvectorDatabase?: string;
  pgvectorUser?: string;
  pgvectorPassword?: string;
  vectorizeAccountId?: string;
  vectorizeApiToken?: string;
}

export interface VectorProviderAdapter {
  capabilities: VectorProviderCapabilities;
  index(params: { indexName: string; vectors: VectorEntry[] }): Promise<{ count: number }>;
  delete(params: { indexName: string; ids: string[] }): Promise<{ count: number }>;
  search(params: {
    indexName: string;
    vector: number[];
    topK: number;
    filter?: Record<string, string | number | boolean>;
  }): Promise<{ matches: VectorSearchMatch[] }>;
}

export interface VectorProviderResolution {
  provider: VectorProvider;
  fallbackApplied: boolean;
}

const PROVIDER_CAPABILITIES: Record<VectorProvider, VectorProviderCapabilities> = {
  cloudflare_vectorize: {
    provider: "cloudflare_vectorize",
    minTopK: 1,
    maxTopK: 100,
    supportsMetadataFilter: true,
    supportedDimensions: [768],
  },
  pgvector: {
    provider: "pgvector",
    minTopK: 1,
    maxTopK: 1000,
    supportsMetadataFilter: true,
    supportedDimensions: [384, 768, 1024, 1536],
  },
  chromadb: {
    provider: "chromadb",
    minTopK: 1,
    maxTopK: 100,
    supportsMetadataFilter: true,
    supportedDimensions: [384, 768],
  },
};

const overrideAdapters: Partial<Record<VectorProvider, VectorProviderAdapter>> = {};
const CHROMA_INDEX_FILE_SUFFIX = ".json";
const CHROMA_LOCK_FILE_SUFFIX = ".lock";
const CHROMA_DEFAULT_PERSIST_DIR = join(tmpdir(), "smartspec-chromadb");
const CHROMA_LOCK_RETRY_MS = 20;
const CHROMA_LOCK_MAX_WAIT_MS = 5_000;
const PGVECTOR_TABLE_NAME = "smartspec_vector_entries";
const MAX_PGVECTOR_SEARCH_SCAN = 5000;
const pgPoolCache = new Map<string, PgPoolLike>();
const pgSchemaReady = new Set<string>();
const EFFECTIVE_CONFIG_CACHE_TTL_MS = 5_000;
const VECTORDB_SETTING_KEYS = [
  "provider",
  "currentReadProvider",
  "targetProvider",
  "mirrorWrites",
  "chromaPersistDir",
  "pgvectorHost",
  "pgvectorPort",
  "pgvectorDatabase",
  "pgvectorUser",
  "pgvectorPassword",
  "vectorizeAccountId",
  "vectorizeApiToken",
] as const;
const effectiveConfigCache = new Map<string, { expiresAt: number; value: VectorProviderConfig }>();

type VectorFilter = Record<string, string | number | boolean>;

type PgQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

type PgPoolLike = {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>;
  end?: () => Promise<void> | void;
};

type SwitchStateRow = {
  current_read_provider?: string | null;
  target_provider?: string | null;
  mirror_writes?: boolean | null;
};

function isProvider(value: string | undefined | null): value is VectorProvider {
  return value === "cloudflare_vectorize" || value === "pgvector" || value === "chromadb";
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("503") ||
    message.includes("429")
  );
}

export class VectorProviderError extends Error {
  readonly provider: VectorProvider;
  readonly classification: VectorErrorClassification;
  readonly code: string;

  constructor(params: {
    provider: VectorProvider;
    code: string;
    message: string;
    classification: VectorErrorClassification;
  }) {
    super(params.message);
    this.name = "VectorProviderError";
    this.provider = params.provider;
    this.code = params.code;
    this.classification = params.classification;
  }
}

function normalizeProviderError(provider: VectorProvider, code: string, error: unknown): VectorProviderError {
  if (error instanceof VectorProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new VectorProviderError({
    provider,
    code,
    message,
    classification: isTransientError(error) ? "transient" : "permanent",
  });
}

function extractRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function applyDefinedSettings(target: VectorProviderConfig, patch: Partial<VectorProviderConfig>): VectorProviderConfig {
  const next: VectorProviderConfig = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

function decodeSettingValue(value: string | null, isSensitive: boolean | null): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }
  if (!isSensitive) {
    return trimmed;
  }
  try {
    return decrypt(trimmed) || trimmed;
  } catch {
    return trimmed;
  }
}

async function loadStoredVectorProviderConfig(params?: { tenantId?: string }): Promise<Partial<VectorProviderConfig>> {
  const db = await getDb();
  if (!db) {
    return {};
  }

  const settingRows = await db
    .select({
      key: systemSettings.key,
      value: systemSettings.value,
      isSensitive: systemSettings.isSensitive,
    })
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, "vectordb"),
        inArray(systemSettings.key, [...VECTORDB_SETTING_KEYS]),
      ),
    );

  const settingsMap = new Map<string, string>();
  for (const row of settingRows) {
    const decoded = decodeSettingValue(row.value, row.isSensitive ?? false);
    if (decoded !== undefined) {
      settingsMap.set(String(row.key), decoded);
    }
  }

  const fromSettings: Partial<VectorProviderConfig> = {
    provider: settingsMap.get("provider"),
    currentReadProvider: settingsMap.get("currentReadProvider"),
    targetProvider: settingsMap.get("targetProvider"),
    mirrorWrites: parseBoolean(settingsMap.get("mirrorWrites")),
    chromaPersistDir: settingsMap.get("chromaPersistDir"),
    pgvectorHost: settingsMap.get("pgvectorHost"),
    pgvectorPort: settingsMap.get("pgvectorPort"),
    pgvectorDatabase: settingsMap.get("pgvectorDatabase"),
    pgvectorUser: settingsMap.get("pgvectorUser"),
    pgvectorPassword: settingsMap.get("pgvectorPassword"),
    vectorizeAccountId: settingsMap.get("vectorizeAccountId"),
    vectorizeApiToken: settingsMap.get("vectorizeApiToken"),
  };

  try {
    const tenantId = params?.tenantId?.trim();
    let switchResult: unknown;
    if (tenantId) {
      switchResult = await db.execute(sql`
        SELECT current_read_provider, target_provider, mirror_writes
        FROM library_provider_switch_states
        WHERE tenant_id = ${tenantId} OR tenant_id IS NULL
        ORDER BY CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, updated_at DESC, id DESC
        LIMIT 1
      `);
    } else {
      switchResult = await db.execute(sql`
        SELECT current_read_provider, target_provider, mirror_writes
        FROM library_provider_switch_states
        WHERE tenant_id IS NULL
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `);
    }
    const switchRow = extractRows(switchResult)[0] as SwitchStateRow | undefined;
    if (!switchRow) {
      return fromSettings;
    }
    return {
      ...fromSettings,
      currentReadProvider: switchRow.current_read_provider ? String(switchRow.current_read_provider) : fromSettings.currentReadProvider,
      targetProvider: switchRow.target_provider ? String(switchRow.target_provider) : fromSettings.targetProvider,
      mirrorWrites:
        typeof switchRow.mirror_writes === "boolean"
          ? switchRow.mirror_writes
          : fromSettings.mirrorWrites,
    };
  } catch {
    // Switch-state table may be unavailable in earlier environments; fall back to settings/env.
    return fromSettings;
  }
}

function sanitizeIndexName(indexName: string): string {
  const cleaned = (indexName || "default").trim().toLowerCase();
  return cleaned.replace(/[^a-z0-9_-]+/g, "_");
}

function getChromaIndexPath(indexName: string, config?: VectorProviderConfig): string {
  const configuredPersistDir = config?.chromaPersistDir || process.env.CHROMA_PERSIST_DIR || CHROMA_DEFAULT_PERSIST_DIR;
  const persistDir = configuredPersistDir.startsWith("~/")
    ? join(homedir(), configuredPersistDir.slice(2))
    : configuredPersistDir;
  return join(persistDir, `${sanitizeIndexName(indexName)}${CHROMA_INDEX_FILE_SUFFIX}`);
}

async function readChromaEntries(pathname: string): Promise<VectorEntry[]> {
  try {
    const raw = await readFile(pathname, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is Partial<VectorEntry> => !!entry && typeof entry === "object")
      .map((entry) => ({
        id: String(entry.id || ""),
        values: toNumberArray(entry.values),
        metadata: toVectorMetadata(entry.metadata),
      }))
      .filter((entry) => entry.id.length > 0 && entry.values.length > 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeChromaEntries(pathname: string, entries: VectorEntry[]): Promise<void> {
  await mkdir(dirname(pathname), { recursive: true });
  const tmpPath = `${pathname}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmpPath, JSON.stringify(entries), "utf-8");
    await rename(tmpPath, pathname);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withChromaFileLock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = `${pathname}${CHROMA_LOCK_FILE_SUFFIX}`;
  const deadline = Date.now() + CHROMA_LOCK_MAX_WAIT_MS;

  while (true) {
    let lockHandle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      lockHandle = await open(lockPath, "wx");
      const result = await fn();
      await lockHandle.close().catch(() => undefined);
      await rm(lockPath, { force: true }).catch(() => undefined);
      return result;
    } catch (error) {
      if (lockHandle) {
        await lockHandle.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
      }

      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`chroma_lock_timeout:${lockPath}`);
      }
      await sleep(CHROMA_LOCK_RETRY_MS);
    }
  }
}

function toNumberArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
    }
  }
  return [];
}

function toVectorMetadata(raw: unknown): VectorMetadata {
  const metadata = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    tenantId: String(metadata.tenantId || ""),
    type: String(metadata.type || ""),
    createdAt: Number(metadata.createdAt || 0),
    title: String(metadata.title || ""),
    sourceUrl: String(metadata.sourceUrl || ""),
    description: metadata.description ? String(metadata.description) : undefined,
  };
}

function metadataMatchesFilter(metadata: VectorMetadata, filter?: VectorFilter): boolean {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  for (const [key, expected] of Object.entries(filter)) {
    const actual = (metadata as Record<string, unknown>)[key];
    if (actual === undefined || actual === null) {
      return false;
    }
    if (String(actual) !== String(expected)) {
      return false;
    }
  }

  return true;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let idx = 0; idx < length; idx += 1) {
    const leftValue = Number(left[idx]) || 0;
    const rightValue = Number(right[idx]) || 0;
    dotProduct += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function requireCloudflareConfig(config?: VectorProviderConfig): { accountId: string; apiToken: string } {
  const accountId = config?.vectorizeAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken =
    config?.vectorizeApiToken || process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY;

  if (!accountId || !apiToken) {
    throw new VectorProviderError({
      provider: "cloudflare_vectorize",
      code: "missing_cloudflare_config",
      message: "Cloudflare Vectorize account or token is not configured",
      classification: "permanent",
    });
  }

  return { accountId, apiToken };
}

function createCloudflareVectorizeAdapter(config?: VectorProviderConfig): VectorProviderAdapter {
  return {
    capabilities: getProviderCapabilities("cloudflare_vectorize"),

    async index(params) {
      const { accountId, apiToken } = requireCloudflareConfig(config);
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${params.indexName}`;
      try {
        const ndjson = params.vectors.map((vector) => JSON.stringify(vector)).join("\n");
        const response = await fetch(`${baseUrl}/upsert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/x-ndjson",
          },
          body: ndjson,
        });
        if (!response.ok) {
          throw new Error(`Vectorize upsert failed: ${response.status}`);
        }
        return { count: params.vectors.length };
      } catch (error) {
        throw normalizeProviderError("cloudflare_vectorize", "index_failed", error);
      }
    },

    async delete(params) {
      const { accountId, apiToken } = requireCloudflareConfig(config);
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${params.indexName}`;
      try {
        const response = await fetch(`${baseUrl}/delete-by-ids`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: params.ids }),
        });
        if (!response.ok) {
          throw new Error(`Vectorize delete failed: ${response.status}`);
        }
        return { count: params.ids.length };
      } catch (error) {
        throw normalizeProviderError("cloudflare_vectorize", "delete_failed", error);
      }
    },

    async search(params) {
      const { accountId, apiToken } = requireCloudflareConfig(config);
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${params.indexName}`;
      try {
        const response = await fetch(`${baseUrl}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vector: params.vector,
            topK: params.topK,
            filter: params.filter,
            returnMetadata: true,
          }),
        });
        if (!response.ok) {
          throw new Error(`Vectorize query failed: ${response.status}`);
        }

        const data = (await response.json()) as {
          result?: {
            matches?: VectorSearchMatch[];
          };
        };

        return { matches: data.result?.matches || [] };
      } catch (error) {
        throw normalizeProviderError("cloudflare_vectorize", "search_failed", error);
      }
    },
  };
}

function getPgVectorPoolConfig(config?: VectorProviderConfig): PoolConfig {
  const host = config?.pgvectorHost;
  const database = config?.pgvectorDatabase;
  if (!host || !database) {
    throw new VectorProviderError({
      provider: "pgvector",
      code: "missing_pgvector_config",
      message: "pgvector host/database is not configured",
      classification: "permanent",
    });
  }

  return {
    host,
    port: Number(config?.pgvectorPort || "5432"),
    database,
    user: config?.pgvectorUser,
    password: config?.pgvectorPassword,
  };
}

function getPgPoolCacheKey(config: PoolConfig): string {
  return [
    config.host || "localhost",
    String(config.port || 5432),
    config.database || "",
    config.user || "",
  ].join("|");
}

async function getOrCreatePgPool(config?: VectorProviderConfig): Promise<{ pool: PgPoolLike; key: string }> {
  const poolConfig = getPgVectorPoolConfig(config);
  const key = getPgPoolCacheKey(poolConfig);

  let pool = pgPoolCache.get(key);
  if (!pool) {
    const pg = await import("pg");
    const PoolCtor = pg.Pool as unknown as new (cfg: PoolConfig) => PgPoolLike;
    pool = new PoolCtor(poolConfig);
    pgPoolCache.set(key, pool);
  }

  if (!pgSchemaReady.has(key)) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${PGVECTOR_TABLE_NAME} (
        index_name TEXT NOT NULL,
        vector_id TEXT NOT NULL,
        embedding DOUBLE PRECISION[] NOT NULL,
        metadata JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (index_name, vector_id)
      )`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS ${PGVECTOR_TABLE_NAME}_index_name_idx ON ${PGVECTOR_TABLE_NAME} (index_name)`,
    );
    pgSchemaReady.add(key);
  }

  return { pool, key };
}

function createPgVectorAdapter(config?: VectorProviderConfig): VectorProviderAdapter {
  return {
    capabilities: getProviderCapabilities("pgvector"),
    async index(params) {
      try {
        const { pool } = await getOrCreatePgPool(config);
        for (const vector of params.vectors) {
          await pool.query(
            `INSERT INTO ${PGVECTOR_TABLE_NAME} (index_name, vector_id, embedding, metadata, updated_at)
             VALUES ($1, $2, $3::double precision[], $4::jsonb, NOW())
             ON CONFLICT (index_name, vector_id)
             DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, updated_at = NOW()`,
            [params.indexName, vector.id, vector.values, JSON.stringify(vector.metadata)],
          );
        }
        return { count: params.vectors.length };
      } catch (error) {
        throw normalizeProviderError("pgvector", "index_failed", error);
      }
    },
    async delete(params) {
      try {
        const { pool } = await getOrCreatePgPool(config);
        const result = await pool.query(
          `DELETE FROM ${PGVECTOR_TABLE_NAME}
           WHERE index_name = $1
             AND vector_id = ANY($2::text[])`,
          [params.indexName, params.ids],
        );
        return { count: Number(result.rowCount || 0) };
      } catch (error) {
        throw normalizeProviderError("pgvector", "delete_failed", error);
      }
    },
    async search(params) {
      try {
        const { pool } = await getOrCreatePgPool(config);
        const values: unknown[] = [params.indexName];
        let sqlText =
          `SELECT vector_id, embedding, metadata
           FROM ${PGVECTOR_TABLE_NAME}
           WHERE index_name = $1`;

        if (params.filter && Object.keys(params.filter).length > 0) {
          let argIndex = 2;
          for (const [filterKey, filterValue] of Object.entries(params.filter)) {
            sqlText += ` AND metadata ->> $${argIndex} = $${argIndex + 1}`;
            values.push(filterKey, String(filterValue));
            argIndex += 2;
          }
        }
        sqlText += ` LIMIT ${MAX_PGVECTOR_SEARCH_SCAN}`;

        const result = await pool.query(sqlText, values);
        const matches = result.rows
          .map((row) => {
            const metadata = toVectorMetadata(row.metadata);
            const score = cosineSimilarity(toNumberArray(row.embedding), params.vector);
            return {
              id: String(row.vector_id || ""),
              score,
              metadata,
            } satisfies VectorSearchMatch;
          })
          .filter((row) => row.id.length > 0 && metadataMatchesFilter(row.metadata, params.filter))
          .sort((left, right) => right.score - left.score)
          .slice(0, params.topK);
        return { matches };
      } catch (error) {
        throw normalizeProviderError("pgvector", "search_failed", error);
      }
    },
  };
}

function createChromaAdapter(config?: VectorProviderConfig): VectorProviderAdapter {
  return {
    capabilities: getProviderCapabilities("chromadb"),
    async index(params) {
      try {
        const path = getChromaIndexPath(params.indexName, config);
        return await withChromaFileLock(path, async () => {
          const existing = await readChromaEntries(path);
          const map = new Map(existing.map((entry) => [entry.id, entry]));
          for (const vector of params.vectors) {
            map.set(vector.id, vector);
          }
          await writeChromaEntries(path, Array.from(map.values()));
          return { count: params.vectors.length };
        });
      } catch (error) {
        throw normalizeProviderError("chromadb", "index_failed", error);
      }
    },
    async delete(params) {
      try {
        const path = getChromaIndexPath(params.indexName, config);
        return await withChromaFileLock(path, async () => {
          const existing = await readChromaEntries(path);
          const ids = new Set(params.ids);
          const retained = existing.filter((entry) => !ids.has(entry.id));
          const removed = existing.length - retained.length;
          await writeChromaEntries(path, retained);
          return { count: removed };
        });
      } catch (error) {
        throw normalizeProviderError("chromadb", "delete_failed", error);
      }
    },
    async search(params) {
      try {
        const path = getChromaIndexPath(params.indexName, config);
        const existing = await readChromaEntries(path);
        const matches = existing
          .filter((entry) => metadataMatchesFilter(entry.metadata, params.filter))
          .map((entry) => ({
            id: entry.id,
            score: cosineSimilarity(entry.values, params.vector),
            metadata: entry.metadata,
          }))
          .sort((left, right) => right.score - left.score)
          .slice(0, params.topK);
        return { matches };
      } catch (error) {
        throw normalizeProviderError("chromadb", "search_failed", error);
      }
    },
  };
}

function createDefaultAdapter(provider: VectorProvider, config?: VectorProviderConfig): VectorProviderAdapter {
  if (provider === "cloudflare_vectorize") {
    return createCloudflareVectorizeAdapter(config);
  }
  if (provider === "pgvector") {
    return createPgVectorAdapter(config);
  }
  return createChromaAdapter(config);
}

export function getProviderCapabilities(provider: VectorProvider): VectorProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}

export function resolveVectorProvider(
  operation: VectorOperation,
  config: VectorProviderConfig | undefined,
): VectorProviderResolution {
  const defaultProvider: VectorProvider = "cloudflare_vectorize";
  const configuredProvider = isProvider(config?.provider) ? config?.provider : undefined;
  const readProvider = isProvider(config?.currentReadProvider) ? config?.currentReadProvider : undefined;
  const writeProvider = isProvider(config?.targetProvider) ? config?.targetProvider : undefined;

  let provider: VectorProvider;
  if (operation === "search") {
    provider = readProvider || configuredProvider || defaultProvider;
  } else {
    provider = writeProvider || configuredProvider || defaultProvider;
  }

  const fallbackApplied =
    !configuredProvider && !readProvider && !writeProvider;

  return {
    provider,
    fallbackApplied,
  };
}

export function validateProviderCapabilityRequest(params: {
  capabilities: VectorProviderCapabilities;
  request: {
    topK?: number;
    dimension?: number;
    filter?: Record<string, string | number | boolean>;
  };
}): void {
  const { capabilities, request } = params;

  if (request.topK !== undefined) {
    if (request.topK < capabilities.minTopK || request.topK > capabilities.maxTopK) {
      throw new VectorProviderError({
        provider: capabilities.provider,
        code: "topk_out_of_range",
        message: `Requested topK ${request.topK} is outside supported range ${capabilities.minTopK}-${capabilities.maxTopK}`,
        classification: "permanent",
      });
    }
  }

  if (request.dimension !== undefined && !capabilities.supportedDimensions.includes(request.dimension)) {
    throw new VectorProviderError({
      provider: capabilities.provider,
      code: "unsupported_dimension",
      message: `Dimension ${request.dimension} is not supported by ${capabilities.provider}`,
      classification: "permanent",
    });
  }

  if (request.filter && Object.keys(request.filter).length > 0 && !capabilities.supportsMetadataFilter) {
    throw new VectorProviderError({
      provider: capabilities.provider,
      code: "metadata_filter_unsupported",
      message: `${capabilities.provider} does not support metadata filters`,
      classification: "permanent",
    });
  }
}

export function registerVectorProviderAdapter(provider: VectorProvider, adapter: VectorProviderAdapter): void {
  overrideAdapters[provider] = adapter;
}

export function resetVectorProviderAdapterRegistry(): void {
  delete overrideAdapters.chromadb;
  delete overrideAdapters.pgvector;
  delete overrideAdapters.cloudflare_vectorize;
  for (const pool of pgPoolCache.values()) {
    const maybeEnd = pool.end;
    if (typeof maybeEnd === "function") {
      void maybeEnd.call(pool);
    }
  }
  pgPoolCache.clear();
  pgSchemaReady.clear();
}

export function resetVectorProviderConfigCacheForTests(): void {
  effectiveConfigCache.clear();
}

function getAdapter(provider: VectorProvider, config?: VectorProviderConfig): VectorProviderAdapter {
  return overrideAdapters[provider] || createDefaultAdapter(provider, config);
}

export function createVectorProviderAdapter(
  provider: VectorProvider,
  config?: VectorProviderConfig,
): VectorProviderAdapter {
  return createDefaultAdapter(provider, config);
}

export async function dispatchVectorOperation(params:
  | {
      operation: "index";
      indexName: string;
      vectors: VectorEntry[];
      providerConfig?: VectorProviderConfig;
    }
  | {
      operation: "delete";
      indexName: string;
      ids: string[];
      providerConfig?: VectorProviderConfig;
    }
  | {
      operation: "search";
      indexName: string;
      vector: number[];
      topK: number;
      filter?: Record<string, string | number | boolean>;
      providerConfig?: VectorProviderConfig;
    },
): Promise<{ count: number } | { matches: VectorSearchMatch[] }> {
  const resolved = resolveVectorProvider(params.operation, params.providerConfig);
  const adapter = getAdapter(resolved.provider, params.providerConfig);

  if (params.operation === "index") {
    const dimension = params.vectors[0]?.values.length;
    validateProviderCapabilityRequest({
      capabilities: adapter.capabilities,
      request: { dimension },
    });
    return adapter.index({ indexName: params.indexName, vectors: params.vectors });
  }

  if (params.operation === "delete") {
    return adapter.delete({ indexName: params.indexName, ids: params.ids });
  }

  validateProviderCapabilityRequest({
    capabilities: adapter.capabilities,
    request: {
      topK: params.topK,
      dimension: params.vector.length,
      filter: params.filter,
    },
  });

  return adapter.search({
    indexName: params.indexName,
    vector: params.vector,
    topK: params.topK,
    filter: params.filter,
  });
}

export function getVectorProviderConfigFromEnv(): VectorProviderConfig {
  return {
    provider: process.env.VECTORDB_PROVIDER,
    currentReadProvider: process.env.VECTORDB_CURRENT_READ_PROVIDER,
    targetProvider: process.env.VECTORDB_TARGET_PROVIDER,
    mirrorWrites: ["1", "true", "yes", "on"].includes((process.env.VECTORDB_MIRROR_WRITES || "").toLowerCase()),
    chromaPersistDir: process.env.CHROMA_PERSIST_DIR,
    pgvectorHost: process.env.PGVECTOR_HOST,
    pgvectorPort: process.env.PGVECTOR_PORT,
    pgvectorDatabase: process.env.PGVECTOR_DATABASE,
    pgvectorUser: process.env.PGVECTOR_USER,
    pgvectorPassword: process.env.PGVECTOR_PASSWORD,
    vectorizeAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    vectorizeApiToken: process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY,
  };
}

export async function getEffectiveVectorProviderConfig(params?: {
  tenantId?: string;
  forceRefresh?: boolean;
}): Promise<VectorProviderConfig> {
  const tenantKey = params?.tenantId?.trim() || "__global__";
  const now = Date.now();
  if (!params?.forceRefresh) {
    const cached = effectiveConfigCache.get(tenantKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  const envConfig = getVectorProviderConfigFromEnv();
  const storedConfig = await loadStoredVectorProviderConfig({ tenantId: params?.tenantId });
  const merged = applyDefinedSettings(envConfig, storedConfig);
  effectiveConfigCache.set(tenantKey, {
    value: merged,
    expiresAt: now + EFFECTIVE_CONFIG_CACHE_TTL_MS,
  });
  return merged;
}
