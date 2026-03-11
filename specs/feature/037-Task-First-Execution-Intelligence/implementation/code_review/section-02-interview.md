# Section 02 — Code Review Interview

## Findings Triage

### [HIGH] Duplicate type definitions → **Auto-fixed**
- Removed standalone SkillExecutionPolicy from capabilityRegistry.ts
- Now re-exports SkillExecutionPolicyConfig from @smartspec/skills as SkillExecutionPolicy
- Single source of truth in packages/skills/src/types.ts

### [HIGH] No integration with DB → **Auto-fixed**
- Added loadEnabledModelsWithCapabilities() to capabilityRegistry.ts
- Selects all 7 capability columns + contextLength from model_provider_map
- Returns EnabledModelWithCapabilities[] ready for filtering

### [HIGH] contextLength already existed → **Not an issue**
- contextLength was already in model_provider_map before this section
- Migration correctly only adds the 7 new boolean columns

### [MEDIUM] Parser not updated → **Let go**
- YAML parser is permissive by design, passes through unknown keys
- Validation at parse time is nice-to-have, not critical for foundation

### [MEDIUM] No Zod validation → **Let go**
- .$type<...>() provides compile-time safety
- Runtime validation can be added when skills start using the field

### [MEDIUM] Sort stability → **Let go**
- V8 sort has been stable since Node 12

### [MEDIUM] Hybrid fixedModel not meeting requirements → **Auto-fixed**
- Added test confirming hybrid drops fixedModel that fails requirements

### [LOW] Unused policy fields → **Let go (expected for foundation)**
### [LOW] No seed data → **Let go (admin UI will handle)**
