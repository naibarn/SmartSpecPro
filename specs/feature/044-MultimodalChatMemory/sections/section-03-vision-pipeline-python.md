Now I have enough context. Let me generate the section content.

# Section 03: Vision Pipeline (Python)

## Overview

This section implements the Python-side vision analysis pipeline: a Celery task that calls Gemini 2.5 Flash for structured image analysis, a FastAPI endpoint to receive dispatch requests from the Node.js backend, and the SQLAlchemy models needed to write results into the shared PostgreSQL database.

**Dependencies**: Section 01 (schema and migration) must be complete -- the Drizzle tables (`media_assets`, `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`) must exist in PostgreSQL before this code can write to them.

**Blocks**: Section 06 (retrieval and reference resolution) and Section 09 (safety and feature flags) depend on analysis results produced here.

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/tasks/vision_tasks.py` | Celery task: `analyze_image_task` |
| `python-backend/app/api/vision.py` | FastAPI endpoint: `POST /api/v1/vision/analyze` |
| `python-backend/app/models/vision.py` | SQLAlchemy models for `media_assets`, `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors` |
| `python-backend/tests/test_vision_tasks.py` | pytest tests for the Celery task |
| `python-backend/tests/test_vision_api.py` | pytest tests for the FastAPI endpoint |

## Files to Modify

| File | Changes |
|------|---------|
| `python-backend/app/core/celery_app.py` | Add `"vision"` queue to `REQUIRED_QUEUES` and `task_queues` list; add route for vision task |
| `python-backend/app/main.py` | Import and mount `vision` router |

---

## Tests (Write First)

### `python-backend/tests/test_vision_tasks.py`

All tests use pytest with `@pytest.mark.asyncio` where needed. Mock external calls (Gemini API, database).

```python
# Test: analyze_image_task calls Gemini Flash with correct prompt structure
#   - Mock the Gemini API client. Verify the request includes the image URL
#     and a structured output prompt requesting: shortCaption, detailedCaption,
#     ocrText, objects, styles, materials, colors, architectureTags,
#     aestheticScore, safetyLabels.

# Test: analyze_image_task stores result in media_asset_analysis
#   - Mock Gemini response with valid structured JSON. Verify an INSERT
#     into the media_asset_analysis table with correct mediaAssetId,
#     provider="google", model="gemini-2.5-flash", and all extracted fields.

# Test: analyze_image_task updates media_assets.status to 'analyzed'
#   - After successful analysis, verify UPDATE on media_assets sets
#     status='analyzed'.

# Test: analyze_image_task updates status to 'nsfw_blocked' when safety labels detected
#   - Mock Gemini response with safetyLabels containing NSFW flag.
#     Verify media_assets.status set to 'nsfw_blocked'.
#     Verify NO multimodal_memory_items or multimodal_memory_vectors rows created.

# Test: analyze_image_task updates status to 'failed' on Gemini API error
#   - Mock Gemini API to raise an exception on final retry attempt.
#     Verify media_assets.status set to 'failed'.

# Test: analyze_image_task is idempotent — skips if analysis already exists
#   - Pre-populate media_asset_analysis with a row for the given asset_id.
#     Verify the task returns early without calling Gemini API.

# Test: analyze_image_task retries 3 times with exponential backoff on transient failure
#   - Mock Gemini API to raise a transient error. Verify Celery retry
#     is called with the correct countdown values (30, 120, 480 seconds).

# Test: analyze_image_task deducts user credits via credit tracking
#   - Verify a row is inserted into provider_usage_log with operation
#     type 'vision_analysis' and appropriate cost after successful analysis.
```

### `python-backend/tests/test_vision_api.py`

```python
# Test: analyze_image_task requires x-proxy-token authentication
#   - Send POST /api/v1/vision/analyze with valid x-proxy-token header.
#     Verify 200 response and task dispatch.

# Test: analyze_image_task rejects request without valid auth token
#   - Send POST /api/v1/vision/analyze without x-proxy-token (or with
#     invalid token). Verify 401 response.

