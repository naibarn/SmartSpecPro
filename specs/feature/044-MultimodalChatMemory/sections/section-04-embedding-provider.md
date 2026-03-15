Now I have enough context. Let me produce the section content.

# Section 04 -- Embedding Provider

## Overview

This section implements `multimodalEmbeddingProvider.ts`, an abstraction layer for generating multimodal embeddings (both image and text) at 768 dimensions. It provides two concrete providers -- GeminiEmbeddingProvider (primary) and CloudflareFallbackProvider -- plus a provider selection function that inspects system settings.

**Depends on**: section-01-schema-and-migration (the `multimodal_memory_vectors` table must exist, with its `provider` and `model` columns)

**Blocks**: section-06-retrieval-and-reference-resolution (uses the embedding provider for vector search queries)

## Background

The existing codebase already has embedding infrastructure:

- `/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorize.ts` -- Cloudflare Workers AI embedding via `@cf/baai/bge-base-en-v1.5` (768-dim text) and `@cf/llava-hf/llava-1.5-7b-hf` (image description via LLaVA vision model). Key exports: `generateEmbedding(text)` and `generateImageDescription(imageUrl)`.
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorProvider.ts` -- Provider abstraction for vector storage (Cloudflare Vectorize, pgvector, ChromaDB). Reads config from `systemSettings` table with a 5-second TTL cache. The pattern of reading settings from the `systemSettings` table category `"vectordb"` should be reused here.

The new embedding provider differs from the existing `vectorize.ts` in that it supports **native multimodal embedding** (Gemini can embed images directly without converting to text first), and it tracks which provider generated each vector so retrieval queries can filter by provider.

### Provider Isolation Rule

Vectors from different providers live in different embedding spaces even at the same dimensionality. The `multimodal_memory_vectors.provider` column records which provider generated each vector. All retrieval queries **must** filter by the current active provider. If the active provider is switched, existing vectors need re-embedding.

## File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/multimodalEmbeddingProvider.ts`

## Test File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/multimodalEmbeddingProvider.test.ts`

---

## Tests (Write First)

Create the test file at the path above. Use Vitest. Mock all external HTTP calls and system settings reads. The test structure:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies: fetch, systemSettings DB reads, vectorize.ts exports
// Mock the decrypt function from crypto.ts

describe("MultimodalEmbeddingProvider", () => {
  describe("GeminiEmbeddingProvider", () => {
    it("embedImage returns a 768-dimension vector", async () => {
      // Arrange: mock fetch to return a 768-element array from Gemini API
      // Act: call provider.embedImage({ fileUrl: "https://example.com/img.jpg" })
      // Assert: result.length === 768
    });

    it("embedText returns a 768-dimension vector", async () => {
      // Arrange: mock fetch to return a 768-element array from Gemini API
      // Act: call provider.embedText({ text: "a modern house" })
      // Assert: result.length === 768
    });

    it("handles API errors gracefully", async () => {
      // Arrange: mock fetch to return 500
      // Act + Assert: call rejects with descriptive error, does not crash
    });

    it("getDimension returns 768", () => {
      // Assert: provider.getDimension() === 768
    });

    it("getProviderName returns 'gemini'", () => {
      // Assert: provider.getProviderName() === "gemini"
    });

    it("getModelName returns 'gemini-embedding-2-preview'", () => {
      // Assert
    });
  });

  describe("CloudflareFallbackProvider", () => {
    it("embedImage calls LLaVA then text embedding", async () => {
      // Arrange: mock generateImageDescription to return text,
      //          mock generateEmbedding to return 768-dim vector
      // Act: call provider.embedImage({ fileUrl: "..." })
      // Assert: generateImageDescription called first, then generateEmbedding
      //         with the description text. Result is 768-dim.
    });

    it("embedText returns a 768-dimension vector", async () => {
      // Arrange: mock generateEmbedding from vectorize.ts
      // Act: call provider.embedText({ text: "some text" })
      // Assert: result.length === 768
    });

    it("getDimension returns 768", () => {
      // Assert: provider.getDimension() === 768
    });
  });

  describe("getMultimodalEmbeddingProvider (selection logic)", () => {
    it("defaults to Gemini when API key is configured in system settings", async () => {
      // Arrange: mock systemSettings to return a gemini API key
      // Act: call getMultimodalEmbeddingProvider()
      // Assert: returned provider.getProviderName() === "gemini"
    });

    it("falls back to Cloudflare when Gemini API key is not configured", async () => {
      // Arrange: mock systemSettings to return no gemini key
      // Act: call getMultimodalEmbeddingProvider()
      // Assert: returned provider.getProviderName() === "cloudflare"
    });

    it("falls back to Cloudflare when Gemini key is present but empty string", async () => {
      // Similar to above, empty string treated as unconfigured
    });
  });
});
```

All eight tests from the TDD plan are covered:
1. GeminiEmbeddingProvider.embedImage returns 768-dim vector
2. GeminiEmbeddingProvider.embedText returns 768-dim vector
3. GeminiEmbeddingProvider handles API errors gracefully
4. CloudflareFallbackProvider.embedImage calls LLaVA then text embedding
5. CloudflareFallbackProvider.embedText returns 768-dim vector
6. Provider selection defaults to Gemini when API key configured
7. Provider selection falls back to Cloudflare when Gemini unavailable
8. getDimension returns 768 for both providers

---

## Implementation Details

### Interface

The module exports one interface and one factory function:

```typescript
export interface MultimodalEmbeddingProvider {
  embedImage(input: { fileUrl: string }): Promise<number[]>;
  embedText(input: { text: string }): Promise<number[]>;
  getDimension(): number;
  getProviderName(): string;
  getModelName(): string;
}

