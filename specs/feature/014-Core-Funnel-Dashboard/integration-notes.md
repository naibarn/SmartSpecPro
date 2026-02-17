# Review Integration Notes

## Source
- review summary: `reviews/iteration-1-summary.md`
- decision mode: `smart_auto`

## Auto-applied (low-impact)
- `I3` Add cache invalidation/bypass triggers for backfill checkpoints, feature-flag transitions, and manual admin refresh.
- `I4` Add explicit alert ownership/escalation windows for reconciliation/leakage and API SLO alerts.
- `I5` Strengthen export minimization defaults and elevated-export audit tagging.

## User-approved (high-impact)
- `I1` Define deterministic first-event dedup contract and DB uniqueness/conflict strategy.
- `I2` Lock canonical UTC timezone/bucket semantics across API/UI/export.

## Deferred
- None currently.