# Test: endpoint validates request body schema
#   - Send POST with missing required fields (asset_id, image_url, etc.).
#     Verify 422 validation error.

# Test: endpoint returns task_id on successful dispatch
#   - Verify the response includes a Celery task ID for status tracking.
```

---

## Implementation Details

### 1. SQLAlchemy Models -- `python-backend/app/models/vision.py`

These are Python-side read/write models for the tables created by the Drizzle migration in Section 01. They must match the Drizzle schema column names exactly (camelCase column names as defined in the schema, but SQLAlchemy maps them to the actual snake_case PostgreSQL column names).

**CRITICAL — Column Name Convention**: The SmartSpecPro codebase uses **snake_case** for PostgreSQL column names in newer tables. In `drizzle/schema.ts`, the pattern is:

```typescript
tenantId: varchar("tenant_id", { length: 36 })   // JS: tenantId → DB: tenant_id
mediaAssetId: bigint("media_asset_id", ...)       // JS: mediaAssetId → DB: media_asset_id
createdAt: timestamp("created_at", ...)           // JS: createdAt → DB: created_at
```

The SQLAlchemy models below use the **actual PostgreSQL column names** (snake_case). The Drizzle JS property names (camelCase) are irrelevant for Python — only the string argument passed to the Drizzle column constructor matters (e.g. `"tenant_id"`, `"media_asset_id"`).

**Verify**: After Section 01 migration runs, confirm the actual column names by running `\d media_assets` in psql and matching them here.

Define these models:

**`MediaAsset`** -- maps to `media_assets` table:
- All columns from Section 01 schema (id, tenantId, userId, projectId, conversationId, messageId, sourceType, status, storageKey, originalUrl, thumbnailUrl, mimeType, width, height, fileSize, checksumSha256, perceptualHash, createdAt, updatedAt)
- The task primarily needs to UPDATE the `status` column

**`MediaAssetAnalysis`** -- maps to `media_asset_analysis` table:
- All columns from Section 01 schema (id, mediaAssetId, provider, model, shortCaption, detailedCaption, ocrText, objects, styles, materials, colors, rooms, architectureTags, aestheticScore, safetyLabels, extractedJson, createdAt)
- JSON columns (objects, styles, materials, colors, rooms, architectureTags, safetyLabels, extractedJson) use `Column(JSON)`

**`MultimodalMemoryItem`** -- maps to `multimodal_memory_items` table:
- All columns from Section 01 schema
- The task writes a row after successful analysis with memoryKind='image', searchableText built from analysis

**`MultimodalMemoryVector`** -- maps to `multimodal_memory_vectors` table:
- All columns from Section 01 schema
- The `embedding` column type depends on pgvector SQLAlchemy support. Use `from pgvector.sqlalchemy import Vector` if the `pgvector` Python package is available, otherwise store as a JSON array and let the HNSW index handle the casting

All models inherit from `Base` (imported from `app.core.database`). Follow the pattern in `python-backend/app/models/media_task.py`.

### 2. Celery Task -- `python-backend/app/tasks/vision_tasks.py`

**Task signature**: `analyze_image_task(asset_id: int, image_url: str, tenant_id: str, user_id: int, system_cost: bool = False)`

**Queue**: Route to `"vision"` queue (registered in `celery_app.py`)

**Execution flow**:

1. **Idempotency check**: Open an async DB session (`AsyncSessionLocal`). Query `media_asset_analysis` for existing row with `media_asset_id = asset_id`. If found, return early (skip).

2. **Status update**: UPDATE `media_assets` SET `status = 'analyzing'` WHERE `id = asset_id`.

3. **Call Gemini 2.5 Flash**: Use the Google Generative AI Python SDK (`google-generativeai`) or direct HTTP request to the Gemini API.
   - Endpoint: `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
   - API key: `settings.GOOGLE_API_KEY` (already exists in config.py)
   - Request body includes:
     - The image URL as an inline image part (or download the image and send as base64)
     - A text prompt requesting structured JSON output with these exact fields:
       ```
       shortCaption, detailedCaption, ocrText, objects (array of strings),
       styles (array of strings), materials (array of strings),
       colors (array of strings), rooms (array of strings),
       architectureTags (array of strings), aestheticScore (0.0-1.0),
       safetyLabels (array of objects with category and confidence)
       ```
     - Set `response_mime_type: "application/json"` for structured output

