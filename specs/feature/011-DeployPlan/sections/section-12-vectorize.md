# Section 12: Cloudflare Vectorize Integration

## Overview

This section implements semantic search over documents and images using Cloudflare Vectorize. Two separate vector indexes enable users to search across markdown documentation, article summaries, and gallery images. Embedding generation uses Cloudflare Workers AI, and search is exposed via tRPC endpoints with tenant isolation and metadata filtering.

## Dependencies

This section requires:
- **Section 9 (R2 Storage):** Gallery images and document storage must be functional before indexing them
- **Section 1 (GCP Bootstrap):** Cloudflare credentials and Vectorize index setup

This section blocks:
- **Section 15 (Admin Dashboard):** Admin dashboard may include search health metrics

## Background Context

The existing codebase has basic gallery functionality (see [apps/web/server/routers/gallery.ts](apps/web/server/routers/gallery.ts) if it exists) but no semantic search. This section adds AI-powered search capabilities across text documents and images.

Cloudflare Vectorize provides managed vector storage with metadata filtering, eliminating the need to run a separate vector database like Pinecone or Weaviate.

## Tests First

Based on `claude-plan-tdd.md`, implement these test stubs before writing the implementation:

### Embedding Generation Tests (Vitest)

Create [apps/web/server/__tests__/vectorize-embeddings.test.ts](apps/web/server/__tests__/vectorize-embeddings.test.ts):

```typescript
describe('Embedding Generation', () => {
  it('chunks documents into ~500 token segments', () => {
    // Test: Given a 2000-token document
    // When chunked
    // Then produces ~4 segments of ~500 tokens each
  });

  it('generates 768-dimension embeddings from text', async () => {
    // Test: Call Workers AI embedding model
    // Then returns vector with length 768
  });

  it('generates image descriptions via vision model', async () => {
    // Test: Given an image URL
    // When calling Workers AI vision model
    // Then returns non-empty text description
  });
});
```

### Indexing Tests (Integration)

Create [apps/web/server/__tests__/vectorize-indexing.test.ts](apps/web/server/__tests__/vectorize-indexing.test.ts):

```typescript
describe('Vectorize Indexing', () => {
  it('batch upserts vectors to docs-index', async () => {
    // Test: Given 1500 document chunks with embeddings
    // When batch upserting (2 batches of 1000)
    // Then all vectors exist in docs-index
  });

  it('triggers indexing when gallery item is promoted', async () => {
    // Test: Call gallery promotion endpoint
    // Then embedding is generated and upserted to images-index
  });

  it('removes vectors when gallery item is deleted', async () => {
    // Test: Delete a gallery item
    // Then corresponding vector is removed from images-index
  });
});
```

### Search Endpoint Tests (Vitest)

Create [apps/web/server/__tests__/vectorize-search.test.ts](apps/web/server/__tests__/vectorize-search.test.ts):

```typescript
describe('Search Endpoints', () => {
  describe('search.docs', () => {
    it('returns ranked results for text query', async () => {
      // Test: Query "user authentication flow"
      // Then returns results sorted by relevance score (descending)
    });

    it('filters results by tenantId', async () => {
      // Test: Query with tenantId filter
      // Then only returns results matching that tenant
    });

    it('limits results to topK', async () => {
      // Test: Query with limit=5
      // Then returns max 5 results
    });

    it('returns empty array for empty query', async () => {
      // Test: Query with empty string
      // Then returns [] (not error)
    });
  });

  describe('search.images', () => {
    it('returns results with image metadata', async () => {
      // Test: Query "product screenshot"
      // Then results include imageUrl, galleryItemId, description
    });

    it('filters by createdAt range', async () => {
      // Test: Query with metadata filter createdAt > timestamp
      // Then only returns recent images
    });
  });
});
```

## Implementation Details

### 1. Cloudflare Vectorize Index Setup

Create two indexes via the Cloudflare dashboard or Wrangler CLI:

```bash
# Docs index
wrangler vectorize create docs-index-prod \
  --dimensions=768 \
  --metric=cosine \
  --preset=default

# Images index
wrangler vectorize create images-index-prod \
  --dimensions=768 \
  --metric=cosine \
  --preset=default
```

Repeat for staging environment with `-staging` suffix.

