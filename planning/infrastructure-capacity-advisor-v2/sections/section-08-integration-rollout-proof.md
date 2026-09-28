# Section 08 — Integration, Migration, and Rollout Proof

## Objective

Prove the feature at the real integration boundaries before calling it live.

## Verification sequence

1. Run `git diff --check` and inspect only the scoped capacity files; preserve the
   dirty-worktree baseline.
2. Run focused web Vitest suites with required test secrets, relevant Python
   pytest units, skill schema/verification checks, formatting, and changed-file
   diagnostics.
3. Apply the additive migration to a disposable/target database and verify schema,
   indexes, legacy row reading, new lifecycle fields, retention, and rollback
   procedure. Do not claim migration live if only SQL parsing passed.
4. Exercise one stubbed daily run and one confirmed manual run, including a slow
   or unavailable LLM, duplicate click, stale data, and partial namespace.
5. Run authenticated browser verification at all responsive sizes and capture
   the required summary/detail/error evidence.
6. Run the full repository check for context, but classify unrelated baseline
   failures separately from focused proof. Record unperformed provider,
   deployment, migration, and browser checks explicitly if blocked.

## Release gates

- Migration applied and verified in the intended environment.
- Skill schemas/fixtures/parity check pass.
- Deterministic status/forecast and LLM reconciliation tests pass.
- Manual lock and daily idempotency pass.
- Summary states coverage/freshness and does not expose raw errors/secrets.
- Scheduler failure does not block web startup and is observable.
- Authenticated browser evidence passes for summary and detail tabs.

## Rollback

Disable the scheduler/worker entry and hide the manual action if necessary while
leaving additive assessment rows intact. Revert only the new application path
after preserving run evidence. Database rollback must follow the migration's
documented safe path and must not delete unrelated monitoring data.

## Dependencies

All previous sections.

## UI/UX Contract

N/A for integration proof ownership; browser evidence requirements are repeated
here only as release gates and are defined in section 06.

### Target User / JTBD

N/A — no browser surface changes.

### Surface Inventory

N/A — no browser surface changes.

### Component Map

N/A — no browser components.

### State Matrix

N/A — no browser states.

### Responsive Matrix

N/A — no layout changes.

### Accessibility Acceptance

N/A — no user-facing markup.

### Copy Contract

N/A — no user-facing copy.

### Browser Evidence Required

N/A — section 06 defines the required browser evidence.
