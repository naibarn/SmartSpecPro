# CMD-4: Database Architect — Domain Knowledge

## Ownership
- `apps/web/drizzle/schema.ts` (source of truth for all tables)
- `apps/web/drizzle/*.sql` (migration files)
- `python-backend/app/models/` (SQLAlchemy mirrors)
- Database performance, indexing, query optimization

## Schema Overview (30+ tables)

### Auth & Users
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | id(serial), openId, email, password(bcrypt), role(enum), plan(enum), credits(int), twoFactorEnabled, trustScore |
| `emailVerificationTokens` | Email/SMS verification | userId(FK), email, code(6-digit), channel(enum), expiresAt |
| `registrationEvents` | Fraud detection | userId(FK), ipAddress, fingerprintHash, trustScore, outcome(enum) |
| `deviceFingerprints` | Device tracking | userId(FK), fingerprintHash, seenCount |
| `blockedPatterns` | Abuse prevention | patternType(enum), pattern, reason, isActive |

### Chat & AI
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `conversations` | Chat sessions | id, userId(FK), title, model, temperature, skillSettings(JSON), memoryMode |
| `messages` | Chat messages | conversationId(FK), role(enum), content, attachments(JSON), artifacts(JSON), skillUsed |
| `conversationSummaries` | Long chat summaries | conversationId(FK), summary, messageRange |
| `entityMemories` | AI memory system | userId(FK), entityType(enum 12 types), entityName, facts(JSON[]), confidence, importance |

### LLM Provider System
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `llmProviders` | Provider config | providerName(unique), apiKeyEncrypted, healthStatus(enum), failureCount |
| `modelProviderMap` | Model routing | modelId, providerId(FK), modelName, pricingInput/Output, apiStyle |
| `providerUsageLog` | Usage tracking | userId, modelUsed, costUsd, creditsCharged, traceId, wasFallback |
| `routingRules` | Dynamic routing | modelPattern(glob), routingMode(enum), providerOrder(JSON) |

### Media System
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `mediaProviders` | Media API config | providerName(unique), apiKeyEncrypted, callbackUrl, configJson |
| `mediaModels` | AI model catalog | modelId(unique), modelType(enum), creditCost, aspectRatios(JSON) |
| `galleryItems` | Media gallery | tenantId(FK), type(enum), fileUrl, model, views, likes |

### Skills Engine
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `skills` | Skill definitions | slug(unique), triggerPatterns(JSON), executionMode, chainTo, systemPrompt |
| `skillPreferences` | Per-conversation | conversationId(FK), skillId, enabled, priority |
| `userSkillVisibility` | Per-user | userId(FK), skillId(FK), visible, autoTriggerEnabled |
| `skillLikes` / `skillComments` | Marketplace | userId(FK), skillId(FK) |

### Multi-Tenancy
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenants` | Organizations | slug(unique), primaryDomain(unique), seoConfig(JSON), themeConfig(JSON), settings(JSON) |
| `tenantPages` | CMS pages | tenantId(FK), pageKey(enum), content, sections(JSON), isPublished |
| `seoMetadata` | SEO per page | tenantId(FK), path, structuredData(JSON), aiContent(JSON), geoData(JSON) |
| `themePresets` | Theme templates | name(unique), themeConfig(JSON), isActive, isDefault |
| `blogPosts` | Blog CMS | tenantId(FK), slug, content, isPublished, isFeatured |

### Billing
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `creditTransactions` | All credit moves | userId(FK), amount(int +-), type(enum), metadata(JSON), balanceAfter |
| `creditPackages` | Purchase options | credits(int), priceUsd(numeric), stripePriceId |
| `systemSettings` | Global config | category, key, value, isSensitive(bool → auto-encrypt) |
| `invoiceConfig` | Invoice templates | tenantId(FK nullable), companyName, taxId, bankDetails(JSON) |

### Security & Audit
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `apiAuditEvents` | Structured audit | traceId, eventType, userId, endpoint, statusCode, responseTimeMs |

## Indexes (Critical)
- `users`: email (unique), openId (unique), normalizedEmail
- `providerUsageLog`: (userId, createdAt), (providerId, createdAt), (traceId)
- `creditTransactions`: (userId, type)
- `modelProviderMap`: (modelId, providerId) composite unique
- `conversations`: (userId, createdAt)
- `messages`: (conversationId)

## Enums
```sql
roleEnum: 'user', 'admin', 'domain_admin'
planEnum: 'free', 'starter', 'pro', 'enterprise'
transactionTypeEnum: 'purchase', 'usage', 'bonus', 'refund', 'adjustment', 'subscription'
apiStyleEnum: 'openai', 'anthropic', 'google', 'custom'
providerTypeEnum: 'primary', 'secondary', 'fallback'
healthStatusEnum: 'healthy', 'degraded', 'unhealthy'
```

## Migration Safety (CRITICAL)

**Before ANY schema change:**
```bash
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --data-only --table=TABLE_NAME \
  --file=".db-backups/TABLE_NAME_$(date +%Y%m%d_%H%M%S).sql"
psql "$DATABASE_URL" -c "SELECT 'TABLE_NAME', count(*) FROM TABLE_NAME;"
```

**After editing schema.ts:**
```bash
cd apps/web && pnpm db:push  # IMMEDIATELY - no exceptions
```

**Verify:**
```bash
psql "$DATABASE_URL" -c "SELECT 'TABLE_NAME', count(*) FROM TABLE_NAME;"
# If counts decreased → restore IMMEDIATELY
```

**Dangerous operations requiring user approval:**
- DROP TABLE, DROP COLUMN
- TRUNCATE, bulk DELETE
- Column type changes
- Column renames (Drizzle sees as DROP + ADD)

## Performance Patterns

- Use `db.select().from(table).where(eq(table.id, value))` for simple lookups
- Use `db.transaction()` for multi-table operations
- Use indexes for frequently queried columns
- Use `limit()` and `offset()` for pagination
- JSON/JSONB columns for flexible metadata (but avoid for frequently queried data)
- Consider `partial indexes` for filtered queries (e.g., `WHERE isActive = true`)
