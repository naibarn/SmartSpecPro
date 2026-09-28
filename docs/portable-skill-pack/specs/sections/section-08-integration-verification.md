# Section 08 — Integration, Gates, and Scoped Verification

## Goal

Prove the complete role-to-Skill-to-provider flow and close regressions without staging
unrelated work.

## Verification matrix

1. Run shared role/DTO, migration, backfill, preset, wizard, Story Bible, variant/twin,
   character-router, image-generation, prompt-QC, QA, and UI Vitest suites.
2. Run skill `verify.sh`, strict schema fixtures, semantic fixtures, and mirror parity.
3. Run the web TypeScript check and migration status/check.
4. Run route-level Playwright/manual browser evidence at mobile 390x844, tablet 768x1024,
   desktop 1440x900, and extended dense-layout viewports.
5. Trace a CEO heroine, hidden villain, second lead, child, elder, face-only lock, and
   full-appearance lock through preview and provider payloads.
6. Search the final scoped diff for marker constants, creative prompt suffixes, role
   keyword-only decisions, missing role labels, and full prompt logging.
7. Run `git diff --check`, review `git diff --stat`, and stage only intended files.

## Failure handling

Mark unavailable browser/tooling evidence as skipped with reason. A failed high-risk gate
blocks completion until fixed or explicitly reported. A migration failure stops before
backfill. Unrelated dirty files remain untouched.

## TDD stubs

- End-to-end role round-trip and prompt provenance.
- Regression fixture for the original CEO/occupation misclassification.
- Regression fixture proving user wardrobe/framing requests are authored by Skill.
- Regression fixture proving no marker block reaches provider.
- Scoped diff and no-sensitive-log checks.

## Completion proof

Produce a final verification report with commands, pass/skip results, browser evidence
path(s), residual risks, and a list of scoped files. Do not commit/push unless separately
requested.
