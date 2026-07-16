# Section-01 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews: "ไม่ต้องรอยืนยันอีก"). All decisions
auto-triaged by the conductor per the review's severity ranking.
Review: `section-01-review.md` (verdict APPROVE_WITH_FIXES).

## Decisions

| # | Finding | Severity | Decision | Rationale |
|---|---|---|---|---|
| 1 | AdminMediaModels save-path clobbers `hermes_worker` transport back to `gateway_api` on Edit→Save (latent data corruption once hermes rows exist) | MAJOR | **AUTO-FIX** — widen local form type to `MediaTransport`, pass through real transport; same widening in StoryboardReviewPage label site | Real verified write-back path (L1951-1954); cheap to fix now vs a data-corruption hunt in section 10/12 |
| 2 | `maskTokenLike` untested + doc comment falsely claims parity with `maskApiKey` convention | MEDIUM | **AUTO-FIX** — correct comment to describe its own rule; add 4 unit tests (long/exactly-8/short/empty) | The helper is a cross-section contract (04 posts masked diagnostics, 12 tests it); shipping untested defeats that |
| 3 | Missing `hermesMediaCapabilityFamilySchema` z.enum (sibling convention) | NIT | **AUTO-FIX** — one line | Cheap consistency; later sections may parse capability families |
| 4 | StoryboardReviewPage would show "API" label instead of "Hermes" until section 10 | LOW | **Covered by fix 1's widening**; no further action | Display-only, no write-back path (reviewer traced) |
| 5 | `maskTokenLike` surrogate-pair split on non-BMP chars | NIT | **LET GO** | Token-shaped strings are ASCII; malformed-not-unsafe per reviewer |

## Clean categories (per review)
Correctness of contract schema / effectiveHermesCapability / parse helpers /
TTL cache; spec fidelity (22 codes byte-exact, both systemSettings hooks);
client-safety (zod-only); conventions (no drive-by reformatting).
