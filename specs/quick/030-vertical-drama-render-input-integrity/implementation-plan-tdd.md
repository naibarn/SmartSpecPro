# TDD plan

## Red phase

1. Router image tests:
   - shuffled DB rows still yield portraits in required-key order;
   - three required characters attach three primary portraits;
   - one missing portrait reports its name and makes zero credit/provider calls;
   - model max two blocks a three-character request;
   - angle-grid path enforces the same conditions.
2. Identity contract tests:
   - exact Image indices and required attributes;
   - idempotent replacement;
   - survives prompt QC and hard cap handling.
3. Dialogue tests:
   - source has three lines, LLM echo/prompt has two;
   - repeated identical source lines remain repeated and ordered;
   - split and non-split paths;
   - refiner/sanitizer/style steps cannot remove lines;
   - persistence and provider boundary contain the complete block.
4. Capability tests:
   - Grok IDs/configs for Higgsfield, Kie, and Magnific resolve native audio true even with false/stale row flags.

## Green phase

Implement the smallest shared helpers and integrate them into existing call sites. Do not change unrelated client or provider code.

## Refactor phase

- Remove duplicated reference/preflight logic between single and angle mutations.
- Keep deterministic block builders pure and unit tested.
- Review error text for Thai actionability and English fallback where existing conventions require it.

## Commands

From `apps/web`:

```bash
npm test -- server/services/__tests__/verticalDramaPromptQc.test.ts server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts server/services/__tests__/verticalDramaModelCapabilities.test.ts
npm test -- server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts server/routers/__tests__/verticalDramaEpisodes.characterRefV2.test.ts server/routers/__tests__/verticalDramaEpisodes.characterLockSoften.test.ts
npm test -- shared/verticalDramaSeries/characterIdentityMap.test.ts
npm run check
```

If `npm run check` is too broad or already fails for unrelated dirty work, run the repository's scoped TypeScript command and report the unrelated baseline separately.