**Metadata fields** (configured during first upsert):
- `tenantId` (string) — For multi-tenant isolation
- `type` (string) — Content type: `article`, `spreadsheet`, `specification`, `image`
- `createdAt` (number) — Unix timestamp for recency filtering
- `title` (string) — Document title or image filename
- `sourceUrl` (string) — Original URL or R2 key

### 2. Embedding Generation Service

**File:** [apps/web/server/services/vectorize.ts](apps/web/server/services/vectorize.ts)

```typescript
import { Ai } from '@cloudflare/ai';

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'; // 768 dimensions
const VISION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const CHUNK_SIZE = 500; // tokens (approx 2000 characters)

export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = new Ai({ apiKey: process.env.CLOUDFLARE_AI_API_KEY });

  const response = await ai.run(EMBEDDING_MODEL, {
    text: [text]
  });

  return response.data[0]; // 768-dimension vector
}

export async function chunkDocument(text: string): Promise<string[]> {
  // Simple chunking: split by ~2000 characters with overlap
  const chunks: string[] = [];
  const chunkLength = 2000;
  const overlap = 200;

  for (let i = 0; i < text.length; i += chunkLength - overlap) {
    chunks.push(text.slice(i, i + chunkLength));
  }

  return chunks;
}

export async function generateImageDescription(imageUrl: string): Promise<string> {
  const ai = new Ai({ apiKey: process.env.CLOUDFLARE_AI_API_KEY });

  const response = await ai.run(VISION_MODEL, {
    image: await fetch(imageUrl).then(r => r.arrayBuffer()),
    prompt: 'Describe this image in 1-2 sentences.'
  });

  return response.description;
}
```

### 3. Indexing Service

**File:** [apps/web/server/services/vectorize-indexing.ts](apps/web/server/services/vectorize-indexing.ts)

```typescript
import { Vectorize } from '@cloudflare/workers-types';
import { generateEmbedding, chunkDocument, generateImageDescription } from './vectorize';

const DOCS_INDEX = 'docs-index-prod';
const IMAGES_INDEX = 'images-index-prod';

interface VectorMetadata {
  tenantId: string;
  type: string;
  createdAt: number;
  title: string;
  sourceUrl: string;
}

export async function indexDocument(params: {
  id: string;
  text: string;
  tenantId: string;
  title: string;
  type: string;
  sourceUrl: string;
}) {
  const chunks = await chunkDocument(params.text);
  const vectors: Array<{ id: string; values: number[]; metadata: VectorMetadata }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    vectors.push({
      id: `${params.id}-chunk-${i}`,
      values: embedding,
      metadata: {
        tenantId: params.tenantId,
        type: params.type,
        createdAt: Date.now(),
        title: params.title,
        sourceUrl: params.sourceUrl,
      }
    });
  }

  // Batch upsert (1000 per batch)
  const batches = [];
  for (let i = 0; i < vectors.length; i += 1000) {
    batches.push(vectors.slice(i, i + 1000));
  }

  const vectorizeClient = getVectorizeClient(DOCS_INDEX);
  for (const batch of batches) {
    await vectorizeClient.upsert(batch);
  }
}

export async function indexImage(params: {
  id: string;
  imageUrl: string;
  tenantId: string;
  filename: string;
}) {
  // Generate description
  const description = await generateImageDescription(params.imageUrl);

  // Embed description
  const embedding = await generateEmbedding(description);

  // Upsert to images index
  const vectorizeClient = getVectorizeClient(IMAGES_INDEX);
  await vectorizeClient.upsert([{
    id: params.id,
    values: embedding,
    metadata: {
      tenantId: params.tenantId,
      type: 'image',
      createdAt: Date.now(),
      title: params.filename,
      sourceUrl: params.imageUrl,
      description, // Store description for display
    }
  }]);
}

export async function removeVector(indexName: string, id: string) {
  const vectorizeClient = getVectorizeClient(indexName);
  await vectorizeClient.delete([id]);
}

function getVectorizeClient(indexName: string): Vectorize {
  // Placeholder — actual implementation depends on Cloudflare bindings
  // In a Cloudflare Worker, this would be: env.VECTORIZE
  // For Node.js, use Cloudflare API client
  throw new Error('Vectorize client not implemented');
}
```

### 4. One-Time Indexing Script

**File:** [scripts/index-existing-content.ts](scripts/index-existing-content.ts)

