# Implementation Decision Log

## 2026-02-15

- section: `section-01-contract-validation-foundation`
- options_considered: `allow_all_text_effects`, `strict_parity_effect_subset`
- decision: `strict_parity_effect_subset`
- mode_used: `auto`
- rationale: Plan and section objective require deterministic parity; unsupported effects are now rejected during validation.

- section: `section-01-contract-validation-foundation`
- options_considered: `default_reject_unsupported_contract`, `always_downgrade`, `gated_downgrade`
- decision: `default_reject_unsupported_contract + gated_downgrade_when_no_text_semantics`
- mode_used: `auto`
- rationale: Matches plan policy to prevent silent text data loss while allowing safe non-text compatibility fallback.

- section: `workflow-preflight`
- options_considered: `stop_on_dirty_tree`, `proceed_on_dirty_tree`
- decision: `proceed_on_dirty_tree`
- mode_used: `asked`
- rationale: User explicitly instructed to proceed on top of existing workspace changes.
