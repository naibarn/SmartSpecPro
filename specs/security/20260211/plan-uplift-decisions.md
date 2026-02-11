# Plan Uplift Decisions

- status: `applied_all`
- decision_mode: `smart_auto`
- user_choice: `apply_all`
- applied_on: `2026-02-11`

## Applied Uplift Items
- `U1` Enforce DB constraints in phased cutover
- `U2` Add migration idempotency + lock strategy
- `U3` Quarantine playbook for unresolved attribution rows
- `U4` Explicit API contract split: tenant-admin vs super-admin global
- `U5` Security observability baseline
- `U6` Release gate with tenant-attribution canary checks

## Notes
- All uplift items are now integrated into `implementation-plan.md` and reflected in `implementation-plan-tdd.md`.
