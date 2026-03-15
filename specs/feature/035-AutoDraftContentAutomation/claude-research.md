# Research: Auto Draft & Content Automation Engine (Spec 035)

## Part 1: Codebase Research

### 1. AgencySwarm Builtin Tool System

**File**: `python-backend/app/services/agency_tools.py`

**Builtin Endpoint Mapping**:
```python
_BUILTIN_ENDPOINTS: dict[str, str] = {
    "builtin-rag-knowledge": "/api/internal/tools/rag-knowledge",
    "builtin-skill-executor": "/api/internal/tools/skill-executor",
    "builtin-web-search": "/api/internal/tools/web-search",
    "builtin-http-request": "/api/internal/tools/http-request",
    "builtin-email-notify": "/api/internal/tools/email-notify",
    "builtin-webhook": "/api/internal/tools/webhook",
    "builtin-slack-message": "/api/internal/tools/slack-message",
    "builtin-document-search": "/api/internal/tools/document-search",
    "builtin-voice": "/api/internal/tools/voice",
    "builtin-browser": "/api/internal/tools/browser",
    "builtin-agency-call": None,  # Internal-only, no HTTP endpoint
}
```

**Risk Level Classification**:
```python
_BUILTIN_RISK_LEVELS: dict[str, str] = {
    "builtin-web-search": "medium",
    "builtin-http-request": "medium",
    "builtin-skill-executor": "medium",
    "builtin-webhook": "medium",
    "builtin-rag-knowledge": "low",
    "builtin-email-notify": "low",
    "builtin-slack-message": "low",
    "builtin-document-search": "low",
    "builtin-voice": "medium",
    "builtin-browser": "high",
    "builtin-agency-call": "high",
}
```

**Key Patterns**:
- Tools resolved via `resolve_tools_for_agent()` using LEFT JOIN with `agency_agent_tools` and `agency_tools` tables
- Per-agent `toolConfig` (instance_config) merged over base config
- Tool IDs: string format `"builtin-xxx"` (or UUID for custom tools)
- Risk routing: `low` → direct HTTP, `medium` → HTTP with whitelist check, `high` → OpenSandbox dispatch
- SSRF protection via `_validate_tool_url()` blocking private IPs/hostnames
- Internal service URL (from `SMARTSPEC_INTERNAL_URL` env) always allowed
- `builtin-agency-call` handled via `execute_agency_call()` async function, not HTTP

**HTTP Client Pattern**:
```python
with httpx.Client(timeout=30.0) as client:
    resp = client.post(
        config.endpoint_url,
        json={"query": query, **config.config},
    )
```

**Error Handling**: Non-200 → `f"Tool error (HTTP {resp.status_code}): {resp.text[:200]}"`

### 2. Draft Pipeline (generateAIDraft)

**File**: `apps/web/server/services/aiPresentationService.ts`

**Function Signature**:
```typescript
export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void>
```

**Input Type (GenerateAIDraftInputSchema)**:
```typescript
{
  deckId: number;
  expectedVersion: number;
  prompt: string;
  numSlides: number;  // default 5, max 30
  language: "auto" | "en" | "th";
  draftSkillId?: string;
  articleSkillId?: string;
  useCustomArticle?: boolean;
  customArticleText?: string;
  hideTextOnSlides?: boolean;
  imageSkillId?: string;
  imageModel?: string;
  generateAudio?: boolean;
  audioModel?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  imagePromptContext?: string;
  referenceImageUrls?: string[];
  mediaModelExtraParams?: Record<string, any>;
  audioModelExtraParams?: Record<string, any>;
  stylePresetId?: string;
  headerCustomText?: string;
  footerCustomText?: string;
  styleOverrides?: { headerEnabled?, showDeckTitle?, ... };
  watermark?: AIWatermarkSchema;
  draftSkillParams?: Record<string, any>;
  articleSkillParams?: Record<string, any>;
  mediaSkillParams?: Record<string, any>;
}
```

**Progress Tracking via Redis**:
- `progressKey`: `ai_draft_progress:{taskId}` — stores AIDraftProgress JSON
- `lockKey`: `ai_draft_lock:{userId}` — prevents concurrent drafts per user
- `cancelKey`: `ai_draft_cancel:{taskId}` — allows client-side cancellation
- TTL: 60s for progress, 120s for locks

**7 Phases**: Init → Article generation → Slides structure → Text refinement → Image prompt engineering → Image generation (batch) → Audio generation → Library item creation

### 3. Internal API Endpoint Pattern

