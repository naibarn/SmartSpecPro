# Review Actions

## Item Decisions
- `I1` high-impact: `accepted_user`
  - rationale: user accepted deterministic dedup-key + DB uniqueness/conflict strategy to protect first-event integrity.

- `I2` high-impact: `accepted_user`
  - rationale: user accepted canonical UTC bucket semantics to prevent cross-surface metric drift.

- `I3` low-impact: `accepted_auto`
  - rationale: low-risk operational correctness improvement under `smart_auto`.

- `I4` low-impact: `accepted_auto`
  - rationale: low-risk observability/ownership hardening under `smart_auto`.

- `I5` low-impact: `accepted_auto`
  - rationale: low-risk privacy hardening under `smart_auto`.
