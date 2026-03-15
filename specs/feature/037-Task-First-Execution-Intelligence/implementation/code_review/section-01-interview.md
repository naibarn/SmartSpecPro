# Section 01 — Code Review Interview

## Findings Triage

### [HIGH] preferredProviderId/strictProviderPin not consumed → **User chose: Fix now**
- Extended `getProviderForModel` with optional `ProviderHints` parameter
- Provider pinning: when `preferredProviderId` is set, that provider is preferred
- Strict pin: when `strictProviderPin` is true and pinned provider unavailable, returns null
- Chat router now passes hints from `executionPolicy` to `getProviderForModel`

### [MEDIUM] Sequential DB queries → **Auto-fixed**
- Refactored `resolveSkillExecutionPolicy` to use `loadEnabledLlmModelRows` once
- All `resolveEnabledLlmModelIdFromRows` calls are in-memory against same row set
- Added test confirming `loadEnabledLlmModelRows` called exactly once

### [MEDIUM] types.ts/parser.ts not modified → **Let go**
- The service-layer bridge is the correct scope for section-01
- Type-level bridge is planned for section-02

### [MEDIUM] skillRegistry.ts not modified → **Let go**
- Verified `dbSkillToDefinition` already populates llmModelId, preferredProviderId, strictProviderPin
- No changes needed

### [LOW] Test mock fragility → **Let go**
### [LOW] Import removal safe → **Let go**
