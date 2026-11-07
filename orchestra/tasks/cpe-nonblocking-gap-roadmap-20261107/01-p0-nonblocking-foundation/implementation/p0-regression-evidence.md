# P0 Non-Blocking Regression Evidence

## Revision and scope

- Source branch: `main`
- Candidate working tree based on: `95affe98568d0300ccb64ce904d3fd24b74a5de7`
- Canonical baseline before this slice: same SHA as `origin/main`
- Scope: CPE face observability, optional quality/style feature reads, optional assurance persistence, video prompt/render UI eligibility, and preservation of hard media checks.
- Verification profile: `quick` (focused Vitest suites and patch checks; no repository-wide typecheck).
- Time: 2026-11-07 06:31 UTC. Resource snapshot at 06:26 UTC: `free -h` reported 30 GiB total and 24 GiB available; all focused runs exited normally with no OOM/SIGKILL.

## Focused checks

| Command | Scope | Result |
|---|---|---|
| `pnpm --filter @smartspec/web exec vitest run shared/verticalDramaSeries/__tests__/videoPromptMotionAssurance.test.ts server/services/__tests__/verticalDramaVideoSafetyGate.test.ts` | Shared motion assurance classification and face-QC report semantics | 15 passed |
| `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts` | Full shot video-prompt service suite, including ambiguous-face warning with prompt returned | 50 passed |
| `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/verticalDramaEpisodePipeline.locationRosterWiring.test.ts client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.castPositionSwap.test.tsx` | Optional assurance null/timeout handling, warning persistence, speaker-mapping advisory UI and generation controls | 23 passed |
| `pnpm --filter @smartspec/web exec vitest run server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts -t "continues paid video generation with multi-character face QC|still rejects an unverified start-frame asset|^generateVideoClip.*forwards idempotencyKey through to deductCredits \(T2\)$"` | Feature off; face QC missing/stale/risky/incomplete; feature-flag read failure; verified media integrity hard check; idempotent credit key | 8 passed, 170 skipped |
| `git diff --check` | Patch whitespace and conflict-marker check | passed |

## Invariant evidence

- A face-observability finding is now a `warning`; prompt generation returns a usable prompt and includes the advisory in its warnings.
- Paid video submission continues with CPE face QC disabled, absent, stale, risky or incomplete, and when the optional feature-flag lookup fails. Advisory outcomes are logged without exposing prompt text.
- Missing optional pipeline assurance context or a timed-out snapshot leaves the stage `succeeded`; its warning is persisted with no error or repair action.
- Missing speaker-to-face mapping remains visible as an advisory while the ordinary prompt and paid-render controls remain available.
- An absent or unverified current start-frame media asset still returns `PRECONDITION_FAILED` and does not call the video provider. The idempotency key remains passed to credit deduction.

## Evidence limits and remaining work

- No authenticated browser session or real provider credential was used; hosted UI/provider rendering proof remains pending and is not inferred from mocked tests.
- A prior broad run of the router test file had numerous pre-existing fixture/mock failures. Only the exact changed-route and hard-control tests above are claimed passing; the broad suite is not claimed clean.
- This closes the P0 non-blocking boundary only. Canonical Feature 137/138/140/149/150/155/157/167/170/173/175 and Quick 298 ledgers remain open until their exact requirements have fresh evidence; this report does not mark any ledger PASS.
- No local typecheck or deployment was run.
