/**
 * Query Embedding Service
 *
 * Thin wrapper around the internal 1536-dimension embedding endpoint used for
 * query-time similarity lookups. Keeps retrieval decoupled from the low-level
 * embedding provider so it can be mocked cleanly in tests.
 */

import { ENV } from "../_core/env";

const EMBEDDING_CACHE_TTL_MS = 5_000;

type CachedEmbedding = {
  value: number[];
  expiresAt: number;
};

const cache = new Map<string, CachedEmbedding>();

export function _clearQueryEmbeddingCacheForTest(): void {
  cache.clear();
}

export async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  const normalized = text.trim();
  if (!normalized) return null;

  const now = Date.now();
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const backendUrl = (ENV.pythonBackendUrl || process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");
    const proxyToken = process.env.SMARTSPEC_PROXY_TOKEN || "";
    const response = await fetch(`${backendUrl}/api/internal/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(proxyToken ? { "x-proxy-token": proxyToken } : {}),
      },
      body: JSON.stringify({ text: normalized, model: "text-embedding-3-small" }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { embedding?: unknown };
    const value = Array.isArray(payload.embedding) ? payload.embedding.map((item) => Number(item)) : [];
    if (value.length !== 1536 || value.some((item) => !Number.isFinite(item))) {
      return null;
    }

    cache.set(normalized, {
      value,
      expiresAt: now + EMBEDDING_CACHE_TTL_MS,
    });
    return value;
  } catch {
    return null;
  }
}
