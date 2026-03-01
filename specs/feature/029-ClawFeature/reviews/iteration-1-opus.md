# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-03-01T12:00:00Z

---

## Critical Issues

### 1. Type Mismatch: `users.currentTenantId` is INTEGER but `tenants.id` is VARCHAR(36)
The backfill query `UPDATE conversations SET tenant_id = u.tenant_id FROM users u` references `users.tenant_id` / `users.tenantId`, but the actual users table has `currentTenantId` (integer). Must verify actual DB column type before writing backfill.

### 2. `providerUsageLog.providerId` is NOT NULL with a real FK constraint
Column is `integer("providerId").notNull().references(() => llmProviders.id)`. Synthetic string IDs impossible. STT/TTS providers MUST be seeded into `llmProviders` table.

### 3. `costTracker.logRequest()` does not return a traceId
The function does not accept or generate a traceId. The plan's assumption is incorrect. Need to add traceId to logRequest() and determine where traceId is generated.

### 4. `super_admin` role does not exist
`roleEnum` only has `["user", "admin", "domain_admin"]`. Use `admin` instead or add new role.

### 5. `conversations` tenantId -- all creation sites need updating
Must grep for all conversation creation sites and update them to set tenantId.

## Security Concerns

### 6. Feature flags in loose JSON column
`tenants.settings` has `[key: string]: any` typing. Need dedicated mutation for featureFlags sub-key, read-modify-write pattern.

### 7. Widget system user with `role: 'system'` -- role doesn't exist
roleEnum doesn't include 'system'. Must decide approach.

### 8. `connection_config` JSONB encryption gap
Need to specify whether entire JSON is encrypted or individual keys.

### 9. Canvas CSP mismatch
Plan has `default-src 'none'` (better). Spec has `default-src 'self'`. Add `form-action` directive.

### 10. Webhook HMAC dedup key needs body hash
Timestamp-only dedup could drop legitimate calls within same second. Add bodyHash.

## Architectural Issues

### 11. Dual buildChatContext() -- consolidation opportunity
### 12. PostgreSQL enum ADD VALUE cannot run in transactions -- Drizzle workaround needed
### 13. Discord WebSocket in BullMQ worker -- unclear architecture
### 14. Eight new tables -- no rollback scripts
### 15. Credit refundCredits() API mismatch -- no traceId param, requires description

## Performance Concerns

### 16. Channel routing rules -- add rule count cap, short-circuit evaluation
### 17. Widget WebSocket -- need max connections, idle cleanup, fallback
### 18. Voice audio buffer memory management

## Missing Considerations

### 19. No testing strategy
### 20. No observability/monitoring
### 21. Telegram migration error handling
### 22. Artifact content size validation location
### 23. Persona injection blocklist is weak
### 24. No Nginx configuration changes mentioned
### 25. Artifact type overlap between messages.artifacts and conversationArtifacts
### 26. webhook_trigger_logs PK should be SERIAL
### 27. persona_templates.user_id type should be INTEGER
### 28. conversations.systemPrompt vs personaId precedence
### 29. Timeline is aggressive