4. **Parse response**: Extract the JSON from the Gemini response. Validate the expected fields exist. Handle malformed responses gracefully (log warning, set default values for missing fields).

5. **Safety check**: Inspect `safetyLabels` array. If any label has `category` matching NSFW-related values (e.g., "SEXUALLY_EXPLICIT", "HARM_CATEGORY_SEXUALLY_EXPLICIT") with `confidence > 0.7`:
   - UPDATE `media_assets` SET `status = 'nsfw_blocked'`
   - INSERT analysis row (for audit) but do NOT create memory items or vectors
   - Return early

6. **Store analysis**: INSERT into `media_asset_analysis` with all extracted fields. Set `provider = 'google'`, `model = 'gemini-2.5-flash'`.

7. **Build searchable text**: Concatenate analysis fields into a single string:
   ```
   "{shortCaption} | {' '.join(objects)} | style: {', '.join(styles)} | materials: {', '.join(materials)} | colors: {', '.join(colors)} | ocr: {ocrText}"
   ```

8. **Create memory item**: INSERT into `multimodal_memory_items` with:
   - `tenantId`, `userId`, `projectId`, `conversationId`, `messageId` from the asset
   - `mediaAssetId = asset_id`
   - `memoryKind = 'image'`
   - `title = shortCaption`
   - `summary = detailedCaption`
   - `searchableText` = built in step 7
   - `sourceRole = 'user'`
   - `salience = 0.500`, `confidence = 0.800`

9. **Generate embedding** (INGESTION-TIME — this is the primary embedding creation point): Call the Gemini Embedding API (`models/gemini-embedding-2-preview:embedContent`) with the `searchableText`. This produces a 768-dimension vector.
   - If Gemini embedding fails, log warning and skip vector creation (the memory item still exists for keyword search)
   - Fallback: If `GOOGLE_API_KEY` is not configured or embedding fails, skip this step entirely
   - **Ownership note**: This Python Celery task is the ONLY place that creates embeddings for ingested images. The Node.js `multimodalEmbeddingProvider.ts` (Section 04) is used only at **query-time** by the retrieval service (Section 06) to embed the user's text query for vector similarity search. See Section 04 for the full ownership split.

10. **Store vector**: INSERT into `multimodal_memory_vectors` with:
    - `memoryItemId` = the created memory item ID
    - `provider = 'google'`, `model = 'gemini-embedding-2-preview'`
    - `modality = 'image'`
    - `embedding` = the 768-dim vector
    - `embeddingVersion = 'v1'`

11. **Update asset status**: UPDATE `media_assets` SET `status = 'analyzed'`.

12. **Record credit usage**: INSERT into `provider_usage_log` via the pattern used in existing media tasks. Include `traceId`, `modelUsed = 'gemini-2.5-flash'`, estimated cost, operation type `'vision_analysis'`. **If `system_cost=True`** (backfill mode from Section 12), record the usage log entry for auditing but skip the `credit_transactions` deduction — the cost is absorbed as system cost, not charged to the user.

**Retry policy**:
- Use `@celery_app.task(bind=True, max_retries=3, acks_late=True)` decorator
- On transient errors (HTTP 429, 500, 503, connection errors), call `self.retry(countdown=backoff)` where backoff is `[30, 120, 480]` seconds based on `self.request.retries`
- On final failure (after 3 retries), update `media_assets.status` to `'failed'` and log the error

**Async execution**: Use the `_run_async()` helper pattern from `media_tasks.py` to run async database operations inside the synchronous Celery task context.

### 3. FastAPI Endpoint -- `python-backend/app/api/vision.py`

