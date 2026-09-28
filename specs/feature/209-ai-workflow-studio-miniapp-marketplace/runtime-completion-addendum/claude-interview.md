# Interview transcript — Spec 209 runtime completion addendum

No blocking business-domain clarification was required. The user explicitly
requested a plan for completing Library/Marketplace, real runs, Marketplace
invocation, partial-run modes, human approval/retry/cancel/resume,
output/artifact/preview and trace/log/event coverage.

## Q1 — What is the priority order?

**Answer:** Make the system complete in dependency order. Preserve the supplied
mockup as the primary UI reference and do not invent a replacement screen.

## Q2 — What should happen when a capability or runtime is unavailable?

**Answer:** The system must show a clear setup-required/degraded state and must
not claim that a run, receipt, artifact or cost effect happened.

## Q3 — What level of validation is expected?

**Answer:** The work should be planned comprehensively, cover ordinary use cases,
and include repeated comparison against the spec, focused tests and browser/UI
verification.

## Auto-decisions

- Reuse Feature 195 canonical Job/control-plane lifecycle instead of creating a
  workflow queue or duplicate finality state.
- Reuse Feature 207 economics and the existing worker artifact publication path.
- Use server-authoritative tenant, actor, version, entitlement, dependency and
  cost decisions for every read/mutation.
- Treat published Workflow Versions and Marketplace package identities as
  immutable.
- Prefer additive migrations and focused Vitest/Playwright regression tests.
- Keep the existing mockup-led Builder/Subflow/Run shell and extend it with
  state panels rather than introducing a new visual language.
