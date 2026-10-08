# Prompt Recipe Library QA rounds — 2026-10-08

All rounds used fixtures and mocked boundaries. Each run executed the two
focused Vitest files (14 tests before the final attribution assertion; 14
afterward) and checked no Runner/DB/provider execution path was invoked. They
are local code checks only and do not prove runtime/render/rights approval.

| Round | Focus | Result |
|---:|---|---|
| 1 | Draft-07 schema shape, required provenance, strict unknown-field rejection | PASS |
| 2 | Rights callback approval evidence and default fail-closed behavior | PASS |
| 3 | Partial/truncated prompt exclusion before rights lookup | PASS |
| 4 | Canonical source URL + prompt digest dedupe | PASS |
| 5 | Changed source content creates a new recipe version | PASS |
| 6 | Tenant and user-private visibility filtering | PASS |
| 7 | Semantic tag/title matching, aspect ratio and duration filtering | PASS |
| 8 | Existing compatible template wins and lowest declared cost class is preferred | PASS |
| 9 | Novelty/no-fit returns a plan without component source or executable code | PASS |
| 10 | Marketplace promotion approval schema gate, attribution URL safety, `git diff --check` | PASS |

Gaps found and repaired during review: alphabetical cost-class sorting could
place `high` before `low`; it was replaced with an explicit low/medium/high
order. Marketplace scope was hardened to require a governance approval
reference, and unsafe/missing attribution now has an explicit rejection reason.
The entire focused suite was rerun immediately after each repair. After the last
repair, all 10 rounds were rerun: 14/14 tests passed in every round. The final
run also completed `git diff --check` and shared handoff validation with
`valid=true`, zero validation errors, and `completion_eligible=false`. No runtime
claim is made.
