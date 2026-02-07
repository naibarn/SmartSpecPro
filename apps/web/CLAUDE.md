# @smartspec/web

Main web application — serves both the React frontend and Express/tRPC backend from a single Node.js process.

## Structure

```
apps/web/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # Reusable components (admin/, chat/, media/)
│   │   ├── pages/           # Route pages (Admin*, Media*, Login, Signup, Credits)
│   │   ├── hooks/           # Custom React hooks (useMenuItems, useAuth)
│   │   ├── lib/             # Utility functions (imageGridSplitter)
│   │   ├── _core/hooks/     # Core hooks (useAuth)
│   │   └── App.tsx          # Root component with routes
│   ├── index.html           # HTML entry point
│   └── public/              # Static assets
├── server/                  # Express + tRPC backend
│   ├── _core/               # Core modules
│   │   ├── index.ts         # Server entry point (Express app setup)
│   │   ├── context.ts       # tRPC context creation
│   │   ├── env.ts           # Environment variables
│   │   ├── llm.ts           # LLM client utilities
│   │   ├── llmRoutes.ts     # OpenAI-compatible HTTP gateway
│   │   ├── openaiCompatGateway.ts  # Gateway helpers
│   │   ├── sdk.ts           # SDK initialization
│   │   └── vite.ts          # Vite dev middleware
│   ├── routers/             # tRPC routers
│   │   ├── chat.ts          # Chat/conversation endpoints
│   │   ├── llmProviders.ts  # Provider management
│   │   ├── media.ts         # Media generation endpoints
│   │   ├── multiProvider.ts # Multi-provider management
│   │   ├── queues.ts        # Queue dashboard endpoints
│   │   ├── services.ts      # Service status endpoints
│   │   ├── skills.ts        # Skills CRUD + execution
│   │   ├── systemSettings.ts # System settings
│   │   └── translation.ts   # Translation endpoints
│   └── services/            # Business logic services
│       ├── llmRouter.ts     # LLM provider routing logic
│       ├── llmQueue.ts      # LLM request queueing
│       ├── llmRateLimiter.ts # Rate limiting
│       ├── creditService.ts # Credit tracking
│       ├── costTracker.ts   # Cost tracking per request
│       ├── mediaGenerationService.ts # Media task orchestration
│       ├── skillDetector.ts # Skill detection from user input
│       ├── skillExecutor.ts # Skill execution engine
│       ├── skillRegistry.ts # Skill loading from disk
│       ├── modelSyncService.ts # Model sync from providers
│       ├── memoryService.ts # Conversation memory
│       ├── promptEnhancementService.ts # Prompt enhancement
│       ├── emailService.ts  # Email sending
│       ├── scheduler.ts     # Background job scheduler
│       └── redis.ts         # Redis client
├── drizzle/                 # Database
│   ├── schema.ts            # Drizzle ORM table definitions
│   ├── seed.ts              # Database seed data
│   ├── meta/                # Migration metadata
│   └── *.sql                # Migration files
├── skills/                  # Skill definitions
│   ├── image_prompt_engineer/
│   ├── video-prompt-engineer/
│   ├── viral-talking-objects/
│   └── ...                  # Each skill: skill.md + schemas/
└── scripts/                 # Utility scripts (seed, test, debug)
```

## Commands

```bash
pnpm dev                # Start dev server (:3000) with hot reload
pnpm build              # Vite production build → dist/public/
pnpm test               # Vitest tests
pnpm test:coverage      # Tests with V8 coverage
pnpm check              # tsc --noEmit
pnpm format             # Prettier
pnpm db:push            # drizzle-kit generate && drizzle-kit migrate
```

## Path Aliases (vite.config.ts)

| Alias | Path |
|-------|------|
| `@/` | `client/src/` |
| `@shared/` | `shared/` |
| `@assets/` | `attached_assets/` |

## Frontend Patterns

- **Routing**: Wouter (lightweight, `<Route path="/admin/...">`)
- **Data fetching**: tRPC + TanStack Query (`trpc.router.procedure.useQuery()`)
- **Forms**: React Hook Form + Zod resolvers
- **UI components**: Radix UI primitives from `@smartspec/ui`
- **Styling**: TailwindCSS 4 utility classes, CVA for variants
- **Notifications**: Sonner toast
- **Animations**: Framer Motion

## Backend Patterns

- **tRPC**: Type-safe procedures in `server/routers/*.ts`, merged in `routers.ts`
- **HTTP routes**: Express middleware in `server/_core/llmRoutes.ts` for OpenAI-compatible gateway
- **Auth**: JWT via `jose`, session cookies via `cookie-parser`
- **DB**: Drizzle ORM queries, schema in `drizzle/schema.ts`
- **Redis**: IORedis for caching, BullMQ for job queues
- **Services**: Business logic in `server/services/*.ts`
- **Encryption**: `server/services/crypto.ts` — AES-256-GCM for all API keys and secrets

### Encryption Usage (crypto.ts)

```typescript
import { encrypt, decrypt } from "../services/crypto";

// Storing an API key
apiKeyEncrypted: encrypt(rawApiKey)   // → "iv:authTag:ciphertext" (hex)

// Reading an API key
const rawApiKey = decrypt(provider.apiKeyEncrypted);

// System settings (auto-encrypted when isSensitive=true)
{ category: "email", key: "smtp_pass", value: encrypt(password), isSensitive: true }
```

