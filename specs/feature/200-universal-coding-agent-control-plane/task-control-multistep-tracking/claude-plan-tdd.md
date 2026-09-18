# TDD plan: Task Control multi-step tracking

## Section 1 — Safe worker projection

Write focused service tests before implementation for valid/invalid
orchestration metadata, bounded progress, event precedence, safe redaction and
`waiting_external` status inclusion.

## Section 2 — Grouping and aggregate view model

Write tests first for plan grouping, dependency predecessor inclusion,
workflow/single fallbacks, deterministic order, aggregate state/progress,
malformed isolation, pagination and scope-preserving repository calls.

## Section 3 — Protected tRPC contract and orchestration metadata

Write router tests for protected caller context, input bounds and response
shape. Write orchestration contract tests for step ordinal/total and preserved
dependency metadata.

## Section 4 — Expandable Task Control UI

Write jsdom Testing Library tests for multi-group rendering, expand/collapse,
step status/progress/event visibility, cancel refresh, loading/error/empty and
load-more states. Keep the existing composer handoff assertion.

## Section 5 — Integration proof and documentation

Extend Playwright route fixtures to return two groups and assert expansion,
ordered steps, progress, responsive no-overflow and the global single-button
entry. Run `git diff --check` and focused Vitest/Playwright commands.
