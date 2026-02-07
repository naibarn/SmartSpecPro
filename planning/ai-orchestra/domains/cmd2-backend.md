# CMD-2: Backend Architect (Node.js) — Domain Knowledge

## Ownership
All server-side code in `apps/web/server/` and `apps/web/shared/`

## Architecture

### Server Entry (`server/_core/index.ts`)
Express app with:
- Cookie parser, JSON body parser
- Tenant middleware (domain-based isolation)
- tRPC adapter at `/trpc`
- OpenAI-compatible gateway at `/v1/`
- Vite dev middleware (development only)
- Static file serving (production)
- Health endpoint at `/health`

### tRPC Routers (32 routers)

| Router | Procedures | Domain |
|--------|-----------|--------|
| `chat.ts` | sendMessage, getMessages, createConversation, listConversations | Chat/AI |
| `llmProviders.ts` | list, create, update, delete, testConnection, getModels | LLM config |
| `multiProvider.ts` | getProviders, addProvider, setHealth, getModelProviderMap | Multi-provider routing |
| `media.ts` | generate, getHistory, getTask | Media generation |
| `mediaJobs.ts` | generate, getTask, listTasks, cancel | Video editor jobs |
| `mediaModels.ts` | list, create, update, delete | Media AI models |
| `mediaProviders.ts` | list, create, update, delete, test | Media providers |
| `skills.ts` | list, create, update, delete, execute, detect | Skills CRUD |
| `credits.ts` | getBalance, getHistory, purchase | Credit management |
| `users.ts` | list, update, delete, adjustCredits | User management |
| `systemSettings.ts` | get, set, list | System configuration |
| `audit.ts` | search, getPayload, stats | Audit log queries |
| `usage.ts` | getStats, getHistory | Usage analytics |
| `queues.ts` | getStats, getJobs, retryJob | Queue monitoring |
| `tenant.ts` | get, update, getPages, updatePage | Tenant management |
| `adminTenants.ts` | list, create, update, delete | Admin tenant CRUD |
| `blog.ts` | list, get, create, update, delete | Blog posts |
| `marketplace.ts` | list, get, install, rate | Skill marketplace |
| `services.ts` | getStatus, healthCheck | Service monitoring |
| `accountSecurity.ts` | enable2FA, verify2FA, disable2FA, generateRecovery | Security |
| `memory.ts` | list, get, save, delete | Entity memory |
| `follows.ts` | follow, unfollow, getFollowers | Social |
| `factory.ts` | list, create, execute | Factory workflows |
| `scheduledMessages.ts` | list, create, cancel | Scheduled messages |
| `translation.ts` | translate, getLanguages | Translation |
| `storageSettings.ts` | get, update | S3/R2 config |
| `packages.ts` | list, create, update, delete | Credit packages |
| `sttProviders.ts` | list, create, update, delete | Speech-to-text |
| `skillRepositories.ts` | list, add, sync, remove | Skill repos |

### Services (39 services)

**Core Services:**
- `llmRouter.ts`: Multi-provider routing with health circuit breaker, fallback chain
- `llmQueue.ts`: BullMQ-based request queueing with rate limiting
- `llmRateLimiter.ts`: Per-user, per-model rate limiting (Bottleneck)
- `creditService.ts`: Credit balance check, deduction, refund, calculation
- `costTracker.ts`: Per-request cost tracking, provider-reported vs calculated
- `mediaGenerationService.ts`: Media task orchestration, credit deduction, Python backend calls

**Skill Services:**
- `skillRegistry.ts`: Load skills from `skills/` directory, parse YAML frontmatter
- `skillDetector.ts`: Match user messages to skills using trigger patterns
- `skillExecutor.ts`: Execute skills (llm-only or media-generate mode)
- `userSkillService.ts`: User-specific skill visibility and preferences

**Infrastructure Services:**
- `redis.ts`: IORedis client initialization
- `scheduler.ts`: Background job scheduling
- `providerHealth.ts`: Health check circuit breaker for LLM providers
- `modelSyncService.ts`: Sync available models from provider APIs
- `modelRegistry.ts`: Central model catalog

**Security Services:**
- `crypto.ts`: AES-256-GCM encryption/decryption
- `totpService.ts`: TOTP 2FA implementation
- `trustScoring.ts`: Registration fraud detection
- `piiFilter.ts`: PII detection and redaction
- `rateLimiter.ts`: Per-procedure rate limiting middleware

**Other Services:**
- `chatService.ts`: Conversation/message CRUD
- `memoryService.ts`: Entity memory management
- `emailService.ts`: SMTP email sending
- `smsService.ts`: SMS notification
- `auditLogger.ts`: JSONL file-based audit logging
- `traceContext.ts`: Request tracing with unique traceIds
- `promptEnhancementService.ts`: Prompt improvement for media
- `llmRoutesHandler.ts`: OpenAI-compatible gateway handler
- `postgresAdapter.ts`: DB adapter implementation
- `pricingCalculator.ts`: Dynamic pricing calculations
- `relevanceScorer.ts`: Content relevance scoring
- `menuConfigService.ts`: Dynamic menu configuration
- `marketplaceContentGenerator.ts`: AI-generated marketplace content
- `emailAnalysis.ts`: Email trust scoring
- `context7.ts`: Context management utilities

### Auth Flow
1. Login: email + password → bcrypt verify → JWT (jose) → cookie `app_session_id`
2. Register: validation + trust scoring → create user + 10k credits → JWT
3. Session: cookie sent on every request → `sdk.verifySession()` → tRPC context
4. Bearer: `auth.generateAccessToken` → `Authorization: Bearer` header
5. 2FA: TOTP via `totpService` → verify before sensitive operations

### Middleware Chain
```
Request → cookieParser → tenantMiddleware → tRPC adapter
  → authentication (JWT verify)
  → rate limiting (per-procedure)
  → input validation (Zod)
  → procedure handler
  → response
```

## Common Patterns

### Creating a new tRPC router
```typescript
// server/routers/myRouter.ts
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";

export const myRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      // ctx.user, ctx.db available
    }),
  create: adminProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // admin-only
    }),
});
```

### Service pattern
```typescript
// server/services/myService.ts
export async function doSomething(db: DB, userId: number, params: Params) {
  // Business logic here
  // Use db.select(), db.insert(), db.update()
  // Throw TRPCError for user-facing errors
}
```

## Common Debugging

1. **"UNAUTHORIZED" error:** Check JWT expiry, cookie presence, session validation
2. **tRPC type mismatch:** Restart dev server (types are generated at build)
3. **Redis connection error:** Check Docker `redis` service is running
4. **Rate limit hit (429):** Check `rateLimiter.ts` and `llmRateLimiter.ts` configuration
5. **Missing procedure:** Check router is merged in main `routers.ts`
