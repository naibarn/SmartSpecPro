# Section 07 — Code Review Interview

## Triage

| # | Severity | Issue | Decision |
|---|---|---|---|
| 1 | HIGH | `debugError` passes full error unbounded | **Auto-fix**: Truncate at call site to 200 chars |
| 2 | MEDIUM | `""` vs `null` for missing optional fields | **Auto-fix**: Use `null` for consistency with `description` |
| 3 | MEDIUM | Tests are pure-JS assertions | **Let go**: Zod schema tests are the primary value; integration handler tests would require heavy auth/DB mocking disproportionate for this section |
| 4 | MEDIUM | Error-response test is vacuous | **Let go**: Same reasoning as #3 |
| 5 | LOW | Zod issue messages in 400 response | **Let go**: Pre-existing, out of scope |
| 6 | LOW | `?? undefined` is no-op | **Auto-fix**: Simplify to `.modelRequirements` |
| 7 | LOW | Schema re-declared in test | **Let go**: Inline schema serves as contract snapshot |

## Applied Fixes

1. **Error truncation** (HIGH → fixed): Changed `debugError("internal_agency_create", "Agency creation failed", err)` to pass `{ message: String(err?.message ?? "").slice(0, 200) }` — limits what `debugError` can log.

2. **Null convention** (MEDIUM → fixed): Changed `(objective || "").slice(0, 2000)` to `objective ? objective.slice(0, 2000) : null` — consistent with `description` column pattern. Same for `sharedInstructions`.

3. **Simplified modelRequirements** (LOW → fixed): Changed `a.modelRequirements ?? undefined` to `a.modelRequirements`.

4. **Updated test**: Changed "defaults to empty string" test to "defaults to null" to match new convention.
