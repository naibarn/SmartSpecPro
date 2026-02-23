# Code Review — section-02-nodejs-media-models

## Summary
All 6 MEDIA_MODELS entries are correct. Union types updated. 14/14 tests pass. Key issues found.

## Findings

### FINDING-01 — HIGH — No rate limiter bucket for byteplus_modelark
`MEDIA_PROVIDER_LIMITS` in `llmRateLimiter.ts` has no `byteplus_modelark` entry; BytePlus requests silently fall to the `default-media` bucket (maxConcurrent:3, minTime:2000ms, 30/min). Plan Background section explicitly names `scheduleMediaWithLimiter` as a consumer of the provider string.

### FINDING-02 — HIGH — Test comment says "npm run check" (was "pnpm check" in plan)
Minor documentation inconsistency in marker test description string; functionally harmless.

### FINDING-03 — MEDIUM — Mock for llmRateLimiter is potentially under-scoped
Mock stubs only 2 functions; other import-time side effects may not be isolated. Tests pass, so this is acceptable as-is.

### FINDING-04 — MEDIUM — supportsSizes includes non-standard '1K'/'2K'/'4K' shorthands
No existing Node.js code interprets these strings; frontend may fail to parse them. Should use only standard pixel-dimension format.

### FINDING-05 — MEDIUM — No tests assert `id` field equality
A copy-paste error in the `id` field would pass all 14 tests silently.

### FINDING-06 — LOW — Multiple asserts per test block
Cosmetic; acceptable.

### FINDING-07 — LOW — Scratchpad text in section plan file first line
Not harmful; let go.
