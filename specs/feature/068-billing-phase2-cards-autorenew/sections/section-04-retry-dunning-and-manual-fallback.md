# Section 04 — Retry, Dunning, and Manual Fallback

## Goal

Add failure classification, bounded retries, customer reminders, and operator fallback controls after failed auto-renew attempts.

## Deliverables

- retry scheduler
- decline classification rules
- dunning notification variants
- pause/resume dunning admin actions
- manual fallback to invoice collection
- force retry and force disable auto-renew controls
- explicit state transitions for `retry_scheduled`, `requires_new_card`, `manual_fallback_active`, and `paused_dunning`
- suppression rules after consent withdrawal or cohort rollback

## Notes

- retries must remain idempotent
- hard declines should not loop indefinitely
- unknown decline classes should bias toward manual review, not automatic retries
