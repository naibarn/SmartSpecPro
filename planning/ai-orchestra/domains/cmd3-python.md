# CMD-3: Python Engineer — Domain Knowledge

## Ownership
All code in `python-backend/`

## Architecture

### Entry Point (`app/main.py`)
FastAPI with lifespan management:
- Database init (`init_db()`)
- Redis cache init
- LLM Proxy init
- Settings validation (ConfigValidator)
- Security middleware (headers, rate limiting, request logging)
- OpenAPI docs (disabled in production)

### API Routes (58+ endpoints)

| Category | Prefix | Purpose |
|----------|--------|---------|
| Health | `/health`, `/system-health` | Service status |
| Auth | `/api/auth` | Register, login, token refresh |
| LLM | `/api/v1/llm` | LLM invocation with credit system |
| Media | `/api/v1/media` | Image/video/audio generation |
| Skills | `/api/v1/skills` | Skill execution |
| Admin | `/admin` | Provider config, impersonation |
| Payments | `/api/payments`, `/api/credits` | Stripe, credit management |
| Users | `/api/users`, `/api/dashboard` | User management |
| Webhooks | `/webhooks` | Async task callbacks |
| OpenAI Compat | `/v1/chat/completions`, `/v1/models` | OpenAI SDK compatible |
| Workflows | `/orchestrator`, `/workflows`, `/autopilot` | Advanced AI workflows |
| Multi-tenant | `/tenants`, `/rbac`, `/approvals` | Tenant management |

### Celery Task System

**Queues:**
- `media` queue: API-based generation (image, audio, retry, cleanup) — 4 concurrent
- `video` queue: FFmpeg processing (render, probe, thumbnails) — 2 concurrent

**Tasks:**
```python
# Media Generation (media queue)
generate_image_task(task_id, user_id, request_data)  # max_retries=3, backoff=60s
generate_video_task(task_id, user_id, request_data)  # max_retries=3, backoff=120s
generate_audio_task(task_id, user_id, request_data)  # max_retries=3, backoff=60s
cleanup_expired_tasks()  # Daily 3:00 AM UTC, delete >12 day old tasks
retry_failed_tasks()     # Every 15 min, retry transient errors

# Media Job Worker (video queue)
execute_media_job(job_spec)  # FFmpeg operations, reports via Redis
```

**FFmpeg Job Types:**
```
probe, render_mp4_h264, render_hls, waveform_peaks,
thumbnails, subtitles_extract, subtitles_burnin,
concat, dead_air_detect, dead_air_cut, generate_clip_from_api
```

### LLM Proxy (`app/llm_proxy/`)

**Unified Client:** Initializes all provider SDKs from env + database config

**Providers:**
- OpenRouter (420+ models, PRIMARY)
- OpenAI, Anthropic, Google, Groq (direct)
- Ollama (local), Z.AI (Chinese), KiloCode
- Kie.ai (media: images, videos, audio)

**Gateway (`gateway_unified.py`):**
1. Authenticate user
2. Estimate cost from model matrix
3. Check credits
4. Call LLM (direct or OpenRouter)
5. Calculate actual cost
6. Deduct credits
7. Return response

**Kie.ai Provider:**
- Async task-based: POST `/jobs/createTask` → poll `/jobs/recordInfo`
- Model mapping: `gpt-4o-image` → `gpt-image-1`, `flux-kontext-pro` → `flux-kontext-pro`
- Supports: images, videos, audio, music generation

### Models (`app/models/`)

| Model | Key Fields |
|-------|-----------|
| User | id, email, password(hashed), role, plan, credits, 2FA |
| MediaTask | id(UUID), task_id(external), user_id, media_type, status, result_url |
| CreditTransaction | userId, amount(+/-), type(enum), metadata(JSONB), balanceAfter |
| APIKey | id(UUID), user_id, key_hash(SHA-256), permissions(JSON), rate_limit |
| PaymentTransaction | Stripe integration |
| ProviderConfig | name, api_key_encrypted, is_enabled |

### Credit System

**Exchange Rate:** 1 USD = 1,000 credits
**Default Markup:** 15% on purchases
**New User Bonus:** 10,000 credits ($10 USD trial)

**WebGatewayClient:** Bridge to Node.js credit system
- `deduct_credits()` → POST to Node.js gateway
- `get_balance()` → GET from Node.js gateway
- Auth: Bearer token (SMARTSPEC_WEB_GATEWAY_TOKEN)

### Security

**Auth:**
- JWT (HS256), 15-min access token, 7-day refresh
- Argon2 (primary) + bcrypt (backward compat) password hashing

**Middleware:**
- SecurityHeadersMiddleware (HSTS, X-Frame-Options, CSP)
- RateLimitMiddleware (IP-based anon, user-based auth)
- RequestValidationMiddleware (input sanitization)
- CSRF protection (`core/csrf.py`)

**Encryption:**
- `encryption.py` (Fernet): Python-only secrets
- `smartspecweb_crypto.py` (AES-256-GCM): Decrypt Node.js-encrypted data

## Code Quality

```bash
black app/ tests/         # Format (100 char width)
isort app/ tests/         # Sort imports
ruff check app/           # Lint (E, W, F, I, B, C4, UP)
mypy app/                 # Type check
pytest                    # Tests (80% coverage minimum)
pytest -m unit            # Unit tests only
pytest -k test_media      # Pattern matching
```

## Common Debugging

1. **"coroutine was never awaited":** Missing `await` on async function call
2. **Celery task stuck PENDING:** Check worker is consuming correct queue, Redis is accessible
3. **Serialization error:** Task arguments must be JSON-serializable (no datetime, model objects)
4. **asyncpg pool exhausted:** Session leak — check for missing `await session.close()` or `async with`
5. **Import error in Celery:** Use absolute imports (worker imports differently than FastAPI)
6. **Pydantic V2:** `.dict()` → `.model_dump()`, `validator` → `field_validator`
