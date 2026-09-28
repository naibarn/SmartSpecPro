# Adversarial Self-Review — Round 1 (Step 13)

**Reviewer stance:** skeptical senior architect. **Scope:** claude-plan.md after Phase-A fixes (25/25).

## Findings (all integrated into claude-plan.md)

1. **[HIGH] Wizard chained-create partial failure loses created object ids.** "Wizard resumes from the failed step" was unimplementable — nothing said WHERE the created campaign/adset ids live after a mid-chain failure. Fix: the draft row (`social_ads_drafts.wizard_state`) records `createdObjectIds {campaignId?, adSetId?, creativeId?}` as each step commits; resume reuses them instead of re-creating (prevents orphan duplicates).

2. **[MEDIUM] `consecutive_hits` streak state had no home.** Plan said "stored on the rule's metadata json" but the rules table has no metadata column and mutable eval-state on a config row is a smell. Fix: streak counters live in Redis `social-ads:streak:{ruleId}:{targetId}` with TTL = 2× evaluation window; Redis loss resets streaks (safe direction — delays firing, never premature).

3. **[MEDIUM] Dry-run evaluations had no storage location.** Fix: dry-run results are action-log rows with `action = 'dry_run:' + realAction`, `intent_status='ok'`, `actor='system:optimizer'` — the dry-run report view filters these; retention identical to real actions.

4. **[LOW] Weekly advisor schedule had no storage.** Fix: `social_ads_settings.notification_prefs.advisorSchedules: [{subjectType, subjectId, cadence:'weekly', hourLocal}]`; the daily scheduler tick reads these.

5. **[LOW] Advisor "cost estimate shown" was unspecified.** Fix: display-only estimate = facts JSON token approximation × model input rate + typical output allowance; labeled "โดยประมาณ"; actual charge = deductCreditsForModel post-hoc.

## Probed and found sound (no change)

- Duplicate-spend guards (no mutation retry + intent rows + unknown-alert) hold under worker crash between claim/finalize.
- BUC governor in Redis — correct across future multi-instance.
- Page-insights backfill windowing bounded by "where API allows" + per-day upsert idempotency.
- Cooldown-ledger survival across rule delete/recreate.
- Org cap + user cap enforcement present at BOTH validation (S08) and optimizer re-read (S10).
- Kill-switch checked in executeAdsAction (single choke point for user AND system actors).
