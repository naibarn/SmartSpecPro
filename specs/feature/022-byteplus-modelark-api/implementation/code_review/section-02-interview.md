# Code Review Interview — section-02-nodejs-media-models

## User Decision

**FINDING-01 (HIGH — missing rate limiter bucket):** User approved adding `byteplus_modelark` entry to `MEDIA_PROVIDER_LIMITS` now.

## Fixes Applied

### Auto-fix: FINDING-01 — Added byteplus_modelark rate limiter config
Added to `apps/web/server/services/llmRateLimiter.ts`:
```
'byteplus_modelark': {
  maxConcurrent: 5,
  minTime: 1000,
  reservoir: 30,
  reservoirRefreshInterval: 60000,
  timeout: 300000,  // 5 min for async video tasks
  videoMultiplier: 2,
  audioMultiplier: 1,
}
```
Conservative defaults; can be tuned once production rate limits are known.

### Auto-fix: FINDING-04 — Removed non-standard '1K'/'2K'/'4K' supportsSizes shorthands
Seedream entries now use only standard pixel-dimension strings: `["1024x1024", "2048x2048", "4096x4096"]`.

### Auto-fix: FINDING-05 — Added id field integrity test
Added test: "all 6 BytePlus model entries have id field matching their registry key" — verifies each entry's `id` field equals its registry key.

## Auto-triaged (no user input)

| Finding | Decision |
|---------|----------|
| FINDING-02 (test comment says "npm run check") | Let go — test string only, functionally harmless |
| FINDING-03 (mock scope) | Let go — tests pass correctly |
| FINDING-06 (multiple asserts per block) | Let go — cosmetic |
| FINDING-07 (scratchpad text in plan file) | Let go — plan artifact not source code |

## Final Test Count: 15/15 passing
