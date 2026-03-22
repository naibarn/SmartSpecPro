# Section 02 Code Review Interview

## Auto-fixes Applied

1. **CRITICAL: Double "Restrictions:" prefix** — Removed outer `Restrictions:\n` wrapper since `buildPersonaPromptSegments` already includes it. Updated test to verify no double prefix.

2. **CRITICAL: null `systemPromptPrefix`** — Changed guard from `if (persona)` to `if (persona?.systemPromptPrefix)` to prevent "null" string in persona section.

3. **IMPORTANT: `profile?.personaId ?? undefined`** → Changed to `profile.personaId ?? null` and added `profile` existence guard for proper persona-scoped entity memory fetching.

4. **IMPORTANT: `and()` with single element** — Replaced with explicit conditional: `input.runId ? and(...) : eq(...)`.

5. **IMPORTANT: Objective placement** — Moved objective push to after all system messages (persona, team, memories, entity memories) and before history. Now message order is: system → system → system → user:objective → user/assistant:history.

6. **SUGGESTION: Sanitize `[PERSONA START]`/`[PERSONA END]`** — Added to sanitization replacements.

7. **FLAG: Unused `users` import** — Removed.

8. **SUGGESTION: `runId` type** — Changed to `runId?: string` (optional) to match runtime behavior.

## Let Go

- **IMPORTANT: Test mock reference equality risk** — Acknowledged. The mock approach is adequate for current test scope. Would need rework only if schema re-exports change.
- **SUGGESTION: Test assertion completeness for sanitization** — The test already checks for `[SYS]` and `[filtered]` presence. Good enough.
