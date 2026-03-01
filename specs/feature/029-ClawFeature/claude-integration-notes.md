# Integration Notes: Opus Review Feedback

## Findings Integrated into Plan

### 1. `users.currentTenantId` type mismatch (CRITICAL)
**Integrating.** The backfill query must use the correct column name `currentTenantId` and handle the integer-to-varchar type mismatch. Will add explicit column verification and type-safe cast to the plan.

### 2. `providerUsageLog.providerId` is integer FK (CRITICAL)
**Integrating.** Removing the "verify at implementation" hedge. The plan now specifies mandatory `llmProviders` seed data for STT/TTS providers before any voice feature work.

### 3. `costTracker.logRequest()` has no traceId (CRITICAL)
**Integrating.** The plan must be corrected: traceId needs to be added as a parameter to `logRequest()`, and the entire trace propagation flow must be documented. This is foundational for F07 Cost Display.

### 4. `super_admin` role does not exist (CRITICAL)
**Integrating.** Using `admin` for platform-scope persona management instead. Adding a new role would have wide-reaching RBAC implications.

### 5. All conversation creation sites need tenantId (MEDIUM)
**Integrating.** Adding explicit instruction to grep for all conversation creation sites.

### 6. Feature flags in loose JSON (MEDIUM)
**Integrating.** Adding specification for dedicated featureFlags mutation with read-modify-write pattern.

### 7. Widget system user role (MEDIUM)
**Integrating.** Using `role: 'user'` for the system user but adding a `isSystemUser: true` flag or using email pattern matching to prevent login.

### 8. connection_config encryption (MEDIUM)
**Integrating.** Specifying individual-key encryption approach within JSONB.

### 9. Canvas CSP (LOW)
**Integrating.** Plan already has the correct `default-src 'none'`. Adding `form-action 'none'` directive.

### 10. Webhook dedup key (MEDIUM)
**Integrating.** Adding body hash to dedup key: `webhook:dedup:{triggerId}:{timestamp}:{bodyHash}`.

### 12. PostgreSQL enum in transactions (MEDIUM)
**Integrating.** Adding explicit workaround: separate raw SQL file for enum additions, run outside Drizzle transaction.

### 15. refundCredits API mismatch (MEDIUM)
**Integrating.** Correcting the calling convention to match actual API signature.

### 22. Artifact content validation (LOW)
**Integrating.** Specifying validation in both tRPC mutation and artifact parser.

### 24. Nginx configuration changes (MEDIUM)
**Integrating.** Adding Nginx section for WebSocket proxying and sandbox subdomain.

### 25. Artifact type overlap (MEDIUM)
**Integrating.** Adding definitive type mapping.

### 26. webhook_trigger_logs PK (LOW)
**Integrating.** Committing to SERIAL PK.

### 28. systemPrompt vs personaId precedence (MEDIUM)
**Integrating.** Clarifying that both are used: persona prefix prepended, conversation systemPrompt appended after.

## Findings NOT Integrated

### 11. Consolidate buildChatContext()
**Not integrating.** The two implementations serve different purposes (chat context vs memory context). Sharing persona resolution via personaService.ts is sufficient. Full consolidation is a separate refactoring task.

### 13. Discord WebSocket architecture
**Not integrating into plan update.** The plan already specifies "shared BullMQ worker process." The exact implementation detail (long-running job vs separate process) is an implementation-time decision. Adding a note for clarity.

### 14. Rollback scripts
**Not integrating.** The Database Safety Protocol in CLAUDE.md already mandates backups before migrations. Adding rollback scripts for each migration is overkill given the existing backup strategy. The implementer follows the DB Safety Protocol.

### 16-18. Performance concerns (routing cap, widget connections, voice buffers)
**Partially integrating.** Adding routing rule cap (50 per tenant) and short-circuit. Widget max connections and voice buffer strategy are implementation details.

### 19. Testing strategy
**Not integrating.** Testing is handled by the TDD plan (Section 16 of the workflow). This plan focuses on architecture and implementation guidance.

### 20. Observability
**Not integrating.** The existing audit logger already covers most observability. Adding metrics/monitoring is a cross-cutting concern better addressed separately.

### 21. Telegram migration error handling
**Not integrating.** The Database Safety Protocol mandates backups and row count verification. Unique constraint conflicts are handled by the explicit column mapping.

### 23. Persona injection blocklist weakness
**Partially integrating.** Acknowledging blocklist limitations, adding token budget monitoring recommendation. Full prompt injection defense is an ongoing concern, not a one-time fix.

### 27. persona_templates.user_id type
**Not integrating.** This is already implied by the FK reference to users(id) which is integer. The Drizzle schema definition makes this explicit.

### 29. Timeline
**Not integrating.** Timeline is user-confirmed. The plan follows the spec's Phase 1-3 order. Features are independently deployable via feature flags, so partial delivery is viable.
