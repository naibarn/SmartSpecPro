# Decision log

## Planning depth

**PROMOTE to full implementation planning inside this quick package.** The request crosses prompt expansion, story workers, QC, billing, credit history, persistence, and refresh recovery. A reusable billing helper plus a durable completion loop is safer than isolated UI patches.

## Decisions

- Use the existing `deductCreditsForModel`/fixed-skill settlement path as the single transaction writer. Do not add a second ledger table unless repository constraints prove it necessary.
- Charge after every successful provider response, even if parsing or completeness validation fails. Do not charge a retry twice when the same idempotency key is replayed.
- Use canonical skill slugs:
  - `vertical-drama-prompt-expansion`
  - `vertical-drama-full-story-architect` for the story plan
  - `vertical-drama-deep-story-draft` for deep shot/dialogue generation and repair
  - `vertical-drama-draft-quality-controller` for draft QC evaluate/revise calls
  - existing `drama-script-evaluate-improve` only for full-script repair, not as a substitute for missing deep-draft dialogue
- Preserve the canonical active bible and materialized episode compatibility mirror. The worker must checkpoint each successful repair before continuing.
- Keep media generation outside this automation boundary.
- No production fallback/mock path is permitted. Test doubles are allowed only in unit tests around the provider adapter and billing writer.

## Risks that could force a later migration

- If `api_audit_events` cannot represent one row per physical call without losing credit-page semantics, add a focused migration for a call-ledger table rather than silently collapsing entries.
- If the current QC reservation contract is required by unrelated consumers, retain reservation as a preflight ceiling but settle each physical call independently and refund only unused capacity.
