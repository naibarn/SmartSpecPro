/**
 * Multimodal Embedding Provider (Section 04: Embedding Provider)
 *
 * Abstraction for generating 768-dim embeddings at query-time (Node.js side).
 * NOTE: Ingestion-time embeddings are created by the Python Celery task (Section 03).
 * This module is used ONLY for embedding user queries for vector similarity search.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { decrypt } from "./crypto";
import { generateEmbedding, generateImageDescription } from "./vectorize";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface MultimodalEmbeddingProvider {
  embedImage(input: { fileUrl: string }): Promise<number[]>;
  embedText(input: { text: string }): Promise<number[]>;
  getDimension(): number;
  getProviderName(): string;
  getModelName(): string;
}

// ---------------------------------------------------------------------------
// GeminiEmbeddingProvider
// ---------------------------------------------------------------------------

const GEMINI_EMBEDDING_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent";

export class GeminiEmbeddingProvider implements MultimodalEmbeddingProvider {
  constructor(private readonly apiKey: string) {}

  async embedImage(input: { fileUrl: string }): Promise<number[]> {
    // For image embedding we send a text description request since Gemini Embedding 2
    // primarily handles text. For native image embedding, the vision task on the Python
    // side handles it directly. At query-time, we embed the text query.
    // This method exists for future image-to-image search; for now, treat as text about the URL.
    return this._embed({ text: `Image at: ${input.fileUrl}` });
  }

  async embedText(input: { text: string }): Promise<number[]> {
    return this._embed({ text: input.text });
  }

  private async _embed(content: { text: string }): Promise<number[]> {
    const url = `${GEMINI_EMBEDDING_URL}?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: content.text }] },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini embedding API error: ${response.status} ${errText.slice(0, 200)}`
      );
    }

    const data = await response.json();
    const values: number[] = data?.embedding?.values;
    if (!Array.isArray(values)) {
      throw new Error("Gemini embedding API returned unexpected response shape");
    }
    return values;
  }

  getDimension(): number {
    return 768;
  }

  getProviderName(): string {
    return "gemini";
  }

  getModelName(): string {
    return "gemini-embedding-2-preview";
  }
}

// ---------------------------------------------------------------------------
// CloudflareFallbackProvider
// ---------------------------------------------------------------------------

export class CloudflareFallbackProvider implements MultimodalEmbeddingProvider {
  async embedImage(input: { fileUrl: string }): Promise<number[]> {
    // Two-step: LLaVA description → text embedding
    const description = await generateImageDescription(input.fileUrl);
    return generateEmbedding(description);
  }

  async embedText(input: { text: string }): Promise<number[]> {
    return generateEmbedding(input.text);
  }

  getDimension(): number {
    return 768;
  }

  getProviderName(): string {
    return "cloudflare";
  }

  getModelName(): string {
    return "bge-base-en-v1.5+llava-1.5-7b";
  }
}

// ---------------------------------------------------------------------------
// Provider selection with 5-second TTL cache
// ---------------------------------------------------------------------------

let _cache: { provider: MultimodalEmbeddingProvider; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

/** Test helper: reset in-memory cache (for unit tests only) */
export function _resetCacheForTest(): void {
  _cache = null;
}

export async function getMultimodalEmbeddingProvider(): Promise<MultimodalEmbeddingProvider> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) {
    return _cache.provider;
  }

  const provider = await _selectProvider();
  _cache = { provider, expiresAt: now + CACHE_TTL_MS };
  return provider;
}

async function _selectProvider(): Promise<MultimodalEmbeddingProvider> {
  try {
    const db = await getDb();
    if (!db) return new CloudflareFallbackProvider();

    const rows = await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        isSensitive: systemSettings.isSensitive,
      })
      .from(systemSettings)
      .where(eq(systemSettings.category, "multimodal_embedding"));

    const preferredRow = rows.find((row) => row.key === "google_api_key")
      ?? rows.find((row) => row.key === "gemini_api_key");
    if (!preferredRow) return new CloudflareFallbackProvider();

    let apiKey = preferredRow.value ?? "";
    if (preferredRow.isSensitive && apiKey) {
      try {
        apiKey = decrypt(apiKey);
      } catch {
        return new CloudflareFallbackProvider();
      }
    }

    if (!apiKey.trim()) return new CloudflareFallbackProvider();
    return new GeminiEmbeddingProvider(apiKey);
  } catch {
    return new CloudflareFallbackProvider();
  }
}
