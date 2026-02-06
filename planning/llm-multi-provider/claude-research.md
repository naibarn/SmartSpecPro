# Research Findings: LLM Multi-Provider System

## Part 1: Codebase Architecture Analysis

### Testing Setup
- **Framework**: Vitest + vi.mock()
- **Pattern**: Context factories (createPublicContext, createUserContext, createAdminContext), mocked dependencies, direct tRPC router invocation via `createCaller(context)`
- **Script**: `vitest run` (coverage via v8)
- **Test location**: Co-located with implementation (`.test.ts` suffix)

### Database Migration (Drizzle ORM)
- **Tool**: drizzle-kit (`generate` then `migrate`)
- **Schema**: Single source of truth at `drizzle/schema.ts`
- **Pattern**: Type-safe JSON columns via `$type<T>()`, enum types via `pgEnum()`

### Service Architecture
- **Pattern**: Pure async functions (NOT classes)
- **DB injection**: `const db = await getDb()`
- **Error handling**: Errors propagate to router (no try-catch wrapping in services)
- **Graceful degradation**: Static fallback data when DB unavailable

### tRPC Router Patterns
- **Validation**: Zod schemas on `.input()`
- **Procedure types**: `publicProcedure`, `protectedProcedure`, `adminProcedure`
- **Pattern**: Queries for reads, Mutations for writes
- **Security**: SSRF validation on URLs, encrypted API keys hidden from responses

### Existing Health/Retry Patterns
- **Rate limiting**: In-memory per-user/skill (Map-based, 60s windows)
- **Health tracking**: `lastTestedAt`, `lastTestResult` in mediaProviders schema
- **No circuit breaker**: Only basic rate limiting exists
- **No retry middleware**: Provider calls use fetch without retry

### Frontend Data Fetching
- **Library**: TanStack Query via tRPC React
- **Cache**: Manual invalidation (`utils.xxx.invalidate()`) + manual updates (`utils.xxx.setData()`)
- **Retry**: Disabled for auth queries
- **Error handling**: `TRPCClientError` with typed error codes

---

## Part 2: OpenCode Zen API

### Critical Finding: NOT Purely OpenAI-Compatible

Zen exposes **different endpoints per model family**:
- OpenAI models: `/responses` (Responses API format)
- Anthropic models: `/messages` (Anthropic Messages API format)
- Open-source models: `/chat/completions` (OpenAI Chat Completions format)
- Google models: `/models/{model-id}`

**For SmartSpec integration**: Use `/chat/completions` endpoint only (works for open-source/free models). Paid models requiring Anthropic/Google format are out of scope.

### Free Models (Limited Beta)

| Model | Type | Privacy |
|-------|------|---------|
| Kimi K2.5 Free | 200k+ context, Asian languages | Data may be used for training |
| MiniMax M2.1 Free | General purpose | Data may be used for training |
| GLM 4.7 Free | Coding specialist | Data may be used for training |
| Big Pickle | Stealth/unnamed | Data may be used for training |

### Billing
- Pay-as-you-go + 4.4% + $0.30 credit card processing
- Auto-reload: $20 when balance drops below $5
- Workspace budget limits configurable
- BYOK option: Bring your own provider keys

### Rate Limits
- **Not explicitly documented** in public docs
- Free models likely have lower rate limits

### Recommendation
- Use `/v1/chat/completions` endpoint for free models only
- For paid models on Zen, BYOK is more cost-effective (avoid 4.4% markup)
- Do NOT rely on free models for production (temporary availability)

---

## Part 3: Multi-Provider Routing Best Practices

### Recommended Pattern: Tiered Fallback + Circuit Breaker

```
Request → Circuit Breaker Check
  ↓ (healthy providers only)
Provider Selection (cost/priority/balanced)
  ↓
Attempt Primary Provider
  ↓ (success → return)
  ↓ (429/5xx → fallback)
Attempt Fallback Provider
  ↓ (success → return)
  ↓ (fail → next fallback)
...up to max_attempts
  ↓ (all failed)
Return Error to User
```

### Key Rules
1. **Trigger fallback on 429/5xx ONLY** — never on 400-level client errors (those indicate bugs)
2. **Circuit breaker**: Track failure rates, proactively remove unhealthy providers for cooldown period
3. **Pre-stream fallback works well**: Before first SSE chunk, transparently retry on another provider
4. **Mid-stream fallback is unreliable**: Once chunks are sent, cannot seamlessly switch providers. Detect error, inform user, retry full request.

### Streaming SSE + Fallback
- **Pre-stream**: If provider fails before first chunk → transparent retry on fallback. Client never knows.
- **Mid-stream**: If provider fails after chunks sent → send error event, retry entire request on fallback. Do NOT attempt to "continue" partial response.
- **Known issue**: LiteLLM has bugs with streaming fallback (GitHub #6532). Keep it simple.

### Provider Health Monitoring
- Track: success rate (rolling 24h), avg latency, failure count, last failure time
- Health states: healthy → degraded → down
- Circuit breaker thresholds: >5% failure rate → degraded, >20% → down
- Cooldown period: 30-60 seconds before retrying downed provider

### Load Balancing Strategies
1. **Cost-weighted** (OpenRouter): Inverse square of price weighting
2. **Least-busy** (LiteLLM): Route to deployment with lowest TPM usage
3. **Latency-based**: Route to fastest responding provider
4. **Priority-based**: Admin-configured explicit ordering

### Reference Tools
- **LiteLLM**: Most mature OSS option, budget routing, 100+ providers
- **Portkey AI Gateway**: Circuit breakers, conditional routing, observability
- **OpenRouter**: Cost-weighted provider selection as a service
- **RouteLLM**: Complexity-based routing (strong/weak model selection)

---

## Part 4: Cost Optimization Strategies

### Tier 1: Immediate Wins (30-50% savings)

**Prompt Caching**: Anthropic 90% discount on cache hits, OpenAI 50% auto-caching. Place static content at prompt start.

**Provider-Reported vs Calculated Costs**: ALWAYS prefer provider-reported `usage.cost` from API response. Calculated costs don't account for cache hits, batch discounts, or promotional pricing.

### Tier 2: Architectural (50-80% savings)

**Model Routing**: Route simple queries to cheap/free models, complex queries to premium models. FrugalGPT demonstrated 98% cost reduction matching GPT-4 quality through sequential cascading.

**Free Tier Strategy**: Route to free models first when available, with paid fallbacks. Track quotas separately.

### Tier 3: Budget Management

**Per-Provider Budgets**: Set daily/monthly limits per provider. When exhausted, auto-skip to alternatives. Return 429 when all budgets exhausted.

**Budget Alerts**: Set alerts at 80% threshold. Monitor with Prometheus-style metrics.

### Key Recommendations for SmartSpec
1. Use provider-reported costs (OpenRouter `usage.cost`) — already implemented!
2. Free model requests = 0 credits for users (already in spec)
3. Per-provider daily budgets with automatic fallback
4. Track both provider-reported and calculated costs for reconciliation
5. Route simple tasks to free models, complex tasks to paid models
6. Monitor free tier quotas and auto-switch to paid when exhausted

### Sources
- Portkey: Retries, Fallbacks, and Circuit Breakers
- LiteLLM: Routing, Load Balancing & Fallbacks
- OpenRouter: Provider Routing Documentation
- Stardrift: Resumable LLM Streaming
- ByteIota: LLM Cost Optimization 2026
- RouteLLM (GitHub)
- PricePerToken.com