**Router**: `APIRouter(prefix="/api/v1/vision", tags=["vision"])`

**Endpoint**: `POST /analyze`

**Authentication**: Use the `_verify_proxy_token` dependency pattern from `python-backend/app/api/internal_library.py`. Check `x-proxy-token` header against `settings.SMARTSPEC_PROXY_TOKEN` using `secrets.compare_digest`.

**Request body** (Pydantic model `VisionAnalyzeRequest`):
```python
class VisionAnalyzeRequest(BaseModel):
    asset_id: int
    image_url: str
    tenant_id: str
    user_id: int
    system_cost: bool = False  # When True, skip user credit deduction (used by backfill script in Section 12)
```

**Response body** (Pydantic model `VisionAnalyzeResponse`):
```python
class VisionAnalyzeResponse(BaseModel):
    task_id: str
    status: str = "queued"
```

**Handler logic**:
1. Validate request
2. Call `analyze_image_task.delay(asset_id, image_url, tenant_id, user_id, system_cost=request.system_cost)`
3. Return `{ task_id: celery_async_result.id, status: "queued" }`

### 4. Celery App Registration -- `python-backend/app/core/celery_app.py`

Add to `REQUIRED_QUEUES`:
```python
REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export", "presentation_import", "sandbox", "vision"]
```

Add to `task_queues`:
```python
Queue("vision"),  # Vision analysis tasks
```

Add to `task_routes`:
```python
"app.tasks.vision_tasks.analyze_image_task": {"queue": "vision"},
```

### 5. Mount Router -- `python-backend/app/main.py`

Add to imports:
```python
from app.api import vision
```

Add to router registration (following the existing pattern in `main.py`):
```python
app.include_router(vision.router)
```

---

## Gemini API Interaction Details

The task needs to call two Gemini APIs:

### Vision Analysis (Gemini 2.5 Flash)

Use `google-generativeai` SDK if available, or direct HTTP:

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GOOGLE_API_KEY}
```

The request should include the image as a URI part and a text prompt requesting structured JSON. Set `generationConfig.response_mime_type = "application/json"` to enforce JSON output.

The structured prompt should instruct the model to analyze the image and return a JSON object with the specific fields listed in the task flow above. Include examples in the prompt for consistent output.

### Embedding Generation (Gemini Embedding 2 Preview)

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key={GOOGLE_API_KEY}
```

Send the searchable text as content. The response includes a 768-dimension embedding vector in `embedding.values`.

---

## Key Patterns to Follow

**Database access in Celery tasks**: Use `AsyncSessionLocal` from `app.core.database` wrapped in the `_run_async()` helper (copy from `media_tasks.py`). Every session must be used within `async with AsyncSessionLocal() as db:` context.

**Proxy token auth**: Copy the `_verify_proxy_token` dependency function pattern from `python-backend/app/api/internal_library.py`. It checks `x-proxy-token` header against `settings.SMARTSPEC_PROXY_TOKEN`.

**Structured logging**: Use `structlog.get_logger()` for all logging. Include `asset_id`, `tenant_id`, and `user_id` as structured fields (never log image URLs or user data beyond IDs).

**Error handling**: Catch Gemini API errors specifically. Distinguish transient errors (retry) from permanent errors (fail immediately). Parse Gemini error responses for rate limit information.

---

## Dependencies and Prerequisites

- **Python package**: `google-generativeai` — already in `requirements.txt` as `google-generativeai==0.3.2`. The existing `GoogleProvider` in `app/llm_proxy/providers/google_provider.py` shows the usage pattern (`import google.generativeai as genai`). Reuse the same lazy-loading pattern for the vision task.
- **Python package**: `pgvector` for SQLAlchemy vector column type (add to requirements if not present)
- **Environment**: `GOOGLE_API_KEY` must be set in `python-backend/.env`
- **Environment**: `SMARTSPEC_PROXY_TOKEN` must be set for endpoint auth
- **Database**: Tables from Section 01 must exist
- **Infrastructure**: Redis must be running for Celery task dispatch