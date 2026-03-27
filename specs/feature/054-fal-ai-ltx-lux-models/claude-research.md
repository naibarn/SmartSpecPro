# Codebase Research: fal.ai LTX-2.3 & Lux TTS Integration

## 1. Gateway Routing Pattern (`gateway_unified.py`)

**Provider Normalization** (`_normalize_provider_id()`, ~line 109):
```python
@staticmethod
def _normalize_provider_id(provider: Optional[str]) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", provider.strip().lower()).strip("_")
    if normalized in {"byteplus", "modelark", "byteplus_modelark", "byteplus_model_ark"}:
        return "byteplus_modelark"
    if normalized in {"kie", "kie_ai", "kieai"}:
        return "kie_ai"
    if normalized in {"uvoice", "u_voice", "uvoice_ai", "uvoiceapp"}:
        return "uvoice"
    return normalized
```
→ Add `if normalized in {"fal", "fal_ai", "falai", "fal_ai_provider"}: return "fal_ai"`

**Video Generation** (`generate_video()`, ~line 815):
- Entry: `async def generate_video(self, request: VideoGenerationRequest, user: User, wait_for_completion: bool = True) -> VideoGenerationResponse`
- Pattern: cost estimation → credit check → provider routing via `elif resolved_provider == "X"` → per-request client instantiation → `aclose()` in finally

**BytePlus Video Pattern** (~line 858):
```python
client = BytePlusModelArkProvider(api_key=provider_config["apiKey"], base_url=provider_config.get("baseUrl"))
result = await client.create_video_task(model=request.model, prompt=request.prompt, ...)
# finally: await client.aclose()
```

**`_deduct_credits()` Signature:**
```python
async def _deduct_credits(self, user: User, actual_cost: Decimal,
    request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest],
    response: Union[LLMResponse, ImageGenerationResponse, VideoGenerationResponse, AudioGenerationResponse],
    estimated_cost: Decimal, use_openrouter: bool):
```
- `actual_cost` is USD Decimal (NOT credits)
- Conversion handled internally by `_deduct_credits()`

## 2. BytePlus Provider Pattern (`byteplus_modelark_provider.py`)

```python
class BytePlusModelArkProvider:
    BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"

    IMAGE_MODELS: frozenset[str] = frozenset({...})
    VIDEO_MODELS: frozenset[str] = frozenset({...})

    def __init__(self, api_key: str, base_url: str | None = None):
        self._api_key = api_key
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        self.client = httpx.AsyncClient(timeout=90.0)

    async def create_video_task(self, model, prompt, ...) -> dict  # queue submission
    async def get_task_status(self, task_id: str) -> dict          # polling
    async def generate_image(self, model, prompt, ...) -> dict     # sync
    async def aclose(self) -> None                                 # MUST call in finally
```

**SSRF at line 211:**
```python
if reference_image_url is not None:
    validate_uri_no_ssrf(reference_image_url)
```

## 3. Provider Exports (`providers/__init__.py`)

Currently exports: `BaseLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `GoogleProvider`, `GroqProvider`, `OllamaProvider`, `OpenRouterProvider`, `ZAIProvider`, `KieAIProvider`, `BytePlusModelArkProvider`, `UVoiceProvider`

→ Add `from .fal_ai_provider import FalAIProvider` + `"FalAIProvider"` in `__all__`

## 4. Media Tasks Polling (`media_tasks.py`)

**BytePlus Branch** (~line 1332):
```python
if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
    provider_config = await get_media_provider_key("byteplus_modelark")
    byteplus_client = BytePlusModelArkProvider(api_key=provider_config["apiKey"], ...)
    try:
        status_response = await byteplus_client.get_task_status(task.task_id)
        task_state, _ = _normalize_byteplus_task_state(status_response)
        if task_state == "success":
            result_url = _extract_byteplus_result_url(status_response)
            task.status = TaskStatus.COMPLETED
            task.result_url = result_url
            task.result_data = status_response
            task.completed_at = datetime.now(timezone.utc)
            recovered_count += 1
        elif task_state == "fail":
            task.status = TaskStatus.FAILED
            task.error_message = f"BytePlus failed: {error_msg[:200]}"
    finally:
        await byteplus_client.aclose()
```

- Uses model ID matching (`task.model in VIDEO_MODELS`) — NO provider column on MediaTask
- Falls through to Kie.ai fallback if not matched

## 5. SSRF Validation (`media_job_validators.py`)

```python
def validate_uri_no_ssrf(uri: str) -> str:
    # Rejects: file://, non-http schemes, private IPs, localhost, 0.0.0.0
    # ALLOWS: host.docker.internal (whitelisted for Docker→Host asset downloads)
    if hostname.lower() == "host.docker.internal":
        return uri  # Trusted