- Internal endpoints at `/api/internal/tools/{tool-slug}`
- Protected by trust-on-localhost principle
- `SMARTSPEC_INTERNAL_URL` env var (default: `http://127.0.0.1:3000`)
- SSRF validation prevents agents from calling private IPs (unless internal URL)
- HTTP POST with `{ query, ...config }` body

### 4. Celery Task Patterns

**File**: `python-backend/app/core/celery_app.py`

**Queue Configuration**: `celery`, `video`, `media`, `presentation_export`, `presentation_import`, `sandbox`
**Serialization**: JSON for all (task args must be JSON-serializable)

**Async Helper Pattern** (`_run_async`):
```python
def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)  # No loop.close() — persist for next task
```

**Beat Schedule Pattern**:
```python
beat_schedule = {
    "task-name": {
        "task": "app.tasks.module.task_name",
        "schedule": crontab(hour=3, minute=0),
    },
}
```

### 5. Scheduling System

**File**: `apps/web/server/routers/scheduledMessages.ts`

**Cron Validation Rules**:
- Exactly 5 fields
- Block `* *` (every minute)
- Block sub-15-minute intervals
- Validate field ranges

**Per-User Limits**: Max 50 schedules per user

**Execution**: `deliverScheduledMessage(scheduleId)` routes by type (simple reminder → notification, skill → executeSkill(), LLM → chat generation)

### 6. Skill Registry

**File**: `apps/web/server/services/skillRegistry.ts`

**Key Functions**:
```typescript
getSkillRegistryAsync(): Promise<SkillDefinition[]>        // Cached async
getSkillByIdAsync(id: string): Promise<SkillDefinition | undefined>
getSkillByIdOrType(idOrType: string): SkillDefinition | undefined
getSkillsByType(type: SkillType): SkillDefinition[]
refreshSkillCache(): Promise<void>
```

**Auto-Sync**: Reads `skill.md` files, computes MD5 hash, updates DB only on hash change. Cache TTL: 60 seconds.

**Slug Resolution**: `getSkillByIdOrType(slug)` — matches by ID first, then falls back to type match.

### 7. Email Service

**File**: `apps/web/server/services/emailService.ts`

- SMTP config loaded from `systemSettings` table (category: "smtp", isSensitive=true → auto-decrypted)
- Uses `nodemailer` with TLS
- Console fallback if SMTP not configured
- Functions return `boolean` success

### 8. Testing Setup

**JavaScript/TypeScript (Vitest)**:
- `import { describe, it, expect, vi } from "vitest"`
- Mocking: `vi.mock()`, `vi.spyOn()`
- Coverage: `pnpm test:coverage` with V8

