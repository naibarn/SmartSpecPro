# Feature 157 Deep-Plan Cross-Consistency Review

Date: 2026-08-23

## Result

PASS for implementation planning. All ten section files are present, the
manifest is valid, every section has the required UI/UX contract headings, and
the plan has no unresolved TODO/TBD placeholders. Implementation may start
only with the runtime migration preflight and focused TDD sequence described
below.

## Five review loops

### Loop 1 — Section completeness

- Verified `sections/index.md` defines exactly sections 01–10.
- Verified every defined section is non-empty and reports tests, implementation
  paths, ownership, rollout/rollback, and acceptance criteria.
- Fixed the missing UI/UX contract headings in sections 01, 02, 03, 05, 06, 07,
  09, and 10; the repository `check-ui-contracts.py` check now passes.

### Loop 2 — Authority and state vocabulary

- Shared context, task kind, state, disposition, readiness, error, and action
  vocabularies are owned by Section 01.
- Durable attempts/events/reconciliation are owned by Section 02.
- Draft content/QC remains owned by the existing Draft QC ledger/service and
  Section 04; credit/provider effects remain owned by existing authorities and
  Section 03.
- `recovered`, `reconciliation_required`, and runtime `provider_ready` cannot
  be projected as domain `succeeded` or domain `provider_ready` without the Node
  final gate.

### Loop 3 — Migration and flag conflict audit

- Repository journal evidence shows 0240–0244 are occupied. References to a
  new assurance migration now use `0245_vertical_drama_assurance_attempts_reconciliation.sql`
  for this snapshot, with a mandatory next-free-number preflight before any
  file is created.
- Canonical flags are `verticalDramaAssuranceShadow`,
  `verticalDramaDraftQcOrchestraActive`,
  `verticalDramaPromptQcOrchestraActive`,
  `verticalDramaStoryAssuranceActive`, and
  `verticalDramaAssuranceKillSwitch`, all default-off.
- Profile/source admission is a task-family capability, not a new flag;
  `verticalDramaStorySeasonOrchestraActive` and
  `verticalDramaProfileSourceAdmissionActive` are not registered aliases.

### Loop 4 — UX continuity and failure recovery

- Existing routes, step IDs, polling, and creator-facing surfaces remain the
  compatibility contract. New metadata is additive.
- Loading, empty, queued, running, succeeded, recovered, stale, retryable and
  fatal failure, cancelled, and reconciliation-required states have explicit
  actions and localized copy.
- The observed repair failure is covered as a server-side admission problem,
  not a button/UI problem: repair must use a completed current result or return
  a typed recoverable action rather than a dead-end 409.
- Responsive and accessibility contracts cover the required mobile, tablet,
  desktop, and extended breakpoints without clipping user data.

### Loop 5 — Production proof and residual boundaries

- Section 10 covers ten E2E scenarios, FI-01–FI-25, all 13 profiles, attached
  media and B-roll roles, prompt/context fingerprint continuity, worker/Redis
  interruption, credit/provider ambiguity, and kill-switch rollback.
- Focused local tests are required before broad checks; browser, migration,
  provider, managed-storage, deployment, staging, and production evidence are
  explicit release gates and must not be claimed from local tests alone.
- SocratiCode was unavailable in this environment, so discovery used targeted
  shell reads and symbol search; the limitation is recorded in research and
  must not be confused with code correctness proof.

## Automated checks

```text
uv run .../deep-plan/scripts/checks/check-sections.py --planning-dir <dir>
uv run .../deep-plan/scripts/checks/check-ui-contracts.py --planning-dir <dir> --json
git diff --check -- <owned tracked paths>
```

The first two checks pass. Markdown hard-break whitespace in the spec metadata
is intentional; section files and the migration/flag edits have no trailing
whitespace.

## Implementation entry gate

Before Section 02 creates a migration, read `apps/web/drizzle/meta/_journal.json`
and `apps/web/drizzle` again, reserve the next free number, and update the
section/spec evidence. Then implement sections in dependency order 01 → 02 →
03/04/05 → 06/07 → 08/09 → 10, running focused TDD after every section.