export async function getMultimodalEmbeddingProvider(): Promise<MultimodalEmbeddingProvider>;
```

### GeminiEmbeddingProvider

- **API endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent` (or the appropriate Gemini embedding REST endpoint). The exact URL should be confirmed from Gemini API docs.
- **Authentication**: API key passed as `?key=` query parameter (standard Gemini REST pattern).
- **API key source**: Read from `systemSettings` table, category `"multimodal_embedding"`, key `"gemini_api_key"`. The value is encrypted -- use `decrypt()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts`. If no dedicated multimodal embedding key exists, fall back to the general Gemini key from the LLM provider configuration.
- **embedImage**: Send the image URL in the request body. Gemini Embedding 2 supports image input natively. The request format uses a `content` field with an `inlineData` part (base64) or a `fileData` part (URI). For URL-based input, download the image first and send as base64 inline data.
- **embedText**: Send text in the `content.parts[0].text` field.
- **Output dimension**: 768. Parse from `response.embedding.values`.
- **Error handling**: On non-2xx response, throw a descriptive error including the HTTP status and response body snippet. On network errors, let them propagate. Do not retry here -- the caller (vision pipeline) handles retries.
- **Rate limiting**: Respect Gemini rate limits. The caller is responsible for rate limiting (Celery task queue provides natural throttling). Log a warning on 429 responses.

### CloudflareFallbackProvider

- **embedText**: Delegates directly to the existing `generateEmbedding(text)` function from `/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorize.ts`. This calls `@cf/baai/bge-base-en-v1.5` and returns a 768-dim vector.
- **embedImage**: Two-step process:
  1. Call `generateImageDescription(fileUrl)` from `vectorize.ts` -- this uses LLaVA (`@cf/llava-hf/llava-1.5-7b-hf`) to produce a 1-2 sentence text description of the image.
  2. Call `generateEmbedding(description)` to embed that text description into a 768-dim vector.
  This is not truly multimodal (the image is converted to text first, losing visual details that native image embedding would capture), but it provides a functional fallback when Gemini is unavailable.
- **Provider name**: `"cloudflare"`
- **Model name**: `"bge-base-en-v1.5+llava-1.5-7b"` (composite, since two models are involved)

### Provider Selection Function (`getMultimodalEmbeddingProvider`)

1. Read system settings from the database, category `"multimodal_embedding"`, looking for key `"gemini_api_key"`. Follow the same pattern as `vectorProvider.ts` which reads from `systemSettings` with a TTL cache.
2. Apply a short TTL cache (5 seconds, matching vectorProvider.ts pattern) so the DB is not hit on every embedding call.
3. If a non-empty Gemini API key is found and can be decrypted, return a `GeminiEmbeddingProvider` instance.
4. Otherwise, return a `CloudflareFallbackProvider` instance.
5. The function is async because it may need to read from the database on cache miss.

### Settings Cache

Use a simple in-memory cache with a timestamp, identical to the pattern in `vectorProvider.ts`:

```typescript
let cachedProvider: { provider: MultimodalEmbeddingProvider; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;
```

On each call to `getMultimodalEmbeddingProvider()`, check if the cache is still valid. If expired, re-read settings and rebuild the provider instance.

### Embedding Ownership Split (IMPORTANT)

There are two distinct embedding creation points in the system. Understanding the split prevents confusion:

| When | Who creates embedding | Which function | Purpose |
|------|----------------------|----------------|---------|
| **Ingestion-time** (image upload) | **Python Celery task** (Section 03) | Calls Gemini Embedding API directly via `google-generativeai` SDK | Creates the stored vector in `multimodal_memory_vectors` for each analyzed image |
| **Query-time** (user sends message) | **Node.js retrieval service** (Section 06) | Calls `getMultimodalEmbeddingProvider().embedText(query)` | Embeds the user's text query to perform vector similarity search against stored vectors |

**Key implications**:
- The Python task is the ONLY producer of stored image vectors. It writes directly to `multimodal_memory_vectors`.
- The Node.js `embedText()` is used ONLY for transient query vectors — they are never stored.
- `embedImage()` on the Node.js side exists for potential future use (e.g., image-to-image search) but is NOT called during the normal flow in Phase 1.
- Both sides MUST use the same Gemini Embedding model (`gemini-embedding-2-preview`) to ensure vectors are in the same embedding space. The `provider` column in `multimodal_memory_vectors` enforces this — retrieval queries filter by active provider.

The `provider` and `model` values returned by `getProviderName()` and `getModelName()` are stored in the `multimodal_memory_vectors` table alongside each vector, enabling provider-filtered retrieval.

### Key Design Decisions

- **768 dimensions for both providers**: This is intentional -- it means the pgvector column definition `vector(768)` works for both. However, vectors from different providers are NOT interchangeable because they occupy different embedding spaces.
- **No retry logic in the provider itself**: Retries are handled by the Celery task (section-03) or the calling service. The provider throws on failure.
- **Factory function, not singleton**: `getMultimodalEmbeddingProvider()` returns a fresh or cached instance. The cache is keyed by the active API key -- if the admin changes the Gemini key, the 5-second TTL ensures the new key is picked up promptly.