```

**SECURITY CONCERN**: `host.docker.internal` whitelist applies globally — fal.ai URL fields would bypass SSRF check if targeting `host.docker.internal`. Need explicit reject in `FalAIProvider._validate_urls()`.

## 6. Media Provider Service (`media_provider_service.py`)

```python
async def get_media_provider_key(provider_name: str = "kie_ai") -> Optional[Dict[str, Any]]:
    # 60s cache TTL
    # Queries media_providers table by providerName
    # Decrypts apiKeyEncrypted using shared LLM_ENCRYPTION_KEY
    # Returns: {"providerName", "displayName", "apiKey", "baseUrl", "callbackUrl", "configJson"}
```

## 7. Pricing Calculator (`pricingCalculator.ts`)

**`buildTierKey()`** (~line 88):
- `formula === "per_duration"` → tier key from duration: `"6s"`, `"10s"`
- `formula === "matrix"` → joins all `affectsPricing` fields: e.g. `"1080p-6s"`
- `formula === "flat"` → uses resolution directly if in pricingTiers

**`calculateCreditCost()`** (~line 150):
```typescript
const tierKey = buildTierKey(config, selections);
const baseCost = config.pricingTiers[tierKey] ?? model.creditCost;

if (config.pricingFormula === "per_unit") {
    // Character/item counting logic
    return baseCost * finalUnits * multiplier;
}

return baseCost * multiplier;  // ← NO duration multiplication!
```

**CRITICAL GAP**: For `"matrix"` formula with resolution × duration pricing, if `pricingTiers` keys are resolution-only (`"1080p": 60` credits/sec), the function returns 60 — NOT 60 × duration. Need to add duration multiplication for per-second pricing.

**FIX OPTIONS**:
1. Use composite keys in pricingTiers: `"1080p-6s": 360` (pre-computed) — works with existing code
2. Add duration multiplication in `calculateCreditCost()` for matrix/per_duration formulas

The spec uses option 1 approach for BytePlus (`"720p-5s": 200`) but option 2 for fal.ai (`"1080p": 60` per-sec). Need to decide which approach.

## 8. Provider Templates (`mediaProviders.ts`)

**fal_ai entry exists** (~line 9) but only has image models + minimax-video + kling.
- Needs LTX-2.3 video models and Lux TTS added to `availableModels`

**testFalAI()** (~line 478):
```typescript
async function testFalAI(apiKey: string): Promise<{ success: boolean; message: string }> {
    // Uses OPTIONS request — does NOT validate API key (CORS preflight bypasses auth)
    const response = await fetch("https://fal.run/fal-ai/flux/schnell", { method: "OPTIONS" });
}
```
→ Fix: Use POST to queue endpoint, check for 401 vs 422

## 9. Seed Script Pattern (`seed-media-models-byteplus.ts`)

```typescript
interface ModelDefinition {
    apiPayloadFormat: "market" | "veo" | "runway" | "suno" | "elevenlabs" | "custom" | "byteplus";
    generateType: string;
    inputFields: InputField[];
    pricingTiers: Record<string, number>;
    pricingFormula: "flat" | "per_duration" | "matrix" | "per_unit";
    // ... per_unit fields
    hasAudio?: boolean;
    maxDuration?: number;
}
```

**BytePlus matrix pricing uses composite keys:**
```typescript
pricingTiers: { "720p-5s": 200, "720p-10s": 400, "1080p-5s": 400, "1080p-10s": 800 }
```
→ For fal.ai, should use same pattern: `"1080p-6s": 360, "1080p-8s": 480, ...`

**Seeding**: Uses `postgres` npm package directly, DELETE existing + INSERT pattern.

## 10. Rate Limiter Pattern (`rateLimiter.ts`)

```typescript
export const mediaGenerationLimiter = createRateLimiter("media-generation", {
    windowMs: 300000,   // 5 min
    maxRequests: 20,
    blockDurationMs: 120000,
});
```
→ Add `luxTtsLimiter` with 5 req/10min per user

## 11. Media Pipeline (`media_pipeline.py`)

```python
async def download_media(result_url: str, tmp_dir: str) -> tuple[str, int, str]:
    # Downloads, validates SSRF, returns (local_path, size, content_type)

async def generate_thumbnail(file_path: str, media_type: str, tmp_dir: str) -> str | None:
    # FFmpeg-based thumbnail generation

async def extract_metadata(file_path: str, media_type: str) -> dict:
    # FFprobe metadata extraction
```

Note: Functions are `download_media`, `generate_thumbnail`, `extract_metadata` — NOT `download_result`/`upload_to_r2` as spec mentions. Need to verify actual R2 upload functions.

## 12. Key Decision Points

1. **Pricing tier keys**: Use composite keys (`"1080p-6s": 360`) matching BytePlus pattern vs per-second rates (`"1080p": 60`). Composite keys work with existing `calculateCreditCost()` without code changes.

2. **Duration multiplication**: If using per-second rates, need to add duration multiplication to `calculateCreditCost()`. If using composite keys, no calculator changes needed.

3. **Re-hosting**: Need to verify actual R2 upload function names in `media_pipeline.py` — spec references `download_result()` + `upload_to_r2()` but actual functions may differ.

4. **Credit reconciliation**: Node.js pre-reserves credits. Post-completion reconciliation from actual fal.ai output requires new code path in media status handler.