**Python (pytest)**:
- `asyncio_mode = auto` in pyproject.toml
- Markers: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.asyncio`
- Coverage: 80% minimum enforced
- Fixtures: conftest.py pattern for shared setup

---

## Part 2: Web Research — Best Practices

### 1. Celery Beat Scheduling Patterns

**Timezone-Aware Scheduling**:
- Set `app.conf.timezone` and keep `enable_utc = True` (store UTC internally, convert at boundaries)
- Use `zoneinfo` (Python 3.9+) for timezone objects
- DST handling: Celery auto-adjusts UTC execution times across DST transitions

**Preventing Duplicate Execution**:
- PostgreSQL `SELECT FOR UPDATE SKIP LOCKED` is the gold standard
- Atomic claim: `UPDATE ... WHERE id IN (SELECT id ... FOR UPDATE SKIP LOCKED)` in one transaction
- Non-blocking: workers skip locked rows instead of waiting
- Used by production systems: PgBoss, Oban, Solid Queue

**Concurrent Beat Workers**:
- Best approach: single beat instance with systemd `Restart=on-failure`
- Alternative: database-backed scheduler + SKIP LOCKED for deduplication

**Credit Budget Reservation**:
- Two-phase pattern: reserve before execution, finalize/release after completion
- Separate `available_balance` and `reserved_balance` columns
- `FOR UPDATE` on credit row prevents concurrent overspending
- Reservation records create audit trail

### 2. CSV/Excel File Parsing Security

**Formula Injection Prevention (OWASP)**:
- Dangerous characters: `=`, `+`, `-`, `@`, Tab (0x09), CR (0x0D), LF (0x0A), and full-width variants
- Mitigation: Tab-prefix (`0x09`) inside quoted fields is most reliable
- Papa Parse is a parser, not sanitizer — sanitize outputs yourself
- Strip control characters (0x00-0x1F, 0x7F-0x9F)

**ZIP Bomb Protection for XLSX**:
1. Check compressed vs. uncompressed ratio (reject if > 100x)
2. Cap total decompressed output at 100MB
3. Limit entry count in ZIP (XLSX typically < 50 entries)
4. Stream decompression with byte counter
5. Disable XXE in XML parser (SheetJS handles by default)

**MIME Detection by Magic Bytes**:
- ZIP/XLSX: `50 4B 03 04` (PK header) — further validate OOXML structure
- CSV: No magic bytes — validate by content structure
- Use `file-type` npm package for binary formats

**File Limits**:
| Parameter | Limit |
|-----------|-------|
| File size | 5 MB |
| Row count | 100 rows |
| Cell value | 5000 chars |
| Column count | 100 |
| Decompressed XLSX | 50 MB |

### 3. Webhook HMAC Signing Best Practices

**Signature Pattern (GitHub/Stripe)**:
- HMAC-SHA256 on raw request body bytes (before JSON parsing)
- Header: `X-SmartSpec-Signature: sha256=<hex_digest>`
- Constant-time comparison: `hmac.compare_digest()` (Python), `crypto.timingSafeEqual()` (Node.js)
- **Never use `==`** for signature comparison

**Per-Resource Secret Management**:
1. Generate unique secret per webhook endpoint: `secrets.token_hex(32)` (min 256 bits)
2. Store encrypted in DB (AES-256-GCM)
3. Support rotation with dual-secret validation window
4. Never expose in API responses

**Delivery Best Practices**:
- 3-tier retry: immediate (100-500ms), short-term (1min, 5min, 15min), up to 24hr total
- Response code handling: retry 5xx/408/429, never retry 4xx
- Exponential backoff with full jitter: `delay = random(0, base * 2^attempt)`
- Circuit breaker per endpoint: open after 5 failures in last 10 attempts

**Payload Security**:
- Sign entire raw body, not individual fields
- Include timestamp for replay protection (reject > 5 min old)
- Use `json.dumps()`, never string interpolation
- HTTPS only for webhook endpoints

### 4. Batch Content Automation Architecture

**Producer-Consumer Pattern**:
1. Schedule table stores planned items (topic, scheduled_at, status)
2. Beat process polls for due items
3. Claim via SKIP LOCKED for exactly-once processing
4. Worker pool executes LLM calls
5. Result stored back with status transition

**Rate Limiting for Batch**:
- Token bucket per user/tenant via Redis Lua script (atomic)
- Tiered: per-user, per-tenant, global caps
- Use BullMQ's built-in rate limiter for Node.js side

**Consecutive Failure & Auto-Pause (Circuit Breaker)**:
- **Active (Closed)**: Normal operation, counter resets on success
- **Paused (Open)**: After N consecutive failures, stop for cooldown
- **Probing (Half-Open)**: After cooldown, execute one task to test
- Escalating pause duration: 1hr → 2hr → 4hr prevents thrashing
- User notification essential when auto-pausing

**Topic Rotation Strategies**:
| Strategy | Best For |
|----------|----------|
| Sequential | Predictable, even coverage |
| Random | Variety, no repeated patterns |
| Smart/Adaptive | Data-driven, pick least-recently-used topics |

Smart rotation SQL:
```sql
SELECT t.name FROM schedule_topics t
LEFT JOIN generated_content gc
  ON gc.topic_id = t.id AND gc.created_at > now() - interval '7 days'
WHERE t.schedule_id = $1
GROUP BY t.id
ORDER BY COUNT(gc.id) ASC, RANDOM()
LIMIT 1;
```

---

## Key Recommendations for Spec 035 Implementation

| Area | Recommendation |
|------|---------------|
| **Tool Registration** | Follow existing `_BUILTIN_ENDPOINTS` + `_BUILTIN_RISK_LEVELS` pattern exactly |
| **Auto Draft Tool** | `medium` risk level — wraps `generateAIDraft()` via HTTP POST to new `/api/internal/tools/auto-draft` |
| **Model Suggest Tool** | `low` risk level — read-only query via `/api/internal/tools/model-suggest` |
| **File Parse Tool** | `medium` risk level — validate magic bytes, sanitize cells, 5MB/100 row limits |
| **Schedule Tool** | `high` risk level — creates persistent recurring tasks, requires confirmation |
| **Celery Scheduler** | Use `SELECT FOR UPDATE SKIP LOCKED` for spec scanning, `_run_async()` helper for async calls |
| **Credit Reservation** | Two-phase atomic SQL: reserve before execution, adjust/rollback after |
| **Webhook Signing** | Per-spec HMAC secret, stored encrypted, `hmac.compare_digest()` verification |
| **Content Spec Validation** | Reject `_`-prefixed keys, validate all constraints against allowlists |
| **Testing** | Vitest for Node.js handlers, pytest for Python tasks/services, 80% coverage minimum |