```typescript
import { db } from '../apps/web/server/db';
import { indexDocument, indexImage } from '../apps/web/server/services/vectorize-indexing';

async function indexAllDocuments() {
  console.log('Indexing all documents...');

  // Query existing markdown articles (adjust based on actual schema)
  const articles = await db.query.articles.findMany();

  for (const article of articles) {
    await indexDocument({
      id: article.id,
      text: article.content,
      tenantId: article.tenantId,
      title: article.title,
      type: 'article',
      sourceUrl: `/docs/${article.slug}`,
    });
    console.log(`Indexed article: ${article.title}`);
  }
}

async function indexAllImages() {
  console.log('Indexing all gallery images...');

  // Query gallery items (adjust based on actual schema)
  const galleryItems = await db.query.galleryItems.findMany();

  for (const item of galleryItems) {
    if (item.type === 'image') {
      await indexImage({
        id: item.id,
        imageUrl: item.imageUrl,
        tenantId: item.tenantId,
        filename: item.filename,
      });
      console.log(`Indexed image: ${item.filename}`);
    }
  }
}

async function main() {
  await indexAllDocuments();
  await indexAllImages();
  console.log('Indexing complete!');
}

main().catch(console.error);
```

Run once after Vectorize indexes are created:
```bash
tsx scripts/index-existing-content.ts
```

### 5. Gallery Promotion Hook

**File:** [apps/web/server/routers/gallery.ts](apps/web/server/routers/gallery.ts) (modify existing router)

```typescript
import { indexImage, removeVector } from '../services/vectorize-indexing';

// Add to existing gallery promotion endpoint
router.post('/promote', async (req, res) => {
  // ... existing promotion logic ...

  // After promoting to gallery, index the image
  if (item.type === 'image') {
    await indexImage({
      id: item.id,
      imageUrl: item.imageUrl,
      tenantId: req.user.tenantId,
      filename: item.filename,
    });
  }

  res.json({ success: true });
});

// Add to existing gallery deletion endpoint
router.delete('/:id', async (req, res) => {
  // ... existing deletion logic ...

  // Remove from vector index
  await removeVector('images-index-prod', req.params.id);

  res.json({ success: true });
});
```

### 6. Search tRPC Endpoints

**File:** [apps/web/server/routers/search.ts](apps/web/server/routers/search.ts) (new router)

```typescript
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { generateEmbedding } from '../services/vectorize';
import { getVectorizeClient } from '../services/vectorize-indexing';

export const searchRouter = router({
  docs: publicProcedure
    .input(z.object({
      query: z.string(),
      tenantId: z.string().optional(),
      type: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      if (!input.query) {
        return [];
      }

      // Embed query
      const queryEmbedding = await generateEmbedding(input.query);

      // Search Vectorize
      const vectorizeClient = getVectorizeClient('docs-index-prod');
      const results = await vectorizeClient.query(queryEmbedding, {
        topK: input.limit,
        filter: {
          ...(input.tenantId && { tenantId: input.tenantId }),
          ...(input.type && { type: input.type }),
        },
      });

      return results.matches.map(match => ({
        id: match.id,
        score: match.score,
        title: match.metadata.title,
        type: match.metadata.type,
        sourceUrl: match.metadata.sourceUrl,
        createdAt: match.metadata.createdAt,
      }));
    }),

  images: publicProcedure
    .input(z.object({
      query: z.string(),
      tenantId: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      if (!input.query) {
        return [];
      }

      // Embed query
      const queryEmbedding = await generateEmbedding(input.query);

      // Search Vectorize
      const vectorizeClient = getVectorizeClient('images-index-prod');
      const results = await vectorizeClient.query(queryEmbedding, {
        topK: input.limit,
        filter: {
          ...(input.tenantId && { tenantId: input.tenantId }),
        },
      });

      return results.matches.map(match => ({
        id: match.id,
        score: match.score,
        imageUrl: match.metadata.sourceUrl,
        filename: match.metadata.title,
        description: match.metadata.description,
        createdAt: match.metadata.createdAt,
      }));
    }),
});
```

Register the search router:
```typescript
// apps/web/server/routers/index.ts
import { searchRouter } from './search';

export const appRouter = router({
  // ... existing routers ...
  search: searchRouter,
});
```

### 7. Environment Variables

Add to GCP Secret Manager:
- `CLOUDFLARE_AI_API_KEY` — Cloudflare Workers AI API key
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `VECTORIZE_DOCS_INDEX` — Index name (e.g., `docs-index-prod`)
- `VECTORIZE_IMAGES_INDEX` — Index name (e.g., `images-index-prod`)

