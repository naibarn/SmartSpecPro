# Decision log

## 2026-08-28

- Chosen depth: `standard` quick plan. The work spans shared validation, two TypeScript registries, seed data, Python model resolution, and UI/server ID predicates, but does not require a schema migration or a new transport.
- Chosen architecture: separate catalog row plus shared Gemini Omni predicate. This preserves old task IDs and avoids duplicating the provider adapter.
- First/last-frame support is included because it is part of the requested model's documented contract and otherwise the new model would expose an incomplete/incorrect capability surface.
- Existing old-row pricing is not changed. New pricing remains isolated and is sourced from the Kie model page at implementation time.
- Live generation is credential-gated. Local tests can prove exact request construction; only a real Kie task can prove account/provider availability.

## Plan self-review rounds

- Round 1 — completeness: covered all three catalog boundaries, shared validation, server/client gates, Python provider, tests, seed, and live-proof boundary.
- Round 2 — contradiction check: preserved old `gemini-omni-video`; new row alone owns 360p/4k and first/last-frame additions.
- Round 3 — security check: frame/reference URL validation and existing tenant/user provider-asset checks remain before credit/provider work.
- Round 4 — integration check: exact provider ID is config-driven and generic market transport is reused; no second adapter or schema migration.
- Round 5 — final obvious-gap check: corrected the plan's Vitest command to omit unsupported Jest `--runInBand`; live smoke remains explicitly credential-gated.
- Result: two consecutive clean rounds after the correction; ready for implementation.
