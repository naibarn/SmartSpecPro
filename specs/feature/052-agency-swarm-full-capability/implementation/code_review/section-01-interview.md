# Section 01 — Code Review Interview

## Triage Summary

### Auto-fix (applying without user input)

1. **HIGH: Add `.notNull()` to 13 columns with defaults** — Convention requires it. Affects: `agencies.topology`, `agencies.cacheConversationStarters`, `agencyAgents.parallelToolCalls`, `agencyAgents.maxTurns`, `agencyGuardrails.validationAttempts/isEnabled/sortOrder`, `agencyTools.version/isExposedAsApi/strictSchema/oneCallAtATime/isEnabled/updatedAt`.

2. **CRITICAL (minor): Add `defaultTargetNodeId` comment to conditional_branch nodeConfig block** — The field already exists for router (line ~4679). Just needs a comment noting it's reused.

3. **MEDIUM: Enhance tests** — Add default value assertions, unique constraint checks, FK cascade assertions.

4. **LOW: Trailing newline on SQL file** — Auto-generated file, will add.

### Let go

- **modelSettings SQL in migration file**: The data migration was run as a post-migration step per spec §3.4. Drizzle-generated SQL files should not be manually modified. UPDATE 0 rows confirmed.
- **privateVault type change**: Pre-existing change on branch, not introduced by this section.

## Decisions

All fixes are auto-fixes. No user interview needed — all items are clear convention alignment.