### 8. Configuration

No feature flags required. Search endpoints are always available but return empty results if indexes are not populated.

## File Paths Summary

### Files to Create

1. [apps/web/server/services/vectorize.ts](apps/web/server/services/vectorize.ts) — Embedding generation
2. [apps/web/server/services/vectorize-indexing.ts](apps/web/server/services/vectorize-indexing.ts) — Indexing operations
3. [apps/web/server/routers/search.ts](apps/web/server/routers/search.ts) — Search tRPC endpoints
4. [scripts/index-existing-content.ts](scripts/index-existing-content.ts) — One-time indexing script
5. [apps/web/server/__tests__/vectorize-embeddings.test.ts](apps/web/server/__tests__/vectorize-embeddings.test.ts) — Embedding tests
6. [apps/web/server/__tests__/vectorize-indexing.test.ts](apps/web/server/__tests__/vectorize-indexing.test.ts) — Indexing tests
7. [apps/web/server/__tests__/vectorize-search.test.ts](apps/web/server/__tests__/vectorize-search.test.ts) — Search endpoint tests

### Files to Modify

1. [apps/web/server/routers/gallery.ts](apps/web/server/routers/gallery.ts) — Add indexing hooks to promotion and deletion
2. [apps/web/server/routers/index.ts](apps/web/server/routers/index.ts) — Register search router

## Implementation Approach

### Phase 1: Vectorize Setup (30 minutes)

1. Create Vectorize indexes via Cloudflare dashboard or Wrangler
2. Add environment variables to Secret Manager
3. Verify indexes are accessible

### Phase 2: Embedding Service (1-2 hours)

1. Implement `generateEmbedding()` function
2. Implement `chunkDocument()` function
3. Implement `generateImageDescription()` function
4. Write tests for embedding generation
5. Run tests to validate Workers AI integration

### Phase 3: Indexing Service (2-3 hours)

1. Implement `indexDocument()` with batch upsert
2. Implement `indexImage()` function
3. Implement `removeVector()` function
4. Write integration tests for indexing
5. Test batch operations with sample data

### Phase 4: One-Time Indexing (1 hour)

1. Write indexing script
2. Run script against staging database
3. Verify vectors exist in Vectorize indexes
4. Document index sizes and costs

### Phase 5: Search Endpoints (2 hours)

1. Create search router with `docs` and `images` procedures
2. Write tests for search endpoints
3. Test search with various queries and filters
4. Verify tenant isolation works

### Phase 6: Gallery Hooks (1 hour)

1. Add indexing trigger to gallery promotion endpoint
2. Add vector deletion trigger to gallery deletion endpoint
3. Test promotion → indexing flow
4. Test deletion → vector removal flow

## Critical Considerations

1. **Cost Control:** Cloudflare Vectorize charges per vector storage and query. Monitor usage via Cloudflare dashboard. Limit free tier usage: docs index (<10k vectors), images index (<5k vectors).

2. **Embedding Rate Limits:** Workers AI has rate limits. Implement exponential backoff for batch indexing. For large initial indexing (>1000 items), add delays between batches.

3. **Chunking Strategy:** 500-token chunks are a starting point. Tune based on query performance. Smaller chunks = more precise results but more vectors to store.

4. **Metadata Filtering:** Always include `tenantId` filter for multi-tenant isolation. Never return vectors from other tenants.

5. **Search Relevance:** Cosine similarity scores range 0-1. A score >0.7 indicates high relevance. Consider filtering results below a threshold (e.g., 0.5) to avoid low-quality matches.

6. **Index Versioning:** If embedding model changes, create a new index and re-index all content. Do not mix embeddings from different models in the same index.

## Validation Checklist

After implementation, verify:

- [ ] Both indexes exist in Cloudflare dashboard
- [ ] One-time indexing script populates indexes with existing content
- [ ] `search.docs` returns ranked results for text queries
- [ ] `search.images` returns results with image metadata
- [ ] Gallery promotion triggers indexing
- [ ] Gallery deletion removes vectors
- [ ] Tenant isolation works (query with `tenantId` filter only returns tenant's results)
- [ ] All tests pass (embedding, indexing, search)
- [ ] Embedding costs are within budget (check Cloudflare billing)

## Next Steps

After completing this section:
- **Section 15 (Admin Dashboard):** May include search health metrics (query volume, index sizes)
- **Section 19 (Load Testing):** Test search performance under concurrent query load