Key is derived from `LLM_ENCRYPTION_KEY` env var. See root CLAUDE.md for full encryption safety rules.

## Database Schema

Schema is in `drizzle/schema.ts` with pgTable definitions:
- **Enums**: roleEnum, planEnum, transactionTypeEnum, apiStyleEnum, etc.
- **Core tables**: users, tenants, messages, creditTransactions
- **LLM tables**: llmProviders, llmModels, llmRequestLogs
- **Media tables**: mediaGenerations, mediaModels
- **Skills tables**: skills (with chaining support)

Run `pnpm db:push` to generate and apply migrations after schema changes.

### Drizzle Migration Safety (MANDATORY)

Follow the root CLAUDE.md Database Safety Protocol. For Drizzle specifically:

**Before editing `drizzle/schema.ts`:**
```bash
# 1. Identify which tables you're changing
# 2. Backup those tables
mkdir -p ../../.db-backups
pg_dump "$DATABASE_URL" --data-only --table=TABLE_NAME \
  --file="../../.db-backups/TABLE_NAME_$(date +%Y%m%d_%H%M%S).sql"

# 3. Record row counts
psql "$DATABASE_URL" -c "SELECT count(*) FROM TABLE_NAME;"
```

**After editing `drizzle/schema.ts` — IMMEDIATELY run migration (no exceptions):**
```bash
# 3. Generate and apply migration
pnpm db:push    # runs: drizzle-kit generate && drizzle-kit migrate

# 4. If drizzle-kit migrate fails, apply SQL manually:
psql "$DATABASE_URL" -f "drizzle/XXXX_migration_name.sql"
# Then seed the hash into drizzle.__drizzle_migrations (see root CLAUDE.md)

# 5. Verify row counts match
psql "$DATABASE_URL" -c "SELECT count(*) FROM TABLE_NAME;"

# 6. If counts decreased → restore immediately
psql "$DATABASE_URL" < "../../.db-backups/TABLE_NAME_TIMESTAMP.sql"
```

**NEVER leave a schema change un-migrated.** An un-migrated `schema.ts` change crashes at runtime when the ORM queries a column that doesn't exist in the database. This is a silent bug — it only appears when users hit that code path. Treat migration as part of the schema change, not a follow-up task.

**Dangerous Drizzle patterns to watch for:**
- Removing a column from `pgTable` → Drizzle may DROP it, losing data
- Changing column type (e.g., `text` → `varchar`) → may truncate data
- Renaming a column → Drizzle sees it as DROP old + ADD new (data lost!)
- Adding NOT NULL without default on existing table → fails or nullifies

**Safe alternative for renames:** Use raw SQL migration instead of schema change:
```sql
ALTER TABLE table_name RENAME COLUMN old_name TO new_name;
```

## Environment (.env)

Required vars: `DATABASE_URL`, `JWT_SECRET`, `LLM_ENCRYPTION_KEY`
Optional: `S3_*` (storage), `STRIPE_*` (payments), `SMARTSPEC_WEB_GATEWAY_TOKEN`

See `.env.example` for full list.

## Testing

- Vitest with `@vitest/coverage-v8`
- Test files: `server/*.test.ts`
- Run specific: `pnpm vitest run server/auth.logout.test.ts`

## Debugging: Web App Specifics

Follow the root CLAUDE.md Debugging Protocol. Additionally for this app:

### Frontend bugs
1. Check browser console errors first (component stack traces point to exact file:line)
2. Verify tRPC query/mutation hooks: is the error from the client or server?
3. Check TanStack Query devtools state — is data stale, loading, or errored?
4. For UI rendering issues: inspect the Radix UI component props and Tailwind classes

### Backend bugs (tRPC / Express)
1. Check which router the failing endpoint belongs to (`server/routers/*.ts`)
2. Read the procedure's input Zod schema — is the client sending the right shape?
3. Trace through the service layer (`server/services/*.ts`) that the procedure calls
4. For DB errors: check the Drizzle query and schema types in `drizzle/schema.ts`

### Build / TypeScript errors
1. Run `pnpm check` to get the full type error list
2. For "module not found": check path aliases in `vite.config.ts` and `tsconfig.json`
3. For monorepo type issues: ensure the dependency is listed in `package.json` and re-run `pnpm install`

### LLM / Media / Skill bugs
Follow the root CLAUDE.md "LLM & Media Debugging Protocol" — **ALWAYS read audit logs first**.
- JSONL audit logs: `logs/audit/audit-YYYY-MM-DD.jsonl`
- DB audit: `providerUsageLog` (traceId, errorMessage, requestType columns)
- DB events: `apiAuditEvents` (media/skill structured events)
- tRPC admin API: `audit.search`, `audit.getPayload`, `audit.stats`

### Common web app pitfalls
- **tRPC type mismatch**: Router changed but client still uses old types → restart the dev server
- **Drizzle schema drift**: Schema changed but migration not run → `pnpm db:push`
- **Redis connection**: Server won't start → check if Redis is running (`docker ps`)
- **Port conflict**: Dev server fails on :3000 → the dev script auto-kills stale processes
