# TDD Plan: fal.ai LTX-2.3 Video Models & Lux TTS Integration

Testing framework: **Vitest** (TypeScript), **pytest** (Python)

---

## 3. Provider Template & Seed Script (TypeScript Layer)

### 3.1 Provider Template Update
No unit tests — verified by seed script and admin UI.

### 3.2 Seed Script
```bash
# Test: Run seed script and verify 12 rows created in media_models table
# Test: Each row has correct modelId, provider="fal_ai", modelType, creditCost, priority, sortOrder
# Test: configJson contains valid pricingTiers and inputFields for each model
# Test: Re-running seed script is idempotent (DELETE + INSERT)
```

### 3.3 API Key Validation Fix
```typescript
// Test: testFalAI returns { success: true } for valid API key (mock 422 response)
// Test: testFalAI returns { success: false } for invalid API key (mock 401 response)
// Test: testFalAI handles network errors gracefully
```

## 4. Python Provider Handler

### 4.1 FalAIProvider Class

```python
# test_fal_ai_provider.py

# --- Video Generation (Queue) ---
# Test: generate_video submits to queue.fal.run/{model_id} with correct headers
# Test: generate_video returns dict with id=request_id and status=PROCESSING
# Test: generate_video calls _validate_urls before submission
# Test: generate_video sanitizes prompt (strips HTML tags)

# --- Audio Generation (Sync) ---
# Test: generate_audio POSTs to fal.run/{model_id} synchronously
# Test: generate_audio returns dict with data=[{url: ...}] and status=COMPLETED
# Test: generate_audio normalizes response (extracts audio.url)
# Test: generate_audio calls _validate_urls for audio_url field

# --- Image Generation (Sync) ---
# Test: generate_image POSTs to fal.run/{model_id} synchronously
# Test: generate_image returns normalized result with image URL

# --- Queue Operations ---
# Test: _submit_queue POSTs to queue.fal.run and returns request_id
# Test: get_queue_status returns correct status (IN_QUEUE, IN_PROGRESS, COMPLETED)
# Test: get_queue_result normalizes response with video URL, actual_duration, actual_resolution

# --- Auth ---
# Test: Authorization header uses "Key {api_key}" format (not Bearer)

# --- Error Handling ---
# Test: 401 response raises ValueError("Invalid fal.ai API key")
# Test: 422 response raises ValueError("Content policy rejection")
# Test: 429 response raises ValueError("fal.ai rate limit exceeded")
# Test: Other HTTP errors raise ValueError("fal.ai error (HTTP {status})")
# Test: Error messages never include response body content

# --- Resource Cleanup ---
# Test: aclose() closes httpx client
```

### 4.2 SSRF Validation

```python
# test_fal_ai_ssrf.py

# Test: rejects http://169.254.169.254/latest/meta-data (AWS metadata)
# Test: rejects http://localhost:8000/api/admin
# Test: rejects http://127.0.0.1:3000/internal
# Test: rejects http://10.0.0.1/private
# Test: rejects http://192.168.1.1/private
# Test: rejects http://host.docker.internal:8000/api (explicitly blocked for fal.ai)
# Test: allows https://example.com/image.png
# Test: allows https://v3b.fal.media/files/example.mp4
# Test: validates ALL url fields: image_url, end_image_url, audio_url, video_url
# Test: passes when URL field is None (skips validation)

# --- Prompt Sanitization ---
# Test: strips <script>alert('xss')</script> from prompt
# Test: strips <img src=x onerror=alert(1)> from prompt
# Test: preserves plain text prompt unchanged
# Test: handles empty prompt string
```

### 4.3 Video File Size Limit

```python
# Test: HEAD request sent for video_url field
# Test: rejects video_url > 500MB (Content-Length check)
# Test: allows video_url <= 500MB
# Test: handles missing Content-Length header gracefully
```

## 5. Gateway Routing

### 5.1 Provider ID Normalization
```python
# Test: "fal_ai" normalizes to "fal_ai"
# Test: "fal" normalizes to "fal_ai"
# Test: "falai" normalizes to "fal_ai"
# Test: "fal_ai_provider" normalizes to "fal_ai"
```

