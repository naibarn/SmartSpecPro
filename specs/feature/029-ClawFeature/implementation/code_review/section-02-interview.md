# Section 02 Code Review Interview

## Review Findings Triage

### Auto-Fixed (applied without user input)
1. **setUserDefault/setTenantDefault validation** (HIGH) — Added persona existence and access validation before allowing default to be set
2. **Update sanitization gate** (MEDIUM) — Fixed to run sanitization when restrictions change, not just systemPromptPrefix
3. **Admin menu requiresFeature** (LOW) — Added `AI_PERSONA_ENABLED` feature flag to admin-personas menu item
4. **Unused useState import** — Removed from PersonaSelector.tsx
5. **Bare catch blocks** — Added error logging to catch blocks in chatService, memoryService, agencyStreamProxy

### User Decision: Python-side sanitization
- **Question:** Should we add server-side sanitization on the Python side for persona_prefix?
- **Answer:** Yes, add Python sanitization (defense-in-depth)
- **Implementation:** Added `safe_persona_prefix` property to `AgencyRunRequest` with blocklist check

### Let Go (acceptable as-is)
- **PersonaSelector callback pattern** — Valid design; parent component wires up the mutation
- **Non-streaming execute_run** — Persona support can be added when that path is actively used
- **Callers not passing tenantId** — Falls back to loading from conversation record; works correctly
- **Router test quality** — Service-level tests cover core logic; full router tests need server context
- **Agency stream persona test** — Tests the contract/interface correctly even if not integration-level
- **Duplicated resolution logic** — Can be extracted in a future refactor
- **Type safety (as any)** — Minimal risk in UI layer
- **Scope change on update** — Schema doesn't include scope in update, and UI prevents it

### Acknowledged But Deferred
- **user/tenant defaultPersonaId not loaded from DB in buildChatContext** — The resolution falls back to platform default. This is a known limitation that will be addressed when callers are refactored to pass full user/tenant objects.
