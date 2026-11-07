# Section 03 — Provider Capability Routing Evidence

- Roadmap: CPE gap closure P1, section `section-03-provider-capability-routing`.
- Revision under verification: local `main` at `1c4ea1fe8` plus the task-owned working changes listed in this checkpoint; no provider call was made.
- Profile: `quick` (focused Vitest suites and patch validation; host memory available at check time: 23 GiB).
- Verified: 2026-11-07, Asia/Bangkok.

## Changes

- Video capability mode selection now considers the requested clip duration and fails closed when no declared mode supports it. Both enhanced readiness and paid clip generation supply the actual shot/clip duration.
- Provider routing checks requested duration and resolution against registry-derived facts, normalizes documented resolution aliases, and no longer invents a 720p capability when registry facts are absent.
- Hard policy/capability failures (disabled model, tenant provider allowlist, aspect ratio, duration, resolution, native audio, and unsupported face references) block before any prompt-only fallback can be selected. Prompt-only fallback identifies the already selected model rather than implying a provider switch.
- `planProviderRouting` accepts the requested resolution so the dry-run route uses the same facts as the caller.

## Verification

- `pnpm test server/services/__tests__/verticalDramaProviderRouting.test.ts server/services/__tests__/verticalDramaVideoCapabilityProfile.test.ts --reporter=dot` — **35 tests passed** across 2 files.
- `git diff --check` — passed.
- Added coverage for duration-aware mode selection, fail-closed over-limit duration, allowlist protection with prompt fallback enabled, and unsupported duration/resolution routing.

## Limits / follow-up

- Provider routing remains a dry-run planner in this scope; no paid provider execution or live credential path was exercised.
- A broader adjacent suite run had 1 unrelated pre-existing failure in `verticalDramaEnhancedVideoPrompt.test.ts` (`accepts compact canonical dialogue events bound by speaker ID`, missing minimal speaker map); the routing and capability suites passed on their own.
- Tenant-specific capability/pricing manifests and ambiguous remote timeout reconciliation remain bounded by the existing registry, billing, and task-idempotency contracts; no alternate paid route or retry was introduced here.
