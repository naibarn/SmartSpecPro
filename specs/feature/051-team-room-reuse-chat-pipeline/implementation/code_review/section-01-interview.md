# Section 01 Code Review Interview

## Auto-fixes Applied

1. **CRITICAL: Pass `conversationId` to `detectSkill` for assistant path** — Fixed `roomIntentRouter.ts:61` to pass `input.conversationId` instead of `undefined`. This provides conversation context to skill detection for agent turns.

2. **NITPICK: Export `FALLBACK_CONTENT_SKILL_ID`** — Changed to `export const` so tests and consumers can reference it symbolically.

3. **IMPORTANT: Assert exact fallback skill in tests** — Updated Thai and English fallback tests to assert `decision.selectedSkillId === FALLBACK_CONTENT_SKILL_ID` instead of just `!== "team-discussion-assistant"`.

## Deferred to Section-03

- **CRITICAL: `general-article-writer` not `teamRunEligible`** — Section-03 refactors `executeTeamRunSkillTurn()` to always use the Node.js LLM path, which bypasses `isTeamRunEligibleSkill()`. The executor gate is the correct place to fix this, not the router.

## Let Go

- **IMPORTANT: Agent greetings routed to article-writer** — Acceptable tradeoff. The old `team-discussion-assistant` is being removed entirely. Agent greetings are rare in team runs.
- **SUGGESTION: Dynamic reason field** — Existing pattern across the codebase, not this section's scope.