### 5.2-5.4 Routing Blocks
```python
# Test: generate_video routes to FalAIProvider when resolved_provider == "fal_ai"
# Test: generate_audio routes to FalAIProvider when resolved_provider == "fal_ai"
# Test: generate_image routes to FalAIProvider when resolved_provider == "fal_ai"
# Test: provider not configured (no apiKey) raises HTTPException 503
# Test: aclose() called in finally block even on error
```

### 5.5 Concurrent Task Limit
```python
# Test: allows request when user has 0 in-flight fal.ai tasks
# Test: allows request when user has 2 in-flight fal.ai tasks
# Test: rejects request when user has 3 in-flight fal.ai tasks
# Test: only counts fal.ai VIDEO_MODELS tasks (not other providers)
# Test: only counts PROCESSING status (not COMPLETED/FAILED)
```

## 6. Celery Polling Branch

```python
# Test: identifies fal.ai tasks by model ID matching (not provider column)
# Test: calls get_queue_status with correct model_id and task.task_id
# Test: COMPLETED status → extracts video URL, sets task.status=COMPLETED
# Test: COMPLETED status → stores actual_duration and actual_resolution in result_data
# Test: resolution derived correctly: width>=3840→"2160p", >=2560→"1440p", else "1080p"
# Test: FAILED status → sets task.status=FAILED with sanitized error (max 200 chars)
# Test: IN_QUEUE/IN_PROGRESS → no status change (skip)
# Test: provider not configured → logs warning and continues
# Test: aclose() called in finally block
# Test: task older than 30 minutes in IN_QUEUE/IN_PROGRESS → marked FAILED (timeout)
```

## 7. Credit Reconciliation

```typescript
// Test: actual_duration < reserved_duration → refund difference
// Test: actual_duration > reserved_duration → charge additional amount
// Test: actual_duration == reserved_duration → no adjustment
// Test: missing actual_duration → skip reconciliation (keep pre-reserved)
// Test: reconciliation only runs once per task (idempotent flag)
// Test: correct cost calculation using model pricing tiers + actual resolution/duration
```

## 8. Security Controls

### 8.1 tRPC SSRF Defense
```typescript
// Test: extraParams with http://localhost URL → validation fails
// Test: extraParams with http://127.0.0.1 URL → validation fails
// Test: extraParams with http://host.docker.internal URL → validation fails
// Test: extraParams with https://example.com URL → validation passes
// Test: extraParams with non-URL string values → validation passes
// Test: empty extraParams → validation passes
// Test: extraParams with private IP ranges (10.x, 172.16-31.x, 192.168.x) → fails
```

### 8.2 Redis TTS Rate Limiting
```typescript
// Test: first 5 requests within 10 minutes → all allowed
// Test: 6th request within 10 minutes → blocked
// Test: request after 10-minute window resets → allowed
// Test: rate limit is per-user (user A's requests don't affect user B)
// Test: rate limit only applies to fal-ai/lux-tts model
```

## 9. Pricing Tests (Composite Tier Keys)

```typescript
// --- Matrix formula (resolution-tiered video) ---
// Test: T2V Standard 1080p-6s → 360 credits
// Test: T2V Standard 1440p-10s → 1200 credits
// Test: T2V Standard 2160p-8s → 1920 credits
// Test: T2V Fast 1080p-6s → 240 credits
// Test: T2V Fast 2160p-20s → 3200 credits
// Test: unknown tier key → falls back to model.creditCost

// --- Matrix formula (flat per-second video) ---
// Test: A2V 6s → 600 credits
// Test: Extend 10s → 1000 credits
// Test: Retake 20s → 2000 credits

// --- Per-unit formula (TTS) ---
// Test: 500 chars → ceil(500/1000) × 1.4 = 1.4 credits
// Test: 1000 chars → ceil(1000/1000) × 1.4 = 1.4 credits
// Test: 2500 chars → ceil(2500/1000) × 1.4 = 4.2 credits
// Test: 0 chars → minimum 1 unit × 1.4 = 1.4 credits

// --- Flat formula (Flux images) ---
// Test: Flux Schnell → flat creditCost
```
